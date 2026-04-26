# Spec: Fase 1 — Segurança do Sistema Atual (GestorEscola SaaS)

## Visão Geral

Preparação de segurança do sistema GestãoEscolar antes de qualquer migração multi-tenant. O sistema é atualmente single-tenant (React + Firebase Firestore) com brechas de segurança nas Firestore Security Rules, credenciais hardcoded no fonte e ausência de testes para rules. Esta fase fecha essas brechas sem alterar nenhuma feature de produto, criando a base segura sobre a qual a Fase 2 (multi-tenant) poderá ser construída.

**Problema resolvido:** qualquer usuário autenticado (inclusive professores pendentes de aprovação) pode criar, editar e deletar ausências de qualquer outro professor diretamente via Firestore. Além disso, credenciais do Firebase e o email super-admin estão hardcoded no código-fonte, impedindo múltiplos ambientes e rotação segura de credenciais.

**Pré-requisito para:** Fase 2 (Infraestrutura Multi-Tenant). Não iniciar Fase 2 sem esta fase completa.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Zustand
- **Backend:** Firebase Firestore + Firebase Functions (TypeScript)
- **Auth:** Firebase Auth (Google OAuth)
- **Testes:** Vitest + `@firebase/rules-unit-testing` + `firebase-admin`
- **Emulador:** Firebase Emulator Suite (Firestore local na porta 8080)

---

## Escopo desta fase

Esta fase não adiciona nem modifica features visíveis ao usuário final. Todas as mudanças são de infraestrutura, segurança e testabilidade. As quatro entregas são:

| Entrega | Descrição |
|---|---|
| 1.5 — Variáveis de ambiente | Mover Firebase config e super-admin email hardcoded para `.env` |
| 1.1 — Infraestrutura de testes | Instalar dependências e criar helpers para testes de Firestore Security Rules |
| 1.2 — Testes baseline | Documentar comportamento atual das rules, incluindo brechas como testes que passam |
| 1.3 — Correção das rules | Fechar as três brechas confirmadas; testes de brecha passam a falhar |
| 1.4 — Cloud Functions | Callable functions para operações de coordenador; cliente atualizado para usá-las |

---

## Entrega 1.5 — Variáveis de Ambiente

### Arquivos Afetados

- `src/lib/firebase/index.js` — remover config hardcoded
- `src/store/useAuthStore.js` — remover `SUPER_USERS` hardcoded
- `firestore.rules` — remover email hardcoded de `isAdmin()`
- `.env.local` (criar, não commitar)
- `.env.example` (criar, commitar)
- `.gitignore` (atualizar)

### Behaviors

- [ ] Criar `.env.local` com as chaves `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` e `VITE_SUPER_ADMIN_EMAIL`, populadas com os valores reais de produção
- [ ] Criar `.env.example` com as mesmas chaves e valores vazios (arquivo seguro para commitar)
- [ ] Adicionar `.env.local` e `.env.*.local` ao `.gitignore`
- [ ] Modificar `src/lib/firebase/index.js` para ler cada campo via `import.meta.env.VITE_FIREBASE_*`
- [ ] Modificar `src/store/useAuthStore.js` para ler `SUPER_USERS` de `[import.meta.env.VITE_SUPER_ADMIN_EMAIL].filter(Boolean)`
- [ ] Modificar `firestore.rules` para remover o email literal `'contato.tarciso@gmail.com'` da função `isAdmin()`, deixando-a depender apenas de `exists(.../admins/$(request.auth.token.email.lower()))`
- [ ] Verificar que o documento `admins/contato.tarciso@gmail.com` existe no Firestore antes de fazer deploy das rules modificadas (pré-condição para não perder acesso de admin)
- [ ] Validar que `npm run build` conclui sem erros com variáveis lidas de `.env.local`
- [ ] Validar que `.env.local` não aparece em `git status` após as mudanças

### Critério de conclusão

Build funciona com variáveis de `.env.local`; `.env.local` não está rastreado pelo git; `.env.example` está commitado; função `isAdmin()` nas rules não contém nenhum email literal.

