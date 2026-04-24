# Plano de Refatoração: SaaS Multi-Escolas + Segurança

> Documento técnico interno. Escrito para ser consumido por Claude em sessões futuras.
> O spec de arquitetura multi-tenant já existe em `todo/spec_multi_escolas.md`.
> Este documento foca no **plano de execução**: o que mudar, em que ordem, por quê,
> e quais invariantes devem ser validados em testes antes de cada etapa seguinte.

---

## Estado atual do codebase

### Single-tenant. Todas as coleções são globais:

```
/meta/config          → configuração única da escola (segments, areas, subjects, periodConfigs, sharedSeries)
/teachers/{id}        → professores da escola
/schedules/{id}       → horários de aula
/absences/{id}        → faltas e substituições
/history/{id}         → histórico de operações
/pending_teachers/{uid} → solicitações de acesso aguardando aprovação
/pending_actions/{id} → ações de coordenador aguardando aprovação de admin
/admins/{email}       → lista de admins
/admin_actions/{id}   → log de auditoria (sem regra Firestore — gravações provavelmente falham silenciosamente)
```

### O que existe em testes hoje:

| Arquivo | Cobertura real |
|---|---|
| `src/__tests__/absences.test.js` (44 casos) | Lógica pura de substituição. Não toca Firebase. |
| `src/__tests__/dropdown.test.js` (14 casos) | Função pura de UX. Não toca Firebase. |
| `src/__tests__/approveTeacher.test.js` (7 casos) | Validação do parâmetro `profile` com mocks do Firestore. |
| `src/components/ui/ProfileSelector.test.jsx` (5 casos) | Smoke test mínimo de componente + helper. |

**Zero testes de:** Firestore Security Rules, autenticação, stores Zustand, componentes React, fluxo de multiescola.

### Brechas de segurança confirmadas nas regras atuais:

1. **`absences`: qualquer usuário autenticado (inclusive pending) cria/edita/deleta ausências de qualquer professor.** Não há verificação de ownership nem de role.
2. **`hasFormationSlot` só verifica `slots[0]`.** Slots de formação em posições posteriores do array não são bloqueados.
3. **`admin_actions` não tem regra.** O Firestore nega tudo por default — as gravações de auditoria estão silenciosamente falhando.
4. **Toda autorização de coordenador é client-side only.** As rules não conseguem verificar `profile` do teacher pelo UID (só via `ownsProfile` que usa email). Um coordenador pode gravar diretamente no Firestore sem passar pelo fluxo de aprovação.
5. **Email super-admin hardcoded** em `useAuthStore.js:11` e `firestore.rules:84`. Impede multi-tenant real.
6. **Sem `.env`.** Firebase config hardcoded no fonte. Impede ambientes separados dev/staging/prod.

---

## Ordem de execução

A migração tem três fases. Elas devem ser executadas nessa ordem porque cada fase é pré-requisito da seguinte.

```
Fase 1: Segurança do sistema atual (sem mudar arquitetura)
    ↓
Fase 2: Infraestrutura multi-tenant (migração de dados + estrutura Firestore)
    ↓
Fase 3: Produto SaaS (features de escola, billing, onboarding)
```

**Não pular fases.** A Fase 2 feita antes da Fase 1 expõe as brechas em uma superfície maior.
A Fase 3 sem a Fase 2 não faz sentido.

---

## Fase 1 — Segurança do sistema atual

**Objetivo:** fechar as brechas nas regras do Firestore sem mudar nenhuma feature de produto.
**Duração estimada:** 1-2 semanas.
**Pré-requisito para:** qualquer deploy em produção com usuários reais, e especialmente para a Fase 2.

### 1.1 — Criar infraestrutura de testes para Firestore Security Rules

**Por quê:** sem testes de rules, qualquer mudança nas rules é feita no escuro. É impossível saber se uma nova regra quebra outra.

**O que criar:**

Instalar `@firebase/rules-unit-testing` (requer Java para o emulador local):
```
npm install --save-dev @firebase/rules-unit-testing firebase-admin
```

