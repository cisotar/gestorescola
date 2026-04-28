"use strict";
/**
 * Testes unitários para approveTeacher (issue #473) — foco no índice invertido
 * users/{uid}.removedFrom.
 *
 * Quando um teacher é aprovado APÓS ter sido removido (existia entry em
 * removed_users e/ou removedFrom contém a schoolId), a CF deve, no MESMO batch:
 *   - Apagar schools/{schoolId}/removed_users/{pendingUid} (já existente).
 *   - Atualizar users/{pendingUid} com removedFrom: arrayRemove(schoolId).
 *
 * Isso é crítico porque o boot usa removedFrom como índice rápido (RN-R1):
 * se ficar stale, o usuário continua bloqueado mesmo após aprovação.
 *
 * Os testes de validação profile×subjectIds estão em approveTeacher.validation.test.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
// ── Constantes ────────────────────────────────────────────────────────────────
const SCHOOL_ID = 'sch-test-001';
const PENDING_UID = 'uid-pending-abc';
const EMAIL = 'prof@escola.example.com';
// ── Estado mutável dos mocks ──────────────────────────────────────────────────
let mockPendingSnapExists;
let mockPendingSnapData;
// Controla se schools/{schoolId}/removed_users/{pendingUid} existe
let mockRemovedUserExists;
let batchCalls;
let mockBatchCommit;
const SERVER_TS_SENTINEL = '__server_ts__';
const DELETE_SENTINEL = '__field_delete__';
const arrayUnionMock = jest.fn((value) => ({
    __op__: 'arrayUnion',
    values: [value],
}));
const arrayRemoveMock = jest.fn((value) => ({
    __op__: 'arrayRemove',
    values: [value],
}));
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
jest.mock('firebase-admin', () => {
    const firestoreMock = () => {
        const collectionFn = (collPath) => ({
            doc: (docId) => ({
                _path: `${collPath}/${docId}`,
                get: jest.fn(async () => {
                    if (collPath.includes('pending_teachers')) {
                        return {
                            exists: mockPendingSnapExists,
                            data: () => mockPendingSnapData,
                        };
                    }
                    return { exists: false, data: () => ({}) };
                }),
            }),
            where: () => ({
                limit: () => ({
                    get: jest.fn(async () => ({ empty: true, docs: [] })),
                }),
                get: jest.fn(async () => ({ empty: true, docs: [] })),
            }),
        });
        const docFn = (path) => ({
            _path: path,
            get: jest.fn(async () => {
                if (path.startsWith(`schools/${SCHOOL_ID}/removed_users/`)) {
                    return { exists: mockRemovedUserExists, data: () => ({}) };
                }
                return { exists: false, data: () => ({}) };
            }),
        });
        const batchFn = () => ({
            set: jest.fn((ref, data, opts) => {
                batchCalls.push({ op: 'set', path: ref._path, data, opts });
            }),
            update: jest.fn((ref, data) => {
                batchCalls.push({ op: 'update', path: ref._path, data });
            }),
            delete: jest.fn((ref) => {
                batchCalls.push({ op: 'delete', path: ref._path });
            }),
            commit: mockBatchCommit,
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
                serverTimestamp: () => SERVER_TS_SENTINEL,
                delete: () => DELETE_SENTINEL,
                arrayUnion: arrayUnionMock,
                arrayRemove: arrayRemoveMock,
            },
        }),
    };
});
// ── Importar APÓS os mocks ────────────────────────────────────────────────────
require("../index");
// approveTeacher é a 4ª função registrada (índice 3, 0-based).
const APPROVE_TEACHER_INDEX = 3;
function getHandler() {
    const handler = registeredHandlers[APPROVE_TEACHER_INDEX];
    if (!handler)
        throw new Error(`Handler ${APPROVE_TEACHER_INDEX} não capturado`);
    return handler;
}
function makeContext() {
    return {
        auth: {
            uid: 'uid-admin-caller',
            token: { email: 'admin@escola.example.com' },
        },
    };
}
async function callApproveTeacher(data) {
    return getHandler()(data, makeContext());
}
// ── Setup por teste ───────────────────────────────────────────────────────────
beforeEach(() => {
    batchCalls = [];
    mockBatchCommit = jest.fn().mockResolvedValue(undefined);
    arrayRemoveMock.mockClear();
    arrayUnionMock.mockClear();
    // Default: pending doc válido (subjectIds preenchido para passar na validação)
    mockPendingSnapExists = true;
    mockPendingSnapData = {
        email: EMAIL,
        name: 'Professor Teste',
        subjectIds: ['subj-bio'],
    };
    // Default: usuário NÃO está marcado como removido (caminho feliz)
    mockRemovedUserExists = false;
});
// ── Helpers ───────────────────────────────────────────────────────────────────
function findCall(op, path) {
    return batchCalls.find((c) => c.op === op && c.path === path);
}
// ── Cenário: removedFrom é limpo via arrayRemove no batch ────────────────────
describe('approveTeacher — limpeza de removedFrom', () => {
    it('grava users/{pendingUid} com removedFrom: arrayRemove(schoolId)', async () => {
        await callApproveTeacher({
            schoolId: SCHOOL_ID,
            pendingUid: PENDING_UID,
            profile: 'teacher',
        });
        const userSet = findCall('set', `users/${PENDING_UID}`);
        expect(userSet).toBeDefined();
        expect(userSet.opts).toEqual({ merge: true });
        const data = userSet.data;
        expect(arrayRemoveMock).toHaveBeenCalledWith(SCHOOL_ID);
        expect(data.removedFrom).toMatchObject({
            __op__: 'arrayRemove',
            values: [SCHOOL_ID],
        });
    });
    it('mantém os outros campos (email, schools) no mesmo set', async () => {
        await callApproveTeacher({
            schoolId: SCHOOL_ID,
            pendingUid: PENDING_UID,
            profile: 'teacher',
        });
        const userSet = findCall('set', `users/${PENDING_UID}`);
        const data = userSet.data;
        expect(data.email).toBe(EMAIL);
        expect(data.schools).toMatchObject({
            [SCHOOL_ID]: expect.objectContaining({
                role: 'teacher',
                status: 'approved',
            }),
        });
    });
    it('apaga schools/{schoolId}/removed_users/{pendingUid} no MESMO batch', async () => {
        await callApproveTeacher({
            schoolId: SCHOOL_ID,
            pendingUid: PENDING_UID,
            profile: 'teacher',
        });
        const removedDelete = findCall('delete', `schools/${SCHOOL_ID}/removed_users/${PENDING_UID}`);
        expect(removedDelete).toBeDefined();
    });
    it('grava removedFrom como wrapper arrayRemove (não array literal)', async () => {
        await callApproveTeacher({
            schoolId: SCHOOL_ID,
            pendingUid: PENDING_UID,
            profile: 'teacher',
        });
        const userSet = findCall('set', `users/${PENDING_UID}`);
        const data = userSet.data;
        expect(Array.isArray(data.removedFrom)).toBe(false);
        expect(data.removedFrom.__op__).toBe('arrayRemove');
    });
    it('commita o batch uma única vez (atomicidade)', async () => {
        await callApproveTeacher({
            schoolId: SCHOOL_ID,
            pendingUid: PENDING_UID,
            profile: 'teacher',
        });
        expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });
    it('aplica arrayRemove(schoolId) também para profile=coordinator', async () => {
        mockPendingSnapData = {
            email: EMAIL,
            name: 'Coord',
            subjectIds: [],
        };
        await callApproveTeacher({
            schoolId: SCHOOL_ID,
            pendingUid: PENDING_UID,
            profile: 'coordinator',
        });
        expect(arrayRemoveMock).toHaveBeenCalledWith(SCHOOL_ID);
        const userSet = findCall('set', `users/${PENDING_UID}`);
        expect(userSet.data.removedFrom.__op__).toBe('arrayRemove');
    });
});
// ── Cenário: validação rejeita ANTES de tocar removedFrom ────────────────────
describe('approveTeacher — validação rejeita antes do batch', () => {
    it('quando profile=teacher sem subjectIds, NÃO chama arrayRemove nem commit', async () => {
        mockPendingSnapData = {
            email: EMAIL,
            name: 'Sem matéria',
            subjectIds: [],
        };
        await expect(callApproveTeacher({
            schoolId: SCHOOL_ID,
            pendingUid: PENDING_UID,
            profile: 'teacher',
        })).rejects.toMatchObject({ code: 'failed-precondition' });
        expect(arrayRemoveMock).not.toHaveBeenCalled();
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });
});
// ── Cenário: defesa em profundidade — bloqueio quando removed_users existe ───
//
// Auditoria adicional: se removed_users/{pendingUid} existe e o caller não
// passou overrideRemoval: true, approveTeacher deve falhar com
// failed-precondition antes de tocar em qualquer coisa.
describe('approveTeacher — bloqueio por removed_users', () => {
    beforeEach(() => {
        mockRemovedUserExists = true;
    });
    it('lança failed-precondition quando removed_users existe e overrideRemoval ausente', async () => {
        await expect(callApproveTeacher({
            schoolId: SCHOOL_ID,
            pendingUid: PENDING_UID,
            profile: 'teacher',
        })).rejects.toMatchObject({
            code: 'failed-precondition',
            message: expect.stringContaining('removido'),
        });
        expect(mockBatchCommit).not.toHaveBeenCalled();
        expect(arrayRemoveMock).not.toHaveBeenCalled();
    });
    it('lança failed-precondition quando overrideRemoval=false explícito', async () => {
        await expect(callApproveTeacher({
            schoolId: SCHOOL_ID,
            pendingUid: PENDING_UID,
            profile: 'teacher',
            overrideRemoval: false,
        })).rejects.toMatchObject({ code: 'failed-precondition' });
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });
    it('permite aprovação quando overrideRemoval=true e removed_users existe', async () => {
        const result = await callApproveTeacher({
            schoolId: SCHOOL_ID,
            pendingUid: PENDING_UID,
            profile: 'teacher',
            overrideRemoval: true,
        });
        expect(result).toMatchObject({ ok: true });
        expect(mockBatchCommit).toHaveBeenCalledTimes(1);
        // Continua limpando removedFrom mesmo com override
        expect(arrayRemoveMock).toHaveBeenCalledWith(SCHOOL_ID);
    });
});
//# sourceMappingURL=approveTeacher.test.js.map