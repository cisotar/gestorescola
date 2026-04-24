import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectDropdownPlacement } from '../lib/helpers/dropdown'

// ─── Helpers para criar elementos mock ────────────────────────────────────

/**
 * Cria um objeto mock que simula um HTMLElement com getBoundingClientRect
 * @param {number} bottom - Posição bottom do getBoundingClientRect
 * @param {boolean} inDOM - Se offsetParent é null (não está no DOM)
 */
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

// ─── Describe principal ───────────────────────────────────────────────────

describe('detectDropdownPlacement', () => {
  // ─── Testes do caminho feliz ──────────────────────────────────────────────

  describe('Caminho feliz: dropdown cabe abaixo', () => {
    it('retorna "down" quando há espaço suficiente (spaceBelow >= dropdownHeight + margem)', () => {
      // Setup: trigger em 100, dropdown 120px, container em 350
      // spaceBelow = 350 - 100 = 250
      // neededSpace = 120 + 16 = 136
      // 250 >= 136 ✓
      const trigger = createMockElement(100)
      const container = createMockElement(350)

      const result = detectDropdownPlacement(trigger, 120, container)

      expect(result).toBe('down')
      expect(trigger.getBoundingClientRect).toHaveBeenCalled()
    })

    it('retorna "down" quando há exatamente espaço suficiente', () => {
      // spaceBelow = 136, neededSpace = 136 (120 + 16)
      const trigger = createMockElement(100)
      const container = createMockElement(236)

      const result = detectDropdownPlacement(trigger, 120, container)

      expect(result).toBe('down')
    })

    it('retorna "down" com margem de segurança de 16px', () => {
      // Verifica que a margem é considerada
      // trigger em 100, espaço até container = 135
      // 135 < 120 + 16 (136) → deveria ser "up"
      const trigger = createMockElement(100)
      const container = createMockElement(235) // 235 - 100 = 135

      const result = detectDropdownPlacement(trigger, 120, container)

      expect(result).toBe('up')
    })
  })

  // ─── Testes do caminho alternativo ────────────────────────────────────────

  describe('Caminho alternativo: sem espaço abaixo', () => {
    it('retorna "up" quando espaço insuficiente abaixo', () => {
      // Setup: trigger em 300, dropdown 120px, container em 350
      // spaceBelow = 350 - 300 = 50
      // neededSpace = 120 + 16 = 136
      // 50 < 136 → "up"
      const trigger = createMockElement(300)
      const container = createMockElement(350)

      const result = detectDropdownPlacement(trigger, 120, container)

      expect(result).toBe('up')
    })

    it('retorna "up" quando espaço é 0', () => {
      const trigger = createMockElement(350)
      const container = createMockElement(350)

      const result = detectDropdownPlacement(trigger, 120, container)

      expect(result).toBe('up')
    })

    it('retorna "up" quando trigger está bem abaixo do container', () => {
      const trigger = createMockElement(500)
      const container = createMockElement(350)

      const result = detectDropdownPlacement(trigger, 120, container)

      expect(result).toBe('up')
    })
  })

  // ─── Testes de container null (fallback para viewport) ──────────────────

  describe('Container null → usa viewport como fallback', () => {
    beforeEach(() => {
      // Mock window global com innerHeight
      global.window = { innerHeight: 800 }
    })

    afterEach(() => {
      delete global.window
    })

    it('usa window.innerHeight quando containerElement é null', () => {
      const trigger = createMockElement(100)

      const result = detectDropdownPlacement(trigger, 120, null)

      // spaceBelow = 800 - 100 = 700
      // neededSpace = 120 + 16 = 136
      // 700 >= 136 → "down"
      expect(result).toBe('down')
    })

    it('usa window.innerHeight quando containerElement não está no DOM', () => {
      const trigger = createMockElement(100)
      const containerNotInDOM = createMockElement(350, false) // offsetParent = null

      const result = detectDropdownPlacement(trigger, 120, containerNotInDOM)

      // Usa window.innerHeight, não o container
      expect(result).toBe('down')
    })

    it('usa viewport mesmo quando trigger está perto do fim', () => {
      const trigger = createMockElement(700)

      const result = detectDropdownPlacement(trigger, 120, null)

      // spaceBelow = 800 - 700 = 100
      // neededSpace = 120 + 16 = 136
      // 100 < 136 → "up"
      expect(result).toBe('up')
    })
  })

  // ─── Testes de validações e edge cases ────────────────────────────────────

  describe('Validações: trigger falsy', () => {
    it('retorna "down" quando triggerElement é null', () => {
      const result = detectDropdownPlacement(null, 120)

      expect(result).toBe('down')
    })

    it('retorna "down" quando triggerElement é undefined', () => {
      const result = detectDropdownPlacement(undefined, 120)

      expect(result).toBe('down')
    })

    it('retorna "down" quando triggerElement é false', () => {
      const result = detectDropdownPlacement(false, 120)

      expect(result).toBe('down')
    })

    it('retorna "down" quando triggerElement não está no DOM (offsetParent null)', () => {
      const trigger = createMockElement(100, false)

      const result = detectDropdownPlacement(trigger, 120)

      expect(result).toBe('down')
    })
  })

  describe('Validações: dropdownHeight', () => {
    beforeEach(() => {
      global.window = { innerHeight: 800 }
    })

    afterEach(() => {
      delete global.window
    })

    it('retorna "down" quando dropdownHeight é 0 (assume 1px)', () => {
      const trigger = createMockElement(100)

      const result = detectDropdownPlacement(trigger, 0, null)

      // neededSpace = 1 + 16 = 17
      // spaceBelow = 800 - 100 = 700
      // 700 >= 17 → "down"
      expect(result).toBe('down')
    })

    it('trata dropdownHeight negativo como 1px', () => {
      const trigger = createMockElement(100)

      const result = detectDropdownPlacement(trigger, -100, null)

      // neededSpace = 1 + 16 = 17
      expect(result).toBe('down')
    })

    it('calcula corretamente com dropdown grande', () => {
      const trigger = createMockElement(100)

      const result = detectDropdownPlacement(trigger, 500, null)

      // neededSpace = 500 + 16 = 516
      // spaceBelow = 800 - 100 = 700
      // 700 >= 516 → "down"
      expect(result).toBe('down')
    })

    it('retorna "up" quando dropdown é muito grande', () => {
      const trigger = createMockElement(100)

      const result = detectDropdownPlacement(trigger, 1000, null)

      // neededSpace = 1000 + 16 = 1016
      // spaceBelow = 800 - 100 = 700
      // 700 < 1016 → "up"
      expect(result).toBe('up')
    })
  })

  // ─── Testes de integração e casos reais ────────────────────────────────────

  describe('Cenários realistas', () => {
    beforeEach(() => {
      global.window = { innerHeight: 800 }
    })

    afterEach(() => {
      delete global.window
    })

    it('modal pequeno no meio da tela (dropdown cabe abaixo)', () => {
      const trigger = createMockElement(150)
      const modal = createMockElement(450)

      const result = detectDropdownPlacement(trigger, 120, modal)

      // spaceBelow = 450 - 150 = 300
      // neededSpace = 120 + 16 = 136
      // 300 >= 136 → "down"
      expect(result).toBe('down')
    })

    it('modal perto do topo (dropdown cabe abaixo)', () => {
      const trigger = createMockElement(50)
      const modal = createMockElement(300)

      const result = detectDropdownPlacement(trigger, 120, modal)

      // spaceBelow = 300 - 50 = 250
      // neededSpace = 120 + 16 = 136
      // 250 >= 136 → "down"
      expect(result).toBe('down')
    })

    it('modal perto do fim (dropdown não cabe, abre para cima)', () => {
      const trigger = createMockElement(650)
      const modal = createMockElement(750)

      const result = detectDropdownPlacement(trigger, 120, modal)

      // spaceBelow = 750 - 650 = 100
      // neededSpace = 120 + 16 = 136
      // 100 < 136 → "up"
      expect(result).toBe('up')
    })

    it('lista com múltiplos itens, trigger no último item', () => {
      global.window.innerHeight = 1000
      const trigger = createMockElement(950) // Perto do fim
      const listContainer = createMockElement(980)

      const result = detectDropdownPlacement(trigger, 200, listContainer)

      // spaceBelow = 980 - 950 = 30
      // neededSpace = 200 + 16 = 216
      // 30 < 216 → "up"
      expect(result).toBe('up')
    })
  })

  // ─── Testes de comportamento com parâmetros defaults ──────────────────────

  describe('Parâmetros defaults', () => {
    beforeEach(() => {
      global.window = { innerHeight: 800 }
    })

    afterEach(() => {
      delete global.window
    })

    it('funciona sem containerElement (undefined vs null)', () => {
      const trigger = createMockElement(100)

      // Sem passar containerElement
      const result1 = detectDropdownPlacement(trigger, 120)
      expect(result1).toBe('down')

      // Passando null explicitamente
      const result2 = detectDropdownPlacement(trigger, 120, null)
      expect(result2).toBe('down')

      // Ambos devem retornar o mesmo
      expect(result1).toBe(result2)
    })
  })

  // ─── Testes de Viewports Extremos ─────────────────────────────────────────

  describe('Viewports extremos', () => {
    it('viewport mobile 375px (iPhone 6/7/8 width)', () => {
      global.window = { innerHeight: 667 }
      const trigger = createMockElement(150)

      const result = detectDropdownPlacement(trigger, 120)

      // spaceBelow = 667 - 150 = 517
      // neededSpace = 120 + 16 = 136
      // 517 >= 136 → "down"
      expect(result).toBe('down')
    })

    it('viewport mobile extremo 320px (iPhone SE width)', () => {
      global.window = { innerHeight: 568 }
      const trigger = createMockElement(100)

      const result = detectDropdownPlacement(trigger, 80)

      // spaceBelow = 568 - 100 = 468
      // neededSpace = 80 + 16 = 96
      // 468 >= 96 → "down"
      expect(result).toBe('down')
    })

    it('viewport tablet 768px (iPad width)', () => {
      global.window = { innerHeight: 1024 }
      const trigger = createMockElement(200)

      const result = detectDropdownPlacement(trigger, 120)

      // spaceBelow = 1024 - 200 = 824
      // neededSpace = 120 + 16 = 136
      // 824 >= 136 → "down"
      expect(result).toBe('down')
    })

    it('viewport desktop 1920px', () => {
      global.window = { innerHeight: 1080 }
      const trigger = createMockElement(300)

      const result = detectDropdownPlacement(trigger, 120)

      // spaceBelow = 1080 - 300 = 780
      // neededSpace = 120 + 16 = 136
      // 780 >= 136 → "down"
      expect(result).toBe('down')
    })

    it('viewport 4K (2160px height)', () => {
      global.window = { innerHeight: 2160 }
      const trigger = createMockElement(500)

      const result = detectDropdownPlacement(trigger, 120)

      // spaceBelow = 2160 - 500 = 1660
      // neededSpace = 120 + 16 = 136
      // 1660 >= 136 → "down"
      expect(result).toBe('down')
    })

    it('trigger perto do fim em 4K com dropdown grande', () => {
      global.window = { innerHeight: 2160 }
      const trigger = createMockElement(2050)

      const result = detectDropdownPlacement(trigger, 200)

      // spaceBelow = 2160 - 2050 = 110
      // neededSpace = 200 + 16 = 216
      // 110 < 216 → "up"
      expect(result).toBe('up')
    })

    it('smart watch viewport extremo 272px', () => {
      global.window = { innerHeight: 272 }
      const trigger = createMockElement(50)

      const result = detectDropdownPlacement(trigger, 60)

      // spaceBelow = 272 - 50 = 222
      // neededSpace = 60 + 16 = 76
      // 222 >= 76 → "down"
      expect(result).toBe('down')
    })
  })

  // ─── Testes de Posicionamento em Diferentes Alturas do Viewport ────────────

  describe('Posicionamento em diferentes alturas do viewport', () => {
    beforeEach(() => {
      global.window = { innerHeight: 800 }
    })

    afterEach(() => {
      delete global.window
    })

    it('trigger no topo (5% da altura)', () => {
      const trigger = createMockElement(40) // 5% de 800

      const result = detectDropdownPlacement(trigger, 120)

      expect(result).toBe('down')
      expect(trigger.getBoundingClientRect).toHaveBeenCalled()
    })

    it('trigger em 25% da altura', () => {
      const trigger = createMockElement(200) // 25% de 800

      const result = detectDropdownPlacement(trigger, 120)

      expect(result).toBe('down')
    })

    it('trigger em 50% da altura (meio da tela)', () => {
      const trigger = createMockElement(400) // 50% de 800

      const result = detectDropdownPlacement(trigger, 120)

      expect(result).toBe('down')
    })

    it('trigger em 75% da altura', () => {
      const trigger = createMockElement(600) // 75% de 800

      const result = detectDropdownPlacement(trigger, 120)

      // spaceBelow = 800 - 600 = 200
      // neededSpace = 120 + 16 = 136
      // 200 >= 136 → "down"
      expect(result).toBe('down')
    })

    it('trigger em 90% da altura (perto do fim)', () => {
      const trigger = createMockElement(720) // 90% de 800

      const result = detectDropdownPlacement(trigger, 120)

      // spaceBelow = 800 - 720 = 80
      // neededSpace = 120 + 16 = 136
      // 80 < 136 → "up"
      expect(result).toBe('up')
    })

    it('trigger em 95% da altura', () => {
      const trigger = createMockElement(760) // 95% de 800

      const result = detectDropdownPlacement(trigger, 120)

      // spaceBelow = 800 - 760 = 40
      // neededSpace = 120 + 16 = 136
      // 40 < 136 → "up"
      expect(result).toBe('up')
    })

    it('trigger no fim da tela (99%)', () => {
      const trigger = createMockElement(792) // 99% de 800

      const result = detectDropdownPlacement(trigger, 120)

      expect(result).toBe('up')
    })
  })

  // ─── Testes de Múltiplas Instâncias Simultâneas ───────────────────────────

  describe('Múltiplas instâncias simultâneas (getBoundingClientRect paralelo)', () => {
    beforeEach(() => {
      global.window = { innerHeight: 800 }
    })

    afterEach(() => {
      delete global.window
    })

    it('duas instâncias de dropdown em posições diferentes', () => {
      // Instância 1: trigger no topo
      const trigger1 = createMockElement(100)
      const container1 = createMockElement(400)

      // Instância 2: trigger perto do fim
      const trigger2 = createMockElement(700)
      const container2 = createMockElement(750)

      const result1 = detectDropdownPlacement(trigger1, 120, container1)
      const result2 = detectDropdownPlacement(trigger2, 120, container2)

      // Instância 1 deve abrir para baixo
      expect(result1).toBe('down')
      // Instância 2 deve abrir para cima
      expect(result2).toBe('up')

      // Ambas chamadas devem ter sido feitas
      expect(trigger1.getBoundingClientRect).toHaveBeenCalled()
      expect(trigger2.getBoundingClientRect).toHaveBeenCalled()
    })

    it('três instâncias simultâneas com containers diferentes', () => {
      const trigger1 = createMockElement(50)
      const container1 = createMockElement(300)

      const trigger2 = createMockElement(200)
      const container2 = createMockElement(600)

      const trigger3 = createMockElement(650)
      const container3 = createMockElement(750)

      const result1 = detectDropdownPlacement(trigger1, 120, container1)
      const result2 = detectDropdownPlacement(trigger2, 120, container2)
      const result3 = detectDropdownPlacement(trigger3, 120, container3)

      expect(result1).toBe('down')
      expect(result2).toBe('down')
      expect(result3).toBe('up')

      expect(trigger1.getBoundingClientRect).toHaveBeenCalledTimes(1)
      expect(trigger2.getBoundingClientRect).toHaveBeenCalledTimes(1)
      expect(trigger3.getBoundingClientRect).toHaveBeenCalledTimes(1)
    })

    it('múltiplas instâncias não contaminam resultado umas das outras', () => {
      const triggers = [
        createMockElement(100),
        createMockElement(200),
        createMockElement(300)
      ]
      const containers = [
        createMockElement(400),
        createMockElement(500),
        createMockElement(600)
      ]

      const results = triggers.map((trigger, idx) =>
        detectDropdownPlacement(trigger, 120, containers[idx])
      )

      // Todos devem retornar "down" (há espaço em todas)
      results.forEach(result => {
        expect(result).toBe('down')
      })

      // Cada trigger deve ter sido chamado exatamente uma vez
      triggers.forEach(trigger => {
        expect(trigger.getBoundingClientRect).toHaveBeenCalledTimes(1)
      })
    })

    it('alternância de instâncias em chamadas repetidas', () => {
      const trigger1 = createMockElement(100)
      const container1 = createMockElement(400)

      const trigger2 = createMockElement(700)
      const container2 = createMockElement(750)

      // Primeira chamada
      const result1a = detectDropdownPlacement(trigger1, 120, container1)
      const result2a = detectDropdownPlacement(trigger2, 120, container2)

      // Segunda chamada (simula reabertura)
      const result1b = detectDropdownPlacement(trigger1, 120, container1)
      const result2b = detectDropdownPlacement(trigger2, 120, container2)

      // Ambas as instâncias devem manter seus resultados
      expect(result1a).toBe(result1b)
      expect(result2a).toBe(result2b)

      // trigger1 chamado 2 vezes, trigger2 chamado 2 vezes
      expect(trigger1.getBoundingClientRect).toHaveBeenCalledTimes(2)
      expect(trigger2.getBoundingClientRect).toHaveBeenCalledTimes(2)
    })
  })

  // ─── Testes de Scroll Behavior dentro de Containers ────────────────────────

  describe('Scroll behavior dentro de containers', () => {
    beforeEach(() => {
      global.window = { innerHeight: 800 }
    })

    afterEach(() => {
      delete global.window
    })

    it('container com scroll ativo (altura menor que conteúdo)', () => {
      // Container com altura visual 400px mas conteúdo pode ser maior
      const trigger = createMockElement(300)
      const containerWithScroll = createMockElement(400) // Limite do container

      const result = detectDropdownPlacement(trigger, 120, containerWithScroll)

      // spaceBelow = 400 - 300 = 100
      // neededSpace = 120 + 16 = 136
      // 100 < 136 → "up"
      expect(result).toBe('up')
    })

    it('trigger em lista longa com scroll, item no meio', () => {
      // Simular: lista com 20 items, scroll ativo, trigger no item 10
      const trigger = createMockElement(300)
      const listContainer = createMockElement(600)

      const result = detectDropdownPlacement(trigger, 120, listContainer)

      // spaceBelow = 600 - 300 = 300
      // neededSpace = 120 + 16 = 136
      // 300 >= 136 → "down"
      expect(result).toBe('down')
    })

    it('trigger em lista longa com scroll, item no fim', () => {
      // Simular: lista com 20 items, scroll ativo, trigger no item 19
      const trigger = createMockElement(550)
      const listContainer = createMockElement(600)

      const result = detectDropdownPlacement(trigger, 120, listContainer)

      // spaceBelow = 600 - 550 = 50
      // neededSpace = 120 + 16 = 136
      // 50 < 136 → "up"
      expect(result).toBe('up')
    })

    it('modal com scroll interno, dropdown respeitando limites', () => {
      // Modal com 500px de altura, trigger em 400px
      const trigger = createMockElement(400)
      const modal = createMockElement(500)

      const result = detectDropdownPlacement(trigger, 150, modal)

      // spaceBelow = 500 - 400 = 100
      // neededSpace = 150 + 16 = 166
      // 100 < 166 → "up"
      expect(result).toBe('up')
    })

    it('container com overflow-hidden (scroll mascarado)', () => {
      // Container que aparentemente não tem scroll mas tem overflow hidden
      const trigger = createMockElement(250)
      const containerWithHiddenOverflow = createMockElement(350)

      const result = detectDropdownPlacement(trigger, 120, containerWithHiddenOverflow)

      // Função não diferencia overflow-hidden de normal, usa bounding rect
      // spaceBelow = 350 - 250 = 100
      // neededSpace = 120 + 16 = 136
      // 100 < 136 → "up"
      expect(result).toBe('up')
    })

    it('trigger no meio de container com scroll, espaço suficiente em ambas direções', () => {
      const trigger = createMockElement(300)
      const container = createMockElement(800)

      const result = detectDropdownPlacement(trigger, 120, container)

      // spaceBelow = 800 - 300 = 500
      // neededSpace = 120 + 16 = 136
      // 500 >= 136 → "down" (prefere baixo)
      expect(result).toBe('down')
    })

    it('nested containers: usa o container mais próximo passado como param', () => {
      // Simular estrutura: page > modal > inner-scroll
      const trigger = createMockElement(300)
      // Apenas o container passado é considerado, não há detecção de nesting
      const innerContainer = createMockElement(400)

      const result = detectDropdownPlacement(trigger, 120, innerContainer)

      // Usa apenas innerContainer, ignora page viewport
      // spaceBelow = 400 - 300 = 100
      // neededSpace = 120 + 16 = 136
      // 100 < 136 → "up"
      expect(result).toBe('up')
    })
  })
})
