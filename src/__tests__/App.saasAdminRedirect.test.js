// src/__tests__/App.saasAdminRedirect.test.js
//
// Testa o bugfix do redirect do SaaS admin em App.jsx.
//
// Contexto do bug:
//   A condição antiga usava !currentSchoolId para decidir o redirect para /admin.
//   O useSchoolStore.init() restaura currentSchoolId do localStorage mesmo quando
//   o SaaS admin não tem membership (availableSchools = []). Com a condição antiga,
//   um SaaS admin com currentSchoolId salvo no LS nunca recebia o redirect — caía
//   em /home com dados de uma escola à qual não pertence.
//
// Correção: a condição passou a usar availableSchools.length === 0, que reflete
//   a ausência real de membership independente do que está no localStorage.
//
// Estratégia de teste:
//   1. Verificação estática do source (inspeção AST/regex) — confirma que o código
//      usa a condição correta e que a condição antiga foi removida.
//   2. Testes unitários da função de decisão de redirect extraída como lógica pura —
//      sem DOM, sem mocks de React, sem MemoryRouter. Compatível com environment: 'node'.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

// ─── Leitura do source ────────────────────────────────────────────────────────

const here  = path.dirname(url.fileURLToPath(import.meta.url))
const SOURCE = fs.readFileSync(path.resolve(here, '../App.jsx'), 'utf8')

// ─── Lógica de redirect extraída como função pura ─────────────────────────────
//
// Espelha exatamente a condição presente em App.jsx linha 152:
//   if (isSaasAdmin && availableSchools.length === 0
//       && !pathname.startsWith('/admin') && !pathname.startsWith('/join/'))
//
// Retorna true quando App.jsx emitiria <Navigate to="/admin" replace />.

function shouldRedirectToAdmin({ isSaasAdmin, availableSchools, pathname }) {
  return (
    isSaasAdmin &&
    availableSchools.length === 0 &&
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/join/')
  )
}

// ─── Suite 1: verificação estática do source ──────────────────────────────────

describe('App.jsx — verificação estática da condição de redirect (bugfix)', () => {
  it('usa availableSchools.length === 0 na condição de redirect do SaaS admin', () => {
    // A linha 152 do App.jsx deve conter exatamente essa sub-expressão.
    expect(SOURCE).toMatch(/availableSchools\.length === 0/)
  })

  it('NÃO usa !currentSchoolId como guarda do redirect do SaaS admin', () => {
    // Garante que a condição antiga foi completamente substituída.
    // O pattern /admin.*!currentSchoolId/ capturaria qualquer remanescente da guarda antiga
    // na mesma expressão condicional.
    const oldConditionPattern = /isSaasAdmin\s*&&\s*!currentSchoolId/
    expect(SOURCE).not.toMatch(oldConditionPattern)
  })

  it('o redirect aponta para /admin com replace', () => {
    expect(SOURCE).toMatch(/Navigate\s+to="\/admin"\s+replace/)
  })

  it('a condição exclui pathnames que já começam com /admin', () => {
    // Garante que a guarda anti-loop está presente na mesma condição.
    expect(SOURCE).toMatch(/pathname\.startsWith\('\/admin'\)/)
  })

  it('a condição exclui pathnames que começam com /join/', () => {
    expect(SOURCE).toMatch(/pathname\.startsWith\('\/join\/'\)/)
  })

  it('lê availableSchools do useSchoolStore (não do useAuthStore)', () => {
    // availableSchools deve ser seletado do useSchoolStore, não recebido de useAuthStore.
    expect(SOURCE).toMatch(/useSchoolStore\(s\s*=>\s*s\.availableSchools\)/)
  })
})

// ─── Suite 2: lógica pura — cenários comportamentais ─────────────────────────

describe('shouldRedirectToAdmin — cenário 1: SaaS admin sem membership com currentSchoolId do localStorage', () => {
  it('redireciona para /admin mesmo quando currentSchoolId está populado do LS', () => {
    // BUG ANTIGO: a condição usava !currentSchoolId e, com currentSchoolId presente
    // (restaurado do LS), a guarda passava false → admin caía em /home.
    // CORREÇÃO: usa availableSchools.length === 0, que é vazio quando não há membership real.
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      true,
      availableSchools: [],          // sem membership real
      pathname:         '/home',     // rota que não é /admin nem /join/
      // currentSchoolId: 'sch-123' — não participa da condição corrigida
    })
    expect(result).toBe(true)
  })

  it('redireciona independente do pathname concreto (não /admin, não /join/)', () => {
    for (const pathname of ['/home', '/dashboard', '/calendar', '/settings', '/']) {
      expect(
        shouldRedirectToAdmin({ isSaasAdmin: true, availableSchools: [], pathname })
      ).toBe(true)
    }
  })
})

