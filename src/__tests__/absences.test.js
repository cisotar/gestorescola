import { describe, it, expect } from 'vitest'
import {
  rankCandidates,
  monthlyLoad,
  isBusy,
  isAvailableBySchedule,
  weeklyLimitStatus,
  isUnderWeeklyLimit,
  substitutesAtSlot,
} from '../lib/absences/index.js'

// ─── Fixtures compartilhadas ──────────────────────────────────────────────────

const AREA_CIENCIAS = { id: 'area-ciencias', name: 'Ciências', segmentIds: ['seg-fund'] }
const AREA_HUMANAS  = { id: 'area-humanas',  name: 'Humanas',  segmentIds: ['seg-fund', 'seg-medio'] }
const AREA_EXATAS   = { id: 'area-exatas',   name: 'Exatas',   segmentIds: ['seg-medio'] }

const SUBJ_BIO  = { id: 'subj-bio',  name: 'Biologia',   areaId: 'area-ciencias' }
const SUBJ_QUIM = { id: 'subj-quim', name: 'Química',    areaId: 'area-ciencias' }
const SUBJ_HIST = { id: 'subj-hist', name: 'História',   areaId: 'area-humanas'  }
const SUBJ_GEO  = { id: 'subj-geo',  name: 'Geografia',  areaId: 'area-humanas'  }
const SUBJ_MAT  = { id: 'subj-mat',  name: 'Matemática', areaId: 'area-exatas'   }

const subjects = [SUBJ_BIO, SUBJ_QUIM, SUBJ_HIST, SUBJ_GEO, SUBJ_MAT]
const areas    = [AREA_CIENCIAS, AREA_HUMANAS, AREA_EXATAS]

// timeSlot no formato segmentId|turno|aulaIdx
const TIME_SLOT_FUND  = 'seg-fund|manha|2'   // aulaIdx 2, segmento seg-fund
const TIME_SLOT_MEDIO = 'seg-medio|manha|1'  // aulaIdx 1, segmento seg-medio

// 2026-04-13 é Segunda-feira; 2026-04-14 é Terça-feira; 2026-04-17 é Sexta-feira
const DATE_MON = '2026-04-13'
const DATE_TUE = '2026-04-14'
const DATE_FRI = '2026-04-17'

const ABSENT_ID = 'teacher-absent'

const makeTeacher = (overrides = {}) => ({
  id: 'teacher-default',
  name: 'Professor Default',
  profile: 'teacher',
  subjectIds: [],
  ...overrides,
})

// ─── monthlyLoad ──────────────────────────────────────────────────────────────

describe('monthlyLoad', () => {
  it('retorna 0 quando não há aulas agendadas nem ausências', () => {
    expect(monthlyLoad('t1', DATE_MON, [], [], [])).toBe(0)
  })

  it('conta aulas agendadas no mês para o professor', () => {
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: TIME_SLOT_FUND },
    ]
    // businessDaysBetween('2026-04-01', '2026-04-13') inclui 2 segundas (06 e 13)
    const load = monthlyLoad('t1', DATE_MON, schedules, [], [])
    expect(load).toBe(2)
  })

  it('deduz ausências do professor (turma regular) da carga mensal', () => {
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: TIME_SLOT_FUND },
    ]
    const absences = [
      {
        id: 'abs1',
        teacherId: 't1',
        slots: [{ date: DATE_MON, timeSlot: TIME_SLOT_FUND, turma: '9A', substituteId: null }],
      },
    ]
    // 2 segundas agendadas - 1 ausência = 1
    const load = monthlyLoad('t1', DATE_MON, schedules, absences, [])
    expect(load).toBe(1)
  })

  it('soma substituições feitas pelo professor à carga mensal', () => {
    const absences = [
      {
        id: 'abs1',
        teacherId: 'outro',
        slots: [{ date: DATE_MON, timeSlot: TIME_SLOT_FUND, turma: '9A', substituteId: 't1' }],
      },
    ]
    const load = monthlyLoad('t1', DATE_MON, [], absences, [])
    expect(load).toBe(1)
  })

  it('não deduz ausências de turma compartilhada (FORMAÇÃO)', () => {
    const sharedSeries = [{ id: 'ss1', name: 'FORMAÇÃO', type: 'formation' }]
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: TIME_SLOT_FUND },
    ]
    const absences = [
      {
        id: 'abs1',
        teacherId: 't1',
        slots: [{ date: DATE_MON, timeSlot: TIME_SLOT_FUND, turma: 'FORMAÇÃO', substituteId: null }],
      },
    ]
    // Ausência em FORMAÇÃO não deduz: 2 segundas agendadas = 2
    const load = monthlyLoad('t1', DATE_MON, schedules, absences, sharedSeries)
    expect(load).toBe(2)
  })

  it('nunca retorna valor negativo', () => {
    const absences = [
      {
        id: 'abs1',
        teacherId: 't1',
        slots: [{ date: DATE_MON, timeSlot: TIME_SLOT_FUND, turma: '9A', substituteId: null }],
      },
    ]
    // Nenhuma aula agendada, mas 1 ausência → Math.max(0, ...) = 0
    const load = monthlyLoad('t1', DATE_MON, [], absences, [])
    expect(load).toBe(0)
  })
})

// ─── isBusy ───────────────────────────────────────────────────────────────────

