import { create } from 'zustand'
import { auth, provider, db } from '../lib/firebase'
import { signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth'
import { onSnapshot, collection, query, where, doc } from 'firebase/firestore'
import { isAdmin, getTeacherByEmail, requestTeacherAccess } from '../lib/db'
import useAppStore from './useAppStore'

const useAuthStore = create((set, get) => ({
  user:          null,
  role:          null,   // 'admin' | 'coordinator' | 'teacher-coordinator' | 'teacher' | 'pending' | null
  teacher:       null,
  loading:       true,
  pendingCt:     0,
  _unsubPending: null,
  _unsubApproval:null,

  // ─── Init ──────────────────────────────────────────────────────────────────
  init: (teachers) => {
    return new Promise(resolve => {
      onAuthStateChanged(auth, async user => {
        set({ user, role: null, teacher: null })
        if (user) await get()._resolveRole(user, teachers)
        set({ loading: false })
        resolve()
      })
    })
  },

  _resolveRole: async (user, teachers) => {
    if (await isAdmin(user.email)) {
      const q = query(collection(db, 'pending_teachers'), where('status', '==', 'pending'))
      const unsub = onSnapshot(
        q,
        snap => set({ pendingCt: snap.size }),
        err  => console.warn('[pendingCt]', err)
      )
      set({ role: 'admin', pendingCt: 0, _unsubPending: unsub })
      return
    }
    try {
      const teacher = await getTeacherByEmail(user.email, teachers)
      if (teacher?.status === 'approved') {
        const profile = teacher.profile ?? 'teacher'
        const role = profile === 'coordinator' ? 'coordinator'
          : profile === 'teacher-coordinator' ? 'teacher-coordinator'
          : 'teacher'
        set({ role, teacher })
        return
      }
    } catch (e) { console.warn('[auth]', e) }
    set({ role: 'pending' })
    try { await requestTeacherAccess(user) } catch {}
    const unsub = onSnapshot(
      doc(db, 'pending_teachers', user.uid),
      async snap => {
        if (!snap.exists()) {
          unsub()
          set({ _unsubApproval: null })
          const teachers = useAppStore.getState().teachers
          const teacher = await getTeacherByEmail(user.email, teachers)
          if (teacher?.status === 'approved') {
            const profile = teacher.profile ?? 'teacher'
            const role = profile === 'coordinator' ? 'coordinator'
              : profile === 'teacher-coordinator' ? 'teacher-coordinator'
              : 'teacher'
            set({ role, teacher })
          }
        }
      },
      err => console.warn('[approvalListener]', err)
    )
    set({ _unsubApproval: unsub })
  },

  login: async () => {
    try { await signInWithRedirect(auth, provider) }
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
