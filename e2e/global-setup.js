/**
 * e2e/global-setup.js
 *
 * Executado UMA VEZ antes de toda a suíte E2E. Responsável por:
 *   1. (opcional) Spawn do `firebase emulators:start --only auth,firestore,functions`
 *      em background, exceto se E2E_REUSE_EMULATOR=true.
 *   2. Healthcheck dos emulators (auth:9099, firestore:8080, functions:5001).
 *   3. Rodar o seed (idempotente).
 *   4. Gerar custom tokens via Admin SDK e salvar em e2e/.auth/tokens.json.
 *   5. Salvar PID em e2e/.emulator.pid para o teardown matar o processo.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, openSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const AUTH_DIR = join(__dirname, '.auth')
const TOKENS_FILE = join(AUTH_DIR, 'tokens.json')
const PID_FILE = join(__dirname, '.emulator.pid')
const EMULATOR_LOG = join(__dirname, '.emulator.log')

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'saasgestaoescolar-test'
const PORTS = {
  auth: 9099,
  firestore: 8080,
  functions: 5001,
}
const HEALTHCHECK_TIMEOUT_MS = 90 * 1000
const HEALTHCHECK_INTERVAL_MS = 1000

async function isPortAlive(port) {
  try {
    const res = await fetch(`http://localhost:${port}/`, { method: 'GET' })
    return res.status < 500
  } catch (_) {
    return false
  }
}

async function waitForEmulators() {
  const t0 = Date.now()
  while (Date.now() - t0 < HEALTHCHECK_TIMEOUT_MS) {
    const checks = await Promise.all(
      Object.values(PORTS).map((p) => isPortAlive(p)),
    )
    if (checks.every(Boolean)) return
    await new Promise((r) => setTimeout(r, HEALTHCHECK_INTERVAL_MS))
  }
  throw new Error(
    `[global-setup] Timeout (${HEALTHCHECK_TIMEOUT_MS}ms) aguardando emulators. Veja ${EMULATOR_LOG}.`,
  )
}

function spawnEmulator() {
  // detached + ignored stdio + own session: o processo continua vivo se este
  // node sair antes do teardown e podemos matar via PID.
  const out = openSync(EMULATOR_LOG, 'a')
  const err = openSync(EMULATOR_LOG, 'a')
  const child = spawn(
    'firebase',
    [
      'emulators:start',
      '--only', 'auth,firestore,functions',
      '--project', PROJECT_ID,
    ],
    {
      cwd: REPO_ROOT,
      detached: true,
      stdio: ['ignore', out, err],
      env: { ...process.env, GCLOUD_PROJECT: PROJECT_ID },
    },
  )
  child.unref()
  writeFileSync(PID_FILE, String(child.pid), 'utf8')
  return child.pid
}

export default async function globalSetup() {
  mkdirSync(AUTH_DIR, { recursive: true })

  const reuse = process.env.E2E_REUSE_EMULATOR === 'true'
  const allAlive = (await Promise.all(Object.values(PORTS).map(isPortAlive))).every(Boolean)

  if (reuse) {
    if (!allAlive) {
      throw new Error(
        '[global-setup] E2E_REUSE_EMULATOR=true mas emulator nao esta rodando. ' +
        'Inicie com: npm run emulator:start',
      )
    }
    // eslint-disable-next-line no-console
    console.log('[global-setup] Reusando emulator existente (E2E_REUSE_EMULATOR=true)')
  } else if (allAlive) {
    // eslint-disable-next-line no-console
    console.log('[global-setup] Emulator ja esta rodando — pulando spawn (PID nao sera registrado)')
  } else {
    // eslint-disable-next-line no-console
    console.log('[global-setup] Subindo emulator em background...')
    const pid = spawnEmulator()
    // eslint-disable-next-line no-console
    console.log(`[global-setup] Emulator PID=${pid}, log=${EMULATOR_LOG}`)
    await waitForEmulators()
    // eslint-disable-next-line no-console
    console.log('[global-setup] Emulator pronto.')
  }

  // Re-confirmar healthcheck (caso reuse esteja ativo, apenas valida).
  await waitForEmulators()

  // Garantir env vars apontadas para o emulator no contexto Node do seed/Admin SDK.
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || `localhost:${PORTS.auth}`
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || `localhost:${PORTS.firestore}`
  process.env.GCLOUD_PROJECT = PROJECT_ID
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID

  // Rodar seed + gerar tokens.
  const { seedAll, generateCustomTokens } = await import('../scripts/seed-emulator.js')
  const result = await seedAll()
  // eslint-disable-next-line no-console
  console.log('[global-setup] Seed:', result)

  const tokens = await generateCustomTokens()
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8')
  // eslint-disable-next-line no-console
  console.log(`[global-setup] ${Object.keys(tokens).length} custom tokens salvos em ${TOKENS_FILE}`)
}
