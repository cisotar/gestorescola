// src/__tests__/useSchoolStore.init.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mocks de módulo ──────────────────────────────────────────────────────────

vi.mock('firebase/firestore', () => ({
  doc:             vi.fn((db, ...segs) => ({ _path: segs.join('/') })),
  getDoc:          vi.fn(),
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

vi.mock('../lib/firebase', () => ({
  db:       { _mock: true },
  app:      { _mock: true },
  auth:     { _mock: true },
  provider: { _mock: true },
}))

vi.mock('../lib/firebase/multi-tenant', () => ({
  getSchoolRef: vi.fn((schoolId) => ({ _path: `schools/${schoolId}` })),
}))

vi.mock('../lib/db', () => ({
  teardownListeners: vi.fn(),
}))

// Shim de localStorage para ambiente node
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
  }
}

// ─── Imports pós-mock ─────────────────────────────────────────────────────────
import { getDoc } from 'firebase/firestore'
import useSchoolStore from '../store/useSchoolStore'

const LS_KEY = 'gestao_active_school'
const UID = 'uid-abc'
const SCHOOL_ID = 'sch-test'

function buildGetDocMock(pathMap) {
  return vi.fn(ref => {
    const path = ref._path
    // id derivado do ultimo segmento do path (mimica DocumentSnapshot.id)
    const id = path.split('/').pop()
    if (path in pathMap) {
      const data = pathMap[path]
      if (data === '__throw__') return Promise.reject(new Error('network down'))
      return Promise.resolve({ id, exists: () => true, data: () => data })
    }
    return Promise.resolve({ id, exists: () => false })
  })
}

function resetStore() {
  useSchoolStore.setState({
    currentSchoolId: null,
    currentSchool: null,
    availableSchools: [],
  })
}

describe('useSchoolStore.init — branch pendente (savedId sem availableSchools)', () => {
  let warnSpy
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    try { localStorage.removeItem(LS_KEY) } catch {}
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
    try { localStorage.removeItem(LS_KEY) } catch {}
  })

  it('users/{uid} inexistente + savedId em LS + schools/{savedId} existe → restaura currentSchoolId, mantem availableSchools vazio e LS preservado', async () => {
    localStorage.setItem(LS_KEY, SCHOOL_ID)
    getDoc.mockImplementation(buildGetDocMock({
      // users/uid-abc inexistente (não mapeado)
      [`schools/${SCHOOL_ID}`]: { name: 'Escola Teste' },
    }))

    await useSchoolStore.getState().init(UID)

    const state = useSchoolStore.getState()
    expect(state.currentSchoolId).toBe(SCHOOL_ID)
    expect(state.currentSchool).toEqual({ schoolId: SCHOOL_ID, name: 'Escola Teste' })
    expect(state.availableSchools).toEqual([])
    expect(localStorage.getItem(LS_KEY)).toBe(SCHOOL_ID)
  })

  it('savedId em LS + schools/{savedId} inexistente → currentSchoolId null e LS removido', async () => {
    localStorage.setItem(LS_KEY, SCHOOL_ID)
    getDoc.mockImplementation(buildGetDocMock({
      // nada existe — nem users/uid-abc nem schools/sch-test
    }))

    await useSchoolStore.getState().init(UID)

    const state = useSchoolStore.getState()
    expect(state.currentSchoolId).toBeNull()
    expect(state.currentSchool).toBeNull()
    expect(localStorage.getItem(LS_KEY)).toBeNull()
  })

  it('erro de rede em getDoc(schools/{savedId}) → LS preservado, sem throw', async () => {
    localStorage.setItem(LS_KEY, SCHOOL_ID)
    getDoc.mockImplementation(buildGetDocMock({
      [`schools/${SCHOOL_ID}`]: '__throw__',
    }))

    await expect(useSchoolStore.getState().init(UID)).resolves.toBeUndefined()

    const state = useSchoolStore.getState()
    expect(state.currentSchoolId).toBeNull()
    expect(localStorage.getItem(LS_KEY)).toBe(SCHOOL_ID)
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('useSchoolStore.init — regressao caminho normal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    try { localStorage.removeItem(LS_KEY) } catch {}
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    try { localStorage.removeItem(LS_KEY) } catch {}
  })

  it('usuario aprovado com savedId membro → setCurrentSchool(savedId) chamado', async () => {
    localStorage.setItem(LS_KEY, SCHOOL_ID)
    getDoc.mockImplementation(buildGetDocMock({
      [`users/${UID}`]: { schools: { [SCHOOL_ID]: { role: 'teacher' } } },
      [`schools/${SCHOOL_ID}`]: { name: 'Escola Teste' },
    }))

    await useSchoolStore.getState().init(UID)

    const state = useSchoolStore.getState()
    expect(state.currentSchoolId).toBe(SCHOOL_ID)
    expect(state.availableSchools).toHaveLength(1)
    expect(state.availableSchools[0].schoolId).toBe(SCHOOL_ID)
    expect(localStorage.getItem(LS_KEY)).toBe(SCHOOL_ID)
  })

  it('usuario aprovado com unica escola e sem savedId → auto-seleciona', async () => {
    getDoc.mockImplementation(buildGetDocMock({
      [`users/${UID}`]: { schools: { [SCHOOL_ID]: { role: 'teacher' } } },
      [`schools/${SCHOOL_ID}`]: { name: 'Escola Teste' },
    }))

    await useSchoolStore.getState().init(UID)

    const state = useSchoolStore.getState()
    expect(state.currentSchoolId).toBe(SCHOOL_ID)
    expect(localStorage.getItem(LS_KEY)).toBe(SCHOOL_ID)
  })
})
