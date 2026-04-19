import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'
import useAppStore from '../store/useAppStore'
import GradeTurnoCard from '../components/ui/GradeTurnoCard'
import SchoolGrid from '../components/ui/SchoolGrid'
import { parseSlot } from '../lib/periods'
import { allTurmaObjects } from '../lib/helpers'
import { generateGradesProfessorHTML, generateSchoolScheduleHTML, openPDF } from '../lib/reports'

export default function GradesPage() {
  const navigate = useNavigate()
  const { role, teacher: myTeacher, isCoordinator } = useAuthStore()
  const store = useAppStore()
  const [activeTab, setActiveTab] = useState('professor')
  const [selectedTeacherId, setSelectedTeacherId] = useState(null)
  const [selectedTurma, setSelectedTurma] = useState(null)
  const [professorFilter, setProfessorFilter] = useState(null)

  // Handler to export professor schedule as PDF
  const handleExportProfessor = () => {
    if (!selectedTeacherId || !selectedTeacher) return
    const html = generateGradesProfessorHTML(selectedTeacher, segmentTurnoList, store, false)
    openPDF(html)
  }

  // Handler to export turma schedule as PDF
  const handleExportTurma = () => {
    if (!selectedTurma) return
    const html = generateSchoolScheduleHTML({ turma: selectedTurma, teacherId: professorFilter }, store)
    openPDF(html)
  }

  // Guard: pending users → redirect to home
  if (role === 'pending') {
    navigate('/home', { replace: true })
    return null
  }

  // Guard: only admin, coordinator, teacher-coordinator, and teacher can access
  if (!role) {
    return null
  }

  // Determine if user is a restricted teacher (can only see "Por Professor" tab)
  const isRestrictedTeacher = role === 'teacher'
  const myTeacherId = isRestrictedTeacher ? myTeacher?.id : null

  // Initialize selectedTeacherId with myTeacherId for restricted teachers
  useEffect(() => {
    if (isRestrictedTeacher && myTeacherId) {
      setSelectedTeacherId(myTeacherId)
    }
  }, [isRestrictedTeacher, myTeacherId])

  // Determine if user can access "Por Turma" tab
  // Only admin and coordinators can access it
  const canAccessTurma = !isRestrictedTeacher && (role === 'admin' || isCoordinator())

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

  // Derived helpers for "Por Professor" tab
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

  // Derived helpers for "Por Turma" tab
  const turmaObjects = allTurmaObjects(store.segments)

  // Filter schedules by selected turma
  const turmaSchedules = selectedTurma
    ? store.schedules.filter(s => s.turma === selectedTurma)
    : []

  // Further filter by selected professor (optional)
  const filteredTurmaSchedules = professorFilter
    ? turmaSchedules.filter(s => s.teacherId === professorFilter)
    : turmaSchedules

  // Extract unique professores from turma schedules
  const uniqueProfessores = turmaSchedules.length > 0
    ? [...new Set(turmaSchedules.map(s => s.teacherId))]
      .map(tid => store.teachers.find(t => t.id === tid))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
    : []

  // Extract unique segments from filtered turma schedules
  const filteredSegmentIds = filteredTurmaSchedules.length > 0
    ? [...new Set(
      filteredTurmaSchedules
        .map(s => s.timeSlot?.split('|')[0])
        .filter(Boolean)
    )]
    : []
  const filteredSegments = store.segments.filter(s => filteredSegmentIds.includes(s.id))

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
            {/* Warning message for restricted teachers */}
            {isRestrictedTeacher && (
              <div className="p-4 rounded-lg bg-accent-l border border-accent text-accent font-semibold text-sm">
                ℹ️ Você está visualizando sua própria grade horária.
              </div>
            )}

            {/* Professor dropdown */}
            {isRestrictedTeacher ? (
              <div>
                <label className="lbl">Professor</label>
                <div className="inp w-full md:w-96 bg-surf2 cursor-not-allowed opacity-75 flex items-center">
                  {selectedTeacher?.name ?? 'Você'}
                </div>
              </div>
            ) : (
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
            )}

            {/* Export PDF button */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportProfessor}
                disabled={selectedTeacherId === null}
                className="btn btn-dark btn-sm"
              >
                📄 Exportar PDF
              </button>
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
          <div className="space-y-4">
            {/* Turma dropdown */}
            <div>
              <label className="lbl">Turma</label>
              <select
                value={selectedTurma ?? ''}
                onChange={(e) => {
                  setSelectedTurma(e.target.value || null)
                  setProfessorFilter(null)
                }}
                className="inp w-full md:w-96"
              >
                <option value="">Selecione uma turma...</option>
                {turmaObjects.map(t => (
                  <option key={t.label} value={t.label}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* No turma selected message */}
            {selectedTurma === null && (
              <p className="text-sm text-t3 italic">
                Selecione uma turma para visualizar a grade
              </p>
            )}

            {/* Professor filter dropdown - appears only if turma is selected */}
            {selectedTurma !== null && uniqueProfessores.length > 0 && (
              <div>
                <label className="lbl">Filtrar por professor (opcional)</label>
                <select
                  value={professorFilter ?? ''}
                  onChange={(e) => setProfessorFilter(e.target.value || null)}
                  className="inp w-full md:w-96"
                >
                  <option value="">Todos os professores</option>
                  {uniqueProfessores.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Export PDF button */}
            {selectedTurma !== null && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportTurma}
                  disabled={selectedTurma === null}
                  className="btn btn-dark btn-sm"
                >
                  📄 Exportar PDF
                </button>
              </div>
            )}

            {/* No schedules message for turma */}
            {selectedTurma !== null && turmaSchedules.length === 0 && (
              <p className="text-sm text-t3 italic">
                Nenhuma aula encontrada para esta turma
              </p>
            )}

            {/* No schedules message after professor filter */}
            {selectedTurma !== null && professorFilter !== null && filteredTurmaSchedules.length === 0 && (
              <p className="text-sm text-t3 italic">
                Nenhuma aula deste professor nesta turma
              </p>
            )}

            {/* Grade Grid */}
            {selectedTurma !== null && filteredTurmaSchedules.length > 0 && filteredSegments.length > 0 && (
              <div className="space-y-6">
                {filteredSegments.map(seg => (
                  <div key={seg.id} className="space-y-3">
                    <div className="text-sm font-bold text-t1">
                      {seg.name} — {(seg.turno ?? 'manha') === 'tarde' ? '🌇 Tarde' : '🌅 Manhã'}
                    </div>
                    <SchoolGrid
                      seg={seg}
                      schedules={filteredTurmaSchedules}
                      store={store}
                      showTeacher={true}
                      useApelido={false}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
