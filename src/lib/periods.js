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
 * Calcula o saldo de tempo de um turno com base na configuração de período.
 *
 * @param {{ inicioPeriodo?: string, fimPeriodo?: string, inicio?: string,
 *           duracao?: number, qtd?: number, intervalos?: Array,
 *           gradeEspecial?: { itens?: Array<{ tipo: string, duracao?: number }> } }} cfg
 * @returns {{ tempoTotal: number, tempoLetivo: number, tempoResidual: number, tempoEspecial: number }} — valores em minutos
 */
export function calcSaldo(cfg) {
  const { inicioPeriodo, fimPeriodo, duracao = 0, qtd = 0, intervalos = [], gradeEspecial } = cfg ?? {}

  if (!inicioPeriodo || !fimPeriodo) {
    return { tempoTotal: 0, tempoLetivo: 0, tempoResidual: 0, tempoEspecial: 0 }
  }

  const tempoTotal    = toMin(fimPeriodo) - toMin(inicioPeriodo)
  const tempoLetivo   = (qtd || 0) * (duracao || 0)
  const somaIntervalos = intervalos.reduce((acc, iv) => acc + (iv.duracao || 0), 0)
  const tempoEspecial = (gradeEspecial?.itens ?? []).reduce((acc, item) => acc + (item.duracao ?? 0), 0)
  const tempoResidual = tempoTotal - tempoLetivo - somaIntervalos - tempoEspecial

  return { tempoTotal, tempoLetivo, tempoResidual, tempoEspecial }
}

/**
 * Valida se a grade especial cabe no tempo residual do turno.
 *
 * @param {Object} cfg   — objeto de configuração de período com `gradeEspecial`
 * @param {Object} saldo — retorno de `calcSaldo(cfg)`
 * @returns {{ valido: boolean, excedente: number, duracaoSugerida: number|null }}
 */
export function validarEncaixe(cfg, saldo) {
  if (!saldo || !cfg?.gradeEspecial) return { valido: true, excedente: 0, duracaoSugerida: null }

  if (saldo.tempoResidual >= 0) return { valido: true, excedente: 0, duracaoSugerida: null }

  const excedente = Math.abs(saldo.tempoResidual)

  const itens = cfg.gradeEspecial?.itens ?? []
  const qtdAulas = itens.filter(i => i.tipo === 'aula').length
  const somaIntervalosEspeciais = itens
    .filter(i => i.tipo === 'intervalo')
    .reduce((acc, i) => acc + (i.duracao ?? 0), 0)

  // Recupera o saldo disponível para aulas (antes de descontar a grade especial,
  // depois de descontar os intervalos especiais fixos)
  const tempoResidualParaAulas = saldo.tempoResidual + saldo.tempoEspecial - somaIntervalosEspeciais

  let duracaoSugerida = null
  if (qtdAulas > 0) {
    const sugestao = Math.floor(tempoResidualParaAulas / qtdAulas)
    if (sugestao >= 15) duracaoSugerida = sugestao
  }

  return { valido: false, excedente, duracaoSugerida }
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
  const raw = parts[2]
  if (raw.startsWith('e')) {
    return { segmentId: parts[0], turno: parts[1], aulaIdx: raw, isEspecial: true }
  }
  return { segmentId: parts[0], turno: parts[1], aulaIdx: Number(raw) }
}

export const makeSlot = (segId, turno, aulaIdx) => `${segId}|${turno}|${aulaIdx}`

// ─── Slots especiais ──────────────────────────────────────────────────────────
//
// Formato: "segmentId|turno|e{idx}"
//   - O prefixo "e" distingue slots de grade especial de aulas regulares.
//   - {idx} é 1-based e conta apenas os itens do tipo "aula" dentro de
//     gradeEspecial.itens (intervalos não são contados).
//   - Exemplos: "seg-fund|manha|e1", "seg-fund|manha|e2"
//   - parseSlot reconhece o prefixo "e" e retorna { ..., isEspecial: true }.
//   - resolveSlot retorna null para slots especiais — eles são resolvidos via
//     gerarPeriodosEspeciais(cfg).

/**
 * Cria um timeSlot no formato especial: "segId|turno|e{idx}".
 * @param {string} segId
 * @param {string} turno
 * @param {number} idx — índice 1-based entre as aulas da grade especial
 * @returns {string}
 */
export const makeEspecialSlot = (segId, turno, idx) => `${segId}|${turno}|e${idx}`

/**
 * Gera os slots de uma grade especial a partir de `cfg.gradeEspecial`.
 * Retorna array vazio se `gradeEspecial` estiver ausente ou sem itens.
 *
 * @param {Object} cfg — objeto de configuração de período (pode ter ou não gradeEspecial)
 * @param {Object} [cfg.gradeEspecial]
 * @param {string} cfg.gradeEspecial.inicioEspecial — horário de início no formato "HH:mm"
 * @param {Array}  cfg.gradeEspecial.itens — lista de { tipo, ordem, duracao, label? }
 * @returns {Array<{ label: string, inicio: string, fim: string, isEspecial: boolean, isIntervalo: boolean }>}
 */
export function gerarPeriodosEspeciais(cfg) {
  if (!cfg?.gradeEspecial) return []
  const { inicioEspecial, itens } = cfg.gradeEspecial
  if (!itens || itens.length === 0) return []

  const sorted = [...itens].sort((a, b) => a.ordem - b.ordem)
  let minutos = toMin(inicioEspecial || '00:00')
  let aulaCount = 0
  const result = []

  for (const item of sorted) {
    const duracao = item.duracao ?? 0
    const inicio = fromMin(minutos)
    const fim = fromMin(minutos + duracao)
    const isIntervalo = item.tipo === 'intervalo'

    if (!isIntervalo) {
      aulaCount += 1
    }

    const label = item.label || (isIntervalo ? 'Intervalo' : `Aula ${aulaCount}`)

    result.push({ label, inicio, fim, isEspecial: true, isIntervalo })
    minutos += duracao
  }

  return result
}

export function resolveSlot(timeSlot, periodConfigs) {
  const parsed = parseSlot(timeSlot)
  if (!parsed) return null
  if (parsed.isEspecial) return null
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
