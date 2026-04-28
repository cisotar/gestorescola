/**
 * Testes unitários para o bloco de validação profile × subjectIds
 * adicionado à Cloud Function approveTeacher (issue #465).
 *
 * Estratégia: mockar firebase-admin e firebase-functions/v1 inteiramente
 * para extrair o handler registrado via onCall e chamá-lo diretamente,
 * sem emulator nem inicialização real do SDK.
 *
 * Os 7 cenários cobertos são os documentados no plano técnico da issue:
 *   1. teacher sem subjectIds → failed-precondition
 *   2. teacher-coordinator sem subjectIds → failed-precondition
 *   3. teacher com subjectIds válidos → aprova normalmente
 *   4. teacher-coordinator com subjectIds válidos → aprova normalmente
 *   5. coordinator com subjectIds não-vazio → grava subjectIds: []
 *   6. reingresso: professor existente com subjectIds no doc antigo → aprova (fallback preservado)
 *   7. reingresso: professor existente sem subjectIds em nenhum lugar → failed-precondition
 */

// ── Constantes ────────────────────────────────────────────────────────────────

const SCHOOL_ID = 'sch-test-001'
const PENDING_UID = 'uid-pending-abc'
const EXISTING_TEACHER_ID = 'teacher-doc-xyz'
const EMAIL = 'prof@escola.example.com'

// ── Estado mutável dos mocks ──────────────────────────────────────────────────

// Dados controlados por cada teste
let mockPendingSnapExists: boolean
let mockPendingSnapData: Record<string, unknown>
let mockExistingSnapEmpty: boolean
let mockExistingSnapDocs: Array<{ id: string; data: () => Record<string, unknown> }>

// Captura o teacherData gravado via batch.set(teacherRef, teacherData)
let capturedTeacherData: Record<string, unknown> | null

// Controle do batch
let mockBatchCommit: jest.Mock

// ── Mock: firebase-functions/v1 ───────────────────────────────────────────────
//
// O módulo index.ts registra várias funções com onCall.
// Precisamos capturar especificamente a função approveTeacher.
// Fazemos isso interceptando a cadeia region().https.onCall na ordem de
// registro, contando qual chamada corresponde a approveTeacher.
// Mais robusto: usar um Map de handlers indexado pela posição de registro.

type Handler = (data: unknown, context: unknown) => Promise<unknown>

// Armazena todos os handlers registrados, em ordem
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

// ── Mock: ./actions (ACTION_MAP não é exercitado aqui) ────────────────────────

jest.mock('../actions', () => ({
  ACTION_MAP: {},
}))

// ── Mock: firebase-admin ──────────────────────────────────────────────────────
//
// A cadeia Firestore usada por approveTeacher:
//
//   db = admin.firestore()
//   db.collection(`schools/${schoolId}/pending_teachers`).doc(pendingUid).get()
//   db.collection(`schools/${schoolId}/teachers`).where(...).limit(1).get()
//   db.collection(`schools/${schoolId}/schedules`).where(...).get()
//   db.batch() → { set, update, delete, commit }
//   db.collection(`schools/${schoolId}/teachers`).doc(teacherId)  [ref para batch.set]
//   db.collection('users').doc(pendingUid)                        [ref para batch.set]
//   db.doc(`schools/${schoolId}/removed_users/${pendingUid}`)     [ref para batch.delete]

jest.mock('firebase-admin', () => {
  const firestoreMock = () => {
    const collectionFn = (collPath: string) => ({
      doc: (docId: string) => ({
        _path: `${collPath}/${docId}`,
        get: jest.fn(async () => {
          if (collPath.includes('pending_teachers')) {
            return {
              exists: mockPendingSnapExists,
              data: () => mockPendingSnapData,
            }
          }
          return { exists: false, data: () => ({}) }
        }),
        set: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      }),
      where: (_field: string, _op: string, _val: unknown) => ({
        limit: (_n: number) => ({
          get: jest.fn(async () => {
            if (collPath.includes('teachers')) {
              return {
                empty: mockExistingSnapEmpty,
                docs: mockExistingSnapDocs,
              }
            }
            // schedules — sem órfãos nos cenários testados
            return { empty: true, docs: [] }
          }),
        }),
        get: jest.fn(async () => ({ empty: true, docs: [] })),
      }),
    })

    const docFn = (path: string) => ({
      _path: path,
      get: jest.fn(async () => ({ exists: false })),
      set: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    })

    const batchFn = () => {
      // Rastrear o primeiro set com status==='approved' (teacher doc)
      const batchSet = jest.fn((_ref: unknown, data: unknown) => {
        if (
          capturedTeacherData === null &&
          data !== null &&
          typeof data === 'object' &&
          (data as Record<string, unknown>).status === 'approved'
        ) {
          capturedTeacherData = data as Record<string, unknown>
        }
      })
      return {
        set: batchSet,
        update: jest.fn(),
        delete: jest.fn(),
        commit: mockBatchCommit,
      }
    }

    return {
      collection: collectionFn,
      doc: docFn,
      batch: batchFn,
    }
  }

  return {
    initializeApp: jest.fn(),
    firestore: Object.assign(firestoreMock, {
      FieldValue: {
        serverTimestamp: () => '__server_timestamp__',
        delete: () => '__field_delete__',
      },
    }),
  }
})

