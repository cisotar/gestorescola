# Spec: Navbar Mobile com Hamburger + Card de Professor em CalendarDayPage

## Contexto

Dois problemas visuais no mobile:

1. **Navbar transborda** para a direita — os links de navegação e a auth bar não cabem em telas estreitas.
2. **CalendarDayPage** tem um cabeçalho mínimo (apenas botão Voltar + nome do professor) sem contexto visual suficiente para o admin saber com quem está trabalhando.

---

## Parte 1 — Navbar Mobile com Hamburger Menu

### Arquivo alterado: `src/components/layout/Navbar.jsx`

### Comportamento atual (problemático no mobile)

Logo + tabs + avatar + badge Admin + ⚙️ + botão sair → tudo em uma linha → transborda.

### Comportamento desejado

**Mobile (< md):**
- Exibe apenas: **Logo** (link para home) + **botão ☰** (hamburger) à direita
- Ao clicar em ☰, um menu desliza ou aparece abaixo da navbar com todos os itens:
  - 🏠 Início
  - 📋 Relatório de Ausências
  - ⚙️ Configurações / Meu Perfil
  - Nome + avatar do usuário (informativo)
  - Badge Admin (se aplicável)
  - Botão Sair
- Clicar em qualquer link fecha o menu
- Clicar fora do menu (overlay) fecha o menu

**Desktop (≥ md):** layout atual inalterado.

### Estrutura do componente

```jsx
// estado local
const [menuOpen, setMenuOpen] = useState(false)
const closeMenu = () => setMenuOpen(false)
```

**Navbar bar (sempre visível):**
```jsx
<nav className="bg-navy sticky top-0 z-50 shadow-sm">
  <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">

    {/* Logo — visível sempre */}
    <NavLink to={isAdmin ? '/dashboard' : '/home'} className="font-extrabold text-lg tracking-tight text-white shrink-0">
      <span className="text-accent">Gestão</span>Escolar
    </NavLink>

    {/* Tabs — só desktop */}
    <div className="hidden md:flex items-center gap-1 flex-1 ml-4"> ... </div>

    {/* Auth bar — só desktop */}
    <div className="hidden md:flex items-center gap-2 shrink-0"> ... </div>

    {/* Hamburger — só mobile */}
    <button className="md:hidden ..." onClick={() => setMenuOpen(v => !v)}>
      {/* ícone ☰ — três linhas SVG */}
    </button>
  </div>

  {/* Menu mobile — MOBILE-HAMBURGER: remova este bloco para reverter */}
  {menuOpen && (
    <>
      {/* Overlay para fechar ao clicar fora */}
      <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={closeMenu} />

      {/* Painel do menu */}
      <div className="absolute top-14 left-0 right-0 z-50 bg-navy border-t border-white/10 md:hidden shadow-lg">
        {/* Avatar + nome + badge */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          {/* avatar */}
          <div className="flex-1 min-w-0">
            <div className="text-white font-semibold text-sm truncate">{firstName}</div>
            {isAdmin && <span className="text-[10px] font-bold text-white/60 uppercase tracking-wide">Admin</span>}
          </div>
        </div>

        {/* Links de navegação */}
        <nav className="py-1">
          <MobileMenuLink to={isAdmin ? '/dashboard' : '/home'} onClick={closeMenu}>🏠 Início</MobileMenuLink>
          <MobileMenuLink to="/absences" onClick={closeMenu}>📋 Relatório de Ausências</MobileMenuLink>
          <MobileMenuLink to="/settings" onClick={closeMenu}>⚙️ {isAdmin ? 'Configurações' : 'Meu Perfil'}</MobileMenuLink>
        </nav>

        {/* Sair */}
        <div className="px-4 py-3 border-t border-white/10">
          <button onClick={() => { logout(); closeMenu() }} className="w-full text-left text-sm text-white/70 hover:text-white flex items-center gap-2">
            {/* ícone sair */} Sair
          </button>
        </div>
      </div>
    </>
  )}
</nav>
```

**Componente auxiliar `MobileMenuLink`** (local, não exportado):
```jsx
function MobileMenuLink({ to, onClick, children }) {
  return (
    <NavLink
      to={to} onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-colors
         ${isActive ? 'text-white bg-white/10' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
    >
      {children}
    </NavLink>
  )
}
```

