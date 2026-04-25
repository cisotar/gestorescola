import { useState } from 'react'
import { isFormationSlot } from '../../lib/helpers/turmas'
import { formatISO, businessDaysBetween, dateToDayLabel } from '../../lib/helpers/dates'

// ─── Toggle Mensal / Anual ─────────────────────────────────────────────────────

export function PeriodToggle({ period, onChange }) {
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

function WorkloadRow({ teacher, atribuidas, formacao, dadas, faltas, subs, saldo }) {
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

const COLUMNS = [
  { key: 'name',      label: 'Professor' },
  { key: 'atribuidas', label: 'Atribuídas' },
  { key: 'formacao',  label: 'Formação' },
  { key: 'dadas',     label: 'Dadas' },
  { key: 'faltas',    label: 'Faltas' },
  { key: 'subs',      label: 'Subs' },
  { key: 'saldo',     label: 'Saldo' },
]

export function WorkloadConsolidatedTable({ teachers, schedules, absences, sharedSeries, period, variant }) {
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  const today = formatISO(new Date())
  const [y, m] = today.split('-')
  const fromDate = period === 'month' ? `${y}-${m}-01` : `${y}-01-01`

  const days = businessDaysBetween(fromDate, today)

  // Elevar cálculo: construir array de objetos com todos os valores calculados
  const rows = teachers.map(teacher => {
    const atribuidas = schedules.filter(s => s.teacherId === teacher.id).length

    const formacao = schedules.filter(s =>
      s.teacherId === teacher.id &&
      isFormationSlot(s.turma, null, sharedSeries)
    ).length

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

    return { teacher, atribuidas, formacao, dadas, faltas, subs, saldo }
  })

  // Ordenar o array calculado
  const sorted = [...rows].sort((a, b) => {
    let cmp
    if (sortKey === 'name') {
      cmp = a.teacher.name.localeCompare(b.teacher.name, 'pt-BR', { sensitivity: 'base' })
    } else {
      cmp = a[sortKey] - b[sortKey]
      if (cmp === 0) {
        cmp = a.teacher.name.localeCompare(b.teacher.name, 'pt-BR', { sensitivity: 'base' })
      }
    }
    return sortDir === 'desc' ? -cmp : cmp
  })

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const scrollClass = variant === 'card'
    ? 'max-h-[320px] overflow-y-auto scroll-thin'
    : 'overflow-y-auto scroll-thin'

  return (
    <div className="card p-0 overflow-hidden overflow-x-auto">
      <div className={scrollClass}>
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-surf2">
            <tr>
              {COLUMNS.map(({ key, label }) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className="px-4 py-2.5 text-left text-[10px] font-bold text-t1 uppercase tracking-wide cursor-pointer select-none"
                >
                  {label}
                  {sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ teacher, atribuidas, formacao, dadas, faltas, subs, saldo }) => (
              <WorkloadRow
                key={teacher.id}
                teacher={teacher}
                atribuidas={atribuidas}
                formacao={formacao}
                dadas={dadas}
                faltas={faltas}
                subs={subs}
                saldo={saldo}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
