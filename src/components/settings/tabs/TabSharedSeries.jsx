// TabSharedSeries — gerenciamento de turmas compartilhadas (formação, eletivas)

import { useState, useEffect } from 'react'
import useAppStore from '../../../store/useAppStore'
import { toast } from '../../../hooks/useToast'
import { uid } from '../../../lib/helpers'
import Modal from '../../ui/Modal'

// ─── SharedSeriesModal ────────────────────────────────────────────────────────

function SharedSeriesModal({ open, onClose, store, editingSeries }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('formation')

  useEffect(() => {
    if (!open) return
    setName(editingSeries?.name ?? '')
    setType(editingSeries?.type ?? 'formation')
  }, [open, editingSeries])

  const save = () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      alert('Informe o nome da turma compartilhada.')
      return
    }

    const duplicatedSeries = store.sharedSeries.some(
      ss => ss.name.toLowerCase() === trimmedName.toLowerCase() && ss.id !== editingSeries?.id
    )
    if (duplicatedSeries) {
      alert('Já existe uma turma compartilhada com este nome.')
      return
    }

    const payload = { name: trimmedName, type }

    if (editingSeries) {
      store.updateSharedSeries(editingSeries.id, payload)
      toast('Turma compartilhada atualizada', 'ok')
    } else {
      store.addSharedSeries({ id: uid(), ...payload })
      toast('Turma compartilhada criada', 'ok')
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingSeries ? 'Editar turma compartilhada' : 'Nova turma compartilhada'}
      size="sm"
    >
      <div className="space-y-5">
        <div>
          <label className="lbl">Nome da turma *</label>
          <input
            className="inp"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: FORMAÇÃO"
          />
        </div>

        <div>
          <label className="lbl">Tipo *</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="formation"
                checked={type === 'formation'}
                onChange={e => setType(e.target.value)}
              />
              <span className="text-sm">Formação (não requer substituto)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="elective"
                checked={type === 'elective'}
                onChange={e => setType(e.target.value)}
              />
              <span className="text-sm">Eletiva (requer substituto)</span>
            </label>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button className="btn btn-dark flex-1" onClick={save}>Salvar</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── TabSharedSeries ──────────────────────────────────────────────────────────

export default function TabSharedSeries() {
  const store = useAppStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSeries, setEditingSeries] = useState(null)

  const openCreate = () => { setEditingSeries(null); setModalOpen(true) }
  const openEdit = (series) => { setEditingSeries(series); setModalOpen(true) }

  const handleDeleteSeries = (series) => {
    const affected = store.schedules.filter(s => s.turma === series.name).length
    if (affected > 0) {
      alert(`Não é possível excluir: ${affected} horário(s) usam esta turma.`)
      return
    }
    if (!confirm(`Remover a turma compartilhada "${series.name}"?`)) return
    store.removeSharedSeries(series.id)
    toast('Turma compartilhada removida', 'ok')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-t1">Turmas Compartilhadas</h2>
          <p className="text-sm text-t2 mt-1">
            Gerencie turmas especiais que aceitam múltiplos professores no mesmo horário.
          </p>
        </div>
        <button className="btn btn-dark" onClick={openCreate}>+ Nova turma compartilhada</button>
      </div>

      {store.sharedSeries.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-4xl mb-2">🧩</div>
          <div className="font-bold text-sm text-t1">Nenhuma turma compartilhada cadastrada</div>
          <p className="text-sm text-t2 mt-1 mb-4">
            Crie turmas de Formação ou Eletiva para uso em múltiplos professores simultâneos.
          </p>
          <button className="btn btn-dark" onClick={openCreate}>Criar primeira turma</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {store.sharedSeries.map(series => {
            const affected = store.schedules.filter(s => s.turma === series.name).length
            const typeBadgeClass = series.type === 'formation'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-amber-100 text-amber-700'
            const typeLabel = series.type === 'formation' ? 'Formação' : 'Eletiva'
            return (
              <div key={series.id} className="card">
                <div className="flex items-start gap-3 justify-between mb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 gap-y-1 flex-wrap">
                      <div className="font-bold text-base text-t1">{series.name}</div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${typeBadgeClass}`}>
                        {typeLabel}
                      </span>
                    </div>
                    <div className="text-xs text-t3 mt-2">
                      {affected > 0 ? `${affected} horário${affected !== 1 ? 's' : ''} vinculado${affected !== 1 ? 's' : ''}` : 'Sem horários vinculados'}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button className="btn btn-ghost btn-xs" onClick={() => openEdit(series)}>Editar</button>
                    <button className="btn btn-ghost btn-xs text-err" onClick={() => handleDeleteSeries(series)}>Excluir</button>
                  </div>
                </div>
                <p className="text-xs text-t3">
                  {series.type === 'formation'
                    ? 'Ausência não requer substituto. Professores escolhem matérias da lista.'
                    : 'Ausência requer substituto. Professores escolhem matérias da lista.'}
                </p>
              </div>
            )
          })}
        </div>
      )}

      <SharedSeriesModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        store={store}
        editingSeries={editingSeries}
      />
    </div>
  )
}
