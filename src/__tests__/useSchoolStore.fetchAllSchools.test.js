// src/__tests__/useSchoolStore.fetchAllSchools.test.js
// Cobre fetchAllSchools (subscription global em /schools), filtragem de
// deletedAt, idempotência (re-chamada cancela listener anterior) e
// stopAllSchoolsListener (reset no logout).
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks de módulo ──────────────────────────────────────────────────────────

vi.mock('firebase/firestore', () => ({
  doc:             vi.fn((db, ...segs) => ({ _path: segs.join('/') })),
  getDoc:          vi.fn(),
  collection:      vi.fn((db, ...segs) => ({ _path: segs.join('/') })),
  query:           vi.fn((ref, ...mods) => ({ ...ref, _mods: mods })),
  orderBy:         vi.fn((field, dir) => ({ _orderBy: field, _dir: dir })),
  onSnapshot:      vi.fn(),
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
import { onSnapshot, collection, query, orderBy } from 'firebase/firestore'
import useSchoolStore from '../store/useSchoolStore'

function resetStore() {
  useSchoolStore.setState({
    currentSchoolId: null,
    currentSchool: null,
    availableSchools: [],
    allSchools: [],
    _unsubAllSchools: null,
  })
}

/** Constrói um snap fake com docs no formato { id, data() }. */
function buildSnap(docs) {
  return {
    docs: docs.map(({ schoolId, ...rest }) => ({ id: schoolId, data: () => rest })),
  }
}

describe('useSchoolStore.fetchAllSchools', () => {
  let warnSpy
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('cria onSnapshot em collection(schools) ordenando por createdAt desc e popula allSchools', () => {
    let capturedCb = null
    const unsub = vi.fn()
    onSnapshot.mockImplementation((q, cb) => {
      capturedCb = cb
      return unsub
    })

    useSchoolStore.getState().fetchAllSchools()

    // Verifica que collection foi chamado com path 'schools'
    expect(collection).toHaveBeenCalledWith({ _mock: true }, 'schools')
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc')
    expect(query).toHaveBeenCalled()
    expect(onSnapshot).toHaveBeenCalledTimes(1)

    // Dispara o callback do snapshot com 2 escolas válidas
    capturedCb(buildSnap([
      { schoolId: 's2', name: 'Escola B', createdAt: 200 },
      { schoolId: 's1', name: 'Escola A', createdAt: 100 },
    ]))

    const { allSchools, _unsubAllSchools } = useSchoolStore.getState()
    expect(allSchools).toHaveLength(2)
    expect(allSchools[0].schoolId).toBe('s2')
    expect(allSchools[1].schoolId).toBe('s1')
    expect(_unsubAllSchools).toBe(unsub)
  })

  it('filtra docs com deletedAt != null', () => {
    let capturedCb = null
    onSnapshot.mockImplementation((q, cb) => { capturedCb = cb; return vi.fn() })

    useSchoolStore.getState().fetchAllSchools()

    capturedCb(buildSnap([
      { schoolId: 's1', name: 'Ativa', createdAt: 100, deletedAt: null },
      { schoolId: 's2', name: 'Removida', createdAt: 90, deletedAt: 12345 },
      { schoolId: 's3', name: 'Sem campo deletedAt', createdAt: 80 },
    ]))

    const { allSchools } = useSchoolStore.getState()
    expect(allSchools).toHaveLength(2)
    expect(allSchools.map(s => s.schoolId)).toEqual(['s1', 's3'])
  })

  it('re-chamada cancela snapshot anterior (idempotência)', () => {
    const unsub1 = vi.fn()
    const unsub2 = vi.fn()
    onSnapshot.mockReturnValueOnce(unsub1).mockReturnValueOnce(unsub2)

    useSchoolStore.getState().fetchAllSchools()
    expect(useSchoolStore.getState()._unsubAllSchools).toBe(unsub1)

    useSchoolStore.getState().fetchAllSchools()
    expect(unsub1).toHaveBeenCalledTimes(1)
    expect(useSchoolStore.getState()._unsubAllSchools).toBe(unsub2)
  })

  it('mantém ordem do snapshot (Firestore já ordena por createdAt desc)', () => {
    let capturedCb = null
    onSnapshot.mockImplementation((q, cb) => { capturedCb = cb; return vi.fn() })

    useSchoolStore.getState().fetchAllSchools()

    capturedCb(buildSnap([
      { schoolId: 's-novo',  name: 'Mais recente', createdAt: 300 },
      { schoolId: 's-meio',  name: 'Meio',        createdAt: 200 },
      { schoolId: 's-velho', name: 'Mais antiga', createdAt: 100 },
    ]))

    const ids = useSchoolStore.getState().allSchools.map(s => s.schoolId)
    expect(ids).toEqual(['s-novo', 's-meio', 's-velho'])
  })

  it('callback de erro do onSnapshot loga warning sem quebrar o app', () => {
    let capturedErr = null
    onSnapshot.mockImplementation((q, cb, errCb) => {
      capturedErr = errCb
      return vi.fn()
    })

    useSchoolStore.getState().fetchAllSchools()
    expect(() => capturedErr(new Error('permission-denied'))).not.toThrow()
    expect(warnSpy).toHaveBeenCalled()
    expect(useSchoolStore.getState().allSchools).toEqual([])
  })

  it('stopAllSchoolsListener cancela unsub e reseta allSchools', () => {
    const unsub = vi.fn()
    onSnapshot.mockReturnValue(unsub)

    useSchoolStore.getState().fetchAllSchools()
    useSchoolStore.setState({ allSchools: [{ schoolId: 's1' }] })

    useSchoolStore.getState().stopAllSchoolsListener()

    expect(unsub).toHaveBeenCalledTimes(1)
    expect(useSchoolStore.getState()._unsubAllSchools).toBeNull()
    expect(useSchoolStore.getState().allSchools).toEqual([])
  })
})
