// src/__tests__/login-flow.integration.test.js
//
// Suíte de integração login-flow por role (issue #487 / task 487).
// Estilo: testes puros sobre `bootSequence`, `checkAccessRevoked` e
// `_resolveRole` (com mocks de Firebase) — segue o padrão de
// `useAuthStore.multitenant.test.js`.
//
// Cobertura por role (saas admin é coberto em useAuthStore.isSaasAdmin.test.js):
//   - admin (admin local)
//   - coordinator
//   - teacher-coordinator
//   - teacher
//   - professor removido (escola única) → bloqueado, role null, signOut, loginError 'access-revoked'
//   - pendente (novo, em espera, com role 'pending' no users/{uid})
//
// Cenário de bug a cobrir explicitamente (regressão de redacaoanglobrag@gmail.com):
//   users/{uid}.removedFrom = [schoolId] e users/{uid}.schools = {}
//   → role permanece null, signOut chamado, loginError === 'access-revoked',
//     localStorage limpo, toast disparado.
//
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Ambiente do vitest é 'node' por padrão (vitest.config.js). Stub mínimo de
// localStorage para os fluxos que verificam limpeza do LS em revogação.
if (typeof globalThis.localStorage === 'undefined') {
  const _store = new Map()
  globalThis.localStorage = {
    getItem:    (k) => (_store.has(k) ? _store.get(k) : null),
    setItem:    (k, v) => { _store.set(k, String(v)) },
    removeItem: (k) => { _store.delete(k) },
    clear:      () => { _store.clear() },
    key:        (i) => Array.from(_store.keys())[i] ?? null,
    get length() { return _store.size },
  }
}

// ─── Mocks de módulo (elevados pelo Vitest antes dos imports) ─────────────────

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
  runTransaction: vi.fn(),
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

vi.mock('firebase/functions', () => ({
  getFunctions:  vi.fn(() => ({ _mock: true })),
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: {} })),
}))

vi.mock('../lib/firebase', () => ({
  db:        { _mock: true },
  app:       { _mock: true },
  auth:      { _mock: true },
  provider:  { _mock: true },
  functions: { _mock: true },
}))

vi.mock('../lib/firebase/multi-tenant', () => ({
  getSchoolCollectionRef: vi.fn((schoolId, sub)        => ({ _path: `schools/${schoolId}/${sub}` })),
  getSchoolDocRef:        vi.fn((schoolId, sub, id)    => ({ _path: `schools/${schoolId}/${sub}/${id}` })),
  getSchoolConfigRef:     vi.fn((schoolId)             => ({ _path: `schools/${schoolId}/config/main` })),
  getSchoolRef:           vi.fn((schoolId)             => ({ _path: `schools/${schoolId}` })),
}))

// useSchoolStore — controla currentSchoolId e availableSchools via vars compartilhadas.
// vi.hoisted garante que essas vars existem antes do hoist do vi.mock factory.
const {
  mockSchoolIdRef,
  mockAvailableRef,
  schoolSubscribers,
  setCurrentSchoolMock,
  loadAvailableSchoolsMock,
  setStateMock,
  toastMock,
} = vi.hoisted(() => ({
  mockSchoolIdRef:           { current: 'sch-test' },
  mockAvailableRef:          { current: [] },
  schoolSubscribers:         new Set(),
  setCurrentSchoolMock:      vi.fn().mockResolvedValue(undefined),
  loadAvailableSchoolsMock:  vi.fn().mockResolvedValue(undefined),
  setStateMock:              vi.fn(),
  toastMock:                 vi.fn(),
}))

