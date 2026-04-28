import { describe, it, expect } from 'vitest'
import {
  toMin,
  fromMin,
  gerarPeriodos,
  parseSlot,
  makeSlot,
  resolveSlot,
  slotLabel,
  slotFullLabel,
} from '../lib/periods/index.js'

// ─── Fixture PeriodCfg ────────────────────────────────────────────────────────

const CFG_SIMPLES = {
  inicio:     '07:00',
  duracao:    50,
  qtd:        5,
  intervalos: [],
}

// 7 aulas, 1 intervalo de 10 min após a 2ª aula e 1 de 60 min após a 5ª aula
const CFG_COM_INTERVALOS = {
  inicio:     '07:00',
  duracao:    50,
  qtd:        7,
  intervalos: [
    { apos: 2, duracao: 10 },
    { apos: 5, duracao: 60 },
  ],
}

// periodConfigs mínimo para testar resolveSlot / slotLabel / slotFullLabel
const PERIOD_CONFIGS = {
  'seg-fund': {
    manha: CFG_SIMPLES,
  },
}

// ─── toMin ────────────────────────────────────────────────────────────────────

describe('toMin', () => {
  it('"07:00" retorna 420', () => {
    expect(toMin('07:00')).toBe(420)
  })

  it('"13:30" retorna 810', () => {
    expect(toMin('13:30')).toBe(810)
  })

  it('"00:00" retorna 0', () => {
    expect(toMin('00:00')).toBe(0)
  })

  it('string vazia usa fallback "00:00" e retorna 0', () => {
    expect(toMin('')).toBe(0)
  })

  it('null usa fallback "00:00" e retorna 0', () => {
    expect(toMin(null)).toBe(0)
  })

  it('undefined usa fallback "00:00" e retorna 0', () => {
    expect(toMin(undefined)).toBe(0)
  })
})

// ─── fromMin ─────────────────────────────────────────────────────────────────

describe('fromMin', () => {
  it('420 retorna "07:00"', () => {
    expect(fromMin(420)).toBe('07:00')
  })

  it('810 retorna "13:30"', () => {
    expect(fromMin(810)).toBe('13:30')
  })

  it('0 retorna "00:00"', () => {
    expect(fromMin(0)).toBe('00:00')
  })
})

// ─── gerarPeriodos ────────────────────────────────────────────────────────────

