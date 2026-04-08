import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './store/useAuthStore'
import useAppStore from './store/useAppStore'
import { loadFromFirestore } from './lib/db'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import PendingPage from './pages/PendingPage'
import DashboardPage from './pages/DashboardPage'
import HomePage from './pages/HomePage'
import CalendarPage from './pages/CalendarPage'
import AbsencesPage from './pages/AbsencesPage'
import SettingsPage from './pages/SettingsPage'
import Toast from './components/ui/Toast'
import Spinner from './components/ui/Spinner'

export default function App() {
  const { loading, role, init } = useAuthStore()
  const isAdmin = role === 'admin'
  const { hydrate, teachers, loaded } = useAppStore()

  // 1. Carrega Firestore
  useEffect(() => {
    loadFromFirestore().then(data => hydrate(data))
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
          <Route path="/calendar"  element={<CalendarPage />} />
          <Route path="/absences"  element={<AbsencesPage />} />
          <Route path="/settings"  element={<SettingsPage />} />
          <Route path="*"          element={<Navigate to={isAdmin ? '/dashboard' : '/home'} replace />} />
        </Route>
      </Routes>
      <Toast />
    </>
  )
}
