import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './store/useAuthStore'
import useAppStore from './store/useAppStore'
import useSchoolStore from './store/useSchoolStore'
import { loadFromFirestore, setupRealtimeListeners, teardownListeners } from './lib/db'
import { auth } from './lib/firebase'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import PendingPage from './pages/PendingPage'
import Toast from './components/ui/Toast'
import Spinner from './components/ui/Spinner'

// Aguarda o Firebase Auth resolver a sessão antes de retornar.
// Necessário para garantir que leituras autenticadas do Firestore (meta/config,
// teachers, schedules) não sejam disparadas antes do usuário estar autenticado,
// o que causaria falha silenciosa e store vazio (subjects: []).
function waitForAuth() {
  return new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(user => {
      unsub()
      resolve(user)
    })
  })
}

// Lazy-load pages to reduce initial bundle size
const HomePage = lazy(() => import('./pages/HomePage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const CalendarDayPage = lazy(() => import('./pages/CalendarDayPage'))
const AbsencesPage = lazy(() => import('./pages/AbsencesPage'))
const SubstitutionsPage = lazy(() => import('./pages/SubstitutionsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const WorkloadPage = lazy(() => import('./pages/WorkloadPage'))
const ScheduleRedirect = lazy(() => import('./pages/ScheduleRedirect'))
const SchoolScheduleRedirect = lazy(() => import('./pages/SchoolScheduleRedirect'))
const GradesPage = lazy(() => import('./pages/GradesPage'))
const RankingPage = lazy(() => import('./pages/RankingPage'))

export default function App() {
  const { loading, role, init, isCoordinator } = useAuthStore()
  const isAdmin        = role === 'admin'
  const canAccessAdmin = isAdmin || isCoordinator()
  const { hydrate, loaded } = useAppStore()
  const currentSchoolId = useSchoolStore(s => s.currentSchoolId)

  // 1. Aguarda auth resolver, inicializa escolas, carrega Firestore e inicia listeners.
  // Aguardar auth é necessário: meta/config e collections exigem isAuthenticated().
  // Sem isso, o loadFromFirestore falha silenciosamente em primeiro acesso (sem cache)
  // e subjects/areas/segments ficam vazios na PendingPage.
  // O useEffect depende de currentSchoolId para reagir a troca de escola em runtime.
  useEffect(() => {
    let active = true

    async function initApp() {
      // Espera o Firebase Auth resolver o usuário atual
      const user = await waitForAuth()
      if (!active) return

      // Inicializa as escolas disponíveis e restaura escola do localStorage
      if (user) {
        await useSchoolStore.getState().init(user.uid)
      }
      if (!active) return

      const schoolId = useSchoolStore.getState().currentSchoolId

      // Guard: sem schoolId não é possível carregar dados da escola
      if (!schoolId) return

      // Cancela listeners anteriores antes de registrar novos (ex: troca de escola)
      teardownListeners()

      const data = await loadFromFirestore(schoolId)
      if (!active || !data) return

      hydrate(data)
      setupRealtimeListeners(schoolId, useAppStore.getState())
    }

    initApp()

    return () => {
      active = false
    }
  }, [currentSchoolId])

  // 2. Inicia auth depois que dados iniciais carregaram
  useEffect(() => {
    if (!loaded) return
    init()
  }, [loaded])

  // Loading inicial
  if (loading || !loaded) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg">
        <Spinner size={40} />
        <div className="mt-5 text-base font-bold text-t1">
          <span className="text-accent">Gestão</span>Escolar
        </div>
        <div className="mt-1.5 text-sm text-t3">Conectando…</div>
      </div>
    )
  }

  // Não logado → tela de login
  if (!role) return (
    <>
      <LoginPage />
      <Toast />
    </>
  )

  // Pendente → página de espera
  if (role === 'pending') return (
    <>
      <PendingPage />
      <Toast />
    </>
  )

  // App completo
  return (
    <>
      <Suspense fallback={
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg">
          <Spinner size={40} />
          <div className="mt-5 text-base font-bold text-t1">
            <span className="text-accent">Gestão</span>Escolar
          </div>
        </div>
      }>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="/home"      element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/calendar"      element={<CalendarPage />} />
            <Route path="/calendar/day"  element={<CalendarDayPage />} />
            <Route path="/absences"       element={<AbsencesPage />} />
            <Route path="/substitutions"  element={<SubstitutionsPage />} />
            <Route path="/substitutions/ranking" element={<RankingPage />} />
            <Route path="/settings"  element={<SettingsPage />} />
            <Route path="/cargahoraria" element={<WorkloadPage />} />
            <Route path="/workload"     element={<Navigate to="/cargahoraria" replace />} />
            <Route path="/schedule"  element={<ScheduleRedirect />} />
            <Route path="/school-schedule" element={<SchoolScheduleRedirect />} />
            <Route path="/grades"  element={<GradesPage />} />
            <Route path="*"          element={<Navigate to="/home" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <Toast />
    </>
  )
}
