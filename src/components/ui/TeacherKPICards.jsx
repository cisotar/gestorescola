import { businessDaysBetween, dateToDayLabel } from '../../lib/absences'

export default function TeacherKPICards({ teacher, schedules, absences }) {
  const today    = new Date().toISOString().slice(0, 10)
  const fromDate = `${today.slice(0, 7)}-01`

  const myAulas = (schedules ?? []).filter(s => s.teacherId === teacher.id).length

  const days       = businessDaysBetween(fromDate, today)
  const aulasDadas = days.reduce((acc, d) => {
    const dl = dateToDayLabel(d)
    return acc + (dl ? (schedules ?? []).filter(s => s.teacherId === teacher.id && s.day === dl).length : 0)
  }, 0)

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="card flex flex-col gap-1">
        <div className="text-[11px] font-bold text-t3 uppercase tracking-wide">Aulas Atribuídas</div>
        <div className="text-3xl font-extrabold text-navy leading-none">{myAulas}</div>
        <div className="text-xs text-t2 mt-0.5">na grade semanal</div>
      </div>
      <div className="card flex flex-col gap-1">
        <div className="text-[11px] font-bold text-t3 uppercase tracking-wide">Aulas Dadas</div>
        <div className="text-3xl font-extrabold text-navy leading-none">{aulasDadas}</div>
        <div className="text-xs text-t2 mt-0.5">até hoje este mês</div>
      </div>
    </div>
  )
}
