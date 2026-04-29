import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, col, id) => ({ _path: `${col}/${id}` })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  collection: vi.fn(),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
  updateDoc: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  getFirestore: vi.fn(() => ({ _mock: true })),
}))

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ _mock: true })),
}))

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ _mock: true })),
  GoogleAuthProvider: vi.fn(),
}))

vi.mock('firebase/functions', () => ({
  getFunctions:    vi.fn(() => ({ _mock: true })),
  httpsCallable:   vi.fn(() => vi.fn().mockResolvedValue({ data: {} })),
}))

vi.mock('../lib/firebase', () => ({
  db: { _mock: true },
  app: { _mock: true },
  auth: { _mock: true },
  provider: { _mock: true },
  functions: { _mock: true },
}))

vi.mock('../lib/helpers/ids', () => ({
  uid: vi.fn(() => 'mock-id-123'),
}))

vi.mock('../lib/firebase/multi-tenant', () => ({
  getSchoolCollectionRef: vi.fn((schoolId, sub) => ({ _path: `schools/${schoolId}/${sub}` })),
  getSchoolDocRef: vi.fn((schoolId, sub, id) => ({ _path: `schools/${schoolId}/${sub}/${id}` })),
  getSchoolConfigRef: vi.fn((schoolId) => ({ _path: `schools/${schoolId}/config/main` })),
  getSchoolRef: vi.fn((schoolId) => ({ _path: `schools/${schoolId}` })),
}))

import { getDoc, getDocs, collection } from 'firebase/firestore'
import { checkAccessRevoked } from '../lib/db/index.js'

const UID = 'user-1'

function makeSnap(data, exists = true) {
  return {
    exists: () => exists,
    data: () => data,
  }
}

// Helper: mock getDoc to return existence per schoolId based on a map.
// `markerMap[schoolId] === true` → snap.exists() is true.
function mockGetDocByMarker(markerMap = {}) {
  getDoc.mockImplementation(async (ref) => {
    // ref._path tem formato `schools/{schoolId}/removed_users/{uid}`
    const path = ref?._path || ''
    const parts = path.split('/')
    const schoolId = parts[1]
    const has = !!markerMap[schoolId]
    return { exists: () => has, data: () => (has ? {} : undefined) }
  })
}

