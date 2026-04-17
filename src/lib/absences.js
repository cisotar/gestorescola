import { uid, dateToDayLabel, formatISO, parseDate, weekStart, businessDaysBetween, isSharedSeriesTurma, getSharedSeriesActivity } from './helpers'
export { dateToDayLabel, formatISO, formatBR, parseDate, weekStart, businessDaysBetween } from './helpers'
import { resolveSlot } from './periods'

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

export function isAvailableBySchedule(teacher, day, timeSlot, periodConfigs) {
  if (!teacher.horariosSemana || Object.keys(teacher.horariosSemana).length === 0) return true
  const horarioDia = teacher.horariosSemana[day]
  if (!horarioDia) return false
  const resolved = resolveSlot(timeSlot, periodConfigs ?? {})
  if (!resolved) return true
  return horarioDia.entrada <= resolved.inicio && resolved.fim <= horarioDia.saida
}

export function isUnderWeeklyLimit(teacher, date, schedules, absences, sharedSeries = []) {
  const ws = weekStart(date)
  const weekDays = businessDaysBetween(ws, date)
  const weekDaySet = new Set(weekDays.map(d => dateToDayLabel(d)).filter(Boolean))

  const isFormacao = (sched) =>
    isSharedSeriesTurma(sched.turma, sharedSeries) ||
    !!getSharedSeriesActivity(sched.subjectId, sharedSeries)

  const ownAulas = schedules.filter(s =>
    s.teacherId === teacher.id &&
    weekDaySet.has(s.day) &&
    !isFormacao(s)
  ).length

  const subsAulas = (absences || []).reduce((acc, ab) => {
    return acc + ab.slots.filter(sl => {
      if (sl.substituteId !== teacher.id) return false
      if (!weekDays.includes(sl.date)) return false
      const isFormacaoSlot =
        isSharedSeriesTurma(sl.turma, sharedSeries) ||
        !!getSharedSeriesActivity(sl.subjectId, sharedSeries)
      return !isFormacaoSlot
    }).length
  }, 0)

  return ownAulas + subsAulas < 32
}

// ─── Ranking de candidatos ────────────────────────────────────────────────────
// Critérios (em ordem de prioridade):
//   0 — mesma matéria + mesmo segmento
//   1 — mesma matéria + outro segmento
//   2 — mesma área   + mesmo segmento
//   3 — mesma área   + outro segmento
//   4 — outra área
// Desempate: menor carga horária mensal

export function rankCandidates(absentTeacherId, date, timeSlot, subjectId, teachers, schedules, absences, subjects, areas, periodConfigs = {}, sharedSeries = []) {
  // Extrai o segmentId do timeSlot (formato: segmentId|turno|aulaIdx)
  const slotSegmentId = timeSlot?.split('|')[0] ?? null

  const absentAreaId = subjectId
    ? subjects.find(s => s.id === subjectId)?.areaId ?? null
    : null

  const teacherInSegment = (t) =>
    slotSegmentId
      ? (t.subjectIds ?? []).some(sid => {
          const subj = subjects.find(s => s.id === sid)
          const area = subj ? (areas ?? []).find(a => a.id === subj.areaId) : null
          return (area?.segmentIds ?? []).includes(slotSegmentId)
        })
      : false

  const scoreOf = (t) => {
    const sameSubj = subjectId ? (t.subjectIds ?? []).includes(subjectId) : false
    const sameArea = absentAreaId
      ? (t.subjectIds ?? []).some(sid => subjects.find(s => s.id === sid)?.areaId === absentAreaId)
      : false
    const sameSeg = teacherInSegment(t)

    if (sameSubj && sameSeg) return 0
    if (sameSubj)            return 1
    if (sameArea && sameSeg) return 2
    if (sameArea)            return 3
    return 4
  }

  const matchOf = (score) => {
    if (score <= 1) return 'subject'
    if (score <= 3) return 'area'
    return 'other'
  }

  const candidates = teachers
    .filter(t =>
      t.id !== absentTeacherId &&
      t.profile !== 'coordinator' &&
      !isBusy(t.id, date, timeSlot, schedules, absences) &&
      isAvailableBySchedule(t, dateToDayLabel(date), timeSlot, periodConfigs) &&
      isUnderWeeklyLimit(t, date, schedules, absences, sharedSeries)
    )
    .map(t => {
      const score = scoreOf(t)
      return {
        teacher: t,
        load:    monthlyLoad(t.id, date, schedules, absences),
        match:   matchOf(score),
        sameSeg: score === 0 || score === 2,
        score,
      }
    })

  return candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return a.load - b.load
  })
}

// ─── Sugestões Inteligentes ───────────────────────────────────────────────────
// Retorna top 3 professores sugeridos de acordo com a regra selecionada

export function suggestSubstitutes(absenceSlot, ruleType, store) {
  if (!absenceSlot || !absenceSlot.absentTeacherId) return []

  const _periodConfigs = store.periodConfigs ?? {}
  const _sharedSeries  = store.sharedSeries  ?? []

  // Candidatos base: aprovados, disponíveis, diferentes do ausente e excluindo coord. geral
  const baseCandidates = store.teachers.filter(t =>
    t.id !== absenceSlot.absentTeacherId &&
    t.status === 'approved' &&
    t.profile !== 'coordinator' &&
    !isBusy(t.id, absenceSlot.date, absenceSlot.slot, store.schedules, store.absences) &&
    isAvailableBySchedule(t, dateToDayLabel(absenceSlot.date), absenceSlot.slot, _periodConfigs) &&
    isUnderWeeklyLimit(t, absenceSlot.date, store.schedules, store.absences, _sharedSeries)
  )

  if (ruleType === 'qualitative') {
    const absentTeacher = store.teachers.find(t => t.id === absenceSlot.absentTeacherId)
    if (!absentTeacher) return []

    const absentSubjectId = absenceSlot.subjectId || (absentTeacher.subjectIds?.[0] ?? null)
    const absentArea = absentSubjectId
      ? store.subjects.find(s => s.id === absentSubjectId)?.areaId ?? null
      : null

    return baseCandidates
      .map(teacher => {
        let hierarchyLevel = 3

        if (absentSubjectId && (teacher.subjectIds ?? []).includes(absentSubjectId)) {
          hierarchyLevel = 1
        } else if (absentArea && (teacher.subjectIds ?? []).some(
          sid => store.subjects.find(s => s.id === sid)?.areaId === absentArea
        )) {
          hierarchyLevel = 2
        }

        const load = monthlyLoad(teacher.id, absenceSlot.date, store.schedules, store.absences)
        return { teacher, score: hierarchyLevel * 1000 + load }
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map(item => item.teacher)
  }

  if (ruleType === 'quantitative') {
    return baseCandidates
      .map(teacher => ({
        teacher,
        load: monthlyLoad(teacher.id, absenceSlot.date, store.schedules, store.absences),
      }))
      .sort((a, b) => a.load - b.load)
      .slice(0, 3)
      .map(item => item.teacher)
  }

  return []
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
