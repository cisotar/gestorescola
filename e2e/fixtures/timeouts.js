/**
 * Constantes de timeout para testes E2E
 * Usadas em page.waitForSelector(), page.waitForNavigation(), etc.
 */

export const TIMEOUTS = {
  // Autenticação
  LOGIN_TIMEOUT: 10 * 1000,           // 10s para completar login (incluindo popup Google)
  LOGOUT_TIMEOUT: 5 * 1000,           // 5s para logout + redirect

  // Modais
  MODAL_TIMEOUT: 5 * 1000,            // 5s para modal aparecer/desaparecer
  MODAL_CLOSE_TIMEOUT: 3 * 1000,      // 3s para modal fechar após click

  // Navegação
  NAVIGATION_TIMEOUT: 8 * 1000,       // 8s para página carregar após click
  PAGE_LOAD_TIMEOUT: 10 * 1000,       // 10s para página inicial carregar

  // Elementos de UI
  ELEMENT_TIMEOUT: 3 * 1000,          // 3s para elemento aparecer (input, button, row)
  TOAST_TIMEOUT: 2 * 1000,            // 2s para toast aparecer
  TOAST_DISMISS_TIMEOUT: 4 * 1000,    // 4s para toast desaparecer automaticamente

  // Tabelas e Listas
  TABLE_ROW_TIMEOUT: 3 * 1000,        // 3s para linha aparecer em tabela
  LIST_ITEM_TIMEOUT: 2 * 1000,        // 2s para item aparecer em dropdown/lista

  // Assertions (Playwright expect timeout global)
  ASSERTION_TIMEOUT: 5 * 1000,        // 5s para expectativa (defined em playwright.config.js)

  // Fallback
  DEFAULT_TIMEOUT: 30 * 1000,         // 30s (timeout global do teste, conforme playwright.config.js)
}
