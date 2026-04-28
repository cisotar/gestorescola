import { create } from 'zustand'
import { auth, provider, db } from '../lib/firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { onSnapshot, collection, query, where, doc, getDoc, getDocs, setDoc, deleteDoc, limit } from 'firebase/firestore'
import { isAdmin, requestTeacherAccess, getTeacherDoc } from '../lib/db'
import useAppStore from './useAppStore'
import useSchoolStore from './useSchoolStore'

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
            // init retorna o userSnap lido em loadAvailableSchools para evitar
            // uma segunda leitura de users/{uid} dentro de _resolveRole.
            const userSnap = await useSchoolStore.getState().init(user.uid)
            await get()._resolveRole(user, userSnap)
          } finally {
            set({ _initInProgress: false })
          }
        }
        set({ loading: false })
        resolve()
      })
    })
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

    // ── 3.5. Auto-reconciliação ──────────────────────────────────────────────
    // Se users/{uid} não existe (ou não tem schools[schoolId]), mas já existe
    // teacher aprovado nessa escola com email correspondente, reconciliar:
    // criar users/{uid}.schools[schoolId] derivado do teacher doc e limpar
    // pending_teachers órfão. Cobre casos onde approveTeacher() rodou em
    // versão anterior do sistema sem escrever users/{uid}, ou foi feito
    // manualmente.
    try {
      const email = (user.email ?? '').toLowerCase()
      if (email) {
        const teacherSnap = await getDocs(
          query(
            collection(db, 'schools', schoolId, 'teachers'),
            where('email', '==', email),
            limit(1)
          )
        )
        if (!teacherSnap.empty) {
          const teacherDoc = teacherSnap.docs[0]
          const teacherData = teacherDoc.data()
          if (teacherData.status === 'approved') {
            const teacherProfile = teacherData.profile ?? 'teacher'
            const reconciledRole = teacherProfile === 'coordinator' ? 'coordinator'
              : teacherProfile === 'teacher-coordinator' ? 'teacher-coordinator'
              : teacherProfile === 'admin' ? 'admin'
              : 'teacher'
            console.log('[auth._resolveRole] step 3.5: reconciliando users/{uid} a partir de teachers/' + teacherDoc.id, { reconciledRole })
            await setDoc(doc(db, 'users', user.uid), {
              email,
              schools: {
                [schoolId]: {
                  role: reconciledRole,
                  status: 'approved',
                  teacherDocId: teacherDoc.id,
                },
              },
              reconciledAt: new Date().toISOString(),
              reconciledFrom: 'auto_resolveRole',
            }, { merge: true })
            // Limpar pending_teachers órfão se existir
            try {
              await deleteDoc(doc(db, 'schools', schoolId, 'pending_teachers', user.uid))
            } catch { /* ok se não existir */ }
            // Popular store
            const fullTeacherDoc = await getTeacherDoc(schoolId, teacherDoc.id, user.email)
            if (reconciledRole === 'admin') {
              get()._unsubPending?.()
              const unsub = onSnapshot(
                query(
                  collection(db, 'schools', schoolId, 'pending_teachers'),
                  where('status', '==', 'pending')
                ),
                snap => set({ pendingCt: snap.size }),
                err  => console.warn('[pendingCt]', err)
              )
              set({ role: 'admin', teacher: null, pendingCt: 0, _unsubPending: unsub })
            } else {
              set({ role: reconciledRole, teacher: fullTeacherDoc })
            }
            return
          }
        }
      }
    } catch (e) { console.warn('[auth._resolveRole] step 3.5 reconciliação falhou:', e) }

    // ── 4. Sem role → fluxo pending ───────────────────────────────────────────
    console.log('[auth._resolveRole] step 4: registrando listener de aprovação em', `schools/${schoolId}/pending_teachers/${user.uid}`)
    set({ role: 'pending' })
    try { await requestTeacherAccess(schoolId, user) } catch (e) { console.error('[auth._resolveRole] requestTeacherAccess FAIL', { schoolId, uid: user.uid, code: e.code, message: e.message }) }

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
    set({ _unsubPending: null, _unsubApproval: null, _unsubSchoolSub: null, isSaasAdmin: false })
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
