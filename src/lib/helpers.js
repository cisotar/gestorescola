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

/**
 * Detecta se um nome de turma refere-se a uma turma compartilhada.
 *
 * Compara o nome da turma exatamente contra a lista de turmas compartilhadas,
 * retornando verdadeiro apenas se houver match exato no campo `name`.
 *
 * @param {string} turmaName - Nome da turma a verificar (ex: "FORMAÇÃO", "6º Ano A")
 * @param {Array<{id: string, name: string, type: string}>} sharedSeries - Lista de turmas compartilhadas do banco
 * @returns {boolean} true se turmaName existe em sharedSeries[].name, false caso contrário
 *
 * @example
 * // Detecta turma compartilhada pelo nome exato
 * isSharedSeries('FORMAÇÃO', [{id: '1', name: 'FORMAÇÃO', type: 'formation'}]) // → true
 *
 * @example
 * // Case-sensitive: não detecta caso mude maiúscula/minúscula
 * isSharedSeries('formação', [{id: '1', name: 'FORMAÇÃO', type: 'formation'}]) // → false
 *
 * @example
 * // Retorna false para turmas regulares ou array vazio
 * isSharedSeries('6º Ano A', [{id: '1', name: 'FORMAÇÃO', type: 'formation'}]) // → false
 * isSharedSeries('FORMAÇÃO', []) // → false
 */
export function isSharedSeries(turmaName, sharedSeries = []) {
  return sharedSeries.some(ss => ss.name === turmaName)
}

/**
 * Retorna o objeto completo de uma turma compartilhada pelo nome.
 *
 * Busca uma turma compartilhada na lista por match exato de nome,
 * retornando seus campos `id`, `name` e `type`. Usado para decidir
 * se uma ausência demanda substituto (baseado no `type`).
 *
 * @param {string} name - Nome da turma compartilhada (ex: "FORMAÇÃO", "Eletiva 2024")
 * @param {Array<{id: string, name: string, type: 'formation'|'elective'}>} [sharedSeries=[]] - Lista de turmas compartilhadas
 * @returns {{id: string, name: string, type: string} | null} Objeto completo se encontrado, null caso contrário
 *
 * @example
 * // Encontra turma de formação
 * getSharedSeriesByName('FORMAÇÃO', [{id: '1', name: 'FORMAÇÃO', type: 'formation'}])
 * // → { id: '1', name: 'FORMAÇÃO', type: 'formation' }
 *
 * @example
 * // Turma regular ou não encontrada
 * getSharedSeriesByName('6º Ano A', [{id: '1', name: 'FORMAÇÃO', type: 'formation'}])
 * // → null
 *
 * @example
 * // Array vazio
 * getSharedSeriesByName('FORMAÇÃO', [])
 * // → null
 */
export function getSharedSeriesByName(name, sharedSeries = []) {
  return sharedSeries.find(ss => ss.name === name) ?? null
}

// Backward compatibility alias
export function getSharedSeriesForTurma(turma, sharedSeries = []) {
  return getSharedSeriesByName(turma, sharedSeries)
}

export function getSharedSeriesActivity(subjectId, sharedSeries = []) {
  for (const ss of sharedSeries) {
    const act = (ss.activities ?? []).find(a => a.id === subjectId)
    if (act) return act
  }
  return null
}

/**
 * Detecta se um slot é de aula de formação (type === "formation").
 *
 * Verifica dois caminhos:
 * 1. Turma é uma turma compartilhada de tipo "formation"
 * 2. SubjectId é uma atividade dentro de turma compartilhada de tipo "formation"
 *
 * @param {string|null} turma - Nome da turma (ex: "FORMAÇÃO", "6º Ano A", null)
 * @param {string|null} subjectId - ID da matéria/atividade (ex: "subj-bio", "act-id", null)
 * @param {Array<{id: string, name: string, type: 'formation'|'elective', activities?: Array<{id: string, name: string}>}>} [sharedSeries=[]]
 *   - Lista de turmas compartilhadas com metadados de tipo
 * @returns {boolean} true se slot pertence a turma de formação, false caso contrário
 *
 * @example
 * // Turma de formação — retorna true
 * isFormationSlot("FORMAÇÃO", null, [{id: '1', name: 'FORMAÇÃO', type: 'formation'}])
 * // → true
 *
 * @example
 * // Activity que é de formação — retorna true
 * isFormationSlot("ATPCG", "act-1", [
 *   {id: '1', name: 'FORMAÇÃO', type: 'formation', activities: [{id: 'act-1', name: 'ATPCG'}]}
 * ])
 * // → true
 *
 * @example
 * // Turma de eletiva — retorna false
 * isFormationSlot("Eletiva 2024", null, [{id: '2', name: 'Eletiva 2024', type: 'elective'}])
 * // → false
 *
 * @example
 * // Turma regular (não compartilhada) — retorna false
 * isFormationSlot("6º Ano A", "subj-bio", [{id: '1', name: 'FORMAÇÃO', type: 'formation'}])
 * // → false
 *
 * @example
 * // Ambos nulos — retorna false
 * isFormationSlot(null, null, [{id: '1', name: 'FORMAÇÃO', type: 'formation'}])
 * // → false
 *
 * @example
 * // sharedSeries vazio — retorna false
 * isFormationSlot("FORMAÇÃO", null, [])
 * // → false
 *
 * @example
 * // Activity em turma de eletiva (não-formação) — retorna false
 * isFormationSlot(null, "act-2", [{id: '2', name: 'Eletiva 2024', type: 'elective', activities: [{id: 'act-2', name: 'Prática'}]}])
 * // → false
 *
 * @example
 * // sharedSeries undefined (default) — retorna false
 * isFormationSlot("FORMAÇÃO", null)
 * // → false
 */
export function isFormationSlot(turma, subjectId, sharedSeries = []) {
  // Verificar se turma é uma turma compartilhada de tipo "formation"
  if (turma) {
    const sharedTurma = sharedSeries.find(ss => ss.name === turma)
    if (sharedTurma && sharedTurma.type === 'formation') {
      return true
    }
  }

  // Verificar se subjectId é uma atividade de uma turma compartilhada de tipo "formation"
  if (subjectId) {
    for (const ss of sharedSeries) {
      if (ss.type === 'formation') {
        const activity = (ss.activities ?? []).find(a => a.id === subjectId)
        if (activity) return true
      }
    }
  }

  return false
}

export function teacherSubjectNames(teacher, subjects) {
  return (teacher?.subjectIds ?? [])
    .map(sid => subjects.find(s => s.id === sid)?.name)
    .filter(Boolean)
    .join(', ')
}

// ─── Datas ────────────────────────────────────────────────────────────────────

export const parseDate = (s) => {
  if (!s || typeof s !== 'string') return new Date(NaN)
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export const formatISO = (d) => {
  if (!d || isNaN(d.getTime())) return null
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
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

export const formatMonthlyAulas = (count) =>
  count === 1 ? '1 aula' : `${count} aulas`
