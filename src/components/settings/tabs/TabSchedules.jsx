// TabSchedules — grade horária: seletor de professor + SecaoHorarios + ScheduleGrid

import { useState } from 'react'
import useAppStore from '../../../store/useAppStore'
import useAuthStore from '../../../store/useAuthStore'
import { colorOfTeacher, canEditTeacher } from '../../../lib/helpers'
import { teacherBelongsToSegment, teacherSegmentIds } from '../../../lib/settings'
import { parseSlot } from '../../../lib/periods'
import { generateGradesProfessorHTML, openPDF } from '../../../lib/reports'
import TurnoSelector from '../shared/TurnoSelector'
import { ScheduleGrid } from '../../ui/ScheduleGrid'
import { SecaoHorarios } from '../../ui/SecaoHorarios'

export default function TabSchedules() {
  const store = useAppStore()
  const [selTeacher, setSelTeacher] = useState(null)
  const teacher = selTeacher ? store.teachers.find(t => t.id === selTeacher) : null

  const unassigned = store.teachers.filter(t =>
    teacherSegmentIds(t, store.subjects, store.areas).length === 0
  ).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {store.segments.map(seg => {
          const list = store.teachers.filter(t =>
            teacherBelongsToSegment(t, seg.id, store.subjects, store.areas)
          ).sort((a, b) => a.name.localeCompare(b.name))

          return (
            <div key={seg.id} className="card">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="font-bold text-sm">{seg.name}</div>
                <TurnoSelector seg={seg} store={store} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {list.length === 0 && (
                  <p className="text-xs text-t3 py-2">Nenhum professor com matéria neste nível.</p>
                )}
                {list.map(t => {
                  const cv     = colorOfTeacher(t, store)
                  const prefix = seg.id + '|'
                  const nAulas = store.schedules.filter(s => s.teacherId === t.id && s.timeSlot?.startsWith(prefix)).length
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelTeacher(t.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all
                        ${selTeacher === t.id ? 'border-navy bg-surf' : 'border-bdr hover:border-t3'}`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cv.dt }} />
                      {t.name}
                      <span className="font-mono text-t3">{nAulas}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Professores sem segmento — visíveis para auditoria */}
        {unassigned.length > 0 && (
          <div className="card border-dashed border-amber-300 bg-amber-50/30 lg:col-span-2">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="font-bold text-sm text-amber-700">
                ⚠ Sem segmento definido
                <span className="text-xs font-normal text-t3 ml-2">{unassigned.length} professor{unassigned.length !== 1 ? 'es' : ''} — clique para ver a grade</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {unassigned.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelTeacher(t.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all
                    bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-400
                    ${selTeacher === t.id ? 'border-amber-500 bg-amber-100' : ''}`}
                >
                  ⚠ {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {teacher && <TeacherPanel teacher={teacher} store={store} />}
    </div>
  )
}

function TeacherPanel({ teacher, store }) {
  const { teacher: myTeacher } = useAuthStore()
  const canEdit = canEditTeacher(myTeacher, teacher, useAuthStore.getState())

  const teacherSchedules = store.schedules.filter(s => s.teacherId === teacher.id)
  const seen = new Set()
  const segmentTurnoList = []
  for (const sched of teacherSchedules) {
    const parsed = parseSlot(sched.timeSlot)
    if (!parsed) continue
    const key = `${parsed.segmentId}|${parsed.turno}`
    if (!seen.has(key)) { seen.add(key); segmentTurnoList.push(parsed) }
  }
  const order = { manha: 0, tarde: 1, noite: 2 }
  segmentTurnoList.sort((a, b) => (order[a.turno] ?? 3) - (order[b.turno] ?? 3))

  const handleExport = () => {
    const html = generateGradesProfessorHTML(teacher, segmentTurnoList, store, false)
    openPDF(html)
  }

  return (
    <div className="card space-y-4">
      <div className="flex justify-end">
        <button className="btn btn-dark btn-sm" onClick={handleExport}>📄 Exportar PDF</button>
      </div>
      <SecaoHorarios teacher={teacher} isEditable={canEdit} />
      <ScheduleGrid teacher={teacher} store={store} />
    </div>
  )
}
