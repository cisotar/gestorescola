# Spec: Fase 2 — Infraestrutura Multi-Tenant (GestãoEscolar SaaS)

## Visão Geral

Migração da arquitetura single-tenant (coleções Firestore globais) para multi-tenant (coleções aninhadas sob `schools/{schoolId}/...`). A Fase 2 adapta toda a aplicação para operar com um `schoolId` ativo, reescreve as Firestore Security Rules para isolar dados entre escolas, e prepara a base para múltiplas escolas independentes no mesmo projeto Firebase.

**Problema resolvido:** a arquitetura atual usa coleções globais (`/teachers/`, `/schedules/`, etc.) que impossibilitam o isolamento de dados entre clientes distintos. Qualquer teacher aprovado em uma escola leria dados de outra escola caso houvesse mais de um cliente no sistema.

**Pré-requisito:** Fase 1 (Segurança) concluída. Não iniciar esta fase sem a Fase 1 completa.

**Pré-condição técnica:** documento `admins/{email}` do super-admin deve existir no Firestore antes do deploy das novas rules.

---

## Stack Tecnológica

- **Frontend:** React 18.3.1 + Vite 5.4.1 + Zustand 4.5.4
- **Backend:** Firebase Firestore (10.12.2) + Firebase Auth (Google OAuth)
- **Admin / Scripts:** Firebase Admin SDK (Node.js) para script de migração
- **Cloud Functions:** TypeScript (infraestrutura já existente da Fase 1)
- **Testes:** Vitest + `@firebase/rules-unit-testing` + emulador Firestore
- **Cache local:** localStorage com chave versionada por schoolId (`gestao_v9_cache_{schoolId}`)

---

## Escopo desta fase

| Entrega | Descrição |
|---|---|
| 2.1 — Script de migração | Copia dados single-tenant para `schools/sch-default/...`; idempotente |
| 2.2 — `useSchoolStore` | Novo Zustand store para escola ativa e troca de escola |
| 2.3 — `useAuthStore` refatorado | Lê role de `users/{uid}.schools[schoolId]`; suporta super-admin SaaS |
| 2.4 — Camada de dados (`src/lib/db/`) | Helper multi-tenant + todas as funções recebem `schoolId` |
| 2.5 — Firestore Security Rules | Reescritas com isolamento por escola e funções `isSaasAdmin`, `isMemberOf`, `isSchoolAdmin` |
| 2.6 — Cache isolado por escola | Chave `gestao_v9_cache_{schoolId}` substituindo `gestao_v8_cache` |
| 2.7 — Testes de rules multi-tenant | Cobertura de isolamento entre escolas e acesso do super-admin |
| 2.8 — Testes de `useAuthStore` | Validação da nova estrutura `users/{uid}.schools` |
| 2.9 — UI: SchoolSwitcher | Componente no Navbar para trocar de escola (somente com 2+ escolas) |
| 2.10 — UI: SchoolHeader | Cabeçalho com nome da escola ativa em páginas admin/coordinator |

---

## Modelo de Dados

### Nova estrutura Firestore (multi-tenant)

```
/users/{uid}
  email: string
  name: string
  schools: {
    [schoolId]: {
      role:   'admin' | 'coordinator' | 'teacher-coordinator' | 'teacher' | 'pending'
      status: 'approved' | 'pending'
    }
  }

/schools/{schoolId}
  name:      string
  createdAt: Timestamp
  createdBy: string     (uid do criador)
  plan:      string     ('free' | 'pro')

/schools/{schoolId}/config/main
  (mesmo schema de /meta/config atual — ver architecture.md seção 4)
  segments, periodConfigs, areas, subjects, sharedSeries,
  workloadWarn, workloadDanger, updatedAt

/schools/{schoolId}/teachers/{id}
  (mesmo schema de /teachers/ atual)

/schools/{schoolId}/schedules/{id}
  (mesmo schema de /schedules/ atual)

/schools/{schoolId}/absences/{id}
  (mesmo schema de /absences/ atual)

/schools/{schoolId}/history/{id}
  (mesmo schema de /history/ atual)

/schools/{schoolId}/pending_teachers/{uid}
  (mesmo schema de /pending_teachers/ atual)

/schools/{schoolId}/pending_actions/{id}
  (mesmo schema de /pending_actions/ atual)

/schools/{schoolId}/admin_actions/{id}
  (mesmo schema de /admin_actions/ atual)

/admins/{email}
  (mantido como super-admins globais do SaaS — sem mudança de schema)
  email, name, addedAt
```

