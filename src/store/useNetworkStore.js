import { create } from 'zustand'

// Estado global de conectividade do navegador.
// Single source of truth sincronizado com `navigator.onLine` via listeners
// `online`/`offline` em `window`. Consumido por `OfflineBanner` (UI) e
// `runResilientWrite` (lógica de abortar escritas offline).
//
// Default: lê `navigator.onLine` no momento da criação do store. Em SSR /
// ambiente sem `navigator`, assume `true` (otimista — `init()` corrige na
// montagem do app se houver `window`).
const useNetworkStore = create((set, get) => ({
  online:
    typeof navigator !== 'undefined' && 'onLine' in navigator
      ? navigator.onLine
      : true,

  // Função unsubscribe acumulada — cancelada antes de cada novo `init()` para
  // garantir idempotência (HMR / StrictMode em dev rodam efeitos duas vezes).
  _unsubListeners: null,

  // ─── Init ──────────────────────────────────────────────────────────────────
  // Registra listeners `online`/`offline` em `window`. Idempotente: se já há
  // listeners ativos, cancela-os antes de registrar a nova rodada.
  // Retorna função `unsubscribe` que remove os listeners e zera o slot.
  init: () => {
    // Guard SSR / ambiente sem window (Node puro). Mantém `online: true`
    // (default otimista) e devolve no-op para o chamador.
    if (typeof window === 'undefined') return () => {}

    // Idempotência: cancela subscribe anterior antes de criar novo.
    get()._unsubListeners?.()

    const handleOnline = () => set({ online: true })
    const handleOffline = () => set({ online: false })

    try {
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    } catch (e) {
      console.warn('[useNetworkStore] addEventListener falhou:', e)
    }

    // Atualiza o estado para o valor corrente de `navigator.onLine` no momento
    // do init — cobre o caso em que `online` foi inicializado em SSR/teste e
    // só agora estamos no browser real.
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      set({ online: navigator.onLine })
    }

    const unsubscribe = () => {
      try {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      } catch (e) {
        console.warn('[useNetworkStore] removeEventListener falhou:', e)
      }
      set({ _unsubListeners: null })
    }

    set({ _unsubListeners: unsubscribe })
    return unsubscribe
  },
}))

export default useNetworkStore