describe('checkAccessRevoked — helper puro de I/O', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna não-revogado quando removedFrom vazio e nenhum marcador existe', async () => {
    mockGetDocByMarker({})
    const snap = makeSnap({ schools: { A: { role: 'teacher' } }, removedFrom: [] })
    const result = await checkAccessRevoked(UID, snap)
    expect(result).toEqual({ revoked: false, fullyRevoked: false, revokedSchoolIds: [] })
  })

  it('retorna fullyRevoked quando schools vazio e removedFrom = [A]', async () => {
    mockGetDocByMarker({})
    const snap = makeSnap({ schools: {}, removedFrom: ['A'] })
    const result = await checkAccessRevoked(UID, snap)
    expect(result.revoked).toBe(true)
    expect(result.fullyRevoked).toBe(true)
    expect(result.revokedSchoolIds).toEqual(['A'])
  })

  it('retorna parcialmente revogado quando user pertence a A e foi removido de B', async () => {
    mockGetDocByMarker({})
    const snap = makeSnap({ schools: { A: { role: 'teacher' } }, removedFrom: ['B'] })
    const result = await checkAccessRevoked(UID, snap)
    expect(result.revoked).toBe(true)
    expect(result.fullyRevoked).toBe(false)
    expect(result.revokedSchoolIds).toEqual(['B'])
  })

  it('detecta inconsistência: removedFrom vazio mas marcador removed_users presente em A', async () => {
    mockGetDocByMarker({ A: true })
    const snap = makeSnap({ schools: { A: { role: 'teacher' } }, removedFrom: [] })
    const result = await checkAccessRevoked(UID, snap)
    expect(result.revoked).toBe(true)
    expect(result.fullyRevoked).toBe(true) // toda escola tem marcador
    expect(result.revokedSchoolIds).toEqual(['A'])
  })

  it('retorna não-revogado quando userSnap é null', async () => {
    const result = await checkAccessRevoked(UID, null)
    expect(result).toEqual({ revoked: false, fullyRevoked: false, revokedSchoolIds: [] })
    expect(getDoc).not.toHaveBeenCalled()
  })

  it('retorna não-revogado quando userSnap.exists() é false', async () => {
    const snap = makeSnap(null, false)
    const result = await checkAccessRevoked(UID, snap)
    expect(result).toEqual({ revoked: false, fullyRevoked: false, revokedSchoolIds: [] })
    expect(getDoc).not.toHaveBeenCalled()
  })

  it('tolera erro de rede em leitura defensiva: removedFrom continua autoritativo', async () => {
    getDoc.mockImplementation(async () => {
      const err = new Error('network down')
      throw err
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const snap = makeSnap({ schools: { A: { role: 'teacher' } }, removedFrom: ['B'] })
    const result = await checkAccessRevoked(UID, snap)
    // Erro defensivo na escola A não derruba a função; B continua revogado via removedFrom
    expect(result.revoked).toBe(true)
    expect(result.fullyRevoked).toBe(false)
    expect(result.revokedSchoolIds).toEqual(['B'])
    warnSpy.mockRestore()
  })

  it('multi-escola: todas com marcador → fullyRevoked', async () => {
    mockGetDocByMarker({ A: true, B: true })
    const snap = makeSnap({ schools: { A: {}, B: {} }, removedFrom: [] })
    const result = await checkAccessRevoked(UID, snap)
    expect(result.revoked).toBe(true)
    expect(result.fullyRevoked).toBe(true)
    expect(result.revokedSchoolIds.sort()).toEqual(['A', 'B'])
  })

  it('deduplica revokedSchoolIds quando removedFrom e marcador apontam para mesma escola', async () => {
    mockGetDocByMarker({ A: true })
    const snap = makeSnap({ schools: {}, removedFrom: ['A'] })
    const result = await checkAccessRevoked(UID, snap)
    expect(result.revokedSchoolIds).toEqual(['A'])
  })

  it('retorna não-revogado para uid vazio', async () => {
    const snap = makeSnap({ schools: {}, removedFrom: ['A'] })
    const result = await checkAccessRevoked('', snap)
    expect(result).toEqual({ revoked: false, fullyRevoked: false, revokedSchoolIds: [] })
    expect(getDoc).not.toHaveBeenCalled()
  })

  it('é função pura: não invoca auth/localStorage/toast', async () => {
    // Garante que mocks de auth/firebase não foram chamados
    mockGetDocByMarker({})
    const snap = makeSnap({ schools: { A: {} }, removedFrom: [] })
    await checkAccessRevoked(UID, snap)
    // getDoc é o ÚNICO contato externo permitido
    expect(getDoc).toHaveBeenCalledTimes(1)
  })

  // ── Cenários canônicos da issue 482 ─────────────────────────────────────────
  // Blindagem regressiva contra reaparecimento de bugs em revogação legacy.
  describe('Issue 482 — cenários canônicos de revogação legacy', () => {
    it('Cenário 1 (regressão): schools={}, removedFrom=[A] → fullyRevoked=true, revokedSchoolIds=[A]', async () => {
      // Estado legado pós-removeTeacherFromSchool: índice invertido populado,
      // map schools já zerado. removedFrom é autoritativo — fallback NÃO deve
      // disparar (removedFrom != []).
      mockGetDocByMarker({})
      const snap = makeSnap({ schools: {}, removedFrom: ['A'] })

      const result = await checkAccessRevoked(UID, snap)

      expect(result).toEqual({
        revoked: true,
        fullyRevoked: true,
        revokedSchoolIds: ['A'],
      })
      // Como removedFrom já está populado, fallback não é necessário
      expect(getDocs).not.toHaveBeenCalled()
    })

    it('Cenário 2 (NOVO — fallback): schools={}, removedFrom=[], marcador em A → fullyRevoked=true', async () => {
      // Estado legacy mais profundo: usuário foi removido antes do deploy do
      // índice invertido. schools={} e removedFrom=[] mas marcador canônico
      // existe em alguma escola. Helper deve fazer fallback varrendo schools/.
      getDocs.mockResolvedValueOnce({
        docs: [{ id: 'A' }, { id: 'B' }],
      })
      // A tem marcador, B não
      mockGetDocByMarker({ A: true, B: false })

      const snap = makeSnap({ schools: {}, removedFrom: [] })
      const result = await checkAccessRevoked(UID, snap)

      // Validação principal: fallback identificou marcador órfão em A
      expect(result.revoked).toBe(true)
      expect(result.fullyRevoked).toBe(true)
      expect(result.revokedSchoolIds).toEqual(['A'])

      // Validação de comportamento: fallback foi efetivamente disparado
      expect(getDocs).toHaveBeenCalledTimes(1)
      expect(collection).toHaveBeenCalledWith(expect.anything(), 'schools')
      // getDoc foi chamado uma vez por escola candidata (A e B)
      expect(getDoc).toHaveBeenCalledTimes(2)
    })

    it('Cenário 2 (variante): fail-soft individual — uma escola lança erro, outra retorna marcador', async () => {
      // Erro defensivo em uma escola NÃO derruba o helper; outras escolas
      // continuam sendo verificadas e revogação parcial é detectada.
      getDocs.mockResolvedValueOnce({
        docs: [{ id: 'A' }, { id: 'B' }],
      })
      getDoc.mockImplementation(async (ref) => {
        const path = ref?._path || ''
        if (path.includes('schools/A/')) {
          throw new Error('permission-denied em A')
        }
        // B retorna marcador
        return { exists: () => true, data: () => ({}) }
      })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const snap = makeSnap({ schools: {}, removedFrom: [] })
      const result = await checkAccessRevoked(UID, snap)

      expect(result.revoked).toBe(true)
      expect(result.fullyRevoked).toBe(true)
      expect(result.revokedSchoolIds).toEqual(['B'])
      warnSpy.mockRestore()
    })

    it('Cenário 2 (variante): fallback sem marcador em qualquer escola → não-revogado', async () => {
      // Saneamento: usuário legacy com schools={} mas SEM marcador em
      // qualquer escola. Helper retorna empty (não-revogado), deixando a
      // heurística do bootSequence assumir o controle (Cenário 3).
      getDocs.mockResolvedValueOnce({
        docs: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      })
      mockGetDocByMarker({}) // nenhum marcador

      const snap = makeSnap({ schools: {}, removedFrom: [] })
      const result = await checkAccessRevoked(UID, snap)

      expect(result).toEqual({
        revoked: false,
        fullyRevoked: false,
        revokedSchoolIds: [],
      })
      // Fallback foi disparado mesmo sem detectar marcador
      expect(getDocs).toHaveBeenCalledTimes(1)
    })

    it('Cenário 2 (variante): knownSchoolIds suprime fallback getDocs(schools)', async () => {
      // Quando o caller fornece hints (ex.: cache), o helper NÃO deve gastar
      // um round-trip varrendo schools/. Itera apenas os IDs conhecidos.
      mockGetDocByMarker({ A: true })

      const snap = makeSnap({ schools: {}, removedFrom: [] })
      const result = await checkAccessRevoked(UID, snap, ['A', 'B'])

      expect(result.revoked).toBe(true)
      expect(result.fullyRevoked).toBe(true)
      expect(result.revokedSchoolIds).toEqual(['A'])
      // Fallback NÃO foi chamado — knownSchoolIds tomou precedência
      expect(getDocs).not.toHaveBeenCalled()
      // Mas getDoc foi chamado uma vez por knownSchoolId
      expect(getDoc).toHaveBeenCalledTimes(2)
    })

    it('Cenário 2 (fail-soft global): getDocs(schools) lança erro → não-revogado', async () => {
      // Se a varredura inteira de schools/ falhar (offline, rules), o helper
      // não deve crashar. Retorna empty para não bloquear usuários legítimos
      // por erro transitório.
      getDocs.mockRejectedValueOnce(new Error('network down'))
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const snap = makeSnap({ schools: {}, removedFrom: [] })
      const result = await checkAccessRevoked(UID, snap)

      expect(result).toEqual({
        revoked: false,
        fullyRevoked: false,
        revokedSchoolIds: [],
      })
      warnSpy.mockRestore()
    })
  })
})
