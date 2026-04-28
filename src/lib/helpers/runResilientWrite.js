import { withTimeout } from './withTimeout'
import { mapFirestoreError } from './firestoreErrors'
import useNetworkStore from '../../store/useNetworkStore'

/**
 * Timeout default (15s) para qualquer escrita crítica. A spec de resiliência
 * define este teto para evitar que a UI fique "girando para sempre" quando
 * a rede oscila — o usuário recebe feedback determinístico em no máximo 15s.
 */
const DEFAULT_TIMEOUT_MS = 15000

/**
 * Wrapper único para toda escrita crítica do app (delete/aprovar/rejeitar
 * professor, criar escola, designar admin, suspender escola, etc.).
 *
 * Garante três comportamentos não-negociáveis:
 *   1. Aborta imediatamente se `useNetworkStore.online === false` — evita
 *      enfileiramento silencioso do Firestore offline persistence e
 *      devolve feedback claro pra UI.
 *   2. Aplica timeout (default 15s) via `withTimeout` para que rede travada
 *      não congele a operação.
 *   3. Traduz qualquer erro para `{ code, message }` em pt-br via
 *      `mapFirestoreError`, prontos pra `toast.error(message)`.
 *
 * Nunca lança. Sempre retorna o discriminated union:
 *   - `{ ok: true, data }`  — sucesso (data pode ser `undefined` em ops void)
 *   - `{ ok: false, code, message }` — falha (code estável, message pt-br)
 *
 * Códigos possíveis em falha:
 *   `'offline'` | `'timeout'` | `'unavailable'` | `'deadline-exceeded'` |
 *   `'permission-denied'` | `'not-found'` | `'cancelled'` |
 *   `'failed-precondition'` | `'aborted'` | `'unknown'`.
 *
 * @param {() => Promise<T>} operation - Função que executa a escrita.
 *   Será invocada APENAS se online. Pode retornar `void` ou um valor
 *   (ex: `addDoc` retorna `DocumentReference`).
 * @param {object} [options]
 * @param {number} [options.timeoutMs=15000] - Timeout em ms.
 * @param {string} [options.timeoutMessage] - Mensagem custom em caso de
 *   timeout (ex: `'Salvamento demorou demais'`). Se omitida, `mapFirestoreError`
 *   usa a padrão pt-br.
 * @returns {Promise<{ ok: true, data: T } | { ok: false, code: string, message: string }>}
 *
 * @template T
 *
 * @example
 * const result = await runResilientWrite(() => deleteDoc(ref))
 * if (!result.ok) {
 *   toast.error(result.message)
 *   return
 * }
 * toast.success('Removido!')
 */
export async function runResilientWrite(operation, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, timeoutMessage } = options

  // 1) Check offline ANTES de invocar a operação. Crítico: não chamar
  //    `operation()` evita que o Firestore enfileire a escrita silenciosamente.
  if (!useNetworkStore.getState().online) {
    return {
      ok: false,
      code: 'offline',
      message: 'Sem conexão — verifique sua internet e tente novamente.',
    }
  }

  // 2) Online: tenta executar com timeout.
  try {
    const data = await withTimeout(operation(), timeoutMs, timeoutMessage)
    return { ok: true, data }
  } catch (err) {
    // 3) Qualquer erro (timeout, Firestore code, lixo) é normalizado.
    const { code, message } = mapFirestoreError(err)
    return { ok: false, code, message }
  }
}
