import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'

// ─── Helpers locais ───────────────────────────────────────────────────────────

function getTeacherStats(teacherId, schedules, absences) {
  const sc      = schedules.filter(s => s.teacherId === teacherId).length
  const faltas  = absences
    .filter(ab => ab.teacherId === teacherId)
    .reduce((acc, ab) => acc + ab.slots.length, 0)
  const subs    = absences
    .flatMap(ab => ab.slots)
    .filter(sl => sl.substituteId === teacherId).length
  return { schedules: sc, absences: faltas, subsGiven: subs }
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { teachers, schedules, absences, workloadDanger } = useAppStore()
  const { user, role, teacher: myTeacher } = useAuthStore()
  const isAdmin = role === 'admin'
  const firstName = user?.displayName?.split(' ')[0] ?? 'Bem-vindo'

  const totalAbsences = (absences ?? []).reduce((acc, ab) => acc + ab.slots.length, 0)
  const uncovered     = (absences ?? []).reduce((acc, ab) =>
    acc + ab.slots.filter(s => !s.substituteId).length, 0)

  const danger = workloadDanger || 26

  return (
    <div className="space-y-6">
      {/* Saudação */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Olá, {firstName} 👋</h1>
        <p className="text-sm text-t2 mt-1">O que você quer fazer hoje?</p>
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

      {/* Relatórios */}
      <div>
        <h2 className="text-xs font-bold text-t2 uppercase tracking-wider mb-3">Relatório de Ausências</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <ActionCard
            icon="🔄" label="Relatório de Substituições"
            desc="Acesse o histórico completo de substituições realizadas"
            to="/substitutions"
          />
        </div>
      </div>

      {/* Tabelas (admin) */}
      {isAdmin && (
        <div className="grid grid-cols-1 gap-5">
          <WorkloadTable teachers={teachers} schedules={schedules} absences={absences} maxLoad={danger} />
        </div>
      )}

      {/* Stats do professor */}
      {!isAdmin && myTeacher && (
        <TeacherStats teacher={myTeacher} schedules={schedules} absences={absences} />
      )}
    </div>
  )
}

// ─── Workload table ───────────────────────────────────────────────────────────

function WorkloadTable({ teachers, schedules, absences, maxLoad }) {
  const navigate = useNavigate()
  if (!teachers.length) return (
    <div className="card text-center text-t3 py-10">Nenhum professor cadastrado.</div>
  )

  const rows = teachers
    .map(t => ({ t, ...getTeacherStats(t.id, schedules, absences) }))
    .sort((a, b) => b.schedules - a.schedules)

  return (
    <div className="card p-0 overflow-hidden">
      <button
        onClick={() => navigate('/workload')}
        className="w-full px-4 py-3 border-b border-bdr text-left hover:bg-surf2 transition-colors flex items-center justify-between"
      >
        <div>
          <div className="font-bold text-sm">Histórico de Aulas Dadas</div>
          <div className="text-xs text-t3">Aulas / semana · limite: {maxLoad}</div>
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
            {rows.map(({ t, schedules: sc, absences: ab, subsGiven }) => {
              const pct      = Math.round((sc / maxLoad) * 100)
              const barColor = pct >= 100 ? '#C8290A' : pct >= 77 ? '#D97706' : '#16A34A'
              const saldo    = sc - ab + subsGiven
              return (
                <tr key={t.id} className="border-b border-bdr/50">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-xs">{t.name}</div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="font-bold">{sc}</div>
                    <div className="w-full bg-surf2 rounded-full h-1 mt-1">
                      <div className="h-1 rounded-full" style={{ width: `${Math.min(pct,100)}%`, background: barColor }} />
                    </div>
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
  const myAulas = schedules.filter(s => s.teacherId === teacher.id).length
  const myFaltas = (absences ?? []).reduce((acc, ab) =>
    acc + (ab.teacherId === teacher.id ? ab.slots.length : 0), 0)
  const mySubs = (absences ?? []).reduce((acc, ab) =>
    acc + ab.slots.filter(s => s.substituteId === teacher.id).length, 0)

  return (
    <div className="card">
      <div className="font-bold text-sm mb-4">Suas estatísticas do mês</div>
      <div className="flex gap-6 flex-wrap">
        {[
          { v: myAulas,  l: 'aulas/semana' },
          { v: myFaltas, l: 'faltas registradas' },
          { v: mySubs,   l: 'subs. realizadas' },
        ].map(({ v, l }) => (
          <div key={l} className="text-center">
            <div className="text-3xl font-extrabold text-navy">{v}</div>
            <div className="text-xs text-t2 mt-0.5">{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
