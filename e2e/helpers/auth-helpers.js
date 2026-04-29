/**
 * e2e/helpers/auth-helpers.js
 *
 * Helpers de autenticação para testes E2E rodando contra Firebase Emulators.
 *
 * Estratégia (substitui o helper antigo, que tentava forjar localStorage):
 *   1. globalSetup gera, via Admin SDK, um custom token para cada usuário
 *      do seed e salva em e2e/.auth/tokens.json.
 *   2. loginAs(page, email) lê o token e executa signInWithCustomToken
 *      DENTRO do bundle da app — a mesma instância de Firebase Auth que a
 *      app usa, apontada para o Auth Emulator (configurado em
 *      src/lib/firebase/index.js quando VITE_USE_FIREBASE_EMULATOR=true).
 *   3. Para isso, a app expõe `window.__e2eFirebase = { auth, signInWithCustomToken, signOut }`
 *      apenas em modo emulator (ver src/main.jsx ou hook equivalente). Caso
 *      essa expose não exista, este helper faz fallback usando o módulo
 *      `firebase/auth` carregado via dynamic import dentro da página.
 *
 * Importante: sem a expose oficial, o fallback cria uma SEGUNDA instância
 * de auth. O signIn funciona, mas a app pode não reconhecer. Por isso o
 * mecanismo `__e2eFirebase` é o caminho preferido.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { TIMEOUTS } from '../fixtures/timeouts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TOKENS_PATH = join(__dirname, '..', '.auth', 'tokens.json')

let cachedTokens = null

function loadTokens() {
  if (cachedTokens) return cachedTokens
  if (!existsSync(TOKENS_PATH)) {
    throw new Error(
      `[auth-helpers] tokens.json nao encontrado em ${TOKENS_PATH}. ` +
      `Rode globalSetup do Playwright (test:e2e) ou gere manualmente.`,
    )
  }
  cachedTokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'))
  return cachedTokens
}

function getToken(email) {
  const tokens = loadTokens()
  const token = tokens[email]
  if (!token) {
    throw new Error(`[auth-helpers] Sem custom token para "${email}". Usuarios disponiveis: ${Object.keys(tokens).join(', ')}`)
  }
  return token
}

/**
 * Faz login do usuario identificado por `email` usando custom token.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} email — ex.: "admin@test-escola.com"
 * @returns {Promise<void>}
 */
export async function loginAs(page, email) {
  const token = getToken(email)

  await page.goto('/', { waitUntil: 'domcontentloaded' })

  const exposed = await page
    .waitForFunction(() => Boolean(window.__e2eFirebase), null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false)

  if (exposed) {
    await page.evaluate(async (t) => {
      const { auth, signInWithCustomToken } = window.__e2eFirebase
      await signInWithCustomToken(auth, t)
    }, token)
  } else {
    // eslint-disable-next-line no-console
    console.warn('[loginAs] window.__e2eFirebase nao exposto — usando fallback dynamic import')
    await page.evaluate(async (t) => {
      const mod = await import('/node_modules/firebase/auth/dist/index.esm.js')
      const { getAuth, signInWithCustomToken, connectAuthEmulator } = mod
      const a = getAuth()
      try {
        connectAuthEmulator(a, 'http://localhost:9099', { disableWarnings: true })
      } catch (_) { /* ja conectado */ }
      await signInWithCustomToken(a, t)
    }, token)
  }

  try {
    await page.waitForURL(/\/(dashboard|home|pending)/, {
      timeout: TIMEOUTS.LOGIN_TIMEOUT || 15000,
    })
  } catch (_) {
    throw new Error(
      `[loginAs] Timeout: app nao redirecionou para /dashboard|/home|/pending apos signIn de ${email}. URL atual: ${page.url()}`,
    )
  }
}

/**
 * Faz logout do usuario atual via Firebase Auth.
 * @param {import('@playwright/test').Page} page
 */
export async function logout(page) {
  await page.evaluate(async () => {
    if (window.__e2eFirebase) {
      const { auth, signOut } = window.__e2eFirebase
      await signOut(auth)
    }
  })

  try {
    await page.waitForURL(/\/login/, { timeout: TIMEOUTS.LOGOUT_TIMEOUT || 10000 })
  } catch (_) {
    throw new Error(`[logout] App nao redirecionou para /login. URL atual: ${page.url()}`)
  }
}

/**
 * Le o role do usuario atualmente autenticado.
 * Tenta primeiro a store Zustand exposta em window (se a app expuser para e2e);
 * fallback: infere pela URL.
 * @param {import('@playwright/test').Page} page
 */
export async function getRole(page) {
  const fromStore = await page.evaluate(() => {
    if (window.__e2eAuthStore && typeof window.__e2eAuthStore.getState === 'function') {
      return window.__e2eAuthStore.getState().role || null
    }
    return null
  })
  if (fromStore) return fromStore

  const url = page.url()
  if (url.includes('/pending')) return 'pending'
  if (url.includes('/home')) return 'teacher'
  if (url.includes('/dashboard')) return 'coordinator'
  if (url.includes('/login')) return null
  return null
}

/**
 * Indica se ha usuario autenticado.
 * @param {import('@playwright/test').Page} page
 */
export async function isLoggedIn(page) {
  if (page.url().includes('/login')) return false
  return page.evaluate(() => {
    if (window.__e2eFirebase) {
      return Boolean(window.__e2eFirebase.auth.currentUser)
    }
    return false
  })
}
