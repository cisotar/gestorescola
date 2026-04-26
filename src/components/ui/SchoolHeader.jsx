import useSchoolStore from '../../store/useSchoolStore'
import useAuthStore from '../../store/useAuthStore'

const ALLOWED_ROLES = new Set(['admin', 'coordinator', 'teacher-coordinator'])

export default function SchoolHeader() {
  const currentSchool = useSchoolStore(s => s.currentSchool)
  const role          = useAuthStore(s => s.role)

  if (!currentSchool || !ALLOWED_ROLES.has(role)) return null

  return (
    <div className="bg-surf2 border-b border-bdr px-4 sm:px-6 py-1.5 flex items-center gap-2">
      {/* Ícone escola */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-t3 shrink-0">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      <span className="text-xs font-semibold text-t2 truncate">
        {currentSchool.name ?? currentSchool.schoolId}
      </span>
    </div>
  )
}
