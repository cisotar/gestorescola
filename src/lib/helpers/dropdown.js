/**
 * Detecta o melhor posicionamento para um dropdown (para cima ou para baixo)
 * com base no espaço disponível na tela ou container.
 *
 * @param {HTMLElement|null} triggerElement - Elemento trigger (botão que abre o dropdown)
 * @param {number} dropdownHeight - Altura estimada do dropdown em pixels
 * @param {HTMLElement|null} containerElement - Container com scroll (null = usa viewport)
 * @returns {"down" | "up"} - Posição recomendada para o dropdown
 *
 * @example
 * const placement = detectDropdownPlacement(buttonEl, 120, modalContent)
 * // Retorna "down" ou "up"
 */
export function detectDropdownPlacement(triggerElement, dropdownHeight, containerElement = null) {
  // ─── Validação do triggerElement ──────────────────────────────────────────
  // Se elemento não existe ou não está no DOM, retorna fallback seguro
  if (!triggerElement || !triggerElement.offsetParent) {
    return 'down'
  }

  // ─── Validação da altura do dropdown ──────────────────────────────────────
  // Se altura for 0 ou negativa, assume 1px mínimo para o cálculo
  const normalizedHeight = dropdownHeight > 0 ? dropdownHeight : 1

  // ─── Obter bounds do trigger ──────────────────────────────────────────────
  const triggerRect = triggerElement.getBoundingClientRect()
  const triggerBottom = triggerRect.bottom

  // ─── Obter limite inferior do container ───────────────────────────────────
  let containerBottom
  if (containerElement && containerElement.offsetParent) {
    // Container válido no DOM: usa seu bounding rect
    const containerRect = containerElement.getBoundingClientRect()
    containerBottom = containerRect.bottom
  } else {
    // Container null ou inválido: usa viewport como fallback
    containerBottom = window.innerHeight
  }

  // ─── Calcular espaço disponível abaixo do trigger ─────────────────────────
  const spaceBelow = containerBottom - triggerBottom
  const neededSpace = normalizedHeight + 16 // 16px de margem de segurança

  // ─── Retornar posicionamento ─────────────────────────────────────────────
  return spaceBelow >= neededSpace ? 'down' : 'up'
}
