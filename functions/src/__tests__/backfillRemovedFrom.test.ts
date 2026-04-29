/**
 * Testes unitários para backfillRemovedFrom (issue #483).
 *
 * Foco: rotina admin-only que reconcilia o índice invertido
 *   users/{uid}.removedFrom
 * a partir do source of truth schools/{schoolId}/removed_users/{docId},
 * iterando via collectionGroup('removed_users').
 *
 * Cenários:
 *   1. Caller não-admin (sem doc em /admins/{email}) → permission-denied.
 *   2. Caller sem auth → unauthenticated.
 *   3. Admin SaaS itera removed_users e emite arrayUnion(schoolId) por doc
 *      cujo id é um uid (não começa com "email_").
 *   4. Docs com id "email_..." são pulados (skipped++), sem batch op.
 *   5. arrayUnion é o sentinel correto (idempotência no servidor).
 *   6. Mais de 400 docs → múltiplos commits de batch.
 *   7. Retorno traz processed, skipped e errors consistentes.
 */

// ── Constantes ────────────────────────────────────────────────────────────────

const ADMIN_UID = 'uid-saas-admin'
const ADMIN_EMAIL = 'saas@admin.example.com'
const NON_ADMIN_EMAIL = 'random@user.example.com'

// ── Estado mutável dos mocks ──────────────────────────────────────────────────

// Controla se /admins/{email} existe
let mockAdminEmails: Set<string>

// Mock dos docs retornados por collectionGroup('removed_users')
type RemovedUserDoc = { id: string; schoolId: string | null }
let mockRemovedUsersDocs: RemovedUserDoc[]

// Captura todas as operações no batch (cada commit reseta a lista por commit)
type BatchCall = {
  op: 'set' | 'update' | 'delete'
  path: string
  data?: unknown
  opts?: unknown
}
let batchCalls: BatchCall[]

// Lista de commits feitos (cada commit "fecha" um batch)
let commitCount: number
// Se >0, falha o n-ésimo commit (1-based)
let failCommitOnIndex: number | null

// Sentinels
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
// Cadeia firestore() exercitada por backfillRemovedFrom:
//
//  db.collection('admins').doc(email).get()        → existe?
//  db.collectionGroup('removed_users').get()       → todos os docs
//    .docs[i].id                                   → uid (ou "email_...")
//    .docs[i].ref.parent.parent.id                 → schoolId
//  db.doc(`users/${uid}`)                          → ref para o batch
//  db.batch() → set/commit (múltiplos commits)

