import { useNavigate } from 'react-router-dom'
import { monthlyLoad } from '../../lib/absences'

function getTeacherStats(teacherId, today, schedules, absences, sharedSeries = []) {
  const aulasDadas = monthlyLoad(teacherId, today, schedules, absences, sharedSeries)
  const faltas     = (absences || [])
    .filter(ab => ab.teacherId === teacherId)
    .reduce((acc, ab) => acc + ab.slots.length, 0)
  const subs       = (absences || [])
    .flatMap(ab => ab.slots)
    .filter(sl => sl.substituteId === teacherId).length
  return { aulasDadas, absences: faltas, subsGiven: subs }
}

export function AulasAtribuidasCard({ teachers, schedules }) {
  const lecturers = (teachers ?? []).filter(t => t.profile !== 'coordinator')

  if (!lecturers.length) return (
    <div className="card text-center text-t3 py-10">Nenhum professor cadastrado.</div>
  )

  const rows = lecturers
    .map(t => ({
      t,
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

export function WorkloadTable({ teachers, schedules, absences, sharedSeries = [] }) {
  const navigate  = useNavigate()
  const lecturers = (teachers ?? []).filter(t => t.profile !== 'coordinator')

  if (!lecturers.length) return (
    <div className="card text-center text-t3 py-10">Nenhum professor cadastrado.</div>
  )

  const today = new Date().toISOString().slice(0, 10)

  const rows = lecturers
    .map(t => ({ t, ...getTeacherStats(t.id, today, schedules, absences, sharedSeries) }))
    .sort((a, b) => b.aulasDadas - a.aulasDadas)

  return (
    <div className="card p-0 overflow-hidden">
      <button
        onClick={() => navigate('/cargahoraria')}
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
