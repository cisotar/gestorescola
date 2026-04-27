import { useEffect, useMemo, useRef, useState } from 'react'
import Badge from '../ui/Badge'

/**
 * SchoolTabBar — barra horizontal de escolas para o painel SaaS admin.
 *
 * - Até MAX_TABS_BEFORE_DROPDOWN escolas: tabs horizontais.
 * - Acima desse limite: dropdown pesquisável (combobox).
 * - Sempre exibe "Nova escola" ao final.
 * - Escolas com status === 'suspended' recebem badge "Suspensa".
 *
 * Props:
 *   - schools[]:       [{ schoolId|id, name, slug, status }, ...]
 *   - currentSchoolId: id da escola ativa
 *   - onSelect(id)
 *   - onCreateClick() / onCreate()  (aliases — compat com 415)
 */
const MAX_TABS_BEFORE_DROPDOWN = 5

const getId = (s) => s?.schoolId ?? s?.id ?? null

const normalize = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export default function SchoolTabBar({
  schools = [],
  currentSchoolId = null,
  onSelect = () => {},
  onCreateClick,
  onCreate,
}) {
  const handleCreate = onCreateClick ?? onCreate ?? (() => {})

  if (!Array.isArray(schools)) {
    if (import.meta?.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[SchoolTabBar] prop "schools" inválida; usando []')
    }
    schools = []
  }

  const useDropdown = schools.length > MAX_TABS_BEFORE_DROPDOWN
  const currentSchool = schools.find((s) => getId(s) === currentSchoolId) || null

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      {schools.length === 0 ? (
        <span className="text-sm text-t3">Nenhuma escola cadastrada.</span>
      ) : useDropdown ? (
        <SchoolDropdown
          schools={schools}
          currentSchool={currentSchool}
          onSelect={onSelect}
        />
      ) : (
        <div role="tablist" aria-label="Escolas" className="flex items-center gap-1 flex-wrap">
          {schools.map((school) => {
            const id = getId(school)
            const isActive = id === currentSchoolId
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(id)}
                className={`
                  inline-flex items-center gap-2 px-3 h-9 rounded-lg text-sm font-semibold
                  transition-colors max-w-[220px] border
                  ${isActive
                    ? 'bg-accent-l text-accent border-accent-l'
                    : 'bg-surf text-t2 border-bdr hover:border-t3 hover:text-t1'}
                `}
                title={school.name}
              >
                <span className="truncate">{school.name ?? id}</span>
                {school.status === 'suspended' && (
                  <Badge variant="warn">Suspensa</Badge>
                )}
              </button>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={handleCreate}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-bdr bg-surf text-sm font-semibold text-t1 hover:border-t1 hover:shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Nova escola
      </button>
    </div>
  )
}

// ─── Dropdown pesquisável (fallback p/ 6+ escolas) ────────────────────────────
function SchoolDropdown({ schools, currentSchool, onSelect }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)

  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return schools
    return schools.filter((s) =>
      normalize(s.name).includes(q) || normalize(s.slug).includes(q)
    )
  }, [schools, query])

  // Click outside
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

  // Reset busca + foca input ao abrir
  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setFocusedIdx(-1)
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [isOpen])

  const handleSelect = (school) => {
    onSelect(getId(school))
    setIsOpen(false)
  }

  const handleInputKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx((p) => (p + 1 < filtered.length ? p + 1 : p))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx((p) => (p > 0 ? p - 1 : -1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIdx >= 0 && focusedIdx < filtered.length) {
        handleSelect(filtered[focusedIdx])
      }
    }
  }

  const triggerLabel = currentSchool?.name ?? 'Selecionar escola'

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-bdr bg-surf text-sm font-semibold text-t1 hover:border-t1 transition-colors max-w-[280px] focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <span className="truncate">{triggerLabel}</span>
        {currentSchool?.status === 'suspended' && (
          <Badge variant="warn">Suspensa</Badge>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full mt-1 z-50 w-[280px] bg-surf border border-bdr rounded-lg shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-bdr">
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-expanded="true"
              aria-controls="school-dropdown-listbox"
              aria-autocomplete="list"
              placeholder="Buscar escola..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setFocusedIdx(-1) }}
              onKeyDown={handleInputKeyDown}
              className="w-full px-2 py-1.5 text-sm bg-surf2 border border-bdr rounded-md text-t1 placeholder:text-t3 focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <ul
            id="school-dropdown-listbox"
            role="listbox"
            aria-label="Lista de escolas"
            className="max-h-[280px] overflow-y-auto"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-sm text-t3 text-center">
                Nenhuma escola encontrada
              </li>
            )}
            {filtered.map((school, idx) => {
              const id = getId(school)
              const isActive = id === getId(currentSchool)
              const isFocused = focusedIdx === idx
              return (
                <li
                  key={id}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(school)}
                  onMouseEnter={() => setFocusedIdx(idx)}
                  className={`
                    px-3 py-2 cursor-pointer text-sm transition-colors flex items-center justify-between gap-2
                    ${isActive ? 'bg-accent-l text-accent font-semibold' : 'text-t1 hover:bg-surf2'}
                    ${isFocused && !isActive ? 'bg-surf2' : ''}
                  `}
                >
                  <span className="truncate">{school.name ?? id}</span>
                  {school.status === 'suspended' && (
                    <Badge variant="warn">Suspensa</Badge>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