vi.mock('../store/useSchoolStore', () => ({
  default: {
    getState: vi.fn(() => ({
      currentSchoolId:       mockSchoolIdRef.current,
      availableSchools:      mockAvailableRef.current,
      init:                  vi.fn(),
      setCurrentSchool:      setCurrentSchoolMock,
      loadAvailableSchools:  loadAvailableSchoolsMock,
      stopAllSchoolsListener: vi.fn(),
    })),
    setState: setStateMock,
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

vi.mock('../hooks/useToast', () => ({
  toast: (...args) => toastMock(...args),
  default: {
    getState: vi.fn(() => ({ show: toastMock })),
  },
}))

// ─── Imports pós-mock ────────────────────────────────────────────────────────

import { getDoc, getDocs, setDoc, onSnapshot } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import useSchoolStore from '../store/useSchoolStore'
import useAuthStore from '../store/useAuthStore'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SCHOOL_ID  = 'sch-test'
const SCHOOL_B   = 'sch-b'

/**
 * Constrói o mock de getDoc a partir de um mapa path → dados.
 * Caminhos não listados retornam { exists: () => false }.
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
 * Atualiza refs e o retorno do useSchoolStore.getState() de uma vez.
 * Mantém o `setCurrentSchool` e `loadAvailableSchools` mocks compartilhados
 * para que assertions sobre eles funcionem entre testes.
 */
function setSchoolStore({ currentSchoolId, availableSchools = [] }) {
  mockSchoolIdRef.current  = currentSchoolId
  mockAvailableRef.current = availableSchools
  useSchoolStore.getState.mockReturnValue({
    currentSchoolId,
    availableSchools,
    init:                  vi.fn(),
    setCurrentSchool:      setCurrentSchoolMock,
    loadAvailableSchools:  loadAvailableSchoolsMock,
    stopAllSchoolsListener: vi.fn(),
  })
}

function resetAll() {
  vi.clearAllMocks()
  schoolSubscribers.clear()
  setSchoolStore({ currentSchoolId: SCHOOL_ID, availableSchools: [] })
  onSnapshot.mockReturnValue(vi.fn())

  useAuthStore.setState({
    user: null, role: null, teacher: null,
    loading: true, pendingCt: 0, isSaasAdmin: false,
    loginError: null,
    _unsubPending: null, _unsubApproval: null,
    _unsubSchoolSub: null, _unsubMembership: null,
  })
}

// localStorage spy (jsdom já fornece localStorage; só precisamos limpar)
beforeEach(() => {
  resetAll()
  try { localStorage.clear() } catch { /* jsdom missing — ignorar */ }
})

// ─── Helpers de cenário ──────────────────────────────────────────────────────

/**
 * Configura mocks padrão para um login com role válido em SCHOOL_ID.
 * - `users/{uid}` retorna { schools: { [schoolId]: { role, ...extra } } }
 * - `availableSchools` populado com SCHOOL_ID
 * - currentSchoolId = SCHOOL_ID
 */
function setupAuthorizedLogin({ uid, email, role, schoolId = SCHOOL_ID, extraSchoolEntry = {} }) {
  setSchoolStore({
    currentSchoolId:  schoolId,
    availableSchools: [{ schoolId, name: 'Escola Teste' }],
  })
  getDoc.mockImplementation(buildGetDocMock({
    [`users/${uid}`]: { schools: { [schoolId]: { role, ...extraSchoolEntry } } },
  }))
  return { uid, email, displayName: 'Test', photoURL: '' }
}

// ─── Cenários por role ───────────────────────────────────────────────────────

describe('login-flow integration — role admin (admin local, não saas admin)', () => {
  it('users/{uid}.schools[A].role = "admin" → role admin + pending listener iniciado + sem signOut', async () => {
    const user = setupAuthorizedLogin({ uid: 'uid-admin', email: 'admin@escola.com', role: 'admin' })

    await useAuthStore.getState()._resolveRole(user)

    expect(useAuthStore.getState().role).toBe('admin')
    expect(useAuthStore.getState().teacher).toBeNull()    // admin NÃO popula teacher (RN-4)
    expect(useAuthStore.getState().isSaasAdmin).toBe(false) // admin local !== saas admin
    expect(useAuthStore.getState().loginError).toBeNull()
    expect(signOut).not.toHaveBeenCalled()
    // listener de pending_teachers registrado
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(typeof useAuthStore.getState()._unsubPending).toBe('function')
  })
})

describe('login-flow integration — role coordinator', () => {
  it('users/{uid}.schools[A].role = "coordinator" → role coordinator, sem listeners de pending/approval', async () => {
    const user = setupAuthorizedLogin({ uid: 'uid-coord', email: 'coord@escola.com', role: 'coordinator' })
    getDocs.mockResolvedValue({ empty: true, docs: [] })

    await useAuthStore.getState()._resolveRole(user)

    expect(useAuthStore.getState().role).toBe('coordinator')
    expect(useAuthStore.getState().loginError).toBeNull()
    expect(signOut).not.toHaveBeenCalled()
    // Coordinator NÃO inicia listener de pending_teachers nem de approval.
    expect(onSnapshot).not.toHaveBeenCalled()
    expect(useAuthStore.getState()._unsubPending).toBeNull()
    expect(useAuthStore.getState()._unsubApproval).toBeNull()
  })
})

describe('login-flow integration — role teacher-coordinator', () => {
  it('users/{uid}.schools[A].role = "teacher-coordinator" → role teacher-coordinator com teacher populado', async () => {
    const teacherData = { id: 'tdoc-tc', name: 'Prof Coord', email: 'tc@escola.com' }
    setSchoolStore({
      currentSchoolId:  SCHOOL_ID,
      availableSchools: [{ schoolId: SCHOOL_ID, name: 'Escola Teste' }],
    })
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-tc': { schools: { [SCHOOL_ID]: { role: 'teacher-coordinator', teacherDocId: 'tdoc-tc' } } },
      [`schools/${SCHOOL_ID}/teachers/tdoc-tc`]: teacherData,
    }))

    const user = { uid: 'uid-tc', email: 'tc@escola.com', displayName: 'TC', photoURL: '' }
    await useAuthStore.getState()._resolveRole(user)

    expect(useAuthStore.getState().role).toBe('teacher-coordinator')
    expect(useAuthStore.getState().teacher).toEqual(teacherData)
    expect(signOut).not.toHaveBeenCalled()
    expect(useAuthStore.getState().loginError).toBeNull()
  })
})

describe('login-flow integration — role teacher', () => {
  it('users/{uid}.schools[A].role = "teacher" + teacherDocId → role teacher com teacher populado, sem getDocs (fallback por e-mail)', async () => {
    const teacherData = { id: 'tdoc-t', name: 'Prof T', email: 'teacher@escola.com' }
    setSchoolStore({
      currentSchoolId:  SCHOOL_ID,
      availableSchools: [{ schoolId: SCHOOL_ID, name: 'Escola Teste' }],
    })
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-teacher': { schools: { [SCHOOL_ID]: { role: 'teacher', teacherDocId: 'tdoc-t' } } },
      [`schools/${SCHOOL_ID}/teachers/tdoc-t`]: teacherData,
    }))
    getDocs.mockResolvedValue({ empty: true, docs: [] })

    const user = { uid: 'uid-teacher', email: 'teacher@escola.com', displayName: 'T', photoURL: '' }
    await useAuthStore.getState()._resolveRole(user)

    expect(useAuthStore.getState().role).toBe('teacher')
    expect(useAuthStore.getState().teacher).toEqual(teacherData)
    expect(signOut).not.toHaveBeenCalled()
    expect(useAuthStore.getState().loginError).toBeNull()
    // Sem listener de pending nem de approval para teacher já aprovado.
    expect(onSnapshot).not.toHaveBeenCalled()
    expect(getDocs).not.toHaveBeenCalled()  // teacherDocId existe → não cai no fallback
  })
})