### Escola padrão gerada pela migração

```js
// /schools/sch-default
{
  name:      "Escola Principal",
  createdAt: Timestamp (momento da migração),
  createdBy: "migration-script",
  plan:      "free"
}
```

### Mudanças de schema em relação à Fase 1

| Coleção antiga | Nova localização | Observação |
|---|---|---|
| `/meta/config` | `/schools/{schoolId}/config/main` | Document ID muda de `config` para `main` |
| `/teachers/{id}` | `/schools/{schoolId}/teachers/{id}` | IDs preservados |
| `/schedules/{id}` | `/schools/{schoolId}/schedules/{id}` | IDs preservados |
| `/absences/{id}` | `/schools/{schoolId}/absences/{id}` | IDs preservados |
| `/history/{id}` | `/schools/{schoolId}/history/{id}` | IDs preservados |
| `/pending_teachers/{uid}` | `/schools/{schoolId}/pending_teachers/{uid}` | IDs preservados |
| `/pending_actions/{id}` | `/schools/{schoolId}/pending_actions/{id}` | IDs preservados |
| `/admin_actions/{id}` | `/schools/{schoolId}/admin_actions/{id}` | IDs preservados |
| `/admins/{email}` | `/admins/{email}` | Sem mudança — super-admins SaaS globais |

---

## Entrega 2.1 — Script de Migração

### Arquivo afetado

- `scripts/migrate-to-multitenant.js` (novo)

### Descrição

Script Node.js executado uma única vez (manualmente, com Admin SDK) para copiar os dados existentes das coleções globais para `schools/sch-default/...`. Deve ser idempotente: executar duas vezes não corrompe os dados e não gera documentos duplicados.

As coleções originais **não são deletadas** — ficam como fallback de leitura e podem ser removidas manualmente após validação completa.

### Behaviors

- [ ] Criar `scripts/migrate-to-multitenant.js` usando `firebase-admin` inicializado com `serviceAccountKey.json`
- [ ] Verificar se o documento `schools/sch-default` já existe antes de criá-lo; se existir, pular criação (idempotência)
- [ ] Criar `/schools/sch-default` com `{ name: "Escola Principal", createdAt: serverTimestamp(), createdBy: "migration-script", plan: "free" }` se não existir
- [ ] Ler `/meta/config` e gravar em `/schools/sch-default/config/main` preservando todos os campos; se já existir, pular (idempotência via `create` ou verificação prévia)
- [ ] Para cada coleção `teachers`, `schedules`, `absences`, `history`, `pending_teachers`, `pending_actions`, `admin_actions`: ler todos os documentos e gravar em `schools/sch-default/{coleção}/{docId}` preservando todos os campos e o Document ID original; pular documentos que já existem no destino (idempotência)
- [ ] Para cada documento em `teachers/` com `status === 'approved'`: criar ou atualizar `/users/{uid}` onde `uid` é buscado em `pending_teachers/{uid}.uid` (lookup por email como fallback); popular `schools: { "sch-default": { role: derivado de teacher.profile, status: "approved" } }`
- [ ] Para cada documento em `pending_teachers/` com `status === 'pending'`: criar ou atualizar `/users/{pendingDocId}` (Document ID = uid) com `schools: { "sch-default": { role: "pending", status: "pending" } }`
- [ ] Derivar `role` a partir de `teacher.profile`: `'coordinator'` → `'coordinator'`; `'teacher-coordinator'` → `'teacher-coordinator'`; qualquer outro → `'teacher'`
- [ ] Exibir no stdout o resumo ao final: quantidade de documentos migrados por coleção, quantidade de documentos pulados (já existentes), quantidade de entradas `/users/` criadas/atualizadas
- [ ] Exibir aviso explícito no stdout quando `uid` não puder ser resolvido para um teacher (email sem correspondência em `pending_teachers`)
- [ ] Não alterar nem deletar nenhum documento das coleções originais

