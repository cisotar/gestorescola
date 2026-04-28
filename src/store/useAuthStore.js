import { create } from 'zustand'
import { auth, provider, db } from '../lib/firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { onSnapshot, collection, query, where, doc, getDoc } from 'firebase/firestore'
import { isAdmin, requestTeacherAccess, getTeacherDoc, teardownListeners, AccessRevokedError } from '../lib/db'
import useAppStore from './useAppStore'
import useSchoolStore from './useSchoolStore'
import { toast } from '../hooks/useToast'

// Proprietário do sistema — acesso garantido independente do estado do Firestore.
// Nunca passa pelo fluxo de aprovação; role 'admin' é atribuído antes de qualquer
// consulta ao banco. Adicionar outros emails apenas em casos extremos de recuperação.
const SUPER_USERS = [import.meta.env.VITE_SUPER_ADMIN_EMAIL].filter(Boolean)

const useAuthStore = create((set, get) => ({
  user:          null,
  role:          null,   // 'admin' | 'coordinator' | 'teacher-coordinator' | 'teacher' | 'pending' | null
  teacher:       null,
  loading:       true,
  pendingCt:     0,
  isSaasAdmin:   false,  // true se email em SUPER_USERS ou em /admins/{email_key}
  _unsubPending: null,
  _unsubApproval: null,  // unsub fn do listener pending_teachers/{uid}; sempre chamar antes de criar novo
  _unsubSchoolSub: null,
  _unsubMembership: null, // unsub fn do listener users/{uid}; detecta perda de membership em runtime
  // Flag privada — indica que o init() do auth store está em curso e a transição
  // currentSchoolId (null → schoolId) que acontece dentro de useSchoolStore.init
  // deve ser ignorada pelo subscribe (o próprio init() já chama _resolveRole
  // com userSnapHint). Setada exclusivamente no onAuthStateChanged via try/finally.
  _initInProgress: false,

  // ─── Init ──────────────────────────────────────────────────────────────────
  init: () => {
    // Idempotência: cancelar subscribe anterior em caso de re-init (HMR/reload)
    get()._unsubSchoolSub?.()

    // Subscribe em mudanças de currentSchoolId — re-resolve role quando muda
    // após o login (ex.: JoinPage chamando setCurrentSchool, ou troca de escola
    // via SchoolSwitcher). Sem isso, _resolveRole rodaria apenas uma vez no
    // onAuthStateChanged inicial e o listener de aprovação ficaria na escola
    // errada (RN-3, RN-4).
    const unsubSchool = useSchoolStore.subscribe(async (state, prevState) => {
      // Guard: durante o init() do auth, useSchoolStore.init dispara
      // setCurrentSchool(null → schoolId). O próprio init() já vai chamar
      // _resolveRole logo em seguida com userSnapHint — então ignoramos
      // essa transição aqui para evitar dupla execução.
      if (get()._initInProgress) return
      if (state.currentSchoolId === prevState.currentSchoolId) return
      const user = get().user
      if (!user) return
      try {
        // Idempotência completa: cancelar tanto _unsubApproval quanto
        // _unsubPending da escola anterior antes de re-resolve na nova.
        // Sem isso, há janela em que o listener de pending_teachers da
        // escola antiga continua ativo até _resolveRole registrar o novo.
        get()._unsubApproval?.()
        get()._unsubPending?.()
        set({ _unsubApproval: null, _unsubPending: null })
        await get()._resolveRole(user)
      } catch (e) {
        console.warn('[auth] re-resolve role on schoolId change:', e)
      }
    })
    set({ _unsubSchoolSub: unsubSchool })

    return new Promise(resolve => {
      onAuthStateChanged(auth, async user => {
        set({ user, role: null, teacher: null, isSaasAdmin: false })
        if (user) {
          // _initInProgress: true durante toda a janela de init para que o
          // subscribe de useSchoolStore ignore a transição null → schoolId
          // disparada por setCurrentSchool dentro do useSchoolStore.init.
          // try/finally garante reset mesmo se init() ou _resolveRole lançar.
          set({ _initInProgress: true })
          try {
            // Pré-check síncrono: se o email está em SUPER_USERS, é saas admin
            // com certeza. Passa a flag para o SchoolStore.init limpar o
            // localStorage stale antes de restaurar currentSchoolId — evita
            // que useSchoolStore.setState dentro de _resolveRole dispare o
            // subscribe e cause re-resolves em cascata.
            const isSuperUserEmail = SUPER_USERS.includes(user.email?.toLowerCase())
            // init retorna o userSnap lido em loadAvailableSchools para evitar
            // uma segunda leitura de users/{uid} dentro de _resolveRole.
            const userSnap = await useSchoolStore.getState().init(user.uid, isSuperUserEmail)
            await get()._resolveRole(user, userSnap)
            // Listener leve em users/{uid} para detectar perda de membership
            // em runtime (ex.: admin remove o professor enquanto a sessão dele
            // está aberta). Registrado APÓS _resolveRole para evitar race com
            // o boot inicial.
            get()._startMembershipListener(user.uid)
          } finally {
            set({ _initInProgress: false })
          }
        }
        set({ loading: false })
        resolve()
      })
    })
  },

  // ─── _startMembershipListener ──────────────────────────────────────────────
  // Listener leve em users/{uid} ativo durante toda a sessão. Detecta quando
  // a entry de currentSchoolId desaparece (admin removeu o professor) e
  // dispara o fluxo de revogação. Idempotente — pode ser chamado várias vezes.
  // Não dispara em SaaS admin (não depende de users/{uid}).
  _startMembershipListener: (uid) => {
    // Idempotência: cancelar listener anterior antes de criar novo
    get()._unsubMembership?.()
    set({ _unsubMembership: null })

    // SaaS admin não depende de users/{uid}.schools — listener vira no-op
    if (get().isSaasAdmin) return

    // prevHasEntry mantido em closure:
    //  - null  → ainda não vi snapshot algum (boot)
    //  - true  → última leitura tinha a entry
    //  - false → última leitura NÃO tinha a entry
    // Só dispara revogação na transição true → false.
    let prevHasEntry = null

    const unsub = onSnapshot(
      doc(db, 'users', uid),
      snap => {
        // Defesa em profundidade: se SaaS admin foi setado em runtime, ignorar
        if (get().isSaasAdmin) return

        // Boot inicial pode chegar antes do users/{uid} existir (usuário novo)
        if (!snap.exists()) return

        const schoolId = useSchoolStore.getState().currentSchoolId
        if (!schoolId) {
          // Sem escola ativa não há membership a perder; reset prev
          prevHasEntry = false
          return
        }

        const data = snap.data() ?? {}
        const entry = data.schools?.[schoolId]
        const currentHasEntry = !!entry

        if (prevHasEntry === null) {
          // Primeiro snapshot pós-resolveRole: apenas grava estado, NÃO age
          prevHasEntry = currentHasEntry
          return
        }

        if (prevHasEntry === true && currentHasEntry === false) {
          // Transição de "tinha" para "não tem" → revogação
          get()._handleMembershipRevoked()
        }

        prevHasEntry = currentHasEntry
      },
      err => console.warn('[membership]', err)
    )

    set({ _unsubMembership: unsub })
  },

  // ─── _handleMembershipRevoked ─────────────────────────────────────────────
  // Acionado pelo listener de membership quando a entry da escola atual é
  // removida em runtime. Limpa listeners de dados, recarrega availableSchools
  // e seleciona próxima escola disponível (ou null para cair em /no-school).
  _handleMembershipRevoked: async () => {
    const user = get().user
    if (!user) return

    // 1. Cancelar listeners de dados da escola removida
    try { teardownListeners() } catch (e) { console.warn('[membership] teardownListeners:', e) }
    try { useAppStore.getState().cleanupLazyListeners() } catch (e) { console.warn('[membership] cleanupLazyListeners:', e) }

    // 2. Toast informativo
    toast('Seu acesso a esta escola foi revogado pelo administrador', 'error')

    // 3. Recarrega lista de escolas do usuário
    try {
      await useSchoolStore.getState().loadAvailableSchools(user.uid)
    } catch (e) {
      console.warn('[membership] loadAvailableSchools:', e)
    }

    const remaining = useSchoolStore.getState().availableSchools ?? []

    // 4. Selecionar próxima escola ou cair em /no-school
    if (remaining.length > 0) {
      // Multi-escola: selecionar primeira disponível.
      // setCurrentSchool dispara o subscribe de useSchoolStore que chama
      // _resolveRole automaticamente, atualizando role/teacher na nova escola.
      try {
        await useSchoolStore.getState().setCurrentSchool(remaining[0].schoolId)
      } catch (e) {
        console.warn('[membership] setCurrentSchool:', e)
      }
    } else {
      // Sem escolas: limpa currentSchoolId. App.jsx detecta
      // !isSaasAdmin && availableSchools.length === 0 e redireciona para /no-school.
      useSchoolStore.setState({ currentSchoolId: null, currentSchool: null })
      try { localStorage.removeItem('gestao_active_school') } catch { /* ignore */ }
    }
  },

  // userSnapHint: snapshot de users/{uid} já lido em loadAvailableSchools.
  // Quando presente, evita uma segunda leitura ao Firestore no step 3.
  // Quando ausente (re-resolve por troca de escola), o step 3 lê normalmente.
  _resolveRole: async (user, userSnapHint) => {
    const schoolId = useSchoolStore.getState().currentSchoolId
    console.log('[auth._resolveRole] start', { uid: user.uid, email: user.email, schoolId })

    // ── 1. Super-admin SaaS: bypass total, role admin garantido ──────────────
    const isSuperUser = SUPER_USERS.includes(user.email?.toLowerCase())
    // Se já sabemos que é SaaS admin (ex: re-resolve após troca de escola),
    // evita a chamada ao Firestore /admins/{email} — economia de 1 RTT.
    const alreadyKnownSaasAdmin = get().isSaasAdmin
    const isSaasAdminFlag = alreadyKnownSaasAdmin || isSuperUser || await isAdmin(user.email)
    set({ isSaasAdmin: isSaasAdminFlag })
    if (isSaasAdminFlag) {
      get()._unsubPending?.()
      // Apenas inicia o listener de pending quando há escola selecionada.
      // Sem schoolId, o painel SaaS Admin (/admin) não exibe contador agregado.
      if (schoolId) {
        const unsub = onSnapshot(
          query(
            collection(db, 'schools', schoolId, 'pending_teachers'),
            where('status', '==', 'pending')
          ),
          snap => set({ pendingCt: snap.size }),
          err  => console.warn('[pendingCt]', err)
        )
        set({ role: 'admin', pendingCt: 0, _unsubPending: unsub })
      } else {
        set({ role: 'admin', pendingCt: 0, _unsubPending: null })
      }
      return
    }

    // ── 2. Guard: sem schoolId não é possível determinar role ────────────────
    if (!schoolId) {
      console.log('[auth._resolveRole] step 2: sem schoolId → role=pending')
      set({ role: 'pending' })
      return
    }

    // ── 3. Lê role de users/{uid}.schools[schoolId] ──────────────────────────
    // Reutiliza userSnapHint quando disponível (evita segunda leitura ao Firestore)
    try {
      const userSnap = userSnapHint ?? await getDoc(doc(db, 'users', user.uid))
      console.log('[auth._resolveRole] step 3: users/{uid} exists?', userSnap.exists(), 'data:', userSnap.exists() ? userSnap.data() : null, userSnapHint ? '(hint reutilizado)' : '(lido do Firestore)')
      if (userSnap.exists()) {
        const schoolEntry = userSnap.data().schools?.[schoolId]
        const localRole = typeof schoolEntry === 'object' && schoolEntry !== null
          ? schoolEntry?.role ?? null
          : null
        console.log('[auth._resolveRole] step 3: localRole =', localRole)
        if (localRole === 'rejected') {
          console.log('[auth._resolveRole] cadastro rejeitado, deslogando')
          set({ role: null })
          await signOut(auth)
          return
        }
        if (localRole && localRole !== 'pending') {
          const normalized = localRole === 'coordinator' ? 'coordinator'
            : localRole === 'teacher-coordinator' ? 'teacher-coordinator'
            : localRole === 'admin' ? 'admin'
            : 'teacher'
          if (normalized === 'admin') {
            // Admin local da escola — iniciar listener de pending
            get()._unsubPending?.()
            const unsub = onSnapshot(
              query(
                collection(db, 'schools', schoolId, 'pending_teachers'),
                where('status', '==', 'pending')
              ),
              snap => set({ pendingCt: snap.size }),
              err  => console.warn('[pendingCt]', err)
            )
            set({ role: 'admin', pendingCt: 0, _unsubPending: unsub })
          } else {
            // Buscar documento do professor para popular useAuthStore.teacher
            const teacherDocId = schoolEntry?.teacherDocId ?? null
            const teacherDoc = await getTeacherDoc(schoolId, teacherDocId, user.email)
            set({ role: normalized, teacher: teacherDoc })
          }
          return
        }
      }
    } catch (e) { console.warn('[auth] leitura users/{uid}:', e) }

    // ── 4. Sem role → fluxo pending ───────────────────────────────────────────
    // IMPORTANTE: nunca recriar users/{uid}.schools[schoolId] no client.
    // Toda escrita de membership é exclusivamente via Cloud Function (approveTeacher,
    // joinSchoolAsAdmin, removeTeacherFromSchool). Cliente só LÊ.
    console.log('[auth._resolveRole] step 4: registrando listener de aprovação em', `schools/${schoolId}/pending_teachers/${user.uid}`)
    set({ role: 'pending' })
    try {
      await requestTeacherAccess(schoolId, user)
    } catch (e) {
      if (e instanceof AccessRevokedError) {
        // Acesso revogado pelo admin — não mantém pending, deixa em estado
        // sem role para que App.jsx redirecione para /no-school via fluxo normal.
        console.warn('[auth._resolveRole] acesso revogado para', user.email, 'na escola', schoolId)
        toast('Seu acesso a esta escola foi revogado pelo administrador', 'err')
        // Limpa contexto local da escola para que o App caia em /no-school
        try { localStorage.removeItem('gestao_active_school') } catch { /* ignore */ }
        useSchoolStore.setState({ currentSchoolId: null, currentSchool: null })
        set({ role: null, teacher: null })
        return
      }
      console.error('[auth._resolveRole] requestTeacherAccess FAIL', { schoolId, uid: user.uid, code: e.code, message: e.message })
    }

    // Cancelar listener anterior, se existir (idempotência)
    get()._unsubApproval?.()
    set({ _unsubApproval: null })

    const pendingDocRef = doc(db, 'schools', schoolId, 'pending_teachers', user.uid)
    const unsub = onSnapshot(
      pendingDocRef,
      async snap => {
        console.log('[auth.approvalListener] dispara, exists?', snap.exists(), `— listening to schools/${schoolId}/pending_teachers/${user.uid}`)
        if (!snap.exists()) {
          unsub()
          set({ _unsubApproval: null })
          // A Cloud Function approveTeacher/rejectTeacher já escreveu users/{uid}.
          // Releia o role do users/{uid} atualizado.
          try {
            const userSnap = await getDoc(doc(db, 'users', user.uid))
            if (userSnap.exists()) {
              const entry = userSnap.data().schools?.[schoolId]
              const newRole = entry?.role
              const newStatus = entry?.status
              console.log('[auth.approvalListener] users/{uid} atualizado:', { newRole, newStatus, schoolId })
              if (newStatus === 'approved' && newRole && newRole !== 'pending') {
                const normalized = newRole === 'coordinator' ? 'coordinator'
                  : newRole === 'teacher-coordinator' ? 'teacher-coordinator'
                  : newRole === 'admin' ? 'admin'
                  : 'teacher'
                let teacherDoc = null
                if (normalized !== 'admin') {
                  const teacherDocId = entry?.teacherDocId ?? null
                  teacherDoc = await getTeacherDoc(schoolId, teacherDocId, user.email)
                }
                console.log('[auth.approvalListener] role atualizado para:', normalized)
                set({ role: normalized, teacher: teacherDoc })
              } else if (newStatus === 'rejected') {
                console.log('[auth.approvalListener] cadastro rejeitado, deslogando')
                set({ role: null })
                await signOut(auth)
              }
            }
          } catch (e) { console.warn('[approvalListener] erro ao re-ler users/{uid}:', e) }
        }
      },
      err => console.warn('[approvalListener] listener error:', err)
    )
    set({ _unsubApproval: unsub })
  },

  login: async () => {
    try { await signInWithPopup(auth, provider) }
    catch (e) { alert('Erro ao fazer login: ' + e.message) }
  },

  logout: () => {
    get()._unsubPending?.()
    get()._unsubApproval?.()
    get()._unsubSchoolSub?.()
    get()._unsubMembership?.()
    set({ _unsubPending: null, _unsubApproval: null, _unsubSchoolSub: null, _unsubMembership: null, isSaasAdmin: false })
    useAppStore.getState().cleanupLazyListeners()
    // Cancela listener global de schools (SaaS admin) e limpa allSchools
    useSchoolStore.getState().stopAllSchoolsListener?.()
    return signOut(auth)
  },

  isAdmin:              () => get().role === 'admin',
  isTeacher:            () => get().role === 'teacher',
  isPending:            () => get().role === 'pending',
  isCoordinator:        () => ['coordinator', 'teacher-coordinator'].includes(get().role),
  isGeneralCoordinator: () => get().role === 'coordinator',
  isTeacherCoordinator: () => get().role === 'teacher-coordinator',
}))

export default useAuthStore
