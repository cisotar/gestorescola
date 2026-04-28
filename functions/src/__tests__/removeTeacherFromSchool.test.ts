/**
 * Testes unitários para removeTeacherFromSchool.
 *
 * Foco da issue #472: garantir que o batch grava
 *   users/{uid}.removedFrom = arrayUnion(schoolId)
 * em paralelo com a criação de schools/{schoolId}/removed_users/{uid} e a
 * remoção de users/{uid}.schools[schoolId].
 *
 * Estratégia: mockar firebase-admin e firebase-functions/v1 inteiramente,
 * capturar o handler registrado via onCall e chamá-lo diretamente.
 *
 * Cenários:
 *   1. users/{uid} existe — batch.update grava removedFrom: arrayUnion(schoolId)
 *      junto com a remoção de schools.{schoolId}.
 *   2. users/{uid} NÃO existe — batch.set com merge:true cria o doc com
 *      removedFrom: arrayUnion(schoolId).
 *   3. arrayUnion sentinel é o mesmo símbolo em chamadas repetidas — idempotência.
 *   4. Auto-remoção do admin (callerUid === teacherUid) ainda lança
 *      failed-precondition (regressão do bloqueio existente).
 */

// ── Constantes ────────────────────────────────────────────────────────────────

const SCHOOL_ID = 'sch-test-001'
const TEACHER_DOC_ID = 'teacher-doc-xyz'
const TEACHER_UID = 'uid-teacher-abc'
const TEACHER_EMAIL = 'prof@escola.example.com'
const ADMIN_UID = 'uid-admin-caller'
const ADMIN_EMAIL = 'admin@escola.example.com'

// ── Estado mutável dos mocks ──────────────────────────────────────────────────

// Controla se users/{teacherUid} existe quando o handler chama .get()
let mockUserExists: boolean

// Controla se schools/{schoolId}/teachers/{teacherDocId} existe
let mockTeacherDocExists: boolean
let mockTeacherDocData: Record<string, unknown>

// Controla snapshot de users where email==... (resolução de UID)
let mockUsersByEmailEmpty: boolean
let mockUsersByEmailDocs: Array<{ id: string }>

// Controla snapshot de users.schools.{schoolId}.teacherDocId (fallback de UID)
let mockUsersFallbackEmpty: boolean
let mockUsersFallbackDocs: Array<{ id: string }>

// Controla doc users/{callerUid} (para detectar auto-remoção via teacherDocId)
let mockCallerUserData: Record<string, unknown>

// Captura todas as operações no batch
type BatchCall = { op: 'set' | 'update' | 'delete'; path: string; data?: unknown; opts?: unknown }
let batchCalls: BatchCall[]

// Captura commit
let mockBatchCommit: jest.Mock

// Sentinel singletons retornados pelos FieldValue mocks
const SERVER_TS_SENTINEL = '__server_ts__'
const DELETE_SENTINEL = '__field_delete__'
// arrayUnion produz um wrapper objeto identificável + valores acumulados.
// Mantemos um construtor para que o teste consiga inspecionar os valores.
const arrayUnionMock = jest.fn((value: unknown) => ({
  __op__: 'arrayUnion',
  values: [value],
}))

// ── Mock: firebase-functions/v1 ───────────────────────────────────────────────

type Handler = (data: unknown, context: unknown) => Promise<unknown>
const registeredHandlers: Handler[] = []

const HttpsError = class HttpsError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'HttpsError'
  }
}

jest.mock('firebase-functions/v1', () => {
  const onCall = (handler: Handler) => {
    registeredHandlers.push(handler)
    return { __handler__: handler }
  }
  const regionFn = () => ({ https: { onCall } })
  return {
    region: regionFn,
    https: { onCall, HttpsError },
  }
})

// ── Mock: ./auth ──────────────────────────────────────────────────────────────

jest.mock('../auth', () => ({
  verifyAdminOrCoordinatorViaUsers: jest.fn().mockResolvedValue(undefined),
  verifyAdmin: jest.fn().mockResolvedValue(undefined),
  verifyCoordinatorOrAdmin: jest.fn().mockResolvedValue(undefined),
}))

