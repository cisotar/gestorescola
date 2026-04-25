import { useState, useEffect } from 'react'
import useAppStore from '../store/useAppStore'
import Spinner from '../components/ui/Spinner'
import { isFormationSlot } from '../lib/helpers/turmas'
import { formatISO, businessDaysBetween, dateToDayLabel } from '../lib/helpers/dates'

// ─── Toggle Mensal / Anual ─────────────────────────────────────────────────────

function PeriodToggle({ period, onChange }) {
  return (
    <div className="flex gap-1">
      {[['month', 'Este mês'], ['year', 'Este ano']].map(([val, lbl]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
            period === val
              ? 'bg-navy text-white border-navy'
              : 'bg-surf2 text-t2 border-bdr hover:border-t3'
          }`}
        >{lbl}</button>
      ))}
    </div>
  )
}

// ─── Linha da tabela consolidada ──────────────────────────────────────────────

function WorkloadRow({ teacher, schedules, absences, sharedSeries, fromDate, today }) {
  const atribuidas = schedules.filter(s => s.teacherId === teacher.id).length

  const formacao = schedules.filter(s =>
    s.teacherId === teacher.id &&
    isFormationSlot(s.turma, null, sharedSeries)
  ).length

  const days = businessDaysBetween(fromDate, today)
  const dadas = days.reduce((acc, date) => {
    const dayLabel = dateToDayLabel(date)
    if (!dayLabel) return acc
    return acc + schedules.filter(s =>
      s.teacherId === teacher.id &&
      s.day === dayLabel &&
      !isFormationSlot(s.turma, null, sharedSeries)
    ).length
  }, 0)

  const faltas = absences
    .filter(ab => ab.teacherId === teacher.id)
    .flatMap(ab => ab.slots ?? [])
    .filter(sl =>
      sl.date >= fromDate &&
      sl.date <= today &&
      !isFormationSlot(sl.turma, null, sharedSeries)
    ).length

  const subs = absences
    .flatMap(ab => ab.slots ?? [])
    .filter(sl =>
      sl.substituteId === teacher.id &&
      sl.date >= fromDate &&
      sl.date <= today
    ).length

  const saldo = dadas - faltas + subs
  const saldoClass = saldo < 0 ? 'text-err font-bold' : 'text-t1 font-bold'

  return (
    <tr className="border-b border-bdr/50 hover:bg-surf2 transition-colors">
      <td className="px-4 py-3 font-semibold text-sm text-t1">{teacher.name}</td>
      <td className="px-4 py-3 text-center font-mono text-sm">{atribuidas}</td>
      <td className="px-4 py-3 text-center font-mono text-sm">{formacao || '—'}</td>
      <td className="px-4 py-3 text-center font-mono text-sm">{dadas}</td>
      <td className="px-4 py-3 text-center font-mono text-sm text-err">{faltas || '—'}</td>
      <td className="px-4 py-3 text-center font-mono text-sm text-ok">{subs || '—'}</td>
      <td className={`px-4 py-3 text-center font-mono text-sm ${saldoClass}`}>{saldo}</td>
    </tr>
  )
}

// ─── Tabela consolidada de carga horária ──────────────────────────────────────

function WorkloadConsolidatedTable({ teachers, schedules, absences, sharedSeries, period }) {
  const sorted = [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const today = formatISO(new Date())
  const [y, m] = today.split('-')
  const fromDate = period === 'month' ? `${y}-${m}-01` : `${y}-01-01`

  return (
    <div className="card p-0 overflow-hidden overflow-x-auto">
      <div className="max-h-[400px] overflow-y-auto scroll-thin">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-surf2">
            <tr>
              {['Professor', 'Atribuídas', 'Formação', 'Dadas', 'Faltas', 'Subs', 'Saldo'].map(h => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-[10px] font-bold text-t3 uppercase tracking-wide"
                >{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(teacher => (
              <WorkloadRow
                key={teacher.id}
                teacher={teacher}
                schedules={schedules}
                absences={absences}
                sharedSeries={sharedSeries}
                fromDate={fromDate}
                today={today}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function WorkloadPage() {
  const { teachers, schedules, absences, sharedSeries, loaded, loadAbsencesIfNeeded } = useAppStore()
  const [period, setPeriod] = useState('month')

  useEffect(() => {
    loadAbsencesIfNeeded()
  }, [])

  if (!loaded) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={32} />
      </div>
    )
  }

  const lecturers = teachers.filter(t => t.profile !== 'coordinator')

  if (lecturers.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-extrabold tracking-tight">Carga Horária</h1>
        <div className="card text-center py-16 text-t3">Nenhum professor cadastrado.</div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">Carga Horária</h1>
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>

      <WorkloadConsolidatedTable
        teachers={lecturers}
        schedules={schedules}
        absences={absences}
        sharedSeries={sharedSeries}
        period={period}
      />
    </div>
  )
}
