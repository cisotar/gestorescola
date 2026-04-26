import { useState, useRef, useEffect } from 'react'
import useSchoolStore from '../../store/useSchoolStore'
import { toast } from '../../hooks/useToast'

export default function SchoolSwitcher() {
  const currentSchool    = useSchoolStore(s => s.currentSchool)
  const availableSchools = useSchoolStore(s => s.availableSchools)
  const [isOpen, setIsOpen]       = useState(false)
  const [switching, setSwitching] = useState(false)
  const triggerRef  = useRef(null)
  const dropdownRef = useRef(null)

  // Click-outside handler (padrão ProfileSelector)
  useEffect(() => {
    if (!isOpen) return
    const handle = (e) => {
      if (
        !triggerRef.current?.contains(e.target) &&
        !dropdownRef.current?.contains(e.target)
      ) setIsOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [isOpen])

  // Guard: sem dados ou escola única — nada a exibir
  if (!currentSchool || availableSchools.length < 2) return null

  const handleSelect = async (school) => {
    if (school.schoolId === currentSchool.schoolId) return
    setIsOpen(false)
    setSwitching(true)
    try {
      await useSchoolStore.getState().switchSchool(school.schoolId)
      toast(`Escola alterada para ${school.name ?? school.schoolId}`, 'ok')
    } catch {
      toast('Erro ao trocar de escola', 'err')
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !switching && setIsOpen(o => !o)}
        disabled={switching}
        className="flex items-center gap-1.5 px-2 h-8 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors text-sm font-semibold max-w-[160px] truncate disabled:opacity-50 disabled:cursor-not-allowed"
        title="Trocar escola"
      >
        {/* Ícone escola */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span className="truncate">{currentSchool.name ?? currentSchool.schoolId}</span>
        {/* Chevron */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-1 z-50 min-w-[200px] bg-surf border border-bdr rounded-lg shadow-lg overflow-hidden"
        >
          {availableSchools.map(school => {
            const isActive = school.schoolId === currentSchool.schoolId
            return (
              <button
                key={school.schoolId}
                type="button"
                onClick={() => handleSelect(school)}
                disabled={isActive}
                className={`
                  w-full px-4 py-2.5 text-left text-sm transition-colors
                  ${isActive
                    ? 'opacity-50 cursor-not-allowed text-t2 bg-surf2'
                    : 'text-t1 hover:bg-surf2 cursor-pointer'}
                `}
              >
                <span className="font-semibold block">{school.name ?? school.schoolId}</span>
                {isActive && <span className="text-[10px] text-t3 uppercase tracking-wide font-bold">Ativa</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