describe('isBusy', () => {
  it('retorna false quando professor não tem aula nem substituição no slot', () => {
    expect(isBusy('t1', DATE_MON, TIME_SLOT_FUND, [], [])).toBe(false)
  })

  it('retorna true quando professor tem aula agendada no slot', () => {
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: TIME_SLOT_FUND },
    ]
    expect(isBusy('t1', DATE_MON, TIME_SLOT_FUND, schedules, [])).toBe(true)
  })

  it('retorna true quando professor é substituto em outro slot no mesmo horário', () => {
    const absences = [
      {
        id: 'abs1',
        teacherId: 'outro',
        slots: [{ date: DATE_MON, timeSlot: TIME_SLOT_FUND, turma: '9A', substituteId: 't1' }],
      },
    ]
    expect(isBusy('t1', DATE_MON, TIME_SLOT_FUND, [], absences)).toBe(true)
  })

  it('retorna true para data de fim de semana', () => {
    // 2026-04-19 é domingo — dateToDayLabel retorna null
    expect(isBusy('t1', '2026-04-19', TIME_SLOT_FUND, [], [])).toBe(true)
  })

  it('não lança exceção quando absences é undefined', () => {
    expect(() => isBusy('t1', DATE_MON, TIME_SLOT_FUND, [], undefined)).not.toThrow()
    expect(isBusy('t1', DATE_MON, TIME_SLOT_FUND, [], undefined)).toBe(false)
  })
})

// ─── isAvailableBySchedule ────────────────────────────────────────────────────

describe('isAvailableBySchedule', () => {
  it('retorna true quando horariosSemana está ausente', () => {
    const teacher = makeTeacher({ horariosSemana: undefined })
    expect(isAvailableBySchedule(teacher, 'Segunda', TIME_SLOT_FUND, {})).toBe(true)
  })

  it('retorna true quando horariosSemana está vazio', () => {
    const teacher = makeTeacher({ horariosSemana: {} })
    expect(isAvailableBySchedule(teacher, 'Segunda', TIME_SLOT_FUND, {})).toBe(true)
  })

  it('retorna false quando não há entrada para o dia da semana', () => {
    const teacher = makeTeacher({
      horariosSemana: { Terça: { entrada: '07:00', saida: '17:00' } },
    })
    expect(isAvailableBySchedule(teacher, 'Segunda', TIME_SLOT_FUND, {})).toBe(false)
  })

  it('retorna true quando periodConfigs está vazio (slot não resolvido = disponível)', () => {
    const teacher = makeTeacher({
      horariosSemana: { Segunda: { entrada: '07:00', saida: '17:00' } },
    })
    // periodConfigs vazio → resolveSlot retorna null → retorna true por padrão
    expect(isAvailableBySchedule(teacher, 'Segunda', TIME_SLOT_FUND, {})).toBe(true)
  })

  it('retorna true quando slot está dentro do horário do professor', () => {
    const periodConfigs = {
      'seg-fund': {
        manha: { inicio: '07:00', duracao: 50, qtd: 5, intervalos: [] },
      },
    }
    const teacher = makeTeacher({
      horariosSemana: { Segunda: { entrada: '07:00', saida: '17:00' } },
    })
    // Aula 2: começa 07:50, termina 08:40 — dentro de 07:00–17:00
    expect(isAvailableBySchedule(teacher, 'Segunda', 'seg-fund|manha|2', periodConfigs)).toBe(true)
  })

  it('retorna false quando slot está fora do horário do professor', () => {
    const periodConfigs = {
      'seg-fund': {
        manha: { inicio: '07:00', duracao: 50, qtd: 5, intervalos: [] },
      },
    }
    const teacher = makeTeacher({
      horariosSemana: { Segunda: { entrada: '09:00', saida: '10:00' } },
    })
    // Aula 1: começa 07:00, termina 07:50 — fora de 09:00–10:00
    expect(isAvailableBySchedule(teacher, 'Segunda', 'seg-fund|manha|1', periodConfigs)).toBe(false)
  })
})

// ─── weeklyLimitStatus ────────────────────────────────────────────────────────