jest.mock('firebase-admin', () => {
  const docFn = (path: string) => ({
    _path: path,
    get: jest.fn(async () => {
      // /admins/{email} — existe se email está no Set
      if (path.startsWith('admins/')) {
        const email = path.slice('admins/'.length)
        return { exists: mockAdminEmails.has(email), data: () => ({}) }
      }
      return { exists: false, data: () => ({}) }
    }),
  })

  const collectionFn = (collPath: string) => ({
    doc: (docId: string) => docFn(`${collPath}/${docId}`),
    where: () => ({
      limit: () => ({ get: jest.fn(async () => ({ empty: true, docs: [] })) }),
      get: jest.fn(async () => ({ empty: true, size: 0, docs: [] })),
    }),
  })

  const collectionGroupFn = (groupId: string) => ({
    get: jest.fn(async () => {
      if (groupId !== 'removed_users') {
        return { empty: true, size: 0, docs: [] }
      }
      const docs = mockRemovedUsersDocs.map((d) => ({
        id: d.id,
        ref: {
          _path:
            d.schoolId !== null
              ? `schools/${d.schoolId}/removed_users/${d.id}`
              : `removed_users/${d.id}`,
          parent: {
            // parent.parent é o doc da escola (ou null se não houver)
            parent:
              d.schoolId !== null
                ? { id: d.schoolId, _path: `schools/${d.schoolId}` }
                : null,
          },
        },
      }))
      return { size: docs.length, empty: docs.length === 0, docs }
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
    commit: jest.fn(async () => {
      commitCount += 1
      if (failCommitOnIndex !== null && commitCount === failCommitOnIndex) {
        throw new Error('mock commit failure')
      }
    }),
  })

  const firestoreMock = () => ({
    doc: docFn,
    collection: collectionFn,
    collectionGroup: collectionGroupFn,
    batch: batchFn,
  })

  return {
    initializeApp: jest.fn(),
    firestore: Object.assign(firestoreMock, {
      FieldValue: {
        serverTimestamp: () => '__server_ts__',
        delete: () => '__field_delete__',
        arrayUnion: arrayUnionMock,
        arrayRemove: jest.fn((v: unknown) => ({
          __op__: 'arrayRemove',
          values: [v],
        })),
      },
    }),
  }
})

// ── Importar APÓS os mocks ────────────────────────────────────────────────────

import '../index'

// backfillRemovedFrom é registrada em ÚLTIMO no index.ts.
// Ordem (0-based) de onCall:
//   createAbsence(0), updateAbsence(1), deleteAbsence(2),
//   approveTeacher(3), rejectTeacher(4), reinstateRemovedUser(5),
//   setTeacherRoleInSchool(6), designateSchoolAdmin(7),
//   joinSchoolAsAdmin(8), removeTeacherFromSchool(9),
//   applyPendingAction(10), backfillRemovedFrom(11).
const BACKFILL_INDEX = 11

function getHandler(): Handler {
  const handler = registeredHandlers[BACKFILL_INDEX]
  if (!handler) {
    throw new Error(`Handler no índice ${BACKFILL_INDEX} não capturado`)
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

async function callBackfill(
  data: Record<string, unknown> = {},
  context = makeContext()
) {
  return getHandler()(data, context)
}

// ── Setup por teste ───────────────────────────────────────────────────────────

beforeEach(() => {
  batchCalls = []
  commitCount = 0
  failCommitOnIndex = null
  arrayUnionMock.mockClear()

  mockAdminEmails = new Set([ADMIN_EMAIL])
  mockRemovedUsersDocs = []
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function findCall(op: BatchCall['op'], path: string): BatchCall | undefined {
  return batchCalls.find((c) => c.op === op && c.path === path)
}

// ── Cenário 1: caller não-admin ──────────────────────────────────────────────

describe('Cenário 1 — caller não-admin', () => {
  it('lança permission-denied quando email não está em /admins/', async () => {
    await expect(
      callBackfill({}, makeContext('uid-rand', NON_ADMIN_EMAIL))
    ).rejects.toMatchObject({ code: 'permission-denied' })

    expect(commitCount).toBe(0)
    expect(batchCalls).toHaveLength(0)
  })

  it('lança permission-denied quando token não tem email', async () => {
    await expect(
      callBackfill(
        {},
        { auth: { uid: 'x', token: {} } } as unknown as ReturnType<
          typeof makeContext
        >
      )
    ).rejects.toMatchObject({ code: 'permission-denied' })
  })
})

// ── Cenário 2: sem auth ──────────────────────────────────────────────────────

describe('Cenário 2 — sem context.auth', () => {
  it('lança unauthenticated', async () => {
    await expect(
      callBackfill({}, { auth: null } as unknown as ReturnType<typeof makeContext>)
    ).rejects.toMatchObject({ code: 'unauthenticated' })

    expect(commitCount).toBe(0)
  })
})

// ── Cenário 3: admin processa docs com uid ───────────────────────────────────

describe('Cenário 3 — admin SaaS processa docs com uid', () => {
  it('emite arrayUnion(schoolId) em users/{uid} para cada doc com uid', async () => {
    mockRemovedUsersDocs = [
      { id: 'uid-aaa', schoolId: 'sch-1' },
      { id: 'uid-bbb', schoolId: 'sch-2' },
      { id: 'uid-ccc', schoolId: 'sch-1' },
    ]

    const result = await callBackfill()

    expect(result).toMatchObject({
      ok: true,
      processed: 3,
      skipped: 0,
      errors: 0,
    })

    // Cada doc gerou um set+merge em users/{uid}
    const setAaa = findCall('set', 'users/uid-aaa')
    const setBbb = findCall('set', 'users/uid-bbb')
    const setCcc = findCall('set', 'users/uid-ccc')

    expect(setAaa).toBeDefined()
    expect(setBbb).toBeDefined()
    expect(setCcc).toBeDefined()

    expect(setAaa!.opts).toEqual({ merge: true })
    expect(setBbb!.opts).toEqual({ merge: true })
    expect(setCcc!.opts).toEqual({ merge: true })

    // Cada set carrega arrayUnion(schoolId correspondente)
    expect((setAaa!.data as Record<string, unknown>).removedFrom).toMatchObject(
      { __op__: 'arrayUnion', values: ['sch-1'] }
    )
    expect((setBbb!.data as Record<string, unknown>).removedFrom).toMatchObject(
      { __op__: 'arrayUnion', values: ['sch-2'] }
    )
    expect((setCcc!.data as Record<string, unknown>).removedFrom).toMatchObject(
      { __op__: 'arrayUnion', values: ['sch-1'] }
    )

    // Apenas 1 commit (3 ops < BATCH_SIZE)
    expect(commitCount).toBe(1)
  })
})

// ── Cenário 4: docs com prefixo "email_" são pulados ─────────────────────────

describe('Cenário 4 — docs "email_..." são pulados', () => {
  it('incrementa skipped e NÃO emite batch op para email_...', async () => {
    mockRemovedUsersDocs = [
      { id: 'uid-real', schoolId: 'sch-1' },
      { id: 'email_some_user_at_x', schoolId: 'sch-1' },
      { id: 'email_other_user_at_y', schoolId: 'sch-2' },
    ]

    const result = await callBackfill()

    expect(result).toMatchObject({
      ok: true,
      processed: 1,
      skipped: 2,
      errors: 0,
    })

    expect(findCall('set', 'users/uid-real')).toBeDefined()
    expect(findCall('set', 'users/email_some_user_at_x')).toBeUndefined()
    expect(findCall('set', 'users/email_other_user_at_y')).toBeUndefined()
  })

  it('pula docs sem parent.parent (registro defeituoso)', async () => {
    mockRemovedUsersDocs = [
      { id: 'uid-orphan', schoolId: null },
      { id: 'uid-good', schoolId: 'sch-1' },
    ]

    const result = await callBackfill()

    expect(result).toMatchObject({ processed: 1, skipped: 1 })
    expect(findCall('set', 'users/uid-orphan')).toBeUndefined()
    expect(findCall('set', 'users/uid-good')).toBeDefined()
  })
})

// ── Cenário 5: arrayUnion sentinel (idempotência) ────────────────────────────

describe('Cenário 5 — arrayUnion garante idempotência', () => {
  it('grava removedFrom como wrapper arrayUnion (não array literal)', async () => {
    mockRemovedUsersDocs = [{ id: 'uid-x', schoolId: 'sch-1' }]

    await callBackfill()

    const setX = findCall('set', 'users/uid-x')
    const data = setX!.data as Record<string, unknown>

    expect(Array.isArray(data.removedFrom)).toBe(false)
    expect((data.removedFrom as Record<string, unknown>).__op__).toBe(
      'arrayUnion'
    )
  })

  it('chamadas repetidas geram mesmas ops (idempotente no servidor)', async () => {
    mockRemovedUsersDocs = [{ id: 'uid-x', schoolId: 'sch-1' }]

    const r1 = await callBackfill()

    // Reset state mas mantém os mock docs e admin
    batchCalls = []
    commitCount = 0
    arrayUnionMock.mockClear()

    const r2 = await callBackfill()

    expect(r1).toEqual(r2)
    expect(findCall('set', 'users/uid-x')).toBeDefined()
    expect(arrayUnionMock).toHaveBeenCalledWith('sch-1')
  })
})

// ── Cenário 6: batches de 400 ────────────────────────────────────────────────

describe('Cenário 6 — batching (400 ops por commit)', () => {
  it('emite múltiplos commits quando processed > 400', async () => {
    // Gerar 850 docs válidos → deve resultar em 3 commits (400 + 400 + 50)
    mockRemovedUsersDocs = Array.from({ length: 850 }, (_, i) => ({
      id: `uid-${String(i).padStart(4, '0')}`,
      schoolId: `sch-${i % 3}`,
    }))

    const result = await callBackfill()

    expect(result).toMatchObject({ processed: 850, skipped: 0, errors: 0 })
    // 850 / 400 = 2.125 → 3 commits
    expect(commitCount).toBe(3)
  })

  it('funciona com exatamente 400 docs (1 commit)', async () => {
    mockRemovedUsersDocs = Array.from({ length: 400 }, (_, i) => ({
      id: `uid-${i}`,
      schoolId: 'sch-1',
    }))

    const result = await callBackfill()

    expect(result).toMatchObject({ processed: 400, errors: 0 })
    // Exatamente 400 → 1 commit no loop, 0 final
    expect(commitCount).toBe(1)
  })
})

// ── Cenário 7: erros em commit não abortam ────────────────────────────────────

describe('Cenário 7 — tolerância a falhas de commit', () => {
  it('incrementa errors quando um commit intermediário falha', async () => {
    // 850 docs → 3 commits. Falhar o 1º para ver errors = 1.
    mockRemovedUsersDocs = Array.from({ length: 850 }, (_, i) => ({
      id: `uid-${i}`,
      schoolId: 'sch-1',
    }))
    failCommitOnIndex = 1

    const result = await callBackfill()

    expect(result).toMatchObject({ ok: true, errors: 1 })
    // processed mede ops adicionadas, não as confirmadas
    expect((result as { processed: number }).processed).toBe(850)
  })
})

// ── Cenário 8: nenhum doc — retorno vazio ────────────────────────────────────

describe('Cenário 8 — collectionGroup vazio', () => {
  it('retorna processed=0 sem chamar batch.commit', async () => {
    mockRemovedUsersDocs = []

    const result = await callBackfill()

    expect(result).toMatchObject({
      ok: true,
      processed: 0,
      skipped: 0,
      errors: 0,
    })
    expect(commitCount).toBe(0)
    expect(batchCalls).toHaveLength(0)
  })
})