---

## Entrega 1.1 — Infraestrutura de Testes para Firestore Security Rules

### Arquivos Afetados

- `package.json` — adicionar dependências e script `test:rules`
- `src/__tests__/rules/setup.js` — helpers de ambiente de teste

### Behaviors

- [ ] Instalar `@firebase/rules-unit-testing` e `firebase-admin` como `devDependencies`
- [ ] Criar `src/__tests__/rules/setup.js` exportando: `createTestEnv()`, `asAdmin(env)`, `asTeacher(env, uid?, email?)`, `asPending(env, uid?)`, `asAnonymous(env)`
- [ ] `createTestEnv()` inicializa `initializeTestEnvironment` apontando para o projeto `gestordesubstituicoes-test`, lendo as rules de `firestore.rules` e conectando ao emulador em `localhost:8080`
- [ ] Adicionar script `"test:rules"` no `package.json` com valor `"firebase emulators:exec --only firestore 'vitest run src/__tests__/rules/'"` 
- [ ] Executar `npm run test:rules` sem erros (mesmo com 0 testes ainda) para validar que o emulador sobe e o script funciona

### Critério de conclusão

`npm run test:rules` executa sem erro de configuração com 0 testes.

---

## Entrega 1.2 — Testes Baseline das Rules Atuais

### Arquivos Afetados

- `src/__tests__/rules/absences.rules.test.js`
- `src/__tests__/rules/schedules.rules.test.js`
- `src/__tests__/rules/teachers.rules.test.js`
- `src/__tests__/rules/admin_actions.rules.test.js`

### Propósito

Documentar o comportamento das rules antes de qualquer correção. Alguns testes documentam brechas existentes como comportamento que "passa" atualmente mas é incorreto. Esses testes vão mudar de resultado (começar a falhar) quando as correções da Entrega 1.3 forem aplicadas — isso é esperado e indica que a brecha foi fechada.

### Behaviors — `absences.rules.test.js`

- [ ] Testar que admin cria ausência com slots normais: deve ser permitido
- [ ] Testar que usuário autenticado lê ausência: deve ser permitido
- [ ] Testar que slots com `subjectId` prefixado `formation-` na posição `slots[0]` bloqueiam criação: deve ser bloqueado (comportamento correto já existente)
- [ ] Testar que slots com `subjectId` prefixado `formation-` na posição `slots[0]` bloqueiam atualização: deve ser bloqueado (comportamento correto já existente)
- [ ] **[BRECHA]** Testar que usuário `pending` cria ausência com slots normais: ATUALMENTE PERMITE — documentar como comportamento incorreto a ser corrigido
- [ ] **[BRECHA]** Testar que teacher cria ausência de outro teacher (teacherId diferente do próprio): ATUALMENTE PERMITE — documentar como comportamento incorreto
- [ ] **[BRECHA]** Testar que teacher deleta ausência de outro teacher: ATUALMENTE PERMITE — documentar como comportamento incorreto
- [ ] **[BRECHA]** Testar que slot com `formation-` na posição `slots[1]` bloqueia criação: ATUALMENTE PERMITE — documentar como comportamento incorreto (bug no `hasFormationSlot`)

### Behaviors — `schedules.rules.test.js`

- [ ] Testar que admin cria schedule: deve ser permitido
- [ ] Testar que teacher cria schedule com `teacherId == auth.uid`: deve ser permitido
- [ ] Testar que teacher deleta próprio schedule: deve ser permitido
- [ ] Testar que teacher deleta schedule de outro teacher: deve ser negado
- [ ] Testar que teacher atualiza `teacherId` de um schedule para outro uid: deve ser negado
- [ ] Testar que usuário anônimo lê schedule: deve ser negado

### Behaviors — `teachers.rules.test.js`

