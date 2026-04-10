import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { ScheduleGrid } from './SettingsPage'
import { openPDF, generateTeacherScheduleHTML } from '../lib/reports'

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
        >📄 Exportar PDF</button>
      </div>
      <ScheduleGrid teacher={teacher} store={store} />
    </div>
  )
}
