import { useState, useRef, useEffect } from 'react'
import { detectDropdownPlacement } from '../../lib/helpers/dropdown'

/**
 * SchoolActionsMenu — dropdown de ações administrativas SaaS para uma escola.
 *
 * Itens exibidos (sempre):
 *   - "Designar admin local"  → onAction('designate')
 *   - "Excluir"               → onAction('delete')
 *
 * Itens condicionais por status:
 *   - "Suspender"  → onAction('suspend')      (somente quando status === 'active')
 *   - "Reativar"   → onAction('reactivate')   (somente quando status === 'suspended')
 *
 * Protótipo puro: emite apenas o evento; integração com Cloud Functions
 * acontece em issues posteriores (>= 419).
 */
export default function SchoolActionsMenu({
  school = null,
  status,
  onAction = () => {},
  disabled = false,
  triggerLabel = 'Ações',
}) {
  // Status efetivo: prop explícita > school.status > 'active'
  const effectiveStatus = status ?? school?.status ?? 'active'
  const [isOpen, setIsOpen] = useState(false)
  const [placement, setPlacement] = useState('down')
  const [focusedIdx, setFocusedIdx] = useState(-1)

  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)

  // Monta lista de itens conforme status
  const items = [
    { value: 'designate', label: 'Designar admin local' },
    effectiveStatus === 'suspended'
      ? { value: 'reactivate', label: 'Reativar' }
      : { value: 'suspend',    label: 'Suspender' },
    { value: 'delete', label: 'Excluir', destructive: true },
  ]

  // Recalcular placement ao abrir
  useEffect(() => {
    if (!isOpen) return
    const newPlacement = detectDropdownPlacement(triggerRef.current, 160, null)
    setPlacement(newPlacement || 'down')
    setFocusedIdx(-1)
  }, [isOpen])

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

  const handleTriggerKeyDown = (e) => {
    if (disabled) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setIsOpen(true)
    }
  }

  const handleDropdownKeyDown = (e) => {
    if (!isOpen) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx((p) => (p + 1 < items.length ? p + 1 : p))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx((p) => (p > 0 ? p - 1 : -1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIdx >= 0 && focusedIdx < items.length) {
        handleSelect(items[focusedIdx].value)
      }
      return
    }
    if (e.key === 'Tab') {
      setIsOpen(false)
    }
  }

  const handleSelect = (value) => {
    // Emite (action, school) p/ compat com AdminPanelPage; quando school é null
    // o segundo arg é undefined e callbacks de 1 arg seguem funcionando.
    onAction(value, school ?? undefined)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Ações da escola"
        className="inline-flex items-center gap-1 px-3 h-8 rounded-lg border border-bdr bg-surf text-sm font-medium text-t1 hover:border-t1 hover:shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{triggerLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          role="menu"
          aria-label="Ações administrativas"
          onKeyDown={handleDropdownKeyDown}
          className={`
            absolute right-0 z-50 min-w-[200px]
            bg-surf border border-bdr rounded-lg shadow-lg overflow-hidden
            ${placement === 'down' ? 'top-full mt-1' : 'bottom-full mb-1'}
          `}
        >
          <div className="flex flex-col py-1">
            {items.map((item, idx) => (
              <button
                key={item.value}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(item.value)}
                onMouseEnter={() => setFocusedIdx(idx)}
                onMouseLeave={() => setFocusedIdx(-1)}
                className={`
                  w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer
                  ${item.destructive ? 'text-err hover:bg-err-l' : 'text-t1 hover:bg-surf2'}
                  ${focusedIdx === idx ? (item.destructive ? 'bg-err-l' : 'bg-surf2') : ''}
                `}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
