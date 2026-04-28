// src/__tests__/useAuthStore.multitenant.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks de módulo (elevados pelo Vitest antes dos imports) ─────────────────

vi.mock('firebase/firestore', () => ({
  doc:             vi.fn((db, ...segs) => ({ _path: segs.join('/') })),
  getDoc:          vi.fn(),
  setDoc:          vi.fn().mockResolvedValue(undefined),
  collection:      vi.fn((db, ...segs) => ({ _path: segs.join('/') })),
  query:           vi.fn(ref => ref),
  where:           vi.fn(),
  onSnapshot:      vi.fn(() => vi.fn()),   // retorna unsub no-op
  serverTimestamp: vi.fn(() => new Date()),
  getDocs:         vi.fn(),
  updateDoc:       vi.fn(),
  deleteDoc:       vi.fn(),
  writeBatch:      vi.fn(),
  orderBy:         vi.fn(),
  limit:           vi.fn(),
  getFirestore:    vi.fn(() => ({ _mock: true })),
}))

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ _mock: true })),
}))

vi.mock('firebase/auth', () => ({
  getAuth:             vi.fn(() => ({ _mock: true })),
  GoogleAuthProvider:  vi.fn(),
  signInWithPopup:     vi.fn(),
  signOut:             vi.fn(),
  onAuthStateChanged:  vi.fn(),
}))

// Singletons Firebase
vi.mock('../lib/firebase', () => ({
  db:       { _mock: true },
  app:      { _mock: true },
  auth:     { _mock: true },
  provider: { _mock: true },
}))

// Multi-tenant refs
vi.mock('../lib/firebase/multi-tenant', () => ({
  getSchoolCollectionRef: vi.fn((schoolId, sub) => ({ _path: `schools/${schoolId}/${sub}` })),
  getSchoolDocRef:        vi.fn((schoolId, sub, id) => ({ _path: `schools/${schoolId}/${sub}/${id}` })),
  getSchoolConfigRef:     vi.fn((schoolId) => ({ _path: `schools/${schoolId}/config/main` })),
  getSchoolRef:           vi.fn((schoolId) => ({ _path: `schools/${schoolId}` })),
}))

// useSchoolStore — controla currentSchoolId via mockSchoolId
let mockSchoolId = 'sch-test'
// Listeners registrados via subscribe — testes podem dispará-los manualmente
const schoolSubscribers = new Set()
vi.mock('../store/useSchoolStore', () => ({
  default: {
    getState: vi.fn(() => ({ currentSchoolId: mockSchoolId, init: vi.fn() })),
    subscribe: vi.fn((listener) => {
      schoolSubscribers.add(listener)
      return () => schoolSubscribers.delete(listener)
    }),
  },
}))

// useAppStore — necessário para logout e listeners
vi.mock('../store/useAppStore', () => ({
  default: {
    getState: vi.fn(() => ({ cleanupLazyListeners: vi.fn() })),
  },
}))

// ─── Imports pós-mock ─────────────────────────────────────────────────────────
import { getDoc, getDocs, setDoc, onSnapshot } from 'firebase/firestore'
import useSchoolStore from '../store/useSchoolStore'
import useAuthStore from '../store/useAuthStore'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCHOOL_ID = 'sch-test'

/**
 * Constrói o mock de getDoc a partir de um mapa path → dados.
 * Retorna { exists: () => true, data: () => dados } para caminhos conhecidos,
 * e { exists: () => false } para os demais.
 */
function buildGetDocMock(pathMap) {
  return vi.fn(ref => {
    const path = ref._path
    if (path in pathMap) {
      const data = pathMap[path]
      return Promise.resolve({ exists: () => true, data: () => data })
    }
    return Promise.resolve({ exists: () => false })
  })
}

/**
 * Reseta o store para o estado inicial antes de cada teste.
 * useAuthStore é um singleton Zustand — precisamos limpar o estado manualmente.
 */
