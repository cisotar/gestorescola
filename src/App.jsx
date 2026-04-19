import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './store/useAuthStore'
import useAppStore from './store/useAppStore'
import { loadFromFirestore, setupRealtimeListeners } from './lib/db'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import PendingPage from './pages/PendingPage'
import DashboardPage from './pages/DashboardPage'
import HomePage from './pages/HomePage'
import CalendarPage from './pages/CalendarPage'
import CalendarDayPage from './pages/CalendarDayPage'
import AbsencesPage from './pages/AbsencesPage'
import SubstitutionsPage from './pages/SubstitutionsPage'
import SettingsPage from './pages/SettingsPage'
import WorkloadPage from './pages/WorkloadPage'
import ScheduleRedirect from './pages/ScheduleRedirect'
import SchoolScheduleRedirect from './pages/SchoolScheduleRedirect'
import GradesPage from './pages/GradesPage'
import RankingPage from './pages/RankingPage'
import Toast from './components/ui/Toast'
import Spinner from './components/ui/Spinner'

export default function App() {
  const { loading, role, init, isCoordinator } = useAuthStore()
  const isAdmin        = role === 'admin'
  const canAccessAdmin = isAdmin || isCoordinator()
  const { hydrate, setTeachers, teachers, loaded } = useAppStore()

  // 1. Carrega Firestore e inicia listeners em tempo real
  useEffect(() => {
    let active = true
    let unsubscribes = []
    loadFromFirestore().then(data => {
      if (!active) return
      hydrate(data)
      unsubscribes = setupRealtimeListeners(useAppStore.getState())
    })
    return () => {
      active = false
      unsubscribes.forEach(unsub => unsub?.())
    }
  }, [])

  // 2. Inicia auth depois que teachers carregou
  useEffect(() => {
    if (!loaded) return
    init(teachers)
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
          <Route path="/workload"  element={<WorkloadPage />} />
          <Route path="/schedule"  element={<ScheduleRedirect />} />
          <Route path="/school-schedule" element={<SchoolScheduleRedirect />} />
          <Route path="/grades"  element={<GradesPage />} />
          <Route path="*"          element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
      <Toast />
    </>
  )
}
