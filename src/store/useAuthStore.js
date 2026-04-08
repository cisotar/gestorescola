import { create } from 'zustand'
import { auth, provider } from '../lib/firebase'
import { signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth'
import { isAdmin, getTeacherByEmail, requestTeacherAccess, listPendingTeachers } from '../lib/db'

const useAuthStore = create((set, get) => ({
  user:      null,
  role:      null,   // 'admin' | 'teacher' | 'pending' | null
  teacher:   null,
  loading:   true,
  pendingCt: 0,

  // ─── Init ──────────────────────────────────────────────────────────────────
  init: async (teachers) => {
    // Aguarda o Firebase processar o resultado do redirect ANTES de registrar
    // o listener. Sem isso, onAuthStateChanged dispara null (estado anterior
    // ao redirect) e a app pisca na LoginPage antes de mostrar PendingPage.
    try { await getRedirectResult(auth) }
    catch (e) { console.warn('[auth redirect]', e.code, e.message) }

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
    try { await signInWithRedirect(auth, provider) }
    catch (e) { alert('Erro ao fazer login: ' + e.message) }
  },

  logout: () => signOut(auth),

  isAdmin:   () => get().role === 'admin',
  isTeacher: () => get().role === 'teacher',
  isPending: () => get().role === 'pending',
}))

export default useAuthStore