Criar `src/__tests__/rules/setup.js` — helper compartilhado:
```js
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { readFileSync } from 'fs'

export async function createTestEnv() {
  return initializeTestEnvironment({
    projectId: 'gestordesubstituicoes-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  })
}

// Helpers para criar contextos autenticados
export function asAdmin(env) {
  return env.authenticatedContext('admin-uid', { email: 'contato.tarciso@gmail.com' })
}
export function asTeacher(env, uid = 'teacher-uid', email = 'teacher@escola.com') {
  return env.authenticatedContext(uid, { email })
}
export function asPending(env, uid = 'pending-uid') {
  return env.authenticatedContext(uid, { email: 'pending@escola.com' })
}
export function asAnonymous(env) {
  return env.unauthenticatedContext()
}
```

Adicionar em `package.json`:
```json
"test:rules": "firebase emulators:exec --only firestore 'vitest run src/__tests__/rules/'"
```

**Critério de conclusão:** `npm run test:rules` executa sem erro (mesmo com 0 testes ainda).

---

### 1.2 — Testes das regras atuais (baseline)

**Por quê:** documentar o comportamento atual antes de corrigir. Alguns comportamentos são intencionais (ex: professor pending pode criar seus próprios schedules).

Criar `src/__tests__/rules/absences.rules.test.js`:

```
DEVE PASSAR (comportamento correto atual):
- Admin cria ausência → permitido
- Usuário autenticado lê ausência → permitido
- Slots com formation- no slots[0] bloqueados na criação → permitido
- Slots com formation- no slots[0] bloqueados na atualização → permitido

DEVE FALHAR (comportamento incorreto — brechas confirmadas):
- Usuário pending cria ausência com slots normais → ATUALMENTE PERMITE (errado)
- Teacher cria ausência de outro teacher → ATUALMENTE PERMITE (errado)
- Teacher deleta ausência de outro teacher → ATUALMENTE PERMITE (errado)
- Slots com formation- em slots[1] são bloqueados → ATUALMENTE PERMITE (errado)
```

Criar `src/__tests__/rules/schedules.rules.test.js`:

```
DEVE PASSAR:
- Admin cria schedule → permitido
- Teacher cria schedule com teacherId == auth.uid → permitido
- Teacher deleta próprio schedule → permitido

DEVE FALHAR:
- Teacher deleta schedule de outro teacher → negado
- Teacher atualiza teacherId de um schedule para outro uid → negado
- Anônimo lê schedule → negado
```

Criar `src/__tests__/rules/teachers.rules.test.js`:

```
DEVE PASSAR:
- Admin atualiza qualquer campo de teacher → permitido
- Teacher atualiza próprio celular/whatsapp/apelido/name/subjectIds/horariosSemana → permitido

DEVE FALHAR:
- Teacher atualiza próprio profile → negado
- Teacher atualiza próprio status → negado
- Teacher atualiza teacher de outro usuário → negado
- Anônimo lê teachers → negado
```

Criar `src/__tests__/rules/admin_actions.rules.test.js`:

```
DEVE FALHAR (estado atual — sem regra = tudo negado):
- Admin grava em admin_actions → ATUALMENTE NEGA (bug: auditoria não funciona)
- Teacher grava em admin_actions → negado
```

**Critério de conclusão:** todos os testes passam, incluindo os que documentam as brechas como "PERMITE" (eles vão falhar quando as regras forem corrigidas na etapa 1.3).

---

### 1.3 — Corrigir as regras do Firestore

Aplicar correções em `firestore.rules`. Para cada correção, os testes de baseline (1.2) que documentavam a brecha devem começar a passar.

**Correção A — `absences`: restringir criação/deleção a admin + coordenador + dono:**

```
// Lógica: admin sempre pode. Teacher cria ausência apenas do próprio teacherId.
// Coordenador (qualquer autenticado com profile coordinator/teacher-coordinator)
// não pode ser verificado aqui → criar Cloud Function para isso (ver 1.4).
// Por ora: apenas admin e próprio teacher.

match /absences/{doc} {
  allow read: if isAuthenticated();
  allow create: if isAdmin()
    && !hasFormationSlot(request.resource.data.slots);
  allow update: if isAdmin()
    && !hasFormationSlot(request.resource.data.slots);
  allow delete: if isAdmin();
}
```

Obs: isso vai quebrar o fluxo atual em que coordenador gerencia ausências via client. Isso é um trade-off consciente — a operação passa a exigir uma Cloud Function (ver 1.4), ou manter `isAuthenticated()` com validação mais granular no `teacherId`. A decisão depende do modelo de produto.