function resetStore() {
  useAuthStore.setState({
    user: null, role: null, teacher: null,
    loading: true, pendingCt: 0,
    _unsubPending: null, _unsubApproval: null, _unsubSchoolSub: null,
  })
  schoolSubscribers.clear()
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('useAuthStore._resolveRole — estrutura users/{uid}.schools', () => {
  const mockUser = { uid: 'uid-abc', email: 'user@test.com', displayName: 'Test User', photoURL: '' }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSchoolId = SCHOOL_ID
    useSchoolStore.getState.mockReturnValue({ currentSchoolId: mockSchoolId, init: vi.fn() })
    onSnapshot.mockReturnValue(vi.fn()) // unsub no-op
    resetStore()
  })

  it('schools vazio (sem entrada para schoolId) → role pending + requestTeacherAccess chamado', async () => {
    // users/uid-abc existe mas sem entrada para sch-test
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-abc': { schools: {} },
      // admins/user@test.com não existe → isAdmin retorna false
    }))
    setDoc.mockResolvedValue(undefined)

    await useAuthStore.getState()._resolveRole(mockUser)

    expect(useAuthStore.getState().role).toBe('pending')
    // requestTeacherAccess chama setDoc para criar o doc pending_teachers
    expect(setDoc).toHaveBeenCalled()
  })

  it('schools[schoolId].role = "teacher" → role teacher', async () => {
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-abc': { schools: { [SCHOOL_ID]: { role: 'teacher' } } },
    }))

    await useAuthStore.getState()._resolveRole(mockUser)

    expect(useAuthStore.getState().role).toBe('teacher')
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('schools[schoolId].role = "coordinator" → role coordinator', async () => {
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-abc': { schools: { [SCHOOL_ID]: { role: 'coordinator' } } },
    }))

    await useAuthStore.getState()._resolveRole(mockUser)

    expect(useAuthStore.getState().role).toBe('coordinator')
  })

  it('schools[schoolId].role = "admin" → role admin + onSnapshot iniciado', async () => {
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-abc': { schools: { [SCHOOL_ID]: { role: 'admin' } } },
    }))

    await useAuthStore.getState()._resolveRole(mockUser)

    expect(useAuthStore.getState().role).toBe('admin')
    expect(onSnapshot).toHaveBeenCalledTimes(1)
  })

  it('schools[schoolId] sem role (status pending) → role pending', async () => {
    // Entry existe mas role é null — representa status 'pending' sem role atribuído
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-abc': { schools: { [SCHOOL_ID]: { status: 'pending', role: null } } },
    }))
    setDoc.mockResolvedValue(undefined)

    await useAuthStore.getState()._resolveRole(mockUser)

    expect(useAuthStore.getState().role).toBe('pending')
  })

  it('teacher com teacherDocId presente → teacher populado via getDoc sem query por e-mail', async () => {
    const teacherData = { id: 'tdoc-1', name: 'Prof Ana', email: 'user@test.com' }
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-abc': {
        schools: { [SCHOOL_ID]: { role: 'teacher', teacherDocId: 'tdoc-1' } },
      },
      [`schools/${SCHOOL_ID}/teachers/tdoc-1`]: teacherData,
    }))
    getDocs.mockResolvedValue({ empty: true, docs: [] })

    await useAuthStore.getState()._resolveRole(mockUser)

    expect(useAuthStore.getState().role).toBe('teacher')
    expect(useAuthStore.getState().teacher).toEqual(teacherData)
    // getDocs não deve ser chamado quando teacherDocId está presente e o doc existe
    expect(getDocs).not.toHaveBeenCalled()
  })

  it('teacher com teacherDocId mas doc inexistente → fallback por e-mail popula teacher', async () => {
    const teacherData = { id: 'tdoc-2', name: 'Prof Beto', email: 'user@test.com' }
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-abc': {
        schools: { [SCHOOL_ID]: { role: 'teacher', teacherDocId: 'tdoc-deletado' } },
      },
      // schools/sch-test/teachers/tdoc-deletado não existe → buildGetDocMock retorna exists: false
    }))
    getDocs.mockResolvedValue({ empty: false, docs: [{ data: () => teacherData }] })

    await useAuthStore.getState()._resolveRole(mockUser)

    expect(useAuthStore.getState().role).toBe('teacher')
    expect(useAuthStore.getState().teacher).toEqual(teacherData)
    expect(getDocs).toHaveBeenCalledTimes(1)
  })

  it('teacher sem teacherDocId (dados legados) → fallback por e-mail popula teacher', async () => {
    const teacherData = { id: 'tdoc-3', name: 'Prof Carla', email: 'user@test.com' }
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-abc': {
        schools: { [SCHOOL_ID]: { role: 'teacher' } }, // sem teacherDocId
      },
    }))
    getDocs.mockResolvedValue({ empty: false, docs: [{ data: () => teacherData }] })

    await useAuthStore.getState()._resolveRole(mockUser)

    expect(useAuthStore.getState().role).toBe('teacher')
    expect(useAuthStore.getState().teacher).toEqual(teacherData)
    expect(getDocs).toHaveBeenCalledTimes(1)
  })

  it('role admin → teacher permanece null (RN-4)', async () => {
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-abc': {
        schools: { [SCHOOL_ID]: { role: 'admin' } },
      },
    }))

    await useAuthStore.getState()._resolveRole(mockUser)

    expect(useAuthStore.getState().role).toBe('admin')
    expect(useAuthStore.getState().teacher).toBeNull()
    expect(getDocs).not.toHaveBeenCalled()
  })

  it('super-admin (email em admins/) → role admin mesmo sem entrada em schools', async () => {
    // users/uid-abc existe mas sem entrada para sch-test
    // admins/user@test.com existe → isAdmin retorna true
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-abc': { schools: {} },
      'admins/user@test.com': { email: 'user@test.com', name: 'Admin' },
    }))

    await useAuthStore.getState()._resolveRole(mockUser)

    expect(useAuthStore.getState().role).toBe('admin')
    // requestTeacherAccess NÃO deve ser chamado para super-admin
    expect(setDoc).not.toHaveBeenCalled()
  })
})

