import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './store/useAuthStore'
import useAppStore from './store/useAppStore'
import { loadFromFirestore } from './lib/db'
import { onSnapshot, collection } from 'firebase/firestore'
import { db } from './lib/firebase'
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
import SchedulePage from './pages/SchedulePage'
import SchoolSchedulePage from './pages/SchoolSchedulePage'
import Toast from './components/ui/Toast'
import Spinner from './components/ui/Spinner'

export default function App() {
  const { loading, role, init } = useAuthStore()
  const isAdmin = role === 'admin'
  const { hydrate, setTeachers, teachers, loaded } = useAppStore()

  // 1. Carrega Firestore e inicia listener em tempo real de professores
  useEffect(() => {
    let unsub
    loadFromFirestore().then(data => {
      hydrate(data)
      unsub = onSnapshot(
        collection(db, 'teachers'),
        snap => setTeachers(snap.docs.map(d => d.data())),
        err  => console.warn('[teachersListener]', err)
      )
    })
    return () => unsub?.()
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
          <Route index element={<Navigate to={isAdmin ? '/dashboard' : '/home'} replace />} />
          <Route path="/home"      element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/calendar"      element={<CalendarPage />} />
          <Route path="/calendar/day"  element={<CalendarDayPage />} />
          <Route path="/absences"       element={<AbsencesPage />} />
          <Route path="/substitutions"  element={<SubstitutionsPage />} />
          <Route path="/settings"  element={<SettingsPage />} />
          <Route path="/workload"  element={<WorkloadPage />} />
          <Route path="/schedule"  element={<SchedulePage />} />
          <Route path="/school-schedule" element={<SchoolSchedulePage />} />
          <Route path="*"          element={<Navigate to={isAdmin ? '/dashboard' : '/home'} replace />} />
        </Route>
      </Routes>
      <Toast />
    </>
  )
}