**Alternativa menos restritiva (manter usabilidade atual com mais segurança):**

```
match /absences/{doc} {
  allow read: if isAuthenticated();
  allow create: if isAuthenticated()
    && !hasFormationSlot(request.resource.data.slots)
    && (isAdmin() || request.resource.data.teacherId == request.auth.uid
        || ownsProfile(request.resource.data.teacherId));
  allow update: if isAuthenticated()
    && !hasFormationSlot(request.resource.data.slots)
    && (isAdmin() || resource.data.teacherId == request.auth.uid
        || ownsProfile(resource.data.teacherId));
  allow delete: if isAdmin()
    || ownsProfile(resource.data.teacherId);
}
```

**Correção B — `hasFormationSlot`: verificar todos os slots:**

```
function hasFormationSlot(slots) {
  // slots é uma List no Firestore rules — não tem .some() nativo.
  // Alternativa: verificar os primeiros N slots explicitamente.
  // Para cobrir casos reais (raramente mais de 5 slots por ausência):
  return slots.size() > 0 && (
    slots[0].subjectId.matches('formation-.*') ||
    (slots.size() > 1 && slots[1].subjectId.matches('formation-.*')) ||
    (slots.size() > 2 && slots[2].subjectId.matches('formation-.*')) ||
    (slots.size() > 3 && slots[3].subjectId.matches('formation-.*')) ||
    (slots.size() > 4 && slots[4].subjectId.matches('formation-.*'))
  );
}
```

**Correção C — `admin_actions`: adicionar regra:**

```
match /admin_actions/{id} {
  allow read: if isAdmin();
  allow create: if isAdmin();
  allow update, delete: if false; // log imutável
}
```

**Critério de conclusão:** todos os testes de rules passam, incluindo os que antes documentavam brechas.

---

### 1.4 — Cloud Functions para operações privilegiadas de coordenador

**Por quê:** as Firestore rules não conseguem verificar o `profile` de um teacher pelo UID. Toda lógica de "coordenador pode fazer X" é atualmente client-side e bypassável. Para um SaaS isso é inaceitável.

**O que criar:**

Inicializar Firebase Functions no projeto:
```
firebase init functions
```

Criar `functions/src/index.ts` com as seguintes callable functions:

```
createAbsence(teacherId, slots)
  - Verifica via Admin SDK se auth.uid tem profile coordinator/teacher-coordinator/admin
  - Valida que nenhum slot é de formação
  - Grava em /absences/{id}

updateAbsence(absenceId, slots, substituteId)
  - Verifica role do chamador
  - Valida slots
  - Atualiza documento

deleteAbsence(absenceId)
  - Verifica role do chamador (admin ou coordenador da escola)
  - Deleta documento

applyPendingAction(pendingActionId, approved, rejectionReason?)
  - Verifica que chamador é admin
  - Lê pending_actions/{pendingActionId}
  - Executa o payload da action (ex: adicionar segmento, modificar config)
  - Grava em admin_actions para auditoria
  - Atualiza status da pending_action
```

**Por que callable e não HTTP triggers:** callable functions passam o token de autenticação automaticamente e têm serialização/deserialização de erros mais simples para o cliente.

**Como o cliente chama:**
```js
// Antes (direto no Firestore):
await addDoc(collection(db, 'absences'), data)

// Depois (via Cloud Function):
const createAbsence = httpsCallable(functions, 'createAbsence')
await createAbsence({ teacherId, slots })
```

**Critério de conclusão:** coordenador não consegue criar ausência via request direto ao Firestore; apenas via Cloud Function que valida role via Admin SDK.

---

### 1.5 — Remover hardcoded super-admin e criar `.env`

**Por quê:** hardcoded email impede multi-tenant e impossibilita rotação de admin.

**O que mudar:**

Criar `.env.local` (não commitar):
```
VITE_FIREBASE_API_KEY=AIzaSyDN7ivev6Dgse8uZOi_2j6KqyAngVvuM7o
VITE_FIREBASE_AUTH_DOMAIN=gestordesubstituicoes.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gestordesubstituicoes
VITE_FIREBASE_STORAGE_BUCKET=gestordesubstituicoes.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=51263219079
VITE_FIREBASE_APP_ID=1:51263219079:web:ac4781dbefcd6d94d5df22
VITE_SUPER_ADMIN_EMAIL=contato.tarciso@gmail.com
```

