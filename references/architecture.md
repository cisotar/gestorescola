# Arquitetura — GestãoEscolar

**Versão:** 2.0.0 | **Atualizado:** 2026-04-08 | **Firebase Project:** `gestordesubstituicoes`

---

## 1. Stack Tecnológica

| Componente | Versão | Propósito |
|---|---|---|
| **React** | 18.3.1 | Framework UI |
| **React Router** | 6.26.0 | Roteamento SPA |
| **Zustand** | 4.5.4 | Gerenciamento de estado |
| **Firebase** | 10.12.2 | Auth + Firestore + Hosting |
| **Tailwind CSS** | 3.4.10 | Estilização |
| **Vite** | 5.4.1 | Build tool |

**Scripts:**
```bash
npm run dev      # dev server Vite
npm run build    # build produção → dist/
firebase deploy  # deploy → gestordesubstituicoes-react.web.app
```

---

## 2. Estrutura de Pastas

```
src/
├── App.jsx              # Raiz: rotas, guards, init
├── main.jsx             # Entry point
├── pages/               # 8 páginas
│   ├── LoginPage.jsx
│   ├── PendingPage.jsx
│   ├── HomePage.jsx
│   ├── DashboardPage.jsx
│   ├── CalendarPage.jsx
│   ├── CalendarDayPage.jsx
│   ├── AbsencesPage.jsx
│   └── SettingsPage.jsx
├── components/
│   ├── layout/
│   │   ├── Layout.jsx   # Wrapper Navbar + Outlet
│   │   └── Navbar.jsx   # Desktop tabs + Mobile hamburger
│   └── ui/
│       ├── Modal.jsx
│       ├── ActionCard.jsx
│       ├── Toast.jsx
│       └── Spinner.jsx
├── store/
│   ├── useAppStore.js   # Estado da aplicação
│   └── useAuthStore.js  # Estado de autenticação
├── lib/
│   ├── firebase.js      # Inicialização Firebase
│   ├── db.js            # CRUD Firestore + cache local
│   ├── helpers.js       # Utilidades gerais
│   ├── constants.js     # DAYS, COLOR_PALETTE
│   ├── periods.js       # Lógica de períodos/slots
│   ├── absences.js      # Lógica de ausências + ranking
│   └── reports.js       # Geração de PDFs
└── hooks/
    └── useToast.js      # Toast store + helper global
```

---

## 3. Firebase

**`src/lib/firebase.js`** exporta:
```js
export const db       = getFirestore(app)
export const auth     = getAuth(app)
export const provider = new GoogleAuthProvider()
```

**`firebase.json`** — SPA rewrite:
```json
{ "rewrites": [{ "source": "**", "destination": "/index.html" }] }
```

---

## 4. Banco de Dados — Coleções Firestore

| Coleção | Propósito | Campos principais |
|---|---|---|
| `meta/config` | Doc único de configuração global | `segments`, `periodConfigs`, `areas`, `subjects`, `workloadWarn`, `workloadDanger` |
| `teachers` | Professores aprovados | `id`, `name`, `email`, `celular`, `subjectIds[]`, `status` |
| `schedules` | Grade horária por professor | `id`, `teacherId`, `day`, `timeSlot`, `turma`, `subjectId` |
| `absences` | Faltas registradas | `id`, `teacherId`, `createdAt`, `status`, `slots[]` |
| `history` | Histórico de substituições realizadas | `id`, `teacherId`, `subId`, `date`, `day`, `slotLabel` |
| `pending_teachers` | Pedidos de acesso aguardando aprovação | `id`, `uid`, `email`, `name`, `photoURL`, `requestedAt`, `status`, `celular?` |
| `admins` | Administradores (além dos hardcoded) | `email`, `name`, `addedAt` |

**Formato de slot:** `"segmentId|turno|aulaIdx"` — ex: `"seg-fund|manha|1"`

