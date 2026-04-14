title:	[Docs] Atualizar architecture.md com sistema de perfis de coordenador (#140-149)
state:	OPEN
author:	cisotar
labels:	enhancement
comments:	0
assignees:	
projects:	
milestone:	
number:	154
--
## Context
`references/architecture.md` foi escrita antes da implementação do sistema de coordenadores (tasks #140–#149). Roles novas, a coleção `pending_actions`, store guards, helpers do `useAuthStore` e as Firestore rules atualizadas não estão documentados, tornando o documento desatualizado como referência técnica.

## What to do
Atualizar as seções relevantes de `references/architecture.md`:

**Seção 4 — Banco de Dados:** adicionar `pending_actions`

**Seção 5 — useAuthStore:** atualizar `role` e adicionar novos helpers

**Seção 6 — Autenticação:** atualizar fluxo `_resolveRole` com `profile` → `role`

**Seção 7 — Roteamento:** atualizar guards com `canAccessAdmin`

**Seção 8 — Páginas:** adicionar coordinator às páginas administrativas

**Seção 9 — Lógica de Negócio:** documenter guards do `useAppStore`

**Seção 13 — Débitos Técnicos:** atualizar resolvidos e adicionar novos

## Files affected
- `references/architecture.md` — atualização de documentação

## Acceptance criteria
- [ ] Seção de Banco de Dados documenta `pending_actions`
- [ ] Seção de useAuthStore documenta novos roles e helpers
- [ ] Fluxo de autenticação reflete `profile` → `role` mapping
- [ ] Tabela de roteamento reflete acesso de coordenadores
- [ ] Débitos técnicos atualizados (resolvidos e novos)

## Notes
Sem mudanças de código — apenas documentação.

---

## Plano Técnico

### Análise do Codebase

Fontes de verdade consultadas:

- `src/store/useAuthStore.js` — estado atual: `role` inclui `'coordinator'` e `'teacher-coordinator'`; helpers `isCoordinator()`, `isGeneralCoordinator()`, `isTeacherCoordinator()`; campo `_unsubApproval`
- `src/store/useAppStore.js` — helpers internos `_isCoordinator()`, `_coordinatorCtx()`, `_submitApproval()`; 20 actions com guard de coordinator
- `src/App.jsx` — `canAccessAdmin = isAdmin || isCoordinator()` (linha 25); rotas sem guards individuais
- `src/lib/db.js` — funções `submitPendingAction`, `getPendingActions`, `approvePendingAction`, `rejectPendingAction`, `subscribePendingActionsCount`
- `firestore.rules` — regras atuais: `pending_actions` com `allow read: if isAdmin()`, `allow create: if isAuthenticated()`
- `references/architecture.md` — versão atual (pré-coordenadores)

### Cenários

**Caminho Feliz:**
É um PR de documentação pura — sem comportamento de runtime. O "caminho feliz" é o documento atualizado refletir com precisão o código atual.

**Casos de Borda:**
- Seção 13 (débitos) menciona "Regras Firestore não implementadas" como item aberto — precisa ser atualizado para refletir o estado parcialmente resolvido (pending_actions implantadas, mas coordenadores ainda não escrevem absences #151)
- `subs: {}` listado como débito técnico — agora resolvido pelo #153

**Tratamento de Erros:**
N/A — documentação.

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

**`references/architecture.md`** — 7 seções com mudanças exatas:

---

**Seção 1 — Versão:** atualizar data
```
**Versão:** 2.1.0 | **Atualizado:** 2026-04-13
```

---

**Seção 4 — Banco de Dados:** adicionar linha na tabela de coleções:
```
| `pending_actions` | Ações de coordenadores aguardando aprovação do admin | `id`, `coordinatorId`, `coordinatorName`, `action`, `payload`, `summary`, `status`, `reviewedBy`, `reviewedAt`, `rejectionReason` |
```

---

**Seção 5 — useAuthStore:** substituir bloco de estado e actions:

Estado — adicionar campos novos:
```js
{
  user:           null,
  role:           null,   // 'admin' | 'coordinator' | 'teacher-coordinator' | 'teacher' | 'pending' | null
  teacher:        null,
  loading:        true,
  pendingCt:      0,      // contagem de pending_teachers (só admin)
  _unsubPending:  null,   // unsub do listener de pending_teachers
  _unsubApproval: null,   // unsub do listener de pending_teachers/{uid} (só pending)
}
```

Actions — atualizar linha:
```
Actions: `init(teachers)`, `login()`, `logout()`, `isAdmin()`, `isTeacher()`, `isPending()`, `isCoordinator()`, `isGeneralCoordinator()`, `isTeacherCoordinator()`
```

Adicionar nota após actions:
```
**Helpers de role:**
- `isCoordinator()` → `true` para `'coordinator'` e `'teacher-coordinator'`
- `isGeneralCoordinator()` → `true` apenas para `'coordinator'`
- `isTeacherCoordinator()` → `true` apenas para `'teacher-coordinator'`
```

---

**Seção 6 — Autenticação:** substituir fluxo `_resolveRole`:
```
_resolveRole(user, teachers):
  1. isAdmin(email)?            → role = 'admin'  (hardcoded list + admins collection)
                                  inicia listener de pending_teachers para badge
  2. getTeacherByEmail() + status='approved'?
       teacher.profile === 'coordinator'         → role = 'coordinator'
       teacher.profile === 'teacher-coordinator' → role = 'teacher-coordinator'
       else                                      → role = 'teacher'
  3. else → role = 'pending' + requestTeacherAccess(user)
             inicia listener em pending_teachers/{uid} para detectar aprovação
```

---

**Seção 7 — Roteamento:** substituir bloco de rotas e adicionar nota sobre guards:
```
/               → redirect /dashboard (admin/coordinator) ou /home (teacher)
/home           → HomePage              (teacher)
/dashboard      → DashboardPage         (admin + coordinator + teacher, conteúdo diferenciado)
/calendar       → CalendarPage          (admin + coordinator)
/calendar/day   → CalendarDayPage       (mobile — requer location.state)
/absences       → AbsencesPage          (admin + coordinator + teacher)
/substitutions  → SubstitutionsPage     (admin + coordinator + teacher)
/schedule       → SchedulePage          (admin + teacher — grade individual)
/school-schedule→ SchoolSchedulePage    (admin + coordinator)
/settings       → SettingsPage          (tabs diferenciadas por role)
/workload       → WorkloadPage          (admin + coordinator)
```

Adicionar nota:
```
**Guard global em App.jsx:**
`canAccessAdmin = isAdmin || isCoordinator()` — determina redirect inicial e acesso a rotas admin.
Páginas não têm guards individuais; o Navbar filtra links visíveis por role.
```

---

**Seção 8 — Páginas:** atualizar tabela (coluna Role):
```
| `CalendarPage`      | admin + coordinator | Calendário semanal interativo... |
| `WorkloadPage`      | admin + coordinator | Tabela completa de carga horária... |
| `SchoolSchedulePage`| admin + coordinator | Grade horária geral da escola... |
| `SettingsPage`      | admin + coordinator + teacher | Admin: 8 tabs / Coordinator: aba Meu Perfil / Teacher: perfil + grade |
```

---

**Seção 9 — Lógica de Negócio:** adicionar subseção após `absences.js`:

```
### `useAppStore` — Guards de Coordenador

20 actions possuem guard que intercepta chamadas de coordenadores e submete como `pending_action`:

**Helpers internos:**
- `_isCoordinator()` — lê `useAuthStore.getState().isCoordinator()`; retorna `false` em caso de erro (evita circular dependency)
- `_coordinatorCtx()` — retorna `{ coordinatorId, coordinatorName }` do teacher logado
- `_submitApproval(action, payload, summary)` — chama `submitPendingAction()` e exibe toast

**Padrão de guard:**
```js
addSchedule: async (sched) => {
  if (_isCoordinator()) return _submitApproval('addSchedule', { sched }, `Adicionar aula ${sched.turma}`)
  // ... execução normal para admins
}
```

**Actions guardadas (20):** `addTeacher`, `updateTeacher`, `removeTeacher`, `addSchedule`, `removeSchedule`, `updateSchedule`, `addSegment`, `removeSegment`, `addGrade`, `removeGrade`, `addClassToGrade`, `removeClassFromGrade`, `savePeriodCfg`, `addArea`, `updateArea`, `removeArea`, `addSubject`, `removeSubject`, `saveAreaWithSubjects`, `setWorkload`
```

---

**Seção 13 — Débitos Técnicos:** substituir tabela:
```
| Item | Impacto | Status |
|---|---|---|
| `getDocs` one-shot → `onSnapshot` | Dados não atualizam sem reload | ✅ Resolvido (teachers, schedules, config via onSnapshot; absences e history lazy) |
| Regras Firestore básicas | `pending_actions` implantadas e ativas | ⚠️ Parcial — coordinators ainda não escrevem `absences` (#151) |
| Bundle único ~736KB | Carregamento inicial mais lento | 🔴 Aberto — avaliar `React.lazy` por página |
| Admins hardcoded em `db.js` | Adicionar admin requer deploy | 🔴 Aberto — mover para `admins` collection exclusivamente |
| Campo `subs: {}` em `useAppStore` | Código morto | ✅ Resolvido (#153) |
| Sem testes automatizados | Regressões difíceis de detectar | 🔴 Aberto |
| Coordenadores sem UI para ações submetidas | UX incompleto para coordenadores | 🔴 Aberto (#150) |
| Coordenadores não registram ausências no CalendarPage | Funcionalidade limitada | 🔴 Aberto (#151) |
| Coordenadores sem acesso à aba Horários | Não podem solicitar aulas | 🔴 Aberto (#152) |
```

### Arquivos que NÃO devem ser tocados
- Qualquer arquivo `.js` ou `.jsx` — é documentação apenas
- `specs/` — specs de features específicas, não arquitetura geral

### Dependências Externas
Nenhuma.

### Ordem de Implementação
1. Atualizar `references/architecture.md` de cima para baixo, seção por seção (1 → 4 → 5 → 6 → 7 → 8 → 9 → 13)