Criar `.env.example` (commitar):
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_SUPER_ADMIN_EMAIL=
```

Modificar `src/lib/firebase/index.js`:
```js
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}
```

Modificar `src/store/useAuthStore.js`:
```js
const SUPER_USERS = [import.meta.env.VITE_SUPER_ADMIN_EMAIL].filter(Boolean)
```

Modificar `firestore.rules` — remover email hardcoded e confiar apenas em `admins/`:
```
function isAdmin() {
  return request.auth != null
    && exists(/databases/$(database)/documents/admins/$(request.auth.token.email.lower()));
}
```

Obs: isso exige que `contato.tarciso@gmail.com` exista como documento em `admins/`. Criar esse documento antes de fazer o deploy das rules.

**Adicionar ao `.gitignore`:**
```
.env.local
.env.*.local
```

**Critério de conclusão:** build funciona com variáveis de `.env.local`; `.env.local` não está no git; `.env.example` está no git.

---

## Fase 2 — Infraestrutura multi-tenant

**Objetivo:** migrar a estrutura de dados para `schools/{schoolId}/...` e adaptar toda a aplicação para operar com `schoolId` ativo.
**Duração estimada:** 3-5 semanas.
**Pré-requisito para:** Fase 3. Não começar sem Fase 1 completa.

O spec completo desta fase está em `todo/spec_multi_escolas.md`. O que segue aqui é o **plano de execução técnico** complementar ao spec.

### 2.1 — Nova estrutura de coleções

```
/users/{uid}
  email: string
  name: string
  schools: {
    [schoolId]: { role: 'admin' | 'coordinator' | 'teacher' | 'teacher-coordinator', status: 'active' }
  }

/schools/{schoolId}
  name: string
  createdAt: timestamp
  createdBy: uid
  plan: 'trial' | 'active' | 'suspended'

/schools/{schoolId}/config/main     ← equivalente ao /meta/config atual
/schools/{schoolId}/teachers/{id}
/schools/{schoolId}/schedules/{id}
/schools/{schoolId}/absences/{id}
/schools/{schoolId}/history/{id}
/schools/{schoolId}/pending_teachers/{uid}
/schools/{schoolId}/pending_actions/{id}
/schools/{schoolId}/admin_actions/{id}

/admins/{email}   ← mantido como super-admins do SaaS (não de escola específica)
```

**Regra de isolamento:** um usuário que é teacher da escola A nunca deve conseguir ler dados da escola B, mesmo sendo autenticado.

### 2.2 — Migração de dados (script)

Criar `scripts/migrate-to-multitenant.js` que:

1. Lê todas as coleções globais atuais via Admin SDK
2. Cria documento em `/schools/{schoolId}` com nome "Escola Principal" e `createdBy: uid-do-admin`
3. Copia cada documento para `schools/{schoolId}/{coleção}/{id}` preservando todos os campos
4. Cria `/users/{uid}` para cada teacher com `schools: { [schoolId]: { role: teacher.profile, status: 'active' } }`
5. Cria `/users/{adminUid}` com `schools: { [schoolId]: { role: 'admin', status: 'active' } }`
6. Não deleta as coleções antigas até validação manual

O script deve ser idempotente (rodar duas vezes não corrompe nada).

### 2.3 — Novo `useAuthStore` + `useSchoolStore`

**`useSchoolStore`** (novo):
```js
{
  currentSchoolId: string | null,
  currentSchool: { name, plan } | null,
  availableSchools: [{ id, name, role }],
  setCurrentSchool: (schoolId) => void,
}
```

**`useAuthStore`** (modificado):
- `_resolveRole` passa a ler de `users/{uid}.schools[currentSchoolId].role`
- Não busca mais em `teachers/` para determinar role — role vem de `users/`
- `isAdmin()` verifica `users/{uid}.schools[currentSchoolId].role === 'admin'` OU está em `admins/` global (super-admin SaaS)

### 2.4 — Todas as operações de `src/lib/db/index.js` passam a receber `schoolId`

```js
// Antes:
export async function listPendingTeachers() {
  const snap = await getDocs(collection(db, 'pending_teachers'))
  ...
}

