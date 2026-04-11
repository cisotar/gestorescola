import { COLOR_PALETTE, COLOR_NEUTRAL } from './constants'

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export const h = (s) => String(s ?? '')

export const subKey = (teacherId, day, slot) => `${teacherId}||${day}||${slot}`

// ─── Cores ────────────────────────────────────────────────────────────────────

export function colorOfAreaId(areaId, store) {
  const area = store.areas.find(a => a.id === areaId)
  return area ? COLOR_PALETTE[area.colorIdx % COLOR_PALETTE.length] : COLOR_NEUTRAL
}

export function colorOfTeacher(teacher, store) {
  if (!teacher?.subjectIds?.length) return COLOR_NEUTRAL
  const subject = store.subjects.find(s => teacher.subjectIds.includes(s.id))
  return subject ? colorOfAreaId(subject.areaId, store) : COLOR_NEUTRAL
}

// ─── Turmas ───────────────────────────────────────────────────────────────────

export function allTurmaObjects(segments) {
  return segments.flatMap(seg =>
    seg.grades.flatMap(grade =>
      (grade.classes ?? []).map(cls => ({
        label:       `${grade.name} ${cls.letter}`,
        segmentId:   seg.id,
        segmentName: seg.name,
        gradeName:   grade.name,
        letter:      cls.letter,
        turno:       cls.turno ?? 'manha',
      }))
    )
  )
}

export function findTurma(label, segments) {
  return allTurmaObjects(segments).find(t => t.label === label) ?? null
}

export function isSharedSeriesTurma(turma, sharedSeries = []) {
  return sharedSeries.some(ss => ss.name === turma)
}

export function getSharedSeriesForTurma(turma, sharedSeries = []) {
  return sharedSeries.find(ss => ss.name === turma) ?? null
}

export function getSharedSeriesActivity(subjectId, sharedSeries = []) {
  for (const ss of sharedSeries) {
    const act = (ss.activities ?? []).find(a => a.id === subjectId)
    if (act) return act
  }
  return null
}

export function teacherSubjectNames(teacher, subjects) {
  return (teacher?.subjectIds ?? [])
    .map(sid => subjects.find(s => s.id === sid)?.name)
    .filter(Boolean)
    .join(', ')
}

// ─── Datas ────────────────────────────────────────────────────────────────────

export const parseDate  = (s) => new Date(s + 'T12:00:00')
export const formatISO  = (d) => d.toISOString().split('T')[0]
export const formatBR   = (s) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function dateToDayLabel(s) {
  const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']
  const idx = parseDate(s).getDay()
  return idx >= 1 && idx <= 5 ? DAYS[idx - 1] : null
}

export function weekStart(s) {
  const d = parseDate(s)
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay()
  d.setDate(d.getDate() + diff)
  return formatISO(d)
}

export function businessDaysBetween(from, to) {
  const result = []
  const cur = parseDate(from)
  const end = parseDate(to)
  while (cur <= end) {
    const idx = cur.getDay()
    if (idx >= 1 && idx <= 5) result.push(formatISO(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return result
}
