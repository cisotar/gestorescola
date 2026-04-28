import { describe, it, expect } from 'vitest'
import {
  allTurmaObjects,
  isSharedSeries,
  isFormationSlot,
  isRestSlot,
} from '../lib/helpers/turmas.js'

// ─── Fixtures compartilhadas ──────────────────────────────────────────────────

const sharedFormacao = { id: 'ss-form', name: 'FORMAÇÃO',    type: 'formation' }
const sharedEletiva  = { id: 'ss-elet', name: 'Eletiva 2024', type: 'elective'  }
const sharedAlmoco   = { id: 'ss-almo', name: 'ALMOÇO',       type: 'rest'      }

const SHARED_SERIES_COMPLETO = [sharedFormacao, sharedEletiva, sharedAlmoco]

// Hierarquia: segments → grades → classes
const SEG_FUND = {
  id: 'seg-fund',
  name: 'Ensino Fundamental',
  grades: [
    {
      name: '6º Ano',
      classes: [
        { letter: 'A', turno: 'manha' },
        { letter: 'B', turno: 'tarde'  },
      ],
    },
    {
      name: '7º Ano',
      classes: [
        { letter: 'A', turno: 'manha' },
      ],
    },
  ],
}

const SEG_MEDIO = {
  id: 'seg-medio',
  name: 'Ensino Médio',
  grades: [
    {
      name: '1ª Série',
      classes: [
        { letter: 'A', turno: 'tarde' },
      ],
    },
  ],
}

// ─── allTurmaObjects ──────────────────────────────────────────────────────────

describe('allTurmaObjects', () => {
  it('retorna lista plana com todos os objetos da hierarquia', () => {
    const result = allTurmaObjects([SEG_FUND, SEG_MEDIO])
    // 6A, 6B, 7A (fund) + 1A (medio) = 4 turmas
    expect(result).toHaveLength(4)
  })

  it('cada objeto tem os campos label, segmentId, segmentName, gradeName, letter, turno', () => {
    const result = allTurmaObjects([SEG_FUND])
    result.forEach(t => {
      expect(t).toHaveProperty('label')
      expect(t).toHaveProperty('segmentId')
      expect(t).toHaveProperty('segmentName')
      expect(t).toHaveProperty('gradeName')
      expect(t).toHaveProperty('letter')
      expect(t).toHaveProperty('turno')
    })
  })

  it('label é "${grade.name} ${cls.letter}"', () => {
    const result = allTurmaObjects([SEG_FUND])
    const turma6A = result.find(t => t.letter === 'A' && t.gradeName === '6º Ano')
    expect(turma6A.label).toBe('6º Ano A')
  })

  it('segmentId e segmentName refletem o segmento pai', () => {
    const result = allTurmaObjects([SEG_FUND, SEG_MEDIO])
    const turmaMedio = result.find(t => t.gradeName === '1ª Série')
    expect(turmaMedio.segmentId).toBe('seg-medio')
    expect(turmaMedio.segmentName).toBe('Ensino Médio')
  })

  it('turno é preservado quando cls.turno está definido', () => {
    const result = allTurmaObjects([SEG_FUND])
    const turma6B = result.find(t => t.letter === 'B' && t.gradeName === '6º Ano')
    expect(turma6B.turno).toBe('tarde')
  })

  it('turno padrão "manha" quando cls.turno está undefined', () => {
    const segSemTurno = {
      id: 'seg-x',
      name: 'Segmento X',
      grades: [
        {
          name: '8º Ano',
          classes: [{ letter: 'C' }],   // turno ausente
        },
      ],
    }
    const result = allTurmaObjects([segSemTurno])
    expect(result).toHaveLength(1)
    expect(result[0].turno).toBe('manha')
  })

  it('retorna [] para segments vazio', () => {
    expect(allTurmaObjects([])).toEqual([])
  })

  it('retorna [] quando grade tem classes vazio ([])', () => {
    const segSemClasses = {
      id: 'seg-y',
      name: 'Segmento Y',
      grades: [{ name: '9º Ano', classes: [] }],
    }
    expect(allTurmaObjects([segSemClasses])).toEqual([])
  })

  it('retorna [] quando grade não tem classes (undefined)', () => {
    const segSemClasses = {
      id: 'seg-z',
      name: 'Segmento Z',
      grades: [{ name: '9º Ano' }],
    }
    expect(allTurmaObjects([segSemClasses])).toEqual([])
  })

  it('produz múltiplas turmas de múltiplos segmentos com segmentId correto', () => {
    const result = allTurmaObjects([SEG_FUND, SEG_MEDIO])
    const turmasFund  = result.filter(t => t.segmentId === 'seg-fund')
    const turmasMedio = result.filter(t => t.segmentId === 'seg-medio')
    expect(turmasFund).toHaveLength(3)
    expect(turmasMedio).toHaveLength(1)
  })
})

// ─── isSharedSeries ───────────────────────────────────────────────────────────