describe('useAuthStore — subscribe a useSchoolStore.currentSchoolId', () => {
  const mockUser = { uid: 'uid-abc', email: 'user@test.com', displayName: 'Test User', photoURL: '' }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSchoolId = SCHOOL_ID
    useSchoolStore.getState.mockReturnValue({ currentSchoolId: mockSchoolId, init: vi.fn() })
    onSnapshot.mockReturnValue(vi.fn())
    resetStore()
  })

  it('init() registra subscribe em useSchoolStore e grava _unsubSchoolSub', async () => {
    // onAuthStateChanged dispara imediatamente sem user para finalizar a Promise
    const { onAuthStateChanged } = await import('firebase/auth')
    onAuthStateChanged.mockImplementation((auth, cb) => { cb(null) })

    await useAuthStore.getState().init()

    expect(useSchoolStore.subscribe).toHaveBeenCalledTimes(1)
    expect(typeof useAuthStore.getState()._unsubSchoolSub).toBe('function')
    expect(schoolSubscribers.size).toBe(1)
  })

  it('mudança de currentSchoolId com user autenticado dispara _resolveRole', async () => {
    const { onAuthStateChanged } = await import('firebase/auth')
    onAuthStateChanged.mockImplementation((auth, cb) => { cb(null) })
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-abc': { schools: { 'sch-novo': { role: 'teacher' } } },
    }))

    await useAuthStore.getState().init()
    // Simular login posterior
    useAuthStore.setState({ user: mockUser })

    // Trocar schoolId e disparar listeners
    mockSchoolId = 'sch-novo'
    useSchoolStore.getState.mockReturnValue({ currentSchoolId: 'sch-novo', init: vi.fn() })
    const listener = [...schoolSubscribers][0]
    await listener({ currentSchoolId: 'sch-novo' }, { currentSchoolId: null })

    expect(useAuthStore.getState().role).toBe('teacher')
  })

  it('mudança para mesmo schoolId não dispara _resolveRole (no-op)', async () => {
    const { onAuthStateChanged } = await import('firebase/auth')
    onAuthStateChanged.mockImplementation((auth, cb) => { cb(null) })
    getDoc.mockClear()

    await useAuthStore.getState().init()
    useAuthStore.setState({ user: mockUser })

    const listener = [...schoolSubscribers][0]
    await listener({ currentSchoolId: SCHOOL_ID }, { currentSchoolId: SCHOOL_ID })

    // Nenhum getDoc deveria ter sido chamado pois o listener saiu cedo
    expect(getDoc).not.toHaveBeenCalled()
  })

  it('mudança de currentSchoolId sem user autenticado não dispara _resolveRole', async () => {
    const { onAuthStateChanged } = await import('firebase/auth')
    onAuthStateChanged.mockImplementation((auth, cb) => { cb(null) })
    getDoc.mockClear()

    await useAuthStore.getState().init()
    // user permanece null

    const listener = [...schoolSubscribers][0]
    await listener({ currentSchoolId: 'sch-novo' }, { currentSchoolId: null })

    expect(getDoc).not.toHaveBeenCalled()
  })

  it('logout cancela _unsubSchoolSub e remove listener', async () => {
    const { onAuthStateChanged, signOut } = await import('firebase/auth')
    onAuthStateChanged.mockImplementation((auth, cb) => { cb(null) })
    signOut.mockResolvedValue(undefined)

    await useAuthStore.getState().init()
    expect(schoolSubscribers.size).toBe(1)

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState()._unsubSchoolSub).toBeNull()
    expect(schoolSubscribers.size).toBe(0)
  })
})

