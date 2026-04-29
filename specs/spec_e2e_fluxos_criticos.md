# Spec: Testes E2E — Fluxos Críticos (revisada)

**Versão:** 2.0 | **Data:** 2026-04-29 | **Status:** revisada contra código real

> **Histórico:** A v1.0 (1.228 linhas) descrevia 9 fluxos genéricos baseados em uma
> arquitetura imaginária (modal "Criar Ausência", botão "Aprovar Ausência",
> reabilitação automática de email removido, super admin global, etc). Esta v2.0
> reescreve os cenários a partir de leitura direta do código (`AbsencesPage.jsx`,
> `CalendarDayPage.jsx`, `SubstitutionsPage.jsx`, `JoinPage.jsx`,
> `AdminPanelPage.jsx`, `TabTeachers.jsx`, `useAuthStore.js`, `useAppStore.js`,
> `functions/src/index.ts`). A infra (Playwright + Firebase Emulator) já está
> validada (commit `0a3a3c0`). Falta **apenas** a suite de testes — esta spec é
> o contrato.

---

## 1. Visão geral

A app é multi-tenant (`schools/{schoolId}/...`) com Cloud Functions
(`createAbsence`, `updateAbsence`, `deleteAbsence`, `approveTeacher`,
`rejectTeacher`, `removeTeacherFromSchool`, `joinSchoolAsAdmin`,
`reinstateRemovedUser`, `setTeacherRoleInSchool`, `designateSchoolAdmin`,
`applyPendingAction`). Não existe back-end próprio: o cliente faz
`onSnapshot` direto no Firestore para leitura e chama callables para escrita
sensível.

A revisão constatou três classes de problema na spec original:

1. **Fluxos inventados.** Não existe modal de "Criar Ausência" em
   `/absences`. Faltas são marcadas em `CalendarDayPage` clicando em "Marcar
   falta" por slot. Não existe "Aprovar/Rejeitar Ausência" — ausências têm
   status `open|partial|covered` calculado a partir de `slots[].substituteId`.
2. **Páginas/abas inexistentes.** Não existe aba "Solicitações" em `/settings`
   nem aba "Admins" nem aba "Auditoria". Aprovação de pendentes acontece em
   `TabApprovals` (admin) e em `AdminPanelPage` (SaaS admin) gerencia escolas
   inteiras, não admins de escola.
3. **Mecanismos de bloqueio mal descritos.** Re-aprovação de email removido
   é **bloqueada** por `removed_users/{uid}` até `reinstateRemovedUser` ser
   chamado (ou `overrideRemoval: true` passado a `approveTeacher`). Não
   existe "tela de bloqueio dedicada" para usuário removido — o boot faz
   `signOut` + redireciona pra `/login` com `loginError: 'access-revoked'`.

Esta v2.0 ancora cada cenário em ações reais, identifica `data-testid`s a
adicionar antes da implementação, e separa o que é viável testar via emulator
do que precisa de fixture direta no Firestore.

### Escopo (9 cenários revisados, mantendo a numeração da v1)

| # | Nome v1 (inventado) | Nome v2 (real) |
|---|---|---|
| 1 | Criar ausência → Aprovar ausência → Gerar relatório | Marcar falta no calendário → Atribuir substituto → Exportar PDF |
| 2 | Criar ausência → Rejeitar ausência → Mudança de status | Atribuir substituto → Remover substituto do slot → Status volta a `open` |
| 3 | Criar ausência → Remover ausência → Auditoria | Marcar falta → Excluir slot/ausência → Confirmar remoção e log `admin_actions` |
| 4 | Criar ausência → Atribuir substituição → Acesso do substituto | Marcar falta → Atribuir substituto → Substituto vê a aula em `/grades` |
| 5 | Atribuir substituição → Remover → Bloqueio do substituto | Atribuir substituto → Remover via `↺ Trocar`/`Limpar dia` → Substituto não vê mais a aula |
| 6 | Convidar professor → Aceitar convite → Login com acesso | Compartilhar link `/join/<slug>` → Professor entra via OAuth (custom token no emulator) → Solicita acesso → Admin aprova em `TabApprovals` → Professor loga e acessa `/home` |
| 7 | Remover professor → Bloqueio → Re-adição com mesmo email | Remover professor (`removeTeacherFromSchool`) → Próximo login dispara revogação no boot → Re-tentar `/join` é bloqueado por `removed_users` → Admin chama `reinstateRemovedUser` → Professor entra como pending novamente → Admin aprova → Acesso restaurado |
| 8 | Remover coord+prof → Re-adição → Permissões restauradas | Mesmo de #7 mas para `coordinator` e `teacher` em sequência, validando `users/{uid}.schools[schoolId].role` correto após reinstate+approve |
| 9 | Remover super admin → Re-adição → Acesso total | **Não há "super admin global" gerenciável pela UI da escola.** Reinterpretação: SaaS admin (em `/admins/{email}`) cria/suspende escolas via `AdminPanelPage`. Cenário vira: SaaS admin suspende escola → membros perdem acesso (gate em `JoinPage`/boot) → SaaS admin reativa → acesso volta. Rotação de admin local é cenário 9b (`designateSchoolAdmin`). |

