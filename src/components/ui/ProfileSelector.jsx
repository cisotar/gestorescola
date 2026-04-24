import { useState, useRef, useEffect } from 'react'
import { detectDropdownPlacement } from '../../lib/helpers/dropdown'

const PROFILE_OPTIONS = [
  { value: 'teacher', label: 'Professor' },
  { value: 'coordinator', label: 'Coordenador' },
  { value: 'teacher-coordinator', label: 'Prof. Coordenador' }
]

export default function ProfileSelector({
  value = null,
  onChange = () => {},
  disabled = false,
  containerRef = null,
  dropdownHeight = 120,
  triggerClassName = ''
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [placement, setPlacement] = useState('down')
  const [focusedIdx, setFocusedIdx] = useState(-1)

  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)

  // Calcular placement ao abrir dropdown
  useEffect(() => {
    if (!isOpen) return

    const container = containerRef?.current || containerRef || null
    const newPlacement = detectDropdownPlacement(
      triggerRef.current,
      dropdownHeight,
      container
    )
    setPlacement(newPlacement || 'down')
    setFocusedIdx(-1) // Reseta focus no keyboard ao abrir
  }, [isOpen, containerRef, dropdownHeight])

  // Click outside handler
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e) => {
      if (
        !triggerRef.current?.contains(e.target) &&
        !dropdownRef.current?.contains(e.target)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Keyboard handlers para o trigger
  const handleTriggerKeyDown = (e) => {
    if (disabled) return

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setIsOpen(true)
    }
  }

  // Keyboard handlers para o dropdown
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
      setFocusedIdx((prev) => {
        const next = prev + 1
        return next < PROFILE_OPTIONS.length ? next : prev
      })
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx((prev) => (prev > 0 ? prev - 1 : -1))
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIdx >= 0 && focusedIdx < PROFILE_OPTIONS.length) {
        handleSelectOption(PROFILE_OPTIONS[focusedIdx].value)
      }
      return
    }

    if (e.key === 'Tab') {
      setIsOpen(false)
    }
  }

  const handleSelectOption = (optionValue) => {
    onChange(optionValue)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const handleOpenDropdown = () => {
    if (disabled) return
    setIsOpen(true)
  }

  // Obter label do botão trigger
  const selectedLabel = PROFILE_OPTIONS.find(
    (opt) => opt.value === value
  )?.label
  const triggerLabel = selectedLabel || 'Selecionar Perfil'

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpenDropdown}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Selecionar perfil do professor"
        className={`
          px-4 py-2 rounded-lg border text-sm font-medium transition-colors
          bg-surf border-bdr text-t1
          hover:border-t1 hover:shadow-sm
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-0
          ${triggerClassName}
        `}
      >
        {triggerLabel}
      </button>

      {/* Dropdown Container */}
      {isOpen && (
        <div
          ref={dropdownRef}
          role="listbox"
          aria-label="Opções de perfil do professor"
          onKeyDown={handleDropdownKeyDown}
          className={`
            absolute left-0 z-50 w-full min-w-max
            bg-surf border border-bdr rounded-lg shadow-lg overflow-hidden
            ${placement === 'down' ? 'top-full mt-1' : 'bottom-full mb-1'}
          `}
        >
          <div className="flex flex-col">
            {PROFILE_OPTIONS.map((option, idx) => (
              <div
                key={option.value}
                role="option"
                aria-selected={value === option.value}
                onClick={() => handleSelectOption(option.value)}
                onMouseEnter={() => setFocusedIdx(idx)}
                onMouseLeave={() => setFocusedIdx(-1)}
                className={`
                  px-4 py-2.5 cursor-pointer text-sm transition-colors
                  ${
                    value === option.value
                      ? 'bg-accent-l text-accent font-semibold'
                      : 'text-t1 hover:bg-surf2'
                  }
                  ${focusedIdx === idx ? 'bg-surf2' : ''}
                `}
              >
                {option.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