// Depois:
export async function listPendingTeachers(schoolId) {
  const snap = await getDocs(collection(db, 'schools', schoolId, 'pending_teachers'))
  ...
}
```

Todas as funções de db recebem `schoolId` como primeiro parâmetro. O store injeta `schoolId` de `useSchoolStore.currentSchoolId`.

### 2.5 — Reescrever `firestore.rules` para multi-tenant

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Super-admins do SaaS
    match /admins/{email} {
      allow read: if isSaasAdmin() || request.auth.token.email.lower() == email;
      allow write: if isSaasAdmin();
    }

    // Metadados de escolas
    match /schools/{schoolId} {
      allow read: if isMemberOf(schoolId);
      allow create: if isAuthenticated(); // Cria sua própria escola
      allow update: if isSchoolAdmin(schoolId);
      allow delete: if isSaasAdmin();
    }

    // Dados da escola
    match /schools/{schoolId}/config/{doc} {
      allow read: if isMemberOf(schoolId);
      allow write: if isSchoolAdmin(schoolId);
    }

    match /schools/{schoolId}/teachers/{teacherId} {
      allow read: if isMemberOf(schoolId);
      allow write: if isSchoolAdmin(schoolId);
      allow update: if isTeacherSelf(schoolId, teacherId)
        && request.resource.data.diff(resource.data).affectedKeys()
            .hasOnly(['celular', 'whatsapp', 'apelido', 'name', 'subjectIds', 'horariosSemana']);
    }

    match /schools/{schoolId}/schedules/{scheduleId} {
      allow read: if isMemberOf(schoolId);
      allow write: if isSchoolAdmin(schoolId);
      allow create: if isMemberOf(schoolId)
        && request.resource.data.teacherId == request.auth.uid;
      allow update, delete: if isMemberOf(schoolId)
        && resource.data.teacherId == request.auth.uid;
    }

    match /schools/{schoolId}/absences/{absenceId} {
      allow read: if isMemberOf(schoolId);
      // Criação/edição/deleção via Cloud Function apenas (valida role coordinator/admin)
      allow write: if false;
    }

    match /schools/{schoolId}/history/{doc} {
      allow read: if isMemberOf(schoolId);
      allow write: if isSchoolAdmin(schoolId);
    }

    match /schools/{schoolId}/pending_teachers/{uid} {
      allow read, write: if isSchoolAdmin(schoolId)
        || (isAuthenticated() && request.auth.uid == uid);
    }

    match /schools/{schoolId}/pending_actions/{id} {
      allow read, update, delete: if isSchoolAdmin(schoolId);
      allow create: if isMemberOf(schoolId);
    }

    match /schools/{schoolId}/admin_actions/{id} {
      allow read: if isSchoolAdmin(schoolId);
      allow create: if isSchoolAdmin(schoolId);
      allow update, delete: if false;
    }

    // Users globais (mapa de escola → role)
    match /users/{uid} {
      allow read: if request.auth.uid == uid || isSaasAdmin();
      allow write: if request.auth.uid == uid || isSaasAdmin();
    }

    // Funções auxiliares
    function isAuthenticated() {
      return request.auth != null;
    }

    function isSaasAdmin() {
      return isAuthenticated()
        && exists(/databases/$(database)/documents/admins/$(request.auth.token.email.lower()));
    }

    function isMemberOf(schoolId) {
      return isAuthenticated()
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.schools.keys().hasAny([schoolId]);
    }

    function isSchoolAdmin(schoolId) {
      return isAuthenticated()
        && isSaasAdmin()
        || (isMemberOf(schoolId)
            && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.schools[schoolId].role == 'admin');
    }

    function isTeacherSelf(schoolId, teacherId) {
      let teacherDoc = get(/databases/$(database)/documents/schools/$(schoolId)/teachers/$(teacherId));
      return isAuthenticated()
        && teacherDoc != null
        && teacherDoc.data.email.lower() == request.auth.token.email.lower();
    }
  }
}
```

### 2.6 — Cache local por escola

Atualmente: `localStorage` chave `gestao_v8_cache`, cache global.

Novo padrão: `localStorage` chave `gestao_v9_cache_{schoolId}`, isolado por escola.

Isso evita que dados de uma escola apareçam na UI de outra escola quando o usuário troca.

### 2.7 — Testes da Fase 2

Novos testes de rules multi-tenant:

```
- Teacher da escola A não consegue ler teachers da escola B
- Teacher da escola A não consegue criar schedules na escola B
- Admin da escola A não é admin da escola B
- Super-admin SaaS lê qualquer escola
- Usuário sem schools cadastrados não consegue nada em nenhuma escola
- isMemberOf: usuário com schools={} (objeto vazio) é negado
```

Novos testes de `useAuthStore`:

```
- resolveRole com schools vazio → pending
- resolveRole com schools[schoolId].role = 'teacher' → role teacher
- resolveRole com schools[schoolId].role = 'admin' → role admin
- setCurrentSchool: troca schoolId e re-resolve role
```

---

## Fase 3 — Produto SaaS

**Objetivo:** features de produto que fazem o SaaS ser vendável — onboarding de escola, billing, isolamento de admin por escola.
**Duração estimada:** 4-6 semanas adicionais.
**Pré-requisito:** Fase 2 completa e validada.

### O que vai aqui (alto nível, detalhes no spec_multi_escolas.md):

- **Onboarding de nova escola:** tela de criação de escola para novos admins, wizard de configuração inicial (segmentos, períodos, turmas)
- **Seletor de escola:** se usuário pertence a 2+ escolas, mostrar seletor na home
- **Convite de professores:** admin convida professor por email (cria `invited_users/{email}`)
- **Billing / plano:** campo `plan` em `/schools/{schoolId}` controlando features disponíveis; integração com Stripe ou payment gateway brasileiro
- **Dashboard SaaS (super-admin):** lista de escolas, usuários ativos, health da plataforma

---

## Sequência de commits recomendada

```
[Fase 1]
feat(tests): adicionar infraestrutura de testes para Firestore Security Rules
test(rules): baseline de regras atuais, incluindo brechas documentadas como failing
fix(rules): corrigir brecha de ownership em absences
fix(rules): hasFormationSlot verifica todos os slots, não apenas slots[0]
fix(rules): adicionar regra para admin_actions (auditoria estava falhando silenciosamente)
feat(functions): Cloud Functions para operações de coordenador (createAbsence, updateAbsence, deleteAbsence, applyPendingAction)
refactor(env): mover firebase config e super-admin email para variáveis de ambiente
fix(rules): remover email hardcoded de isAdmin(), usar apenas coleção admins/

[Fase 2]
feat(db): script de migração de coleções globais para schools/{schoolId}/...
feat(store): useSchoolStore com currentSchoolId, availableSchools e setCurrentSchool
refactor(auth): useAuthStore lê role de users/{uid}.schools[schoolId], não de teachers/
refactor(db): todas as funções de db/index.js recebem schoolId como primeiro parâmetro
feat(rules): reescrever firestore.rules para modelo multi-tenant com isMemberOf/isSchoolAdmin
refactor(cache): isolar localStorage por schoolId (gestao_v9_cache_{schoolId})
test(rules): testes de isolamento multi-tenant (escola A não vaza para escola B)
test(auth): testes de resolução de role com estrutura users/{uid}.schools

[Fase 3]
feat(onboarding): wizard de criação de escola para novo admin
feat(school-selector): seletor de escola na home quando usuário pertence a 2+
feat(invites): fluxo de convite de professores por email
feat(billing): integração com payment gateway, campo plan em schools/{schoolId}
```

---

## Decisões em aberto que precisam de resposta do produto antes de implementar

1. **Coordenadores podem criar ausências pelo app atual?** Sim, mas via client-side apenas. A Fase 1 vai exigir uma decisão: ou criar Cloud Functions para isso (mais seguro, mais trabalho), ou aceitar que coordenadores passam a ser bloqueados pelo Firestore e o fluxo de ausências vai para admin apenas (simplifica).

2. **Migração de dados:** a migração copia dados para `schools/{schoolId}/...` sem deletar os originais. Quando deletar os originais? Só após validação manual de que tudo está funcionando no novo caminho.

3. **Billing:** qual gateway? Stripe tem SDK bom mas cobrança em USD. Gerencianet/Pagar.me/Asaas são opções brasileiras. A Fase 3 depende desta decisão para a feature de pagamento.

4. **Modelo de acesso multi-escola por usuário:** um professor pode dar aulas em duas escolas e ter conta única? O spec_multi_escolas.md diz que sim (campo `schools` em `users/{uid}` é um mapa). Mas isso complica o onboarding e o seletor de escola. Vale confirmar se é requisito real antes da Fase 2.