describe('gerarPeriodos', () => {
  it('retorna [] quando cfg é null', () => {
    expect(gerarPeriodos(null)).toEqual([])
  })

  it('retorna [] quando cfg é undefined', () => {
    expect(gerarPeriodos(undefined)).toEqual([])
  })

  it('gera exatamente qtd aulas quando não há intervalos', () => {
    const result = gerarPeriodos(CFG_SIMPLES)
    const aulas = result.filter(p => !p.isIntervalo)
    expect(aulas).toHaveLength(5)
  })

  it('aulaIdx vai de 1 a qtd nas aulas (isIntervalo: false)', () => {
    const result = gerarPeriodos(CFG_SIMPLES)
    const aulas = result.filter(p => !p.isIntervalo)
    const idxs = aulas.map(a => a.aulaIdx)
    expect(idxs).toEqual([1, 2, 3, 4, 5])
  })

  it('primeira aula começa exatamente em cfg.inicio', () => {
    const result = gerarPeriodos(CFG_SIMPLES)
    expect(result[0].inicio).toBe('07:00')
  })

  it('segunda aula começa imediatamente após a primeira quando não há intervalo', () => {
    const result = gerarPeriodos(CFG_SIMPLES)
    const aulas = result.filter(p => !p.isIntervalo)
    // 1ª aula termina às 07:50 (420 + 50 = 470 min); 2ª começa em 07:50
    expect(aulas[1].inicio).toBe('07:50')
  })

  it('cada aula tem fim = inicio + duracao', () => {
    const result = gerarPeriodos(CFG_SIMPLES)
    result
      .filter(p => !p.isIntervalo)
      .forEach(p => {
        const inicioMin = toMin(p.inicio)
        const fimMin    = toMin(p.fim)
        expect(fimMin - inicioMin).toBe(CFG_SIMPLES.duracao)
      })
  })

  it('total de entradas = qtd + qtd_intervalos quando há intervalos', () => {
    // 7 aulas + 2 intervalos = 9 entradas
    const result = gerarPeriodos(CFG_COM_INTERVALOS)
    expect(result).toHaveLength(9)
  })

  it('insere entrada com isIntervalo: true após a aula indicada em intervalos[].apos', () => {
    const result = gerarPeriodos(CFG_COM_INTERVALOS)
    // O intervalo do apos:2 deve aparecer logo após a aula de aulaIdx:2
    const idxAula2  = result.findIndex(p => !p.isIntervalo && p.aulaIdx === 2)
    const proximo   = result[idxAula2 + 1]
    expect(proximo.isIntervalo).toBe(true)
    expect(proximo.label).toBe('Intervalo')
  })

  it('aula após intervalo começa no tempo correto (soma a duração do intervalo)', () => {
    const result = gerarPeriodos(CFG_COM_INTERVALOS)
    // Aula 1: 07:00–07:50, Aula 2: 07:50–08:40
    // Intervalo após aula 2: 08:40 + 10 = 08:50
    // Aula 3 começa às 08:50
    const aula3 = result.find(p => !p.isIntervalo && p.aulaIdx === 3)
    expect(aula3.inicio).toBe('08:50')
  })

  it('gera lista com apenas 1 aula quando qtd é 1', () => {
    const cfg = { inicio: '07:00', duracao: 50, qtd: 1, intervalos: [] }
    const result = gerarPeriodos(cfg)
    expect(result).toHaveLength(1)
    expect(result[0].aulaIdx).toBe(1)
    expect(result[0].isIntervalo).toBe(false)
  })

  it('label de cada aula segue o padrão "N° Aula"', () => {
    const result = gerarPeriodos(CFG_SIMPLES)
    const aulas = result.filter(p => !p.isIntervalo)
    expect(aulas[0].label).toBe('1ª Aula')
    expect(aulas[1].label).toBe('2ª Aula')
  })

  it('aulaIdx das entradas de intervalo é null', () => {
    const result = gerarPeriodos(CFG_COM_INTERVALOS)
    result.filter(p => p.isIntervalo).forEach(iv => {
      expect(iv.aulaIdx).toBeNull()
    })
  })
})

// ─── parseSlot ────────────────────────────────────────────────────────────────

describe('parseSlot', () => {
  it('"seg-fund|manha|3" retorna objeto com aulaIdx como Number', () => {
    const result = parseSlot('seg-fund|manha|3')
    expect(result).toEqual({ segmentId: 'seg-fund', turno: 'manha', aulaIdx: 3 })
    expect(typeof result.aulaIdx).toBe('number')
  })

  it('"seg-fund|manha|e2" retorna aulaIdx como string "e2" com isEspecial: true', () => {
    const result = parseSlot('seg-fund|manha|e2')
    expect(result).toEqual({ segmentId: 'seg-fund', turno: 'manha', aulaIdx: 'e2', isEspecial: true })
    expect(typeof result.aulaIdx).toBe('string')
  })

  it('slot especial "e1" é distinguido corretamente de slot numérico 1', () => {
    const regular  = parseSlot('seg-fund|manha|1')
    const especial = parseSlot('seg-fund|manha|e1')
    expect(regular.isEspecial).toBeUndefined()
    expect(especial.isEspecial).toBe(true)
    expect(typeof regular.aulaIdx).toBe('number')
    expect(typeof especial.aulaIdx).toBe('string')
  })

  it('retorna null para null', () => {
    expect(parseSlot(null)).toBeNull()
  })

  it('retorna null para undefined', () => {
    expect(parseSlot(undefined)).toBeNull()
  })

  it('retorna null para string sem dois separadores "|"', () => {
    expect(parseSlot('seg-fund|manha')).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(parseSlot('')).toBeNull()
  })
})

// ─── makeSlot ─────────────────────────────────────────────────────────────────

describe('makeSlot', () => {
  it('makeSlot("seg-fund", "manha", 3) retorna "seg-fund|manha|3"', () => {
    expect(makeSlot('seg-fund', 'manha', 3)).toBe('seg-fund|manha|3')
  })

  it('makeSlot com aulaIdx 1 retorna "seg-fund|manha|1"', () => {
    expect(makeSlot('seg-fund', 'manha', 1)).toBe('seg-fund|manha|1')
  })

  it('makeSlot com turno "tarde" inclui o turno correto', () => {
    expect(makeSlot('seg-medio', 'tarde', 2)).toBe('seg-medio|tarde|2')
  })
})

