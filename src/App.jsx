import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import useAuthStore from './store/useAuthStore'
import useAppStore from './store/useAppStore'
import useSchoolStore from './store/useSchoolStore'
import { loadFromFirestore, setupRealtimeListeners, teardownListeners } from './lib/db'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import PendingPage from './pages/PendingPage'
import Toast from './components/ui/Toast'
import Spinner from './components/ui/Spinner'

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
const JoinPage = lazy(() => import('./pages/JoinPage'))

export default function App() {
  const { loading, role, init, isCoordinator } = useAuthStore()
  const isAdmin        = role === 'admin'
  const canAccessAdmin = isAdmin || isCoordinator()
  const { hydrate, loaded } = useAppStore()
  const currentSchoolId = useSchoolStore(s => s.currentSchoolId)
  const { pathname } = useLocation()

  // 1. Inicializa auth (resolve role) assim que o componente monta.
  useEffect(() => {
    init()
  }, [])

  // 2. Carrega dados do Firestore e inicia listeners quando o role e schoolId
  // estiverem resolvidos — mas apenas para usuários aprovados (não pending).
  // Professores pendentes não têm permissão para ler teachers/schedules.
  useEffect(() => {
    if (loading) return          // auth ainda não resolveu
    if (!role) {                 // não logado — libera spinner para rotas públicas
      hydrate({})
      return
    }
    if (role === 'pending') {
      hydrate({})                // marca loaded para sair do spinner
      return
    }
    if (!currentSchoolId) {
      hydrate({})
      return
    }

    let active = true

    async function loadData() {
      teardownListeners()
      const data = await loadFromFirestore(currentSchoolId)
      if (!active || !data) return
      hydrate(data)
      setupRealtimeListeners(currentSchoolId, useAppStore.getState())
    }

    loadData()

    return () => {
      active = false
    }
  }, [role, currentSchoolId, loading])

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

  // Gate reativo por role (RN-7 / RN-8):
  // `role` vem de useAuthStore() (subscribe Zustand). Quando o listener de
  // aprovação em _resolveRole faz `set({ role: 'teacher'|'coordinator'|... })`,
  // este componente re-renderiza, sai dos retornos antecipados de pending/login
  // e cai no bloco de <Routes> abaixo. O <Route index> com Navigate to="/home"
  // garante que a transição pós-aprovação (ou reload pós-aprovação) leve à
  // HomePage sem necessidade de reload manual nem de useNavigate explícito.
  // Não logado → tela de login (exceto /join/ que gerencia auth internamente)
  if (!role && !pathname.startsWith('/join/')) return (
    <>
      <LoginPage />
      <Toast />
    </>
  )

  // Pendente → página de espera (exceto /join/ que pode redirecionar o pendente)
  if (role === 'pending' && !pathname.startsWith('/join/')) return (
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
          <Route path="/join/:slug" element={<JoinPage />} />
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
