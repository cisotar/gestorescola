import { uid } from '../helpers/ids'
import { dateToDayLabel } from '../helpers/dates'

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
  const { parseDate, formatISO } = require('../helpers/dates')
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