---

## 2. Stack e infraestrutura (já pronta)

| Item | Versão / valor |
|---|---|
| Playwright | 1.48 (chromium-only) |
| Firebase Emulator | Auth (9099), Firestore (8080), Functions (5001), UI (4000) |
| Seed | `scripts/seed-emulator.js` (idempotente) |
| Login real | `loginAs(page, email)` → `signInWithCustomToken` |
| Reset entre testes | `resetEmulatorState()` via REST do emulator |
| Bypass UI | `window.__e2eFirebase` (somente em modo emulator, ver gate em `main.jsx`) |
| Helpers prontos | `auth-helpers.js`, `db-helpers.js`, `ui-helpers.js` |
| Helpers a criar | `assertions.js` (ver §6) |

Convencionamos não escrever testes de OAuth real — o emulator não suporta o
popup do Google e custom tokens cobrem o equivalente funcional do ponto de
vista da app (após o callback, ambos resultam em `onAuthStateChanged` com um
`user` autenticado).

---

## 3. Pré-requisitos transversais (data-testids)

Hoje **nenhum** `data-testid` existe no código (`grep -r data-testid src/`
retorna vazio). Antes de escrever os testes, adicionar os abaixo. Cada
cenário declara explicitamente quais `testid`s consome.

### 3.1 Toast (`src/components/ui/Toast.jsx`)
- `toast` no container raiz
- `toast-message` no texto
- `toast-{kind}` (`ok|warn|err`) como classe utilitária

### 3.2 Modal genérico (`src/components/ui/Modal.jsx`)
- `modal` no overlay raiz
- `modal-title`, `modal-close`

### 3.3 `CalendarDayPage` (origem das faltas)
- `mark-absent-{timeSlot}` no botão "Marcar falta" por slot
- `undo-absent-{timeSlot}` no botão "Desfazer"
- `mark-day` no botão "Marcar dia inteiro"
- `accept-suggestions` no botão "✓ Aceitar sugestões"
- `clear-day-subs` no "↺ Remover substitutos"
- `clear-day-absences` no "✕ Remover todas as faltas"
- `sub-pill-{teacherId}` em cada sugestão compact
- `sub-picker-open` no link "ver todos" / "+ Escolher substituto" / "↺ Trocar"
- `sub-candidate-{teacherId}` em cada linha do `FullCandidateList`

### 3.4 `AbsencesPage`
- `tab-{teacher|day|week|month}`
- `slot-row-{slotId}` em `SlotRow`
- `slot-delete-{slotId}` no `✕`
- `select-mode-toggle`, `bulk-delete`, `undo-bulk`
- `export-pdf` em cada botão "📄 Exportar PDF" / "📄 PDF"

### 3.5 `SubstitutionsPage`
- `tab-{substitute|day|week|month}`
- `filter-substitute`, `filter-segment`, `filter-month`, `filter-year`

### 3.6 `TabTeachers` (settings → professores)
- `add-teacher-btn`
- `teacher-row-{teacherId}` na tabela
- `remove-teacher-{teacherId}` no `✕`
- `confirm-remove-teacher` no botão de confirmação do modal
- `pending-teacher-{uid}` na linha de pendente
- `approve-pending-{uid}`, `reject-pending-{uid}`

