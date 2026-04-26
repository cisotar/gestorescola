export function _saveToLS(schoolId, state) {
  try {
    const key = `gestao_v9_cache_${schoolId}`
    const { segments, periodConfigs, areas, subjects, teachers,
            schedules, absences, history, sharedSeries, workloadWarn, workloadDanger } = state
    localStorage.setItem(key, JSON.stringify({
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

export function _loadFromLS(schoolId) {
  try {
    const key = `gestao_v9_cache_${schoolId}`
    const raw = localStorage.getItem(key)
    if (!raw) return { data: {}, timestamp: null }
    const cached = JSON.parse(raw)
    // Backward compat: se é objeto plano sem 'data' key, significa era old format
    if (!cached.data && !cached.timestamp) {
      return { data: cached, timestamp: null }
    }
    return cached
  } catch { return { data: {}, timestamp: null } }
}
