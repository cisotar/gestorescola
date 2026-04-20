import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'
import { subscribePendingActionsCount } from '../lib/db'
import {
  TabSegments,
  TabDisciplines,
  TabSharedSeries,
  TabTeachers,
  TabPeriods,
  TabSchedules,
  TabMySchedules,
  TabProfile,
  TabApprovals,
} from '../components/settings/tabs'

const ADMIN_TABS = [
  { id: 'segments',     label: '🏫 Segmentos' },
  { id: 'disciplines',  label: '📚 Disciplinas' },
  { id: 'sharedseries', label: '🧩 Turmas Compartilhadas' },
  { id: 'teachers',     label: '👩‍🏫 Professores' },
  { id: 'periods',      label: '⏰ Períodos' },
  { id: 'schedules',    label: '🗓 Horários' },
  { id: 'approvals',    label: '🔔 Aprovações', badge: true },
]

const COORDINATOR_TABS = [
  { id: 'teachers',     label: '👩‍🏫 Professores' },
  { id: 'profile',      label: '👤 Meu Perfil' },
  { id: 'my-schedules', label: '🗓 Minhas Aulas' },
]

export default function SettingsPage() {
  const { role, user, teacher: myTeacher, isCoordinator } = useAuthStore()
  const isAdmin = role === 'admin'
  const location = useLocation()

  const [pendingActionsCt, setPendingActionsCt] = useState(0)
  useEffect(() => {
    if (!isAdmin) return
    return subscribePendingActionsCount(setPendingActionsCt)
  }, [isAdmin])

  const initialTab = (() => {
    const param = new URLSearchParams(location.search).get('tab')
    if (isAdmin) {
      return ADMIN_TABS.some(t => t.id === param) ? param : 'segments'
    }
    const coordTabs = ['teachers', 'profile', 'my-schedules']
    return coordTabs.includes(param) ? param : 'profile'
  })()

  const [tab, setTab] = useState(initialTab)

  const tabClass = (id) =>
    `px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border whitespace-nowrap ` +
    (tab === id ? 'bg-navy text-white border-navy' : 'bg-surf text-t2 border-bdr hover:border-t3')

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">
          {isAdmin ? 'Configurações' : tab === 'teachers' ? 'Professores' : 'Meu Perfil'}
        </h1>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-6">
        {isAdmin
          ? ADMIN_TABS.map(t => (
              <button key={t.id} className={`relative ${tabClass(t.id)}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.badge && pendingActionsCt > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {pendingActionsCt > 9 ? '9+' : pendingActionsCt}
                  </span>
                )}
              </button>
            ))
          : COORDINATOR_TABS.map(t => (
              <button key={t.id} className={tabClass(t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
      </div>

      {tab === 'segments'     && <TabSegments />}
      {tab === 'disciplines'  && <TabDisciplines />}
      {tab === 'sharedseries' && <TabSharedSeries />}
      {tab === 'teachers'     && <TabTeachers />}
      {tab === 'periods'      && <TabPeriods />}
      {tab === 'schedules'    && <TabSchedules />}
      {tab === 'approvals'    && <TabApprovals adminEmail={user?.email} />}
      {tab === 'profile'      && <TabProfile teacher={myTeacher} />}
      {tab === 'my-schedules' && <TabMySchedules />}
    </div>
  )
}