---

## Entrega 2.2 — `useSchoolStore` (novo Zustand store)

### Arquivo afetado

- `src/store/useSchoolStore.js` (novo)

### Descrição

Store Zustand responsável exclusivamente pelo estado da escola ativa: qual escola o usuário está operando no momento, quais escolas estão disponíveis para ele, e a ação de trocar de escola cancelando listeners da escola anterior.

### Behaviors

- [ ] Criar `src/store/useSchoolStore.js` com estado inicial `{ currentSchoolId: null, currentSchool: null, availableSchools: [] }`
- [ ] Implementar `setCurrentSchool(schoolId)`: busca o documento `schools/{schoolId}` no Firestore e atualiza `currentSchoolId` e `currentSchool` no store
- [ ] Implementar `switchSchool(schoolId)`: antes de chamar `setCurrentSchool`, cancela todos os listeners ativos registrados em `useAppStore` (chama `teardownListeners()`) para evitar memory leaks e leituras cruzadas
- [ ] Implementar `loadAvailableSchools(uid)`: lê o documento `users/{uid}` e monta `availableSchools` como array de `{ schoolId, ...schoolDoc }` para cada entrada em `users.schools`; faz `getDocs` em `schools/{schoolId}` para cada entrada
- [ ] Persistir `currentSchoolId` em `localStorage` sob a chave `gestao_active_school` para restaurar a escola ativa após reload da página
- [ ] Ao inicializar, restaurar `currentSchoolId` do `localStorage` se existir e o uid atual ainda for membro da escola
- [ ] Exportar o store como `default` e nomear o hook `useSchoolStore`

---

## Entrega 2.3 — `useAuthStore` refatorado

### Arquivo afetado

- `src/store/useAuthStore.js` (modificado)

### Descrição

Refatoração do `_resolveRole` para ler o role do usuário a partir de `users/{uid}.schools[currentSchoolId].role` em vez do campo `teacher.profile`. A função `isAdmin()` passa a verificar se o usuário é admin local da escola **ou** está na coleção global `admins/` (super-admin SaaS).

### Behaviors

- [ ] Modificar `_resolveRole(user, schoolId)` para receber `schoolId` como segundo parâmetro
- [ ] Em `_resolveRole`: ler o documento `users/{uid}` do Firestore; verificar `users[uid].schools[schoolId].role` para determinar o role local
- [ ] Manter a verificação `SUPER_USERS` e `await isAdmin(user.email)` como caminho de super-admin SaaS — super-admins recebem `role: 'admin'` independente do `users` doc
- [ ] Se `users/{uid}` não existir ou não contiver o `schoolId` na map `schools`: atribuir `role: 'pending'` e executar o fluxo de `requestTeacherAccess`
- [ ] Modificar `isAdmin()` para retornar `true` se `role === 'admin'` (admin local da escola) **ou** se o email está em `admins/` global (super-admin SaaS); estes dois caminhos já estão presentes — garantir que ambos continuem funcionando após a refatoração
- [ ] Adaptar o listener `onSnapshot(pending_teachers, ...)` para apontar para `schools/{schoolId}/pending_teachers` em vez de `/pending_teachers`
- [ ] Adaptar o listener `onSnapshot(pending_teachers/{uid}, ...)` para apontar para `schools/{schoolId}/pending_teachers/{uid}`
- [ ] Ao chamar `useSchoolStore.switchSchool`, cancelar os listeners `_unsubPending` e `_unsubApproval` antes da troca e recriar após `_resolveRole` ser executado com o novo `schoolId`
- [ ] Manter todos os helpers de role (`isAdmin`, `isCoordinator`, `isTeacher`, `isPending`, `isGeneralCoordinator`, `isTeacherCoordinator`) com as mesmas assinaturas e semântica

