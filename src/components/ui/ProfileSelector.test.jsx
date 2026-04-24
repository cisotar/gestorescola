import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('ProfileSelector', () => {
  it('exporta componente como default', async () => {
    const mod = await import('./ProfileSelector.jsx')
    expect(typeof mod.default).toBe('function')
  })

  it('detectDropdownPlacement existe e é função', async () => {
    const mod = await import('../../lib/helpers/dropdown.js')
    expect(typeof mod.detectDropdownPlacement).toBe('function')
  })
})

describe('detectDropdownPlacement (integração com ProfileSelector)', () => {
  beforeEach(() => { global.window = { innerHeight: 800 } })
  afterEach(() => { delete global.window })

  it('retorna "down" ou "up"', async () => {
    const { detectDropdownPlacement } = await import('../../lib/helpers/dropdown.js')
    const trigger = { offsetParent: {}, getBoundingClientRect: () => ({ bottom: 100 }) }
    const result = detectDropdownPlacement(trigger, 120, null)
    expect(['down', 'up']).toContain(result)
  })

  it('retorna "down" para trigger no topo do modal', async () => {
    const { detectDropdownPlacement } = await import('../../lib/helpers/dropdown.js')
    const trigger = { offsetParent: {}, getBoundingClientRect: () => ({ bottom: 150 }) }
    const container = { offsetParent: {}, getBoundingClientRect: () => ({ bottom: 450 }) }
    // spaceBelow = 300 >= 136
    expect(detectDropdownPlacement(trigger, 120, container)).toBe('down')
  })

  it('retorna "up" para trigger no fim do modal', async () => {
    const { detectDropdownPlacement } = await import('../../lib/helpers/dropdown.js')
    const trigger = { offsetParent: {}, getBoundingClientRect: () => ({ bottom: 650 }) }
    const container = { offsetParent: {}, getBoundingClientRect: () => ({ bottom: 750 }) }
    // spaceBelow = 100 < 136
    expect(detectDropdownPlacement(trigger, 120, container)).toBe('up')
  })
})