- [ ] Testar que admin atualiza qualquer campo de teacher: deve ser permitido
- [ ] Testar que teacher atualiza próprio `celular`, `whatsapp`, `apelido`, `name`, `subjectIds`, `horariosSemana`: deve ser permitido
- [ ] Testar que teacher tenta atualizar próprio `profile`: deve ser negado
- [ ] Testar que teacher tenta atualizar próprio `status`: deve ser negado
- [ ] Testar que teacher tenta atualizar documento de outro teacher: deve ser negado
- [ ] Testar que usuário anônimo lê coleção `teachers`: deve ser negado

### Behaviors — `admin_actions.rules.test.js`

- [ ] **[BUG CONFIRMADO]** Testar que admin grava em `admin_actions`: ATUALMENTE NEGA (auditoria está silenciosamente falhando) — documentar como bug a ser corrigido na Entrega 1.3
- [ ] Testar que teacher tenta gravar em `admin_actions`: deve ser negado (comportamento correto por acidente)

### Critério de conclusão

Todos os testes passam, incluindo os que documentam brechas como comportamento "PERMITE" (eles usam `assertSucceeds` para confirmar que a brecha existe).

---

## Entrega 1.3 — Corrigir as Firestore Security Rules

### Arquivos Afetados

- `firestore.rules`

### Behaviors

- [ ] **Correção A — Ownership em `absences`:** modificar regra `allow create` para exigir, além de `!hasFormationSlot`, que o `request.resource.data.teacherId` seja igual ao `request.auth.uid` OU que o usuário seja admin (via `isAdmin()`) OU que o usuário seja dono do perfil do teacher (`ownsProfile(request.resource.data.teacherId)`)
- [ ] **Correção A — `allow update`:** mesma lógica: admin, dono por uid, ou dono por email via `ownsProfile`
- [ ] **Correção A — `allow delete`:** restringir a admin ou `ownsProfile(resource.data.teacherId)`
- [ ] **Correção B — `hasFormationSlot`:** expandir a função para verificar as posições `slots[0]` até `slots[4]` explicitamente (Firestore Rules não tem `.some()`), verificando condicionalmente `slots.size() > N` antes de acessar cada índice
- [ ] **Correção C — `admin_actions`:** adicionar bloco `match /admin_actions/{id}` com: `allow read: if isAdmin()`, `allow create: if isAdmin()`, `allow update, delete: if false` (log imutável)
- [ ] Após aplicar Correção A: os testes de brecha de ownership (`pending` cria ausência, teacher cria ausência de outro, teacher deleta ausência de outro) devem passar a falhar com `assertFails`
- [ ] Após aplicar Correção B: o teste de brecha de `slots[1]` com `formation-` deve passar a falhar com `assertFails`
- [ ] Após aplicar Correção C: o teste de bug de auditoria (admin grava em `admin_actions`) deve passar a ser permitido com `assertSucceeds`
- [ ] Todos os testes que documentavam comportamento correto (não eram brechas) continuam passando sem alteração

### Critério de conclusão

Todos os testes de rules passam. Os testes que antes usavam `assertSucceeds` para documentar brechas agora usam `assertFails` (ou foram reescritos para refletir o comportamento corrigido).

---

## Entrega 1.4 — Cloud Functions para Operações Privilegiadas de Coordenador

### Arquivos Afetados

- `functions/` (novo diretório, inicializado via `firebase init functions`)
- `functions/src/index.ts` — implementação das callable functions
- `src/lib/db/index.js` ou equivalente — atualizar cliente para usar functions
- `package.json` (raiz) — adicionar script para emular functions localmente

### Contexto

As Firestore Security Rules não conseguem verificar o campo `profile` de um teacher pelo UID (apenas por email via `ownsProfile`). Todo controle de "coordenador pode fazer X" é atualmente client-side e bypassável por qualquer requisição direta ao Firestore. Para um SaaS isso é inaceitável. A solução é mover operações privilegiadas de coordenador para Cloud Functions que verificam o role via Admin SDK.

### Behaviors — Inicialização

