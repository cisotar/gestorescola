/**
 * e2e/global-teardown.js
 *
 * Roda DEPOIS de toda a suíte E2E. Mata o emulator que o globalSetup subiu
 * (se houver PID registrado) e limpa artefatos.
 *
 * Se E2E_REUSE_EMULATOR=true, NÃO mata o emulator — apenas limpa os tokens.
 */

import { existsSync, readFileSync, unlinkSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PID_FILE = join(__dirname, '.emulator.pid')
const TOKENS_FILE = join(__dirname, '.auth', 'tokens.json')

function safeUnlink(path) {
  try { if (existsSync(path)) unlinkSync(path) } catch (_) { /* noop */ }
}

async function killProcessTree(pid) {
  // SIGINT graceful (firebase emulators desligam limpamente com Ctrl+C).
  try {
    process.kill(-pid, 'SIGINT')
  } catch (_) {
    try { process.kill(pid, 'SIGINT') } catch (_) { /* já morto */ }
  }

  // Aguarda até 10s o processo morrer.
  const t0 = Date.now()
  while (Date.now() - t0 < 10000) {
    try {
      process.kill(pid, 0) // 0 = só checar se existe
    } catch (_) {
      return // processo morreu
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  // Não morreu: SIGKILL.
  try { process.kill(-pid, 'SIGKILL') } catch (_) {
    try { process.kill(pid, 'SIGKILL') } catch (_) { /* noop */ }
  }
}

export default async function globalTeardown() {
  const reuse = process.env.E2E_REUSE_EMULATOR === 'true'

  if (!reuse && existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8'), 10)
    if (Number.isFinite(pid) && pid > 0) {
      // eslint-disable-next-line no-console
      console.log(`[global-teardown] Matando emulator PID=${pid}`)
      await killProcessTree(pid)
    }
  }

  safeUnlink(PID_FILE)
  safeUnlink(TOKENS_FILE)
  // eslint-disable-next-line no-console
  console.log('[global-teardown] Artefatos limpos.')
}