**Ícone hamburger / X (SVG inline, sem dependência):**
```jsx
{menuOpen
  ? <svg ...>/* X */</svg>
  : <svg ...>/* três linhas */</svg>
}
```

---

## Parte 2 — Card de Professor em CalendarDayPage

### Arquivo alterado: `src/pages/CalendarDayPage.jsx`

### Comportamento atual

Cabeçalho mínimo:
```
← Voltar   [Nome do professor]
           [Seg · 07/04/2025]
```

### Comportamento desejado

Substituir o cabeçalho por um **card** com:

```
← Voltar

┌─────────────────────────────────────────┐
│  [Avatar]  Nome do Professor            │
│            Matérias · N aulas cadastradas│
│            ● falta  (se houver)         │
└─────────────────────────────────────────┘
```

O avatar usa `colorOfTeacher` (já importado em CalendarPage — importar também em CalendarDayPage).
O campo de matérias usa `teacherSubjectNames` (já disponível em helpers).
O indicador `● falta` aparece apenas se o professor tiver alguma ausência registrada.

### Implementação

Adicionar imports necessários em `CalendarDayPage.jsx`:
```js
import { colorOfTeacher, teacherSubjectNames, formatBR, dateToDayLabel } from '../lib/helpers'
```

Substituir o bloco do cabeçalho atual:

```jsx
{/* Cabeçalho atual — substituir */}
<div className="flex items-center gap-3 mb-4">
  <button onClick={() => navigate(-1)} ...>← Voltar</button>
  <div>...</div>
</div>
```

Por:

```jsx
{/* MOBILE-DAY-PAGE: cabeçalho com card de professor */}
<div className="mb-4">
  <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm mb-3">← Voltar</button>

  <div className="card flex items-center gap-3">
    {/* Avatar com cor do professor */}
    <div
      className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold shrink-0"
      style={{ background: cv.tg, color: cv.tx }}
    >
      {teacher.name.charAt(0)}
    </div>

    <div className="flex-1 min-w-0">
      <div className="font-extrabold text-base truncate">{teacher.name}</div>
      <div className="text-xs text-t2 truncate">
        {teacherSubjectNames(teacher, store.subjects) || '—'} · {mine.length} aula{mine.length !== 1 ? 's' : ''} cadastrada{mine.length !== 1 ? 's' : ''}
      </div>
      {hasAbs && <span className="text-[10px] text-err font-bold">● possui faltas registradas</span>}
    </div>
  </div>
</div>
{/* fim MOBILE-DAY-PAGE cabeçalho */}
```

Variáveis adicionais necessárias logo após `const mine = ...`:
```js
const cv     = colorOfTeacher(teacher, store)
const hasAbs = (store.absences ?? []).some(ab => ab.teacherId === teacher.id)
```

---

## Arquivos Alterados

| Arquivo | Ação |
|---|---|
| `src/components/layout/Navbar.jsx` | Hamburger menu no mobile, layout desktop inalterado |
| `src/pages/CalendarDayPage.jsx` | Substituir cabeçalho minimalista por card de professor |

---

## Desfazer / Remover

**Navbar:** remover o bloco `{/* MOBILE-HAMBURGER */}`, o estado `menuOpen` e o componente `MobileMenuLink`. Restaurar `hidden sm:*` → `flex` nos blocos de tabs e auth bar.

**CalendarDayPage:** substituir o bloco `MOBILE-DAY-PAGE: cabeçalho com card` pelo cabeçalho original de duas linhas.

---

## Verificação Manual

**Navbar:**
- [ ] Mobile — navbar exibe apenas Logo + ☰, sem transbordar
- [ ] Mobile — clicar em ☰ abre o menu com todos os links
- [ ] Mobile — clicar em um link navega e fecha o menu
- [ ] Mobile — clicar fora do menu (overlay) fecha o menu
- [ ] Mobile — ícone muda de ☰ para ✕ quando o menu está aberto
- [ ] Desktop — navbar inalterada, ☰ invisível

**CalendarDayPage:**
- [ ] Mobile — card exibe avatar colorido, nome, matérias e quantidade de aulas
- [ ] Mobile — indicador `● possui faltas registradas` aparece quando há faltas
- [ ] Mobile — botão "← Voltar" acima do card, funcional
