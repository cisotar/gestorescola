// src/__tests__/App.saasAdminRedirect.test.js
//
// Testa o redirect do SaaS admin em App.jsx.
//
// Contexto:
//   A condição usa !currentSchoolId para redirecionar o SaaS admin para /admin.
//   useSchoolStore.init() garante limpar o currentSchoolId do localStorage quando
//   o SaaS admin não tem membership, portanto !currentSchoolId é confiável aqui.
//   Quando o admin clica em uma escola (switchSchool), currentSchoolId é setado
//   e o redirect encerra — o admin acessa o app normal da escola.
//
// Estratégia de teste:
//   1. Verificação estática do source (inspeção regex) — confirma que o código
//      usa a condição correta.
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
// Espelha a condição presente em App.jsx:
//   if (isSaasAdmin && !currentSchoolId
//       && !pathname.startsWith('/admin') && !pathname.startsWith('/join/'))
//
// Retorna true quando App.jsx emitiria <Navigate to="/admin" replace />.

function shouldRedirectToAdmin({ isSaasAdmin, currentSchoolId, pathname }) {
  return (
    isSaasAdmin &&
    !currentSchoolId &&
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/join/')
  )
}

// ─── Suite 1: verificação estática do source ──────────────────────────────────

describe('App.jsx — verificação estática da condição de redirect (bugfix)', () => {
  it('usa !currentSchoolId na condição de redirect do SaaS admin', () => {
    expect(SOURCE).toMatch(/isSaasAdmin\s*&&\s*!currentSchoolId/)
  })

  it('o redirect aponta para /admin com replace', () => {
    expect(SOURCE).toMatch(/Navigate\s+to="\/admin"\s+replace/)
  })

  it('a condição exclui pathnames que já começam com /admin', () => {
    expect(SOURCE).toMatch(/pathname\.startsWith\('\/admin'\)/)
  })

  it('a condição exclui pathnames que começam com /join/', () => {
    expect(SOURCE).toMatch(/pathname\.startsWith\('\/join\/'\)/)
  })

  it('lê availableSchools do useSchoolStore (não do useAuthStore)', () => {
    expect(SOURCE).toMatch(/useSchoolStore\(s\s*=>\s*s\.availableSchools\)/)
  })
})

// ─── Suite 2: lógica pura — cenários comportamentais ─────────────────────────

describe('shouldRedirectToAdmin — cenário 1: SaaS admin sem escola selecionada', () => {
  it('redireciona para /admin quando currentSchoolId é null', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:     true,
      currentSchoolId: null,
      pathname:        '/home',
    })
    expect(result).toBe(true)
  })

  it('redireciona independente do pathname concreto (não /admin, não /join/)', () => {
    for (const pathname of ['/home', '/dashboard', '/calendar', '/settings', '/']) {
      expect(
        shouldRedirectToAdmin({ isSaasAdmin: true, currentSchoolId: null, pathname })
      ).toBe(true)
    }
  })
})

describe('shouldRedirectToAdmin — cenário 2: SaaS admin COM escola selecionada', () => {
  it('NÃO redireciona quando currentSchoolId está setado', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:     true,
      currentSchoolId: 'sch-default',
      pathname:        '/home',
    })
    expect(result).toBe(false)
  })

  it('NÃO redireciona com qualquer schoolId não-nulo', () => {
    for (const schoolId of ['sch-1', 'sch-abc', 'escola-nova']) {
      expect(
        shouldRedirectToAdmin({ isSaasAdmin: true, currentSchoolId: schoolId, pathname: '/home' })
      ).toBe(false)
    }
  })
})

describe('shouldRedirectToAdmin — cenário 3: SaaS admin visitando escola', () => {
  it('NÃO redireciona quando currentSchoolId foi setado via switchSchool', () => {
    // Quando o admin clica num card de escola, switchSchool() seta currentSchoolId.
    // O redirect deve encerrar para permitir acesso ao app da escola.
    const result = shouldRedirectToAdmin({
      isSaasAdmin:     true,
      currentSchoolId: 'sch-default',
      pathname:        '/home',
    })
    expect(result).toBe(false)
  })

  it('NÃO redireciona independente do pathname quando escola está selecionada', () => {
    for (const pathname of ['/home', '/dashboard', '/settings', '/cargahoraria']) {
      expect(
        shouldRedirectToAdmin({ isSaasAdmin: true, currentSchoolId: 'sch-1', pathname })
      ).toBe(false)
    }
  })

  it('sem escola selecionada mas schoolId vazio string também redireciona', () => {
    // String vazia é falsy — equivale a não ter escola selecionada.
    const result = shouldRedirectToAdmin({
      isSaasAdmin:     true,
      currentSchoolId: '',
      pathname:        '/home',
    })
    expect(result).toBe(true)
  })
})

describe('shouldRedirectToAdmin — cenário 4: SaaS admin JÁ está em /admin', () => {
  it('NÃO redireciona quando pathname é exatamente /admin', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:     true,
      currentSchoolId: null,
      pathname:        '/admin',
    })
    expect(result).toBe(false)
  })

  it('NÃO redireciona quando pathname é sub-rota de /admin', () => {
    for (const pathname of ['/admin/schools', '/admin/pending', '/admin/config']) {
      expect(
        shouldRedirectToAdmin({ isSaasAdmin: true, currentSchoolId: null, pathname })
      ).toBe(false)
    }
  })
})

describe('shouldRedirectToAdmin — cenário 5: SaaS admin em fluxo de join', () => {
  it('NÃO redireciona quando pathname começa com /join/', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:     true,
      currentSchoolId: null,
      pathname:        '/join/escola-nova',
    })
    expect(result).toBe(false)
  })

  it('NÃO redireciona para variantes de /join/ com slugs compostos', () => {
    for (const pathname of ['/join/slug-1', '/join/escola-alpha', '/join/abc123']) {
      expect(
        shouldRedirectToAdmin({ isSaasAdmin: true, currentSchoolId: null, pathname })
      ).toBe(false)
    }
  })
})

describe('shouldRedirectToAdmin — casos de borda e regressão', () => {
  it('usuário comum (isSaasAdmin=false) sem escola NÃO cai no redirect /admin', () => {
    // Esse usuário cairia no redirect /no-school, que é outra condição.
    const result = shouldRedirectToAdmin({
      isSaasAdmin:     false,
      currentSchoolId: null,
      pathname:        '/home',
    })
    expect(result).toBe(false)
  })

  it('usuário comum com escola e isSaasAdmin=false → não redireciona', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:     false,
      currentSchoolId: 'sch-1',
      pathname:        '/home',
    })
    expect(result).toBe(false)
  })

  it('pathname=/admin (exato) bloqueia redirect mesmo sem escola', () => {
    expect('/admin'.startsWith('/admin')).toBe(true)
    const result = shouldRedirectToAdmin({
      isSaasAdmin:     true,
      currentSchoolId: null,
      pathname:        '/admin',
    })
    expect(result).toBe(false)
  })

  it('pathname=/adminfoo também é protegido pela guarda /admin (startsWith)', () => {
    const result = shouldRedirectToAdmin({
      isSaasAdmin:     true,
      currentSchoolId: null,
      pathname:        '/adminfoo',
    })
    expect(result).toBe(false)
  })
})
