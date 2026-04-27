import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const SOURCE = fs.readFileSync(
  path.resolve(here, '../components/admin/SchoolTabBar.jsx'),
  'utf8'
)

describe('SchoolTabBar', () => {
  it('exporta componente como default', async () => {
    const mod = await import('../components/admin/SchoolTabBar.jsx')
    expect(typeof mod.default).toBe('function')
  })

  it('define threshold = 5 para fallback dropdown', () => {
    expect(SOURCE).toMatch(/MAX_TABS_BEFORE_DROPDOWN\s*=\s*5/)
    expect(SOURCE).toMatch(/schools\.length\s*>\s*MAX_TABS_BEFORE_DROPDOWN/)
  })

  it('renderiza Badge "Suspensa" para status suspended', () => {
    expect(SOURCE).toMatch(/status === 'suspended'/)
    expect(SOURCE).toMatch(/Suspensa/)
    expect(SOURCE).toMatch(/import Badge from/)
  })

  it('botão "Nova escola" sempre presente (texto literal)', () => {
    expect(SOURCE).toMatch(/Nova escola/)
  })

  it('aceita aliases onCreateClick e onCreate', () => {
    expect(SOURCE).toMatch(/onCreateClick/)
    expect(SOURCE).toMatch(/onCreate/)
  })

  it('dropdown usa input de busca (combobox) com filtro por name e slug', () => {
    expect(SOURCE).toMatch(/role="combobox"/)
    expect(SOURCE).toMatch(/role="listbox"/)
    expect(SOURCE).toMatch(/normalize\(s\.name\)\.includes/)
    expect(SOURCE).toMatch(/normalize\(s\.slug\)\.includes/)
  })

  it('exibe mensagem "Nenhuma escola encontrada" quando filtro não casa', () => {
    expect(SOURCE).toMatch(/Nenhuma escola encontrada/)
  })

  it('aceita escolas com schoolId ou id', () => {
    expect(SOURCE).toMatch(/s\?\.schoolId\s*\?\?\s*s\?\.id/)
  })
})