---

## Entrega 2.4 — Camada de dados (`src/lib/db/`) refatorada

### Arquivos afetados

- `src/lib/firebase/multi-tenant.js` (novo)
- `src/lib/db/index.js` (modificado)
- `src/lib/db/config.js` (modificado)
- `src/lib/db/cache.js` (modificado)
- `src/lib/db/listeners.js` (modificado)

### Descrição

Introdução de um helper central `multi-tenant.js` que encapsula a construção de referências Firestore escopadas por escola. Todas as funções públicas de `db/index.js` passam a receber `schoolId` como primeiro parâmetro. Os listeners são canceláveis por escola via `teardownListeners()`.

### `src/lib/firebase/multi-tenant.js`

### Behaviors

- [ ] Criar `src/lib/firebase/multi-tenant.js` exportando `getSchoolCollectionRef(schoolId, subcollection)`: retorna `collection(db, 'schools', schoolId, subcollection)`
- [ ] Exportar `getSchoolDocRef(schoolId, subcollection, docId)`: retorna `doc(db, 'schools', schoolId, subcollection, docId)`
- [ ] Exportar `getSchoolConfigRef(schoolId)`: retorna `doc(db, 'schools', schoolId, 'config', 'main')`
- [ ] Exportar `getSchoolRef(schoolId)`: retorna `doc(db, 'schools', schoolId)`

### `src/lib/db/index.js`

### Behaviors

- [ ] Adicionar `schoolId` como primeiro parâmetro em todas as funções que acessam coleções de dados da escola: `loadFromFirestore(schoolId)`, `saveDoc(schoolId, col, item)`, `updateDocById(schoolId, col, id, changes)`, `deleteDocById(schoolId, col, id)`
- [ ] Modificar `loadFromFirestore(schoolId)` para ler de `schools/{schoolId}/config/main`, `schools/{schoolId}/teachers`, `schools/{schoolId}/schedules`, `schools/{schoolId}/absences`, `schools/{schoolId}/history`
- [ ] Manter as funções `isAdmin`, `addAdmin`, `listAdmins`, `removeAdmin` apontando para a coleção global `/admins/` sem `schoolId` (super-admins SaaS são globais)
- [ ] Modificar `getTeacherByEmail`, `patchTeacherSelf`, `requestTeacherAccess`, `listPendingTeachers`, `approveTeacher`, `rejectTeacher` para receber `schoolId` e usar `getSchoolCollectionRef(schoolId, 'teachers')` / `getSchoolCollectionRef(schoolId, 'pending_teachers')`
- [ ] Modificar `submitPendingAction`, `getPendingActions`, `getMyPendingActions`, `approvePendingAction`, `rejectPendingAction`, `subscribePendingActionsCount` para receber `schoolId` e usar `getSchoolCollectionRef(schoolId, 'pending_actions')`

### `src/lib/db/config.js`

### Behaviors

- [ ] Modificar `saveConfig(schoolId, state)` para usar `getSchoolConfigRef(schoolId)` em vez de `doc(db, 'meta', 'config')`

### `src/lib/db/cache.js`

### Behaviors

- [ ] Modificar `_saveToLS(schoolId, state)` para usar a chave `gestao_v9_cache_${schoolId}` em vez de `gestao_v8_cache`
- [ ] Modificar `_loadFromLS(schoolId)` para ler da chave `gestao_v9_cache_${schoolId}`
- [ ] Manter TTL de 1 hora e mesma estrutura de dados no objeto cacheado
- [ ] Não migrar automaticamente dados do cache `gestao_v8_cache` — cache antigo é ignorado e expira naturalmente

### `src/lib/db/listeners.js`