### 3.7 `JoinPage` / `PendingPage` / `LoginPage`
- `join-loading`, `join-invalid`, `join-suspended`, `join-error-message`
- `pending-celular`, `pending-apelido`, `pending-submit`
- `login-error-banner` (já existe no LoginPage o conceito, validar)
- `login-google-btn` (no emulator, helper substitui por custom token)

### 3.8 `AdminPanelPage` (SaaS admin)
- `add-school-btn`
- `school-card-{schoolId}`
- `school-actions-{schoolId}` no menu de 3 pontos
- `confirm-school-action` no modal de confirmação

> **Convenção.** `data-testid` em kebab-case, prefixos por domínio, IDs
> dinâmicos sufixados (`teacher-row-${id}`). Sem traduções — `add-teacher-btn`,
> não `botao-add-prof`. Os testes usam apenas testids ou roles/labels acessíveis;
> nunca seletores CSS frágeis.

---

## 4. Fixtures e seed

O seed atual (`scripts/seed-emulator.js`) cria:
- 1 escola `sch-test-001` com config completa (segments/areas/subjects/sharedSeries)
- 6 usuários no Auth: `admin`, `coordinator`, `teacher`, `teacher-coordinator`, `pending`, `removed`
- `teachers/{uid}` aprovados para 4 deles
- `pending_teachers/{uid-pending}` para o pending
- `admins/{email-sanitizado}` para o admin
- `users/{uid}` (índice reverso) para os 4 aprovados

**Faltam para os cenários abaixo** (adicionar ao seed ou montar no `beforeEach`):

1. **Schedules de exemplo.** Hoje o seed não cria `schools/{id}/schedules/`. Sem
   schedules, `CalendarDayPage` mostra "Nenhuma aula configurada". Adicionar
   ao menos 5 schedules para `teacher-uid` numa segunda-feira (mesma semana
   do teste, calculada dinamicamente).
2. **Subject IDs nos teachers.** O seed grava `subjectIds: []`. Para que
   `rankCandidates` priorize o substituto correto (matéria igual), gravar
   `subjectIds: ['subj-port']` no `teacher-uid` e `['subj-port']` no
   `teacher-coordinator-uid`.
3. **Absence pré-criada** (cenário 2). Inserir uma `absences/{id}` com 1 slot
   já com `substituteId` setado.
4. **Removed marker** (cenário 7 — opcionalmente para testar reinstate
   isoladamente). Inserir `schools/{schoolId}/removed_users/{uid}` antes do
   teste de reinstate.
5. **Segunda escola** (cenário 9). Criar `sch-test-002` com `status: 'active'`
   para testar suspensão sem afetar a escola principal.

Atualizar `e2e/fixtures/usuarios-teste.json` para incluir `subjectIds` por
usuário e `e2e/fixtures/escola-seed.json` com um array `schedules` opcional.

---

## 5. Cenários (revisados)

> Convenção: cada cenário tem **Pré-condição**, **Passos UI** (em formato
> imperativo, com testid quando disponível), **Asserts** (verificáveis no DOM
> ou no Firestore via `window.__e2eFirebase`), **Trade-offs** (o que foi
> simplificado vs. produção).

### Cenário 1 — Marcar falta → Atribuir substituto → Exportar PDF

**Issue:** #494 (renomear título). **Arquivo alvo:** `e2e/tests/fluxo-ausencias.spec.js`.

**Pré-condição.** Seed limpo + reset. Schedules de `teacher-uid` na segunda
da semana corrente. `admin-uid` logado.

**Passos UI.**
1. `loginAs(page, 'admin@test-escola.com')`
2. Navegar para `/calendar`, clicar no card do `teacher-uid`. Em viewport
   desktop a página renderiza inline; em mobile redireciona pra
   `/calendar-day` com state. Para o teste, forçar viewport mobile
   (`page.setViewportSize({ width: 390, height: 844 })`) para usar
   `CalendarDayPage` que tem o fluxo mais explícito.
3. Selecionar o dia segunda (`pill` do dia atual via `tab-day-{idx}`).
4. Clicar `mark-absent-{timeSlot}` na primeira aula com `Marcar falta`.
5. Aguardar toast `Falta registrada`.
6. Após registro, aparecem `SuggestionPills` (`sub-pill-{teacherId}`).
   Clicar no primeiro pill (top-1 da regra qualitativa, esperado:
   `teacher-coordinator-uid` se mesmo subject).
