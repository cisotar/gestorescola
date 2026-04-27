import { describe, it, expect } from 'vitest'

/**
 * Testes de smoke + verificação estática do código-fonte.
 *
 * O repositório não usa React Testing Library (ver ProfileSelector.test.jsx
 * para o padrão estabelecido). Como os componentes contêm hooks, não é
 * possível invocá-los diretamente; validamos por:
 *   1. Smoke import (carrega o módulo sem erro).
 *   2. Inspeção do source para confirmar regras condicionais (itens por status).
 */
describe('SchoolActionsMenu', () => {
  it('exporta componente como default', async () => {
    const mod = await import('../components/admin/SchoolActionsMenu.jsx')
    expect(typeof mod.default).toBe('function')
  })

  it('código-fonte contém regra condicional suspend vs reactivate por status', async () => {
    const fs = await import('node:fs')
    const url = await import('node:url')
    const path = await import('node:path')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const src = fs.readFileSync(
      path.resolve(here, '../components/admin/SchoolActionsMenu.jsx'),
      'utf8'
    )
    expect(src).toMatch(/effectiveStatus === 'suspended'/)
    expect(src).toMatch(/value: 'reactivate'/)
    expect(src).toMatch(/value: 'suspend'/)
    expect(src).toMatch(/value: 'designate'/)
    expect(src).toMatch(/value: 'delete'/)
  })

  it('código-fonte emite onAction com action e school', async () => {
    const fs = await import('node:fs')
    const url = await import('node:url')
    const path = await import('node:path')
    const here = path.dirname(url.fileURLToPath(import.meta.url))
    const src = fs.readFileSync(
      path.resolve(here, '../components/admin/SchoolActionsMenu.jsx'),
      'utf8'
    )
    expect(src).toMatch(/onAction\(value/)
  })
})
