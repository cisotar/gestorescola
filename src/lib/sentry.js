import * as Sentry from '@sentry/react'

/**
 * Captura exceção no Sentry com contexto adicional opcional.
 * Usa withScope para isolar o contexto e não vazar entre chamadas.
 * Em desenvolvimento (enabled: false no init), esta função é no-op.
 *
 * @param {unknown} err - Erro a capturar
 * @param {Record<string, unknown>} [context] - Contexto adicional (ex: { functionName, schoolId })
 */
export function captureException(err, context) {
  Sentry.withScope((scope) => {
    if (context) {
      if (context.function) scope.setTag('function', context.function)
      scope.setContext('payload', context)
    }
    Sentry.captureException(err)
  })
}
