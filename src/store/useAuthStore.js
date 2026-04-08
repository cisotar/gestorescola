import { create } from 'zustand'
import { auth, provider } from '../lib/firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { isAdmin, getTeacherByEmail, requestTeacherAccess, listPendingTeachers } from '../lib/db'

const useAuthStore = create((set, get) => ({
  user:      null,
  role:      null,   // 'admin' | 'teacher' | 'pending' | null
  teacher:   null,
  loading:   true,
  pendingCt: 0,

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
      let pendingCt = 0
      try { pendingCt = (await listPendingTeachers()).length } catch {}
      set({ role: 'admin', pendingCt })
      return
    }
    try {
      const teacher = await getTeacherByEmail(user.email, teachers)
      if (teacher?.status === 'approved') {
        set({ role: 'teacher', teacher })
        return
      }
    } catch (e) { console.warn('[auth]', e) }
    set({ role: 'pending' })
    try { await requestTeacherAccess(user) } catch {}
  },

  login: async () => {
    try { await signInWithPopup(auth, provider) }
    catch (e) { if (e.code !== 'auth/popup-closed-by-user') alert('Erro ao fazer login: ' + e.message) }
  },

  logout: () => signOut(auth),

  isAdmin:   () => get().role === 'admin',
  isTeacher: () => get().role === 'teacher',
  isPending: () => get().role === 'pending',
}))

export default useAuthStore
