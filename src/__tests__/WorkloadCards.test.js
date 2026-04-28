import { describe, it, expect } from 'vitest'
import { getTeacherStats } from '../components/ui/WorkloadCards.jsx'
import { AulasAtribuidasCard } from '../components/ui/WorkloadCards.jsx'

// ─── Fixtures compartilhadas ──────────────────────────────────────────────────

const SHARED_FORMATION = { id: 'ss-formacao', name: 'FORMAÇÃO', type: 'formation' }
const SHARED_RECESSO   = { id: 'ss-recesso',  name: 'RECESSO',  type: 'rest'      }
const SHARED_ELETIVA   = { id: 'ss-eletiva',  name: 'ELETIVA',  type: 'elective'  }

const SHARED_SERIES_COMPLETA = [SHARED_FORMATION, SHARED_RECESSO, SHARED_ELETIVA]

// today fixo dentro do mês 2026-04, fromDate → '2026-04-01'
const TODAY = '2026-04-28'

// ─── Helpers de construção de fixture ────────────────────────────────────────

const makeAbsence = (teacherId, slots) => ({ id: `abs-${Math.random()}`, teacherId, slots })

const makeSlot = (date, turma, substituteId = null) => ({
  date,
  timeSlot: 'seg-fund|manha|1',
  turma,
  substituteId,
})

// ─── getTeacherStats — faltas ─────────────────────────────────────────────────

describe('getTeacherStats — faltas', () => {
  it('retorna zero faltas quando absences é array vazio', () => {
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], [], [])
    expect(faltas).toBe(0)
  })

  it('retorna zero faltas quando absences é null', () => {
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], null, [])
    expect(faltas).toBe(0)
  })

  it('retorna zero faltas quando absences é undefined', () => {
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], undefined, [])
    expect(faltas).toBe(0)
  })

  it('conta falta de turma regular no período', () => {
    const absences = [
      makeAbsence('t1', [makeSlot('2026-04-10', '9A')]),
    ]
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(faltas).toBe(1)
  })

  it('NÃO conta falta de slot de formação (issue 469 — bug corrigido)', () => {
    const absences = [
      makeAbsence('t1', [makeSlot('2026-04-10', 'FORMAÇÃO')]),
    ]
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], absences, SHARED_SERIES_COMPLETA)
    expect(faltas).toBe(0)
  })

  it('exclui apenas o slot de formação; os demais slots da mesma ausência são contados', () => {
    const absences = [
      makeAbsence('t1', [
        makeSlot('2026-04-10', 'FORMAÇÃO'),
        makeSlot('2026-04-11', '9A'),
        makeSlot('2026-04-14', '8B'),
      ]),
    ]
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], absences, SHARED_SERIES_COMPLETA)
    expect(faltas).toBe(2)
  })

  it('NÃO conta falta anterior ao início do período (antes de fromDate)', () => {
    const absences = [
      // 2026-03-31 está antes de '2026-04-01' (fromDate para period='month')
      makeAbsence('t1', [makeSlot('2026-03-31', '9A')]),
    ]
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(faltas).toBe(0)
  })

  it('NÃO conta falta posterior a today', () => {
    const absences = [
      makeAbsence('t1', [makeSlot('2026-04-29', '9A')]),
    ]
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(faltas).toBe(0)
  })

  it('conta falta exatamente em today (borda superior inclusiva)', () => {
    const absences = [
      makeAbsence('t1', [makeSlot(TODAY, '9A')]),
    ]
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(faltas).toBe(1)
  })

  it('conta falta exatamente em fromDate (borda inferior inclusiva)', () => {
    // fromDate = '2026-04-01' para today='2026-04-28' e period='month'
    const absences = [
      makeAbsence('t1', [makeSlot('2026-04-01', '9A')]),
    ]
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(faltas).toBe(1)
  })

  it('não conta faltas de outro professor', () => {
    const absences = [
      makeAbsence('outro', [makeSlot('2026-04-10', '9A')]),
    ]
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(faltas).toBe(0)
  })

  it('acumula faltas de múltiplas ausências do mesmo professor no período', () => {
    const absences = [
      makeAbsence('t1', [makeSlot('2026-04-07', '9A'), makeSlot('2026-04-08', '8B')]),
      makeAbsence('t1', [makeSlot('2026-04-14', '7C')]),
    ]
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(faltas).toBe(3)
  })

  it('absence com campo slots undefined: ?? [] em getTeacherStats protege faltas e subs; monthlyLoad lança (bug preexistente documentado)', () => {
    // Bug preexistente em monthlyLoad (src/lib/absences/validation.js):
    // o subsLoad usa ab.slots.filter() sem proteção para TODOS os registros,
    // independente do teacherId. Isso lança TypeError quando slots é undefined.
    // Este comportamento está fora do escopo das issues 469/470.
    // O teste documenta que getTeacherStats lança nesse cenário limite.
    const absences = [{ id: 'abs-sem-slots', teacherId: 't1', slots: undefined }]
    expect(() => getTeacherStats('t1', TODAY, [], absences, [])).toThrow(TypeError)
  })

  it('com period="year" usa fromDate = início do ano corrente', () => {
    // today = '2026-04-28', period='year' → fromDate = '2026-01-01'
    // Slot em março deve ser contado; slot em dezembro do ano anterior não
    const absences = [
      makeAbsence('t1', [
        makeSlot('2026-03-15', '9A'), // dentro do ano → conta
        makeSlot('2025-12-01', '8B'), // ano anterior → não conta
      ]),
    ]
    const { absences: faltas } = getTeacherStats('t1', TODAY, [], absences, [], 'year')
    expect(faltas).toBe(1)
  })
})

