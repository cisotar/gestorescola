import { create } from 'zustand'
import { auth, provider, db } from '../lib/firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { onSnapshot, collection, query, where, doc, getDoc } from 'firebase/firestore'
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

  // ─── Init ──────────────────────────────────────────────────────────────────
  init: () => {
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
      set({ role: 'pending' })
      return
    }

    // ── 3. Lê role de users/{uid}.schools[schoolId] ──────────────────────────
    try {
      const userSnap = await getDoc(doc(db, 'users', user.uid))
      if (userSnap.exists()) {
        const schoolEntry = userSnap.data().schools?.[schoolId]
        const localRole = typeof schoolEntry === 'object' && schoolEntry !== null
          ? schoolEntry?.role ?? null
          : null
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
    set({ role: 'pending' })
    try { await requestTeacherAccess(schoolId, user) } catch {}
    get()._unsubApproval?.()
    const pendingDocRef = doc(db, 'schools', schoolId, 'pending_teachers', user.uid)
    const unsub = onSnapshot(
      pendingDocRef,
      async snap => {
        if (!snap.exists()) {
          unsub()
          set({ _unsubApproval: null })
          // Relê role de users/{uid} após aprovação
          const sid = useSchoolStore.getState().currentSchoolId
          if (!sid) return
          try {
            const userSnap = await getDoc(doc(db, 'users', user.uid))
            if (userSnap.exists()) {
              const schoolEntry = userSnap.data().schools?.[sid]
              const localRole = typeof schoolEntry === 'object' && schoolEntry !== null
                ? schoolEntry?.role ?? null
                : null
              if (localRole && localRole !== 'pending') {
                set({
                  role: localRole === 'coordinator' ? 'coordinator'
                    : localRole === 'teacher-coordinator' ? 'teacher-coordinator'
                    : localRole === 'admin' ? 'admin'
                    : 'teacher',
                })
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
    set({ _unsubPending: null, _unsubApproval: null })
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
