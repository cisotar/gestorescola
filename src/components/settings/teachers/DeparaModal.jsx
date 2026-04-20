// DeparaModal — mapeamento N:M de matérias sendo removidas (substituição/remoção)

import { useState, useEffect } from 'react'
import useAppStore from '../../../store/useAppStore'

export default function DeparaModal({ open, removedSubjects, availableSubjects, onConfirm, onCancel }) {
  const store = useAppStore()
  const [mapping, setMapping] = useState({})

  useEffect(() => {
    if (open) {
      setMapping(Object.fromEntries((removedSubjects ?? []).map(s => [s.id, null])))
    }
  }, [open, removedSubjects])

  if (!open) return null

  // Calcular impacto das substituições selecionadas
  const fromIdsWithSub = new Set(
    Object.entries(mapping).filter(([, toId]) => toId).map(([fromId]) => fromId)
  )
  const affectedSchedules = store.schedules.filter(s => fromIdsWithSub.has(s.subjectId))
  const affectedTeachersCount = new Set(affectedSchedules.map(s => s.teacherId)).size
  const totalSchedules = affectedSchedules.length

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-surf rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-t1">Matérias sendo removidas</h3>
          <p className="text-sm text-t2">Defina o que acontece com os horários de cada uma</p>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 text-[10px] font-bold uppercase tracking-wider text-t3 pb-1 border-b border-bdr">
          <span>Saindo</span>
          <span />
          <span>Entrando</span>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {(removedSubjects ?? []).map(subj => (
            <div key={subj.id} className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
              <div>
                <div className="text-sm font-semibold text-t1 truncate">{subj.name}</div>
                {subj.scheduleCount > 0 && (
                  <div className="text-[10px] text-t3">{subj.scheduleCount} horário{subj.scheduleCount !== 1 ? 's' : ''}</div>
                )}
              </div>
              <span className="text-t3 text-sm">⮕</span>
              <select
                className="inp text-sm"
                value={mapping[subj.id] ?? ''}
                onChange={e => setMapping(m => ({ ...m, [subj.id]: e.target.value || null }))}
              >
                <option value="">— Remover sem substituir</option>
                {(availableSubjects ?? []).map(s => (
                  <option key={s.id ?? s.name} value={s.id ?? s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="text-sm text-t2 py-2 border-t border-bdr">
          {totalSchedules > 0 ? (
            <>Impacto: <strong className="text-t1">{totalSchedules} horário{totalSchedules !== 1 ? 's' : ''}</strong> em <strong className="text-t1">{affectedTeachersCount} professor{affectedTeachersCount !== 1 ? 'es' : ''}</strong> serão atualizados</>
          ) : (
            <span className="text-t3">Nenhum horário será migrado</span>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-dark" onClick={() => onConfirm(mapping)}>
            Confirmar substituição
          </button>
        </div>
      </div>
    </div>
  )
}