**Status de ausência:** `open` | `partial` | `covered`

**Carga/Save:**
- Leitura inicial: `getDocs` em paralelo via `Promise.all`
- Escrita: `writeBatch` (chunked a 400 docs) + `localStorage` como fallback (`gestao_v7_cache`)
- Cada mutação no store chama `get().save()` automaticamente

---

## 5. Gerenciamento de Estado (Zustand)

### `useAuthStore`

```js
{
  user:      null,    // Firebase user object
  role:      null,    // 'admin' | 'teacher' | 'pending' | null
  teacher:   null,    // doc do professor (se role === 'teacher')
  loading:   true,
  pendingCt: 0,       // contagem de pedidos pendentes (só admin)
}
```

Actions: `init(teachers)`, `login()`, `logout()`, `isAdmin()`, `isTeacher()`, `isPending()`

### `useAppStore`

Estado central da aplicação com 45+ actions:

| Categoria | Actions |
|---|---|
| Hidratação | `hydrate(data)` |
| Segmentos | `addSegment`, `removeSegment`, `setSegmentTurno`, `addGrade`, `removeGrade`, `addClassToGrade`, `removeClassFromGrade` |
| Períodos | `savePeriodCfg` |
| Áreas | `addArea`, `updateArea`, `removeArea` |
| Disciplinas | `addSubject`, `removeSubject`, `saveAreaWithSubjects` |
| Professores | `addTeacher`, `updateTeacher`, `removeTeacher` |
| Horários | `addSchedule`, `removeSchedule`, `updateSchedule` |
| Ausências | `createAbsence`, `assignSubstitute`, `deleteAbsenceSlot`, `deleteAbsence`, `clearDaySubstitutes`, `clearDayAbsences` |
| Histórico | `addHistory`, `deleteHistory` |
| Config | `setWorkload` |

**Padrão imutável obrigatório:**
```js
// Toda mutação usa set(s => ...) e chama get().save() no final
set(s => ({
  teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t)
}))
get().save()
```

### `useToastStore` (via `hooks/useToast.js`)

```js
// Importar o helper, não o store diretamente
import { toast } from '../hooks/useToast'
toast('Mensagem salva', 'ok')      // tipos: 'ok' | 'warn' | 'err' | 'local'
// Auto-hide após 3000ms
```

---

## 6. Autenticação — Fluxo Completo

```
App carrega
  ↓
loadFromFirestore() → hydrate(data)              [useEffect 1 — App.jsx]
  ↓
init(teachers) (aguarda loaded = true)           [useEffect 2 — App.jsx]
  ↓
onAuthStateChanged(auth, user => ...)
  ↓
_resolveRole(user, teachers):
  1. isAdmin(email)?            → role = 'admin'  (hardcoded list + admins collection)
  2. getTeacherByEmail() + status='approved'? → role = 'teacher'
  3. else                       → role = 'pending' + requestTeacherAccess(user)
  ↓
set({ loading: false })

Renderização por role (App.jsx):
  loading || !loaded  → <Spinner>
  !role               → <LoginPage>
  role === 'pending'  → <PendingPage>
  else                → <Layout> + <Routes>
```

**Método de login:** `signInWithPopup(auth, GoogleAuthProvider)`

**Admins hardcoded** (em `db.js` — necessário deploy para alterar):
```js
const HARDCODED_ADMINS = [
  'contato.tarciso@gmail.com',
  'tarciso@prof.educacao.sp.gov.br',
  'fernandamarquesi@prof.educacao.sp.gov.br',
]
```

**Limitação atual:** `getDocs` one-shot — novos pedidos de aprovação e professores recém-aprovados só aparecem após reload da página. A spec `spec_atualizacao_tempo_real.md` cobre a correção com `onSnapshot`.

---

## 7. Roteamento

