import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'

// MOBILE-HAMBURGER: link estilizado para o menu mobile — remova junto com o bloco do menu
function MobileMenuLink({ to, onClick, children }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-colors
         ${isActive ? 'text-white bg-white/10' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
    >
      {children}
    </NavLink>
  )
}

export default function Navbar() {
  const { user, role, logout, pendingCt, isCoordinator } = useAuthStore()
  const navigate       = useNavigate()
  const isAdmin        = role === 'admin'
  const canAccessAdmin = isAdmin || isCoordinator()
  const firstName = user?.displayName?.split(' ')[0] ?? 'Usuário'
  const photo     = user?.photoURL

  // MOBILE-HAMBURGER: estado do menu mobile
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  const linkClass = ({ isActive }) =>
    `px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ` +
    (isActive
      ? 'bg-white/20 text-white'
      : 'text-white/70 hover:text-white hover:bg-white/10')

  return (
    <nav className="bg-navy sticky top-0 z-50 shadow-sm">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        {/* Logo — sempre visível */}
        <NavLink
          to={canAccessAdmin ? '/dashboard' : '/home'}
          className="font-extrabold text-lg tracking-tight text-white shrink-0"
        >
          <span className="text-accent">Gestão</span>Escolar
        </NavLink>

        {/* Tabs — só desktop */}
        <div className="hidden md:flex items-center gap-1 flex-1">
          <NavLink to={canAccessAdmin ? '/dashboard' : '/home'} className={linkClass}>🏠 Início</NavLink>
          <NavLink to="/absences" className={linkClass}>📋 Ausências</NavLink>
          <NavLink to="/substitutions" className={linkClass}>🔄 Substituições</NavLink>
          {canAccessAdmin && (
            <>
              <NavLink to="/calendar" className={linkClass}>📅 Calendário</NavLink>
              <NavLink to="/workload" className={linkClass}>⚖️ Carga</NavLink>
              <NavLink to="/school-schedule" className={linkClass}>🏫 Grade Escolar</NavLink>
            </>
          )}
        </div>

        {/* Auth bar — só desktop */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {photo ? (
              <img src={photo} alt={firstName} className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/20 text-white text-xs font-bold flex items-center justify-center">
                {firstName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-white/90 text-sm font-semibold max-w-[120px] truncate">{firstName}</span>
            {isAdmin && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white/90 uppercase tracking-wide">
                Admin
              </span>
            )}
          </div>
          <NavLink
            to="/settings"
            className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors text-base"
            title={canAccessAdmin ? 'Configurações' : 'Meu Perfil'}
          >
            ⚙️
            {isAdmin && pendingCt > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {pendingCt > 9 ? '9+' : pendingCt}
              </span>
            )}
          </NavLink>
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

        {/* Hamburger — só mobile */}
        <button
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
          onClick={() => setMenuOpen(v => !v)}
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
        >
          {menuOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          )}
        </button>
      </div>

      {/* MOBILE-HAMBURGER: menu mobile — remova este bloco para reverter */}
      {menuOpen && (
        <>
          {/* Overlay escuro para fechar ao clicar fora */}
          <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={closeMenu} />

          {/* Painel do menu */}
          <div className="absolute top-14 left-0 right-0 z-50 bg-navy border-t border-white/10 md:hidden shadow-lg">
            {/* Avatar + nome + badge */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              {photo ? (
                <img src={photo} alt={firstName} className="w-9 h-9 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-white/20 text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {firstName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-white font-semibold text-sm truncate">{firstName}</div>
                {isAdmin && (
                  <span className="text-[10px] font-bold text-white/60 uppercase tracking-wide">Admin</span>
                )}
              </div>
            </div>

            {/* Links de navegação */}
            <div className="py-1">
              <MobileMenuLink to={canAccessAdmin ? '/dashboard' : '/home'} onClick={closeMenu}>🏠 Início</MobileMenuLink>
              <MobileMenuLink to="/absences" onClick={closeMenu}>📋 Ausências</MobileMenuLink>
              <MobileMenuLink to="/substitutions" onClick={closeMenu}>🔄 Substituições</MobileMenuLink>
              {canAccessAdmin && (
                <>
                  <MobileMenuLink to="/calendar" onClick={closeMenu}>📅 Calendário</MobileMenuLink>
                  <MobileMenuLink to="/workload" onClick={closeMenu}>⚖️ Carga Horária</MobileMenuLink>
                  <MobileMenuLink to="/school-schedule" onClick={closeMenu}>🏫 Grade Escolar</MobileMenuLink>
                </>
              )}
              <MobileMenuLink to="/settings" onClick={closeMenu}>
                ⚙️ {canAccessAdmin ? 'Configurações' : 'Meu Perfil'}
                {isAdmin && pendingCt > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                    {pendingCt > 9 ? '9+' : pendingCt}
                  </span>
                )}
              </MobileMenuLink>
            </div>

            {/* Sair */}
            <div className="px-4 py-3 border-t border-white/10">
              <button
                onClick={() => { logout(); closeMenu() }}
                className="w-full text-left text-sm text-white/70 hover:text-white flex items-center gap-2 transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sair
              </button>
            </div>
          </div>
        </>
      )}
      {/* fim MOBILE-HAMBURGER */}
    </nav>
  )
}
