// ─── Helpers de tempo ─────────────────────────────────────────────────────────

export const toMin = s => {
  const [h, m] = (s || '00:00').split(':').map(Number)
  return h * 60 + (m || 0)
}

export const fromMin = m => {
  const h   = Math.floor(Math.abs(m) / 60) % 24
  const min = Math.abs(m) % 60
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`
}

// ─── Geração de períodos ──────────────────────────────────────────────────────

export function gerarPeriodos(cfg) {
  if (!cfg) return []
  const { inicio = '07:00', duracao = 50, qtd = 5, intervalos = [] } = cfg
  let minutos = toMin(inicio)
  const result = []

  for (let i = 1; i <= qtd; i++) {
    const ini = fromMin(minutos)
    const fim = fromMin(minutos + duracao)
    result.push({ aulaIdx: i, label: `${i}ª Aula`, inicio: ini, fim, isIntervalo: false })
    minutos += duracao

    intervalos.filter(iv => iv.apos === i).forEach(iv => {
      const ivIni = iv.inicio || fromMin(minutos)
      const ivMin = toMin(ivIni)
      const ivDur = iv.duracao || 20
      const ivFim = fromMin(ivMin + ivDur)
      result.push({ aulaIdx: null, label: 'Intervalo', inicio: ivIni, fim: ivFim,
        isIntervalo: true, duracao: ivDur })
      minutos = ivMin + ivDur
    })
  }

  return result
}

export function defaultCfg(turno = 'manha') {
  return {
    inicio:     turno === 'tarde' ? '13:00' : '07:00',
    duracao:    50,
    qtd:        5,
    intervalos: [{ apos: 3, duracao: 20 }],
  }
}

/**
 * Retorna a configuração de período para um segmento/turno.
 * O objeto retornado é a referência direta do store — campos extras como
 * `horariosEspeciais` e `intervalosEspeciais` são preservados por passthrough
 * sem nenhuma truncagem ou filtragem. Consumidores de UI podem ler esses campos
 * diretamente com fallback: `cfg.horariosEspeciais ?? []`.
 *
 * @param {string} segmentId
 * @param {string} turno
 * @param {Object} periodConfigs — `useAppStore.getState().periodConfigs`
 * @returns {{ inicio: string, duracao: number, qtd: number, intervalos: Array,
 *             horariosEspeciais?: import('../store/useAppStore').HorarioEspecial[],
 *             intervalosEspeciais?: import('../store/useAppStore').IntervaloEspecial[] }}
 */
export function getCfg(segmentId, turno, periodConfigs) {
  return periodConfigs?.[segmentId]?.[turno] ?? defaultCfg(turno)
}

export function getPeriodos(segmentId, turno, periodConfigs) {
  return gerarPeriodos(getCfg(segmentId, turno, periodConfigs))
}

export function getAulas(segmentId, turno, periodConfigs) {
  return getPeriodos(segmentId, turno, periodConfigs).filter(p => !p.isIntervalo)
}

export function parseSlot(timeSlot) {
  if (!timeSlot) return null
  const parts = timeSlot.split('|')
  if (parts.length < 3) return null
  return { segmentId: parts[0], turno: parts[1], aulaIdx: Number(parts[2]) }
}

export const makeSlot = (segId, turno, aulaIdx) => `${segId}|${turno}|${aulaIdx}`

export function resolveSlot(timeSlot, periodConfigs) {
  const parsed = parseSlot(timeSlot)
  if (!parsed) return null
  const { segmentId, turno, aulaIdx } = parsed
  return getAulas(segmentId, turno, periodConfigs).find(p => p.aulaIdx === aulaIdx) ?? null
}

export function slotLabel(timeSlot, periodConfigs) {
  const p = resolveSlot(timeSlot, periodConfigs)
  return p ? p.label : (timeSlot ?? '—')
}

export function slotFullLabel(timeSlot, periodConfigs) {
  const p = resolveSlot(timeSlot, periodConfigs)
  if (!p) return timeSlot ?? '—'
  return `${p.label} (${p.inicio}–${p.fim})`
}

export function slotsForTurma(segmentId, turno, periodConfigs) {
  return getAulas(segmentId, turno, periodConfigs).map(p => makeSlot(segmentId, turno, p.aulaIdx))
}