7. Aguardar toast `Substituto: <nome>`.
8. Navegar para `/absences`, aba `tab-teacher`, selecionar o
   `teacher-uid` na lista lateral.
9. Clicar `export-pdf` (botão "📄 PDF"). Em headless o `window.print` é
   silenciado; o teste valida que `openPDF()` foi chamado interceptando
   `window.open` ou observando que uma nova tab é criada.

**Asserts.**
- Toast `Falta registrada` aparece (`assertToast(page, 'Falta registrada', 'ok')`).
- Toast `Substituto: ...` aparece após pill click.
- Em `/absences`, o card do professor mostra `1/1 coberta` (texto verde).
- Via `__e2eFirebase`: `schools/sch-test-001/absences` tem 1 doc com
  `status: 'covered'` e `slots[0].substituteId === <id resolvido>`.
- `admin_actions` tem entradas `createAbsence` e `updateAbsence` (ou
  `assignSubstitute`, dependendo da rota — verificar `useAppStore.assignSubstitute`
  que chama `updateAbsence`).

**Trade-offs.**
- O export PDF abre `window.open` com uma URL `data:` ou Blob; não validamos
  conteúdo do PDF, só que a chamada aconteceu.
- O teste não cobre escolha manual de substituto via `FullCandidateList`
  (modal) — isso é coberto no cenário 4.

**Edge cases descartados** (vs. v1):
- "Data no passado": a UI atual permite faltas em qualquer data pelo design
  (admin pode registrar faltas retroativas para regularização). Não há
  validação a testar.
- "Substituto também ausente no mesmo slot": é uma asserção de fato sobre
  `rankCandidates` — coberto por testes unitários, não E2E.

---

### Cenário 2 — Atribuir substituto → Remover substituto do slot → Status volta a `open`

**Issue:** #494 (segundo teste do arquivo).

**Pré-condição.** Seed + 1 ausência pré-criada com 1 slot `covered`
(teacher-uid + teacher-coordinator-uid como substituto). Admin logado.

**Passos UI.**
1. Navegar para `/calendar` → card teacher → mobile day page → segunda.
2. O slot ausente aparece com `✓ {sub.name}` e link `↺ Trocar`
   (`sub-picker-open`).
3. Em vez de trocar, clicar no botão `Desfazer` (`undo-absent-{timeSlot}`)
   que dispara `deleteAbsenceSlot`.

   *Alternativa equivalente* (testar a outra rota): clicar `↺ Trocar` →
   modal abre → no header do modal não há "remover", então usar
   `clear-day-subs` que dispara `clearDaySubstitutes(teacher.id, date)`.

**Asserts.**
- Toast `Falta removida` (rota `Desfazer`) ou `Substitutos removidos`
  (rota `clear-day-subs`).
- O slot volta a renderizar `Marcar falta` (rota Desfazer) ou
  `compact SuggestionPills` (rota clear-subs).
- Firestore: para `Desfazer`, `slots` perde 1 entrada e o doc pode ser
  removido se ficou vazio (validar `deleteAbsenceSlot` no
  `lib/absences/mutations.js`).

**Trade-offs.**
- Não existe um botão "remover só este substituto deixando a falta". O
  `↺ Trocar` exige selecionar outro candidato. Para zerar mantendo a falta,
  só `clear-day-subs` (afeta todos os subs do dia). Documentar essa limitação
  como nota técnica — pode virar uma issue de UX se for necessário.

---

### Cenário 3 — Marcar falta → Excluir → Confirmar remoção e log `admin_actions`

**Issue:** #494 (terceiro teste).

**Pré-condição.** Seed + 2 ausências do `teacher-uid` (uma com 1 slot, outra
com 3 slots). Admin logado.

**Passos UI (rota A — exclusão por seleção em lote em `/absences`).**
1. Navegar `/absences`, aba `tab-teacher`, selecionar `teacher-uid`.
2. Clicar `select-mode-toggle` ("☑ Selecionar").
3. Clicar `select-all` ou marcar checkboxes individuais
   (`slot-row-{slotId}`).
4. Clicar `bulk-delete` ("Excluir selecionadas").
5. Aparece `UndoBar` por 5s com `undo-bulk`. Esperar passar (ou validar
   undo num caso à parte).