### Behaviors

- [ ] Modificar `setupRealtimeListeners(schoolId, store)` para receber `schoolId` e registrar listeners em `schools/{schoolId}/config/main`, `schools/{schoolId}/teachers`, `schools/{schoolId}/schedules`
- [ ] Modificar `registerAbsencesListener(schoolId, store)` para apontar para `schools/{schoolId}/absences`
- [ ] Modificar `registerHistoryListener(schoolId, store)` para apontar para `schools/{schoolId}/history`
- [ ] Implementar `teardownListeners()`: cancela todos os `unsub` ativos registrados pelo módulo (config, teachers, schedules, absences, history), preparando para troca de escola
- [ ] Exportar `teardownListeners` publicamente de `src/lib/db/index.js`

---

## Entrega 2.5 — Firestore Security Rules (multi-tenant)

### Arquivo afetado

- `firestore.rules` (reescrito)

### Descrição

Reescrita completa das rules para cobrir a hierarquia `schools/{schoolId}/...`. O isolamento entre escolas é garantido pelas funções auxiliares `isSaasAdmin()`, `isMemberOf(schoolId)` e `isSchoolAdmin(schoolId)`. Um teacher da escola A não consegue ler nem escrever dados da escola B.

### Behaviors

- [ ] Implementar `isSaasAdmin()`: retorna `true` se `exists(/databases/$(database)/documents/admins/$(request.auth.token.email.lower()))`
- [ ] Implementar `isMemberOf(schoolId)`: retorna `true` se `get(/databases/.../users/$(request.auth.uid)).data.schools[schoolId]` existe (usa `request.auth.uid`, não email)
- [ ] Implementar `isSchoolAdmin(schoolId)`: retorna `true` se `get(/databases/.../users/$(request.auth.uid)).data.schools[schoolId].role == 'admin'`
- [ ] Implementar `isSchoolMember(schoolId)` (alias legível): retorna `isMemberOf(schoolId)` para uso nos match blocks
- [ ] Regra para `/schools/{schoolId}`: leitura permitida se `isSaasAdmin() || isMemberOf(schoolId)`; escrita permitida apenas `isSaasAdmin()`
- [ ] Regra para `/schools/{schoolId}/config/main`: leitura se `isMemberOf(schoolId) || isSaasAdmin()`; escrita se `isSchoolAdmin(schoolId) || isSaasAdmin()`
- [ ] Regra para `/schools/{schoolId}/teachers/{docId}`: leitura se `isMemberOf(schoolId) || isSaasAdmin()`; write geral se `isSchoolAdmin(schoolId) || isSaasAdmin()`; update parcial (campos `celular`, `whatsapp`, `apelido`, `name`, `subjectIds`, `horariosSemana`) se `resource.data.email.lower() == request.auth.token.email.lower()`
- [ ] Regra para `/schools/{schoolId}/schedules/{docId}`: leitura se `isMemberOf(schoolId) || isSaasAdmin()`; write geral se `isSchoolAdmin(schoolId) || isSaasAdmin()`; create/update/delete do próprio teacher se `resource.data.teacherId == request.auth.uid || ownsProfileIn(schoolId, resource.data.teacherId)`
- [ ] Regra para `/schools/{schoolId}/absences/{docId}`: leitura se `isMemberOf(schoolId) || isSaasAdmin()`; create se `isMemberOf(schoolId) && !hasFormationSlot(request.resource.data.slots) && (isSchoolAdmin(schoolId) || ownTeacherAbsence(schoolId))`; update mesmas condições; delete se `isSchoolAdmin(schoolId) || isSaasAdmin() || ownTeacherAbsence(schoolId)`; manter guard `!hasFormationSlot` intacto
- [ ] Regra para `/schools/{schoolId}/history/{docId}`: leitura se `isMemberOf(schoolId) || isSaasAdmin()`; write se `isSchoolAdmin(schoolId) || isSaasAdmin()`
- [ ] Regra para `/schools/{schoolId}/pending_teachers/{docId}`: leitura/escrita se `isSchoolAdmin(schoolId) || isSaasAdmin() || (request.auth.uid == docId && isMemberOf(schoolId))`
- [ ] Regra para `/schools/{schoolId}/pending_actions/{id}`: leitura se `isSchoolAdmin(schoolId) || isSaasAdmin()`; create se `isMemberOf(schoolId)`; update/delete se `isSchoolAdmin(schoolId) || isSaasAdmin()`
- [ ] Regra para `/schools/{schoolId}/admin_actions/{id}`: leitura/create se `isSchoolAdmin(schoolId) || isSaasAdmin()`; update/delete `false` (log imutável)
- [ ] Regra para `/users/{uid}`: leitura se `request.auth.uid == uid || isSaasAdmin()`; escrita se `request.auth.uid == uid || isSaasAdmin()` (usuário gerencia seu próprio doc; migration script usa Admin SDK, não precisa de rule)
- [ ] Regra para `/admins/{doc}`: leitura se `isSaasAdmin() || (request.auth != null && doc == request.auth.token.email.lower())`; escrita se `isSaasAdmin()`
- [ ] Garantir que um teacher da escola A (com `isMemberOf('sch-a')` = true) não tenha acesso de leitura a `schools/sch-b/...` (isolamento verificável via teste de rules)
- [ ] Implementar `ownsProfileIn(schoolId, teacherId)` como helper interno: faz `get` em `schools/{schoolId}/teachers/{teacherId}` e compara email

