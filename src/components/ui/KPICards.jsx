export default function KPICards({ teachers, schedules, absences }) {
  const safeTeachers = teachers ?? []
  const safeSchedules = schedules ?? []
  const safeAbsences = absences ?? []

  const totalTeachers = safeTeachers.length
  const totalSchedules = safeSchedules.length
  const allSlots = safeAbsences.flatMap(ab => ab.slots)
  const totalAbsences = allSlots.length
  const uncovered = allSlots.filter(sl => sl.substituteId === null).length

  const propsUndefined = teachers === undefined && schedules === undefined && absences === undefined
  const uncoveredBg = propsUndefined
    ? 'bg-surf2'
    : uncovered > 0
      ? 'bg-err-l'
      : 'bg-ok-l'
  const uncoveredText = propsUndefined
    ? 'text-t1'
    : uncovered > 0
      ? 'text-err'
      : 'text-ok'

  const items = [
    { icon: '👥', value: totalTeachers,  label: 'Professores',   bg: 'bg-surf2', text: 'text-navy' },
    { icon: '📅', value: totalSchedules, label: 'Aulas / Semana', bg: 'bg-surf2', text: 'text-navy' },
    { icon: '📋', value: totalAbsences,  label: 'Faltas',         bg: 'bg-surf2', text: 'text-navy' },
    { icon: '⚠️', value: uncovered,      label: 'Sem Substituto', bg: uncoveredBg, text: uncoveredText },
  ]

  return (
    <div className="card">
      <div className="text-sm font-bold text-t1 mb-4">Visão geral da escola</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map(({ icon, value, label, bg, text }) => (
          <div
            key={label}
            className={`flex flex-col items-center text-center ${bg} rounded-xl px-3 py-4 gap-1`}
          >
            <div className="text-2xl leading-none mb-1">{icon}</div>
            <div className={`text-2xl font-extrabold leading-none ${text}`}>
              {value}
            </div>
            <div className="text-[11px] font-bold text-t1 mt-0.5">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
