// TabApprovals — lista de aprovações pendentes (admin only)

import { useState, useEffect } from 'react'
import useAppStore from '../../../store/useAppStore'
import { toast } from '../../../hooks/useToast'
import { getPendingActions } from '../../../lib/db'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../lib/firebase'
import { PendingActionCard } from '../approvals'

export default function TabApprovals({ adminEmail }) {
  const store = useAppStore()
  const [actions, setActions] = useState([])
  const [loaded,  setLoaded]  = useState(false)
  const [error,   setError]   = useState(false)

  const ACTION_MAP = {
    addTeacher:           (p) => store.addTeacher(p.name, p.opts),
    updateTeacher:        (p) => store.updateTeacher(p.id, p.changes),
    removeTeacher:        (p) => store.removeTeacher(p.id),
    addSchedule:          (p) => store.addSchedule(p.sched),
    removeSchedule:       (p) => store.removeSchedule(p.id),
    updateSchedule:       (p) => store.updateSchedule(p.id, p.changes),
    addSegment:           (p) => store.addSegment(p.name, p.turno),
    removeSegment:        (p) => store.removeSegment(p.id),
    addGrade:             (p) => store.addGrade(p.segId, p.gradeName),
    removeGrade:          (p) => store.removeGrade(p.segId, p.gradeName),
    addClassToGrade:      (p) => store.addClassToGrade(p.segId, p.gradeName, p.letter),
    removeClassFromGrade: (p) => store.removeClassFromGrade(p.segId, p.gradeName, p.letter),
    savePeriodCfg:        (p) => store.savePeriodCfg(p.segId, p.turno, p.cfg),
    addArea:              (p) => store.addArea(p.name, p.colorIdx, p.segmentIds, p.shared),
    updateArea:           (p) => store.updateArea(p.id, p.changes),
    removeArea:           (p) => store.removeArea(p.id),
    addSubject:           (p) => store.addSubject(p.name, p.areaId),
    removeSubject:        (p) => store.removeSubject(p.id),
    saveAreaWithSubjects: (p) => store.saveAreaWithSubjects(p.areaId, p.name, p.subjectNames),
    setWorkload:                 (p) => store.setWorkload(p.warn, p.danger),
    removeClassFromGradeCascade: (p) => store.removeClassFromGradeCascade(p.segId, p.gradeName, p.letter),
  }

  const load = async () => {
    setError(false)
    try { setActions(await getPendingActions()); setLoaded(true) }
    catch (e) { console.error('[TabApprovals] Erro ao carregar aprovações pendentes:', e); setError(true); setLoaded(true) }
  }
  useEffect(() => { load() }, [])

  const handleApprove = async (action) => {
    try {
      await httpsCallable(functions, 'applyPendingAction')({
        pendingActionId: action.id,
        approved: true,
      })
      // Optimistic UI update via ACTION_MAP (state already mutated server-side)
      const executor = ACTION_MAP[action.action]
      if (executor) {
        try { await executor(action.payload) } catch (e) { console.warn('[approve] local state update failed:', e) }
      }
      setActions(prev => prev.filter(a => a.id !== action.id))
      toast('Ação aprovada e executada', 'ok')
    } catch (e) {
      console.error('[approve] applyPendingAction failed:', e)
      toast(e.message || 'Erro ao aprovar ação', 'err')
    }
  }

  const handleReject = async (action, reason) => {
    try {
      await httpsCallable(functions, 'applyPendingAction')({
        pendingActionId: action.id,
        approved: false,
        rejectionReason: reason,
      })
      setActions(prev => prev.filter(a => a.id !== action.id))
      toast('Ação rejeitada', 'warn')
    } catch (e) { console.error('[TabApprovals] Erro ao rejeitar ação:', e); toast(e.message || 'Erro ao rejeitar', 'err') }
  }

  if (!loaded) return <div className="text-center py-12 text-t3 text-sm">Carregando…</div>

  if (error) return (
    <div className="text-center py-12 space-y-3">
      <div className="text-t3 text-sm">Erro ao carregar aprovações pendentes.</div>
      <button className="btn btn-dark" onClick={load}>Tentar novamente</button>
    </div>
  )

  if (actions.length === 0) return (
    <div className="text-center py-12 text-t3 text-sm">✅ Nenhuma aprovação pendente.</div>
  )

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="text-xs text-t3 mb-1">{actions.length} ação{actions.length !== 1 ? 'ões' : ''} aguardando aprovação</div>
      {actions.map(a => (
        <PendingActionCard
          key={a.id}
          action={a}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ))}
    </div>
  )
}
