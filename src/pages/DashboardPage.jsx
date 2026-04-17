import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { useState } from 'react'
import { monthlyLoad, businessDaysBetween, dateToDayLabel } from '../lib/absences'

// ─── Helpers locais ───────────────────────────────────────────────────────────

function getTeacherStats(teacherId, today, schedules, absences) {
  const aulasDadas = monthlyLoad(teacherId, today, schedules, absences)
  const faltas     = (absences || [])
    .filter(ab => ab.teacherId === teacherId)
    .reduce((acc, ab) => acc + ab.slots.length, 0)
  const subs       = (absences || [])
    .flatMap(ab => ab.slots)
    .filter(sl => sl.substituteId === teacherId).length
  return { aulasDadas, absences: faltas, subsGiven: subs }
}

// ─── Componentes ─────────────────────────────────────────────────────────────

function ActionCard({ icon, label, desc, to, primary = false }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(to)}
      className={`
        relative flex flex-col items-start gap-1.5 p-5 rounded-xl border text-left
        transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg min-h-[140px]
        ${primary
          ? 'bg-navy border-transparent text-white shadow-md'
          : 'bg-surf border-bdr hover:border-t3'}
      `}
    >
      <div className="text-3xl leading-none mb-1">{icon}</div>
      <div className={`text-sm font-bold leading-tight ${primary ? 'text-white' : 'text-t1'}`}>{label}</div>
      <div className={`text-xs leading-relaxed flex-1 ${primary ? 'text-white/70' : 'text-t2'}`}>{desc}</div>
      <div className={`absolute bottom-3.5 right-4 text-2xl font-light ${primary ? 'text-white/40' : 'text-t3'}`}>›</div>
    </button>
  )
}

function StatPill({ icon, value, label, warn = false, ok = false }) {
  return (
    <div className={`
      flex items-center gap-3 px-4 py-3 rounded-xl flex-1 min-w-[140px]
      ${warn ? 'bg-err-l' : ok ? 'bg-ok-l' : 'bg-surf2'}
    `}>
      <span className="text-xl shrink-0">{icon}</span>
      <div>
        <div className={`text-xl font-extrabold leading-none ${warn ? 'text-err' : ok ? 'text-ok' : 'text-t1'}`}>
          {ok ? '—' : value}
        </div>
        <div className={`text-[10px] font-bold uppercase tracking-wide mt-0.5 ${warn ? 'text-err' : ok ? 'text-ok' : 'text-t2'}`}>
          {label}
        </div>
      </div>
    </div>
  )
}

function AulasAtribuidasCard({ teachers, schedules }) {
  const lecturers = (teachers ?? []).filter(t => t.profile !== 'coordinator')

  if (!lecturers.length) return (
    <div className="card text-center text-t3 py-10">Nenhum professor cadastrado.</div>
  )

  const rows = lecturers
    .map(t => ({
      t,
      // Contagem exaustiva: inclui regulares e formation-* (spec v2)
      count: (schedules ?? []).filter(s => s.teacherId === t.id).length,
    }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-bdr">
        <div className="font-bold text-sm">Aulas Atribuídas</div>
      </div>
      <div className="overflow-y-auto max-h-[360px] scroll-thin">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surf2">
              {['Professor', 'Aulas Atribuídas'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-t3 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, count }) => (
              <tr key={t.id} className="border-b border-bdr/50">
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-xs">{t.name}</div>
                </td>
                <td className="px-3 py-2.5 text-center font-bold">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { teachers, schedules, absences } = useAppStore()
  const { user, role, teacher: myTeacher } = useAuthStore()
  const isAdmin = role === 'admin'
  const firstName = user?.displayName?.split(' ')[0] ?? 'Bem-vindo'

  const totalAbsences = (absences ?? []).reduce((acc, ab) => acc + ab.slots.length, 0)
  const uncovered     = (absences ?? []).reduce((acc, ab) =>
    acc + ab.slots.filter(s => !s.substituteId).length, 0)

  return (
    <div className="space-y-6">
      {/* Saudação */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Olá, {firstName} 👋</h1>
        <p className="text-sm text-t2 mt-1">O que você quer fazer hoje?</p>
      </div>


      {/* Stats rápidas */}
      <div className="flex flex-wrap gap-3">
        <StatPill icon="👩‍🏫" value={teachers.length}   label="professores" />
        <StatPill icon="📚" value={schedules.length}    label="aulas/semana" />
        <StatPill icon="📋" value={totalAbsences}       label="faltas registradas" />
        {uncovered > 0
          ? <StatPill icon="⚠️" value={uncovered} label="sem substituto" warn />
          : <StatPill icon="✅" value={0}          label="sem substituto" ok />
        }
      </div>

      {/* Cards de ação */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5">
        <ActionCard
          icon="📝" label="Marcar Substituições"
          desc="Registre ausências e gerencie os substitutos da semana"
          to="/calendar" primary
        />
        <ActionCard
          icon="👩‍🏫" label="Ver Professores"
          desc="Lista completa de professores e suas cargas horárias"
          to="/settings?tab=teachers"
        />
        <ActionCard
          icon="🗓️" label="Grade da Escola"
          desc="Visualize e filtre os horários de toda a escola"
          to="/school-schedule"
        />
      </div>

      {/* Tabelas (admin) */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <AulasAtribuidasCard teachers={teachers} schedules={schedules} />
          <WorkloadTable teachers={teachers} schedules={schedules} absences={absences} />
        </div>
      )}

      {/* Stats do professor */}
      {!isAdmin && myTeacher && (
        <>
          <TeacherStats teacher={myTeacher} schedules={schedules} absences={absences} />
          <ActionCard
            icon="🔄" label="Minhas Substituições"
            desc="Veja o histórico completo das substituições que você realizou"
            to="/substitutions"
          />
        </>
      )}
    </div>
  )
}

// ─── Workload table ───────────────────────────────────────────────────────────

function WorkloadTable({ teachers, schedules, absences }) {
  const navigate  = useNavigate()
  const lecturers = (teachers ?? []).filter(t => t.profile !== 'coordinator')

  if (!lecturers.length) return (
    <div className="card text-center text-t3 py-10">Nenhum professor cadastrado.</div>
  )

  const today = new Date().toISOString().slice(0, 10)

  const rows = lecturers
    .map(t => ({ t, ...getTeacherStats(t.id, today, schedules, absences) }))
    .sort((a, b) => b.aulasDadas - a.aulasDadas)

  return (
    <div className="card p-0 overflow-hidden">
      <button
        onClick={() => navigate('/workload')}
        className="w-full px-4 py-3 border-b border-bdr text-left hover:bg-surf2 transition-colors flex items-center justify-between"
      >
        <div>
          <div className="font-bold text-sm">Aulas dadas até o presente</div>
        </div>
        <span className="text-t3 text-lg">›</span>
      </button>
      <div className="overflow-y-auto max-h-[360px] scroll-thin">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surf2">
              {['Professor','Aulas Dadas','Faltas','Subs','Saldo'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-t3 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, aulasDadas, absences: ab, subsGiven }) => {
              const saldo = aulasDadas - ab + subsGiven
              return (
                <tr key={t.id} className="border-b border-bdr/50">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-xs">{t.name}</div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="font-bold">{aulasDadas}</div>
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold text-err text-xs">{ab || '—'}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-ok text-xs">{subsGiven || '—'}</td>
                  <td className={`px-3 py-2.5 text-center font-bold text-xs ${saldo < 0 ? 'text-err' : 'text-t1'}`}>{saldo}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}


// ─── Teacher stats ────────────────────────────────────────────────────────────

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
