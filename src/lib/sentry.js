import * as Sentry from '@sentry/react'

// Allowlist de campos permitidos no contexto — nunca incluir nome, email, celular, whatsapp
const SAFE_CONTEXT_KEYS = new Set(['function', 'schoolId', 'absenceId', 'teacherId', 'pendingUid', 'code', 'profile'])

/**
 * Captura exceção no Sentry com contexto adicional opcional.
 * Usa withScope para isolar o contexto e não vazar entre chamadas.
 * Em desenvolvimento (enabled: false no init), esta função é no-op.
 * Apenas campos da allowlist SAFE_CONTEXT_KEYS são enviados ao Sentry (LGPD).
 *
 * @param {unknown} err - Erro a capturar
 * @param {Record<string, unknown>} [context] - Contexto adicional (ex: { function, schoolId })
 */
export function captureException(err, context) {
  Sentry.withScope((scope) => {
    if (context) {
      if (context.function) scope.setTag('function', context.function)
      const safeContext = Object.fromEntries(
        Object.entries(context).filter(([k]) => SAFE_CONTEXT_KEYS.has(k))
      )
      scope.setContext('payload', safeContext)
    }
    Sentry.captureException(err)
  })
}
