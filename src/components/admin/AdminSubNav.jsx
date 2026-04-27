const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calendar',  label: 'Calendar' },
  { id: 'settings',  label: 'Settings' },
]

/**
 * AdminSubNav — sub-navegação interna do AdminPanelPage.
 *
 * Componente totalmente controlado: o pai gerencia o estado da seção
 * ativa e recebe callback `onChange(section)` quando o usuário troca.
 *
 * Estética alinhada ao padrão de tabs do `SettingsPage` (bg-navy/text-white
 * para ativo, bg-surf/text-t2 para inativo).
 *
 * Props:
 *   section: 'dashboard' | 'calendar' | 'settings' (default 'dashboard')
 *   onChange: (section) => void
 */
export default function AdminSubNav({ section = 'dashboard', onChange }) {
  const active = SECTIONS.some(s => s.id === section) ? section : 'dashboard'

  const tabClass = (id) =>
    `px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border whitespace-nowrap ` +
    (active === id
      ? 'bg-navy text-white border-navy'
      : 'bg-surf text-t2 border-bdr hover:border-t3')

  return (
    <div className="flex gap-1.5 flex-wrap mb-6" role="tablist" aria-label="Seção do painel admin">
      {SECTIONS.map(s => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={active === s.id}
          className={tabClass(s.id)}
          onClick={() => onChange?.(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