describe('weeklyLimitStatus', () => {
  it('retorna ok para professor com profile teacher (sem limite semanal)', () => {
    const teacher = makeTeacher({ id: 't1', profile: 'teacher' })
    expect(weeklyLimitStatus(teacher, DATE_MON, [], [], [])).toBe('ok')
  })

  it('retorna ok para teacher-coordinator com menos de 10 aulas na semana', () => {
    const teacher = makeTeacher({ id: 't1', profile: 'teacher-coordinator' })
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: TIME_SLOT_FUND, turma: '9A' },
      { teacherId: 't1', day: 'Terça',   timeSlot: TIME_SLOT_FUND, turma: '8B' },
    ]
    expect(weeklyLimitStatus(teacher, DATE_MON, schedules, [], [])).toBe('ok')
  })

  it('retorna at_limit para teacher-coordinator com exatamente 10 aulas na semana', () => {
    const teacher = makeTeacher({ id: 't1', profile: 'teacher-coordinator' })
    // Usando DATE_FRI (sexta): weekStart = seg-13, businessDaysBetween inclui toda a semana
    // 2 aulas por dia × 5 dias = 10 aulas → ownAulas + subsAulas >= 10 → at_limit
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: 'seg-fund|manha|1', turma: '9A' },
      { teacherId: 't1', day: 'Segunda', timeSlot: 'seg-fund|manha|3', turma: '9A' },
      { teacherId: 't1', day: 'Terça',   timeSlot: 'seg-fund|manha|1', turma: '8B' },
      { teacherId: 't1', day: 'Terça',   timeSlot: 'seg-fund|manha|3', turma: '8B' },
      { teacherId: 't1', day: 'Quarta',  timeSlot: 'seg-fund|manha|1', turma: '7C' },
      { teacherId: 't1', day: 'Quarta',  timeSlot: 'seg-fund|manha|3', turma: '7C' },
      { teacherId: 't1', day: 'Quinta',  timeSlot: 'seg-fund|manha|1', turma: '6D' },
      { teacherId: 't1', day: 'Quinta',  timeSlot: 'seg-fund|manha|3', turma: '6D' },
      { teacherId: 't1', day: 'Sexta',   timeSlot: 'seg-fund|manha|1', turma: '5E' },
      { teacherId: 't1', day: 'Sexta',   timeSlot: 'seg-fund|manha|3', turma: '5E' },
    ]
    expect(weeklyLimitStatus(teacher, DATE_FRI, schedules, [], [])).toBe('at_limit')
  })

  it('soma substituições feitas na semana ao limite do teacher-coordinator', () => {
    const teacher = makeTeacher({ id: 't1', profile: 'teacher-coordinator' })
    // 8 aulas próprias + 2 substituições na semana = 10 → at_limit
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: 'seg-fund|manha|1', turma: '9A' },
      { teacherId: 't1', day: 'Segunda', timeSlot: 'seg-fund|manha|3', turma: '9A' },
      { teacherId: 't1', day: 'Terça',   timeSlot: 'seg-fund|manha|1', turma: '8B' },
      { teacherId: 't1', day: 'Terça',   timeSlot: 'seg-fund|manha|3', turma: '8B' },
      { teacherId: 't1', day: 'Quarta',  timeSlot: 'seg-fund|manha|1', turma: '7C' },
      { teacherId: 't1', day: 'Quarta',  timeSlot: 'seg-fund|manha|3', turma: '7C' },
      { teacherId: 't1', day: 'Quinta',  timeSlot: 'seg-fund|manha|1', turma: '6D' },
      { teacherId: 't1', day: 'Quinta',  timeSlot: 'seg-fund|manha|3', turma: '6D' },
    ]
    const absences = [
      {
        id: 'abs1',
        teacherId: 'outro',
        slots: [
          { date: '2026-04-13', timeSlot: 'seg-fund|manha|4', turma: '5E', substituteId: 't1' },
          { date: '2026-04-14', timeSlot: 'seg-fund|manha|4', turma: '5E', substituteId: 't1' },
        ],
      },
    ]
    // 8 ownAulas + 2 subsAulas = 10 → at_limit
    expect(weeklyLimitStatus(teacher, DATE_FRI, schedules, absences, [])).toBe('at_limit')
  })

  it('não conta turmas compartilhadas no limite semanal', () => {
    const sharedSeries = [{ id: 'ss1', name: 'FORMAÇÃO', type: 'formation' }]
    const teacher = makeTeacher({ id: 't1', profile: 'teacher-coordinator' })
    // 10 aulas de FORMAÇÃO — não contam para o limite (usando DATE_FRI para cobrir toda a semana)
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: 'seg-fund|manha|1', turma: 'FORMAÇÃO' },
      { teacherId: 't1', day: 'Segunda', timeSlot: 'seg-fund|manha|3', turma: 'FORMAÇÃO' },
      { teacherId: 't1', day: 'Terça',   timeSlot: 'seg-fund|manha|1', turma: 'FORMAÇÃO' },
      { teacherId: 't1', day: 'Terça',   timeSlot: 'seg-fund|manha|3', turma: 'FORMAÇÃO' },
      { teacherId: 't1', day: 'Quarta',  timeSlot: 'seg-fund|manha|1', turma: 'FORMAÇÃO' },
      { teacherId: 't1', day: 'Quarta',  timeSlot: 'seg-fund|manha|3', turma: 'FORMAÇÃO' },
      { teacherId: 't1', day: 'Quinta',  timeSlot: 'seg-fund|manha|1', turma: 'FORMAÇÃO' },
      { teacherId: 't1', day: 'Quinta',  timeSlot: 'seg-fund|manha|3', turma: 'FORMAÇÃO' },
      { teacherId: 't1', day: 'Sexta',   timeSlot: 'seg-fund|manha|1', turma: 'FORMAÇÃO' },
      { teacherId: 't1', day: 'Sexta',   timeSlot: 'seg-fund|manha|3', turma: 'FORMAÇÃO' },
    ]
    expect(weeklyLimitStatus(teacher, DATE_FRI, schedules, [], sharedSeries)).toBe('ok')
  })
})

// ─── isUnderWeeklyLimit ───────────────────────────────────────────────────────

describe('isUnderWeeklyLimit', () => {
  it('retorna true quando weeklyLimitStatus é ok', () => {
    const teacher = makeTeacher({ id: 't1', profile: 'teacher' })
    expect(isUnderWeeklyLimit(teacher, DATE_MON, [], [], [])).toBe(true)
  })

  it('retorna false quando weeklyLimitStatus é at_limit', () => {
    const teacher = makeTeacher({ id: 't1', profile: 'teacher-coordinator' })
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: 'seg-fund|manha|1', turma: '9A' },
      { teacherId: 't1', day: 'Segunda', timeSlot: 'seg-fund|manha|3', turma: '9A' },
      { teacherId: 't1', day: 'Terça',   timeSlot: 'seg-fund|manha|1', turma: '8B' },
      { teacherId: 't1', day: 'Terça',   timeSlot: 'seg-fund|manha|3', turma: '8B' },
      { teacherId: 't1', day: 'Quarta',  timeSlot: 'seg-fund|manha|1', turma: '7C' },
      { teacherId: 't1', day: 'Quarta',  timeSlot: 'seg-fund|manha|3', turma: '7C' },
      { teacherId: 't1', day: 'Quinta',  timeSlot: 'seg-fund|manha|1', turma: '6D' },
      { teacherId: 't1', day: 'Quinta',  timeSlot: 'seg-fund|manha|3', turma: '6D' },
      { teacherId: 't1', day: 'Sexta',   timeSlot: 'seg-fund|manha|1', turma: '5E' },
      { teacherId: 't1', day: 'Sexta',   timeSlot: 'seg-fund|manha|3', turma: '5E' },
    ]
    expect(isUnderWeeklyLimit(teacher, DATE_FRI, schedules, [], [])).toBe(false)
  })
})

