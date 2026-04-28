"use strict";
/**
 * Testes unitários para createAbsence, updateAbsence e deleteAbsence (index.ts).
 *
 * Estratégia: mockar firebase-admin e firebase-functions/v1 inteiramente
 * para extrair os handlers registrados via onCall e chamá-los diretamente,
 * sem emulator nem inicialização real do SDK.
 *
 * Ordem de registro em index.ts (0-based):
 *   0 = createAbsence
 *   1 = updateAbsence
 *   2 = deleteAbsence
 *   3 = approveTeacher
 *   ...
 */
Object.defineProperty(exports, "__esModule", { value: true });
// ── Constantes ────────────────────────────────────────────────────────────────
const SCHOOL_ID = 'sch-abc-001';
const TEACHER_ID = 'teacher-doc-001';
const ABSENCE_ID = 'absence-doc-001';
// ── Estado mutável dos mocks ──────────────────────────────────────────────────
// createAbsence: controla se o teacher doc existe por .doc().get()
let mockTeacherDocExists;
// createAbsence: controla a query .where("id",...).limit(1).get()
let mockTeacherQueryEmpty;
// updateAbsence: controla se o absence doc existe
let mockAbsenceDocExists;
// Captura chamadas de escrita
let mockDocSet;
let mockDocUpdate;
let mockDocDelete;
const registeredHandlers = [];
const HttpsError = class HttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'HttpsError';
    }
};
jest.mock('firebase-functions/v1', () => {
    const onCall = (handler) => {
        registeredHandlers.push(handler);
        return { __handler__: handler };
    };
    const regionFn = () => ({ https: { onCall } });
    return {
        region: regionFn,
        https: { onCall, HttpsError },
    };
});
// ── Mock: ./auth ──────────────────────────────────────────────────────────────
jest.mock('../auth', () => ({
    verifyAdminOrCoordinatorViaUsers: jest.fn().mockResolvedValue(undefined),
    verifyAdmin: jest.fn().mockResolvedValue(undefined),
    verifyCoordinatorOrAdmin: jest.fn().mockResolvedValue(undefined),
}));
// ── Mock: ./actions ───────────────────────────────────────────────────────────
jest.mock('../actions', () => ({
    ACTION_MAP: {},
}));
// ── Mock: firebase-admin ──────────────────────────────────────────────────────
//
// Cadeia usada pelas funções de ausência:
//
//   createAbsence:
//     db.collection(teachersPath).doc(teacherId).get()
//     db.collection(teachersPath).where("id","==",teacherId).limit(1).get()
//     db.collection(absencesPath).doc(absenceId).set(absence)
//
//   updateAbsence:
//     db.collection(absencesPath).doc(absenceId).get()
//     db.collection(absencesPath).doc(absenceId).update({ slots, substituteId, status })
//
//   deleteAbsence:
//     db.collection(absencesPath).doc(absenceId).delete()
jest.mock('firebase-admin', () => {
    const firestoreMock = () => {
        const collectionFn = (collPath) => ({
            doc: (docId) => ({
                _path: `${collPath}/${docId}`,
                get: jest.fn(async () => {
                    if (collPath.includes('teachers')) {
                        return { exists: mockTeacherDocExists };
                    }
                    if (collPath.includes('absences')) {
                        return { exists: mockAbsenceDocExists };
                    }
                    return { exists: false };
                }),
                set: mockDocSet,
                update: mockDocUpdate,
                delete: mockDocDelete,
            }),
            where: (_field, _op, _val) => ({
                limit: (_n) => ({
                    get: jest.fn(async () => {
                        if (collPath.includes('teachers')) {
                            return {
                                empty: mockTeacherQueryEmpty,
                                docs: [],
                            };
                        }
                        return { empty: true, docs: [] };
                    }),
                }),
                get: jest.fn(async () => ({ empty: true, docs: [] })),
            }),
        });
        const docFn = (path) => ({
            _path: path,
            get: jest.fn(async () => ({ exists: false })),
            set: mockDocSet,
            update: mockDocUpdate,
            delete: mockDocDelete,
        });
        const batchFn = () => ({
            set: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            commit: jest.fn().mockResolvedValue(undefined),
        });
        return {
            collection: collectionFn,
            doc: docFn,
            batch: batchFn,
        };
    };
    return {
        initializeApp: jest.fn(),
        firestore: Object.assign(firestoreMock, {
            FieldValue: {
                serverTimestamp: () => '__server_timestamp__',
                delete: () => '__field_delete__',
            },
        }),
    };
});
// ── Importar APÓS os mocks ────────────────────────────────────────────────────
require("../index");
const CREATE_ABSENCE_INDEX = 0;
const UPDATE_ABSENCE_INDEX = 1;
const DELETE_ABSENCE_INDEX = 2;
function getHandler(index) {
    const handler = registeredHandlers[index];
    if (!handler)
        throw new Error(`Handler no índice ${index} não capturado`);
    return handler;
}
// ── Context de chamada ────────────────────────────────────────────────────────
function makeContext() {
    return {
        auth: {
            uid: 'uid-coord-caller',
            token: { email: 'coord@escola.example.com' },
        },
    };
}
// ── Helpers de chamada ────────────────────────────────────────────────────────
async function callCreate(data) {
    return getHandler(CREATE_ABSENCE_INDEX)(data, makeContext());
}
async function callUpdate(data) {
    return getHandler(UPDATE_ABSENCE_INDEX)(data, makeContext());
}
async function callDelete(data) {
    return getHandler(DELETE_ABSENCE_INDEX)(data, makeContext());
}
// ── Setup por teste ───────────────────────────────────────────────────────────
beforeEach(() => {
    mockTeacherDocExists = true;
    mockTeacherQueryEmpty = true;
    mockAbsenceDocExists = true;
    mockDocSet = jest.fn().mockResolvedValue(undefined);
    mockDocUpdate = jest.fn().mockResolvedValue(undefined);
    mockDocDelete = jest.fn().mockResolvedValue(undefined);
    jest.requireMock('../auth')
        .verifyCoordinatorOrAdmin
        .mockResolvedValue(undefined);
});
// ═════════════════════════════════════════════════════════════════════════════
// createAbsence
// ═════════════════════════════════════════════════════════════════════════════
describe('createAbsence', () => {
    // ── Validação de teacherId ─────────────────────────────────────────────────
    describe('validação de teacherId', () => {
        it('lança invalid-argument quando teacherId está ausente', async () => {
            await expect(callCreate({ teacherId: '' })).rejects.toMatchObject({ code: 'invalid-argument' });
        });
        it('lança invalid-argument quando teacherId é undefined', async () => {
            await expect(callCreate({})).rejects.toMatchObject({ code: 'invalid-argument' });
        });
        it('não grava nada quando teacherId inválido', async () => {
            await callCreate({}).catch(() => { });
            expect(mockDocSet).not.toHaveBeenCalled();
        });
    });
    // ── Rejeição de slots formation- ──────────────────────────────────────────
    describe('rejeição de slots formation-', () => {
        it('lança invalid-argument para subjectId com prefixo formation-', async () => {
            await expect(callCreate({
                teacherId: TEACHER_ID,
                slots: [{ subjectId: 'formation-turma-a', date: '2026-05-01' }],
            })).rejects.toMatchObject({ code: 'invalid-argument' });
        });
        it('rejeita mesmo quando apenas um slot tem prefixo formation-', async () => {
            await expect(callCreate({
                teacherId: TEACHER_ID,
                slots: [
                    { subjectId: 'bio-01', date: '2026-05-01' },
                    { subjectId: 'formation-x', date: '2026-05-02' },
                ],
            })).rejects.toMatchObject({ code: 'invalid-argument' });
        });
        it('não grava nada quando slot formation- é detectado', async () => {
            await callCreate({
                teacherId: TEACHER_ID,
                slots: [{ subjectId: 'formation-abc' }],
            }).catch(() => { });
            expect(mockDocSet).not.toHaveBeenCalled();
        });
    });
    // ── Professor não encontrado ───────────────────────────────────────────────
    describe('professor não encontrado', () => {
        beforeEach(() => {
            mockTeacherDocExists = false;
            mockTeacherQueryEmpty = true;
        });
        it('lança not-found quando doc não existe nem por query', async () => {
            await expect(callCreate({ teacherId: TEACHER_ID, slots: [] })).rejects.toMatchObject({ code: 'not-found' });
        });
        it('não grava ausência quando professor não existe', async () => {
            await callCreate({ teacherId: TEACHER_ID, slots: [] }).catch(() => { });
            expect(mockDocSet).not.toHaveBeenCalled();
        });
        it('resolve normalmente quando doc não existe mas query encontra por campo id', async () => {
            mockTeacherDocExists = false;
            mockTeacherQueryEmpty = false; // query retorna professor pelo campo id
            const result = await callCreate({ teacherId: TEACHER_ID, slots: [] });
            expect(result).toMatchObject({ id: expect.any(String) });
        });
    });
    // ── Criação global (sem schoolId) ─────────────────────────────────────────
    describe('caminho global (sem schoolId)', () => {
        it('retorna { id } não-vazio ao criar ausência sem schoolId', async () => {
            const result = await callCreate({ teacherId: TEACHER_ID, slots: [] });
            expect(typeof result.id).toBe('string');
            expect(result.id.length).toBeGreaterThan(0);
        });
        it('chama set no doc de ausência', async () => {
            await callCreate({ teacherId: TEACHER_ID, slots: [] });
            expect(mockDocSet).toHaveBeenCalledTimes(1);
        });
        it('grava status: "open" inicial', async () => {
            await callCreate({ teacherId: TEACHER_ID, slots: [] });
            const savedAbsence = mockDocSet.mock.calls[0][0];
            expect(savedAbsence.status).toBe('open');
        });
        it('grava teacherId no doc de ausência', async () => {
            await callCreate({ teacherId: TEACHER_ID, slots: [] });
            const savedAbsence = mockDocSet.mock.calls[0][0];
            expect(savedAbsence.teacherId).toBe(TEACHER_ID);
        });
    });
    // ── Criação multi-tenant (com schoolId) ───────────────────────────────────
    describe('caminho multi-tenant (com schoolId)', () => {
        it('retorna { id } não-vazio ao criar ausência com schoolId', async () => {
            const result = await callCreate({
                teacherId: TEACHER_ID,
                schoolId: SCHOOL_ID,
                slots: [],
            });
            expect(typeof result.id).toBe('string');
            expect(result.id.length).toBeGreaterThan(0);
        });
        it('chama set exatamente uma vez', async () => {
            await callCreate({ teacherId: TEACHER_ID, schoolId: SCHOOL_ID, slots: [] });
            expect(mockDocSet).toHaveBeenCalledTimes(1);
        });
    });
    // ── Campos normalizados nos slots gravados ────────────────────────────────
    describe('normalização de campos do slot', () => {
        it('grava substituteId: null em cada slot', async () => {
            const result = await callCreate({
                teacherId: TEACHER_ID,
                slots: [{ subjectId: 'bio-01', date: '2026-05-01', day: 1, timeSlot: 'morning', scheduleId: 'sch-01', turma: '8A' }],
            });
            const savedAbsence = mockDocSet.mock.calls[0][0];
            const slots = savedAbsence.slots;
            expect(slots[0].substituteId).toBeNull();
            expect(result.id).toBeTruthy();
        });
        it('cada slot tem campo id gerado', async () => {
            await callCreate({
                teacherId: TEACHER_ID,
                slots: [{ subjectId: 'hist-02' }, { subjectId: 'geo-03' }],
            });
            const savedAbsence = mockDocSet.mock.calls[0][0];
            const slots = savedAbsence.slots;
            expect(typeof slots[0].id).toBe('string');
            expect(typeof slots[1].id).toBe('string');
            expect(slots[0].id).not.toBe(slots[1].id);
        });
        it('campos ausentes no slot de entrada são gravados como null', async () => {
            await callCreate({
                teacherId: TEACHER_ID,
                slots: [{ subjectId: 'bio-01' }],
            });
            const savedAbsence = mockDocSet.mock.calls[0][0];
            const slot = savedAbsence.slots[0];
            expect(slot.date).toBeNull();
            expect(slot.day).toBeNull();
            expect(slot.timeSlot).toBeNull();
            expect(slot.scheduleId).toBeNull();
        });
        it('turma ausente no slot de entrada é gravada como string vazia', async () => {
            await callCreate({
                teacherId: TEACHER_ID,
                slots: [{ subjectId: 'bio-01' }],
            });
            const savedAbsence = mockDocSet.mock.calls[0][0];
            const slot = savedAbsence.slots[0];
            expect(slot.turma).toBe('');
        });
    });
    // ── Propagação de erro de verifyCoordinatorOrAdmin ─────────────────────────
    describe('propagação de erro de autorização', () => {
        it('propaga erro de verifyCoordinatorOrAdmin sem gravar', async () => {
            const auth = jest.requireMock('../auth');
            auth.verifyCoordinatorOrAdmin.mockRejectedValueOnce(new HttpsError('permission-denied', 'Não autorizado'));
            await expect(callCreate({ teacherId: TEACHER_ID, slots: [] })).rejects.toMatchObject({ code: 'permission-denied' });
            expect(mockDocSet).not.toHaveBeenCalled();
        });
    });
});
// ═════════════════════════════════════════════════════════════════════════════
// updateAbsence
// ═════════════════════════════════════════════════════════════════════════════
describe('updateAbsence', () => {
    // ── Validação de absenceId ─────────────────────────────────────────────────
    describe('validação de absenceId', () => {
        it('lança invalid-argument quando absenceId está ausente', async () => {
            await expect(callUpdate({ absenceId: '' })).rejects.toMatchObject({ code: 'invalid-argument' });
        });
        it('lança invalid-argument quando absenceId é undefined', async () => {
            await expect(callUpdate({})).rejects.toMatchObject({ code: 'invalid-argument' });
        });
        it('não chama update quando absenceId inválido', async () => {
            await callUpdate({}).catch(() => { });
            expect(mockDocUpdate).not.toHaveBeenCalled();
        });
    });
    // ── Ausência não encontrada ───────────────────────────────────────────────
    describe('ausência não encontrada', () => {
        beforeEach(() => {
            mockAbsenceDocExists = false;
        });
        it('lança not-found quando doc.exists é false', async () => {
            await expect(callUpdate({ absenceId: ABSENCE_ID, slots: [] })).rejects.toMatchObject({ code: 'not-found' });
        });
        it('não chama update quando ausência não existe', async () => {
            await callUpdate({ absenceId: ABSENCE_ID, slots: [] }).catch(() => { });
            expect(mockDocUpdate).not.toHaveBeenCalled();
        });
    });
    // ── Rejeição de slots formation- ──────────────────────────────────────────
    describe('rejeição de slots formation-', () => {
        it('lança invalid-argument para slot com subjectId formation-', async () => {
            await expect(callUpdate({
                absenceId: ABSENCE_ID,
                slots: [{ subjectId: 'formation-turma-b' }],
            })).rejects.toMatchObject({ code: 'invalid-argument' });
        });
    });
    // ── Cálculo de status ─────────────────────────────────────────────────────
    describe('cálculo de status', () => {
        it('status é "open" quando nenhum slot tem substituteId', async () => {
            await callUpdate({
                absenceId: ABSENCE_ID,
                slots: [
                    { subjectId: 'bio-01', substituteId: null },
                    { subjectId: 'mat-01', substituteId: null },
                ],
            });
            const updateArg = mockDocUpdate.mock.calls[0][0];
            expect(updateArg.status).toBe('open');
        });
        it('status é "covered" quando todos os slots têm substituteId', async () => {
            await callUpdate({
                absenceId: ABSENCE_ID,
                slots: [
                    { subjectId: 'bio-01', substituteId: 'teacher-sub-1' },
                    { subjectId: 'mat-01', substituteId: 'teacher-sub-2' },
                ],
            });
            const updateArg = mockDocUpdate.mock.calls[0][0];
            expect(updateArg.status).toBe('covered');
        });
        it('status é "partial" quando apenas alguns slots têm substituteId', async () => {
            await callUpdate({
                absenceId: ABSENCE_ID,
                slots: [
                    { subjectId: 'bio-01', substituteId: 'teacher-sub-1' },
                    { subjectId: 'mat-01', substituteId: null },
                ],
            });
            const updateArg = mockDocUpdate.mock.calls[0][0];
            expect(updateArg.status).toBe('partial');
        });
        it('status é "open" quando slots é array vazio', async () => {
            await callUpdate({ absenceId: ABSENCE_ID, slots: [] });
            const updateArg = mockDocUpdate.mock.calls[0][0];
            expect(updateArg.status).toBe('open');
        });
    });
    // ── Gravação de substituteId ──────────────────────────────────────────────
    describe('substituteId', () => {
        it('grava substituteId: null quando campo não é fornecido no input', async () => {
            await callUpdate({ absenceId: ABSENCE_ID, slots: [] });
            const updateArg = mockDocUpdate.mock.calls[0][0];
            expect(updateArg.substituteId).toBeNull();
        });
        it('grava substituteId: null explicitamente (não undefined)', async () => {
            await callUpdate({ absenceId: ABSENCE_ID, slots: [], substituteId: null });
            const updateArg = mockDocUpdate.mock.calls[0][0];
            expect(updateArg.substituteId).toBeNull();
            expect(updateArg.substituteId).not.toBeUndefined();
        });
        it('grava o substituteId quando fornecido', async () => {
            await callUpdate({
                absenceId: ABSENCE_ID,
                slots: [{ subjectId: 'bio-01', substituteId: 'teacher-sub-99' }],
                substituteId: 'teacher-sub-99',
            });
            const updateArg = mockDocUpdate.mock.calls[0][0];
            expect(updateArg.substituteId).toBe('teacher-sub-99');
        });
    });
    // ── Payload de update ─────────────────────────────────────────────────────
    describe('payload de update', () => {
        it('chama doc.update com { slots, substituteId, status }', async () => {
            const slots = [{ subjectId: 'geo-01' }];
            await callUpdate({ absenceId: ABSENCE_ID, slots });
            expect(mockDocUpdate).toHaveBeenCalledWith(expect.objectContaining({ slots, substituteId: null, status: 'open' }));
        });
        it('retorna { ok: true }', async () => {
            const result = await callUpdate({ absenceId: ABSENCE_ID, slots: [] });
            expect(result).toEqual({ ok: true });
        });
        it('chama update exatamente uma vez', async () => {
            await callUpdate({ absenceId: ABSENCE_ID, slots: [] });
            expect(mockDocUpdate).toHaveBeenCalledTimes(1);
        });
    });
    // ── Propagação de erro de autorização ────────────────────────────────────
    describe('propagação de erro de autorização', () => {
        it('propaga erro de verifyCoordinatorOrAdmin sem chamar update', async () => {
            const auth = jest.requireMock('../auth');
            auth.verifyCoordinatorOrAdmin.mockRejectedValueOnce(new HttpsError('permission-denied', 'Não autorizado'));
            await expect(callUpdate({ absenceId: ABSENCE_ID, slots: [] })).rejects.toMatchObject({ code: 'permission-denied' });
            expect(mockDocUpdate).not.toHaveBeenCalled();
        });
    });
});
// ═════════════════════════════════════════════════════════════════════════════
// deleteAbsence
// ═════════════════════════════════════════════════════════════════════════════
describe('deleteAbsence', () => {
    // ── Validação de absenceId ─────────────────────────────────────────────────
    describe('validação de absenceId', () => {
        it('lança invalid-argument quando absenceId está ausente', async () => {
            await expect(callDelete({ absenceId: '' })).rejects.toMatchObject({ code: 'invalid-argument' });
        });
        it('lança invalid-argument quando absenceId é undefined', async () => {
            await expect(callDelete({})).rejects.toMatchObject({ code: 'invalid-argument' });
        });
        it('não chama delete quando absenceId inválido', async () => {
            await callDelete({}).catch(() => { });
            expect(mockDocDelete).not.toHaveBeenCalled();
        });
    });
    // ── Caminho global (sem schoolId) ─────────────────────────────────────────
    describe('caminho global (sem schoolId)', () => {
        it('retorna { ok: true }', async () => {
            const result = await callDelete({ absenceId: ABSENCE_ID });
            expect(result).toEqual({ ok: true });
        });
        it('chama doc.delete exatamente uma vez', async () => {
            await callDelete({ absenceId: ABSENCE_ID });
            expect(mockDocDelete).toHaveBeenCalledTimes(1);
        });
    });
    // ── Caminho multi-tenant (com schoolId) ───────────────────────────────────
    describe('caminho multi-tenant (com schoolId)', () => {
        it('retorna { ok: true } com schoolId', async () => {
            const result = await callDelete({ absenceId: ABSENCE_ID, schoolId: SCHOOL_ID });
            expect(result).toEqual({ ok: true });
        });
        it('chama doc.delete exatamente uma vez com schoolId', async () => {
            await callDelete({ absenceId: ABSENCE_ID, schoolId: SCHOOL_ID });
            expect(mockDocDelete).toHaveBeenCalledTimes(1);
        });
    });
    // ── Propagação de erro de autorização ────────────────────────────────────
    describe('propagação de erro de autorização', () => {
        it('propaga erro de verifyCoordinatorOrAdmin sem deletar', async () => {
            const auth = jest.requireMock('../auth');
            auth.verifyCoordinatorOrAdmin.mockRejectedValueOnce(new HttpsError('permission-denied', 'Não autorizado'));
            await expect(callDelete({ absenceId: ABSENCE_ID })).rejects.toMatchObject({ code: 'permission-denied' });
            expect(mockDocDelete).not.toHaveBeenCalled();
        });
        it('propaga erro de autorização com schoolId fornecido sem deletar', async () => {
            const auth = jest.requireMock('../auth');
            auth.verifyCoordinatorOrAdmin.mockRejectedValueOnce(new HttpsError('unauthenticated', 'Login required'));
            await expect(callDelete({ absenceId: ABSENCE_ID, schoolId: SCHOOL_ID })).rejects.toMatchObject({ code: 'unauthenticated' });
            expect(mockDocDelete).not.toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=absenceFunctions.test.js.map