// ─── getTeacherStats — subs ───────────────────────────────────────────────────

describe('getTeacherStats — subs', () => {
  it('retorna zero subs quando absences é vazio', () => {
    const { subsGiven: subs } = getTeacherStats('t1', TODAY, [], [], [])
    expect(subs).toBe(0)
  })

  it('conta sub dentro do período quando substituteId bate com teacherId', () => {
    const absences = [
      makeAbsence('outro', [{ ...makeSlot('2026-04-10', '9A'), substituteId: 't1' }]),
    ]
    const { subsGiven: subs } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(subs).toBe(1)
  })

  it('NÃO conta sub anterior ao início do período (issue 469 — bug corrigido)', () => {
    const absences = [
      makeAbsence('outro', [{ ...makeSlot('2026-03-31', '9A'), substituteId: 't1' }]),
    ]
    const { subsGiven: subs } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(subs).toBe(0)
  })

  it('NÃO conta sub posterior a today', () => {
    const absences = [
      makeAbsence('outro', [{ ...makeSlot('2026-04-29', '9A'), substituteId: 't1' }]),
    ]
    const { subsGiven: subs } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(subs).toBe(0)
  })

  it('conta sub exatamente em today (borda superior inclusiva)', () => {
    const absences = [
      makeAbsence('outro', [{ ...makeSlot(TODAY, '9A'), substituteId: 't1' }]),
    ]
    const { subsGiven: subs } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(subs).toBe(1)
  })

  it('conta sub exatamente em fromDate (borda inferior inclusiva)', () => {
    const absences = [
      makeAbsence('outro', [{ ...makeSlot('2026-04-01', '9A'), substituteId: 't1' }]),
    ]
    const { subsGiven: subs } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(subs).toBe(1)
  })

  it('não conta sub de outro professor como sub do professor alvo', () => {
    const absences = [
      makeAbsence('outro', [{ ...makeSlot('2026-04-10', '9A'), substituteId: 'outro-sub' }]),
    ]
    const { subsGiven: subs } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(subs).toBe(0)
  })

  it('acumula subs de múltiplos registros de ausência no período', () => {
    const absences = [
      makeAbsence('prof-a', [{ ...makeSlot('2026-04-07', '8A'), substituteId: 't1' }]),
      makeAbsence('prof-b', [
        { ...makeSlot('2026-04-14', '7B'), substituteId: 't1' },
        { ...makeSlot('2026-04-21', '6C'), substituteId: 't1' },
      ]),
    ]
    const { subsGiven: subs } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(subs).toBe(3)
  })

  it('sub de slot sem substituteId (null) não é contada', () => {
    const absences = [
      makeAbsence('outro', [makeSlot('2026-04-10', '9A', null)]),
    ]
    const { subsGiven: subs } = getTeacherStats('t1', TODAY, [], absences, [])
    expect(subs).toBe(0)
  })
})

// ─── getTeacherStats — retorno completo ──────────────────────────────────────