**Passos UI (rota B — exclusão por slot via X).**
1. No mesmo `/absences`, clicar `slot-delete-{slotId}` (botão `✕` no
   `SlotRow`).

**Asserts.**
- Toast `N ausências removidas` (rota A) ou `Falta removida` (rota B).
- Após 5s sem undo (rota A), o slot some permanentemente.
- Firestore `admin_actions/`: nova entrada `action: 'updateAbsence'`
  (porque `deleteAbsenceSlot` chama `updateAbsence` com slots restantes,
  ou `deleteAbsence` se removeu o último slot). Audit cobre o caso.

**Trade-offs vs. v1.**
- A spec original esperava aba "Auditoria" em `/settings` — não existe.
  Auditoria está em `schools/{schoolId}/admin_actions/` no Firestore. O
  teste valida via `__e2eFirebase.firestore` direto.
- Não existe modal "Tem certeza?" para deleção em `/absences` — a remoção
  é otimista com possibilidade de undo via barra de 5s. O teste reflete isso.

---

### Cenário 4 — Marcar falta → Atribuir substituto → Substituto vê a aula em `/grades`

**Issue:** #495 (primeiro teste do arquivo `fluxo-substituicoes.spec.js`).

**Pré-condição.** Seed + schedules para `teacher-uid` na segunda + admin logado.

**Passos UI.**
1. Como admin, marcar falta (igual cenário 1, passos 1-5) e atribuir
   `teacher-coordinator-uid` como substituto.
2. `loginAs(page, 'teacher-coordinator@test-escola.com')` (re-login no
   emulator → custom token).
3. Navegar `/grades` (rota pessoal do professor — `GradesPage.jsx`).
4. Localizar a segunda da semana corrente.
5. Validar que aparece um card/linha indicando "Substituindo X" no slot
   correspondente.

**Asserts.**
- Em `/grades`, o slot da segunda mostra a turma cobrida e referência ao
  `teacher-uid` ausente.
- Em `/substitutions`, aba `tab-substitute`, o `teacher-coordinator-uid`
  aparece com 1 substituição no mês corrente (`SubstitutionRankingTable`).
- Via Firestore: `users/{teacher-coordinator-uid}.schools[sch-test-001].role`
  permanece igual; o reflexo é só sobre `absences[].slots[].substituteId`.

**Trade-offs.**
- A v1 mencionava badge de "carga horária mensal" no `/grades`. Verificar
  se já existe em `WorkloadPage` — se sim, validar lá; se não, remover do
  assert e abrir issue separada.
- Em produção o re-render é via `onSnapshot` em tempo real. No teste,
  podemos assumir o re-render no próximo navigate para evitar `waitForResponse`
  sobre listeners.

---

### Cenário 5 — Atribuir → Remover substituto → Substituto não vê mais a aula

**Issue:** #495 (segundo teste).

**Pré-condição.** Cenário 4 deixa estado adequado; alternativamente, fixture
inicial com 1 absence covered.

**Passos UI.**
1. Como admin, navegar `/calendar` → mobile day → segunda do `teacher-uid`.
2. Clicar `clear-day-subs` ("↺ Remover substitutos") OU usar `↺ Trocar` no
   slot e selecionar o "atual ✓" para confirmar (UX atual não permite
   "limpar este slot"; documentar).
3. Logout, `loginAs` como `teacher-coordinator@test-escola.com`.
4. Navegar `/grades` → segunda → confirmar que o slot do `teacher-uid` não
   aparece mais.

**Asserts.**
- Toast `Substitutos removidos` no admin.
- Em `/grades` do substituto, slot não aparece.
- Firestore: `slots[].substituteId === null` para o slot afetado;
  `status: 'open'` no `absences/{id}`.
- `admin_actions/`: entrada `updateAbsence` com `substituteId: null`.

---

### Cenário 6 — Convite via `/join/<slug>` → Pending → Aprovação → Acesso

**Issue:** #496 (primeiro teste do `fluxo-usuarios.spec.js`).

**Pré-condição.** Seed limpo. Garantir que existe um usuário no Auth
emulator que **ainda não tem** entrada em `teachers/` nem `pending_teachers/`
de `sch-test-001`. O seed atual só cobre `pending` e `removed` para esse
papel — para este cenário criamos um 7º usuário "novato" no setup ou geramos
on-the-fly via Admin SDK.

