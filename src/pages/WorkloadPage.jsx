import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'

export default function WorkloadPage() {
  const { teachers, schedules, absences, workloadDanger } = useAppStore()
  const navigate  = useNavigate()
  const maxLoad   = workloadDanger || 26

  const rows = teachers
    .filter(t => t.profile !== 'coordinator')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => {
      const sc     = schedules.filter(s => s.teacherId === t.id).length
      const faltas = absences
        .filter(ab => ab.teacherId === t.id)
        .reduce((acc, ab) => acc + ab.slots.length, 0)
      const subs   = absences
        .flatMap(ab => ab.slots)
        .filter(sl => sl.substituteId === t.id).length
      return { t, sc, faltas, subs }
    })

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="btn btn-ghost btn-sm">← Voltar</button>
        <h1 className="text-xl font-extrabold tracking-tight">Carga Horária</h1>
      </div>

      {rows.length === 0 ? (
        <div className="card text-center py-16 text-t3">Nenhum professor cadastrado.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surf2">
                {['Professor', 'Aulas/sem.', 'Faltas', 'Substituições'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-t3 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, sc, faltas, subs }) => {
                const pct      = Math.round((sc / maxLoad) * 100)
                const barColor = pct >= 100 ? '#C8290A' : pct >= 77 ? '#D97706' : '#16A34A'
                return (
                  <tr key={t.id} className="border-b border-bdr/50 hover:bg-surf2 transition-colors">
                    <td className="px-4 py-3 font-semibold text-sm">{t.name}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="font-bold">{sc}</div>
                      <div className="w-full bg-surf2 rounded-full h-1 mt-1">
                        <div className="h-1 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-err text-xs">{faltas || '—'}</td>
                    <td className="px-4 py-3 text-center font-bold text-ok text-xs">{subs || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
