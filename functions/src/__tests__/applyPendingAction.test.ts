/**
 * Testes unitários para applyPendingAction (index.ts).
 *
 * Estratégia: mockar firebase-admin e firebase-functions/v1 inteiramente
 * para extrair o handler registrado via onCall e chamá-lo diretamente,
 * sem emulator nem inicialização real do SDK.
 *
 * Ordem de registro em index.ts (0-based):
 *   0  = createAbsence
 *   1  = updateAbsence
 *   2  = deleteAbsence
 *   3  = approveTeacher
 *   4  = rejectTeacher
 *   5  = reinstateRemovedUser
 *   6  = setTeacherRoleInSchool
 *   7  = designateSchoolAdmin
 *   8  = joinSchoolAsAdmin
 *   9  = removeTeacherFromSchool
 *   10 = applyPendingAction
 *
 * Behaviors cobertos (conforme issue #472):
 *   1. pendingActionId ausente → invalid-argument
 *   2. pendingDoc.exists === false → not-found
 *   3. pendingData.status === "approved" → failed-precondition (idempotência)
 *   4. pendingData.status === "rejected" → failed-precondition (idempotência)
 *   5. approved === true + actionType válido → chama handler(db, payload) uma vez
 *   6. approved === true + actionType inválido → invalid-argument
 *   7. approved === false → nenhum handler chamado
 *   8. audit log gravado com campos corretos (actionType, actorEmail, pendingActionId, payload, approved, rejectionReason)
 *   9. pending_action atualizado com { status, reviewedBy, reviewedAt, rejectionReason }
 *  10. rejectionReason: null (não undefined) quando ausente no input
 *  11. retorna { ok: true }
 *  12. caminhos multi-tenant com schoolId → schools/{schoolId}/pending_actions e schools/{schoolId}/admin_actions
 */

// ── Constantes ────────────────────────────────────────────────────────────────

const SCHOOL_ID = 'sch-test-472'
const PENDING_ACTION_ID = 'pending-action-doc-abc'
const ACTOR_EMAIL = 'admin@escola.example.com'
const ACTOR_UID = 'uid-admin-caller'

// ── Estado mutável dos mocks ──────────────────────────────────────────────────

// Controla se o pendingDoc existe
let mockPendingDocExists: boolean
// Controla os dados do pendingDoc
let mockPendingDocData: Record<string, unknown>

// Captura chamadas de escrita nos docs
let mockDocSet: jest.Mock
let mockDocUpdate: jest.Mock

// Captura das coleções acessadas (para validar caminhos multi-tenant)
let capturedCollectionPaths: string[]

// Handler mockado do ACTION_MAP — substituível por cenário
let mockActionHandler: jest.Mock

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
//
// O ACTION_MAP é controlável por teste via `mockActionHandler`, que é
// substituído em beforeEach. A chave 'knownAction' mapeia para o handler.

jest.mock('../actions', () => {
  // Precisamos de uma referência mutável que os testes possam trocar.
  // A factory do mock é executada uma vez; ACTION_MAP é re-avaliado em
  // cada acesso porque o getter delega ao módulo de teste via closure.
  return {
    get ACTION_MAP() {
      // Importado em tempo de execução para pegar o valor atual da closure
      // do módulo de teste — não dá para usar variáveis do escopo externo
      // diretamente aqui, mas o getter é reavaliado a cada chamada.
      // A solução é exportar um objeto que o teste pode mutate in-place.
      return require('../actions').__mutableMap
    },
    __mutableMap: {} as Record<string, unknown>,
  }
})

// ── Mock: firebase-admin ──────────────────────────────────────────────────────
//
// Cadeia usada por applyPendingAction:
//
//   db.collection(pendingActionsPath(schoolId)).doc(pendingActionId).get()
//   db.collection(adminActionsPath(schoolId)).doc(adminActionId).set(auditLog)
//   db.collection(pendingActionsPath(schoolId)).doc(pendingActionId).update(reviewResult)