// ── Mock: ./actions ───────────────────────────────────────────────────────────

jest.mock('../actions', () => ({
  ACTION_MAP: {},
}))

// ── Mock: firebase-admin ──────────────────────────────────────────────────────
//
// Cadeia firestore() exercitada por removeTeacherFromSchool:
//
//  db.doc(`schools/${schoolId}/teachers/${teacherId}`).get()
//  db.collection('users').where('email','==',...).limit(1).get()
//  db.collection('users').where(`schools.${schoolId}.teacherDocId`,'==',...).limit(1).get()
//  db.doc(`users/${callerUid}`).get()
//  db.collection(`schools/${schoolId}/schedules`).where('teacherId','==',...).get()
//  db.doc(`users/${teacherUid}`).get()
//  db.batch() — set/update/delete/commit

jest.mock('firebase-admin', () => {
  const docFn = (path: string) => ({
    _path: path,
    get: jest.fn(async () => {
      if (path === `schools/${SCHOOL_ID}/teachers/${TEACHER_DOC_ID}`) {
        return {
          exists: mockTeacherDocExists,
          data: () => mockTeacherDocData,
        }
      }
      if (path === `users/${ADMIN_UID}`) {
        return {
          exists: true,
          data: () => mockCallerUserData,
        }
      }
      if (path === `users/${TEACHER_UID}`) {
        return { exists: mockUserExists, data: () => ({}) }
      }
      return { exists: false, data: () => ({}) }
    }),
  })

  const collectionFn = (collPath: string) => ({
    where: (_field: string, _op: string, _val: unknown) => ({
      limit: (_n: number) => ({
        get: jest.fn(async () => {
          if (collPath === 'users' && _field === 'email') {
            return {
              empty: mockUsersByEmailEmpty,
              docs: mockUsersByEmailDocs,
            }
          }
          if (collPath === 'users') {
            // fallback by schools.{schoolId}.teacherDocId
            return {
              empty: mockUsersFallbackEmpty,
              docs: mockUsersFallbackDocs,
            }
          }
          return { empty: true, docs: [] }
        }),
      }),
      get: jest.fn(async () => {
        if (collPath.includes('schedules')) {
          return { empty: true, size: 0, docs: [] }
        }
        return { empty: true, size: 0, docs: [] }
      }),
    }),
  })

  const batchFn = () => ({
    set: jest.fn((ref: { _path: string }, data: unknown, opts?: unknown) => {
      batchCalls.push({ op: 'set', path: ref._path, data, opts })
    }),
    update: jest.fn((ref: { _path: string }, data: unknown) => {
      batchCalls.push({ op: 'update', path: ref._path, data })
    }),
    delete: jest.fn((ref: { _path: string }) => {
      batchCalls.push({ op: 'delete', path: ref._path })
    }),
    commit: mockBatchCommit,
  })

  const firestoreMock = () => ({
    doc: docFn,
    collection: collectionFn,
    batch: batchFn,
  })

  return {
    initializeApp: jest.fn(),
    firestore: Object.assign(firestoreMock, {
      FieldValue: {
        serverTimestamp: () => SERVER_TS_SENTINEL,
        delete: () => DELETE_SENTINEL,
        arrayUnion: arrayUnionMock,
      },
    }),
  }
})

// ── Importar APÓS os mocks ────────────────────────────────────────────────────

import '../index'

// removeTeacherFromSchool é a 10ª função registrada via onCall em index.ts.
// Ordem (0-based): createAbsence(0), updateAbsence(1), deleteAbsence(2),
// approveTeacher(3), rejectTeacher(4), reinstateRemovedUser(5),
// setTeacherRoleInSchool(6), designateSchoolAdmin(7), joinSchoolAsAdmin(8),
// removeTeacherFromSchool(9).
const REMOVE_TEACHER_INDEX = 9

function getRemoveTeacherHandler(): Handler {
  const handler = registeredHandlers[REMOVE_TEACHER_INDEX]
  if (!handler) {
    throw new Error(`Handler no índice ${REMOVE_TEACHER_INDEX} não capturado`)
  }
  return handler
}