// ─── rankCandidates — filtros ────────────────────────────────────────────────

describe('rankCandidates — filtros', () => {
  it('retorna [] quando lista de professores está vazia', () => {
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', [], [], [], subjects, areas)
    expect(result).toEqual([])
  })

  it('filtra o professor ausente da lista de candidatos', () => {
    const teachers = [
      makeTeacher({ id: ABSENT_ID, subjectIds: ['subj-bio'] }),
    ]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], [], subjects, areas)
    expect(result).toHaveLength(0)
  })

  it('filtra coordenadores (profile coordinator) da lista', () => {
    const teachers = [
      makeTeacher({ id: 'coord1', profile: 'coordinator', subjectIds: ['subj-bio'] }),
    ]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], [], subjects, areas)
    expect(result).toHaveLength(0)
  })

  it('filtra professores que têm aula agendada no mesmo slot (isBusy)', () => {
    const teachers = [
      makeTeacher({ id: 't1', subjectIds: ['subj-bio'] }),
    ]
    // t1 tem aula na Segunda no TIME_SLOT_FUND — DATE_MON é segunda-feira
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: TIME_SLOT_FUND },
    ]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, schedules, [], subjects, areas)
    expect(result).toHaveLength(0)
  })

  it('retorna [] quando todos os professores estão ocupados', () => {
    const teachers = [
      makeTeacher({ id: 't1', subjectIds: ['subj-bio'] }),
      makeTeacher({ id: 't2', subjectIds: ['subj-quim'] }),
    ]
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: TIME_SLOT_FUND },
      { teacherId: 't2', day: 'Segunda', timeSlot: TIME_SLOT_FUND },
    ]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, schedules, [], subjects, areas)
    expect(result).toHaveLength(0)
  })

  it('filtra professores fora do horário configurado (isAvailableBySchedule)', () => {
    const teachers = [
      makeTeacher({
        id: 't1',
        subjectIds: ['subj-bio'],
        horariosSemana: { Segunda: { entrada: '14:00', saida: '18:00' } },
      }),
    ]
    const periodConfigs = {
      'seg-fund': {
        manha: { inicio: '07:00', duracao: 50, qtd: 5, intervalos: [] },
      },
    }
    // Aula 2 é das 07:50–08:40, mas teacher só trabalha 14:00–18:00 → filtrado
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], [], subjects, areas, periodConfigs)
    expect(result).toHaveLength(0)
  })
})

// ─── rankCandidates — scores ──────────────────────────────────────────────────

describe('rankCandidates — scores', () => {
  it('score 0: mesma matéria + mesmo segmento', () => {
    // seg-fund está em area-ciencias.segmentIds; teacher tem subj-bio (area-ciencias)
    const teachers = [makeTeacher({ id: 't1', subjectIds: ['subj-bio'] })]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], [], subjects, areas)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(0)
    expect(result[0].match).toBe('subject')
    expect(result[0].sameSeg).toBe(true)
  })

  it('score 1: mesma matéria + outro segmento', () => {
    // TIME_SLOT_MEDIO tem segmentId seg-medio
    // area-ciencias.segmentIds = ['seg-fund'] → não inclui seg-medio
    // teacher tem subj-bio (area-ciencias): mesma matéria mas segmento diferente → score 1
    const teachers = [makeTeacher({ id: 't1', subjectIds: ['subj-bio'] })]
    // DATE_TUE é terça-feira → dia válido
    const result = rankCandidates(ABSENT_ID, DATE_TUE, TIME_SLOT_MEDIO, 'subj-bio', teachers, [], [], subjects, areas)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(1)
    expect(result[0].match).toBe('subject')
    expect(result[0].sameSeg).toBe(false)
  })

  it('score 2: mesma área + mesmo segmento', () => {
    // teacher tem subj-quim (area-ciencias, seg-fund) — NÃO tem subj-bio mas mesma área
    // slot é seg-fund → sameSeg = true → score 2
    const teachers = [makeTeacher({ id: 't1', subjectIds: ['subj-quim'] })]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], [], subjects, areas)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(2)
    expect(result[0].match).toBe('area')
    expect(result[0].sameSeg).toBe(true)
  })

  it('score 3: mesma área + outro segmento', () => {
    // area-especial inclui apenas seg-medio; ausente e teacher ambos na area-especial
    // slot é seg-fund → teacherInSegment verifica area-especial.segmentIds = ['seg-medio'] → false
    // sameSubj = false, sameArea = true, sameSeg = false → score 3
    const areaEspecial  = { id: 'area-esp', name: 'Esp', segmentIds: ['seg-medio'] }
    const subjAbsent    = { id: 'subj-x', name: 'X', areaId: 'area-esp' }
    const subjTeacher   = { id: 'subj-y', name: 'Y', areaId: 'area-esp' }
    const subjectsExt   = [...subjects, subjAbsent, subjTeacher]
    const areasExt      = [...areas, areaEspecial]

    const teachers = [makeTeacher({ id: 't1', subjectIds: ['subj-y'] })]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-x', teachers, [], [], subjectsExt, areasExt)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(3)
    expect(result[0].match).toBe('area')
    expect(result[0].sameSeg).toBe(false)
  })

  it('score 4: teacher em outra área', () => {
    // teacher tem subj-mat (area-exatas), absent é subj-bio (area-ciencias)
    const teachers = [makeTeacher({ id: 't1', subjectIds: ['subj-mat'] })]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], [], subjects, areas)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(4)
    expect(result[0].match).toBe('other')
    expect(result[0].sameSeg).toBe(false)
  })

  it('score 4: professor sem subjectIds recebe score 4', () => {
    const teachers = [makeTeacher({ id: 't1', subjectIds: [] })]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], [], subjects, areas)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(4)
  })
})

