// src/__tests__/useAuthStore.isSaasAdmin.test.js
// Cobre o flag isSaasAdmin populado por _resolveRole a partir de SUPER_USERS
// (env) ou de leitura em /admins/{email_key}, e seu reset em logout.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks de módulo ──────────────────────────────────────────────────────────

vi.mock('firebase/firestore', () => ({
  doc:             vi.fn((db, ...segs) => ({ _path: segs.join('/') })),
  getDoc:          vi.fn(),
  setDoc:          vi.fn().mockResolvedValue(undefined),
  collection:      vi.fn((db, ...segs) => ({ _path: segs.join('/') })),
  query:           vi.fn(ref => ref),
  where:           vi.fn(),
  onSnapshot:      vi.fn(() => vi.fn()),
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
  signOut:             vi.fn().mockResolvedValue(undefined),
  onAuthStateChanged:  vi.fn(),
}))

vi.mock('../lib/firebase', () => ({
  db:       { _mock: true },
  app:      { _mock: true },
  auth:     { _mock: true },
  provider: { _mock: true },
}))

vi.mock('../lib/firebase/multi-tenant', () => ({
  getSchoolCollectionRef: vi.fn((schoolId, sub) => ({ _path: `schools/${schoolId}/${sub}` })),
  getSchoolDocRef:        vi.fn((schoolId, sub, id) => ({ _path: `schools/${schoolId}/${sub}/${id}` })),
  getSchoolConfigRef:     vi.fn((schoolId) => ({ _path: `schools/${schoolId}/config/main` })),
  getSchoolRef:           vi.fn((schoolId) => ({ _path: `schools/${schoolId}` })),
}))

let mockSchoolId = 'sch-test'
const schoolSubscribers = new Set()
const stopAllSchoolsListenerMock = vi.fn()
vi.mock('../store/useSchoolStore', () => ({
  default: {
    getState: vi.fn(() => ({
      currentSchoolId: mockSchoolId,
      init: vi.fn(),
      stopAllSchoolsListener: stopAllSchoolsListenerMock,
    })),
    subscribe: vi.fn((listener) => {
      schoolSubscribers.add(listener)
      return () => schoolSubscribers.delete(listener)
    }),
  },
}))

vi.mock('../store/useAppStore', () => ({
  default: {
    getState: vi.fn(() => ({ cleanupLazyListeners: vi.fn() })),
  },
}))

// SUPER_USERS é lido de import.meta.env.VITE_SUPER_ADMIN_EMAIL na carga do módulo.
// vi.hoisted garante que esta atribuição roda ANTES de qualquer import (que é
// hoisted pelo runtime), de modo que o módulo useAuthStore captura o valor.
vi.hoisted(() => {
  import.meta.env.VITE_SUPER_ADMIN_EMAIL = 'super@saas.com'
})

// ─── Imports pós-mock ─────────────────────────────────────────────────────────
import { getDoc, onSnapshot } from 'firebase/firestore'
import useAuthStore from '../store/useAuthStore'
import useSchoolStore from '../store/useSchoolStore'

const SCHOOL_ID = 'sch-test'

function buildGetDocMock(pathMap) {
  return vi.fn(ref => {
    const path = ref._path
    if (path in pathMap) {
      return Promise.resolve({ exists: () => true, data: () => pathMap[path] })
    }
    return Promise.resolve({ exists: () => false })
  })
}

function resetStore() {
  useAuthStore.setState({
    user: null, role: null, teacher: null,
    loading: true, pendingCt: 0, isSaasAdmin: false,
    _unsubPending: null, _unsubApproval: null, _unsubSchoolSub: null,
  })
  schoolSubscribers.clear()
}

describe('useAuthStore.isSaasAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSchoolId = SCHOOL_ID
    useSchoolStore.getState.mockReturnValue({
      currentSchoolId: mockSchoolId,
      init: vi.fn(),
      stopAllSchoolsListener: stopAllSchoolsListenerMock,
    })
    onSnapshot.mockReturnValue(vi.fn())
    resetStore()
  })

  it('email cadastrado em /admins/{email} → isSaasAdmin = true', async () => {
    const user = { uid: 'uid-1', email: 'admin@school.com' }
    getDoc.mockImplementation(buildGetDocMock({
      'admins/admin@school.com': { email: 'admin@school.com', name: 'Admin' },
      'users/uid-1': { schools: {} },
    }))

    await useAuthStore.getState()._resolveRole(user)

    expect(useAuthStore.getState().isSaasAdmin).toBe(true)
  })

  it('email em SUPER_USERS (env) e sem doc em /admins/ → isSaasAdmin = true', async () => {
    const user = { uid: 'uid-2', email: 'super@saas.com' }
    getDoc.mockImplementation(buildGetDocMock({
      // não há doc em admins/ → isAdmin retorna false; SUPER_USERS cobre
      'users/uid-2': { schools: {} },
    }))

    await useAuthStore.getState()._resolveRole(user)

    expect(useAuthStore.getState().isSaasAdmin).toBe(true)
  })

  it('email comum (não admin, não super-user) → isSaasAdmin = false', async () => {
    const user = { uid: 'uid-3', email: 'comum@user.com' }
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-3': { schools: { [SCHOOL_ID]: { role: 'teacher' } } },
    }))

    await useAuthStore.getState()._resolveRole(user)

    expect(useAuthStore.getState().isSaasAdmin).toBe(false)
  })

  it('logout → isSaasAdmin reseta para false e stopAllSchoolsListener é chamado', async () => {
    useAuthStore.setState({ isSaasAdmin: true })

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState().isSaasAdmin).toBe(false)
    expect(stopAllSchoolsListenerMock).toHaveBeenCalled()
  })
})