**Passos UI.**
1. Em modo headless, criar usuário "novato@test.com" via
   `adminSdk.auth().createUser()` no `beforeAll`.
2. `loginAs(page, 'novato@test.com')` (custom token).
3. Navegar para `/join/escola-teste`.
4. `JoinPage` resolve slug → schoolId, vê que não há entry em
   `users/{uid}.schools[sch-test-001]`, chama `requestTeacherAccess` que
   grava `pending_teachers/{uid}` com `status: 'pending'`.
5. App reage e renderiza `PendingPage` (formulário de celular/apelido).
6. Preencher `pending-celular` + `pending-apelido` + `pending-subjectIds`
   (selecionar Português) e clicar `pending-submit`.
7. Logout. `loginAs` como `admin@test-escola.com`.
8. Navegar `/settings` → `tab-teachers` → `TabTeachers` mostra o card de
   pendente em destaque (botão amarelo "ver pendentes").
9. Abrir o painel de pendentes (`setShowPendingPanel(true)` via botão).
10. Clicar `approve-pending-{uid-novato}`.
11. Aguardar toast de sucesso.
12. Logout. `loginAs` como `novato@test.com`.
13. App boot: `_resolveRole` lê `users/{uid}.schools[sch-test-001].role`,
    encontra `'teacher'` → redireciona para `/home`.

**Asserts.**
- Após step 4: `pending_teachers/{uid-novato}` existe com `status: 'pending'`.
- Após step 10: `teachers/{teacherId}` existe e
  `users/{uid-novato}.schools[sch-test-001].role === 'teacher'`.
- No login final, URL = `/home`.

**Trade-offs vs. v1.**
- Não existe email real disparado. O "convite" é o link `/join/<slug>` que
  o admin compartilha (já validado pelo `AdminPanelPage` com `copyToClipboard`).
- Não existe "Adicionar Professor" que envia um convite — `TabTeachers`
  permite adicionar manualmente um teacher pendente, mas o fluxo principal
  passa por OAuth + `/join`.
- O OAuth real é simulado por custom token; do ponto de vista do app, o
  resultado de `onAuthStateChanged` é idêntico.

---

### Cenário 7 — Remover professor → Bloqueio + reinstate

**Issue:** #496 (segundo teste).

**Pré-condição.** Seed completo (`teacher-uid` aprovado).

**Passos UI.**
1. Admin logado. Navegar `/settings` → `tab-teachers`.
2. Localizar `teacher-row-{teacher-uid}` na tabela/cards.
3. Clicar `remove-teacher-{teacher-uid}` (`✕` vermelho).
4. Confirmar no modal (`confirm-remove-teacher`).
5. Aguardar toast de sucesso.
6. Logout. `loginAs` como `teacher@test-escola.com`.
7. App boot: `_resolveRole` detecta `removedFrom: ['sch-test-001']` →
   `signOut` automático + redirect `/login` com `loginError: 'access-revoked'`.
8. Asserções no LoginPage (banner com mensagem clara).
9. Tentar `/join/escola-teste` como `teacher@test-escola.com` → o
   `requestTeacherAccess` lança `AccessRevokedError` → `JoinPage` mostra
   `join-error-message` com texto sobre acesso revogado.
10. Logout. Admin logado, abrir DevTools / chamar `__e2eFirebase` para
    invocar `reinstateRemovedUser({ schoolId: 'sch-test-001', targetUid: 'teacher-uid' })`.
    *(Não há UI hoje para reinstate — é callable direto. Documentar como
    follow-up de UX.)*
11. Logout. `loginAs` como `teacher@test-escola.com`. Agora `removedFrom`
    está vazio para essa escola, mas `users/{uid}.schools` também não tem
    a escola → boot detecta "sem acesso" (não revogado) e direciona pro
    fluxo de pending via `/join`.
12. Re-fazer steps 3-7 do cenário 6 (entrar via /join, virar pending).
13. Admin aprova em `TabApprovals`/painel pendentes. (Cuidado: se ainda
    houver `removed_users/{uid}` no Firestore, `approveTeacher` vai falhar
    com `failed-precondition` — `reinstateRemovedUser` já limpou no step 10.)
