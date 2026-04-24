// GradeRow — linha de uma série dentro de GradeList (TabSegments)

import { useState } from 'react'
import Modal from '../../ui/Modal'
import Spinner from '../../ui/Spinner'
import useAppStore from '../../../store/useAppStore'
import { formatBR } from '../../../lib/helpers/dates'
import { toast } from '../../../hooks/useToast'

function ImpactSummary({ schedulesCount, futureSlots, pastSlots, absencesAffected, absencesLoaded }) {
  return (
    <ul className="space-y-2 text-sm text-t1">
      <li className="flex items-center gap-2">
        <span className="text-err font-semibold">{schedulesCount}</span>
        <span>aula{schedulesCount !== 1 ? 's' : ''} da grade serão deletada{schedulesCount !== 1 ? 's' : ''}</span>
      </li>
      <li className="flex items-center gap-2">
        <span className="text-err font-semibold">{futureSlots}</span>
        <span>falta{futureSlots !== 1 ? 's' : ''} futura{futureSlots !== 1 ? 's' : ''} serão deletada{futureSlots !== 1 ? 's' : ''}</span>
      </li>
      <li className="flex items-center gap-2">
        <span className="text-t2 font-semibold">{pastSlots}</span>
        <span>falta{pastSlots !== 1 ? 's' : ''} passada{pastSlots !== 1 ? 's' : ''} serão mantida{pastSlots !== 1 ? 's' : ''} (histórico)</span>
      </li>
      <li className="flex items-center gap-2">
        <span className="text-t2 font-semibold">{absencesAffected}</span>
        <span>ausência{absencesAffected !== 1 ? 's' : ''} afetada{absencesAffected !== 1 ? 's' : ''} (com slots futuros)</span>
      </li>
      <li className="text-t2">
        Data efetiva: <span className="font-semibold">{formatBR(new Date().toISOString().slice(0, 10))}</span>
      </li>
      {!absencesLoaded && (
        <li className="text-xs text-warn mt-1">
          Faltas não carregadas — contagens de faltas podem estar incompletas.
        </li>
      )}
    </ul>
  )
}

function RemoveClassModal({ segId, gradeName, letter, onConfirm, onCancel, isLoading }) {
  const { schedules, absences, absencesLoaded } = useAppStore()
  const fullLabel = `${gradeName} ${letter}`
  const today = new Date().toISOString().slice(0, 10)

  const schedulesCount = schedules.filter(s => s.turma === fullLabel).length
  const futureSlots = absences.flatMap(a => a.slots).filter(sl => sl.turma === fullLabel && sl.date >= today).length
  const pastSlots   = absences.flatMap(a => a.slots).filter(sl => sl.turma === fullLabel && sl.date < today).length
  const absencesAffected = absences.filter(a => a.slots.some(sl => sl.turma === fullLabel && sl.date >= today)).length

  return (
    <Modal
      open={true}
      onClose={isLoading ? () => {} : onCancel}
      title={`Remover turma ${fullLabel}`}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-t2">
          Você está prestes a remover a turma <span className="font-semibold text-t1">{fullLabel}</span>.
          Esta ação não pode ser desfeita. Confira o impacto abaixo:
        </p>
        <ImpactSummary
          schedulesCount={schedulesCount}
          futureSlots={futureSlots}
          pastSlots={pastSlots}
          absencesAffected={absencesAffected}
          absencesLoaded={absencesLoaded}
        />
        <div className="flex gap-2 justify-end pt-2">
          <button
            className={`btn btn-ghost${isLoading ? ' opacity-50' : ''}`}
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            className="btn btn-danger min-w-[160px] flex items-center justify-center gap-2"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? <Spinner size={20} className="border-t-white" /> : 'Confirmar Remoção'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function GradeRow({ seg, grade, store }) {
  const [letter, setLetter] = useState('')
  const [pendingRemoval, setPendingRemoval] = useState(null)
  const [isRemoving, setIsRemoving] = useState(false)

  async function handleConfirmRemoval() {
    const { segId, gradeName, letter: cls } = pendingRemoval
    const fullLabel = `${gradeName} ${cls}`
    setIsRemoving(true)
    try {
      const result = await store.removeClassFromGradeCascade(segId, gradeName, cls)
      setPendingRemoval(null)
      if (result) {
        toast(`Turma ${fullLabel} removida. ${result.schedulesDeleted} aulas e ${result.futureSlotsDeleted} faltas futuras deletadas.`, 'ok')
      } else {
        toast('Solicitação enviada para aprovação do ADM', 'warn')
      }
    } catch {
      toast('Erro ao remover turma. Tente novamente.', 'err')
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div className="bg-surf2 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-bold text-sm flex-1">{grade.name}</span>
        <input
          className="inp !w-24 py-1 text-xs"
          placeholder="Letra (A,B…)"
          value={letter}
          onChange={e => setLetter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && letter.trim()) {
              store.addClassToGrade(seg.id, grade.name, letter.trim()); setLetter('')
            }
          }}
        />
        <button className="btn btn-dark btn-xs" onClick={() => {
          if (!letter.trim()) return
          store.addClassToGrade(seg.id, grade.name, letter.trim()); setLetter('')
        }}>+</button>
        <button className="btn btn-ghost btn-xs text-err" onClick={() => store.removeGrade(seg.id, grade.name)}>✕</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {grade.classes.map(cls => (
          <span key={cls.letter} className="inline-flex items-center gap-1 px-2 py-0.5 bg-surf border border-bdr rounded-full text-xs font-semibold">
            {grade.name} {cls.letter}
            <button
              className="text-t3 hover:text-err"
              onClick={() => setPendingRemoval({ segId: seg.id, gradeName: grade.name, letter: cls.letter })}
            >×</button>
          </span>
        ))}
        {grade.classes.length === 0 && <span className="text-xs text-t3">Nenhuma turma.</span>}
      </div>

      {pendingRemoval && (
        <RemoveClassModal
          segId={pendingRemoval.segId}
          gradeName={pendingRemoval.gradeName}
          letter={pendingRemoval.letter}
          onConfirm={handleConfirmRemoval}
          onCancel={() => setPendingRemoval(null)}
          isLoading={isRemoving}
        />
      )}
    </div>
  )
}