describe('approvalListener — popula teacher após aprovação', () => {
  const mockUser = { uid: 'uid-abc', email: 'user@test.com', displayName: 'Test User', photoURL: '' }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSchoolId = SCHOOL_ID
    useSchoolStore.getState.mockReturnValue({ currentSchoolId: mockSchoolId, init: vi.fn() })
    resetStore()
  })

  /**
   * Helper: coloca o store em estado 'pending' e captura o callback do onSnapshot
   * do approvalListener para que o teste possa disparar a aprovação manualmente.
   */
  async function setupPendingAndCaptureListener(getDocMockForResolve) {
    // Primeira chamada de getDoc (users/{uid}) retorna sem role → fluxo pending
    getDoc.mockImplementation(getDocMockForResolve)
    setDoc.mockResolvedValue(undefined)

    let capturedCallback = null
    onSnapshot.mockImplementation((_ref, cb) => {
      capturedCallback = cb
      return vi.fn() // unsub
    })

    await useAuthStore.getState()._resolveRole(mockUser)
    expect(useAuthStore.getState().role).toBe('pending')
    return capturedCallback
  }

  it('aprovação com teacherDocId presente → teacher populado via getDoc (sem getDocs)', async () => {
    const teacherData = { id: 'tdoc-ok', name: 'Prof Aprovado', email: 'user@test.com' }

    // Primeira chamada: users/{uid} sem role → pending
    // Segunda chamada (pós-aprovação): users/{uid} com status approved + teacherDocId
    // Terceira chamada: schools/{schoolId}/teachers/tdoc-ok
    let callCount = 0
    getDoc.mockImplementation(ref => {
      const path = ref._path
      if (path === 'users/uid-abc') {
        callCount++
        if (callCount === 1) return Promise.resolve({ exists: () => true, data: () => ({ schools: {} }) })
        return Promise.resolve({ exists: () => true, data: () => ({
          schools: { [SCHOOL_ID]: { role: 'teacher', status: 'approved', teacherDocId: 'tdoc-ok' } },
        }) })
      }
      if (path === `schools/${SCHOOL_ID}/teachers/tdoc-ok`) {
        return Promise.resolve({ exists: () => true, data: () => teacherData })
      }
      return Promise.resolve({ exists: () => false })
    })
    setDoc.mockResolvedValue(undefined)
    getDocs.mockResolvedValue({ empty: true, docs: [] })

    let snapshotCb = null
    onSnapshot.mockImplementation((_ref, cb) => {
      snapshotCb = cb
      return vi.fn()
    })

    await useAuthStore.getState()._resolveRole(mockUser)
    expect(useAuthStore.getState().role).toBe('pending')

    // Simula remoção do doc pending_teachers (aprovação)
    await snapshotCb({ exists: () => false })

    expect(useAuthStore.getState().role).toBe('teacher')
    expect(useAuthStore.getState().teacher).toEqual(teacherData)
    // approvalListener usa getDoc direto (teacherDocId presente e doc existe), sem getDocs.
    expect(getDocs).toHaveBeenCalledTimes(0)
  })

  it('aprovação sem teacherDocId → fallback por e-mail popula teacher', async () => {
    const teacherData = { id: 'tdoc-fallback', name: 'Prof Sem Id', email: 'user@test.com' }

    let callCount = 0
    getDoc.mockImplementation(ref => {
      const path = ref._path
      if (path === 'users/uid-abc') {
        callCount++
        if (callCount === 1) return Promise.resolve({ exists: () => true, data: () => ({ schools: {} }) })
        return Promise.resolve({ exists: () => true, data: () => ({
          schools: { [SCHOOL_ID]: { role: 'teacher', status: 'approved' } }, // sem teacherDocId
        }) })
      }
      return Promise.resolve({ exists: () => false })
    })
    setDoc.mockResolvedValue(undefined)
    getDocs.mockResolvedValue({ empty: false, docs: [{ data: () => teacherData }] })

    let snapshotCb = null
    onSnapshot.mockImplementation((_ref, cb) => {
      snapshotCb = cb
      return vi.fn()
    })

    await useAuthStore.getState()._resolveRole(mockUser)
    expect(useAuthStore.getState().role).toBe('pending')

    await snapshotCb({ exists: () => false })

    expect(useAuthStore.getState().role).toBe('teacher')
    expect(useAuthStore.getState().teacher).toEqual(teacherData)
    // approvalListener: sem teacherDocId → fallback por e-mail chama getDocs uma vez.
    expect(getDocs).toHaveBeenCalledTimes(1)
  })

  it('teacherDocId presente mas doc inexistente → fallback por e-mail', async () => {
    const teacherData = { id: 'tdoc-real', name: 'Prof Real', email: 'user@test.com' }

    let callCount = 0
    getDoc.mockImplementation(ref => {
      const path = ref._path
      if (path === 'users/uid-abc') {
        callCount++
        if (callCount === 1) return Promise.resolve({ exists: () => true, data: () => ({ schools: {} }) })
        return Promise.resolve({ exists: () => true, data: () => ({
          schools: { [SCHOOL_ID]: { role: 'teacher', status: 'approved', teacherDocId: 'tdoc-deletado' } },
        }) })
      }
      // tdoc-deletado não existe
      if (path === `schools/${SCHOOL_ID}/teachers/tdoc-deletado`) {
        return Promise.resolve({ exists: () => false })
      }
      return Promise.resolve({ exists: () => false })
    })
    setDoc.mockResolvedValue(undefined)
    getDocs.mockResolvedValue({ empty: false, docs: [{ data: () => teacherData }] })

    let snapshotCb = null
    onSnapshot.mockImplementation((_ref, cb) => {
      snapshotCb = cb
      return vi.fn()
    })

    await useAuthStore.getState()._resolveRole(mockUser)
    expect(useAuthStore.getState().role).toBe('pending')

    await snapshotCb({ exists: () => false })

    expect(useAuthStore.getState().role).toBe('teacher')
    expect(useAuthStore.getState().teacher).toEqual(teacherData)
    // approvalListener: teacherDocId presente mas doc inexistente → fallback por e-mail chama getDocs uma vez.
    expect(getDocs).toHaveBeenCalledTimes(1)
  })

  it('newStatus === "rejected" → signOut chamado, teacher permanece null', async () => {
    const { signOut } = await import('firebase/auth')
    signOut.mockResolvedValue(undefined)

    let callCount = 0
    getDoc.mockImplementation(ref => {
      const path = ref._path
      if (path === 'users/uid-abc') {
        callCount++
        if (callCount === 1) return Promise.resolve({ exists: () => true, data: () => ({ schools: {} }) })
        return Promise.resolve({ exists: () => true, data: () => ({
          schools: { [SCHOOL_ID]: { role: 'rejected', status: 'rejected' } },
        }) })
      }
      return Promise.resolve({ exists: () => false })
    })
    setDoc.mockResolvedValue(undefined)

    let snapshotCb = null
    onSnapshot.mockImplementation((_ref, cb) => {
      snapshotCb = cb
      return vi.fn()
    })

    await useAuthStore.getState()._resolveRole(mockUser)
    expect(useAuthStore.getState().role).toBe('pending')

    await snapshotCb({ exists: () => false })

    expect(signOut).toHaveBeenCalled()
    expect(useAuthStore.getState().teacher).toBeNull()
  })
})

describe('useAuthStore.isAdmin()', () => {
  beforeEach(() => resetStore())

  it('retorna true quando role é "admin"', () => {
    useAuthStore.setState({ role: 'admin' })
    expect(useAuthStore.getState().isAdmin()).toBe(true)
  })

  it('retorna false quando role é "teacher"', () => {
    useAuthStore.setState({ role: 'teacher' })
    expect(useAuthStore.getState().isAdmin()).toBe(false)
  })

  it('retorna false quando role é null', () => {
    useAuthStore.setState({ role: null })
    expect(useAuthStore.getState().isAdmin()).toBe(false)
  })
})