// ─── rankCandidates — edge cases ──────────────────────────────────────────────

describe('rankCandidates — edge cases', () => {
  it('subjectId null (turma compartilhada): todos os candidatos recebem score 4', () => {
    const teachers = [
      makeTeacher({ id: 't1', subjectIds: ['subj-bio'] }),
      makeTeacher({ id: 't2', subjectIds: ['subj-mat'] }),
      makeTeacher({ id: 't3', subjectIds: [] }),
    ]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, null, teachers, [], [], subjects, areas)
    expect(result).toHaveLength(3)
    result.forEach(r => {
      expect(r.score).toBe(4)
      expect(r.match).toBe('other')
    })
  })

  it('timeSlot undefined: slotSegmentId null → teacherInSegment false → sem score 0 ou 2', () => {
    // teacher tem subj-bio (mesma matéria) mas sem segmento → score 1 (sameSubj && !sameSeg)
    const teachers = [makeTeacher({ id: 't1', subjectIds: ['subj-bio'] })]
    const result = rankCandidates(ABSENT_ID, DATE_MON, undefined, 'subj-bio', teachers, [], [], subjects, areas)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(1)
    expect(result[0].sameSeg).toBe(false)
  })

  it('absences undefined: rankCandidates não lança exceção', () => {
    const teachers = [makeTeacher({ id: 't1', subjectIds: ['subj-bio'] })]
    expect(() =>
      rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], undefined, subjects, areas)
    ).not.toThrow()
  })

  it('subjects vazio: absentAreaId fica null → sameArea false para todos', () => {
    const teachers = [makeTeacher({ id: 't1', subjectIds: ['subj-bio'] })]
    // sameSubj = true (teacher tem subj-bio) mas areas vazio → sameSeg = false
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], [], [], [])
    expect(result).toHaveLength(1)
    // sameSubj=true, sameSeg=false → score 1
    expect(result[0].score).toBe(1)
  })

  it('retorna array vazio quando lista de professores está vazia', () => {
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', [], [], [], subjects, areas)
    expect(result).toEqual([])
  })

  it('resultado contém os campos esperados: teacher, load, match, sameSeg, score, atLimit', () => {
    const teachers = [makeTeacher({ id: 't1', subjectIds: ['subj-bio'] })]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], [], subjects, areas)
    expect(result[0]).toHaveProperty('teacher')
    expect(result[0]).toHaveProperty('load')
    expect(result[0]).toHaveProperty('match')
    expect(result[0]).toHaveProperty('sameSeg')
    expect(result[0]).toHaveProperty('score')
    expect(result[0]).toHaveProperty('atLimit')
  })
})

// ─── rankCandidates — tiebreak ────────────────────────────────────────────────

describe('rankCandidates — tiebreak', () => {
  it('mesmo score: candidato sem at_limit (ok) vem antes do at_limit', () => {
    // Usando DATE_FRI para que weekStart cubra toda a semana (seg–sex)
    // t1: teacher-coordinator com 10 aulas distribuídas em slots ≠ de TIME_SLOT_FUND (manha|2)
    // t2: teacher-coordinator sem nenhuma aula → atLimit=false
    // Ambos têm subj-mat (score 4 contra ausente em subj-bio)
    // date=DATE_FRI, TIME_SLOT_FUND é 'seg-fund|manha|2' — dia da sexta é Sexta
    const teachers = [
      makeTeacher({ id: 't1', profile: 'teacher-coordinator', subjectIds: ['subj-mat'] }),
      makeTeacher({ id: 't2', profile: 'teacher-coordinator', subjectIds: ['subj-mat'] }),
    ]
    // t1 tem 10 aulas mas nenhuma na Sexta/manha|2 (para não ser filtrado pelo isBusy)
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: 'seg-fund|manha|1', turma: '9A' },
      { teacherId: 't1', day: 'Segunda', timeSlot: 'seg-fund|manha|3', turma: '9A' },
      { teacherId: 't1', day: 'Terça',   timeSlot: 'seg-fund|manha|1', turma: '8B' },
      { teacherId: 't1', day: 'Terça',   timeSlot: 'seg-fund|manha|3', turma: '8B' },
      { teacherId: 't1', day: 'Quarta',  timeSlot: 'seg-fund|manha|1', turma: '7C' },
      { teacherId: 't1', day: 'Quarta',  timeSlot: 'seg-fund|manha|3', turma: '7C' },
      { teacherId: 't1', day: 'Quinta',  timeSlot: 'seg-fund|manha|1', turma: '6D' },
      { teacherId: 't1', day: 'Quinta',  timeSlot: 'seg-fund|manha|3', turma: '6D' },
      { teacherId: 't1', day: 'Sexta',   timeSlot: 'seg-fund|manha|1', turma: '5E' },
      { teacherId: 't1', day: 'Sexta',   timeSlot: 'seg-fund|manha|3', turma: '5E' },
    ]
    const result = rankCandidates(ABSENT_ID, DATE_FRI, TIME_SLOT_FUND, 'subj-bio', teachers, schedules, [], subjects, areas)
    expect(result).toHaveLength(2)
    expect(result[0].teacher.id).toBe('t2')
    expect(result[0].atLimit).toBe(false)
    expect(result[1].teacher.id).toBe('t1')
    expect(result[1].atLimit).toBe(true)
  })

  it('mesmo score e mesmo at_limit: menor carga mensal vem primeiro', () => {
    const teachers = [
      makeTeacher({ id: 't1', subjectIds: ['subj-mat'] }),
      makeTeacher({ id: 't2', subjectIds: ['subj-mat'] }),
    ]
    // t1 tem 2 substituições em datas anteriores → carga maior
    const absences = [
      {
        id: 'abs1',
        teacherId: 'outra-pessoa',
        slots: [
          { date: '2026-04-06', timeSlot: 'seg-fund|manha|1', turma: '9A', substituteId: 't1' },
          { date: '2026-04-07', timeSlot: 'seg-fund|manha|1', turma: '8A', substituteId: 't1' },
        ],
      },
    ]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], absences, subjects, areas)
    expect(result).toHaveLength(2)
    // t2 tem carga 0; t1 tem carga 2
    expect(result[0].teacher.id).toBe('t2')
    expect(result[0].load).toBeLessThan(result[1].load)
  })
})

