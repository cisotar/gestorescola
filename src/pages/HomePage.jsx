import { useState } from 'react'
import useAuthStore from '../store/useAuthStore'
import useAppStore from '../store/useAppStore'
import ActionCard from '../components/ui/ActionCard'
import KPICards from '../components/ui/KPICards'
import { AulasAtribuidasCard, WorkloadTable } from '../components/ui/WorkloadCards'
import Spinner from '../components/ui/Spinner'
import { businessDaysBetween, dateToDayLabel } from '../lib/absences'

// ─── Estatísticas pessoais completas ──────────────────────────────────────────

function TeacherStats({ teacher, schedules, absences }) {
  const [period, setPeriod] = useState('month')

  const today    = new Date().toISOString().slice(0, 10)
  const year     = today.slice(0, 4)
  const fromDate = period === 'year' ? `${year}-01-01` : `${today.slice(0, 7)}-01`

  const days       = businessDaysBetween(fromDate, today)
  const myAulas    = schedules.filter(s => s.teacherId === teacher.id).length
  const aulasDadas = days.reduce((acc, d) => {
    const dl = dateToDayLabel(d)
    return acc + (dl ? schedules.filter(s => s.teacherId === teacher.id && s.day === dl).length : 0)
  }, 0)
  const myFaltas = (absences ?? []).reduce((acc, ab) => {
    if (ab.teacherId !== teacher.id) return acc
    return acc + ab.slots.filter(sl => sl.date >= fromDate && sl.date <= today).length
  }, 0)
  const mySubs = (absences ?? []).reduce((acc, ab) =>
    acc + ab.slots.filter(sl => sl.substituteId === teacher.id && sl.date >= fromDate && sl.date <= today).length
  , 0)

  const stats = [
    { v: myAulas,    l: 'aulas atribuídas', sub: 'na grade semanal' },
    { v: aulasDadas, l: 'aulas dadas',      sub: period === 'year' ? 'este ano' : 'este mês' },
    { v: myFaltas,   l: 'faltas',           sub: period === 'year' ? 'este ano' : 'este mês' },
    { v: mySubs,     l: 'substituições',    sub: period === 'year' ? 'este ano' : 'este mês' },
  ]

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="font-bold text-sm">Suas estatísticas</div>
        <div className="flex gap-1">
          {[['month','Este mês'],['year','Este ano']].map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setPeriod(val)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                period === val
                  ? 'bg-navy text-white border-navy'
                  : 'bg-surf2 text-t2 border-bdr hover:border-t3'
              }`}
            >{lbl}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(({ v, l, sub }) => (
          <div key={l} className="flex flex-col items-center text-center bg-surf2 rounded-xl px-3 py-3">
            <div className="text-2xl font-extrabold text-navy leading-none">{v}</div>
            <div className="text-[11px] font-bold text-t1 mt-1">{l}</div>
            <div className="text-[10px] text-t3 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user, teacher: myTeacher } = useAuthStore()
  const { schedules, absences, teachers, loaded } = useAppStore()
  const firstName = user?.displayName?.split(' ')[0] ?? 'Professor'

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={40} />
      </div>
    )
  }

  const actionCards = [
    {
      icon: '📅', label: 'Marcar Substituições',
      desc: 'Registre e gerencie as substituições de aulas.',
      to: '/calendar', primary: true,
    },
    ...(schedules.some(s => s.teacherId === myTeacher?.id) ? [{
      icon: '🗓️', label: 'Minha Grade',
      desc: 'Visualize e exporte sua grade de horários semanal.',
      to: '/schedule',
    }] : []),
    {
      icon: '👥', label: 'Ver Professores',
      desc: 'Consulte o cadastro de professores da escola.',
      to: '/settings',
    },
    {
      icon: '🏫', label: 'Grade da Escola',
      desc: 'Visualize a grade horária completa da escola.',
      to: '/school-schedule',
    },
    {
      icon: '📋', label: 'Relatórios de Faltas',
      desc: 'Monitore histórico de ausências e substituições.',
      to: '/absences',
    },
    {
      icon: '📁', label: 'Relatórios de Substituições',
      desc: 'Consulte os relatórios completos de substituições.',
      to: '/substitutions',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Saudação */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Olá, {firstName} 👋</h1>
        <p className="text-sm text-t2 mt-1">Bem-vindo(a) ao seu painel de controle.</p>
      </div>

      <KPICards teachers={teachers} schedules={schedules} absences={absences} />

      {myTeacher && (
        <TeacherStats teacher={myTeacher} schedules={schedules} absences={absences} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {actionCards.map(card => (
          <ActionCard
            key={card.to}
            icon={card.icon}
            label={card.label}
            desc={card.desc}
            to={card.to}
            primary={card.primary}
          />
        ))}
      </div>

      {/* Tabelas de aulas — visão geral da escola */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AulasAtribuidasCard teachers={teachers} schedules={schedules} />
        <WorkloadTable teachers={teachers} schedules={schedules} absences={absences} />
      </div>
    </div>
  )
}
