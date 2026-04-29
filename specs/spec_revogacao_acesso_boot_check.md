---
name: Revogação de acesso — verificação no boot e testes de integração de login
created: 2026-04-28
status: ready
---

# Spec: Revogação de Acesso no Boot + Testes de Integração de Login

## Visão Geral

Professor removido (`redacaoanglobrag@gmail.com`) consegue voltar a logar via Google após logout + hard reload. Após o login ele cai na `PendingPage` e (em ambiente de uma escola só) chega a enxergar dados que não deveria. A causa é arquitetural: a verificação do marcador `schools/{schoolId}/removed_users/{uid}` só ocorre dentro de `requestTeacherAccess`, que roda tarde no fluxo (após `bootSequence` já ter resolvido `role: 'pending'` e ativado o `_startMembershipListener`). Não há checagem no boot. Em paralelo, não existem testes de integração que cubram cada role no fluxo de login — então regressões como esta passam batido.

Esta spec resolve dois problemas correlatos:

1. **Bug crítico de revogação:** garantir que usuário com marcador em `removed_users` seja deslogado imediatamente no boot, antes de qualquer leitura de dados da escola, sem depender do fluxo `requestTeacherAccess`.
2. **Cobertura de regressão:** introduzir suíte de testes de integração de login para cada role (admin, coordinator, teacher-coordinator, teacher, pending, removed) que falharia caso o boot deixasse passar um usuário revogado.

Não substitui [`spec-revogacao-acesso-fechar-bypass.md`](./spec-revogacao-acesso-fechar-bypass.md) (que fecha o bypass do client-side re-create). Ela é complementar: aquela trata da escrita irrestrita; esta trata da janela entre login e signOut em usuários já removidos limpamente.

## Stack Tecnológica

- Frontend: React 19, Zustand, React Router, Vite
- Backend: Firebase Cloud Functions (Node 20, TypeScript, region `southamerica-east1`)
- Banco: Firestore (multi-tenant `schools/{schoolId}/...`)
- Auth: Firebase Auth (Google OAuth — único método)
- Testes: Vitest + Testing Library + mocks de Firestore/Auth

## Páginas e Rotas

### LoginPage — `/login`
**Descrição:** Tela única com botão "Entrar com Google". Após `signInWithPopup`, o `onAuthStateChanged` do `useAuthStore.init` decide para onde o usuário vai (admin dashboard, app de professor, `PendingPage` ou volta para `LoginPage` em caso de revogação).

**Componentes:**
- Botão Google OAuth (já existe)
- Toast de erro (após signOut por revogação)

**Behaviors:**
- [ ] Mostrar mensagem de revogação: quando `bootSequence` (ou wrapper) detecta marcador `removed_users` e força `signOut`, a `LoginPage` deve receber via `location.state.error` o motivo (`'access-revoked'`) e exibir banner: "Seu acesso foi revogado pelo administrador desta escola. Procure o coordenador para mais informações."
- [ ] Não permitir auto-redirect para escola após signOut por revogação: a flag `redirect` em `location.state` deve ser limpa quando o motivo do retorno é `access-revoked` (caso contrário o usuário re-entraria no `/join/:slug` e recriaria pending, anulando a revogação).

---

### PendingPage — `/pending`
**Descrição:** Já existente — tela de cadastro pendente. Não recebe mudanças funcionais; apenas garantia de que **nunca é renderizada** para usuário com marcador em `removed_users`.

**Behaviors:**
- [ ] Bloquear render para usuário revogado: o `App.jsx` (ou roteador) só roteia para `/pending` quando `role === 'pending'`. Como o boot agora desloga revogados antes de setar `role`, esta página simplesmente nunca recebe usuário removido — não exige código próprio.

---

### App raiz — boot do sistema (não é uma página, mas é onde o behavior crítico mora)
**Descrição:** Sequência executada em `useAuthStore.init` → `useSchoolStore.init` → `bootSequence` → `_resolveRole` quando o `onAuthStateChanged` dispara com um `user` autenticado.