14. Final login do teacher → `/home`.

**Asserts.**
- Após step 5: `removed_users/{teacher-uid}` existe; `users/{teacher-uid}.removedFrom`
  contém `'sch-test-001'`; `teachers/{teacher-uid}` removido.
- Após step 7: redirect para `/login` com banner.
- Após step 10: `removed_users/{teacher-uid}` deletado;
  `users/{teacher-uid}.removedFrom` não contém mais `'sch-test-001'`.
- Após step 13/14: `teachers/...` recriado, `users/{uid}.schools[sch-test-001].role === 'teacher'`.

**Trade-offs vs. v1.**
- Não há "tela de bloqueio dedicada" — é a `LoginPage` com banner
  contextualizado (`access-revoked|access-rejected|no-access`).
- Re-aprovação direta sem `reinstateRemovedUser` é **bloqueada** pelo
  `approveTeacher` (`overrideRemoval: true` é necessário). O teste cobre o
  caminho recomendado (reinstate primeiro). Validar a rejeição com
  `overrideRemoval: false` é um sub-teste opcional.

---

### Cenário 8 — Coordenador + professor: remoção e re-adição com permissões corretas

**Issue:** #496 (terceiro teste).

**Pré-condição.** Seed (coord-uid + teacher-uid aprovados).

**Passos UI.**
1. Admin remove ambos (steps 1-5 do cenário 7, repetidos para os 2 ids).
2. Validar boot bloqueado para os dois (logins separados).
3. Admin reinstate ambos (callable direto, ou via UI quando existir).
4. Coord entra via `/join`, vira pending. Admin aprova **com profile
   `coordinator`** (selecionar no `TabApprovals` antes de aprovar).
5. Teacher entra via `/join`, vira pending. Admin aprova com profile
   `teacher`. Validar que `subjectIds` é exigido (Cloud Function
   `approveTeacher` retorna `failed-precondition` se vazio).
6. Login coord → `/dashboard`. Login teacher → `/home`.
7. Validar que `teacher` não consegue navegar para `/calendar` (rota
   protegida — confirmar comportamento real, pode ser que renderize página
   limitada, não bloqueio duro).

**Asserts.**
- `users/{coord-uid}.schools[sch-test-001].role === 'coordinator'`.
- `users/{teacher-uid}.schools[sch-test-001].role === 'teacher'`.
- `teachers/{coord-id}.profile === 'coordinator'`,
  `subjectIds === []` (coord puro não leciona — comportamento explícito
  no backend).
- `admin_actions` tem 4 entradas (`removeTeacher` x2 + `approveTeacher` x2).

**Removido vs. v1.**
- "Soft delete de pending_actions". Hoje `pending_actions` são criadas por
  coordenadores tentando ações que precisam aprovação (ver `_isCoordinator()`
  em `useAppStore.removeTeacher`). Não fazem parte do fluxo direto de
  aprovação de cadastro, e a v1 misturou os dois conceitos. Manter
  `pending_actions` fora deste cenário; cobrir em teste à parte se for
  prioridade.

---

### Cenário 9 — SaaS admin suspende escola → membros perdem acesso → reativa

**Issue:** #496 (quarto teste; renomear escopo).

**Pré-condição.** Seed (`sch-test-001` ativa) + segunda escola
`sch-test-002` ativa com pelo menos 1 membro de teste — adicionar ao seed.
SaaS admin é o usuário `admin@test-escola.com` (já está em `/admins/...`).

**Passos UI (Cenário 9a — suspensão).**
1. SaaS admin logado, navegar `/admin` (`AdminPanelPage`).
2. Localizar `school-card-{sch-test-002}`.
3. Abrir `school-actions-{sch-test-002}` → "Suspender".
4. Confirmar `confirm-school-action`.
5. Toast "Escola suspensa".
6. Logout. `loginAs` como membro de `sch-test-002`.
7. Navegar `/join/escola-teste-002` (slug correspondente). `JoinPage`
   detecta `schoolData.status === 'suspended'` e renderiza
   `join-suspended` (a menos que seja SaaS admin).
8. Voltar como SaaS admin → reativar (`Reativar`).
9. Logout. Membro entra novamente em `/join` → acesso restaurado normal.