- [ ] Executar `firebase init functions` com TypeScript, ESLint e sem instalar dependências automaticamente
- [ ] Estrutura criada: `functions/src/index.ts`, `functions/package.json`, `functions/tsconfig.json`
- [ ] Adicionar `firebase-admin` e `firebase-functions` como dependências do `functions/package.json`

### Behaviors — `createAbsence`

- [ ] Receber payload: `{ teacherId: string, slots: SlotInput[] }`
- [ ] Verificar via Admin SDK que `auth.uid` tem `profile` `coordinator`, `teacher-coordinator` ou é admin (lendo `/teachers/{uid}` ou `/admins/{email}`)
- [ ] Rejeitar com `functions.https.HttpsError('permission-denied', ...)` se role insuficiente
- [ ] Validar que nenhum slot tem `subjectId` prefixado com `formation-`; rejeitar com `invalid-argument` se houver
- [ ] Gravar documento em `/absences/{newId}` via Admin SDK
- [ ] Retornar `{ id: newId }` ao cliente

### Behaviors — `updateAbsence`

- [ ] Receber payload: `{ absenceId: string, slots: SlotInput[], substituteId?: string | null }`
- [ ] Verificar role do chamador (mesmo critério de `createAbsence`)
- [ ] Validar slots contra slots de formação
- [ ] Atualizar documento em `/absences/{absenceId}`
- [ ] Retornar `{ ok: true }` ao cliente

### Behaviors — `deleteAbsence`

- [ ] Receber payload: `{ absenceId: string }`
- [ ] Verificar que chamador é admin ou coordenador da escola
- [ ] Deletar documento `/absences/{absenceId}`
- [ ] Retornar `{ ok: true }` ao cliente

### Behaviors — `applyPendingAction`

- [ ] Receber payload: `{ pendingActionId: string, approved: boolean, rejectionReason?: string }`
- [ ] Verificar que chamador é admin
- [ ] Ler `/pending_actions/{pendingActionId}`
- [ ] Se `approved: true`: executar o payload da action (ex: adicionar segmento, modificar config)
- [ ] Gravar log em `/admin_actions/{newId}` com `actionType`, `actorId`, `payload` e `timestamp`
- [ ] Atualizar `pending_actions/{pendingActionId}` com `status: 'approved' | 'rejected'`, `reviewedBy`, `reviewedAt` e `rejectionReason` (se negado)
- [ ] Retornar `{ ok: true }` ao cliente

### Behaviors — Atualização do Cliente

- [ ] Importar `getFunctions` e `httpsCallable` do SDK Firebase no cliente
- [ ] Substituir chamadas diretas `addDoc(collection(db, 'absences'), data)` por `httpsCallable(functions, 'createAbsence')({ teacherId, slots })`
- [ ] Substituir `updateDoc(doc(db, 'absences', id), data)` por `httpsCallable(functions, 'updateAbsence')({ absenceId, slots, substituteId })`
- [ ] Substituir `deleteDoc(doc(db, 'absences', id))` por `httpsCallable(functions, 'deleteAbsence')({ absenceId })`
- [ ] Substituir chamada de aprovação de `pending_actions` por `httpsCallable(functions, 'applyPendingAction')({ pendingActionId, approved, rejectionReason })`
- [ ] Tratar `HttpsError` nas chamadas e exibir mensagem de erro adequada na UI

### Critério de conclusão

Coordenador não consegue criar ausência via request direto ao Firestore (rules bloqueiam `isAuthenticated()` sem verificação de role na Correção A). Apenas via Cloud Function que valida role via Admin SDK. As quatro functions deployam sem erros e o cliente as chama corretamente.

---

## Componentes Compartilhados

Nenhum componente de UI novo é criado nesta fase. As mudanças são de infraestrutura e segurança.

---

## Modelos de Dados

As coleções existentes não mudam estrutura. As três brechas corrigidas afetam apenas as rules de acesso, não os campos dos documentos.

### `/absences/{id}` (existente, rules corrigidas)

