import { create } from 'zustand'
import { auth, provider, db } from '../lib/firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { onSnapshot, collection, query, where, doc, getDoc, setDoc, getDocs } from 'firebase/firestore'
import { isAdmin, requestTeacherAccess } from '../lib/db'
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
  _unsubPending: null,
  _unsubApproval:null,
  _unsubSchoolSub: null,

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
      if (state.currentSchoolId === prevState.currentSchoolId) return
      const user = get().user
      if (!user) return
      try {
        await get()._resolveRole(user)
      } catch (e) {
        console.warn('[auth] re-resolve role on schoolId change:', e)
      }
    })
    set({ _unsubSchoolSub: unsubSchool })

    return new Promise(resolve => {
      onAuthStateChanged(auth, async user => {
        set({ user, role: null, teacher: null })
        if (user) {
          await useSchoolStore.getState().init(user.uid)
          await get()._resolveRole(user)
        }
        set({ loading: false })
        resolve()
      })
    })
  },

  _resolveRole: async (user) => {
    const schoolId = useSchoolStore.getState().currentSchoolId
    console.log('[auth._resolveRole] start', { uid: user.uid, email: user.email, schoolId })

    // ── 1. Super-admin SaaS: bypass total, role admin garantido ──────────────
    const isSuperUser = SUPER_USERS.includes(user.email?.toLowerCase())
    if (isSuperUser || await isAdmin(user.email)) {
      get()._unsubPending?.()
      const pendingRef = schoolId
        ? query(
            collection(db, 'schools', schoolId, 'pending_teachers'),
            where('status', '==', 'pending')
          )
        : query(collection(db, 'pending_teachers'), where('status', '==', 'pending'))
      if (!schoolId) console.warn('[auth] super-admin sem schoolId — usando fallback global de pending_teachers')
      const unsub = onSnapshot(
        pendingRef,
        snap => set({ pendingCt: snap.size }),
        err  => console.warn('[pendingCt]', err)
      )
      set({ role: 'admin', pendingCt: 0, _unsubPending: unsub })
      return
    }

    // ── 2. Guard: sem schoolId não é possível determinar role ────────────────
    if (!schoolId) {
      console.log('[auth._resolveRole] step 2: sem schoolId → role=pending')
      set({ role: 'pending' })
      return
    }

    // ── 3. Lê role de users/{uid}.schools[schoolId] ──────────────────────────
    try {
      const userSnap = await getDoc(doc(db, 'users', user.uid))
      console.log('[auth._resolveRole] step 3: users/{uid} exists?', userSnap.exists(), 'data:', userSnap.exists() ? userSnap.data() : null)
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
            set({ role: normalized })
          }
          return
        }
      }
    } catch (e) { console.warn('[auth] leitura users/{uid}:', e) }

    // ── 4. Sem role → fluxo pending ───────────────────────────────────────────
    console.log('[auth._resolveRole] step 4: registrando listener de aprovação em', `schools/${schoolId}/pending_teachers/${user.uid}`)
    set({ role: 'pending' })
    try { await requestTeacherAccess(schoolId, user) } catch (e) { console.warn('[auth._resolveRole] requestTeacherAccess fail:', e) }
    get()._unsubApproval?.()
    const pendingDocRef = doc(db, 'schools', schoolId, 'pending_teachers', user.uid)
    const unsub = onSnapshot(
      pendingDocRef,
      async snap => {
        console.log('[auth.approvalListener] dispara, exists?', snap.exists())
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
              console.log('[auth.approvalListener] users/{uid} atualizado:', { newRole, newStatus })
              if (newStatus === 'approved' && newRole && newRole !== 'pending') {
                const normalized = newRole === 'coordinator' ? 'coordinator'
                  : newRole === 'teacher-coordinator' ? 'teacher-coordinator'
                  : newRole === 'admin' ? 'admin'
                  : 'teacher'
                set({ role: normalized })
              } else if (newStatus === 'rejected') {
                console.log('[auth.approvalListener] cadastro rejeitado, deslogando')
                set({ role: null })
                await signOut(auth)
              }
            }
          } catch (e) { console.warn('[approvalListener]', e) }
        }
      },
      err => console.warn('[approvalListener]', err)
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
    set({ _unsubPending: null, _unsubApproval: null, _unsubSchoolSub: null })
    useAppStore.getState().cleanupLazyListeners()
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
