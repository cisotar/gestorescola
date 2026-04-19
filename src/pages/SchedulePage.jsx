import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { ScheduleGrid } from '../components/ui/ScheduleGrid'
import GradeTurnoCard from '../components/ui/GradeTurnoCard'
import { openPDF, generateTeacherScheduleHTML } from '../lib/reports'
import { parseSlot } from '../lib/periods'

export default function SchedulePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const store = useAppStore()
  const { role, teacher: myTeacher } = useAuthStore()
  const isAdmin = role === 'admin'
  const [useApelido, setUseApelido] = useState(false)

  const teacher = isAdmin
    ? store.teachers.find(t => t.id === params.get('teacherId'))
    : myTeacher

  const anyHasApelido = store.teachers.some(t => t.apelido)

  if (!teacher) return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm">← Voltar</button>
      <div className="card text-center py-16 text-t3">Professor não encontrado.</div>
    </div>
  )

  // Derivar pares únicos segmentId|turno a partir dos schedules do professor
  const teacherSchedules = store.schedules.filter(s => s.teacherId === teacher.id)
  const pairsSeen = new Set()
  const allPairs = teacherSchedules
    .map(s => parseSlot(s.timeSlot))
    .filter(Boolean)
    .reduce((acc, { segmentId, turno }) => {
      const key = `${segmentId}|${turno}`
      if (!pairsSeen.has(key)) {
        pairsSeen.add(key)
        acc.push({ segmentId, turno })
      }
      return acc
    }, [])

  // Turno duplo: dois ou mais pares com turnos distintos entre si
  const distinctTurnos = [...new Set(allPairs.map(p => p.turno))]
  const isDupleTurno = distinctTurnos.length >= 2

  // Para turno duplo: manter apenas um par por turno (primeiro encontrado por turno)
  const turnoPairs = isDupleTurno
    ? distinctTurnos.map(t => allPairs.find(p => p.turno === t))
    : []

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm">← Voltar</button>
        <h1 className="text-xl font-extrabold tracking-tight flex-1">Grade Horária — {teacher.name}</h1>
        {anyHasApelido && (
          <div className="flex items-center gap-1 rounded-lg border border-bdr bg-surf2 p-0.5 text-xs">
            <button
              className={!useApelido ? 'px-2 py-0.5 rounded bg-surf border border-bdr font-semibold text-t1' : 'px-2 py-0.5 rounded text-t2'}
              onClick={() => setUseApelido(false)}
            >Nome</button>
            <button
              className={useApelido ? 'px-2 py-0.5 rounded bg-surf border border-bdr font-semibold text-t1' : 'px-2 py-0.5 rounded text-t2'}
              onClick={() => setUseApelido(true)}
            >Apelido</button>
          </div>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => openPDF(generateTeacherScheduleHTML(teacher, store, useApelido))}
        >Exportar PDF</button>
      </div>

      {isDupleTurno ? (
        <div className="space-y-8">
          {turnoPairs.map(({ segmentId, turno }) => (
            <GradeTurnoCard
              key={`${segmentId}|${turno}`}
              segmentId={segmentId}
              turno={turno}
              teacher={teacher}
              store={store}
              horariosSemana={teacher.horariosSemana ?? null}
            />
          ))}
        </div>
      ) : (
        <ScheduleGrid teacher={teacher} store={store} horariosSemana={teacher.horariosSemana ?? null} />
      )}
    </div>
  )
}