describe('isSharedSeries', () => {
  it('retorna true para match exato do campo name', () => {
    expect(isSharedSeries('FORMAÇÃO', SHARED_SERIES_COMPLETO)).toBe(true)
  })

  it('retorna true para outro tipo compartilhado (elective)', () => {
    expect(isSharedSeries('Eletiva 2024', SHARED_SERIES_COMPLETO)).toBe(true)
  })

  it('retorna true para tipo rest', () => {
    expect(isSharedSeries('ALMOÇO', SHARED_SERIES_COMPLETO)).toBe(true)
  })

  it('retorna false para match parcial (prefixo)', () => {
    expect(isSharedSeries('FORM', SHARED_SERIES_COMPLETO)).toBe(false)
  })

  it('retorna false para diferença de capitalização (case-sensitive)', () => {
    expect(isSharedSeries('formação', SHARED_SERIES_COMPLETO)).toBe(false)
    expect(isSharedSeries('Formação', SHARED_SERIES_COMPLETO)).toBe(false)
  })

  it('retorna false para turma regular não listada em sharedSeries', () => {
    expect(isSharedSeries('6º Ano A', SHARED_SERIES_COMPLETO)).toBe(false)
  })

  it('retorna false para sharedSeries vazio', () => {
    expect(isSharedSeries('FORMAÇÃO', [])).toBe(false)
  })

  it('retorna false para sharedSeries com valor default omitido', () => {
    expect(isSharedSeries('FORMAÇÃO')).toBe(false)
  })
})

// ─── isFormationSlot ──────────────────────────────────────────────────────────

describe('isFormationSlot', () => {
  it('retorna true para turma com type "formation" em sharedSeries', () => {
    expect(isFormationSlot('FORMAÇÃO', null, SHARED_SERIES_COMPLETO)).toBe(true)
  })

  it('retorna false para type "elective" mesmo que turma esteja em sharedSeries — regressão crítica', () => {
    expect(isFormationSlot('Eletiva 2024', null, SHARED_SERIES_COMPLETO)).toBe(false)
  })

  it('retorna false para type "rest" mesmo que turma esteja em sharedSeries', () => {
    expect(isFormationSlot('ALMOÇO', null, SHARED_SERIES_COMPLETO)).toBe(false)
  })

  it('retorna false para turma null', () => {
    expect(isFormationSlot(null, null, SHARED_SERIES_COMPLETO)).toBe(false)
  })

  it('retorna false para turma undefined', () => {
    expect(isFormationSlot(undefined, null, SHARED_SERIES_COMPLETO)).toBe(false)
  })

  it('retorna false para turma regular fora de sharedSeries', () => {
    expect(isFormationSlot('6º Ano A', null, SHARED_SERIES_COMPLETO)).toBe(false)
  })

  it('_subjectId null não afeta o resultado (retorna true)', () => {
    expect(isFormationSlot('FORMAÇÃO', null, SHARED_SERIES_COMPLETO)).toBe(true)
  })

  it('_subjectId com valor de matéria real não altera o resultado (retorna true)', () => {
    expect(isFormationSlot('FORMAÇÃO', 'subj-bio', SHARED_SERIES_COMPLETO)).toBe(true)
  })

  it('_subjectId com string aleatória não altera o resultado (retorna true)', () => {
    expect(isFormationSlot('FORMAÇÃO', 'qualquer-coisa-aqui', SHARED_SERIES_COMPLETO)).toBe(true)
  })

  it('retorna false quando sharedSeries está vazio', () => {
    expect(isFormationSlot('FORMAÇÃO', null, [])).toBe(false)
  })

  it('retorna false quando sharedSeries é omitido (valor default)', () => {
    expect(isFormationSlot('FORMAÇÃO', null)).toBe(false)
  })
})

// ─── isRestSlot ───────────────────────────────────────────────────────────────

describe('isRestSlot', () => {
  it('retorna true para turma com type "rest" em sharedSeries', () => {
    expect(isRestSlot('ALMOÇO', SHARED_SERIES_COMPLETO)).toBe(true)
  })

  it('retorna false para type "formation" mesmo que turma esteja em sharedSeries', () => {
    expect(isRestSlot('FORMAÇÃO', SHARED_SERIES_COMPLETO)).toBe(false)
  })

  it('retorna false para type "elective"', () => {
    expect(isRestSlot('Eletiva 2024', SHARED_SERIES_COMPLETO)).toBe(false)
  })

  it('retorna false para turma null', () => {
    expect(isRestSlot(null, SHARED_SERIES_COMPLETO)).toBe(false)
  })

  it('retorna false para turma undefined', () => {
    expect(isRestSlot(undefined, SHARED_SERIES_COMPLETO)).toBe(false)
  })

  it('retorna false quando sharedSeries está vazio', () => {
    expect(isRestSlot('ALMOÇO', [])).toBe(false)
  })

  it('retorna false quando sharedSeries é omitido (valor default)', () => {
    expect(isRestSlot('ALMOÇO')).toBe(false)
  })

  it('retorna false para turma regular não listada', () => {
    expect(isRestSlot('6º Ano A', SHARED_SERIES_COMPLETO)).toBe(false)
  })
})
