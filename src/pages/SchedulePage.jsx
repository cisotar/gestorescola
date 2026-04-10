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

  const teacher = isAdmin
    ? store.teachers.find(t => t.id === params.get('teacherId'))
    : myTeacher

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
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => openPDF(generateTeacherScheduleHTML(teacher, store))}
        >📄 Exportar PDF</button>
      </div>
      <ScheduleGrid teacher={teacher} store={store} />
    </div>
  )
}
