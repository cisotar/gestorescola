import { describe, it, expect } from 'vitest'
import {
  parseDate,
  formatISO,
  formatBR,
  dateToDayLabel,
  weekStart,
  businessDaysBetween,
  formatMonthlyAulas,
} from '../lib/helpers/dates.js'

// ─── parseDate ────────────────────────────────────────────────────────────────

describe('parseDate', () => {
  it('retorna Date local válida para string ISO "2026-04-14"', () => {
    const d = parseDate('2026-04-14')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(3)   // Abril = índice 3
    expect(d.getDate()).toBe(14)
  })

  it('não sofre UTC-shift: getDate() é 14, não 13', () => {
    // Em fusos negativos UTC-3 a UTC-12, new Date("2026-04-14") pode retornar dia 13
    // parseDate usa new Date(y, m-1, d) — construtor local — então sempre é dia 14
    const d = parseDate('2026-04-14')
    expect(d.getDate()).toBe(14)
    expect(d.getFullYear()).toBe(2026)
  })

  it('processa mês com zero à esquerda: "2026-01-01" → Janeiro', () => {
    const d = parseDate('2026-01-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(0)   // Janeiro = índice 0
    expect(d.getDate()).toBe(1)
  })

  it('processa "2026-12-31" corretamente — último dia do ano', () => {
    const d = parseDate('2026-12-31')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(11)  // Dezembro = índice 11
    expect(d.getDate()).toBe(31)
  })

  it('retorna new Date(NaN) para null', () => {
    const d = parseDate(null)
    expect(isNaN(d.getTime())).toBe(true)
  })

  it('retorna new Date(NaN) para undefined', () => {
    const d = parseDate(undefined)
    expect(isNaN(d.getTime())).toBe(true)
  })

  it('retorna new Date(NaN) para número (não-string)', () => {
    const d = parseDate(20260414)
    expect(isNaN(d.getTime())).toBe(true)
  })

  it('retorna new Date(NaN) para objeto (não-string)', () => {
    const d = parseDate({ year: 2026 })
    expect(isNaN(d.getTime())).toBe(true)
  })

  it('retorna new Date(NaN) para string vazia ""', () => {
    const d = parseDate('')
    expect(isNaN(d.getTime())).toBe(true)
  })
})

// ─── formatISO ────────────────────────────────────────────────────────────────

describe('formatISO', () => {
  it('formata Date válida como "YYYY-MM-DD"', () => {
    expect(formatISO(new Date(2026, 3, 14))).toBe('2026-04-14')
  })

  it('aplica zero-padding em mês de um dígito', () => {
    expect(formatISO(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('aplica zero-padding em dia de um dígito', () => {
    expect(formatISO(new Date(2026, 11, 1))).toBe('2026-12-01')
  })

  it('formata "2026-12-31" corretamente', () => {
    expect(formatISO(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('retorna null para null', () => {
    expect(formatISO(null)).toBeNull()
  })

  it('retorna null para undefined', () => {
    expect(formatISO(undefined)).toBeNull()
  })

  it('retorna null para Date inválida', () => {
    expect(formatISO(new Date(NaN))).toBeNull()
  })

  it('formatISO(parseDate(s)) é identidade para string ISO válida', () => {
    expect(formatISO(parseDate('2026-04-14'))).toBe('2026-04-14')
    expect(formatISO(parseDate('2026-01-01'))).toBe('2026-01-01')
  })
})

// ─── formatBR ─────────────────────────────────────────────────────────────────

describe('formatBR', () => {
  it('converte "2026-04-14" para "14/04/2026"', () => {
    expect(formatBR('2026-04-14')).toBe('14/04/2026')
  })

  it('converte "2026-01-01" para "01/01/2026"', () => {
    expect(formatBR('2026-01-01')).toBe('01/01/2026')
  })

  it('converte "2026-12-31" para "31/12/2026"', () => {
    expect(formatBR('2026-12-31')).toBe('31/12/2026')
  })

  it('retorna "—" para string vazia', () => {
    expect(formatBR('')).toBe('—')
  })

  it('retorna "—" para null', () => {
    expect(formatBR(null)).toBe('—')
  })

  it('retorna "—" para undefined', () => {
    expect(formatBR(undefined)).toBe('—')
  })

  it('retorna "—" para zero (falsy)', () => {
    expect(formatBR(0)).toBe('—')
  })
})

// ─── dateToDayLabel ───────────────────────────────────────────────────────────

describe('dateToDayLabel', () => {
  // 2026-04-13 Segunda, 2026-04-14 Terça, 2026-04-15 Quarta,
  // 2026-04-16 Quinta, 2026-04-17 Sexta, 2026-04-18 Sábado, 2026-04-19 Domingo

  it('Segunda-feira → "Segunda"', () => {
    expect(dateToDayLabel('2026-04-13')).toBe('Segunda')
  })

  it('Terça-feira → "Terça"', () => {
    expect(dateToDayLabel('2026-04-14')).toBe('Terça')
  })

  it('Quarta-feira → "Quarta"', () => {
    expect(dateToDayLabel('2026-04-15')).toBe('Quarta')
  })

  it('Quinta-feira → "Quinta"', () => {
    expect(dateToDayLabel('2026-04-16')).toBe('Quinta')
  })

  it('Sexta-feira → "Sexta"', () => {
    expect(dateToDayLabel('2026-04-17')).toBe('Sexta')
  })

  it('Sábado → null', () => {
    expect(dateToDayLabel('2026-04-18')).toBeNull()
  })

  it('Domingo → null', () => {
    expect(dateToDayLabel('2026-04-19')).toBeNull()
  })
})

// ─── weekStart ────────────────────────────────────────────────────────────────

describe('weekStart', () => {
  it('Quarta → Segunda da mesma semana', () => {
    // 2026-04-15 Quarta → weekStart = 2026-04-13 Segunda
    expect(weekStart('2026-04-15')).toBe('2026-04-13')
  })

  it('input já Segunda → própria data', () => {
    expect(weekStart('2026-04-13')).toBe('2026-04-13')
  })

  it('Domingo → Segunda anterior (semana anterior)', () => {
    // 2026-04-19 Domingo → weekStart = 2026-04-13 Segunda
    expect(weekStart('2026-04-19')).toBe('2026-04-13')
  })

  it('Sexta → Segunda da mesma semana', () => {
    // 2026-04-17 Sexta → weekStart = 2026-04-13 Segunda
    expect(weekStart('2026-04-17')).toBe('2026-04-13')
  })

  it('Sábado → Segunda da mesma semana (semana corrente)', () => {
    // 2026-04-18 Sábado: getDay() = 6, diff = 1 - 6 = -5 → 18 - 5 = 13 Segunda
    expect(weekStart('2026-04-18')).toBe('2026-04-13')
  })

  it('input inválido (null) → não lança exceção', () => {
    expect(() => weekStart(null)).not.toThrow()
  })

  it('input inválido (string vazia) → não lança exceção', () => {
    expect(() => weekStart('')).not.toThrow()
  })
})

// ─── businessDaysBetween ──────────────────────────────────────────────────────

describe('businessDaysBetween', () => {
  it('retorna apenas Seg–Sex: exclui Sábado e Domingo', () => {
    // 2026-04-13 (Seg) a 2026-04-19 (Dom) → apenas 13, 14, 15, 16, 17
    const result = businessDaysBetween('2026-04-13', '2026-04-19')
    expect(result).toEqual([
      '2026-04-13',
      '2026-04-14',
      '2026-04-15',
      '2026-04-16',
      '2026-04-17',
    ])
  })

  it('não inclui Sábado', () => {
    const result = businessDaysBetween('2026-04-13', '2026-04-19')
    expect(result).not.toContain('2026-04-18')
  })

  it('não inclui Domingo', () => {
    const result = businessDaysBetween('2026-04-13', '2026-04-19')
    expect(result).not.toContain('2026-04-19')
  })

  it('inclui from quando é dia útil (Segunda)', () => {
    const result = businessDaysBetween('2026-04-13', '2026-04-17')
    expect(result[0]).toBe('2026-04-13')
  })

  it('inclui to quando é dia útil (Sexta)', () => {
    const result = businessDaysBetween('2026-04-13', '2026-04-17')
    expect(result[result.length - 1]).toBe('2026-04-17')
  })

  it('from === to dia útil → retorna array com exatamente um elemento', () => {
    const result = businessDaysBetween('2026-04-14', '2026-04-14')
    expect(result).toEqual(['2026-04-14'])
  })

  it('from === to Sábado → retorna array vazio', () => {
    const result = businessDaysBetween('2026-04-18', '2026-04-18')
    expect(result).toEqual([])
  })

  it('from > to → retorna array vazio', () => {
    const result = businessDaysBetween('2026-04-17', '2026-04-13')
    expect(result).toEqual([])
  })

  it('from Sábado, to Domingo → retorna array vazio', () => {
    const result = businessDaysBetween('2026-04-18', '2026-04-19')
    expect(result).toEqual([])
  })

  it('semana completa de Segunda a Sexta → 5 dias úteis', () => {
    const result = businessDaysBetween('2026-04-13', '2026-04-17')
    expect(result).toHaveLength(5)
  })

  it('mês inteiro de Abril/2026 → 22 dias úteis', () => {
    const result = businessDaysBetween('2026-04-01', '2026-04-30')
    expect(result).toHaveLength(22)
    result.forEach(s => {
      const d = new Date(s + 'T12:00:00') // parse neutro
      expect(d.getDay()).toBeGreaterThanOrEqual(1)
      expect(d.getDay()).toBeLessThanOrEqual(5)
    })
  })
})

// ─── formatMonthlyAulas ───────────────────────────────────────────────────────

describe('formatMonthlyAulas', () => {
  it('count 1 → "1 aula"', () => {
    expect(formatMonthlyAulas(1)).toBe('1 aula')
  })

  it('count 0 → "0 aulas"', () => {
    expect(formatMonthlyAulas(0)).toBe('0 aulas')
  })

  it('count 2 → "2 aulas"', () => {
    expect(formatMonthlyAulas(2)).toBe('2 aulas')
  })

  it('count grande → "N aulas"', () => {
    expect(formatMonthlyAulas(42)).toBe('42 aulas')
  })

  it('count 1 é o único singular — count 0 usa plural', () => {
    expect(formatMonthlyAulas(0)).not.toBe('0 aula')
  })
})
