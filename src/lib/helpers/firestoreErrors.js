/**
 * Mapeia erros do Firestore (e do helper `withTimeout`) para um objeto
 * `{ code, message }` com mensagens amigáveis em pt-br, prontas para
 * exibição em toasts/UI.
 *
 * Centralizar este mapeamento evita strings duplicadas espalhadas pelos
 * call-sites e garante uniformidade de tom. Cobre os códigos do Firestore
 * mais comuns no app + o código custom `'timeout'` produzido por
 * `withTimeout`. Quando o erro não tem `code` mas a `message` indica
 * problema de rede (regex), normaliza para `'unavailable'`.
 *
 * Garantias:
 * - Nunca lança. `null`, `undefined`, `{}` e códigos desconhecidos caem
 *   no default genérico.
 * - Sempre retorna `{ code: string, message: string }`.
 * - Mensagens em pt-br, sem jargão técnico.
 *
 * @param {{ code?: string, message?: string } | null | undefined} err
 *   Erro original (objeto Firestore, Error nativo, ou objeto literal
 *   produzido por `withTimeout`).
 * @returns {{ code: string, message: string }} Objeto com código
 *   normalizado e mensagem pt-br.
 *
 * @example
 * try { await op() } catch (e) {
 *   const { code, message } = mapFirestoreError(e)
 *   toast.error(message)
 * }
 *
 * @example
 * mapFirestoreError({ code: 'permission-denied' })
 * // → { code: 'permission-denied', message: 'Sem permissão para executar esta operação.' }
 *
 * @example
 * mapFirestoreError(new Error('network request failed'))
 * // → { code: 'unavailable', message: 'Conexão instável. Verifique sua internet e tente novamente.' }
 *
 * @example
 * mapFirestoreError(null)
 * // → { code: 'unknown', message: 'Não foi possível concluir a operação. Tente novamente.' }
 */

const MESSAGES = {
  unavailable: 'Conexão instável. Verifique sua internet e tente novamente.',
  'deadline-exceeded': 'A operação demorou demais. Tente novamente.',
  'permission-denied': 'Sem permissão para executar esta operação.',
  'not-found': 'Registro não encontrado.',
  cancelled: 'Operação cancelada.',
  'failed-precondition':
    'Operação não permitida no estado atual. Recarregue a página e tente novamente.',
  timeout: 'A operação demorou demais. Tente novamente.',
  aborted: 'Operação interrompida. Tente novamente.',
  unknown: 'Não foi possível concluir a operação. Tente novamente.',
}

const NETWORK_REGEX = /network|fetch|offline|timed out/i

export function mapFirestoreError(err) {
  const code = err?.code

  switch (code) {
    case 'unavailable':
      return { code: 'unavailable', message: MESSAGES.unavailable }
    case 'deadline-exceeded':
      return { code: 'deadline-exceeded', message: MESSAGES['deadline-exceeded'] }
    case 'permission-denied':
      return { code: 'permission-denied', message: MESSAGES['permission-denied'] }
    case 'not-found':
      return { code: 'not-found', message: MESSAGES['not-found'] }
    case 'cancelled':
      return { code: 'cancelled', message: MESSAGES.cancelled }
    case 'failed-precondition':
      return {
        code: 'failed-precondition',
        message: MESSAGES['failed-precondition'],
      }
    case 'timeout':
      // `withTimeout` produz uma mensagem custom (ex: "Salvamento demorou demais").
      // Preservamos quando truthy; senão caímos no padrão pt-br.
      return {
        code: 'timeout',
        message: err?.message || MESSAGES.timeout,
      }
    case 'aborted':
      return { code: 'aborted', message: MESSAGES.aborted }
    default:
      // Sem `code` reconhecido — tenta inferir network errors pela mensagem.
      if (typeof err?.message === 'string' && NETWORK_REGEX.test(err.message)) {
        return { code: 'unavailable', message: MESSAGES.unavailable }
      }
      return { code: 'unknown', message: MESSAGES.unknown }
  }
}