```
/               → redirect /dashboard (admin) ou /home (teacher)
/home           → HomePage            (teacher)
/dashboard      → DashboardPage       (admin + teacher, conteúdo diferenciado)
/calendar       → CalendarPage        (admin)
/calendar/day   → CalendarDayPage     (mobile — requer location.state)
/absences       → AbsencesPage        (admin + teacher)
/settings       → SettingsPage        (tabs diferenciadas por role)
```

**Guards:** implícitos — `App.jsx` controla o que renderiza antes das rotas.
Páginas não têm guards próprios.

**Passagem de estado entre rotas:**
```js
navigate('/calendar/day', { state: { teacherId, segId, weekDates, todayISO } })
// Acessado com: const { teacherId } = useLocation().state ?? {}
```

**Query params para tab inicial:**
```js
// Ex: /settings?tab=teachers
const tab = new URLSearchParams(useLocation().search).get('tab')
```

---

## 8. Páginas

| Página | Role | Responsabilidade |
|---|---|---|
| `LoginPage` | — | Botão "Entrar com Google" |
| `PendingPage` | pending | Mensagem de espera + campo de telefone opcional |
| `HomePage` | teacher | Saudação + stats do mês + action cards |
| `DashboardPage` | admin+teacher | Alertas de carga, stats globais, histórico, tabela de carga horária |
| `CalendarPage` | admin | Calendário semanal interativo, ranking de substitutos, DayModal |
| `CalendarDayPage` | admin | Visão mobile: pills de dias, swipe, cards de período colapsáveis |
| `AbsencesPage` | ambos | Relatórios em 4 abas (por prof / dia / semana / mês) + export PDF |
| `SettingsPage` | ambos | Admin: 6 tabs de config / Teacher: perfil + grade horária |

**Componentes internos:** definidos no mesmo arquivo da página (acima do `export default`).
Não são exportados — só usados localmente.

---

## 9. Lógica de Negócio (`src/lib/`)

### `periods.js`
- `gerarPeriodos(cfg)` — gera lista de aulas/intervalos a partir de `{ inicio, duracao, qtd, intervalos }`
- `makeSlot(segId, turno, aulaIdx)` / `parseSlot(timeSlot)` — serialização de slots
- `slotLabel(timeSlot, periodConfigs)` → `"1ª Aula"` | `slotFullLabel` → `"1ª Aula (07:00–07:50)"`

### `absences.js`
- `rankCandidates(...)` — score de compatibilidade para substitutos:
  - ⭐ Mesma matéria + mesmo segmento (score máximo)
  - ⭐ Mesma matéria + outro segmento
  - 🔵 Mesma área + mesmo segmento
  - 🔵 Mesma área + outro segmento
  - ⚪ Outra área
  - Desempate: menor carga horária mensal (`monthlyLoad`)
- `isBusy(teacherId, date, timeSlot, ...)` — detecta conflito de horário
- `monthlyLoad(teacherId, referenceDate, ...)` — soma aulas + subs do mês

### `reports.js`
- Gera HTML com CSS de impressão e abre `window.print()`
- `generateDayHTML`, `generateTeacherHTML`, `generateByDayHTML`, `generateByWeekHTML`, `generateByMonthHTML`

### `helpers.js`
- `uid()` — ID: timestamp base36 + random (7 chars) — **usar sempre, nunca index de array**
- `colorOfTeacher(teacher, store)` — cor baseada na primeira matéria do professor
- `teacherSubjectNames(teacher, subjects)` → `"Matéria1, Matéria2"`
- `formatISO(d)`, `formatBR(s)`, `parseDate(s)`, `dateToDayLabel(s)`, `weekStart(s)`, `businessDaysBetween(from, to)`
- `allTurmaObjects(segments)` — flatten de todas as turmas com metadata completo

---

## 10. Estilização

**Tokens Tailwind customizados:**

