import { NavLink, useLocation } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'
import SchoolSwitcher from '../ui/SchoolSwitcher'

const ROLE_LABELS = {
  admin:                 'Admin',
  coordinator:           'Coordenador',
  'teacher-coordinator': 'Prof. Coordenador',
  teacher:               'Professor',
}

export default function Navbar() {
  const { user, role, logout, isCoordinator, isSaasAdmin } = useAuthStore()
  const isAdmin        = role === 'admin'
  const canAccessAdmin = isAdmin || isCoordinator()
  const displayName    = user?.displayName ?? 'Usuário'
  const photo          = user?.photoURL
  const { pathname }   = useLocation()
  const showBackToAdmin  = isSaasAdmin && pathname !== '/admin'
  const isInAdminPanel   = isSaasAdmin && pathname === '/admin'

  return (
    <nav className="bg-navy sticky top-0 z-50 shadow-sm">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        {/* Logo — sempre visível */}
        <NavLink
          to="/home"
          className="font-extrabold text-lg tracking-tight text-white shrink-0"
        >
          <span className="text-accent">Gestão</span>Escolar
        </NavLink>

        {/* Links de navegação */}
        <div className="flex items-center gap-3">
          {isInAdminPanel ? null : showBackToAdmin ? (
            <NavLink
              to="/admin"
              className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent/80 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Painel Admin
            </NavLink>
          ) : (
            <>
              <NavLink
                to="/home"
                className={({ isActive }) =>
                  `text-sm font-semibold transition-colors ${
                    isActive ? 'text-white' : 'text-white/60 hover:text-white/90'
                  }`
                }
              >
                Início
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `text-sm font-semibold transition-colors ${
                    isActive ? 'text-white' : 'text-white/60 hover:text-white/90'
                  }`
                }
              >
                Configurações
              </NavLink>
            </>
          )}
        </div>

        {/* Auth bar — todos os viewports */}
        <div className="flex items-center gap-2 shrink-0">
          {!isInAdminPanel && <SchoolSwitcher />}
          <div className="flex items-center gap-2">
            {photo ? (
              <img src={photo} alt={displayName} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/20 text-white text-xs font-bold flex items-center justify-center">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="hidden sm:block text-white/90 text-sm font-semibold max-w-[160px] truncate">{displayName}</span>
            {isSaasAdmin ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent text-white uppercase tracking-wide">
                SaaS Admin
              </span>
            ) : ROLE_LABELS[role] ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white/90 uppercase tracking-wide">
                {ROLE_LABELS[role]}
              </span>
            ) : null}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-2 h-8 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            title="Sair"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span className="hidden sm:inline text-sm font-semibold">Sair</span>
          </button>
        </div>

      </div>
    </nav>
  )
}