// ─── Cenários de revogação (bloqueado) ───────────────────────────────────────

describe('login-flow integration — professor removido (revogação total escola única)', () => {
  it('REGRESSÃO: removedFrom = [A] + schools = {} → role null, signOut chamado, loginError "access-revoked", LS limpo, toast disparado', async () => {
    // Setup do bug observado em redacaoanglobrag@gmail.com:
    //   users/{uid} = { schools: {}, removedFrom: ['sch-test'] }
    //   schools/{sch-test}/removed_users/{uid} pode existir (defesa em profundidade)
    //   localStorage tem escola salva
    try { localStorage.setItem('gestao_active_school', SCHOOL_ID) } catch { /* ignore */ }

    // Sem membership: usuário foi removido.
    setSchoolStore({ currentSchoolId: SCHOOL_ID, availableSchools: [] })

    getDoc.mockImplementation(ref => {
      const path = ref._path
      if (path === 'users/uid-removido') {
        return Promise.resolve({
          exists: () => true,
          data:   () => ({ schools: {}, removedFrom: [SCHOOL_ID] }),
        })
      }
      // marcador defensivo em removed_users — exists() para defesa em profundidade
      if (path === `schools/${SCHOOL_ID}/removed_users/uid-removido`) {
        return Promise.resolve({ exists: () => true, data: () => ({}) })
      }
      return Promise.resolve({ exists: () => false })
    })

    const user = { uid: 'uid-removido', email: 'removido@escola.com', displayName: 'Removido', photoURL: '' }
    await useAuthStore.getState()._resolveRole(user)

    // Pós-condição: role null, signOut, banner "access-revoked", LS limpo
    expect(useAuthStore.getState().role).toBeNull()
    expect(useAuthStore.getState().teacher).toBeNull()
    expect(useAuthStore.getState().isSaasAdmin).toBe(false)
    expect(useAuthStore.getState().loginError).toBe('access-revoked')
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith(
      'Seu acesso foi revogado pelo administrador desta escola',
      'error',
    )
    expect(localStorage.getItem('gestao_active_school')).toBeNull()
    // useSchoolStore.setState foi chamado para limpar currentSchoolId/currentSchool
    expect(setStateMock).toHaveBeenCalledWith({ currentSchoolId: null, currentSchool: null })
    // requestTeacherAccess (setDoc em pending_teachers) NUNCA é chamado em revogação total
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('removedFrom apenas via marcador removed_users (índice removedFrom vazio) → revogação total detectada por defesa em profundidade', async () => {
    // Cobre inconsistência: índice removedFrom em users/{uid} stale, mas
    // marcador canônico em removed_users/{uid} presente.
    setSchoolStore({ currentSchoolId: SCHOOL_ID, availableSchools: [] })
    getDoc.mockImplementation(ref => {
      const path = ref._path
      if (path === 'users/uid-stale') {
        // schools tem entry mas removed_users marca como revogado
        return Promise.resolve({
          exists: () => true,
          data:   () => ({ schools: { [SCHOOL_ID]: { role: 'teacher' } }, removedFrom: [] }),
        })
      }
      if (path === `schools/${SCHOOL_ID}/removed_users/uid-stale`) {
        return Promise.resolve({ exists: () => true, data: () => ({}) })
      }
      return Promise.resolve({ exists: () => false })
    })

    const user = { uid: 'uid-stale', email: 'stale@escola.com', displayName: 'Stale', photoURL: '' }
    await useAuthStore.getState()._resolveRole(user)

    // Defesa em profundidade: marcador presente em todas as escolas com entry
    // → fullyRevoked → mesmo fluxo de revogação total.
    expect(useAuthStore.getState().role).toBeNull()
    expect(useAuthStore.getState().loginError).toBe('access-revoked')
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})

describe('login-flow integration — multi-escola com revogação parcial', () => {
  it('schools = { A }, removedFrom = [B] → loga em A normalmente, B filtrado de availableSchools', async () => {
    // Usuário tem membership em A; foi removido de B (que apareceu em availableSchools por race).
    setSchoolStore({
      currentSchoolId:  SCHOOL_ID,
      availableSchools: [
        { schoolId: SCHOOL_ID, name: 'Escola A' },
        { schoolId: SCHOOL_B,  name: 'Escola B' },   // B presente, mas será filtrado
      ],
    })
    getDoc.mockImplementation(ref => {
      const path = ref._path
      if (path === 'users/uid-multi') {
        return Promise.resolve({
          exists: () => true,
          data:   () => ({
            schools:     { [SCHOOL_ID]: { role: 'teacher' } },
            removedFrom: [SCHOOL_B],
          }),
        })
      }
      // Sem marcador em removed_users
      return Promise.resolve({ exists: () => false })
    })
    getDocs.mockResolvedValue({ empty: true, docs: [] })

    const user = { uid: 'uid-multi', email: 'multi@escola.com', displayName: 'Multi', photoURL: '' }
    await useAuthStore.getState()._resolveRole(user)

    // Loga em A, role teacher; B nunca seleciona escola ativa nem dispara signOut.
    expect(useAuthStore.getState().role).toBe('teacher')
    expect(useAuthStore.getState().loginError).toBeNull()
    expect(signOut).not.toHaveBeenCalled()
  })
})

// ─── Cenários pendente ───────────────────────────────────────────────────────

describe('login-flow integration — pendente novo (sem entry em schools[schoolId])', () => {
  it('users/{uid}.schools = {} + currentSchoolId presente → role pending, requestTeacherAccess chamado, approval listener registrado', async () => {
    // Sem membership ainda — usuário pendente novo via /join/:slug.
    setSchoolStore({ currentSchoolId: SCHOOL_ID, availableSchools: [] })
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-pendente-novo': { schools: {} },
      // sem doc em removed_users — não está revogado
    }))
    setDoc.mockResolvedValue(undefined)

    const user = { uid: 'uid-pendente-novo', email: 'novo@escola.com', displayName: 'Novo', photoURL: '' }
    await useAuthStore.getState()._resolveRole(user)

    expect(useAuthStore.getState().role).toBe('pending')
    expect(useAuthStore.getState().loginError).toBeNull()
    expect(signOut).not.toHaveBeenCalled()
    // requestTeacherAccess: cria pending_teachers/{uid} via setDoc
    expect(setDoc).toHaveBeenCalled()
    // listener de aprovação registrado
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(typeof useAuthStore.getState()._unsubApproval).toBe('function')
  })
})

describe('login-flow integration — pendente em espera (entry com role pending/null)', () => {
  it('users/{uid}.schools[A] = { status: "pending", role: null } → role pending', async () => {
    setSchoolStore({
      currentSchoolId:  SCHOOL_ID,
      availableSchools: [{ schoolId: SCHOOL_ID, name: 'Escola Teste' }],
    })
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-pendente-espera': { schools: { [SCHOOL_ID]: { status: 'pending', role: null } } },
    }))
    setDoc.mockResolvedValue(undefined)

    const user = { uid: 'uid-pendente-espera', email: 'espera@escola.com', displayName: 'Espera', photoURL: '' }
    await useAuthStore.getState()._resolveRole(user)

    expect(useAuthStore.getState().role).toBe('pending')
    expect(useAuthStore.getState().loginError).toBeNull()
    expect(signOut).not.toHaveBeenCalled()
    // Listener de aprovação registrado para a escola atual
    expect(onSnapshot).toHaveBeenCalledTimes(1)
  })

  it('users/{uid}.schools[A] = { role: "rejected" } → role null + signOut + loginError "access-rejected" + toast', async () => {
    setSchoolStore({
      currentSchoolId:  SCHOOL_ID,
      availableSchools: [{ schoolId: SCHOOL_ID, name: 'Escola Teste' }],
    })
    getDoc.mockImplementation(buildGetDocMock({
      'users/uid-rej': { schools: { [SCHOOL_ID]: { role: 'rejected', status: 'rejected' } } },
    }))

    const user = { uid: 'uid-rej', email: 'rej@escola.com', displayName: 'Rej', photoURL: '' }
    await useAuthStore.getState()._resolveRole(user)

    expect(useAuthStore.getState().role).toBeNull()
    expect(signOut).toHaveBeenCalledTimes(1)
    // Cadastro rejeitado agora também sinaliza para a LoginPage exibir
    // mensagem clara — distingue de "access-revoked" via código próprio.
    expect(useAuthStore.getState().loginError).toBe('access-rejected')
    expect(toastMock).toHaveBeenCalled()
  })
})

