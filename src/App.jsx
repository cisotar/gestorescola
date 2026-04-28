import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import useAuthStore from './store/useAuthStore'
import useAppStore from './store/useAppStore'
import useSchoolStore from './store/useSchoolStore'
import useNetworkStore from './store/useNetworkStore'
import { loadFromFirestore, setupRealtimeListeners, teardownListeners } from './lib/db'
import { _loadConfig } from './lib/db/config'
import { _loadCol } from './lib/db'
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
const NoSchoolPage = lazy(() => import('./pages/NoSchoolPage'))
const AdminPanelPage = lazy(() => import('./pages/AdminPanelPage'))

export default function App() {
  const { loading, role, init, isCoordinator, isSaasAdmin } = useAuthStore()
  const isAdmin        = role === 'admin'
  const canAccessAdmin = isAdmin || isCoordinator()
  const { hydrate, loaded } = useAppStore()
  const currentSchoolId    = useSchoolStore(s => s.currentSchoolId)
  const availableSchools   = useSchoolStore(s => s.availableSchools)
  const { pathname } = useLocation()

  // Track role changes from pending to approved (for diagnostics)
  useEffect(() => {
    if (role && role !== 'pending') {
      console.log('[app] Role mudou para aprovado:', role, '— re-renderizando Routes')
    }
  }, [role])

  // 1. Inicializa auth (resolve role) assim que o componente monta.
  // Também inicializa o useNetworkStore para registrar listeners online/offline
  // em window — chamada síncrona, independente do auth (não precisa await).
  useEffect(() => {
    useNetworkStore.getState().init()
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
      // Professor pendente: carrega config (subjects/areas/segments) para a
      // PendingPage exibir matérias, e schedules (somente os próprios) para
      // permitir cadastro provisório da grade horária. Rules permitem via
      // isPendingIn. Não carrega teachers (rules bloqueiam).
      if (currentSchoolId) {
        Promise.all([
          _loadConfig(currentSchoolId).catch(e => { console.warn('[app] _loadConfig pending:', e); return {} }),
          _loadCol(currentSchoolId, 'schedules').catch(e => { console.warn('[app] _loadCol schedules pending:', e); return [] }),
        ]).then(([cfg, schedules]) => hydrate({ ...(cfg ?? {}), schedules: schedules ?? [] }))
      } else {
        hydrate({})
      }
      return
    }
    if (!currentSchoolId) {
      // Sem escola: libera o app sem dados (SaaS admin em /admin não precisa de dados de escola)
      hydrate({})
      return
    }

    let active = true

    async function loadData() {
      // Sinaliza loading antes do fetch para garantir que o spinner
      // apareça durante troca de escola (ex: SaaS admin abrindo escola do painel)
      hydrate({ loaded: false })
      teardownListeners()
      const data = await loadFromFirestore(currentSchoolId)
      if (!active) return
      hydrate(data ?? {})
      setupRealtimeListeners(currentSchoolId, useAppStore.getState())
    }

    loadData()

    return () => {
      active = false
    }
  }, [role, currentSchoolId, loading])

  // Loading inicial.
  // SaaS admin sem escola selecionada (navegando em /admin) não precisa de dados
  // do appStore — liberar imediatamente para evitar spinner desnecessário.
  const needsSchoolData = !!currentSchoolId
  const isDataLoading = loading || (needsSchoolData && !loaded)
  if (isDataLoading) {
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

  // SaaS admin → /admin (prevalece mesmo que tenha escolas em availableSchools)
  // Exceções: já está em /admin/* ou em /join/:slug, ou tem uma escola ativa
  // (clicou em uma escola no painel e está navegando dentro dela).
  if (isSaasAdmin && !currentSchoolId && !pathname.startsWith('/admin') && !pathname.startsWith('/join/')) return (
    <>
      <Navigate to="/admin" replace />
      <Toast />
    </>
  )

  // Usuário sem escola e não-SaaS admin → /no-school
  // Exceções: já está em /no-school ou em /join/:slug.
  if (!isSaasAdmin && availableSchools.length === 0 && pathname !== '/no-school' && !pathname.startsWith('/join/')) return (
    <>
      <Navigate to="/no-school" replace />
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
          <Route path="/no-school" element={<NoSchoolPage />} />
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
            {/* /admin — painel SaaS admin. Gated por isSaasAdmin (issue 418). */}
            {/* Fallback → /home (não /login): admin local está autenticado e não deve ser deslogado visualmente. */}
            <Route path="/admin"   element={isSaasAdmin ? <AdminPanelPage /> : <Navigate to="/home" replace />} />
            <Route path="*"          element={<Navigate to="/home" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <Toast />
    </>
  )
}
