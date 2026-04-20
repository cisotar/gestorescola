// ProfilePillDropdown — dropdown de seleção de perfil de professor
// Reutilizado em TabTeachers e TabProfile

import { useState } from 'react'
import { PROFILE_OPTIONS } from '../../../lib/settingsHelpers'

export default function ProfilePillDropdown({ value, onChange, options = PROFILE_OPTIONS, disabled, placeholder = 'Selecionar perfil ▾' }) {
  const [open, setOpen] = useState(false)
  const opt = options.find(o => o.value === value)

  if (disabled) return opt
    ? <span className={`badge border text-[10px] ${opt.pill}`}>{opt.label}</span>
    : <span className="badge border text-[10px] bg-gray-100 text-gray-400 border-gray-200">{placeholder}</span>

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className={opt
          ? `badge border text-[10px] cursor-pointer hover:opacity-80 ${opt.pill}`
          : 'badge border text-[10px] cursor-pointer bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
        }
      >{opt ? `${opt.label} ▾` : placeholder}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-bg border border-bdr rounded-lg shadow-lg py-1 min-w-[140px]">
            {options.map(o => (
              <button key={o.value}
                onClick={() => { setOpen(false); onChange(o.value) }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surf2 flex items-center gap-2 ${o.value === value ? 'font-bold' : ''}`}
              >
                <span className={`badge border text-[10px] ${o.pill}`}>{o.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