describe('getTeacherStats — retorno completo', () => {
  it('retorna objeto com aulasDadas, absences e subsGiven', () => {
    const result = getTeacherStats('t1', TODAY, [], [], [])
    expect(result).toHaveProperty('aulasDadas')
    expect(result).toHaveProperty('absences')
    expect(result).toHaveProperty('subsGiven')
  })

  it('combina corretamente: falta de formação excluída, falta regular e sub dentro do período', () => {
    const absences = [
      makeAbsence('t1', [
        makeSlot('2026-04-10', 'FORMAÇÃO'),   // formação → não conta como falta
        makeSlot('2026-04-11', '9A'),          // regular → conta como falta
        makeSlot('2026-03-31', '8B'),          // fora do período → não conta
      ]),
      makeAbsence('prof-b', [
        { ...makeSlot('2026-04-14', '7C'), substituteId: 't1' }, // sub dentro → conta
        { ...makeSlot('2026-03-01', '6D'), substituteId: 't1' }, // sub fora → não conta
      ]),
    ]
    const result = getTeacherStats('t1', TODAY, [], absences, SHARED_SERIES_COMPLETA)
    expect(result.absences).toBe(1)
    expect(result.subsGiven).toBe(1)
  })
})

// ─── AulasAtribuidasCard — contagem de atribuídas ─────────────────────────────