**Componentes envolvidos:**
- `useAuthStore.init` (orquestrador)
- `useSchoolStore.init` (carrega availableSchools + userSnap)
- `bootSequence` (decisão pura — mantida pura, sem I/O)
- Novo helper: `checkAccessRevoked(uid, userSnap)` (I/O dedicado)
- `useAuthStore._resolveRole` (aplica a decisão)
- `useAuthStore._startMembershipListener` (já existe — reforçado)

**Behaviors:**
- [ ] Verificar revogação antes de `bootSequence`: em `_resolveRole`, antes de chamar `bootSequence`, executar `checkAccessRevoked(user.uid, userSnap)`. Se retornar `{ revoked: true, schoolIds: [...] }`, executar `signOut(auth)` imediatamente, limpar `localStorage` (`gestao_active_school`), zerar `currentSchoolId`/`currentSchool` e disparar toast de erro. Não chamar `bootSequence` nem `requestTeacherAccess`.
- [ ] Pular verificação para SaaS admin: se `isSaasAdminFlag === true` (email em `SUPER_USERS` ou em `/admins/{email_key}`), não rodar `checkAccessRevoked` — saas admin não tem `users/{uid}.schools` e nunca é "removido" de uma escola.
- [ ] Cobrir caso "users/{uid} vazio mas marcador existe": quando `users/{uid}.schools` está vazio (`availableSchools.length === 0`) e existe marcador em **qualquer** `schools/*/removed_users/{uid}`, bloquear. Isso é o caso reportado — o `users/{uid}` foi limpo pela CF mas o marcador persiste.
- [ ] Cobrir caso "users/{uid} tem outras escolas mas foi removido de uma": quando o usuário pertence a `schoolA` e foi removido de `schoolB`, NÃO bloquear o login global; apenas garantir que ele não consegue restaurar `currentSchoolId === schoolB` do `localStorage`. O `bootSequence` já filtra `availableSchools`, mas o helper deve adicionalmente cruzar `removed_users` e remover qualquer schoolId revogada do array `availableSchools` antes de prosseguir.
- [ ] Não recriar `pending_teachers` para revogado: `requestTeacherAccess` continua com sua verificação interna (defesa em profundidade), mas o caminho normal nunca chega lá porque o boot já deslogou.
- [ ] Listener de membership detecta revogação em runtime: `_startMembershipListener` já existe e dispara `_handleMembershipRevoked` na transição `true → false`. Reforço: no listener, se a entry `users/{uid}.schools[schoolId]` desaparece, antes de chamar `loadAvailableSchools`, verificar `removed_users` da mesma escola para pular a tentativa de re-pending.
- [ ] Hard reload revalida: o boot inteiro roda em `onAuthStateChanged`, que dispara em todo reload. Como a verificação `checkAccessRevoked` faz uma leitura fresca em `removed_users`, hard reload não tem cache stale.

---

## Componentes Compartilhados

- **`checkAccessRevoked(uid, userSnap)`** — novo helper em `src/lib/db/index.js`. Retorna `{ revoked: boolean, schoolIds: string[] }`. Estratégia de leitura:
  - Se `userSnap.data().schools` tem N schoolIds, fazer N leituras paralelas em `schools/{id}/removed_users/{uid}` e excluir as revogadas; bloqueio total apenas quando TODAS as escolas são revogadas (ou quando `users/{uid}.schools` está vazio e existe marcador rastreável).
  - Para `users/{uid}.schools` vazio: precisamos de um índice ou estratégia. Opções:
    - **(a)** Manter um campo `users/{uid}.removedFrom: [schoolId, ...]` escrito pela CF `removeTeacherFromSchool` ao mesmo tempo que deleta `users/{uid}.schools[schoolId]`. Leitura: 1 RTT.
    - **(b)** `collectionGroup('removed_users')` filtrado por `uid == request.auth.uid`. Exige índice composto + rule de acesso.
  - Decisão: **opção (a)** — extender a CF para gravar `users/{uid}.removedFrom` (lista append-only). Simpler, 1 RTT, idempotente.