// ── Importar APÓS os mocks ────────────────────────────────────────────────────
// index.ts registra as funções ao ser importado; o mock de onCall captura os handlers.

import '../index'

// approveTeacher é a 4ª função registrada em index.ts:
// 1 = createAbsence, 2 = updateAbsence, 3 = deleteAbsence, 4 = approveTeacher
const APPROVE_TEACHER_INDEX = 3  // 0-based

function getApproveTeacherHandler(): Handler {
  const handler = registeredHandlers[APPROVE_TEACHER_INDEX]
  if (!handler) throw new Error(`Handler no índice ${APPROVE_TEACHER_INDEX} não capturado`)
  return handler
}

// ── Context de chamada ────────────────────────────────────────────────────────

function makeContext() {
  return {
    auth: {
      uid: 'uid-admin-caller',
      token: { email: 'admin@escola.example.com' },
    },
  }
}

async function callApproveTeacher(data: Record<string, unknown>) {
  return getApproveTeacherHandler()(data, makeContext())
}

// ── Setup por teste ───────────────────────────────────────────────────────────

beforeEach(() => {
  capturedTeacherData = null
  mockBatchCommit = jest.fn().mockResolvedValue(undefined)

  // Defaults: pending doc existe com email e sem matérias, sem teacher existente
  mockPendingSnapExists = true
  mockPendingSnapData = { email: EMAIL, name: 'Professor Teste', subjectIds: [] }
  mockExistingSnapEmpty = true
  mockExistingSnapDocs = []
})

// ── Cenário 1: teacher sem subjectIds → failed-precondition ──────────────────

describe('Cenário 1 — teacher sem subjectIds', () => {
  it('lança HttpsError com code failed-precondition', async () => {
    await expect(
      callApproveTeacher({ schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'teacher' })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('matéria'),
    })
  })

  it('não commita o batch quando a validação rejeita', async () => {
    await callApproveTeacher({
      schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'teacher',
    }).catch(() => {})

    expect(mockBatchCommit).not.toHaveBeenCalled()
  })

  it('também lança quando subjectIds está ausente no pending doc (undefined → [])', async () => {
    // Campo omitido: pendingData.subjectIds ?? [] → []
    const { subjectIds: _omit, ...dataWithoutSubjects } = mockPendingSnapData as Record<string, unknown>
    mockPendingSnapData = dataWithoutSubjects

    await expect(
      callApproveTeacher({ schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'teacher' })
    ).rejects.toMatchObject({ code: 'failed-precondition' })
  })
})

// ── Cenário 2: teacher-coordinator sem subjectIds → failed-precondition ───────

describe('Cenário 2 — teacher-coordinator sem subjectIds', () => {
  it('lança HttpsError com code failed-precondition', async () => {
    await expect(
      callApproveTeacher({
        schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'teacher-coordinator',
      })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('matéria'),
    })
  })
})

// ── Cenário 3: teacher com subjectIds válidos → aprova ───────────────────────

describe('Cenário 3 — teacher com subjectIds válidos', () => {
  beforeEach(() => {
    mockPendingSnapData = { email: EMAIL, name: 'Teste', subjectIds: ['subj-bio'] }
  })

  it('resolve com { ok: true }', async () => {
    await expect(
      callApproveTeacher({ schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'teacher' })
    ).resolves.toMatchObject({ ok: true })
  })

  it('commita o batch e preserva subjectIds no teacher doc', async () => {
    mockPendingSnapData = { email: EMAIL, name: 'Teste', subjectIds: ['subj-bio', 'subj-mat'] }

    await callApproveTeacher({ schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'teacher' })

    expect(mockBatchCommit).toHaveBeenCalledTimes(1)
    expect(capturedTeacherData?.subjectIds).toEqual(['subj-bio', 'subj-mat'])
  })
})

// ── Cenário 4: teacher-coordinator com subjectIds válidos → aprova ────────────

describe('Cenário 4 — teacher-coordinator com subjectIds válidos', () => {
  it('resolve e preserva subjectIds no teacher doc', async () => {
    mockPendingSnapData = { email: EMAIL, name: 'Teste', subjectIds: ['subj-hist'] }

    await expect(
      callApproveTeacher({
        schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'teacher-coordinator',
      })
    ).resolves.toMatchObject({ ok: true })

    expect(capturedTeacherData?.subjectIds).toEqual(['subj-hist'])
  })
})

// ── Cenário 5: coordinator com subjectIds não-vazio → grava subjectIds: [] ───

