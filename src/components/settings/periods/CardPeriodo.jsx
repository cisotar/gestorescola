// CardPeriodo — card de configuração de período por segmento, usado em TabPeriods

import { useState } from 'react'
import { getCfg, calcSaldo, validarEncaixe, toMin } from '../../../lib/periods'
import { buildPreviewItems } from '../../../lib/settings'
import { toast } from '../../../hooks/useToast'
import TurnoSelector from '../shared/TurnoSelector'
import CamposGradeEspecial from './CamposGradeEspecial'
import PreviewVertical from './PreviewVertical'
import SaldoTempo from './SaldoTempo'
import AlertaImpeditivoModal from './AlertaImpeditivoModal'

export default function CardPeriodo({ seg, store }) {
  const turno   = seg.turno ?? 'manha'
  const cfg     = getCfg(seg.id, turno, store.periodConfigs)

  const [localInicio, setLocalInicio] = useState(cfg.inicioPeriodo ?? '')
  const [localFim, setLocalFim]       = useState(cfg.fimPeriodo ?? '')
  const [localGradeEspecial, setLocalGradeEspecial] = useState(
    cfg.gradeEspecial ?? { inicioEspecial: '', duracaoAula: 40, qtd: 1, itens: [] }
  )
  const [alertaAberto, setAlertaAberto] = useState(false)
  const [alertaDados, setAlertaDados]   = useState({ excedente: 0, duracaoSugerida: null })

  const cfgLocal = { ...cfg, inicioPeriodo: localInicio, fimPeriodo: localFim, gradeEspecial: localGradeEspecial }
  const saldo    = calcSaldo(cfgLocal)
  const preview  = buildPreviewItems(cfgLocal)

  const update = (field, val) =>
    store.savePeriodCfg(seg.id, turno, { ...cfg, [field]: val })

  const saveLimiteTurno = () =>
    store.savePeriodCfg(seg.id, turno, { ...cfg, inicioPeriodo: localInicio, fimPeriodo: localFim })

  const saveGradeEspecial = () => {
    const v = validarEncaixe(cfgLocal, saldo)
    if (!v.valido) {
      setAlertaDados({ excedente: v.excedente, duracaoSugerida: v.duracaoSugerida })
      setAlertaAberto(true)
      return
    }
    const cfgParaSalvar = {
      ...cfgLocal,
      gradeEspecial: {
        ...localGradeEspecial,
        itens: (localGradeEspecial.itens ?? []).filter(i => i.tipo !== 'aula'),
      },
    }
    store.savePeriodCfg(seg.id, turno, cfgParaSalvar)
    toast('Configuração salva', 'ok')
  }

  const addIntervalo = () => {
    const novos = [...(cfg.intervalos ?? []), { apos: 1, duracao: 20 }]
    store.savePeriodCfg(seg.id, turno, { ...cfg, intervalos: novos })
  }

  const removeIntervalo = (idx) => {
    const novos = (cfg.intervalos ?? []).filter((_, i) => i !== idx)
    store.savePeriodCfg(seg.id, turno, { ...cfg, intervalos: novos })
  }

  const updateIntervalo = (idx, field, val) => {
    const novos = (cfg.intervalos ?? []).map((iv, i) =>
      i === idx ? { ...iv, [field]: val } : iv
    )
    store.savePeriodCfg(seg.id, turno, { ...cfg, intervalos: novos })
  }

  return (
    <div className="card space-y-4">
      {/* Cabeçalho com turno editável */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-bold text-base">{seg.name}</div>
        <TurnoSelector seg={seg} store={store} />
      </div>

      {/* Campos de limite de turno */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Início do turno</label>
            <input
              className="inp"
              type="time"
              value={localInicio}
              onChange={e => setLocalInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="lbl">Fim do turno</label>
            <input
              className="inp"
              type="time"
              value={localFim}
              onChange={e => setLocalFim(e.target.value)}
            />
          </div>
        </div>
        {localInicio !== '' && cfg.inicio && toMin(cfg.inicio) < toMin(localInicio) && (
          <p className="text-xs text-warn">Início da 1ª aula é anterior ao início do turno</p>
        )}
        <div className="flex justify-end">
          <button className="btn btn-dark btn-sm" onClick={saveLimiteTurno}>Salvar</button>
        </div>
      </div>

      {/* Configurações básicas */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="lbl">Início</label>
          <input className="inp" type="time" value={cfg.inicio}
            onChange={e => update('inicio', e.target.value)} />
        </div>
        <div>
          <label className="lbl">Duração (min)</label>
          <input className="inp" type="number" min="30" max="120" value={cfg.duracao}
            onChange={e => update('duracao', Number(e.target.value))} />
        </div>
        <div>
          <label className="lbl">Qtd. aulas</label>
          <input className="inp" type="number" min="1" max="12" value={cfg.qtd}
            onChange={e => update('qtd', Number(e.target.value))} />
        </div>
      </div>

      {/* Intervalos editáveis */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="lbl !mb-0">Intervalos</label>
          <button className="btn btn-ghost btn-xs" onClick={addIntervalo}>+ Adicionar intervalo</button>
        </div>
        {(cfg.intervalos ?? []).length === 0 && (
          <p className="text-xs text-t3 py-1">Nenhum intervalo configurado.</p>
        )}
        <div className="space-y-2">
          {(cfg.intervalos ?? []).map((iv, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-surf2 rounded-xl px-3 py-2 flex-wrap">
              <span className="text-xs text-t2 shrink-0">Após a aula nº</span>
              <input
                className="inp !w-16 py-1 text-xs text-center"
                type="number"
                min="1"
                max={cfg.qtd}
                value={iv.apos}
                onChange={e => updateIntervalo(idx, 'apos', Number(e.target.value))}
              />
              <span className="text-xs text-t2 shrink-0">Duração:</span>
              <input
                className="inp !w-20 py-1 text-xs text-center"
                type="number"
                min="5"
                max="120"
                value={iv.duracao}
                onChange={e => updateIntervalo(idx, 'duracao', Number(e.target.value))}
              />
              <span className="text-xs text-t2 shrink-0">min</span>
              <button
                className="ml-auto text-t3 hover:text-err text-sm transition-colors"
                onClick={() => removeIntervalo(idx)}
                title="Remover intervalo"
              >✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Saldo de tempo */}
      <SaldoTempo
        tempoTotal={saldo.tempoTotal}
        tempoLetivo={saldo.tempoLetivo}
        tempoResidual={saldo.tempoResidual}
        tempoEspecial={saldo.tempoEspecial}
      />

      {/* Grade Especial */}
      <CamposGradeEspecial gradeEspecial={localGradeEspecial} onChange={setLocalGradeEspecial} />
      <div className="flex justify-end">
        <button className="btn btn-dark btn-sm" onClick={saveGradeEspecial}>Salvar grade especial</button>
      </div>

      {/* Preview */}
      <PreviewVertical items={preview} />

      <AlertaImpeditivoModal
        open={alertaAberto}
        excedente={alertaDados.excedente}
        duracaoSugerida={alertaDados.duracaoSugerida}
        onFechar={() => setAlertaAberto(false)}
        onAplicar={() => {
          setLocalGradeEspecial({ ...localGradeEspecial, duracaoAula: alertaDados.duracaoSugerida })
          setAlertaAberto(false)
        }}
      />
    </div>
  )
}