jest.mock('firebase-admin', () => {
  const firestoreMock = () => {
    const collectionFn = (collPath: string) => {
      capturedCollectionPaths.push(collPath)
      return {
        doc: (_docId: string) => ({
          _path: `${collPath}/${_docId}`,
          get: jest.fn(async () => {
            if (collPath.includes('pending_actions')) {
              return {
                exists: mockPendingDocExists,
                data: () => mockPendingDocData,
              }
            }
            return { exists: false, data: () => ({}) }
          }),
          set: mockDocSet,
          update: mockDocUpdate,
          delete: jest.fn().mockResolvedValue(undefined),
        }),
        where: (_field: string, _op: string, _val: unknown) => ({
          limit: (_n: number) => ({
            get: jest.fn(async () => ({ empty: true, docs: [] })),
          }),
          get: jest.fn(async () => ({ empty: true, docs: [] })),
        }),
      }
    }

    const docFn = (path: string) => ({
      _path: path,
      get: jest.fn(async () => ({ exists: false })),
      set: mockDocSet,
      update: mockDocUpdate,
      delete: jest.fn().mockResolvedValue(undefined),
    })

    const batchFn = () => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    })

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

import '../index'

const APPLY_PENDING_ACTION_INDEX = 10  // 0-based

function getHandler(): Handler {
  const handler = registeredHandlers[APPLY_PENDING_ACTION_INDEX]
  if (!handler) {
    throw new Error(`Handler no índice ${APPLY_PENDING_ACTION_INDEX} não capturado`)
  }
  return handler
}

// ── Context de chamada ────────────────────────────────────────────────────────

function makeContext(email = ACTOR_EMAIL, uid = ACTOR_UID) {
  return {
    auth: {
      uid,
      token: { email },
    },
  }
}

async function callApplyPendingAction(
  data: Record<string, unknown>,
  context = makeContext()
) {
  return getHandler()(data, context)
}

// ── Setup por teste ───────────────────────────────────────────────────────────

beforeEach(() => {
  capturedCollectionPaths = []

  mockDocSet = jest.fn().mockResolvedValue(undefined)
  mockDocUpdate = jest.fn().mockResolvedValue(undefined)

  // Por padrão: pendingDoc existe com status "pending" e actionType "knownAction"
  mockPendingDocExists = true
  mockPendingDocData = {
    action: 'knownAction',
    payload: { key: 'value' },
    status: 'pending',
  }

  // Handler padrão do ACTION_MAP — não lança, resolve undefined
  mockActionHandler = jest.fn().mockResolvedValue(undefined)

  // Popula o mutableMap usado pelo mock de ./actions
  const actions = jest.requireMock('../actions') as {
    __mutableMap: Record<string, unknown>
  }
  actions.__mutableMap = { knownAction: mockActionHandler }

  // Restaurar verifyAdmin para sucesso por padrão
  ;(jest.requireMock('../auth') as { verifyAdmin: jest.Mock })
    .verifyAdmin
    .mockResolvedValue(undefined)
})

// ═════════════════════════════════════════════════════════════════════════════
// 1. Validação de pendingActionId
// ═════════════════════════════════════════════════════════════════════════════

describe('validação de pendingActionId', () => {
  it('lança invalid-argument quando pendingActionId está ausente', async () => {
    await expect(
      callApplyPendingAction({ approved: true })
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: expect.stringContaining('pendingActionId'),
    })
  })

  it('lança invalid-argument quando pendingActionId é string vazia', async () => {
    await expect(
      callApplyPendingAction({ pendingActionId: '', approved: true })
    ).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('não grava nenhum doc quando pendingActionId é inválido', async () => {
    await callApplyPendingAction({ pendingActionId: '' }).catch(() => {})
    expect(mockDocSet).not.toHaveBeenCalled()
    expect(mockDocUpdate).not.toHaveBeenCalled()
  })

  it('não chama nenhum handler de ACTION_MAP quando pendingActionId é inválido', async () => {
    await callApplyPendingAction({ pendingActionId: '' }).catch(() => {})
    expect(mockActionHandler).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 2. pendingDoc não encontrado
// ═════════════════════════════════════════════════════════════════════════════

describe('pendingDoc não encontrado', () => {
  beforeEach(() => {
    mockPendingDocExists = false
  })

  it('lança not-found quando pendingDoc.exists é false', async () => {
    await expect(
      callApplyPendingAction({ pendingActionId: PENDING_ACTION_ID, approved: true })
    ).rejects.toMatchObject({ code: 'not-found' })
  })

  it('não grava audit log quando pendingDoc não existe', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    }).catch(() => {})
    expect(mockDocSet).not.toHaveBeenCalled()
  })

  it('não chama handler de ACTION_MAP quando pendingDoc não existe', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    }).catch(() => {})
    expect(mockActionHandler).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 3 e 4. Idempotência: status já "approved" ou "rejected"
// ═════════════════════════════════════════════════════════════════════════════

describe('idempotência — status já "approved"', () => {
  beforeEach(() => {
    mockPendingDocData = { action: 'knownAction', payload: {}, status: 'approved' }
  })

  it('lança failed-precondition quando status já é "approved"', async () => {
    await expect(
      callApplyPendingAction({ pendingActionId: PENDING_ACTION_ID, approved: true })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('processada'),
    })
  })

  it('não grava audit log quando ação já foi aprovada', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    }).catch(() => {})
    expect(mockDocSet).not.toHaveBeenCalled()
  })

  it('não chama handler quando ação já foi aprovada', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    }).catch(() => {})
    expect(mockActionHandler).not.toHaveBeenCalled()
  })
})