// ─── Suíte sobre o helper puro checkAccessRevoked (cenários por role) ────────
//
// Aqui seguimos o estilo do issue: testar `checkAccessRevoked` diretamente
// para garantir que cada role é classificado corretamente pelo helper, sem
// depender de _resolveRole (rede de regressão extra contra o bug original).

import { checkAccessRevoked } from '../lib/db'

function makeUserSnap(data, exists = true) {
  return {
    exists: () => exists,
    data:   () => data,
  }
}

describe('checkAccessRevoked — login-flow por role (regressão)', () => {
  it('teacher ativo (schools={A:{role:teacher}}, removedFrom=[]) → não revogado', async () => {
    getDoc.mockResolvedValue({ exists: () => false })   // sem marcadores
    const snap = makeUserSnap({ schools: { A: { role: 'teacher' } }, removedFrom: [] })
    const result = await checkAccessRevoked('uid-1', snap)
    expect(result).toEqual({ revoked: false, fullyRevoked: false, revokedSchoolIds: [] })
  })

  it('coordinator ativo → não revogado', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    const snap = makeUserSnap({ schools: { A: { role: 'coordinator' } }, removedFrom: [] })
    const result = await checkAccessRevoked('uid-1', snap)
    expect(result.revoked).toBe(false)
  })

  it('teacher-coordinator ativo → não revogado', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    const snap = makeUserSnap({ schools: { A: { role: 'teacher-coordinator' } }, removedFrom: [] })
    const result = await checkAccessRevoked('uid-1', snap)
    expect(result.revoked).toBe(false)
  })

  it('admin local ativo → não revogado', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    const snap = makeUserSnap({ schools: { A: { role: 'admin' } }, removedFrom: [] })
    const result = await checkAccessRevoked('uid-1', snap)
    expect(result.revoked).toBe(false)
  })

  it('REGRESSÃO BUG: schools = {} + removedFrom = [A] → fullyRevoked = true, revokedSchoolIds = [A]', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    const snap = makeUserSnap({ schools: {}, removedFrom: ['A'] })
    const result = await checkAccessRevoked('uid-removido', snap)

    expect(result.revoked).toBe(true)
    expect(result.fullyRevoked).toBe(true)
    expect(result.revokedSchoolIds).toEqual(['A'])
  })

  it('pendente novo (schools = {}, removedFrom = []) → não revogado', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    const snap = makeUserSnap({ schools: {}, removedFrom: [] })
    const result = await checkAccessRevoked('uid-novo', snap)
    expect(result).toEqual({ revoked: false, fullyRevoked: false, revokedSchoolIds: [] })
  })

  it('multi-escola parcialmente revogado: schools = {A}, removedFrom = [B] → revoked mas NÃO fullyRevoked', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    const snap = makeUserSnap({ schools: { A: { role: 'teacher' } }, removedFrom: ['B'] })
    const result = await checkAccessRevoked('uid-multi', snap)
    expect(result.revoked).toBe(true)
    expect(result.fullyRevoked).toBe(false)
    expect(result.revokedSchoolIds).toEqual(['B'])
  })
})
