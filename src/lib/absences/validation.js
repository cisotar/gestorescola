import { dateToDayLabel, formatISO, parseDate, weekStart, businessDaysBetween } from '../helpers/dates'
import { isSharedSeries } from '../helpers/turmas'
import { resolveSlot, toMin } from '../periods'

// ─── Carga mensal ─────────────────────────────────────────────────────────────

export function monthlyLoad(teacherId, referenceDate, schedules, absences, sharedSeries = []) {
  const ref        = parseDate(referenceDate)
  const monthStart = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2,'0')}-01`
  const days       = businessDaysBetween(monthStart, referenceDate)

  const isFormacao = (turma) =>
    isSharedSeries(turma ?? '', sharedSeries)

  // FORMAÇÃO e ELETIVA contam como aulas dadas (scheduled)
  const scheduledLoad = days.reduce((acc, d) => {
    const dayLabel = dateToDayLabel(d)
    if (!dayLabel) return acc
    return acc + schedules.filter(s =>
      s.teacherId === teacherId &&
      s.day === dayLabel
    ).length
  }, 0)

  // Ausências: FORMAÇÃO não deduz (sem cobertura obrigatória), ELETIVA deduz
  const absenceLoad = (absences || []).reduce((acc, ab) => {
    if (ab.teacherId !== teacherId) return acc
    return acc + ab.slots.filter(sl =>
      sl.date >= monthStart &&
      sl.date <= referenceDate &&
      !isFormacao(sl.turma)
    ).length
  }, 0)

  const subsLoad = (absences || []).reduce((acc, ab) => {
    return acc + ab.slots.filter(sl =>
      sl.substituteId === teacherId && sl.date >= monthStart && sl.date <= referenceDate
    ).length
  }, 0)

  return Math.max(0, scheduledLoad - absenceLoad) + subsLoad
}

// ─── Disponibilidade ──────────────────────────────────────────────────────────

/**
 * Retorna o conjunto de substituteIds já alocados no par date+timeSlot.
 * Útil para evitar que o mesmo professor seja atribuído como substituto
 * em múltiplas ausências simultâneas fisicamente impossíveis.
 *
 * @param {string} date - Data ISO (ex: "2026-04-14")
 * @param {string} timeSlot - Slot de tempo (ex: "seg-fund|manha|1")
 * @param {Array} absences - Lista de ausências registradas
 * @param {string|null} [excludeSlotId=null] - ID do slot a ignorar (útil para reatribuição)
 * @returns {Set<string>} Conjunto de substituteIds já alocados no par date+timeSlot
 */
export function substitutesAtSlot(date, timeSlot, absences, excludeSlotId = null) {
  const ids = []
  ;(absences || []).forEach(ab => {
    ab.slots.forEach(sl => {
      if (
        sl.date === date &&
        sl.timeSlot === timeSlot &&
        sl.substituteId !== null &&
        sl.id !== excludeSlotId
      ) {
        ids.push(sl.substituteId)
      }
    })
  })
  return new Set(ids)
}

export function isBusy(teacherId, date, timeSlot, schedules, absences, excludeSlotId = null) {
  const dayLabel = dateToDayLabel(date)
  if (!dayLabel) return true
  const hasClass = schedules.some(
    s => s.teacherId === teacherId && s.day === dayLabel && s.timeSlot === timeSlot
  )
  if (hasClass) return true
  return (absences || []).some(ab =>
    ab.slots.some(sl =>
      sl.substituteId === teacherId &&
      sl.date === date &&
      sl.timeSlot === timeSlot &&
      sl.id !== excludeSlotId
    )
  )
}

export function isAvailableBySchedule(teacher, day, timeSlot, periodConfigs) {
  if (!teacher.horariosSemana || Object.keys(teacher.horariosSemana).length === 0) return true
  const horarioDia = teacher.horariosSemana[day]
  if (!horarioDia) return false
  const resolved = resolveSlot(timeSlot, periodConfigs ?? {})
  if (!resolved) return true
  return toMin(horarioDia.entrada) <= toMin(resolved.inicio) && toMin(resolved.fim) <= toMin(horarioDia.saida)
}

export function weeklyLimitStatus(teacher, date, schedules, absences, sharedSeries = []) {
  // Apenas teacher-coordinator tem limite semanal
  if (teacher.profile !== 'teacher-coordinator') return 'ok'

  const ws         = weekStart(date)
  const weekDays   = businessDaysBetween(ws, date)
  const weekDaySet = new Set(weekDays.map(d => dateToDayLabel(d)).filter(Boolean))

  const ownAulas = schedules.filter(s =>
    s.teacherId === teacher.id &&
    weekDaySet.has(s.day) &&
    !isSharedSeries(s.turma, sharedSeries)
  ).length

  const subsAulas = (absences || []).reduce((acc, ab) => {
    return acc + ab.slots.filter(sl => {
      if (sl.substituteId !== teacher.id) return false
      if (!weekDays.includes(sl.date))    return false
      return !isSharedSeries(sl.turma, sharedSeries)
    }).length
  }, 0)

  return ownAulas + subsAulas < 10 ? 'ok' : 'at_limit'
}

export function isUnderWeeklyLimit(teacher, date, schedules, absences, sharedSeries = []) {
  return weeklyLimitStatus(teacher, date, schedules, absences, sharedSeries) === 'ok'
}
