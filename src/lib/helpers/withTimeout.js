/**
 * Envolve uma promise com um timeout máximo. Se a promise original não
 * resolver/rejeitar dentro de `ms` milissegundos, a promise retornada
 * rejeita com um objeto literal `{ code: 'timeout', message }`.
 *
 * Útil para proteger escritas críticas no Firestore contra travamentos
 * silenciosos quando a rede oscila — a spec de resiliência exige um
 * teto explícito (15s em escritas) para que a UI possa mostrar feedback
 * em vez de "girar para sempre".
 *
 * Garantias:
 * - Se a promise original resolver antes do timer, o timer é cancelado
 *   via `clearTimeout` (nada de handle pendente).
 * - Se a promise original rejeitar antes do timer, o timer também é
 *   cancelado e a rejection original propaga inalterada (preserva
 *   stack trace e código original).
 * - Em caso de timeout, rejeita com objeto literal `{ code, message }`
 *   — não com `new Error()` — para casar com o contrato consumido por
 *   `mapFirestoreError`.
 *
 * @param {Promise<T>} promise - Promise a ser envolvida.
 * @param {number} ms - Timeout em milissegundos. Valores não-positivos
 *   ou NaN seguem o comportamento de `setTimeout` (tratados como 0).
 * @param {string} [errorMessage='timeout'] - Mensagem usada na rejeição
 *   por timeout. Pode ser uma frase pt-br como `'Salvamento demorou demais'`.
 * @returns {Promise<T>} Promise que resolve com o valor de `promise` ou
 *   rejeita com `{ code: 'timeout', message: errorMessage }` / o erro original.
 *
 * @template T
 *
 * @example
 * // Caminho feliz: setDoc resolve em 800ms, timer de 15s é cancelado
 * await withTimeout(setDoc(ref, data), 15000, 'Salvamento demorou demais')
 *
 * @example
 * // Timeout: rede caiu, setDoc nunca resolve
 * try {
 *   await withTimeout(setDoc(ref, data), 15000, 'Salvamento demorou demais')
 * } catch (err) {
 *   // err === { code: 'timeout', message: 'Salvamento demorou demais' }
 * }
 */
export function withTimeout(promise, ms, errorMessage = 'timeout') {
  let timerId
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject({ code: 'timeout', message: errorMessage })
    }, ms)
  })

  // .finally garante clearTimeout tanto no resolve quanto no reject da
  // promise original, sem alterar o valor/erro propagado.
  const wrapped = promise.finally(() => clearTimeout(timerId))

  return Promise.race([wrapped, timeoutPromise])
}
