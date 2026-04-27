import { describe, it, expect } from 'vitest'

describe('Badge', () => {
  it('exporta componente como default', async () => {
    const mod = await import('../components/ui/Badge.jsx')
    expect(typeof mod.default).toBe('function')
  })

  it('aceita variantes warn/ok/err/info sem quebrar', async () => {
    const Badge = (await import('../components/ui/Badge.jsx')).default
    // Valida que invocando o componente como função (renderização "cega") retorna
    // um elemento JSX coerente para cada variante; não depende de DOM real.
    for (const variant of ['warn', 'ok', 'err', 'info', 'desconhecida']) {
      const el = Badge({ variant, children: 'X' })
      expect(el).toBeTruthy()
      expect(el.props.className).toMatch(/rounded-full/)
      expect(el.props.children).toBe('X')
    }
  })

  it('variante warn aplica classes amber', async () => {
    const Badge = (await import('../components/ui/Badge.jsx')).default
    const el = Badge({ variant: 'warn', children: 'Suspensa' })
    expect(el.props.className).toMatch(/amber/)
  })
})