// ─── resolveSlot ─────────────────────────────────────────────────────────────

describe('resolveSlot', () => {
  it('slot regular válido retorna objeto com label, inicio, fim e isIntervalo: false', () => {
    const result = resolveSlot('seg-fund|manha|1', PERIOD_CONFIGS)
    expect(result).not.toBeNull()
    expect(result.label).toBe('1ª Aula')
    expect(result.inicio).toBe('07:00')
    expect(result.fim).toBe('07:50')
    expect(result.isIntervalo).toBe(false)
  })

  it('slot especial "seg-fund|manha|e1" retorna null', () => {
    expect(resolveSlot('seg-fund|manha|e1', PERIOD_CONFIGS)).toBeNull()
  })

  it('aulaIdx fora do range (qtd:5, aulaIdx:10) retorna null', () => {
    const cfgQtd5 = {
      'seg-fund': {
        manha: { inicio: '07:00', duracao: 50, qtd: 5, intervalos: [] },
      },
    }
    expect(resolveSlot('seg-fund|manha|10', cfgQtd5)).toBeNull()
  })

  it('input null retorna null', () => {
    expect(resolveSlot(null, PERIOD_CONFIGS)).toBeNull()
  })

  it('input undefined retorna null', () => {
    expect(resolveSlot(undefined, PERIOD_CONFIGS)).toBeNull()
  })

  it('periodConfigs vazio não lança exceção — usa defaultCfg e resolve a aula normalmente', () => {
    // getCfg aplica defaultCfg quando segmento não existe em periodConfigs;
    // portanto aulaIdx 1 ainda resolve com os valores padrão (inicio "07:00", duracao 50).
    expect(() => resolveSlot('seg-fund|manha|1', {})).not.toThrow()
    const result = resolveSlot('seg-fund|manha|1', {})
    expect(result).not.toBeNull()
    expect(result.aulaIdx).toBe(1)
  })
})

// ─── slotLabel ────────────────────────────────────────────────────────────────

describe('slotLabel', () => {
  it('retorna "1ª Aula" para slot válido', () => {
    expect(slotLabel('seg-fund|manha|1', PERIOD_CONFIGS)).toBe('1ª Aula')
  })

  it('retorna o próprio timeSlot quando resolveSlot retorna null (fallback)', () => {
    // slot especial não resolve
    expect(slotLabel('seg-fund|manha|e1', PERIOD_CONFIGS)).toBe('seg-fund|manha|e1')
  })

  it('retorna o próprio timeSlot quando aulaIdx está fora do range', () => {
    expect(slotLabel('seg-fund|manha|99', PERIOD_CONFIGS)).toBe('seg-fund|manha|99')
  })

  it('retorna "—" quando timeSlot é null', () => {
    expect(slotLabel(null, PERIOD_CONFIGS)).toBe('—')
  })
})

// ─── slotFullLabel ────────────────────────────────────────────────────────────

describe('slotFullLabel', () => {
  it('retorna "1ª Aula (07:00–07:50)" para cfg com duracao 50min', () => {
    expect(slotFullLabel('seg-fund|manha|1', PERIOD_CONFIGS)).toBe('1ª Aula (07:00–07:50)')
  })

  it('retorna o próprio timeSlot quando slot especial não resolve', () => {
    expect(slotFullLabel('seg-fund|manha|e1', PERIOD_CONFIGS)).toBe('seg-fund|manha|e1')
  })

  it('retorna o próprio timeSlot quando aulaIdx está fora do range', () => {
    expect(slotFullLabel('seg-fund|manha|99', PERIOD_CONFIGS)).toBe('seg-fund|manha|99')
  })

  it('retorna "—" quando timeSlot é null', () => {
    expect(slotFullLabel(null, PERIOD_CONFIGS)).toBe('—')
  })

  it('label full da 3ª aula inclui horário calculado corretamente', () => {
    // Aula 1: 07:00–07:50, Aula 2: 07:50–08:40, Aula 3: 08:40–09:30
    expect(slotFullLabel('seg-fund|manha|3', PERIOD_CONFIGS)).toBe('3ª Aula (08:40–09:30)')
  })
})
