/**
 * Testes de não-staleness do índice invertido users/{uid}.removedFrom.
 *
 * Auditoria de segurança (ALTA #1, ALTA #2): garantir que toda CF que (re)concede
 * acesso a uma escola limpa a entrada correspondente em users/{uid}.removedFrom
 * via FieldValue.arrayRemove(schoolId). Sem essa limpeza, o boot continuaria
 * bloqueando o login do usuário pós-revogação (RN-R1/R6) mesmo após
 * reativação/promoção.
 *
 * Cobertura por CF:
 *   - joinSchoolAsAdmin     (índice 8) — set+merge inclui arrayRemove(schoolId)
 *   - setTeacherRoleInSchool (índice 6) — update e set+merge incluem
 *     arrayRemove(schoolId)
 *   - designateSchoolAdmin   (índice 7) — update inclui arrayRemove(schoolId)
 */

// ── Constantes ────────────────────────────────────────────────────────────────

const SCHOOL_ID = 'sch-test-001'
const CALLER_UID = 'uid-caller-abc'
const CALLER_EMAIL = 'caller@escola.example.com'
const TEACHER_DOC_ID = 'teacher-doc-xyz'
const TEACHER_UID = 'uid-teacher-abc'
const TEACHER_EMAIL = 'prof@escola.example.com'

// ── Estado mutável dos mocks ──────────────────────────────────────────────────

type BatchCall = {
  op: 'set' | 'update' | 'delete'
  path: string
  data?: unknown
  opts?: unknown
}
let batchCalls: BatchCall[]
let mockBatchCommit: jest.Mock

// schools/{schoolId} doc
let mockSchoolExists: boolean
let mockSchoolData: Record<string, unknown>

// schools/{schoolId}/teachers/{teacherDocId} doc
let mockTeacherDocExists: boolean
let mockTeacherDocData: Record<string, unknown>

// users/{teacherUid} doc
let mockUserExists: boolean
let mockUserData: Record<string, unknown>

// query users where email == ...
let mockUsersByEmailEmpty: boolean
let mockUsersByEmailDocs: Array<{ id: string; data: () => Record<string, unknown> }>

// query users where schools.{schoolId}.teacherDocId == ...
let mockUsersFallbackEmpty: boolean
let mockUsersFallbackDocs: Array<{ id: string; data: () => Record<string, unknown> }>