describe('AulasAtribuidasCard — contagem de atribuídas', () => {
  // Chama o componente como função pura para inspecionar os dados computados
  // (rows) sem precisar de DOM ou router. O componente retorna um elemento JSX
  // cujos descendentes carregam os valores; usamos a representação do JSX tree.

  const makeTeacher = (id, name = `Prof ${id}`) => ({
    id,
    name,
    profile: 'teacher',
  })

  const makeScheduleSlot = (teacherId, turma) => ({
    teacherId,
    turma,
    day: 'Segunda',
    timeSlot: 'seg-fund|manha|1',
  })

  // Extrai os counts de cada linha do JSX retornado pelo componente.
  // Estrutura real (inspecionada via --reporter=verbose):
  //   div.card > [div.header, div.scroll > table > [thead, tbody]]
  //   tbody.children = array de tr[key=teacherId]
  //   tr.children = [td.nome, td.count]
  //   td.nome.children = div{className:"font-semibold text-xs", children: "Nome"}
  //   td.count.children = número
  function extrairCounts(element) {
    const divScroll = element?.props?.children?.[1]
    const table     = divScroll?.props?.children
    const children  = table?.props?.children
    const tbody     = Array.isArray(children) ? children[1] : null
    if (!tbody) return {}

    const linhas    = tbody.props?.children
    const linhasArr = Array.isArray(linhas) ? linhas : [linhas]

    const counts = {}
    for (const tr of linhasArr) {
      if (!tr || !tr.props) continue
      const tds = tr.props.children
      if (!Array.isArray(tds) || tds.length < 2) continue
      // td[0].children é um único div JSX cujo .props.children é o nome
      const nome  = tds[0]?.props?.children?.props?.children
      const count = tds[1]?.props?.children
      if (typeof nome === 'string') {
        counts[nome] = count
      }
    }
    return counts
  }

  it('NÃO conta schedules de turma FORMAÇÃO (issue 470 — bug corrigido)', () => {
    const teachers   = [makeTeacher('t1', 'Ana')]
    const schedules  = [
      makeScheduleSlot('t1', 'FORMAÇÃO'),
      makeScheduleSlot('t1', 'FORMAÇÃO'),
    ]
    const el     = AulasAtribuidasCard({ teachers, schedules, sharedSeries: SHARED_SERIES_COMPLETA })
    const counts = extrairCounts(el)
    expect(counts['Ana']).toBe(0)
  })

  it('NÃO conta schedules de turma RECESSO (type rest)', () => {
    const teachers  = [makeTeacher('t1', 'Bruno')]
    const schedules = [
      makeScheduleSlot('t1', 'RECESSO'),
      makeScheduleSlot('t1', 'RECESSO'),
    ]
    const el     = AulasAtribuidasCard({ teachers, schedules, sharedSeries: SHARED_SERIES_COMPLETA })
    const counts = extrairCounts(el)
    expect(counts['Bruno']).toBe(0)
  })

  it('CONTA schedules de turma regular (ex: 9A)', () => {
    const teachers  = [makeTeacher('t1', 'Carla')]
    const schedules = [
      makeScheduleSlot('t1', '9A'),
      makeScheduleSlot('t1', '8B'),
    ]
    const el     = AulasAtribuidasCard({ teachers, schedules, sharedSeries: SHARED_SERIES_COMPLETA })
    const counts = extrairCounts(el)
    expect(counts['Carla']).toBe(2)
  })

  it('CONTA schedules de turma eletiva (type elective)', () => {
    const teachers  = [makeTeacher('t1', 'Diego')]
    const schedules = [
      makeScheduleSlot('t1', 'ELETIVA'),
      makeScheduleSlot('t1', 'ELETIVA'),
    ]
    const el     = AulasAtribuidasCard({ teachers, schedules, sharedSeries: SHARED_SERIES_COMPLETA })
    const counts = extrairCounts(el)
    expect(counts['Diego']).toBe(2)
  })

  it('mistura correta: regular + eletiva contam; formação + recesso não contam', () => {
    const teachers  = [makeTeacher('t1', 'Elena')]
    const schedules = [
      makeScheduleSlot('t1', '9A'),      // regular → conta
      makeScheduleSlot('t1', 'ELETIVA'), // eletiva → conta
      makeScheduleSlot('t1', 'FORMAÇÃO'),// formação → não conta
      makeScheduleSlot('t1', 'RECESSO'), // recesso → não conta
    ]
    const el     = AulasAtribuidasCard({ teachers, schedules, sharedSeries: SHARED_SERIES_COMPLETA })
    const counts = extrairCounts(el)
    expect(counts['Elena']).toBe(2)
  })

  it('sem sharedSeries (default []): todos os schedules são contados inclusive FORMAÇÃO', () => {
    // Comportamento defensivo: sem sharedSeries, isFormationSlot e isRestSlot
    // retornam false → nenhum slot é excluído
    const teachers  = [makeTeacher('t1', 'Fábio')]
    const schedules = [
      makeScheduleSlot('t1', 'FORMAÇÃO'),
      makeScheduleSlot('t1', '9A'),
    ]
    // Omite sharedSeries → usa default []
    const el     = AulasAtribuidasCard({ teachers, schedules })
    const counts = extrairCounts(el)
    expect(counts['Fábio']).toBe(2)
  })

  it('coordenadores (profile coordinator) são excluídos do card', () => {
    const teachers = [
      { id: 'coord', name: 'Coord', profile: 'coordinator' },
      makeTeacher('t1', 'Gabi'),
    ]
    const schedules = [
      makeScheduleSlot('coord', '9A'),
      makeScheduleSlot('t1', '8A'),
    ]
    const el     = AulasAtribuidasCard({ teachers, schedules, sharedSeries: SHARED_SERIES_COMPLETA })
    const counts = extrairCounts(el)
    expect(counts['Coord']).toBeUndefined()
    expect(counts['Gabi']).toBe(1)
  })

  it('professor sem nenhum schedule tem count 0', () => {
    const teachers  = [makeTeacher('t1', 'Hugo')]
    const schedules = []
    const el     = AulasAtribuidasCard({ teachers, schedules, sharedSeries: SHARED_SERIES_COMPLETA })
    const counts = extrairCounts(el)
    expect(counts['Hugo']).toBe(0)
  })

  it('schedules de outro professor não inflam o count do professor alvo', () => {
    const teachers = [makeTeacher('t1', 'Íris'), makeTeacher('t2', 'João')]
    const schedules = [
      makeScheduleSlot('t2', '9A'),
      makeScheduleSlot('t2', '8B'),
      makeScheduleSlot('t2', '7C'),
    ]
    const el     = AulasAtribuidasCard({ teachers, schedules, sharedSeries: SHARED_SERIES_COMPLETA })
    const counts = extrairCounts(el)
    expect(counts['Íris']).toBe(0)
    expect(counts['João']).toBe(3)
  })

  it('teachers null/undefined não lança exceção', () => {
    expect(() => AulasAtribuidasCard({ teachers: null,      schedules: [], sharedSeries: [] })).not.toThrow()
    expect(() => AulasAtribuidasCard({ teachers: undefined, schedules: [], sharedSeries: [] })).not.toThrow()
  })

  it('schedules null/undefined não lança exceção e resulta em count 0', () => {
    const teachers = [makeTeacher('t1', 'Léa')]
    expect(() => AulasAtribuidasCard({ teachers, schedules: null,      sharedSeries: SHARED_SERIES_COMPLETA })).not.toThrow()
    expect(() => AulasAtribuidasCard({ teachers, schedules: undefined, sharedSeries: SHARED_SERIES_COMPLETA })).not.toThrow()
    const el     = AulasAtribuidasCard({ teachers, schedules: null, sharedSeries: SHARED_SERIES_COMPLETA })
    const counts = extrairCounts(el)
    expect(counts['Léa']).toBe(0)
  })
})