---

## Entrega 2.6 — Cache localStorage isolado por escola

### Arquivo afetado

- `src/lib/db/cache.js` (já coberto na Entrega 2.4)

### Behaviors

- [ ] Garantir que a chave de cache é `gestao_v9_cache_${schoolId}` — a inclusão do `schoolId` na chave isola o cache de escolas diferentes para o mesmo browser
- [ ] Cache `gestao_v8_cache` (geração anterior) não é lido nem migrado — será ignorado pelo browser e expirado naturalmente pelo TTL do browser
- [ ] Validar que ao trocar de escola via `switchSchool`, o próximo `loadFromFirestore` usa a chave de cache correta da nova escola, sem contaminação com dados da escola anterior

---

## Entrega 2.7 — Testes de Firestore Security Rules (multi-tenant)

### Arquivos afetados

- `src/__tests__/rules/multitenant.rules.test.js` (novo)
- `src/__tests__/rules/setup.js` (modificado — adicionar helpers de escola)

### Behaviors

- [ ] Adicionar helper `asMemberOf(env, schoolId, uid?, role?)` em `setup.js`: inicializa contexto autenticado onde `users/{uid}.schools[schoolId]` existe com o role informado
- [ ] Adicionar helper `asSaasAdmin(env)` em `setup.js`: inicializa contexto onde o email está na coleção `/admins/`
- [ ] Criar teste: teacher da escola A com `isMemberOf('sch-a') = true` tenta ler `schools/sch-b/teachers/{id}` — deve ser **negado**
- [ ] Criar teste: teacher da escola A tenta escrever em `schools/sch-b/absences` — deve ser **negado**
- [ ] Criar teste: super-admin (`isSaasAdmin = true`) lê `schools/sch-a/teachers` — deve ser **permitido**
- [ ] Criar teste: super-admin lê `schools/sch-b/config/main` — deve ser **permitido**
- [ ] Criar teste: usuário sem nenhuma entrada em `users/{uid}.schools` tenta ler `schools/sch-a/teachers` — deve ser **negado**
- [ ] Criar teste: teacher da escola A lê `schools/sch-a/teachers` — deve ser **permitido**
- [ ] Criar teste: teacher da escola A (não admin) tenta escrever `schools/sch-a/config/main` — deve ser **negado**
- [ ] Criar teste: school admin da escola A escreve `schools/sch-a/config/main` — deve ser **permitido**
- [ ] Criar teste: teacher da escola A cria absence com slot de formação (`subjectId: 'formation-atpcg'`) — deve ser **negado** (guard `hasFormationSlot` mantido)
- [ ] Todos os testes passam com `npm run test:rules`

