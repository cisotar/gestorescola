// PendingActionCard — card de ação pendente de aprovação (TabApprovals)

import { useState } from 'react'
import { timeAgo } from '../../../lib/settingsHelpers'
import RejectModal from './RejectModal'

export default function PendingActionCard({ action, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [approving, setApproving]   = useState(false)

  const handleApprove = async () => {
    setApproving(true)
    await onApprove(action)
    setApproving(false)
  }

  return (
    <div className="rounded-xl border border-bdr p-4 space-y-3 bg-surf">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-t1 truncate">{action.summary}</div>
          <div className="text-xs text-t2 mt-0.5">
            <span className="font-semibold">{action.coordinatorName}</span>
            {' · '}
            <span>{timeAgo(action.createdAt)}</span>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-warn/10 text-warn border border-warn/20 uppercase tracking-wide">
          Pendente
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="btn btn-dark text-xs py-1 px-3"
          onClick={handleApprove}
          disabled={approving}
        >
          {approving ? '…' : '✅ Aprovar'}
        </button>
        <button
          className="btn text-xs py-1 px-3 bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
          onClick={() => setRejectOpen(true)}
        >
          ❌ Rejeitar
        </button>
        <button
          className="btn text-xs py-1 px-3"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? '▲ Ocultar' : '▼ Ver detalhes'}
        </button>
      </div>

      {expanded && (
        <pre className="text-[11px] bg-surf2 rounded-lg p-3 overflow-x-auto text-t2 leading-relaxed border border-bdr">
          {JSON.stringify(action.payload, null, 2)}
        </pre>
      )}

      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => { setRejectOpen(false); onReject(action, reason) }}
      />
    </div>
  )
}