- **`AccessRevokedError`** — já existe em `src/lib/db/index.js`. Reutilizar para o erro lançado no boot.
- **Toast de revogação** — usar `toast()` existente (`src/hooks/useToast`), padronizar mensagem: `'Seu acesso foi revogado pelo administrador desta escola'`.

## Modelos de Dados

### `users/{uid}` (modificação)
```
{
  email: string,
  schools: { [schoolId]: { role, status, teacherDocId } }, // existente
  removedFrom: [schoolId, ...]                              // NOVO — append-only
}
```
- `removedFrom` é escrito pela CF `removeTeacherFromSchool` no mesmo batch que deleta `schools.{schoolId}` (`arrayUnion(schoolId)`).
- Rule: `allow read: if request.auth.uid == uid` (já é o caso para `users/{uid}`).
- A CF `reinstateRemovedUser` deve fazer `arrayRemove(schoolId)` de `users/{uid}.removedFrom` no mesmo batch que apaga `schools/{schoolId}/removed_users/{uid}`.
- A CF `approveTeacher` (quando aprova alguém previamente removido) também faz `arrayRemove(schoolId)`.

### `schools/{schoolId}/removed_users/{uid}` (existente — sem mudança)
Permanece como source-of-truth. `removedFrom` em `users/{uid}` é apenas o índice invertido para leitura rápida no boot.

### `schools/{schoolId}` (sem mudança)

## Regras de Negócio

- **RN-R1:** Usuário com marcador em `removed_users/{uid}` da única escola disponível NÃO pode logar — `signOut` imediato no boot.
- **RN-R2:** Usuário multi-escola removido de uma escola continua podendo logar nas outras; a escola revogada é filtrada de `availableSchools`.
- **RN-R3:** SaaS admin NUNCA é bloqueado por marcadores de revogação (não tem membership rastreado).
- **RN-R4:** A verificação `checkAccessRevoked` roda em TODO boot, antes de `bootSequence` e antes de qualquer leitura de dados da escola (teachers, schedules, etc.).
- **RN-R5:** Hard reload sempre revalida — não há cache de "passou na última vez".
- **RN-R6:** Reativação requer `reinstateRemovedUser` (CF) — limpa `removed_users/{uid}` E `users/{uid}.removedFrom[schoolId]`.
- **RN-R7:** Revogação em runtime (admin remove enquanto sessão está aberta) é detectada pelo `_startMembershipListener` em até 1 snapshot, sem race condition contra o boot inicial (listener registrado APÓS `_resolveRole`).
- **RN-R8:** Remoção do próprio admin é bloqueada na CF (`failed-precondition`) — comportamento existente, mantido.

## Plano de Refatoração — divisão por parte

### Parte 1 — Bug crítico de revogação no boot
- Criar `checkAccessRevoked(uid, userSnap)` em `src/lib/db/index.js` (lê `users/{uid}.removedFrom` e cruza com `availableSchools`).
- Modificar `useAuthStore._resolveRole`: após determinar `isSaasAdminFlag` e `userSnap`, antes de `bootSequence`, chamar `checkAccessRevoked`. Se totalmente revogado, executar `signOut + clearLS + toast` e retornar.
- Quando parcialmente revogado, filtrar `availableSchools` no `useSchoolStore` antes de seguir o fluxo.
- Modificar CF `removeTeacherFromSchool` para gravar `users/{uid}.removedFrom = arrayUnion(schoolId)` no mesmo batch.
- Modificar CFs `reinstateRemovedUser` e `approveTeacher` para fazer `arrayRemove(schoolId)`.

