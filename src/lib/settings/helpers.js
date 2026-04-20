import { gerarPeriodos, gerarPeriodosEspeciais, toMin, fromMin } from '../periods'

// ─── PROFILE_OPTIONS ─────────────────────────────────────────────────────

export const PROFILE_OPTIONS = [
  { value: 'teacher',             label: 'Professor',    pill: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'coordinator',         label: 'Coord. Geral', pill: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'teacher-coordinator', label: 'Prof. Coord.', pill: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'admin',               label: 'Admin',        pill: 'bg-red-100 text-red-700 border-red-200' },
]

export const PROFILE_OPTIONS_NO_ADMIN = PROFILE_OPTIONS.filter(o => o.value !== 'admin')

export const PROFILE_LABELS = {
  teacher:             'Professor',
  coordinator:         'Coord. Geral',
  'teacher-coordinator': 'Prof. Coord.',
  admin:               'Admin',
}

// ─── teacherSegmentIds ────────────────────────────────────────────────────
// Retorna lista de segmentIds associados ao professor via suas matérias/áreas.

export function teacherSegmentIds(teacher, subjects, areas) {
  return [...new Set(
    (teacher.subjectIds ?? []).flatMap(sid => {
      const subj = subjects.find(s => s.id === sid)
      const area = subj ? areas.find(a => a.id === subj.areaId) : null
      return area?.segmentIds ?? []
    })
  )]
}

// ─── teacherBelongsToSegment ──────────────────────────────────────────────────

export function teacherBelongsToSegment(teacher, segId, subjects, areas) {
  return teacherSegmentIds(teacher, subjects, areas).includes(segId)
}

// ─── isSharedSchedule ────────────────────────────────────────────────────
// Detecta se um schedule pertence a uma área compartilhada.

export function isSharedSchedule(schedule, store) {
  const subj = store.subjects.find(s => s.id === schedule.subjectId)
  const area = store.areas.find(a => a.id === subj?.areaId)
  return area?.shared === true
}

// ─── calcSubjectChange ────────────────────────────────────────────────────
// Calcula diferença entre matérias antigas e novas de um professor
// e quais horários seriam afetados pelas remoções.

export function calcSubjectChange(teacher, newSubjectIds, schedules) {
  const oldIds = teacher.subjectIds ?? []
  const removedIds = oldIds.filter(id => !newSubjectIds.includes(id))
  const addedIds   = newSubjectIds.filter(id => !oldIds.includes(id))
  const affectedSchedules = schedules.filter(
    s => s.teacherId === teacher.id && removedIds.includes(s.subjectId)
  )
  return { removedIds, addedIds, affectedSchedules }
}

// ─── calcAreaSubjectRemovalImpact ─────────────────────────────────────────────
// Calcula quantos schedules e professores seriam afetados ao remover matérias.

export function calcAreaSubjectRemovalImpact(removedSubjectIds, schedules, teachers) {
  const affectedSchedules = schedules.filter(s => removedSubjectIds.includes(s.subjectId))
  const affectedTeacherIds = [...new Set(affectedSchedules.map(s => s.teacherId))]
  const affectedTeachers = teachers.filter(t => affectedTeacherIds.includes(t.id))
  return { affectedSchedules, affectedTeachers }
}

// ─── buildPreviewItems ────────────────────────────────────────────────────
// Combina períodos regulares + especiais para o preview unificado de CardPeriodo.
// Importa de periods.js para manter a lógica de cálculo centralizada.

export function buildPreviewItems(cfg) {
  const itensRegulares = gerarPeriodos(cfg).map(p => ({
    isEspecial: false,
    isIntervalo: p.isIntervalo,
    inicio: p.inicio,
    fim: p.fim,
    label: p.label,
  }))

  // Fonte primária: gradeEspecial via gerarPeriodosEspeciais
  const periodosEspeciais = gerarPeriodosEspeciais(cfg)
  if (periodosEspeciais.length > 0) {
    const itensEspeciais = periodosEspeciais.map(p => ({
      isEspecial: true,
      isIntervalo: p.isIntervalo,
      inicio: p.inicio,
      fim: p.fim,
      label: p.label,
    }))
    return [...itensRegulares, ...itensEspeciais].sort((a, b) => toMin(a.inicio) - toMin(b.inicio))
  }

  // Fallback legacy: horariosEspeciais / intervalosEspeciais
  const horariosEspeciais = cfg.horariosEspeciais ?? []
  const intervalosEspeciais = cfg.intervalosEspeciais ?? []

  if (horariosEspeciais.length === 0) return itensRegulares

  const ordenados = [...horariosEspeciais].sort((a, b) => toMin(a.inicio) - toMin(b.inicio))

  const itensEspeciais = []
  for (const h of ordenados) {
    const fim = fromMin(toMin(h.inicio) + (h.duracao || 0))
    const N = horariosEspeciais.findIndex(orig => orig.id === h.id) + 1
    itensEspeciais.push({ isEspecial: true, isIntervalo: false, label: `Horário especial ${N}`, inicio: h.inicio, fim })

    intervalosEspeciais
      .filter(iv => iv.aposEspecial === h.id)
      .forEach(iv => {
        const ivFim = fromMin(toMin(fim) + (iv.duracao || 0))
        itensEspeciais.push({ isEspecial: true, isIntervalo: true, label: 'Intervalo especial', inicio: fim, fim: ivFim })
      })
  }

  return [...itensRegulares, ...itensEspeciais].sort((a, b) => toMin(a.inicio) - toMin(b.inicio))
}

// ─── timeAgo ──────────────────────────────────────────────────────────────────
// Formata um timestamp Firebase em texto relativo (ex: "há 5 min").

export function timeAgo(ts) {
  const ms = Date.now() - (ts?.toDate?.() ?? new Date(ts)).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'agora mesmo'
  if (mins < 60) return `há ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `há ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `há ${days} dia${days !== 1 ? 's' : ''}`
}

// ─── myTimeAgo ────────────────────────────────────────────────────────────────
// Versão para "Minhas Solicitações" — idêntica, mantida separada para clareza semântica.

export function myTimeAgo(ts) {
  if (!ts) return '—'
  return timeAgo(ts)
}

// ─── STATUS_BADGE ─────────────────────────────────────────────────────────────

export const STATUS_BADGE = {
  pending:  { label: 'Pendente',  cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  approved: { label: 'Aprovada',  cls: 'bg-green-100 text-green-800 border-green-300' },
  rejected: { label: 'Rejeitada', cls: 'bg-red-100 text-red-800 border-red-300' },
}
