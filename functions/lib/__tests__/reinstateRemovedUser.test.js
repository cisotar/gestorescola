"use strict";
/**
 * Testes unitários para reinstateRemovedUser (issue #473).
 *
 * Foco: garantir que ao reativar um usuário, a CF apaga o marcador
 *   schools/{schoolId}/removed_users/{uid}
 * E remove a schoolId do índice invertido
 *   users/{uid}.removedFrom = arrayRemove(schoolId)
 * no MESMO batch (atomicidade). Sem isso, o boot continuaria bloqueando o
 * login mesmo após o admin reativar (RN-R6).
 *
 * Cenários:
 *   1. targetUid + users/{uid} existe → batch.delete(removed_users) +
 *      batch.update(users) com arrayRemove(schoolId).
 *   2. targetUid + users/{uid} NÃO existe → apenas batch.delete(removed_users),
 *      sem update (não falha).
 *   3. targetEmail (sem uid) → batch.delete(removed_users/email_...) sem
 *      tocar users/{uid}.
 *   4. arrayRemove é o sentinel correto (não array literal) — idempotência
 *      no servidor.
 *   5. Erro em validação de input não chama batch.commit.
 */
Object.defineProperty(exports, "__esModule", { value: true });
// ── Constantes ────────────────────────────────────────────────────────────────
const SCHOOL_ID = 'sch-test-001';
const TARGET_UID = 'uid-target-abc';
const TARGET_EMAIL = 'prof@escola.example.com';
const ADMIN_UID = 'uid-admin-caller';
const ADMIN_EMAIL = 'admin@escola.example.com';
// ── Estado mutável dos mocks ──────────────────────────────────────────────────
let mockUserExists;
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
    const docFn = (path) => ({
        _path: path,
        get: jest.fn(async () => {
            if (path === `users/${TARGET_UID}`) {
                return { exists: mockUserExists, data: () => ({}) };
            }
            return { exists: false, data: () => ({}) };
        }),
    });
    const collectionFn = (_collPath) => ({
        where: () => ({
            limit: () => ({
                get: jest.fn(async () => ({ empty: true, docs: [] })),
            }),
            get: jest.fn(async () => ({ empty: true, size: 0, docs: [] })),
        }),
        doc: (docId) => docFn(`${_collPath}/${docId}`),
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
    const firestoreMock = () => ({
        doc: docFn,
        collection: collectionFn,
        batch: batchFn,
    });
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
// reinstateRemovedUser é a 6ª função registrada via onCall em index.ts.
// Ordem (0-based): createAbsence(0), updateAbsence(1), deleteAbsence(2),
// approveTeacher(3), rejectTeacher(4), reinstateRemovedUser(5),
// setTeacherRoleInSchool(6), designateSchoolAdmin(7), joinSchoolAsAdmin(8),
// removeTeacherFromSchool(9).
const REINSTATE_INDEX = 5;
function getHandler() {
    const handler = registeredHandlers[REINSTATE_INDEX];
    if (!handler) {
        throw new Error(`Handler no índice ${REINSTATE_INDEX} não capturado`);
    }
    return handler;
}
function makeContext(uid = ADMIN_UID, email = ADMIN_EMAIL) {
    return {
        auth: {
            uid,
            token: { email },
        },
    };
}
async function callReinstate(data, context = makeContext()) {
    return getHandler()(data, context);
}
// ── Setup por teste ───────────────────────────────────────────────────────────
beforeEach(() => {
    batchCalls = [];
    mockBatchCommit = jest.fn().mockResolvedValue(undefined);
    arrayRemoveMock.mockClear();
    arrayUnionMock.mockClear();
    mockUserExists = true;
});
// ── Helpers ───────────────────────────────────────────────────────────────────
function findCall(op, path) {
    return batchCalls.find((c) => c.op === op && c.path === path);
}
// ── Cenário 1: targetUid + users/{uid} existe ────────────────────────────────
describe('Cenário 1 — targetUid com users/{uid} existente', () => {
    it('retorna ok:true e commita o batch', async () => {
        const result = await callReinstate({
            schoolId: SCHOOL_ID,
            targetUid: TARGET_UID,
        });
        expect(result).toMatchObject({ ok: true });
        expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });
    it('apaga schools/{schoolId}/removed_users/{uid} via batch.delete', async () => {
        await callReinstate({
            schoolId: SCHOOL_ID,
            targetUid: TARGET_UID,
        });
        const removedDelete = findCall('delete', `schools/${SCHOOL_ID}/removed_users/${TARGET_UID}`);
        expect(removedDelete).toBeDefined();
    });
    it('emite batch.update em users/{uid} com arrayRemove(schoolId) em removedFrom', async () => {
        await callReinstate({
            schoolId: SCHOOL_ID,
            targetUid: TARGET_UID,
        });
        const userUpdate = findCall('update', `users/${TARGET_UID}`);
        expect(userUpdate).toBeDefined();
        const data = userUpdate.data;
        expect(arrayRemoveMock).toHaveBeenCalledWith(SCHOOL_ID);
        expect(data.removedFrom).toMatchObject({
            __op__: 'arrayRemove',
            values: [SCHOOL_ID],
        });
    });
});
// ── Cenário 2: targetUid + users/{uid} NÃO existe ────────────────────────────
describe('Cenário 2 — targetUid sem doc users/{uid}', () => {
    beforeEach(() => {
        mockUserExists = false;
    });
    it('apaga removed_users mas NÃO emite update em users/{uid}', async () => {
        await callReinstate({
            schoolId: SCHOOL_ID,
            targetUid: TARGET_UID,
        });
        const removedDelete = findCall('delete', `schools/${SCHOOL_ID}/removed_users/${TARGET_UID}`);
        expect(removedDelete).toBeDefined();
        const userUpdate = findCall('update', `users/${TARGET_UID}`);
        expect(userUpdate).toBeUndefined();
        expect(arrayRemoveMock).not.toHaveBeenCalled();
    });
    it('continua commitando o batch normalmente', async () => {
        const result = await callReinstate({
            schoolId: SCHOOL_ID,
            targetUid: TARGET_UID,
        });
        expect(result).toMatchObject({ ok: true });
        expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });
});
// ── Cenário 3: apenas email (sem uid) ────────────────────────────────────────
describe('Cenário 3 — apenas email (sem uid)', () => {
    it('apaga removed_users/email_... e não toca users/{uid}', async () => {
        await callReinstate({
            schoolId: SCHOOL_ID,
            email: TARGET_EMAIL,
        });
        const expectedKey = `email_${TARGET_EMAIL.replace(/[^a-z0-9._-]/g, '_')}`;
        const removedDelete = findCall('delete', `schools/${SCHOOL_ID}/removed_users/${expectedKey}`);
        expect(removedDelete).toBeDefined();
        expect(arrayRemoveMock).not.toHaveBeenCalled();
        // Não deve haver update em users/{...}
        const anyUserUpdate = batchCalls.find((c) => c.op === 'update' && c.path.startsWith('users/'));
        expect(anyUserUpdate).toBeUndefined();
    });
    it('commita o batch', async () => {
        const result = await callReinstate({
            schoolId: SCHOOL_ID,
            email: TARGET_EMAIL,
        });
        expect(result).toMatchObject({ ok: true });
        expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });
});
// ── Cenário 4: idempotência via arrayRemove sentinel ─────────────────────────
describe('Cenário 4 — arrayRemove é o sentinel correto', () => {
    it('grava removedFrom como wrapper arrayRemove (não array literal)', async () => {
        await callReinstate({
            schoolId: SCHOOL_ID,
            targetUid: TARGET_UID,
        });
        const userUpdate = findCall('update', `users/${TARGET_UID}`);
        const data = userUpdate.data;
        expect(Array.isArray(data.removedFrom)).toBe(false);
        expect(data.removedFrom.__op__).toBe('arrayRemove');
    });
});
// ── Cenário 5: validação de input ────────────────────────────────────────────
describe('Cenário 5 — validação de input', () => {
    it('lança invalid-argument quando schoolId está ausente', async () => {
        await expect(callReinstate({ targetUid: TARGET_UID })).rejects.toMatchObject({ code: 'invalid-argument' });
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });
    it('lança invalid-argument quando faltam targetUid e email', async () => {
        await expect(callReinstate({ schoolId: SCHOOL_ID })).rejects.toMatchObject({
            code: 'invalid-argument',
        });
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });
    it('lança unauthenticated quando context.auth está ausente', async () => {
        await expect(callReinstate({ schoolId: SCHOOL_ID, targetUid: TARGET_UID }, { auth: null })).rejects.toMatchObject({ code: 'unauthenticated' });
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=reinstateRemovedUser.test.js.map