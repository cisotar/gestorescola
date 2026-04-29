import { create } from 'zustand'
import { auth, provider, db } from '../lib/firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { onSnapshot, collection, query, where, doc, getDoc } from 'firebase/firestore'
import { isAdmin, requestTeacherAccess, getTeacherDoc, teardownListeners, AccessRevokedError, checkAccessRevoked } from '../lib/db'
import useAppStore from './useAppStore'
import useSchoolStore from './useSchoolStore'
import { toast } from '../hooks/useToast'
import { bootSequence } from '../lib/boot'

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
  loginError:    null,   // null | 'access-revoked' — sinaliza para LoginPage motivo de signOut forçado
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

    // Limpa flag de erro de login residual de boots anteriores. LoginPage
    // (issue #485) lê este campo para exibir banner de "access-revoked".
    set({ loginError: null })

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
  // removida em runtime. Limpa listeners de dados, cruza com checkAccessRevoked
  // para detectar o tipo de revogação (parcial vs total) e:
  //  - fullyRevoked: replica o mesmo fluxo de signOut/toast/loginError do
  //    _resolveRole — assim o usuário cai na LoginPage com banner #485.
  //  - parcial: filtra availableSchools com revokedSchoolIds (evita re-pending
  //    na escola revogada por race entre snapshot users/{uid} e removed_users)
  //    e seleciona a próxima escola limpa, ou cai em /no-school.
  _handleMembershipRevoked: async () => {
    const user = get().user
    if (!user) return

    // 1. Cancelar listeners de dados da escola removida ANTES de qualquer
    // leitura/signOut — sem isso, listeners ativos (teachers, schedules) podem
    // disparar permission-denied imediatamente após a revogação.
    try { teardownListeners() } catch (e) { console.warn('[membership] teardownListeners:', e) }
    try { useAppStore.getState().cleanupLazyListeners() } catch (e) { console.warn('[membership] cleanupLazyListeners:', e) }

    // 2. Cruzar com checkAccessRevoked para distinguir revogação parcial de
    // total. Releitura de users/{uid} é necessária — o listener de membership
    // entrega apenas o snap atual, mas precisamos do helper puro que combina
    // removedFrom + leituras defensivas em removed_users/{uid}.
    let userSnap = null
    try {
      userSnap = await getDoc(doc(db, 'users', user.uid))
    } catch (e) {
      console.warn('[membership] leitura users/{uid}:', e)
    }

    let revokeInfo = { revoked: false, fullyRevoked: false, revokedSchoolIds: [] }
    try {
      revokeInfo = await checkAccessRevoked(user.uid, userSnap)
    } catch (e) {
      // Fail-open: se o helper falhar, cai no fluxo de loadAvailableSchools
      // padrão para preservar a UX (não deslogar à toa).
      console.warn('[membership] checkAccessRevoked falhou:', e)
    }

    // 3. fullyRevoked → signOut + redireciona para LoginPage com banner #485.
    // Replica EXATAMENTE o fluxo de _resolveRole.fullyRevoked.
    if (revokeInfo.fullyRevoked === true) {
      get()._unsubPending?.()
      get()._unsubApproval?.()
      get()._unsubMembership?.()
      set({ _unsubPending: null, _unsubApproval: null, _unsubMembership: null })

      try { await signOut(auth) } catch (e) { console.warn('[membership] signOut falhou:', e) }
      try { localStorage.removeItem('gestao_active_school') } catch { /* ignore */ }
      try {
        useSchoolStore.setState({ currentSchoolId: null, currentSchool: null })
      } catch (e) { console.warn('[membership] limpar schoolStore:', e) }
      toast('Seu acesso foi revogado pelo administrador desta escola', 'error')

      set({
        role: null,
        teacher: null,
        isSaasAdmin: false,
        loginError: 'access-revoked',
      })
      return
    }

    // 4. Revogação parcial (ou apenas a escola atual revogada): toast + recarrega.
    toast('Seu acesso a esta escola foi revogado pelo administrador', 'error')

    try {
      await useSchoolStore.getState().loadAvailableSchools(user.uid)
    } catch (e) {
      console.warn('[membership] loadAvailableSchools:', e)
    }

    // 5. Filtrar availableSchools com revokedSchoolIds — defesa contra race
    // entre o snapshot do listener users/{uid} e o índice removedFrom/marker
    // de removed_users. Sem este filtro, setCurrentSchool poderia selecionar
    // uma escola revogada e _resolveRole entraria em fluxo pending nela,
    // criando re-pending na escola revogada (RN-2 da spec Parte 2).
    const revokedSet = new Set(revokeInfo.revokedSchoolIds ?? [])
    const allRemaining = useSchoolStore.getState().availableSchools ?? []
    const remaining = allRemaining.filter(s => !revokedSet.has(s.schoolId))

    // 6. Selecionar próxima escola limpa ou cair em /no-school
    if (remaining.length > 0) {
      // Multi-escola: selecionar primeira disponível NÃO revogada.
      // setCurrentSchool dispara o subscribe de useSchoolStore que chama
      // _resolveRole automaticamente, atualizando role/teacher na nova escola.
      try {
        await useSchoolStore.getState().setCurrentSchool(remaining[0].schoolId)
      } catch (e) {
        console.warn('[membership] setCurrentSchool:', e)
      }
    } else {
      // Sem escolas limpas: limpa currentSchoolId. App.jsx detecta
      // !isSaasAdmin && availableSchools.length === 0 e redireciona para /no-school.
      useSchoolStore.setState({ currentSchoolId: null, currentSchool: null })
      try { localStorage.removeItem('gestao_active_school') } catch { /* ignore */ }
    }
  },

  // userSnapHint: snapshot de users/{uid} já lido em loadAvailableSchools.
  // Quando presente, evita uma segunda leitura ao Firestore no step 3.
  // Quando ausente (re-resolve por troca de escola), o step 3 lê normalmente.
  _resolveRole: async (user, userSnapHint) => {
    const { currentSchoolId: schoolIdRaw, availableSchools: rawAvailableSchools } = useSchoolStore.getState()
    let schoolId = schoolIdRaw
    let availableSchools = rawAvailableSchools ?? []
    console.log('[auth._resolveRole] start', { uid: user.uid, email: user.email, schoolId })

    // ── 1. Determinar flag SaaS admin ────────────────────────────────────────
    const isSuperUser = SUPER_USERS.includes(user.email?.toLowerCase())
    // Se já sabemos que é SaaS admin (ex: re-resolve após troca de escola),
    // evita a chamada ao Firestore /admins/{email} — economia de 1 RTT.
    const alreadyKnownSaasAdmin = get().isSaasAdmin
    const isSaasAdminFlag = alreadyKnownSaasAdmin || isSuperUser || await isAdmin(user.email)
    set({ isSaasAdmin: isSaasAdminFlag })

    // ── 2. Ler userSnap (reutiliza hint quando disponível) ───────────────────
    let userSnap = userSnapHint ?? null
    if (!userSnap) {
      try {
        userSnap = await getDoc(doc(db, 'users', user.uid))
      } catch (e) {
        console.warn('[auth] leitura users/{uid}:', e)
      }
    }
    console.log('[auth._resolveRole] users/{uid} exists?', userSnap?.exists?.(), userSnapHint ? '(hint reutilizado)' : '(lido do Firestore)')

    // ── 2b. Verificar revogação de acesso (apenas usuários comuns) ───────────
    // SaaS admin pula a checagem porque seu acesso não depende de
    // users/{uid}.schools nem de removedFrom. Para os demais, consulta o helper
    // puro checkAccessRevoked, que combina removedFrom (índice em users/{uid})
    // com leituras defensivas em schools/{id}/removed_users/{uid}.
    if (!isSaasAdminFlag) {
      let revokeInfo = { revoked: false, fullyRevoked: false, revokedSchoolIds: [] }
      try {
        // Passa availableSchools + currentSchoolId como hint para suprimir o
        // fallback getDocs(schools) sempre que possível — neste contexto já
        // temos a lista de escolas carregada por loadAvailableSchools, não
        // precisamos varrer novamente. O currentSchoolId cobre o caso onde o
        // user está em fluxo pending (sem availableSchools) mas tem uma escola
        // ativa selecionada via /join/{slug}. Issue #479.
        const knownIds = [
          ...((availableSchools ?? []).map(s => s.schoolId)),
          schoolId,
        ].filter(Boolean)
        revokeInfo = await checkAccessRevoked(user.uid, userSnap, knownIds)
      } catch (e) {
        // Fail-open: erro inesperado no helper não deve bloquear login válido.
        // Loga e prossegue como se não houvesse revogação detectada.
        console.warn('[auth._resolveRole] checkAccessRevoked falhou, prosseguindo:', e)
      }
      console.log('[auth._resolveRole] checkAccessRevoked →', revokeInfo)

      if (revokeInfo.fullyRevoked === true) {
        // ── Revogação total: força signOut e redireciona para LoginPage ──────
        // Cancela listeners ativos antes do signOut para evitar leituras
        // pós-revogação que retornariam permission-denied.
        get()._unsubPending?.()
        get()._unsubApproval?.()
        get()._unsubMembership?.()
        set({ _unsubPending: null, _unsubApproval: null, _unsubMembership: null })

        try { await signOut(auth) } catch (e) { console.warn('[auth] signOut falhou:', e) }
        try { localStorage.removeItem('gestao_active_school') } catch { /* ignore */ }
        try {
          useSchoolStore.setState({ currentSchoolId: null, currentSchool: null })
        } catch (e) { console.warn('[auth] limpar schoolStore:', e) }
        toast('Seu acesso foi revogado pelo administrador desta escola', 'error')

        set({
          role: null,
          teacher: null,
          isSaasAdmin: false,
          loginError: 'access-revoked',
        })
        return
      }

      if (revokeInfo.revoked === true && revokeInfo.fullyRevoked === false) {
        // ── Revogação parcial: filtra availableSchools localmente ────────────
        // Não muta useSchoolStore para evitar disparar subscribe que re-chamaria
        // _resolveRole em cascata. A filtragem local é suficiente para que
        // bootSequence resolva o schoolId correto.
        const revokedSet = new Set(revokeInfo.revokedSchoolIds)
        availableSchools = availableSchools.filter(s => !revokedSet.has(s.schoolId))

        // Se a escola ativa salva está revogada, limpa LS e reseta
        // currentSchoolId no store antes de bootSequence — sem isso, a
        // bootSequence usaria savedSchoolId stale como candidato.
        if (schoolId && revokedSet.has(schoolId)) {
          try { localStorage.removeItem('gestao_active_school') } catch { /* ignore */ }
          try {
            useSchoolStore.setState({ currentSchoolId: null, currentSchool: null })
          } catch (e) { console.warn('[auth] limpar schoolStore (parcial):', e) }
          schoolId = null
        }
      }
    }

    // ── 3. bootSequence decide role e listeners ───────────────────────────────
    // Passamos currentSchoolId como savedSchoolId para que bootSequence resolva
    // a entry correta em userSnap.schools[schoolId]. O schoolId já foi
    // restaurado pelo useSchoolStore.init antes desta chamada.
    const result = bootSequence(user, userSnap, availableSchools, schoolId, isSaasAdminFlag)
    console.log('[auth._resolveRole] bootSequence →', result)

    // ── 3b. fullyRevoked detectado pela heurística do bootSequence ────────────
    // Issue #480: bootSequence sinaliza fullyRevoked quando users/{uid} existe
    // mas schools={} e nenhuma escola disponível listou ele (caso legado, antes
    // do deploy do índice removedFrom). Replica EXATAMENTE o fluxo do step 2b
    // (revogação total via checkAccessRevoked): cancela listeners, signOut,
    // limpa LS + schoolStore, dispara toast e seta loginError. SaaS admin
    // não passa por aqui (bootSequence retorna fullyRevoked=false na branch
    // isSuperUser=true), mas mantemos a guarda explícita por defesa em
    // profundidade.
    if (result.fullyRevoked === true && !isSaasAdminFlag) {
      get()._unsubPending?.()
      get()._unsubApproval?.()
      get()._unsubMembership?.()
      set({ _unsubPending: null, _unsubApproval: null, _unsubMembership: null })

      try { await signOut(auth) } catch (e) { console.warn('[auth] signOut falhou:', e) }
      try { localStorage.removeItem('gestao_active_school') } catch { /* ignore */ }
      try {
        useSchoolStore.setState({ currentSchoolId: null, currentSchool: null })
      } catch (e) { console.warn('[auth] limpar schoolStore:', e) }
      toast('Seu acesso foi revogado pelo administrador desta escola', 'error')

      set({
        role: null,
        teacher: null,
        isSaasAdmin: false,
        loginError: 'access-revoked',
      })
      return
    }

    // ── 4. Aplicar role ───────────────────────────────────────────────────────
    if (result.role === null) {
      // role null sem isSaasAdmin indica cadastro rejeitado, login órfão
      // (sem nenhum vínculo em Firestore), ou usuário com schools={} sem
      // sinal claro de revogação. Em todos os casos, a UX deve ser a mesma:
      // signOut imediato + mensagem clara na LoginPage + toast.
      if (!isSaasAdminFlag) {
        console.log('[auth._resolveRole] sem cadastro válido, deslogando')

        // Cancelar listeners ativos antes do signOut
        get()._unsubPending?.()
        get()._unsubApproval?.()
        get()._unsubMembership?.()
        set({ _unsubPending: null, _unsubApproval: null, _unsubMembership: null })

        try { await signOut(auth) } catch (e) { console.warn('[auth] signOut falhou:', e) }
        try { localStorage.removeItem('gestao_active_school') } catch { /* ignore */ }
        try {
          useSchoolStore.setState({ currentSchoolId: null, currentSchool: null })
        } catch (e) { console.warn('[auth] limpar schoolStore:', e) }

        // Distingue mensagens: usuário com entry rejected → 'access-rejected';
        // usuário sem nenhum vínculo (login órfão / não cadastrado) → 'no-access'.
        const userExists = userSnap?.exists?.() === true
        const schoolsMap = userExists ? (userSnap.data()?.schools ?? {}) : {}
        const hasRejectedEntry = Object.values(schoolsMap).some(
          v => typeof v === 'object' && v !== null && (v.role === 'rejected' || v.status === 'rejected')
        )

        const errorCode = hasRejectedEntry ? 'access-rejected' : 'no-access'
        const message = hasRejectedEntry
          ? 'Seu cadastro foi rejeitado. Procure o administrador da escola.'
          : 'Você ainda não tem acesso a nenhuma escola. Peça ao administrador o link de convite.'

        toast(message, 'error')

        set({
          role: null,
          teacher: null,
          isSaasAdmin: false,
          loginError: errorCode,
        })
      }
      return
    }

    if (result.role === 'admin') {
      get()._unsubPending?.()
      if (result.startPendingListener && result.schoolId) {
        const pendingSchoolId = result.schoolId
        const unsub = onSnapshot(
          query(
            collection(db, 'schools', pendingSchoolId, 'pending_teachers'),
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

    if (result.role !== 'pending') {
      // teacher / coordinator / teacher-coordinator
      // Buscar documento do professor para popular useAuthStore.teacher
      if (userSnap?.exists?.()) {
        const schoolEntry = userSnap.data()?.schools?.[result.schoolId ?? schoolId]
        const teacherDocId = schoolEntry?.teacherDocId ?? null
        const teacherDoc = await getTeacherDoc(result.schoolId ?? schoolId, teacherDocId, user.email)
        set({ role: result.role, teacher: teacherDoc })
      } else {
        set({ role: result.role, teacher: null })
      }
      return
    }

    // ── 5. Fluxo pending ───────────────────────────────────────────────────────
    // IMPORTANTE: nunca recriar users/{uid}.schools[schoolId] no client.
    // Toda escrita de membership é exclusivamente via Cloud Function (approveTeacher,
    // joinSchoolAsAdmin, removeTeacherFromSchool). Cliente só LÊ.
    const pendingSchoolId = result.schoolId ?? schoolId
    console.log('[auth._resolveRole] step pending: registrando listener de aprovação em', `schools/${pendingSchoolId}/pending_teachers/${user.uid}`)
    set({ role: 'pending' })

    if (pendingSchoolId) {
      try {
        await requestTeacherAccess(pendingSchoolId, user)
      } catch (e) {
        if (e instanceof AccessRevokedError) {
          // Acesso revogado pelo admin — não mantém pending, deixa em estado
          // sem role para que App.jsx redirecione para /no-school via fluxo normal.
          console.warn('[auth._resolveRole] acesso revogado para', user.email, 'na escola', pendingSchoolId)
          toast('Seu acesso a esta escola foi revogado pelo administrador', 'err')
          // Limpa contexto local da escola para que o App caia em /no-school
          try { localStorage.removeItem('gestao_active_school') } catch { /* ignore */ }
          useSchoolStore.setState({ currentSchoolId: null, currentSchool: null })
          set({ role: null, teacher: null })
          return
        }
        console.error('[auth._resolveRole] requestTeacherAccess FAIL', { schoolId: pendingSchoolId, uid: user.uid, code: e.code, message: e.message })
      }
    }

    if (!result.startApprovalListener || !pendingSchoolId) return

    // Cancelar listener anterior, se existir (idempotência)
    get()._unsubApproval?.()
    set({ _unsubApproval: null })

    const pendingDocRef = doc(db, 'schools', pendingSchoolId, 'pending_teachers', user.uid)
    const unsub = onSnapshot(
      pendingDocRef,
      async snap => {
        console.log('[auth.approvalListener] dispara, exists?', snap.exists(), `— listening to schools/${pendingSchoolId}/pending_teachers/${user.uid}`)
        if (!snap.exists()) {
          unsub()
          set({ _unsubApproval: null })
          // A Cloud Function approveTeacher/rejectTeacher já escreveu users/{uid}.
          // Releia o role do users/{uid} atualizado.
          try {
            const userSnap = await getDoc(doc(db, 'users', user.uid))
            if (userSnap.exists()) {
              const entry = userSnap.data().schools?.[pendingSchoolId]
              const newRole = entry?.role
              const newStatus = entry?.status
              console.log('[auth.approvalListener] users/{uid} atualizado:', { newRole, newStatus, schoolId: pendingSchoolId })
              if (newStatus === 'approved' && newRole && newRole !== 'pending') {
                const normalized = newRole === 'coordinator' ? 'coordinator'
                  : newRole === 'teacher-coordinator' ? 'teacher-coordinator'
                  : newRole === 'admin' ? 'admin'
                  : 'teacher'
                let teacherDoc = null
                if (normalized !== 'admin') {
                  const teacherDocId = entry?.teacherDocId ?? null
                  teacherDoc = await getTeacherDoc(pendingSchoolId, teacherDocId, user.email)
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
    // Limpa flag de "access-revoked" antes de nova tentativa para que o
    // banner da LoginPage suma ao iniciar o popup (UX limpa em retry).
    set({ loginError: null })
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
