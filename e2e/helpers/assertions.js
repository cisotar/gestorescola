/**
 * Assertion helpers para testes E2E com Playwright
 *
 * Convenção: cada helper lança erro do próprio expect() do Playwright,
 * permitindo que a falha apareça com stack trace e diff legível no relatório.
 */

import { expect } from '@playwright/test'
import { TIMEOUTS } from '../fixtures/timeouts.js'

/**
 * Verifica que um toast apareceu com a mensagem e tipo esperados.
 *
 * Detalhes de design:
 * - O Toast (src/components/ui/Toast.jsx) expõe `data-testid="toast"` no container
 *   e `data-testid="toast-message"` no <span> interno.
 * - O TIPO do toast NÃO é exposto via data-testid; é exposto via classe CSS
 *   `toast-${type}` (ex: `toast-ok`, `toast-warn`, `toast-err`, `toast-local`).
 *   Esta função verifica a presença dessa classe.
 * - A comparação de mensagem é case-insensitive e por substring.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} expectedMessage - substring esperada (case-insensitive)
 * @param {'ok'|'warn'|'err'|'local'} [type='ok'] - tipo visual do toast
 * @returns {Promise<void>}
 */
export async function assertToastAppears(page, expectedMessage, type = 'ok') {
  const toast = page.locator('[data-testid="toast"]')
  await expect(toast, `Toast não apareceu`).toBeVisible({
    timeout: TIMEOUTS.TOAST_TIMEOUT,
  })

  // Verifica classe que codifica o tipo (toast-ok | toast-warn | toast-err | toast-local)
  await expect(
    toast,
    `Toast não tem classe esperada 'toast-${type}'`
  ).toHaveClass(new RegExp(`\\btoast-${type}\\b`))

  // Verifica conteúdo de texto (substring, case-insensitive)
  const messageEl = toast.locator('[data-testid="toast-message"]')
  await expect(
    messageEl,
    `Toast não contém mensagem esperada '${expectedMessage}'`
  ).toContainText(new RegExp(escapeRegExp(expectedMessage), 'i'))
}

/**
 * Verifica que um modal está aberto e visível.
 *
 * O Modal padrão (src/components/ui/Modal.jsx) usa `data-testid="modal"`.
 * Modais customizados podem expor outros testids — passe-os explicitamente.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [modalTestId='modal'] - testid do container do modal
 * @returns {Promise<void>}
 */
export async function assertModalOpen(page, modalTestId = 'modal') {
  const modal = page.locator(`[data-testid="${modalTestId}"]`)
  await expect(
    modal,
    `Modal '${modalTestId}' não está visível`
  ).toBeVisible({ timeout: TIMEOUTS.MODAL_TIMEOUT })
}

/**
 * Verifica que um modal está fechado (não presente no DOM ou oculto).
 *
 * O componente Modal retorna `null` quando `open=false`, então o elemento
 * normalmente nem existe — `toHaveCount(0)` cobre o caso comum, mas
 * caímos para `toBeHidden()` se o elemento existir mas estiver oculto.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [modalTestId='modal']
 * @returns {Promise<void>}
 */
export async function assertModalClosed(page, modalTestId = 'modal') {
  const modal = page.locator(`[data-testid="${modalTestId}"]`)
  // Aguarda até que o elemento não esteja visível (count=0 OU hidden).
  await expect(async () => {
    const count = await modal.count()
    if (count === 0) return
    await expect(modal).toBeHidden()
  }).toPass({ timeout: TIMEOUTS.MODAL_CLOSE_TIMEOUT })
}

/**
 * Verifica que uma linha de tabela existe (visível) e contém os textos esperados.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} rowTestId - testid da linha (ex: 'professor-row-abc123')
 * @param {string[]} [expectedColumns=[]] - textos que devem aparecer na linha
 * @returns {Promise<void>}
 */
export async function assertTableRowExists(page, rowTestId, expectedColumns = []) {
  const row = page.locator(`[data-testid="${rowTestId}"]`)
  await expect(
    row,
    `Linha '${rowTestId}' não está visível`
  ).toBeVisible({ timeout: TIMEOUTS.TABLE_ROW_TIMEOUT })

  for (const text of expectedColumns) {
    await expect(
      row,
      `Linha '${rowTestId}' não contém texto esperado '${text}'`
    ).toContainText(new RegExp(escapeRegExp(text), 'i'))
  }
}

/**
 * Verifica que o usuário foi bloqueado por falta de acesso.
 *
 * A app tem três sinais distintos para "acesso negado", devido ao boot
 * assíncrono e à natureza multi-escola:
 *   1. Redirect para `/login` (boot detectou revogação/rejeição e expulsou).
 *   2. Redirect para `/no-school` (usuário autenticado mas sem escola ativa).
 *   3. Banner `data-testid="login-error-banner"` em /login (mensagem de erro).
 *
 * Esta função aceita QUALQUER um dos três sinais como evidência de bloqueio.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
export async function assertAccessDenied(page) {
  // Aguarda até que um dos três sinais apareça.
  await expect(async () => {
    const url = page.url()
    if (url.includes('/login') || url.includes('/no-school')) return

    const banner = page.locator('[data-testid="login-error-banner"]')
    if ((await banner.count()) > 0 && (await banner.isVisible())) return

    throw new Error(
      `assertAccessDenied: nenhum sinal de bloqueio detectado ` +
      `(url atual: ${url}, banner ausente)`
    )
  }).toPass({ timeout: TIMEOUTS.NAVIGATION_TIMEOUT })
}

/**
 * Escapa caracteres especiais de regex em uma string.
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