**Passos UI (Cenário 9b — rotação de admin local — opcional).**
1. SaaS admin logado em `/admin`, abrir
   `school-actions-{sch-test-001}` → "Designar admin".
2. Inserir email de outro usuário (`teacher-coordinator@test-escola.com`).
3. Confirmar. Callable `designateSchoolAdmin` atualiza
   `schools/{id}.adminEmail` e, se o usuário existe em `/users/`, promove
   `schools[id].role = 'admin'`.
4. Logout. Login como o novo admin → `/dashboard` carrega como admin.

**Asserts.**
- `schools/sch-test-002.status === 'suspended'` após step 4.
- `JoinPage` renderiza `join-suspended` quando o membro tenta entrar.
- `schools/sch-test-002.status === 'active'` após reativar; membro entra normal.
- (9b) `schools/sch-test-001.adminEmail === 'teacher-coordinator@...'` e
  `users/{tcoord-uid}.schools[sch-test-001].role === 'admin'`.

**Trade-offs vs. v1.**
- A v1 falava de "remover super admin global" e "garantir pelo menos um".
  Não há esse conceito na app. SaaS admins são docs em `/admins/{email}`
  manualmente populados (script `scripts/seed-admins.js`); a UI da app não
  remove SaaS admin de outro SaaS admin. Removido o cenário original e
  reinterpretado como suspensão de escola + rotação de admin local, que
  são as ações reais existentes.

---

## 6. Helpers a criar (ainda não existem)

`e2e/helpers/assertions.js`:

```js
export async function assertToast(page, text, kind = 'ok')
export async function assertFirestoreDoc(page, path, predicate)  // usa __e2eFirebase
export async function assertSlotStatus(page, slotId, expected)   // 'open|partial|covered'
export async function assertUrl(page, regex)
```

`e2e/helpers/db-helpers.js` — adicionar:

```js
export async function seedScheduleForTeacher(teacherUid, dayISO, count)
export async function seedAbsenceCovered(teacherUid, substituteUid, dayISO)
export async function callableViaAdmin(name, payload)           // bypass UI
```

---

## 7. Regras de negócio (referência rápida, ancoradas no código)

| Regra | Onde |
|---|---|
| Status calculado da ausência | `functions/src/index.ts` `calcStatus()` |
| `removed_users` bloqueia re-aprovação | `approveTeacher` requer `overrideRemoval` ou `reinstateRemovedUser` antes |
| Boot revoga login se `removedFrom` contém `schoolId` | `useAuthStore._resolveRole` (~linha 200) |
| Self-removal proibido | `removeTeacherFromSchool` step 6 |
| Coordenador puro tem `subjectIds: []` forçado | `approveTeacher` step de validação |
| Slots de formação bloqueiam falta | `validateNoFormationSlots` em `createAbsence` + `isFormationSlot` na UI |
| Self-promote a admin local via `/join/<slug>` exige email == `adminEmail` | `joinSchoolAsAdmin` |
| Suspensão de escola bloqueia membros (não SaaS admin) | `JoinPage` step 3b |

---

## 8. Fora do escopo (v2)

- Testes de OAuth real (Google popup) — custom tokens cobrem o equivalente.
- Validação visual de PDF — só validamos que `openPDF` foi chamado.
- Multi-browser (Firefox/WebKit) — Chromium-only por decisão consciente.
- Testes paralelos — `workers: 1` por enquanto; paralelizar exige isolamento
  por `schoolId` no Firestore.
- Performance/Lighthouse.
- Acessibilidade automática (axe-core) — escopo separado.
- `pending_actions` (coordenador requisitando ações que admin aprova) —
  vai virar uma 5ª spec/issue se for prioridade.

---

## 9. Próximos passos (sequência de implementação)

1. Adicionar `data-testid`s da §3 nos componentes (PR único, sem lógica nova).
2. Atualizar seed (`scripts/seed-emulator.js` + fixtures) com schedules,
   subjects e a segunda escola.
3. Implementar `assertions.js` e helpers complementares.
4. Implementar cenários 1-3 (issue #494).
5. Implementar cenários 4-5 (issue #495).
6. Implementar cenários 6-9 (issue #496).
7. Configurar GH Actions (issue #497).

---

**Fim da spec v2.**
