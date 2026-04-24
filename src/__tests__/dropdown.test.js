import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectDropdownPlacement } from '../lib/helpers/dropdown'

function createMockElement(bottom = 100, inDOM = true) {
  return {
    offsetParent: inDOM ? {} : null,
    getBoundingClientRect: vi.fn(() => ({
      top: bottom - 30,
      bottom: bottom,
      left: 0,
      right: 100,
      width: 100,
      height: 30,
      x: 0,
      y: bottom - 30,
    })),
  }
}

describe('detectDropdownPlacement', () => {
  describe('Caminho feliz: dropdown cabe abaixo', () => {
    it('retorna "down" quando há espaço suficiente', () => {
      const trigger = createMockElement(100)
      const container = createMockElement(350)
      expect(detectDropdownPlacement(trigger, 120, container)).toBe('down')
    })

    it('retorna "down" quando há exatamente espaço suficiente (boundary)', () => {
      // spaceBelow = 136, neededSpace = 120 + 16 = 136
      const trigger = createMockElement(100)
      const container = createMockElement(236)
      expect(detectDropdownPlacement(trigger, 120, container)).toBe('down')
    })

    it('retorna "up" quando falta 1px (margem de 16px é obrigatória)', () => {
      // spaceBelow = 135, neededSpace = 136 → "up"
      const trigger = createMockElement(100)
      const container = createMockElement(235)
      expect(detectDropdownPlacement(trigger, 120, container)).toBe('up')
    })
  })

  describe('Caminho alternativo: sem espaço abaixo', () => {
    it('retorna "up" quando espaço insuficiente', () => {
      const trigger = createMockElement(300)
      const container = createMockElement(350)
      expect(detectDropdownPlacement(trigger, 120, container)).toBe('up')
    })

    it('retorna "up" quando espaço é 0', () => {
      const trigger = createMockElement(350)
      const container = createMockElement(350)
      expect(detectDropdownPlacement(trigger, 120, container)).toBe('up')
    })

    it('retorna "up" quando trigger está além da borda do container', () => {
      const trigger = createMockElement(500)
      const container = createMockElement(350)
      expect(detectDropdownPlacement(trigger, 120, container)).toBe('up')
    })
  })

  describe('Container null → usa viewport como fallback', () => {
    beforeEach(() => { global.window = { innerHeight: 800 } })
    afterEach(() => { delete global.window })

    it('usa window.innerHeight quando containerElement é null', () => {
      const trigger = createMockElement(100)
      expect(detectDropdownPlacement(trigger, 120, null)).toBe('down')
    })

    it('usa viewport quando container não está no DOM (offsetParent null)', () => {
      const trigger = createMockElement(100)
      const containerNotInDOM = createMockElement(350, false)
      expect(detectDropdownPlacement(trigger, 120, containerNotInDOM)).toBe('down')
    })

    it('retorna "up" quando trigger está perto do fim do viewport', () => {
      const trigger = createMockElement(700)
      // spaceBelow = 800 - 700 = 100 < 136
      expect(detectDropdownPlacement(trigger, 120, null)).toBe('up')
    })
  })

  describe('Edge cases: trigger inválido', () => {
    it('retorna "down" quando triggerElement é null', () => {
      expect(detectDropdownPlacement(null, 120)).toBe('down')
    })

    it('retorna "down" quando triggerElement é undefined', () => {
      expect(detectDropdownPlacement(undefined, 120)).toBe('down')
    })

    it('retorna "down" quando triggerElement não está no DOM', () => {
      const trigger = createMockElement(100, false)
      expect(detectDropdownPlacement(trigger, 120)).toBe('down')
    })
  })

  describe('Edge cases: dropdownHeight inválido', () => {
    beforeEach(() => { global.window = { innerHeight: 800 } })
    afterEach(() => { delete global.window })

    it('trata height 0 como 1px mínimo', () => {
      const trigger = createMockElement(100)
      expect(detectDropdownPlacement(trigger, 0, null)).toBe('down')
    })

    it('trata height negativo como 1px mínimo', () => {
      const trigger = createMockElement(100)
      expect(detectDropdownPlacement(trigger, -100, null)).toBe('down')
    })
  })

  describe('Cenário real: modal de aprovação', () => {
    beforeEach(() => { global.window = { innerHeight: 800 } })
    afterEach(() => { delete global.window })

    it('item no meio da lista abre para baixo', () => {
      const trigger = createMockElement(150)
      const modal = createMockElement(450)
      expect(detectDropdownPlacement(trigger, 120, modal)).toBe('down')
    })

    it('último item da lista abre para cima', () => {
      const trigger = createMockElement(650)
      const modal = createMockElement(750)
      // spaceBelow = 100 < 136
      expect(detectDropdownPlacement(trigger, 120, modal)).toBe('up')
    })
  })
})