// ─── rankCandidates — cenário realista ────────────────────────────────────────

describe('rankCandidates — cenário realista', () => {
  it('10 professores: filtragem e ordenação por score e carga', () => {
    const teachers = [
      // score 0: mesma matéria (subj-bio), mesmo segmento (seg-fund)
      makeTeacher({ id: 't-bio-1', subjectIds: ['subj-bio'] }),
      makeTeacher({ id: 't-bio-2', subjectIds: ['subj-bio'] }),
      // score 2: mesma área (area-ciencias/seg-fund), mas outra matéria (subj-quim)
      makeTeacher({ id: 't-quim-1', subjectIds: ['subj-quim'] }),
      makeTeacher({ id: 't-quim-2', subjectIds: ['subj-quim'] }),
      // score 4: outra área (area-exatas)
      makeTeacher({ id: 't-mat-1',  subjectIds: ['subj-mat'] }),
      makeTeacher({ id: 't-mat-2',  subjectIds: ['subj-mat'] }),
      // ocupados no slot — devem ser excluídos
      makeTeacher({ id: 't-busy-1', subjectIds: ['subj-bio'] }),
      makeTeacher({ id: 't-busy-2', subjectIds: ['subj-quim'] }),
      // coordenador — deve ser excluído
      makeTeacher({ id: 't-coord',  profile: 'coordinator', subjectIds: ['subj-bio'] }),
      // professor ausente — deve ser excluído
      makeTeacher({ id: ABSENT_ID,  subjectIds: ['subj-bio'] }),
    ]

    const schedules = [
      { teacherId: 't-busy-1', day: 'Segunda', timeSlot: TIME_SLOT_FUND },
      { teacherId: 't-busy-2', day: 'Segunda', timeSlot: TIME_SLOT_FUND },
    ]

    // t-bio-2 tem 1 substituição extra → carga maior que t-bio-1
    const absences = [
      {
        id: 'abs-extra',
        teacherId: 'qualquer',
        slots: [
          { date: '2026-04-06', timeSlot: 'seg-fund|manha|1', turma: '9A', substituteId: 't-bio-2' },
        ],
      },
    ]

    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, schedules, absences, subjects, areas)

    // 6 candidatos restantes: t-bio-1, t-bio-2, t-quim-1, t-quim-2, t-mat-1, t-mat-2
    expect(result).toHaveLength(6)

    // Primeiros dois têm score 0
    expect(result[0].score).toBe(0)
    expect(result[1].score).toBe(0)
    // t-bio-1 antes de t-bio-2 (t-bio-2 tem carga extra)
    expect(result[0].teacher.id).toBe('t-bio-1')
    expect(result[1].teacher.id).toBe('t-bio-2')

    // Próximos dois têm score 2
    expect(result[2].score).toBe(2)
    expect(result[3].score).toBe(2)

    // Últimos dois têm score 4
    expect(result[4].score).toBe(4)
    expect(result[5].score).toBe(4)
  })
})

// ─── substitutesAtSlot ────────────────────────────────────────────────────────