describe('Cenário 5 — coordinator: subjectIds forçado para []', () => {
  it('resolve sem lançar erro mesmo com subjectIds preenchido', async () => {
    mockPendingSnapData = { email: EMAIL, name: 'Coord', subjectIds: ['subj-bio', 'subj-quim'] }

    await expect(
      callApproveTeacher({
        schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'coordinator',
      })
    ).resolves.toMatchObject({ ok: true })
  })

  it('grava o teacher doc com subjectIds: [], descartando lista recebida', async () => {
    mockPendingSnapData = { email: EMAIL, name: 'Coord', subjectIds: ['subj-bio', 'subj-quim'] }

    await callApproveTeacher({
      schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'coordinator',
    })

    expect(capturedTeacherData?.subjectIds).toEqual([])
  })

  it('também descarta quando a lista tem muitos itens', async () => {
    mockPendingSnapData = {
      email: EMAIL, name: 'Coord', subjectIds: ['s1', 's2', 's3', 's4', 's5'],
    }

    await callApproveTeacher({
      schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'coordinator',
    })

    expect(capturedTeacherData?.subjectIds).toEqual([])
  })
})

// ── Cenário 6: reingresso com subjectIds no doc antigo → aprova ───────────────

describe('Cenário 6 — reingresso: doc antigo tem subjectIds → aprova', () => {
  beforeEach(() => {
    // pending doc sem subjectIds
    mockPendingSnapData = { email: EMAIL, name: 'Re-ingresso' }
    mockExistingSnapEmpty = false
    mockExistingSnapDocs = [
      {
        id: EXISTING_TEACHER_ID,
        data: () => ({
          id: EXISTING_TEACHER_ID,
          email: EMAIL,
          subjectIds: ['subj-port'],
          status: 'approved',
          profile: 'teacher',
        }),
      },
    ]
  })

  it('resolve sem lançar erro usando subjectIds do doc antigo', async () => {
    await expect(
      callApproveTeacher({ schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'teacher' })
    ).resolves.toMatchObject({ ok: true })
  })

  it('mantém os subjectIds do doc antigo no teacher gravado', async () => {
    mockExistingSnapDocs = [
      {
        id: EXISTING_TEACHER_ID,
        data: () => ({
          id: EXISTING_TEACHER_ID,
          email: EMAIL,
          subjectIds: ['subj-port', 'subj-lit'],
          status: 'approved',
          profile: 'teacher',
        }),
      },
    ]

    await callApproveTeacher({ schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'teacher' })

    expect(capturedTeacherData?.subjectIds).toEqual(['subj-port', 'subj-lit'])
  })
})

// ── Cenário 7: reingresso sem subjectIds em nenhum lugar → failed-precondition

describe('Cenário 7 — reingresso: sem subjectIds em nenhum lugar → failed-precondition', () => {
  it('lança failed-precondition quando o doc antigo tem subjectIds: []', async () => {
    mockPendingSnapData = { email: EMAIL, name: 'Re-ingresso' }
    mockExistingSnapEmpty = false
    mockExistingSnapDocs = [
      {
        id: EXISTING_TEACHER_ID,
        data: () => ({
          id: EXISTING_TEACHER_ID,
          email: EMAIL,
          subjectIds: [],
          status: 'removed',
          profile: 'teacher',
        }),
      },
    ]

    await expect(
      callApproveTeacher({ schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'teacher' })
    ).rejects.toMatchObject({ code: 'failed-precondition' })
  })

  it('lança failed-precondition quando o doc antigo não tem campo subjectIds', async () => {
    mockPendingSnapData = { email: EMAIL, name: 'Re-ingresso' }
    mockExistingSnapEmpty = false
    mockExistingSnapDocs = [
      {
        id: EXISTING_TEACHER_ID,
        data: () => ({
          id: EXISTING_TEACHER_ID,
          email: EMAIL,
          // subjectIds ausente — spread de doc antigo não inclui o campo
          status: 'removed',
          profile: 'teacher',
        }),
      },
    ]

    await expect(
      callApproveTeacher({ schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'teacher' })
    ).rejects.toMatchObject({ code: 'failed-precondition' })
  })

  it('também lança para teacher-coordinator com doc antigo sem matérias', async () => {
    mockPendingSnapData = { email: EMAIL, name: 'Re-ingresso' }
    mockExistingSnapEmpty = false
    mockExistingSnapDocs = [
      {
        id: EXISTING_TEACHER_ID,
        data: () => ({
          id: EXISTING_TEACHER_ID,
          email: EMAIL,
          subjectIds: [],
          status: 'removed',
          profile: 'teacher-coordinator',
        }),
      },
    ]

    await expect(
      callApproveTeacher({
        schoolId: SCHOOL_ID, pendingUid: PENDING_UID, profile: 'teacher-coordinator',
      })
    ).rejects.toMatchObject({ code: 'failed-precondition' })
  })
})