describe('idempotência — status já "rejected"', () => {
  beforeEach(() => {
    mockPendingDocData = { action: 'knownAction', payload: {}, status: 'rejected' }
  })

  it('lança failed-precondition quando status já é "rejected"', async () => {
    await expect(
      callApplyPendingAction({ pendingActionId: PENDING_ACTION_ID, approved: false })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('processada'),
    })
  })

  it('não grava audit log quando ação já foi rejeitada', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: false,
    }).catch(() => {})
    expect(mockDocSet).not.toHaveBeenCalled()
  })

  it('não chama handler quando ação já foi rejeitada', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: false,
    }).catch(() => {})
    expect(mockActionHandler).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 5. approved === true + actionType válido → handler chamado
// ═════════════════════════════════════════════════════════════════════════════

describe('approved true com actionType válido', () => {
  it('chama o handler do ACTION_MAP exatamente uma vez', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    })
    expect(mockActionHandler).toHaveBeenCalledTimes(1)
  })

  it('chama o handler com (db, payload) corretos', async () => {
    const payload = { key: 'value' }
    mockPendingDocData = { action: 'knownAction', payload, status: 'pending' }

    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    })

    const [firstArg, secondArg] = mockActionHandler.mock.calls[0]
    // Primeiro argumento é o db (objeto Firestore com collection e doc)
    expect(typeof firstArg.collection).toBe('function')
    // Segundo argumento é o payload do pendingDoc
    expect(secondArg).toEqual(payload)
  })

  it('retorna { ok: true } quando handler executa com sucesso', async () => {
    const result = await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    })
    expect(result).toEqual({ ok: true })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 6. approved === true + actionType inválido → invalid-argument
// ═════════════════════════════════════════════════════════════════════════════

describe('approved true com actionType inválido', () => {
  beforeEach(() => {
    mockPendingDocData = { action: 'unknownAction', payload: {}, status: 'pending' }
  })

  it('lança invalid-argument quando actionType não existe no ACTION_MAP', async () => {
    await expect(
      callApplyPendingAction({ pendingActionId: PENDING_ACTION_ID, approved: true })
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: expect.stringContaining('unknownAction'),
    })
  })

  it('não grava audit log quando actionType é inválido', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    }).catch(() => {})
    expect(mockDocSet).not.toHaveBeenCalled()
  })

  it('não atualiza pending_action quando actionType é inválido', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    }).catch(() => {})
    expect(mockDocUpdate).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 7. approved === false → nenhum handler chamado
// ═════════════════════════════════════════════════════════════════════════════

describe('approved false', () => {
  it('não chama nenhum handler do ACTION_MAP quando approved é false', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID,
      approved: false,
      rejectionReason: 'Motivo de rejeição',
    })
    expect(mockActionHandler).not.toHaveBeenCalled()
  })

  it('retorna { ok: true } mesmo sem chamar handler', async () => {
    const result = await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID,
      approved: false,
    })
    expect(result).toEqual({ ok: true })
  })

  it('grava o audit log mesmo quando approved é false', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID,
      approved: false,
    })
    expect(mockDocSet).toHaveBeenCalledTimes(1)
  })

  it('atualiza status para "rejected" na pending_action', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID,
      approved: false,
    })
    const updateArg = mockDocUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.status).toBe('rejected')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 8. Audit log gravado com campos corretos
// ═════════════════════════════════════════════════════════════════════════════

describe('audit log em admin_actions', () => {
  it('grava audit log com todos os campos obrigatórios', async () => {
    const payload = { targetId: 'teacher-xyz' }
    mockPendingDocData = { action: 'knownAction', payload, status: 'pending' }

    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID,
      approved: true,
    })

    const setArg = mockDocSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.actionType).toBe('knownAction')
    expect(setArg.actorEmail).toBe(ACTOR_EMAIL.toLowerCase())
    expect(setArg.pendingActionId).toBe(PENDING_ACTION_ID)
    expect(setArg.payload).toEqual(payload)
    expect(setArg.approved).toBe(true)
    expect(setArg).toHaveProperty('rejectionReason')
  })

  it('grava actorEmail em lowercase', async () => {
    await callApplyPendingAction(
      { pendingActionId: PENDING_ACTION_ID, approved: true },
      makeContext('Admin@Escola.Example.COM', ACTOR_UID)
    )
    const setArg = mockDocSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.actorEmail).toBe('admin@escola.example.com')
  })

  it('grava timestamp no audit log', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    })
    const setArg = mockDocSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.timestamp).toBe('__server_timestamp__')
  })

  it('grava approved: false no audit log quando rejeição', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID,
      approved: false,
      rejectionReason: 'Fora do prazo',
    })
    const setArg = mockDocSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.approved).toBe(false)
    expect(setArg.rejectionReason).toBe('Fora do prazo')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 9. Update da pending_action com campos corretos
