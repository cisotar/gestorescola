import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { formatBR } from '../lib/helpers'

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
  const { teachers, schedules, absences, history, workloadDanger } = useAppStore()
  const { user, role, teacher: myTeacher } = useAuthStore()
  const isAdmin = role === 'admin'
  const firstName = user?.displayName?.split(' ')[0] ?? 'Bem-vindo'

  const totalAbsences = (absences ?? []).reduce((acc, ab) => acc + ab.slots.length, 0)
  const uncovered     = (absences ?? []).reduce((acc, ab) =>
    acc + ab.slots.filter(s => !s.substituteId).length, 0)

  // Overloaded teachers
  const warn   = 20
  const danger = workloadDanger || 26
  const overloaded = teachers
    .map(t => ({ t, count: schedules.filter(s => s.teacherId === t.id).length }))
    .filter(x => x.count >= warn)
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-6">
      {/* Saudação */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Olá, {firstName} 👋</h1>
        <p className="text-sm text-t2 mt-1">O que você quer fazer hoje?</p>
      </div>

      {/* Alertas de sobrecarga (só admin) */}
      {isAdmin && overloaded.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-t2 uppercase tracking-wider">⚠️ Professores sobrecarregados</div>
          {overloaded.map(({ t, count }) => (
            <div key={t.id} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm
              ${count >= danger ? 'bg-[#FFF1EE] border-[#FDB8A8] text-[#7F1A06]' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              <span>{count >= danger ? '🔴' : '🟡'}</span>
              <span className="font-bold flex-1">{t.name}</span>
              <span className="font-bold">{count} aulas/sem.</span>
            </div>
          ))}
        </div>
      )}

      {/* Cards de ação */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <ActionCard
          icon="📝" label="Marcar Substituições"
          desc="Registre ausências e gerencie os substitutos da semana"
          to="/calendar" primary
        />
        <ActionCard
          icon="📋" label="Histórico de Ausências"
          desc="Consulte o registro completo de faltas por período"
          to="/absences"
        />
        <ActionCard
          icon="🏆" label="Ranking de Substituições"
          desc="Veja quais professores mais cobriram aulas este mês"
          to="/absences"
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

      {/* Tabelas (admin) */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <WorkloadTable teachers={teachers} schedules={schedules} absences={absences} maxLoad={danger} />
          <HistoryPanel history={history} />
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
          <div className="font-bold text-sm">Carga Horária</div>
          <div className="text-xs text-t3">Aulas / semana · limite: {maxLoad}</div>
        </div>
        <span className="text-t3 text-lg">›</span>
      </button>
      <div className="overflow-y-auto max-h-[360px] scroll-thin">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surf2">
              {['Professor','Aulas','Faltas','Subs'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-t3 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, schedules: sc, absences: ab, subsGiven }) => {
              const pct      = Math.round((sc / maxLoad) * 100)
              const barColor = pct >= 100 ? '#C8290A' : pct >= 77 ? '#D97706' : '#16A34A'
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
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── History panel ────────────────────────────────────────────────────────────

function HistoryPanel({ history }) {
  const { deleteHistory } = useAppStore()
  const sorted = [...history].sort((a, b) => b.date?.localeCompare(a.date ?? '') ?? 0).slice(0, 40)

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-bdr">
        <div className="font-bold text-sm">Histórico de Substituições</div>
        <div className="text-xs text-t3">{history.length} registro{history.length !== 1 ? 's' : ''}</div>
      </div>
      {sorted.length === 0 ? (
        <div className="p-8 text-center text-t3 text-sm">Nenhuma substituição registrada.</div>
      ) : (
        <div className="overflow-y-auto max-h-[360px] scroll-thin">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surf2">
                {['Data','Ausente','Substituto',''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-t3 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(entry => (
                <tr key={entry.id} className="border-b border-bdr/50">
                  <td className="px-3 py-2.5 font-mono text-[11px] text-t2 whitespace-nowrap">{formatBR(entry.date)}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-xs">{entry.teacherName}</div>
                    <div className="text-[10px] text-t3">{entry.slotLabel} · {entry.day}</div>
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-xs text-ok">{entry.subName}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => deleteHistory(entry.id)}
                      className="text-t3 hover:text-err text-sm transition-colors"
                      title="Remover"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
