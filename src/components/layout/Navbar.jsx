import { NavLink, useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'

export default function Navbar() {
  const { user, role, logout } = useAuthStore()
  const navigate = useNavigate()
  const isAdmin = role === 'admin'
  const firstName = user?.displayName?.split(' ')[0] ?? 'Usuário'
  const photo = user?.photoURL

  const linkClass = ({ isActive }) =>
    `px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ` +
    (isActive
      ? 'bg-white/20 text-white'
      : 'text-white/70 hover:text-white hover:bg-white/10')

  return (
    <nav className="bg-navy sticky top-0 z-50 shadow-sm">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
        {/* Logo */}
        <NavLink
          to="/dashboard"
          className="font-extrabold text-lg tracking-tight text-white shrink-0 mr-1"
        >
          <span className="text-accent">Gestão</span>Escolar
        </NavLink>

        {/* Tabs */}
        <div className="flex items-center gap-1 flex-1">
          <NavLink to="/dashboard" className={linkClass}>🏠 Início</NavLink>
          <NavLink to="/absences"  className={linkClass}>📋 Relatório de Ausências</NavLink>
        </div>

        {/* Auth bar */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Avatar + nome */}
          <div className="flex items-center gap-2">
            {photo ? (
              <img src={photo} alt={firstName} className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/20 text-white text-xs font-bold flex items-center justify-center">
                {firstName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-white/90 text-sm font-semibold hidden sm:block max-w-[120px] truncate">
              {firstName}
            </span>
            {isAdmin && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white/90 uppercase tracking-wide hidden sm:inline">
                Admin
              </span>
            )}
          </div>

          {/* Configurações */}
          <NavLink
            to="/settings"
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors text-base"
            title={isAdmin ? 'Configurações' : 'Meu Perfil'}
          >
            ⚙️
          </NavLink>

          {/* Sair */}
          <button
            onClick={logout}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            title="Sair"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </nav>
  )
}