function makeContext(uid: string = ADMIN_UID, email: string = ADMIN_EMAIL) {
  return {
    auth: {
      uid,
      token: { email },
    },
  }
}

async function callRemoveTeacher(
  data: Record<string, unknown>,
  context = makeContext()
) {
  return getRemoveTeacherHandler()(data, context)
}

// ── Setup por teste ───────────────────────────────────────────────────────────

beforeEach(() => {
  batchCalls = []
  mockBatchCommit = jest.fn().mockResolvedValue(undefined)
  arrayUnionMock.mockClear()

  // Defaults: teacher doc existe, com email + uid, users/{uid} existe,
  // caller (admin) é uma pessoa diferente, sem teacherDocId atrelado.
  mockTeacherDocExists = true
  mockTeacherDocData = {
    email: TEACHER_EMAIL,
    uid: TEACHER_UID,
  }
  mockUserExists = true

  mockUsersByEmailEmpty = true
  mockUsersByEmailDocs = []
  mockUsersFallbackEmpty = true
  mockUsersFallbackDocs = []

  mockCallerUserData = {
    email: ADMIN_EMAIL,
    schools: {
      [SCHOOL_ID]: { role: 'admin', status: 'approved' },
    },
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function findCall(op: BatchCall['op'], path: string): BatchCall | undefined {
  return batchCalls.find((c) => c.op === op && c.path === path)
}

// ── Cenário 1: users/{uid} existe → batch.update inclui removedFrom ──────────

describe('Cenário 1 — users/{uid} existe', () => {
  it('retorna ok:true e commita o batch', async () => {
    const result = await callRemoveTeacher({
      schoolId: SCHOOL_ID,
      teacherId: TEACHER_DOC_ID,
    })

    expect(result).toMatchObject({ ok: true, teacherUidResolved: true })
    expect(mockBatchCommit).toHaveBeenCalledTimes(1)
  })

  it('grava users/{uid}.removedFrom = arrayUnion(schoolId) via batch.update', async () => {
    await callRemoveTeacher({
      schoolId: SCHOOL_ID,
      teacherId: TEACHER_DOC_ID,
    })

    const userUpdate = findCall('update', `users/${TEACHER_UID}`)
    expect(userUpdate).toBeDefined()
    const data = userUpdate!.data as Record<string, unknown>

    // Remove schools.{schoolId} no mesmo update
    expect(data[`schools.${SCHOOL_ID}`]).toBe(DELETE_SENTINEL)

    // Adiciona schoolId ao removedFrom via arrayUnion
    expect(arrayUnionMock).toHaveBeenCalledWith(SCHOOL_ID)
    expect(data.removedFrom).toMatchObject({
      __op__: 'arrayUnion',
      values: [SCHOOL_ID],
    })
  })

  it('mantém a criação de schools/{schoolId}/removed_users/{uid}', async () => {
    await callRemoveTeacher({
      schoolId: SCHOOL_ID,
      teacherId: TEACHER_DOC_ID,
    })

    const removedUser = findCall(
      'set',
      `schools/${SCHOOL_ID}/removed_users/${TEACHER_UID}`
    )
    expect(removedUser).toBeDefined()
    expect(removedUser!.data).toMatchObject({
      uid: TEACHER_UID,
      email: TEACHER_EMAIL,
      teacherId: TEACHER_DOC_ID,
      removedBy: ADMIN_UID,
    })
  })
})

// ── Cenário 2: users/{uid} NÃO existe → batch.set com merge:true ─────────────

describe('Cenário 2 — users/{uid} não existe', () => {
  beforeEach(() => {
    mockUserExists = false
  })

  it('cria users/{uid} via set+merge com removedFrom: arrayUnion(schoolId)', async () => {
    await callRemoveTeacher({
      schoolId: SCHOOL_ID,
      teacherId: TEACHER_DOC_ID,
    })

    const userSet = findCall('set', `users/${TEACHER_UID}`)
    expect(userSet).toBeDefined()
    expect(userSet!.opts).toEqual({ merge: true })

    const data = userSet!.data as Record<string, unknown>
    expect(arrayUnionMock).toHaveBeenCalledWith(SCHOOL_ID)
    expect(data.removedFrom).toMatchObject({
      __op__: 'arrayUnion',
      values: [SCHOOL_ID],
    })
  })

  it('NÃO emite batch.update em users/{uid} quando o doc não existe', async () => {
    await callRemoveTeacher({
      schoolId: SCHOOL_ID,
      teacherId: TEACHER_DOC_ID,
    })

    const userUpdate = findCall('update', `users/${TEACHER_UID}`)
    expect(userUpdate).toBeUndefined()
  })

  it('continua commitando o batch normalmente', async () => {
    const result = await callRemoveTeacher({
      schoolId: SCHOOL_ID,
      teacherId: TEACHER_DOC_ID,
    })

    expect(result).toMatchObject({ ok: true })
    expect(mockBatchCommit).toHaveBeenCalledTimes(1)
  })
})

// ── Cenário 3: idempotência — chamadas repetidas usam arrayUnion ─────────────

describe('Cenário 3 — idempotência via arrayUnion', () => {
  it('usa FieldValue.arrayUnion (não array literal), garantindo idempotência no Firestore', async () => {
    await callRemoveTeacher({
      schoolId: SCHOOL_ID,
      teacherId: TEACHER_DOC_ID,
    })

    const userUpdate = findCall('update', `users/${TEACHER_UID}`)
    const data = userUpdate!.data as Record<string, unknown>

    // O valor gravado NÃO deve ser um array nu — deve ser o sentinel arrayUnion
    expect(Array.isArray(data.removedFrom)).toBe(false)
    expect((data.removedFrom as Record<string, unknown>).__op__).toBe(
      'arrayUnion'
    )
  })

  it('chamadas repetidas geram sentinels arrayUnion equivalentes (no servidor o set é idempotente)', async () => {
    await callRemoveTeacher({
      schoolId: SCHOOL_ID,
      teacherId: TEACHER_DOC_ID,
    })
    const firstCallCount = arrayUnionMock.mock.calls.length

    // Reset batchCalls mas mantém o resto do estado (segunda chamada idempotente)
    batchCalls = []
    mockBatchCommit = jest.fn().mockResolvedValue(undefined)

    await callRemoveTeacher({
      schoolId: SCHOOL_ID,
      teacherId: TEACHER_DOC_ID,
    })

    // arrayUnion foi chamado novamente com o mesmo schoolId
    expect(arrayUnionMock.mock.calls.length).toBeGreaterThan(firstCallCount)
    expect(
      arrayUnionMock.mock.calls.every((args) => args[0] === SCHOOL_ID)
    ).toBe(true)
  })
})

// ── Cenário 4: bloqueio de auto-remoção continua funcionando ─────────────────

describe('Cenário 4 — auto-remoção do admin', () => {
  it('lança failed-precondition quando callerUid === teacherUid', async () => {
    // Caller é o próprio teacher
    await expect(
      callRemoveTeacher(
        {
          schoolId: SCHOOL_ID,
          teacherId: TEACHER_DOC_ID,
        },
        makeContext(TEACHER_UID, TEACHER_EMAIL)
      )
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('si mesmo'),
    })

    // Batch não foi commitado
    expect(mockBatchCommit).not.toHaveBeenCalled()
  })

  it('lança failed-precondition quando callerTeacherDocId === teacherId (vínculo via users/{caller}.schools)', async () => {
    // Admin tem teacherDocId apontando para o próprio teacher que tenta remover
    mockCallerUserData = {
      email: ADMIN_EMAIL,
      schools: {
        [SCHOOL_ID]: {
          role: 'admin',
          status: 'approved',
          teacherDocId: TEACHER_DOC_ID,
        },
      },
    }

    await expect(
      callRemoveTeacher({
        schoolId: SCHOOL_ID,
        teacherId: TEACHER_DOC_ID,
      })
    ).rejects.toMatchObject({ code: 'failed-precondition' })

    expect(mockBatchCommit).not.toHaveBeenCalled()
  })
})