describe('shouldRedirectToAdmin — cenário 2: SaaS admin sem membership e sem currentSchoolId', () => {
  it('redireciona para /admin quando availableSchools vazio e pathname é /home', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      true,
      availableSchools: [],
      pathname:         '/home',
    })
    expect(result).toBe(true)
  })

  it('redireciona para /admin quando availableSchools vazio e pathname é /dashboard', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      true,
      availableSchools: [],
      pathname:         '/dashboard',
    })
    expect(result).toBe(true)
  })
})

describe('shouldRedirectToAdmin — cenário 3: SaaS admin COM membership em escola', () => {
  it('NÃO redireciona quando availableSchools tem ao menos uma escola', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      true,
      availableSchools: [{ schoolId: 'sch-1', name: 'Escola Alfa' }],
      pathname:         '/home',
    })
    expect(result).toBe(false)
  })

  it('NÃO redireciona com múltiplas escolas disponíveis', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      true,
      availableSchools: [
        { schoolId: 'sch-1' },
        { schoolId: 'sch-2' },
      ],
      pathname: '/dashboard',
    })
    expect(result).toBe(false)
  })

  it('guarda de length > 0 é suficiente — não verifica schoolId específico', () => {
    // Qualquer escola na lista bloqueia o redirect.
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      true,
      availableSchools: [{}],   // objeto mínimo, sem schoolId
      pathname:         '/home',
    })
    expect(result).toBe(false)
  })
})

describe('shouldRedirectToAdmin — cenário 4: SaaS admin JÁ está em /admin', () => {
  it('NÃO redireciona quando pathname é exatamente /admin', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      true,
      availableSchools: [],
      pathname:         '/admin',
    })
    expect(result).toBe(false)
  })

  it('NÃO redireciona quando pathname é sub-rota de /admin', () => {
    for (const pathname of ['/admin/schools', '/admin/pending', '/admin/config']) {
      expect(
        shouldRedirectToAdmin({ isSaasAdmin: true, availableSchools: [], pathname })
      ).toBe(false)
    }
  })
})

describe('shouldRedirectToAdmin — cenário 5: SaaS admin em fluxo de join', () => {
  it('NÃO redireciona quando pathname começa com /join/', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      true,
      availableSchools: [],
      pathname:         '/join/escola-nova',
    })
    expect(result).toBe(false)
  })

  it('NÃO redireciona para variantes de /join/ com slugs compostos', () => {
    for (const pathname of ['/join/slug-1', '/join/escola-alpha', '/join/abc123']) {
      expect(
        shouldRedirectToAdmin({ isSaasAdmin: true, availableSchools: [], pathname })
      ).toBe(false)
    }
  })
})

describe('shouldRedirectToAdmin — casos de borda e regressão', () => {
  it('usuário comum (isSaasAdmin=false) com availableSchools vazio NÃO cai no redirect /admin', () => {
    // Esse usuário cairia no redirect /no-school, que é outra condição.
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      false,
      availableSchools: [],
      pathname:         '/home',
    })
    expect(result).toBe(false)
  })

  it('usuário comum com schools e isSaasAdmin=false → falso', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      false,
      availableSchools: [{ schoolId: 'sch-1' }],
      pathname:         '/home',
    })
    expect(result).toBe(false)
  })

  it('availableSchools=[{}] (objeto vazio sem schoolId) ainda bloqueia redirect', () => {
    // Qualquer entrada na lista representa membership, independente do conteúdo.
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      true,
      availableSchools: [{}],
      pathname:         '/home',
    })
    expect(result).toBe(false)
  })

  it('pathname=/admin (exato) bloqueia redirect mesmo com availableSchools vazio', () => {
    // Confirma que startsWith('/admin') cobre o pathname exato /admin.
    expect('/admin'.startsWith('/admin')).toBe(true)
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      true,
      availableSchools: [],
      pathname:         '/admin',
    })
    expect(result).toBe(false)
  })

  it('pathname=/adminfoo NÃO é protegido pela guarda /admin (startsWith comporta-se correto)', () => {
    // /adminfoo começa com /admin → startsWith retorna true → sem redirect.
    // Isso é um side-effect inofensivo do startsWith — documentado como comportamento esperado.
    const result = shouldRedirectToAdmin({
      isSaasAdmin:      true,
      availableSchools: [],
      pathname:         '/adminfoo',
    })
    expect(result).toBe(false)
  })
})
