import { dateToDayLabel } from '../helpers/dates'
import { isBusy, isAvailableBySchedule, monthlyLoad, weeklyLimitStatus } from './validation'

/**
 * Classifica professores candidatos a substituto por compatibilidade com a aula ausente.
 *
 * Scoring (em ordem de prioridade):
 *   0 — mesma matéria + mesmo segmento (melhor compatibilidade)
 *   1 — mesma matéria + outro segmento
 *   2 — mesma área + mesmo segmento
 *   3 — mesma área + outro segmento
 *   4 — outra área / turmas compartilhadas (pior compatibilidade, mas aceitável)
 *
 * COMPORTAMENTO ESPECIAL PARA TURMAS COMPARTILHADAS:
 * - Turmas de FORMAÇÃO e ELETIVA têm subjectId apontando para subjects[].id normalmente
 * - Resultado: todos os candidatos recebem score 4 (igualmente compatíveis)
 * - Desempate: menor carga mensal (monthlyLoad) vence
 * - Isso é INTENCIONAL — em turmas compartilhadas, competência pedagógica é idêntica
 *
 * Desempates (mesmo score):
 * 1. weeklyLimitStatus: candidatos não no limite vêm primeiro
 * 2. monthlyLoad: menor carga mensal vence
 *
 * @param {string} absentTeacherId - ID do professor ausente
 * @param {string} date - Data da ausência (ISO format)
 * @param {string} timeSlot - Slot de tempo (ex: "seg-fund|manha|3")
 * @param {string|null} subjectId - Matéria da aula (null para turmas compartilhadas)
 * @param {Array} teachers - Lista de professores aprovados
 * @param {Array} schedules - Grade horária
 * @param {Array} absences - Ausências registradas
 * @param {Array} subjects - Matérias do banco
 * @param {Array} areas - Áreas de conhecimento
 * @param {Object} [periodConfigs={}] - Configuração de períodos por segmento/turno
 * @param {Array} [sharedSeries=[]] - Turmas compartilhadas (FORMAÇÃO, ELETIVA)
 * @returns {Array<{teacher, load, match, sameSeg, score, atLimit}>} Candidatos ordenados por score e carga
 */
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
    // Para turmas compartilhadas (FORMAÇÃO/ELETIVA), subjectId === null
    // Isso resulta em sameSubj = false e sameArea = null (não encontra área)
    // Logo, score será sempre 4 — qualquer professor é igualmente compatível
    const sameSubj = subjectId ? (t.subjectIds ?? []).includes(subjectId) : false
    const sameArea = absentAreaId
      ? (t.subjectIds ?? []).some(sid => subjects.find(s => s.id === sid)?.areaId === absentAreaId)
      : false
    const sameSeg = teacherInSegment(t)

    if (sameSubj && sameSeg) return 0
    if (sameSubj)            return 1
    if (sameArea && sameSeg) return 2
    if (sameArea)            return 3
    return 4  // Score 4: outras áreas E turmas compartilhadas (compatibilidade genérica)
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
      isAvailableBySchedule(t, dateToDayLabel(date), timeSlot, periodConfigs)
    )
    .map(t => {
      const score       = scoreOf(t)
      const limitStatus = weeklyLimitStatus(t, date, schedules, absences, sharedSeries)
      return {
        teacher: t,
        load:    monthlyLoad(t.id, date, schedules, absences, sharedSeries),
        match:   matchOf(score),
        sameSeg: score === 0 || score === 2,
        score,
        atLimit: limitStatus === 'at_limit',
      }
    })

  return candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    if (a.atLimit !== b.atLimit) return a.atLimit ? 1 : -1
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
    isAvailableBySchedule(t, dateToDayLabel(absenceSlot.date), absenceSlot.slot, _periodConfigs)
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
        // Para turmas compartilhadas (subjectId === null):
        // hierarchyLevel = 3 (outra área / sem especialização)
        // Candidatos desempatam por carga — corretamente distribuindo substituições

        const load    = monthlyLoad(teacher.id, absenceSlot.date, store.schedules, store.absences, _sharedSeries)
        const atLimit = weeklyLimitStatus(teacher, absenceSlot.date, store.schedules, store.absences, _sharedSeries) === 'at_limit'
        const score   = hierarchyLevel * 1000 + load + (atLimit ? 10000 : 0)
        return { teacher, load, score, atLimit }
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map(item => ({ teacher: item.teacher, load: item.load, score: item.score, atLimit: item.atLimit }))
  }

  if (ruleType === 'quantitative') {
    return baseCandidates
      .map(teacher => {
        const load    = monthlyLoad(teacher.id, absenceSlot.date, store.schedules, store.absences, _sharedSeries)
        const atLimit = weeklyLimitStatus(teacher, absenceSlot.date, store.schedules, store.absences, _sharedSeries) === 'at_limit'
        return { teacher, load, atLimit }
      })
      .sort((a, b) => (a.load + (a.atLimit ? 99999 : 0)) - (b.load + (b.atLimit ? 99999 : 0)))
      .slice(0, 3)
      .map(item => ({ teacher: item.teacher, load: item.load, atLimit: item.atLimit }))
  }

  return []
}
