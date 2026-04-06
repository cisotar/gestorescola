import { uid, dateToDayLabel, formatISO, parseDate, weekStart, businessDaysBetween } from './helpers'
export { dateToDayLabel, formatISO, formatBR, parseDate, weekStart, businessDaysBetween } from './helpers'

// ─── Carga mensal ─────────────────────────────────────────────────────────────

export function monthlyLoad(teacherId, referenceDate, schedules, absences) {
  const ref        = parseDate(referenceDate)
  const monthStart = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2,'0')}-01`
  const days       = businessDaysBetween(monthStart, referenceDate)

  const scheduledLoad = days.reduce((acc, d) => {
    const dayLabel = dateToDayLabel(d)
    if (!dayLabel) return acc
    return acc + schedules.filter(s => s.teacherId === teacherId && s.day === dayLabel).length
  }, 0)

  const subsLoad = (absences || []).reduce((acc, ab) => {
    return acc + ab.slots.filter(sl =>
      sl.substituteId === teacherId && sl.date >= monthStart && sl.date <= referenceDate
    ).length
  }, 0)

  return scheduledLoad + subsLoad
}

// ─── Disponibilidade ──────────────────────────────────────────────────────────

export function isBusy(teacherId, date, timeSlot, schedules, absences) {
  const dayLabel = dateToDayLabel(date)
  if (!dayLabel) return true
  const hasClass = schedules.some(
    s => s.teacherId === teacherId && s.day === dayLabel && s.timeSlot === timeSlot
  )
  if (hasClass) return true
  return (absences || []).some(ab =>
    ab.slots.some(sl =>
      sl.substituteId === teacherId && sl.date === date && sl.timeSlot === timeSlot
    )
  )
}

// ─── Ranking de candidatos ────────────────────────────────────────────────────

export function rankCandidates(absentTeacherId, date, timeSlot, subjectId, teachers, schedules, absences, subjects) {
  const absentAreaId = subjectId
    ? subjects.find(s => s.id === subjectId)?.areaId ?? null
    : null

  const sameSubject = (t) => subjectId ? (t.subjectIds ?? []).includes(subjectId) : false
  const sameArea    = (t) => absentAreaId
    ? (t.subjectIds ?? []).some(sid => subjects.find(s => s.id === sid)?.areaId === absentAreaId)
    : false
  const matchScore  = (t) => sameSubject(t) ? 0 : sameArea(t) ? 1 : 2

  const today = new Date().toISOString().split('T')[0]

  const candidates = teachers
    .filter(t => t.id !== absentTeacherId && !isBusy(t.id, date, timeSlot, schedules, absences))
    .map(t => ({
      teacher: t,
      load:    monthlyLoad(t.id, date, schedules, absences),
      match:   sameSubject(t) ? 'subject' : sameArea(t) ? 'area' : 'other',
    }))

  return candidates.sort((a, b) => {
    const ga = matchScore(a.teacher), gb = matchScore(b.teacher)
    if (ga !== gb) return ga - gb
    return a.load - b.load
  })
}

// ─── CRUD (retornam novos arrays para Zustand) ────────────────────────────────

export function createAbsence(teacherId, rawSlots, absences = []) {
  const absence = {
    id: uid(),
    teacherId,
    createdAt: new Date().toISOString(),
    status: 'open',
    slots: rawSlots.map(s => ({
      id:           uid(),
      date:         s.date,
      day:          dateToDayLabel(s.date),
      timeSlot:     s.timeSlot,
      scheduleId:   s.scheduleId ?? null,
      subjectId:    s.subjectId  ?? null,
      turma:        s.turma      ?? '',
      substituteId: null,
    })),
  }
  return [...absences, absence]
}

export function assignSubstitute(absenceId, slotId, substituteId, absences) {
  return absences.map(ab => {
    if (ab.id !== absenceId) return ab
    const slots = ab.slots.map(s => s.id === slotId ? { ...s, substituteId: substituteId || null } : s)
    return { ...ab, slots, status: _calcStatus(slots) }
  })
}

export function deleteAbsenceSlot(absenceId, slotId, absences) {
  return absences
    .map(ab => {
      if (ab.id !== absenceId) return ab
      const slots = ab.slots.filter(s => s.id !== slotId)
      if (!slots.length) return null
      return { ...ab, slots, status: _calcStatus(slots) }
    })
    .filter(Boolean)
}

export function deleteAbsence(id, absences) {
  return absences.filter(a => a.id !== id)
}

function _calcStatus(slots) {
  const total   = slots.length
  const covered = slots.filter(s => s.substituteId).length
  return covered === 0 ? 'open' : covered < total ? 'partial' : 'covered'
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function absencesOf(teacherId, absences) {
  return (absences || [])
    .filter(a => a.teacherId === teacherId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function absenceSlotsInWeek(weekStartDate, absences) {
  const ws = weekStartDate
  const we = (() => {
    const d = parseDate(ws); d.setDate(d.getDate() + 4); return formatISO(d)
  })()
  return (absences || []).flatMap(ab =>
    ab.slots
      .filter(sl => sl.date >= ws && sl.date <= we)
      .map(sl => ({ ...sl, teacherId: ab.teacherId, absenceId: ab.id }))
  )
}