describe('substitutesAtSlot', () => {
  it('retorna Set vazio quando absences é vazio', () => {
    const result = substitutesAtSlot(DATE_MON, TIME_SLOT_FUND, [])
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })

  it('retorna Set vazio quando absences é undefined', () => {
    const result = substitutesAtSlot(DATE_MON, TIME_SLOT_FUND, undefined)
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })

  it('retorna Set com substituteId do slot que bate date+timeSlot', () => {
    const absences = [
      {
        id: 'abs1',
        teacherId: 'prof-ausente',
        slots: [
          { id: 'sl-1', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 'sub-b' },
        ],
      },
    ]
    const result = substitutesAtSlot(DATE_MON, TIME_SLOT_FUND, absences)
    expect(result.has('sub-b')).toBe(true)
    expect(result.size).toBe(1)
  })

  it('não inclui slots com date ou timeSlot diferentes', () => {
    const absences = [
      {
        id: 'abs1',
        teacherId: 'prof-ausente',
        slots: [
          { id: 'sl-1', date: DATE_TUE, timeSlot: TIME_SLOT_FUND, substituteId: 'sub-b' },
          { id: 'sl-2', date: DATE_MON, timeSlot: TIME_SLOT_MEDIO, substituteId: 'sub-c' },
        ],
      },
    ]
    const result = substitutesAtSlot(DATE_MON, TIME_SLOT_FUND, absences)
    expect(result.size).toBe(0)
  })

  it('não inclui slots com substituteId null', () => {
    const absences = [
      {
        id: 'abs1',
        teacherId: 'prof-ausente',
        slots: [
          { id: 'sl-1', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: null },
        ],
      },
    ]
    const result = substitutesAtSlot(DATE_MON, TIME_SLOT_FUND, absences)
    expect(result.size).toBe(0)
  })

  it('absorve duplicatas quando mesmo professor está em dois slots do mesmo date+timeSlot', () => {
    const absences = [
      {
        id: 'abs1',
        teacherId: 'prof-a',
        slots: [{ id: 'sl-1', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 'sub-b' }],
      },
      {
        id: 'abs2',
        teacherId: 'prof-c',
        slots: [{ id: 'sl-2', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 'sub-b' }],
      },
    ]
    const result = substitutesAtSlot(DATE_MON, TIME_SLOT_FUND, absences)
    expect(result.size).toBe(1)
    expect(result.has('sub-b')).toBe(true)
  })

  it('retorna múltiplos substituteIds quando há vários professores no mesmo date+timeSlot', () => {
    const absences = [
      {
        id: 'abs1',
        teacherId: 'prof-a',
        slots: [{ id: 'sl-1', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 'sub-b' }],
      },
      {
        id: 'abs2',
        teacherId: 'prof-c',
        slots: [{ id: 'sl-2', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 'sub-d' }],
      },
    ]
    const result = substitutesAtSlot(DATE_MON, TIME_SLOT_FUND, absences)
    expect(result.size).toBe(2)
    expect(result.has('sub-b')).toBe(true)
    expect(result.has('sub-d')).toBe(true)
  })

  it('excludeSlotId ignora o slot especificado ao montar o conjunto', () => {
    const absences = [
      {
        id: 'abs1',
        teacherId: 'prof-a',
        slots: [{ id: 'sl-abc', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 'sub-b' }],
      },
    ]
    const result = substitutesAtSlot(DATE_MON, TIME_SLOT_FUND, absences, 'sl-abc')
    expect(result.size).toBe(0)
  })

  it('excludeSlotId não encontrado: resultado idêntico ao sem exclusão', () => {
    const absences = [
      {
        id: 'abs1',
        teacherId: 'prof-a',
        slots: [{ id: 'sl-1', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 'sub-b' }],
      },
    ]
    const withExclusion    = substitutesAtSlot(DATE_MON, TIME_SLOT_FUND, absences, 'id-inexistente')
    const withoutExclusion = substitutesAtSlot(DATE_MON, TIME_SLOT_FUND, absences)
    expect(withExclusion.size).toBe(withoutExclusion.size)
    expect(withExclusion.has('sub-b')).toBe(true)
  })
})

// ─── rankCandidates — filtro substitutesAtSlot ────────────────────────────────

describe('rankCandidates — filtro substitutesAtSlot', () => {
  it('exclui professor já alocado como substituto no mesmo date+timeSlot', () => {
    const teachers = [
      makeTeacher({ id: 't1', subjectIds: ['subj-bio'] }),
      makeTeacher({ id: 't2', subjectIds: ['subj-bio'] }),
    ]
    // t1 já é substituto de outra ausência no mesmo DATE_MON + TIME_SLOT_FUND
    const absences = [
      {
        id: 'abs-outra',
        teacherId: 'outro-ausente',
        slots: [{ id: 'sl-outro', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 't1' }],
      },
    ]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], absences, subjects, areas)
    const ids = result.map(r => r.teacher.id)
    expect(ids).not.toContain('t1')
    expect(ids).toContain('t2')
  })

  it('com excludeSlotId, o professor do slot excluído volta como candidato', () => {
    const teachers = [
      makeTeacher({ id: 't1', subjectIds: ['subj-bio'] }),
      makeTeacher({ id: 't2', subjectIds: ['subj-bio'] }),
    ]
    // slot sl-abc tem t1 como substituto — mas estamos reatribuindo esse slot
    const absences = [
      {
        id: 'abs-outra',
        teacherId: 'outro-ausente',
        slots: [{ id: 'sl-abc', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 't1' }],
      },
    ]
    // sem excludeSlotId: t1 não aparece
    const resultSem = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], absences, subjects, areas)
    expect(resultSem.map(r => r.teacher.id)).not.toContain('t1')

    // com excludeSlotId = 'sl-abc': t1 volta a aparecer
    const resultCom = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], absences, subjects, areas, {}, [], 'sl-abc')
    expect(resultCom.map(r => r.teacher.id)).toContain('t1')
  })

  it('chamadas sem o 12º argumento continuam funcionando (parâmetro opcional)', () => {
    const teachers = [makeTeacher({ id: 't1', subjectIds: ['subj-bio'] })]
    expect(() =>
      rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], [], subjects, areas)
    ).not.toThrow()
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, [], [], subjects, areas)
    expect(result).toHaveLength(1)
  })

  it('isBusy ainda é aplicado antes do filtro de alocação (ordem de precedência)', () => {
    // t1: tem aula agendada (isBusy=true) E está alocado em outro slot
    // t2: está alocado mas não tem aula → filtrado pelo substitutesAtSlot
    // t3: livre → aparece
    const teachers = [
      makeTeacher({ id: 't1', subjectIds: ['subj-bio'] }),
      makeTeacher({ id: 't2', subjectIds: ['subj-bio'] }),
      makeTeacher({ id: 't3', subjectIds: ['subj-bio'] }),
    ]
    const schedules = [
      { teacherId: 't1', day: 'Segunda', timeSlot: TIME_SLOT_FUND },
    ]
    const absences = [
      {
        id: 'abs-outra',
        teacherId: 'outro-ausente',
        slots: [
          { id: 'sl-1', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 't1' },
          { id: 'sl-2', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 't2' },
        ],
      },
    ]
    const result = rankCandidates(ABSENT_ID, DATE_MON, TIME_SLOT_FUND, 'subj-bio', teachers, schedules, absences, subjects, areas)
    const ids = result.map(r => r.teacher.id)
    expect(ids).not.toContain('t1')
    expect(ids).not.toContain('t2')
    expect(ids).toContain('t3')
  })
})

