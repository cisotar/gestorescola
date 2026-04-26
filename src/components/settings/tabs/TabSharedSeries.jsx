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
          <div className="flex flex-col gap-2">
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
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="rest"
                checked={type === 'rest'}
                onChange={e => setType(e.target.value)}
              />
              <span className="text-sm">Descanso (almoço/janta — sem matéria, sem substituto)</span>
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

// ─── SubjectListInline ────────────────────────────────────────────────────────

function SubjectListInline({ series }) {
  const store = useAppStore()
  const subjects = series.subjects ?? []
  const [inputValue, setInputValue] = useState('')

  const handleAdd = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    const already = (series.subjects ?? []).some(s => s.toLowerCase() === trimmed.toLowerCase())
    if (already) { alert('Matéria já cadastrada.'); return }
    store.updateSharedSeries(series.id, { subjects: [...(series.subjects ?? []), trimmed] })
    setInputValue('')
    toast('Matéria adicionada', 'ok')
  }

  const handleRemove = (s) => {
    store.updateSharedSeries(series.id, { subjects: (series.subjects ?? []).filter(x => x !== s) })
    toast('Matéria removida', 'ok')
  }
  const handleKeyDown = (e) => { if (e.key === 'Enter') handleAdd() }

  return (
    <div className="space-y-2">
      <span className="lbl">Matérias</span>
      {subjects.length === 0 ? (
        <p className="text-sm text-t3 italic">Nenhuma matéria cadastrada</p>
      ) : (
        <ul className="space-y-1 max-h-40 overflow-y-auto scroll-thin">
          {subjects.map(s => (
            <li key={s} className="flex items-center justify-between gap-2 text-sm text-t1 bg-surf2 rounded-lg px-3 py-1.5">
              <span>{s}</span>
              <button className="text-t3 hover:text-err transition-colors leading-none" onClick={() => handleRemove(s)}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className="inp flex-1 text-sm"
          placeholder="Nome da matéria…"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn btn-dark btn-xs" onClick={handleAdd}>Adicionar</button>
      </div>
    </div>
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
            Crie turmas de Formação, Eletiva ou Descanso para uso em múltiplos professores simultâneos.
          </p>
          <button className="btn btn-dark" onClick={openCreate}>Criar primeira turma</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {store.sharedSeries.map(series => {
            const affected = store.schedules.filter(s => s.turma === series.name).length
            const typeBadgeClass = series.type === 'formation'
              ? 'bg-blue-100 text-blue-700'
              : series.type === 'rest'
                ? 'bg-surf2 text-t2'
                : 'bg-amber-100 text-amber-700'
            const typeLabel = series.type === 'formation'
              ? 'Formação'
              : series.type === 'rest'
                ? 'Descanso'
                : 'Eletiva'
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
                    : series.type === 'rest'
                      ? 'Slot de descanso. Não requer matéria nem substituto.'
                      : 'Ausência requer substituto. Professores escolhem matérias da lista.'}
                </p>
                {series.type !== 'rest' && (
                  <>
                    <hr className="border-bdr my-3" />
                    <SubjectListInline series={series} />
                  </>
                )}
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