```
{
  id: string,
  teacherId: string,       // verificado nas rules: deve ser do próprio teacher ou via function
  createdAt: Timestamp,
  status: 'open' | 'covered',
  slots: [
    {
      id: string,
      date: string,         // "YYYY-MM-DD"
      day: string,
      timeSlot: string,
      scheduleId: string,
      subjectId: string,    // se prefixado "formation-*", bloqueia create/update
      turma: string,
      substituteId: string | null
    }
  ]
}
```

### `/admin_actions/{id}` (existente, rule adicionada)

```
{
  actionType: string,
  actorId: string,          // uid do admin que executou
  payload: object,          // dados da ação
  timestamp: Timestamp,
  pendingActionId: string | null
}
```

### `/admins/{emailLowercase}` (existente, usado pela rule corrigida de isAdmin)

```
{
  email: string,
  name: string,
  addedAt: Timestamp,
  addedBy: string
}
```

**Pré-condição:** o documento `admins/contato.tarciso@gmail.com` deve existir antes do deploy das rules que removem o email hardcoded.

---

## Regras de Negócio

### 1. Ownership em ausências

Um teacher só pode criar ou editar uma ausência referenciando o próprio `teacherId`. Coordenadores e admins operam via Cloud Functions que verificam role no servidor. Nenhuma escrita direta ao Firestore é permitida por usuários não-admin.

### 2. Bloqueio de slots de formação

Qualquer slot com `subjectId` prefixado por `formation-` é bloqueado na criação e atualização de ausências, independentemente do role do chamador. Esta verificação ocorre tanto nas Firestore Rules (`hasFormationSlot` corrigida para verificar até `slots[4]`) quanto na Cloud Function `createAbsence`/`updateAbsence`. A convenção de prefixo `formation-` é contrato obrigatório para quaisquer `sharedSeries` do tipo formação.

### 3. Auditoria de ações administrativas imutável

Documentos em `/admin_actions/` só podem ser criados (por admins). Update e delete são bloqueados pelas rules. Isso garante trilha de auditoria imutável para operações administrativas.

### 4. Verificação de role via Admin SDK

As Firestore Security Rules não têm acesso ao campo `profile` dos teachers (não há como cruzar `auth.uid` com `teachers/{id}.profile` sem leitura adicional). Por isso, qualquer operação que exija verificação de role de coordenador passa obrigatoriamente por Cloud Function, que usa o Firebase Admin SDK para ler o documento do teacher e verificar o campo `profile` antes de executar a operação.

### 5. Configuração via variáveis de ambiente

Nenhuma credencial, email de super-admin ou configuração de ambiente pode estar hardcoded no código-fonte. O build deve falhar se as variáveis `VITE_FIREBASE_*` não estiverem definidas. Em CI/CD, as variáveis devem ser injetadas via secrets.

---

## Ordem de Execução Recomendada

As entregas devem ser executadas nesta ordem, pois há dependências entre elas:

```
1.5 (env vars)
    ↓
1.1 (infra de testes)
    ↓
1.2 (testes baseline — documentar brechas)
    ↓
1.3 (corrigir rules — brechas documentadas passam a falhar)
    ↓
1.4 (Cloud Functions — cliente migrado para não depender de write direto)
```

A entrega 1.5 vem primeiro porque a correção de `isAdmin()` nas rules (remover email hardcoded) é pré-requisito para as entregas 1.3 e 1.4 serem deployadas com segurança.

---

## Fora do Escopo (Fase 1)

- Migração para estrutura multi-tenant (`schools/{schoolId}/...`) — isso é Fase 2
- Novos roles ou permissões além dos existentes (`admin`, `coordinator`, `teacher-coordinator`, `teacher`, `pending`)
- Billing, onboarding de nova escola, seletor de escola — isso é Fase 3
- Testes de componentes React ou stores Zustand
- Testes de integração end-to-end (Cypress/Playwright)
- Deploy automático — apenas commit + push conforme fluxo atual do projeto
- Modificação de qualquer feature visível ao usuário final
- Migração de usuários ou dados históricos