// ─── suggestSubstitutes — filtro substitutesAtSlot ───────────────────────────

// Importar suggestSubstitutes diretamente
import { suggestSubstitutes } from '../lib/absences/index.js'

describe('suggestSubstitutes — filtro substitutesAtSlot', () => {
  const makeStore = (teachers, absences = []) => ({
    teachers,
    schedules: [],
    absences,
    subjects,
    areas,
    periodConfigs: {},
    sharedSeries: [],
  })

  it('modo qualitative: exclui professor já alocado no mesmo date+timeSlot', () => {
    const teachers = [
      makeTeacher({ id: 't1', subjectIds: ['subj-bio'], status: 'approved' }),
      makeTeacher({ id: 't2', subjectIds: ['subj-bio'], status: 'approved' }),
      makeTeacher({ id: 't3', subjectIds: ['subj-bio'], status: 'approved' }),
    ]
    // t1 já alocado em outro slot no mesmo date+timeSlot
    const absences = [
      {
        id: 'abs-outra',
        teacherId: 'outro-ausente',
        slots: [{ id: 'sl-outra', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 't1' }],
      },
    ]
    const absenceSlot = {
      absentTeacherId: ABSENT_ID,
      date: DATE_MON,
      slot: TIME_SLOT_FUND,
      subjectId: 'subj-bio',
    }
    const result = suggestSubstitutes(absenceSlot, 'qualitative', makeStore(teachers, absences))
    const ids = result.map(r => r.teacher.id)
    expect(ids).not.toContain('t1')
  })

  it('modo quantitative: exclui professor já alocado no mesmo date+timeSlot', () => {
    const teachers = [
      makeTeacher({ id: 't1', subjectIds: ['subj-bio'], status: 'approved' }),
      makeTeacher({ id: 't2', subjectIds: ['subj-bio'], status: 'approved' }),
      makeTeacher({ id: 't3', subjectIds: ['subj-bio'], status: 'approved' }),
    ]
    const absences = [
      {
        id: 'abs-outra',
        teacherId: 'outro-ausente',
        slots: [{ id: 'sl-outra', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 't1' }],
      },
    ]
    const absenceSlot = {
      absentTeacherId: ABSENT_ID,
      date: DATE_MON,
      slot: TIME_SLOT_FUND,
      subjectId: 'subj-bio',
    }
    const result = suggestSubstitutes(absenceSlot, 'quantitative', makeStore(teachers, absences))
    const ids = result.map(r => r.teacher.id)
    expect(ids).not.toContain('t1')
  })

  it('com excludeSlotId, o professor do slot excluído volta como candidato em qualitative', () => {
    // O modo qualitative requer que o professor ausente esteja na store
    const absentTeacher = makeTeacher({ id: ABSENT_ID, subjectIds: ['subj-bio'], status: 'approved' })
    const teachers = [
      absentTeacher,
      makeTeacher({ id: 't1', subjectIds: ['subj-bio'], status: 'approved' }),
      makeTeacher({ id: 't2', subjectIds: ['subj-bio'], status: 'approved' }),
    ]
    const absences = [
      {
        id: 'abs-outra',
        teacherId: 'outro-ausente',
        slots: [{ id: 'sl-abc', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 't1' }],
      },
    ]
    // sem excludeSlotId: t1 não aparece
    const absenceSlotSem = {
      absentTeacherId: ABSENT_ID,
      date: DATE_MON,
      slot: TIME_SLOT_FUND,
      subjectId: 'subj-bio',
    }
    const resultSem = suggestSubstitutes(absenceSlotSem, 'qualitative', makeStore(teachers, absences))
    expect(resultSem.map(r => r.teacher.id)).not.toContain('t1')

    // com excludeSlotId: t1 volta
    const absenceSlotCom = { ...absenceSlotSem, excludeSlotId: 'sl-abc' }
    const resultCom = suggestSubstitutes(absenceSlotCom, 'qualitative', makeStore(teachers, absences))
    expect(resultCom.map(r => r.teacher.id)).toContain('t1')
  })

  it('com excludeSlotId, o professor do slot excluído volta como candidato em quantitative', () => {
    const teachers = [
      makeTeacher({ id: 't1', subjectIds: ['subj-bio'], status: 'approved' }),
      makeTeacher({ id: 't2', subjectIds: ['subj-bio'], status: 'approved' }),
    ]
    const absences = [
      {
        id: 'abs-outra',
        teacherId: 'outro-ausente',
        slots: [{ id: 'sl-abc', date: DATE_MON, timeSlot: TIME_SLOT_FUND, substituteId: 't1' }],
      },
    ]
    const absenceSlotCom = {
      absentTeacherId: ABSENT_ID,
      date: DATE_MON,
      slot: TIME_SLOT_FUND,
      subjectId: 'subj-bio',
      excludeSlotId: 'sl-abc',
    }
    const result = suggestSubstitutes(absenceSlotCom, 'quantitative', makeStore(teachers, absences))
    expect(result.map(r => r.teacher.id)).toContain('t1')
  })

  it('chamadas sem excludeSlotId continuam funcionando (parâmetro opcional)', () => {
    const teachers = [makeTeacher({ id: 't1', subjectIds: ['subj-bio'], status: 'approved' })]
    const absenceSlot = {
      absentTeacherId: ABSENT_ID,
      date: DATE_MON,
      slot: TIME_SLOT_FUND,
      subjectId: 'subj-bio',
    }
    expect(() => suggestSubstitutes(absenceSlot, 'qualitative', makeStore(teachers))).not.toThrow()
    expect(() => suggestSubstitutes(absenceSlot, 'quantitative', makeStore(teachers))).not.toThrow()
  })
})