| Token | Hex | Uso |
|---|---|---|
| `navy` | `#1A1814` | Botões dark, navbar, texto primário |
| `accent` | `#C05621` | Destaque, ação principal |
| `accent-l` | `#FFF7ED` | Background de destaque suave |
| `surf` | `#FFFFFF` | Cards, modais |
| `surf2` | `#F4F2EE` | Backgrounds secundários, hover |
| `bg` | `#F7F6F2` | Background de página |
| `bdr` | `#E5E2D9` | Bordas |
| `t1` / `t2` / `t3` | cinzas | Hierarquia de texto (dark → light) |
| `ok` / `ok-l` | verde | Sucesso |
| `err` / `err-l` | vermelho | Erro |
| `warn` | âmbar | Alerta |

**Fontes:** Figtree (`font-sans`) + DM Mono (`font-mono`) via Google Fonts no `index.html`

**Classes utilitárias customizadas** (definidas via `@apply` no CSS global):

| Classe | Uso |
|---|---|
| `btn` | Botão base |
| `btn-dark` | Botão navy preenchido |
| `btn-ghost` | Botão transparente com borda |
| `inp` | Campo de input padrão |
| `card` | Container com borda e sombra suave |
| `lbl` | Label de formulário |

**Responsividade:** mobile-first, breakpoints padrão Tailwind (`md:768px`, `lg:1024px`)

---

## 11. Componentes Compartilhados

| Componente | Propósito |
|---|---|
| `Modal` | Overlay fixed, z-200, Escape to close, max-h 90vh com scroll, tamanhos: sm/md/2xl/4xl |
| `ActionCard` | Card clicável: ícone + label + desc + chevron, variante primary (navy) ou default |
| `Toast` | Mensagem temporária fixed bottom-center, conectada ao `useToastStore` |
| `Spinner` | Spinner de loading com `animate-spin`, tamanho customizável |
| `Navbar` | Desktop: tabs + avatar; Mobile: hamburger com overlay e menu lateral |
| `Layout` | Wrapper com Navbar + `<Outlet>`, max-width 1400px |

---

## 12. Convenções de Código

| Aspecto | Convenção |
|---|---|
| **IDs** | Sempre `uid()` de `helpers.js` — nunca index de array |
| **Mutações de estado** | `set(s => { ... })` imutável + `get().save()` ao final |
| **Componentes internos** | Definidos no mesmo arquivo, acima do `export default`, sem export |
| **Callbacks de evento** | Prefixo `handle` — ex: `handleSave`, `handleMarkAbsent` |
| **Props de fechar modal** | Sempre `onClose` |
| **Estado entre rotas** | `location.state` via React Router |
| **Detecção mobile** | `window.innerWidth < 1024` (CalendarPage) |
| **Toast** | `import { toast } from '../hooks/useToast'` + `toast('msg', 'ok')` |
| **Nomes de arquivos** | Páginas/Componentes: `PascalCase.jsx` / Libs: `camelCase.js` |

---

## 13. Débitos Técnicos e Limitações Conhecidas

| Item | Impacto | Spec de correção |
|---|---|---|
| `getDocs` one-shot em vez de `onSnapshot` | Dados não atualizam sem reload | `spec_atualizacao_tempo_real.md` |
| Regras Firestore não implementadas | Qualquer usuário autenticado pode ler/escrever | — |
| Bundle único ~736KB | Carregamento inicial mais lento | Avaliar `React.lazy` por página |
| Admins hardcoded em `db.js` | Adicionar admin requer deploy | Mover para `admins` collection exclusivamente |
| Campo `subs: {}` em `useAppStore` | Código morto | Remover |
| Sem testes automatizados | Regressões difíceis de detectar | — |

---

## 14. Fluxo de Dados

```
Firestore
    ↓  loadFromFirestore() na inicialização
useAppStore (Zustand)          ← estado central
    ↓  lido via hooks nas páginas
Páginas / Componentes
    ↓  ações do usuário
store.actionName()
    ↓  set() imutável + get().save()
Firestore + localStorage       ← persistência
```
