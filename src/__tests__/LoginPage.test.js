import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const SOURCE = fs.readFileSync(
  path.resolve(here, '../pages/LoginPage.jsx'),
  'utf8'
)

describe('LoginPage — banner access-revoked (issue #485)', () => {
  it('lê loginError do useAuthStore', () => {
    expect(SOURCE).toMatch(/loginError/)
    expect(SOURCE).toMatch(/useAuthStore\s*\(\s*\)/)
  })

  it('lê state.error de location', () => {
    expect(SOURCE).toMatch(/location\.state\?\.error/)
  })

  it('mapeia loginError/stateError para mensagem (suporta access-revoked, access-rejected, no-access)', () => {
    // ERROR_MESSAGES expõe os códigos suportados; isAccessRevoked é true se houver match
    expect(SOURCE).toMatch(/ERROR_MESSAGES/)
    expect(SOURCE).toMatch(/'access-revoked'/)
    expect(SOURCE).toMatch(/'access-rejected'/)
    expect(SOURCE).toMatch(/'no-access'/)
  })

  it('renderiza banner condicional somente quando isAccessRevoked', () => {
    expect(SOURCE).toMatch(/\{isAccessRevoked\s*&&/)
  })

  it('banner contém o texto exato exigido pela spec', () => {
    expect(SOURCE).toMatch(
      /Seu acesso foi revogado pelo administrador desta escola\. Procure o coordenador para mais informações\./
    )
  })

  it('banner usa tokens de cor de erro do design system (border-red-200, bg-err-l, text-err)', () => {
    expect(SOURCE).toMatch(/border-red-200/)
    expect(SOURCE).toMatch(/bg-err-l/)
    expect(SOURCE).toMatch(/text-err/)
  })

  it('banner inclui ícone de alerta (svg) e role="alert" para acessibilidade', () => {
    expect(SOURCE).toMatch(/role="alert"/)
    // O SVG do ícone fica dentro do bloco do banner
    expect(SOURCE).toMatch(/<svg[\s\S]+?aria-hidden="true"/)
  })

  it('limpa state.redirect via navigate(replace: true) preservando o errorCode', () => {
    expect(SOURCE).toMatch(/navigate\(\s*location\.pathname/)
    expect(SOURCE).toMatch(/replace:\s*true/)
    expect(SOURCE).toMatch(/state:\s*\{\s*error:\s*errorCode\s*\}/)
  })

  it('não segue redirect quando isAccessRevoked é verdadeiro (defesa em profundidade)', () => {
    expect(SOURCE).toMatch(/!isAccessRevoked/)
  })

  it('exporta componente como default', async () => {
    const mod = await import('../pages/LoginPage.jsx')
    expect(typeof mod.default).toBe('function')
  })
})

describe('useAuthStore.loginError', () => {
  it('useAuthStore inicializa loginError como null', async () => {
    // Importa a definição do store sem rodar init() para evitar dependência
    // de Firebase real durante o teste unitário.
    const storeSrc = fs.readFileSync(
      path.resolve(here, '../store/useAuthStore.js'),
      'utf8'
    )
    expect(storeSrc).toMatch(/loginError:\s*null/)
  })

  it('login() limpa loginError antes da nova tentativa', () => {
    const storeSrc = fs.readFileSync(
      path.resolve(here, '../store/useAuthStore.js'),
      'utf8'
    )
    // Garantia: antes de signInWithPopup, o store reseta loginError para
    // que o banner suma assim que o usuário inicia o retry.
    expect(storeSrc).toMatch(/login:\s*async[\s\S]+?loginError:\s*null[\s\S]+?signInWithPopup/)
  })

  it('_resolveRole seta loginError = "access-revoked" em revogação total', () => {
    const storeSrc = fs.readFileSync(
      path.resolve(here, '../store/useAuthStore.js'),
      'utf8'
    )
    expect(storeSrc).toMatch(/loginError:\s*'access-revoked'/)
  })
})