// ═════════════════════════════════════════════════════════════════════════════

describe('update da pending_action', () => {
  it('atualiza status para "approved" quando approved é true', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    })
    const updateArg = mockDocUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.status).toBe('approved')
  })

  it('atualiza reviewedBy com o email do actor em lowercase', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    })
    const updateArg = mockDocUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.reviewedBy).toBe(ACTOR_EMAIL.toLowerCase())
  })

  it('atualiza reviewedAt com serverTimestamp', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    })
    const updateArg = mockDocUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.reviewedAt).toBe('__server_timestamp__')
  })

  it('chama update exatamente uma vez', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    })
    expect(mockDocUpdate).toHaveBeenCalledTimes(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 10. rejectionReason: null (não undefined) quando ausente
// ═════════════════════════════════════════════════════════════════════════════

describe('rejectionReason: null quando ausente', () => {
  it('grava rejectionReason: null (não undefined) no update da pending_action', async () => {
    // Sem campo rejectionReason no input
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    })
    const updateArg = mockDocUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.rejectionReason).toBeNull()
    expect(updateArg.rejectionReason).not.toBeUndefined()
  })

  it('grava rejectionReason: null no audit log quando ausente', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    })
    const setArg = mockDocSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.rejectionReason).toBeNull()
    expect(setArg.rejectionReason).not.toBeUndefined()
  })

  it('grava rejectionReason com o valor fornecido quando presente', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID,
      approved: false,
      rejectionReason: 'Dados inválidos',
    })
    const updateArg = mockDocUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.rejectionReason).toBe('Dados inválidos')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 11. Retorno { ok: true }
// ═════════════════════════════════════════════════════════════════════════════

describe('retorno { ok: true }', () => {
  it('retorna { ok: true } no caminho feliz com approved true', async () => {
    const result = await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: true,
    })
    expect(result).toEqual({ ok: true })
  })

  it('retorna { ok: true } no caminho feliz com approved false', async () => {
    const result = await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID, approved: false,
    })
    expect(result).toEqual({ ok: true })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 12. Caminhos multi-tenant corretos com schoolId
// ═════════════════════════════════════════════════════════════════════════════

describe('caminhos multi-tenant com schoolId', () => {
  it('acessa schools/{schoolId}/pending_actions para leitura do pendingDoc', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID,
      schoolId: SCHOOL_ID,
      approved: true,
    })
    expect(capturedCollectionPaths).toContain(`schools/${SCHOOL_ID}/pending_actions`)
  })

  it('acessa schools/{schoolId}/admin_actions para gravar o audit log', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID,
      schoolId: SCHOOL_ID,
      approved: true,
    })
    expect(capturedCollectionPaths).toContain(`schools/${SCHOOL_ID}/admin_actions`)
  })

  it('acessa schools/{schoolId}/pending_actions para o update de status', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID,
      schoolId: SCHOOL_ID,
      approved: true,
    })
    const pendingActionsPaths = capturedCollectionPaths.filter(
      (p) => p === `schools/${SCHOOL_ID}/pending_actions`
    )
    // Deve ter sido acessado ao menos duas vezes: get e update
    expect(pendingActionsPaths.length).toBeGreaterThanOrEqual(2)
  })

  it('usa coleção global "pending_actions" quando schoolId não é fornecido', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID,
      approved: true,
    })
    expect(capturedCollectionPaths).toContain('pending_actions')
    expect(capturedCollectionPaths).not.toContain(`schools/${SCHOOL_ID}/pending_actions`)
  })

  it('usa coleção global "admin_actions" quando schoolId não é fornecido', async () => {
    await callApplyPendingAction({
      pendingActionId: PENDING_ACTION_ID,
      approved: true,
    })
    expect(capturedCollectionPaths).toContain('admin_actions')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Propagação de erro de autorização
// ═════════════════════════════════════════════════════════════════════════════

describe('propagação de erro de autorização', () => {
  it('propaga erro de verifyAdmin sem executar nenhuma operação', async () => {
    const auth = jest.requireMock('../auth') as { verifyAdmin: jest.Mock }
    auth.verifyAdmin.mockRejectedValueOnce(
      new HttpsError('permission-denied', 'Não autorizado')
    )

    await expect(
      callApplyPendingAction({
        pendingActionId: PENDING_ACTION_ID, approved: true,
      })
    ).rejects.toMatchObject({ code: 'permission-denied' })

    expect(mockDocSet).not.toHaveBeenCalled()
    expect(mockDocUpdate).not.toHaveBeenCalled()
    expect(mockActionHandler).not.toHaveBeenCalled()
  })
})