### Parte 2 — Listener de revogação em runtime
- Auditar `_startMembershipListener` para garantir idempotência sob hard reload (já é idempotente — apenas cobrir com teste).
- Em `_handleMembershipRevoked`, antes de tentar `loadAvailableSchools` + selecionar próxima escola, verificar `removed_users` para evitar tentar re-pending na mesma escola revogada.

### Parte 3 — Suíte de testes de integração de login
Criar `src/__tests__/integration/login-flow.test.jsx` cobrindo:
- [ ] **Login admin (escola única):** `users/{uid}.schools[A] = { role: 'admin' }`, `availableSchools = [A]` → `role === 'admin'`, navbar admin renderiza, dashboard de admin aparece.
- [ ] **Login coordinator:** `users/{uid}.schools[A] = { role: 'coordinator' }` → `role === 'coordinator'`, navbar de coordenador.
- [ ] **Login teacher-coordinator:** `role === 'teacher-coordinator'`, vê app completo.
- [ ] **Login teacher:** `role === 'teacher'`, vê app limitado (só seus dados).
- [ ] **Login pendente novo:** `users/{uid}` não existe ou `schools = {}`, `currentSchoolId` veio do `/join/:slug` → roteado para `/pending`.
- [ ] **Login pendente em espera:** `users/{uid}.schools[A] = { role: 'pending' }` → roteado para `/pending`, listener de aprovação ativo.
- [ ] **Login revogado (escola única):** `users/{uid}.schools = {}`, `users/{uid}.removedFrom = [A]`, marcador `removed_users/{uid}` em A → `signOut` chamado, `role` permanece `null`, toast de revogação disparado, `localStorage` limpo.
- [ ] **Login revogado em runtime:** simula `_startMembershipListener` recebendo snapshot com entry removida → `_handleMembershipRevoked` é chamado, listeners de dados são teardown, toast disparado.
- [ ] **Login multi-escola com uma revogada:** `users/{uid}.schools = { A: {...} }`, `users/{uid}.removedFrom = [B]` → loga normalmente em A, B nunca aparece em `availableSchools`.
- [ ] **NÃO testar:** SaaS admin (já coberto, fora de escopo desta refat).

### Parte 4 — Limpeza opcional
- [ ] Avaliar invalidação de session: hoje `signOut` apenas remove a credencial local; o token JWT ainda é válido por até 1h. Para revogação imediata em ataques ativos, seria necessário `admin.auth().revokeRefreshTokens(uid)` na CF `removeTeacherFromSchool`. **Decisão:** marcar como "fora do escopo v1" — exige mudança de `forceRefresh: true` em todos os getIdToken e revisão de impacto. Adicionar TODO em [`functions/src/index.ts`](functions/src/index.ts).

## Fora do Escopo (v1)

- Revogação imediata de refresh token Firebase Auth (`admin.auth().revokeRefreshTokens`).
- Mudança no fluxo de login do SaaS admin (continua como está — funciona).
- Suporte a múltiplos métodos de login (segue Google OAuth único).
- Mudança em `firestore.rules` para `users/{uid}` (já endereçado em [`spec-revogacao-acesso-fechar-bypass.md`](./spec-revogacao-acesso-fechar-bypass.md)).
- Auto-reativação do usuário (precisa sempre de admin via `reinstateRemovedUser`).
- UI para SaaS admin gerenciar `removed_users` em massa.

## Checklist de validação manual após implementação

- [ ] Cenário do bug original: remover `redacaoanglobrag@gmail.com` via UI; o usuário faz logout; tenta logar novamente → cai em `LoginPage` com toast de revogação; não vê `PendingPage` nem dados da escola.
- [ ] Hard reload com sessão revogada: usuário com marcador faz F5 → `signOut` automático em <2s, redireciona para `/login`.
- [ ] SaaS admin entra normalmente, sem regressão.
- [ ] Reinstate via `reinstateRemovedUser`: limpa marcador E `users/{uid}.removedFrom`; usuário consegue logar de novo.
- [ ] Os 530 testes existentes continuam passando.