---

## Entrega 2.8 — Testes de `useAuthStore`

### Arquivo afetado

- `src/__tests__/useAuthStore.multitenant.test.js` (novo)

### Behaviors

- [ ] Criar teste: `_resolveRole` com `users/{uid}.schools[schoolId].role = 'admin'` atribui `role: 'admin'` ao store
- [ ] Criar teste: `_resolveRole` com `users/{uid}.schools[schoolId].role = 'coordinator'` atribui `role: 'coordinator'`
- [ ] Criar teste: `_resolveRole` com `users/{uid}.schools[schoolId].role = 'teacher'` atribui `role: 'teacher'`
- [ ] Criar teste: `_resolveRole` quando `users/{uid}` não possui entrada para `schoolId` atribui `role: 'pending'`
- [ ] Criar teste: `_resolveRole` quando email está em `/admins/` (super-admin SaaS) atribui `role: 'admin'` mesmo sem entrada em `users/{uid}.schools`
- [ ] Criar teste: `isAdmin()` retorna `true` para `role: 'admin'`; retorna `false` para `role: 'teacher'`
- [ ] Todos os testes passam com `npm run test` ou `npx vitest run`

---

## Componentes Compartilhados (novos)

### `SchoolSwitcher` — `src/components/ui/SchoolSwitcher.jsx`

Dropdown exibido no `Navbar` apenas quando o usuário tem 2 ou mais escolas em `availableSchools`. Exibe o nome da escola ativa e permite selecionar outra.

**Behaviors:**
- [ ] Renderizar o componente somente se `availableSchools.length >= 2`
- [ ] Exibir o `currentSchool.name` como label do botão de trigger
- [ ] Ao selecionar uma escola diferente: chamar `useSchoolStore.switchSchool(schoolId)` e exibir toast de confirmação com `toast('Escola alterada para ${name}', 'ok')`
- [ ] Desabilitar (estado visual) a escola atualmente ativa na lista de opções
- [ ] Fechar o dropdown ao clicar fora (click-outside handler)

---

### `SchoolHeader` — `src/components/ui/SchoolHeader.jsx`

Faixa discreta no topo das páginas de administração/coordenação exibindo o nome da escola ativa.

**Behaviors:**
- [ ] Renderizar somente para roles `admin`, `coordinator`, `teacher-coordinator`
- [ ] Exibir `currentSchool.name` com ícone de escola
- [ ] Não renderizar nada enquanto `currentSchool` for `null`
- [ ] Usar token de design `bg-surf2 text-t2` para aparência discreta e não intrusiva

---

## Páginas e Rotas

As rotas existentes não mudam. O que muda é que todas as pages que consomem o store passam a ter o `schoolId` ativo disponível via `useSchoolStore`. Nenhuma nova rota é criada nesta fase.

### App.jsx — Orquestração de inicialização

**Behaviors:**
- [ ] Após `loadFromFirestore()`, passar `schoolId` do `useSchoolStore.currentSchoolId` para `setupRealtimeListeners(schoolId, store)`
- [ ] Aguardar `useSchoolStore.setCurrentSchool` resolver antes de chamar `useAuthStore.init`
- [ ] No `useEffect` de init: chamar `useSchoolStore.loadAvailableSchools(user.uid)` assim que `user` estiver disponível via `onAuthStateChanged`, antes de `_resolveRole`
- [ ] Restaurar `currentSchoolId` do localStorage ao montar; se não existir e o usuário tiver exatamente uma escola, selecionar automaticamente

### Navbar — `src/components/layout/Navbar.jsx`

**Behaviors:**
- [ ] Incluir `<SchoolSwitcher />` no layout do Navbar (desktop: próximo ao avatar; mobile: no menu lateral)
- [ ] Ocultar `SchoolSwitcher` quando `availableSchools.length < 2`

