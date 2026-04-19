import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'
import useAppStore from '../store/useAppStore'
import GradeTurnoCard from '../components/ui/GradeTurnoCard'
import { parseSlot } from '../lib/periods'

export default function GradesPage() {
  const navigate = useNavigate()
  const { role, isCoordinator } = useAuthStore()
  const store = useAppStore()
  const [activeTab, setActiveTab] = useState('professor')
  const [selectedTeacherId, setSelectedTeacherId] = useState(null)

  // Guard: only admin, coordinator, teacher-coordinator, and teacher can access
  // If role is not set or is 'pending', this shouldn't happen (Layout guards it)
  // but we ensure it here anyway
  if (!role) {
    return null
  }

  // Determine if user can access "Por Turma" tab
  // Only admin and coordinators can access it
  const canAccessTurma = role === 'admin' || isCoordinator()

  // If teacher tries to access turma tab, prevent it by resetting to professor
  if (!canAccessTurma && activeTab === 'turma') {
    setActiveTab('professor')
  }

  // Helper function to extract unique segment/turno pairs from schedules
  function extractSegmentTurno(schedules) {
    const seen = new Set()
    const result = []

    for (const sched of schedules) {
      const parsed = parseSlot(sched.timeSlot)
      if (!parsed) continue

      const { segmentId, turno } = parsed
      const key = `${segmentId}|${turno}`

      if (!seen.has(key)) {
        seen.add(key)
        result.push({ segmentId, turno })
      }
    }

    // Sort by turno: manha → tarde → noite
    const order = { manha: 0, tarde: 1, noite: 2 }
    result.sort((a, b) => (order[a.turno] ?? 3) - (order[b.turno] ?? 3))

    return result
  }

  // Derived helpers
  const approvedTeachers = store.teachers
    .filter(t => t.status === 'approved')
    .sort((a, b) => a.name.localeCompare(b.name))

  const selectedTeacher = selectedTeacherId
    ? store.teachers.find(t => t.id === selectedTeacherId)
    : null
  const professorSchedules = selectedTeacherId
    ? store.schedules.filter(s => s.teacherId === selectedTeacherId)
    : []
  const segmentTurnoList = selectedTeacherId
    ? extractSegmentTurno(professorSchedules)
    : []

  return (
    <div className="space-y-5">
      {/* Header with back button and title */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/home')} className="btn btn-ghost btn-sm">
          ← Voltar
        </button>
        <h1 className="text-2xl font-bold text-t1">Grades Horárias</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-bdr">
        <button
          onClick={() => setActiveTab('professor')}
          className={`px-4 py-3 font-semibold text-sm transition-colors border-b-2 ${
            activeTab === 'professor'
              ? 'border-navy text-navy'
              : 'border-transparent text-t2 hover:text-t1'
          }`}
        >
          Por Professor
        </button>
        {canAccessTurma && (
          <button
            onClick={() => setActiveTab('turma')}
            className={`px-4 py-3 font-semibold text-sm transition-colors border-b-2 ${
              activeTab === 'turma'
                ? 'border-navy text-navy'
                : 'border-transparent text-t2 hover:text-t1'
            }`}
          >
            Por Turma
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="card">
        {activeTab === 'professor' && (
          <div className="space-y-4">
            {/* Professor dropdown */}
            <div>
              <label className="lbl">Professor</label>
              <select
                value={selectedTeacherId ?? ''}
                onChange={(e) => setSelectedTeacherId(e.target.value || null)}
                className="inp w-full md:w-96"
              >
                <option value="">Selecione um professor...</option>
                {approvedTeachers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* No teacher selected message */}
            {selectedTeacherId === null && (
              <p className="text-sm text-t3 italic">
                Selecione um professor para visualizar a grade
              </p>
            )}

            {/* No schedules message */}
            {selectedTeacherId !== null && segmentTurnoList.length === 0 && (
              <p className="text-sm text-t3 italic">
                Nenhum horário cadastrado para este professor
              </p>
            )}

            {/* Grade Turno Cards */}
            {selectedTeacherId !== null && segmentTurnoList.length > 0 && (
              <div className={`space-y-6 ${segmentTurnoList.length > 1 ? 'grid md:grid-cols-1 lg:grid-cols-2 gap-6' : ''}`}>
                {segmentTurnoList.map(({ segmentId, turno }) => (
                  <GradeTurnoCard
                    key={`${segmentId}|${turno}`}
                    segmentId={segmentId}
                    turno={turno}
                    teacher={selectedTeacher}
                    store={store}
                    horariosSemana={selectedTeacher?.horariosSemana ?? null}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {activeTab === 'turma' && canAccessTurma && (
          <div className="text-center py-16 text-t3">
            Aba Turma (em desenvolvimento)
          </div>
        )}
      </div>
    </div>
  )
}
