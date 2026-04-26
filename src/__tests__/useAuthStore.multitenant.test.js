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
vi.mock('../store/useSchoolStore', () => ({
  default: {
    getState: vi.fn(() => ({ currentSchoolId: mockSchoolId, init: vi.fn() })),
  },
}))

// useAppStore — necessário para logout e listeners
vi.mock('../store/useAppStore', () => ({
  default: {
    getState: vi.fn(() => ({ cleanupLazyListeners: vi.fn() })),
  },
}))

// ─── Imports pós-mock ─────────────────────────────────────────────────────────
import { getDoc, setDoc, onSnapshot } from 'firebase/firestore'
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
    _unsubPending: null, _unsubApproval: null,
  })
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
