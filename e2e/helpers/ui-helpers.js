/**
 * Funções de interação com UI
 * Abstraem seletores e padrões comuns de Playwright
 */

import { TIMEOUTS } from '../fixtures/timeouts.js'

/**
 * Preenche múltiplos campos de formulário
 * @param {Page} page
 * @param {Record<string, string|null>} fields
 *   Ex: { nome: "Prof Teste", email: "prof@test.com", materia: "Português" }
 * @returns {Promise<void>}
 *
 * Estratégia:
 * 1. Para cada chave, procura selector: input[name="key"] ou select[name="key"] ou textarea[name="key"]
 * 2. Se value === null: limpa o campo (value = "")
 * 3. Se value === "": pula (campo já vazio)
 * 4. Se field é <select>: usa selectOption() para suportar dropdown
 * 5. Se field é <input>: usa fill()
 * 6. Valida que cada field foi preenchido (verificar value = esperado)
 */
export async function fillForm(page, fields) {
  for (const [fieldName, value] of Object.entries(fields)) {
    // Procurar por input, select ou textarea com name = fieldName
    const input = page.locator(
      `input[name="${fieldName}"], select[name="${fieldName}"], textarea[name="${fieldName}"]`
    ).first()

    if (!(await input.count())) {
      throw new Error(`fillForm: campo '${fieldName}' não encontrado`)
    }

    const elementType = await input.evaluate(el => el.tagName.toLowerCase())

    if (value === null) {
      // Limpar o campo
      await input.fill('')
    } else if (value === '' || value === undefined) {
      // Pular campo vazio
      continue
    } else if (elementType === 'select') {
      // selectOption para <select>
      await input.selectOption(value)
    } else {
      // fill() para input/textarea
      await input.fill(String(value))
    }

    // Validar que o campo foi preenchido
    const actualValue = await input.inputValue()
    if (value !== null && value !== '' && actualValue !== String(value)) {
      throw new Error(`fillForm: campo '${fieldName}' não foi preenchido corretamente (esperado: ${value}, obtido: ${actualValue})`)
    }
  }
}

/**
 * Clica em elemento e aguarda navegação
 * @param {Page} page
 * @param {string} selector — CSS selector do botão/link
 * @param {string} expectedUrl — URL esperada após click (ex: "/dashboard")
 * @returns {Promise<void>}
 *
 * Fluxo:
 * 1. page.waitForNavigation() + page.click(selector) em paralelo
 * 2. Aguarda até 10s a mudança de URL
 * 3. Valida que nova URL contém expectedUrl
 * 4. Se timeout: lança Error com mensagem clara
 */
export async function clickAndWaitForNavigation(page, selector, expectedUrl) {
  // Aguardar em paralelo: navegação + clique
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: TIMEOUTS.NAVIGATION_TIMEOUT }),
    page.click(selector)
  ])

  // Validar que a URL mudou para o esperado
  const currentUrl = page.url()
  if (!currentUrl.includes(expectedUrl)) {
    throw new Error(
      `clickAndWaitForNavigation: URL não contém '${expectedUrl}' (obtido: ${currentUrl})`
    )
  }
}

/**
 * Extrai mensagem de toast exibida
 * @param {Page} page
 * @returns {Promise<string|null>} — texto do toast, ou null se não encontrar
 *
 * Estratégia:
 * 1. Procura elemento: div com classe "toast" ou [role="alert"]
 * 2. Extrai textContent
 * 3. Se não encontrar em 2s: retorna null (não lança erro)
 */
export async function getToastMessage(page) {
  try {
    const toast = page.locator('[role="alert"], .toast, .toast-message').first()
    await toast.waitFor({ state: 'visible', timeout: TIMEOUTS.TOAST_TIMEOUT })
    const message = await toast.textContent()
    return message ? message.trim() : null
  } catch (err) {
    // Toast não encontrado em tempo hábil
    return null
  }
}

/**
 * Fecha modal aberto (via Escape ou botão X)
 * @param {Page} page
 * @returns {Promise<void>}
 *
 * Fluxo:
 * 1. Aguarda modal estar visível (div com [role="dialog"] ou similar)
 * 2. Pressiona Escape key
 * 3. Aguarda modal desaparecer (waitForSelector com hidden: true)
 * 4. Timeout: 5s
 */
export async function closeModal(page) {
  // Procurar por modal visível
  const modal = page.locator('[role="dialog"], .modal').first()

  try {
    await modal.waitFor({ state: 'visible', timeout: TIMEOUTS.MODAL_TIMEOUT })
  } catch (err) {
    throw new Error('closeModal: nenhum modal visível encontrado')
  }

  // Pressionar Escape
  await page.keyboard.press('Escape')

  // Aguardar que modal desapareça
  try {
    await modal.waitFor({ state: 'hidden', timeout: TIMEOUTS.MODAL_CLOSE_TIMEOUT })
  } catch (err) {
    throw new Error(`closeModal: modal não fechou em ${TIMEOUTS.MODAL_CLOSE_TIMEOUT}ms`)
  }
}

/**
 * Seleciona opção em dropdown
 * @param {Page} page
 * @param {string} selector — selector do <select>
 * @param {string} optionText — texto da opção (match exato ou parcial)
 * @returns {Promise<void>}
 *
 * Fluxo:
 * 1. Clica no select para abrir (se necessário)
 * 2. Procura <option> com textContent contendo optionText
 * 3. Clica a opção
 * 4. Valida que select[value] mudou
 * 5. Se optionText não existe: lança Error
 */
export async function selectFromDropdown(page, selector, optionText) {
  const select = page.locator(selector).first()

  if (!(await select.count())) {
    throw new Error(`selectFromDropdown: selector '${selector}' não encontrado`)
  }

  // Procurar por <option> com textContent contendo optionText
  const option = select.locator(`option`).filter({
    hasText: new RegExp(optionText, 'i')
  }).first()

  if (!(await option.count())) {
    throw new Error(`selectFromDropdown: opção '${optionText}' não encontrada em ${selector}`)
  }

  // Usar selectOption do Playwright (mais robusto que clique manual)
  const optionValue = await option.getAttribute('value')
  await select.selectOption(optionValue || optionText)

  // Validar que select mudou
  const selectedValue = await select.inputValue()
  if (!selectedValue) {
    throw new Error(`selectFromDropdown: seleção não foi aplicada em ${selector}`)
  }
}

/**
 * Localiza linha em tabela pela coluna de nome
 * @param {Page} page
 * @param {string} name — nome do professor/ausência (busca em células)
 * @returns {Promise<Locator>} — locator da linha <tr>
 *
 * Fluxo:
 * 1. Procura <table> (pode haver múltiplas)
 * 2. Itera <tr> procurando por célula com texto === name (exact ou contains)
 * 3. Retorna o <tr>
 * 4. Se não encontrar em 3s: lança Error('Row not found: ' + name)
 */
export async function waitForTableRow(page, name) {
  // Procurar todas as linhas de tabela que contêm o nome
  const rows = page.locator('table tbody tr, table tr')

  const matchedRow = rows.filter({
    has: page.locator(`td, th`).filter({
      hasText: new RegExp(`^${name}$`, 'i')
    })
  }).first()

  try {
    await matchedRow.waitFor({ state: 'visible', timeout: TIMEOUTS.TABLE_ROW_TIMEOUT })
    return matchedRow
  } catch (err) {
    throw new Error(`waitForTableRow: linha com '${name}' não encontrada em ${TIMEOUTS.TABLE_ROW_TIMEOUT}ms`)
  }
}