const SERVER_TS_SENTINEL = '__server_ts__'
const DELETE_SENTINEL = '__field_delete__'
const arrayUnionMock = jest.fn((value: unknown) => ({
  __op__: 'arrayUnion',
  values: [value],
}))
const arrayRemoveMock = jest.fn((value: unknown) => ({
  __op__: 'arrayRemove',
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

jest.mock('firebase-admin', () => {
  const docFn = (path: string) => ({
    _path: path,
    get: jest.fn(async () => {
      if (path === `schools/${SCHOOL_ID}`) {
        return { exists: mockSchoolExists, data: () => mockSchoolData }
      }
      if (path === `schools/${SCHOOL_ID}/teachers/${TEACHER_DOC_ID}`) {
        return {
          exists: mockTeacherDocExists,
          data: () => mockTeacherDocData,
        }
      }
      if (path === `users/${TEACHER_UID}` || path === `users/${CALLER_UID}`) {
        return { exists: mockUserExists, data: () => mockUserData }
      }
      return { exists: false, data: () => ({}) }
    }),
  })

  const collectionFn = (collPath: string) => ({
    where: (field: string, _op: string, _val: unknown) => ({
      limit: (_n: number) => ({
        get: jest.fn(async () => {
          if (collPath === 'users' && field === 'email') {
            return {
              empty: mockUsersByEmailEmpty,
              docs: mockUsersByEmailDocs,
            }
          }
          if (collPath === 'users') {
            return {
              empty: mockUsersFallbackEmpty,
              docs: mockUsersFallbackDocs,
            }
          }
          return { empty: true, docs: [] }
        }),
      }),
      get: jest.fn(async () => ({ empty: true, size: 0, docs: [] })),
    }),
    doc: (docId: string) => docFn(`${collPath}/${docId}`),
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
        arrayRemove: arrayRemoveMock,
      },
    }),
  }
})

// ── Importar APÓS os mocks ────────────────────────────────────────────────────

import '../index'

// Ordem dos handlers (0-based) — ver removeTeacherFromSchool.test.ts.
// approveTeacher(3), rejectTeacher(4), reinstateRemovedUser(5),
// setTeacherRoleInSchool(6), designateSchoolAdmin(7), joinSchoolAsAdmin(8),
// removeTeacherFromSchool(9).
const SET_TEACHER_ROLE_INDEX = 6
const DESIGNATE_ADMIN_INDEX = 7
const JOIN_AS_ADMIN_INDEX = 8

function getHandler(idx: number): Handler {
  const handler = registeredHandlers[idx]
  if (!handler) throw new Error(`Handler ${idx} não capturado`)
  return handler
}

function makeContext(uid: string = CALLER_UID, email: string = CALLER_EMAIL) {
  return {
    auth: {
      uid,
      token: { email },
    },
  }
}

function findCall(op: BatchCall['op'], path: string): BatchCall | undefined {
  return batchCalls.find((c) => c.op === op && c.path === path)
}

// ── Setup por teste ───────────────────────────────────────────────────────────

beforeEach(() => {
  batchCalls = []
  mockBatchCommit = jest.fn().mockResolvedValue(undefined)
  arrayUnionMock.mockClear()
  arrayRemoveMock.mockClear()

  mockSchoolExists = true
  mockSchoolData = {
    adminEmail: CALLER_EMAIL,
    status: 'active',
    deletedAt: null,
  }

  mockTeacherDocExists = true
  mockTeacherDocData = {
    email: TEACHER_EMAIL,
    uid: TEACHER_UID,
  }

  mockUserExists = true
  mockUserData = {
    email: TEACHER_EMAIL,
    schools: {
      [SCHOOL_ID]: { role: 'teacher', status: 'approved' },
    },
  }

  mockUsersByEmailEmpty = true
  mockUsersByEmailDocs = []
  mockUsersFallbackEmpty = true
  mockUsersFallbackDocs = []
})

// ── joinSchoolAsAdmin ────────────────────────────────────────────────────────

describe('joinSchoolAsAdmin — limpeza de removedFrom (ALTA #1)', () => {
  it('inclui removedFrom: arrayRemove(schoolId) no set+merge de users/{callerUid}', async () => {
    await getHandler(JOIN_AS_ADMIN_INDEX)(
      { schoolId: SCHOOL_ID },
      makeContext(CALLER_UID, CALLER_EMAIL)
    )

    const userSet = findCall('set', `users/${CALLER_UID}`)
    expect(userSet).toBeDefined()
    expect(userSet!.opts).toEqual({ merge: true })

    const data = userSet!.data as Record<string, unknown>
    expect(arrayRemoveMock).toHaveBeenCalledWith(SCHOOL_ID)
    expect(data.removedFrom).toMatchObject({
      __op__: 'arrayRemove',
      values: [SCHOOL_ID],
    })
  })

  it('mantém email e schools no mesmo set', async () => {
    await getHandler(JOIN_AS_ADMIN_INDEX)(
      { schoolId: SCHOOL_ID },
      makeContext(CALLER_UID, CALLER_EMAIL)
    )

    const userSet = findCall('set', `users/${CALLER_UID}`)
    const data = userSet!.data as Record<string, unknown>

    expect(data.email).toBe(CALLER_EMAIL)
    expect(data.schools).toMatchObject({
      [SCHOOL_ID]: { role: 'admin', status: 'approved' },
    })
  })

  it('grava removedFrom como wrapper arrayRemove (não array literal) para idempotência', async () => {
    await getHandler(JOIN_AS_ADMIN_INDEX)(
      { schoolId: SCHOOL_ID },
      makeContext(CALLER_UID, CALLER_EMAIL)
    )
    const userSet = findCall('set', `users/${CALLER_UID}`)
    const data = userSet!.data as Record<string, unknown>
    expect(Array.isArray(data.removedFrom)).toBe(false)
    expect((data.removedFrom as Record<string, unknown>).__op__).toBe(
      'arrayRemove'
    )
  })
})

// ── setTeacherRoleInSchool ───────────────────────────────────────────────────

describe('setTeacherRoleInSchool — limpeza de removedFrom (ALTA #2)', () => {
  it('quando users/{teacherUid} existe e tem entry, batch.update inclui removedFrom: arrayRemove(schoolId)', async () => {
    // Caller resolve teacherUid via campo uid no teacher doc; users/{teacherUid}
    // existe com entry para a escola → caminho update.
    mockUserData = {
      email: TEACHER_EMAIL,
      schools: {
        [SCHOOL_ID]: { role: 'teacher', status: 'approved' },
      },
    }
    mockUserExists = true

    await getHandler(SET_TEACHER_ROLE_INDEX)(
      {
        schoolId: SCHOOL_ID,
        teacherId: TEACHER_DOC_ID,
        role: 'coordinator',
      },
      makeContext()
    )

    const userUpdate = findCall('update', `users/${TEACHER_UID}`)
    expect(userUpdate).toBeDefined()
    const data = userUpdate!.data as Record<string, unknown>

    // Atualiza role
    expect(data[`schools.${SCHOOL_ID}.role`]).toBe('coordinator')

    // E em paralelo limpa removedFrom
    expect(arrayRemoveMock).toHaveBeenCalledWith(SCHOOL_ID)
    expect(data.removedFrom).toMatchObject({
      __op__: 'arrayRemove',
      values: [SCHOOL_ID],
    })
  })

  it('quando users/{teacherUid} existe SEM entry para schoolId, batch.set inclui removedFrom: arrayRemove(schoolId)', async () => {
    // Doc users existe mas não tem schools[schoolId] → caminho set+merge.
    mockUserData = {
      email: TEACHER_EMAIL,
      schools: {},
    }
    mockUserExists = true

    await getHandler(SET_TEACHER_ROLE_INDEX)(
      {
        schoolId: SCHOOL_ID,
        teacherId: TEACHER_DOC_ID,
        role: 'admin',
      },
      makeContext()
    )

    const userSet = findCall('set', `users/${TEACHER_UID}`)
    expect(userSet).toBeDefined()
    expect(userSet!.opts).toEqual({ merge: true })

    const data = userSet!.data as Record<string, unknown>
    expect(arrayRemoveMock).toHaveBeenCalledWith(SCHOOL_ID)
    expect(data.removedFrom).toMatchObject({
      __op__: 'arrayRemove',
      values: [SCHOOL_ID],
    })
    // E mantém schools.{schoolId}
    expect(
      (data.schools as Record<string, unknown>)[SCHOOL_ID]
    ).toMatchObject({
      role: 'admin',
      status: 'approved',
      teacherDocId: TEACHER_DOC_ID,
    })
  })
})

// ── designateSchoolAdmin ─────────────────────────────────────────────────────

describe('designateSchoolAdmin — limpeza de removedFrom (ALTA #2)', () => {
  it('quando promove via update em users existente, inclui removedFrom: arrayRemove(schoolId)', async () => {
    // users where email==newEmail retorna 1 doc com schools[schoolId] presente.
    mockUsersByEmailEmpty = false
    mockUsersByEmailDocs = [
      {
        id: TEACHER_UID,
        data: () => ({
          email: TEACHER_EMAIL,
          schools: {
            [SCHOOL_ID]: { role: 'teacher', status: 'approved' },
          },
        }),
      },
    ]

    const result = await getHandler(DESIGNATE_ADMIN_INDEX)(
      {
        schoolId: SCHOOL_ID,
        email: TEACHER_EMAIL,
      },
      makeContext()
    )

    expect(result).toMatchObject({ ok: true, promoted: true })

    const userUpdate = findCall('update', `users/${TEACHER_UID}`)
    expect(userUpdate).toBeDefined()
    const data = userUpdate!.data as Record<string, unknown>

    expect(data[`schools.${SCHOOL_ID}.role`]).toBe('admin')
    expect(arrayRemoveMock).toHaveBeenCalledWith(SCHOOL_ID)
    expect(data.removedFrom).toMatchObject({
      __op__: 'arrayRemove',
      values: [SCHOOL_ID],
    })
  })

  it('quando users alvo não existe (promoted=false), NÃO chama arrayRemove no users-target', async () => {
    // users where email==newEmail vazio → não há promote, apenas adminEmail update.
    mockUsersByEmailEmpty = true
    mockUsersByEmailDocs = []

    const result = await getHandler(DESIGNATE_ADMIN_INDEX)(
      {
        schoolId: SCHOOL_ID,
        email: TEACHER_EMAIL,
      },
      makeContext()
    )

    expect(result).toMatchObject({ ok: true, promoted: false })

    const userUpdate = findCall('update', `users/${TEACHER_UID}`)
    expect(userUpdate).toBeUndefined()
    // arrayRemove não chamado nesta CF para o user alvo
    expect(arrayRemoveMock).not.toHaveBeenCalled()
  })
})
