const LS_KEY = 'gestao_v8_cache'

export function _saveToLS(state) {
  try {
    const { segments, periodConfigs, areas, subjects, teachers,
            schedules, absences, history, sharedSeries, workloadWarn, workloadDanger } = state
    localStorage.setItem(LS_KEY, JSON.stringify({
      data: {
        segments, periodConfigs, areas, subjects, teachers,
        sharedSeries: sharedSeries ?? [],
        schedules, absences: absences ?? [],
        history: history ?? [], workloadWarn, workloadDanger,
      },
      timestamp: Date.now()
    }))
  } catch {}
}

export function _loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { data: {}, timestamp: null }
    const cached = JSON.parse(raw)
    // Backward compat: se é objeto plano sem 'data' key, significa era old format
    if (!cached.data && !cached.timestamp) {
      return { data: cached, timestamp: null }
    }
    return cached
  } catch { return { data: {}, timestamp: null } }
}