---

## Regras de Negócio

1. **Isolamento total entre escolas:** nenhum usuário acessa dados de uma escola da qual não é membro, nem via cliente React nem via Firestore Rules diretas.

2. **Super-admin SaaS é global:** usuário com documento em `/admins/{email}` tem acesso de leitura e escrita em qualquer escola sem necessidade de entrada em `users/{uid}.schools`.

3. **Admin local vs super-admin SaaS:** um admin local (`users/{uid}.schools[schoolId].role = 'admin'`) gerencia apenas sua escola. Um super-admin SaaS gerencia todas.

4. **Escola ativa é singleton no cliente:** o usuário opera em exatamente uma escola por vez. `useSchoolStore.currentSchoolId` é a fonte de verdade para qual escola está ativa.

5. **Troca de escola cancela todos os listeners:** ao chamar `switchSchool`, `teardownListeners()` é chamado antes de reiniciar o processo de init com o novo `schoolId`, evitando leituras cruzadas de dados de escolas distintas.

6. **Cache é isolado por escola:** chaves de localStorage incluem `schoolId` para que dados de escola A nunca sejam servidos como cache ao acessar escola B no mesmo browser.

7. **Idempotência do script de migração:** rodar o script duas vezes produz exatamente o mesmo estado final. Documentos existentes no destino são pulados, não sobrescritos.

8. **Coleções originais não são deletadas:** o script de migração copia, não move. A remoção das coleções originais (`/meta/`, `/teachers/`, etc.) é feita manualmente após validação completa em produção.

9. **Slots de formação continuam bloqueados:** a regra `hasFormationSlot` é preservada nas novas rules, agora escopada por escola.

10. **`users/{uid}` é escrito apenas pelo próprio usuário ou pelo Admin SDK:** o script de migração usa Admin SDK (bypass de rules). O cliente React não cria documentos em `/users/` diretamente — `requestTeacherAccess` passa a criar a entrada em `schools/{schoolId}/pending_teachers/{uid}` e atualizar `users/{uid}.schools[schoolId] = { role: 'pending', status: 'pending' }` via Cloud Function ou Admin SDK.

---

## Critério de Conclusão Geral

- [ ] Toda query do cliente React usa `schools/{schoolId}/...`; nenhuma query aponta para coleções globais (exceto `/admins/`)
- [ ] `npm run build` conclui sem erros
- [ ] Deploy Firebase funcional (`firebase deploy`)
- [ ] Firestore Rules rejeitam leitura cruzada entre escolas (confirmado por testes de rules)
- [ ] Script de migração executa sem erro no ambiente de produção e é idempotente (segunda execução não altera o estado)
- [ ] `npm run test:rules` passa com todos os testes de isolamento multi-tenant
- [ ] `SchoolSwitcher` não é exibido para usuários com uma única escola

---

## Fora do Escopo (v2)

- **Criação de novas escolas via UI:** nesta fase, `schools/sch-default` é criada apenas pelo script de migração. Não há tela de onboarding para criar escolas adicionais.
- **Convite de usuários entre escolas via UI:** adicionar um usuário a uma segunda escola é operação manual via Firestore Console ou script.
- **Billing e planos:** o campo `plan` em `/schools/{schoolId}` é populado como `'free'` pelo script; não há lógica de upgrade ou cobrança.
- **Dashboard SaaS super-admin:** não há página de gestão de escolas para o super-admin SaaS. O gerenciamento continua via Firestore Console.
- **Migração automática do cache antigo (`gestao_v8_cache`):** o cache anterior é simplesmente ignorado; o usuário faz uma primeira carga do Firestore ao trocar para a nova chave.
- **Remoção das coleções globais originais:** será feita manualmente após validação, não é parte do código desta fase.
- **Multi-tenant em Cloud Functions:** as functions da Fase 1 continuam operando; a adaptação delas para `schoolId` é trabalho para uma fase posterior.
