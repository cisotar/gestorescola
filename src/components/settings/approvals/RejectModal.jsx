// RejectModal — modal de rejeição de ação pendente (TabApprovals)

import { useState } from 'react'
import Modal from '../../ui/Modal'

export default function RejectModal({ open, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const handleConfirm = () => { onConfirm(reason.trim() || null); setReason('') }
  const handleClose   = () => { setReason(''); onClose() }
  return (
    <Modal open={open} onClose={handleClose} title="Rejeitar Ação" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-t2">Informe um motivo para a rejeição (opcional):</p>
        <textarea
          className="inp w-full text-sm resize-none"
          rows={3}
          placeholder="Motivo da rejeição…"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button className="btn" onClick={handleClose}>Cancelar</button>
          <button className="btn bg-red-600 text-white hover:bg-red-700 border-red-600" onClick={handleConfirm}>
            Confirmar Rejeição
          </button>
        </div>
      </div>
    </Modal>
  )
}
