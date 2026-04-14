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

**Seção 4 — Banco de Dados:** adicionar coleções:
- `pending_actions` — campos: `id`, `coordinatorId`, `coordinatorName`, `action`, `payload`, `summary`, `status`, `reviewedBy`, `reviewedAt`, `rejectionReason`

**Seção 5 — useAuthStore:** atualizar:
- `role` agora inclui `'coordinator'` e `'teacher-coordinator'`
- Novos helpers: `isCoordinator()`, `isGeneralCoordinator()`, `isTeacherCoordinator()`
- Campo `_unsubApproval` (listener de aprovação para pending)

**Seção 6 — Autenticação:** atualizar fluxo `_resolveRole`:
- Passo 2 agora resolve `profile` (coordinator / teacher-coordinator / teacher)
- Tabela de roles: adicionar coordinator e teacher-coordinator

**Seção 7 — Roteamento:** atualizar guards:
- `canAccessAdmin = isAdmin || isCoordinator()` em App.jsx e Navbar
- Coordinator acessa `/dashboard`, `/calendar`, `/workload`, `/school-schedule`, `/settings`

**Seção 8 — Páginas:** atualizar tabela:
- CalendarPage, WorkloadPage, SchoolSchedulePage, SettingsPage: adicionar coordinator ao role

**Seção 13 — Débitos Técnicos:** atualizar:
- Marcar "Regras Firestore" como resolvido (pending_actions e regras básicas implantadas)
- Adicionar item: coordenadores não têm UI para ver suas ações submetidas (#150)
- Adicionar item: coordenadores não podem registrar ausências (#151)

## Files affected
- `references/architecture.md` — atualização de documentação

## Acceptance criteria
- [ ] Seção de Banco de Dados documenta `pending_actions`
- [ ] Seção de useAuthStore documenta novos roles e helpers
- [ ] Fluxo de autenticação reflete `profile` → `role` mapping
- [ ] Tabela de roteamento reflete acesso de coordenadores
- [ ] Débitos técnicos atualizados (resolvidos e novos)

## Notes
Sem mudanças de código — apenas documentação. Pode ser feito a qualquer momento.
