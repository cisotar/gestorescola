# Spec: Refatoração do Boot — `bootSequence` + Testes de Integração

## Visão Geral

O fluxo de inicialização (boot) do app envolve três stores em sequência — `useAuthStore` → `useSchoolStore` → `useAppStore` — com lógica de decisão espalhada nos três. A ordem de execução, o estado intermediário do `localStorage` e as dependências entre stores causaram bugs repetidos que exigiram múltiplas rodadas de correção.

Esta iniciativa tem dois objetivos complementares:

1. **Parte 1 — Extrair `bootSequence`:** centralizar toda a lógica de decisão do boot em uma função pura em `src/lib/boot.js`, eliminando a lógica duplicada nos stores.
2. **Parte 2 — Testes de integração do boot:** cobrir com testes automatizados os seis cenários críticos hoje validados apenas manualmente.

## Stack Tecnológica

- Frontend: React 18.3.1 + React Router 6.26.0
- Estado global: Zustand 4.5.4 (`useAuthStore`, `useSchoolStore`, `useAppStore`)
- Backend: Firebase Auth + Firestore (Firebase 10.12.2)
- Testes: Vitest (framework já adotado no projeto)
- Build: Vite 5.4.1

## Páginas e Rotas

Esta iniciativa não cria páginas novas. Os comportamentos são internos ao fluxo de boot e afetam indiretamente todas as rotas.

---

## Módulos Afetados

### `bootSequence` — `src/lib/boot.js` (novo arquivo)

**Descrição:** Função pura que encapsula toda a lógica de decisão do boot. Recebe os dados brutos, retorna um objeto de decisões. Não muta stores, não lê `localStorage`, não chama Firebase.

**Assinatura:**

```js
bootSequence(user, userSnap, availableSchools, savedSchoolId, isSuperUser)
// → { role, schoolId, clearLocalStorage, startPendingListener, startApprovalListener }
```

**Parâmetros:**

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `user` | `FirebaseUser \| null` | Usuário autenticado do Firebase Auth |
| `userSnap` | `DocumentSnapshot \| null` | Snapshot de `users/{uid}` (pode não existir) |
| `availableSchools` | `Array<{schoolId, ...}>` | Escolas às quais o usuário tem acesso |
| `savedSchoolId` | `string \| null` | Valor lido do `localStorage` (`gestao_active_school`) |
| `isSuperUser` | `boolean` | `true` se email está em `SUPER_USERS` ou em `admins/` |

**Retorno:**

```js
{
  role: 'admin' | 'coordinator' | 'teacher-coordinator' | 'teacher' | 'pending' | null,
  schoolId: string | null,      // escola a ativar após o boot
  clearLocalStorage: boolean,   // se true, caller remove 'gestao_active_school' do LS
  startPendingListener: boolean, // se true, caller inicia onSnapshot em pending_teachers
  startApprovalListener: boolean // se true, caller inicia onSnapshot em pending_teachers/{uid}
}
```

**Behaviors:**

- [ ] Receber `isSuperUser=true` e `availableSchools=[]` → retorna `{ role: 'admin', schoolId: null, clearLocalStorage: true }`
- [ ] Receber `isSuperUser=true` e `availableSchools=[...]` com `savedSchoolId` stale (não membro) → retorna `{ role: 'admin', schoolId: null, clearLocalStorage: true }`
- [ ] Receber `isSuperUser=true` e `savedSchoolId` válido (membro confirmado em `availableSchools`) → retorna `{ role: 'admin', schoolId: savedSchoolId, clearLocalStorage: false }`
- [ ] Receber `isSuperUser=true` sem `savedSchoolId` mas com uma escola em `availableSchools` → retorna `{ role: 'admin', schoolId: availableSchools[0].schoolId, clearLocalStorage: false }`
- [ ] Receber `isSuperUser=false` e `userSnap` com `schools[schoolId].role = 'teacher'` → retorna `{ role: 'teacher', schoolId, clearLocalStorage: false }`
- [ ] Receber `isSuperUser=false` e `userSnap` com `schools[schoolId].role = 'coordinator'` → retorna `{ role: 'coordinator', ... }`
- [ ] Receber `isSuperUser=false` e `userSnap` com `schools[schoolId].role = 'teacher-coordinator'` → retorna `{ role: 'teacher-coordinator', ... }`
- [ ] Receber `isSuperUser=false` e `userSnap` com `schools[schoolId].role = 'admin'` → retorna `{ role: 'admin', startPendingListener: true, ... }`
- [ ] Receber `isSuperUser=false` e `userSnap` sem entrada para `schoolId` (status pending) → retorna `{ role: 'pending', schoolId: savedSchoolId, startApprovalListener: true }`
- [ ] Receber `isSuperUser=false` e `userSnap` inexistente → retorna `{ role: 'pending', startApprovalListener: true }`
- [ ] Receber `savedSchoolId` não presente em `availableSchools` (stale) → retorna `{ schoolId: null, clearLocalStorage: true }` para não-admin
- [ ] Receber `user=null` → retorna `{ role: null, schoolId: null, clearLocalStorage: false }`
- [ ] Ser função pura: mesmos inputs sempre produzem mesmo output, sem side-effects

---

### `useSchoolStore.init` — `src/store/useSchoolStore.js` (refatorado)

**Descrição:** Passa a delegar a lógica de decisão de qual escola ativar para `bootSequence`, lendo apenas o `localStorage` e carregando `availableSchools`. A lógica de "é saas admin sem membership, então limpa LS" migra para `bootSequence`.

**Behaviors:**

- [ ] Chamar `bootSequence` com os dados coletados e aplicar `clearLocalStorage` se retornado como `true`
- [ ] Continuar retornando `userSnap` para que `_resolveRole` possa reutilizá-lo sem segunda leitura ao Firestore
- [ ] Manter idempotência: múltiplas chamadas não acumulam estado

---

### `useAuthStore._resolveRole` — `src/store/useAuthStore.js` (refatorado)

**Descrição:** Passa a chamar `bootSequence` para obter `role`, `schoolId` e flags de listener. A lógica de ramificação (`isSuperUser → admin`, `schools[id].role → teacher/coordinator`, `sem entry → pending`) migra para `bootSequence`.

**Behaviors:**

- [ ] Consumir o retorno de `bootSequence` para setar `role` via `set()`
- [ ] Iniciar `onSnapshot(pending_teachers)` apenas quando `startPendingListener === true`
- [ ] Iniciar `onSnapshot(pending_teachers/{uid})` apenas quando `startApprovalListener === true`
- [ ] Não conter lógica condicional de role própria — apenas despachar efeitos com base no retorno de `bootSequence`

---

### Testes de integração do boot — `src/__tests__/boot.integration.test.js` (novo arquivo)

**Descrição:** Suite de testes que cobre os seis cenários críticos do boot, exercitando `bootSequence` diretamente (sem mocks de stores). Cada cenário valida o retorno completo da função.

**Behaviors — Cenários cobertos:**

- [ ] **Cenário 1 — SaaS admin sem escola no localStorage:** `isSuperUser=true`, `availableSchools=[]`, `savedSchoolId=null` → `{ role: 'admin', schoolId: null, clearLocalStorage: false, startPendingListener: false }`
- [ ] **Cenário 2 — SaaS admin com escola stale no localStorage:** `isSuperUser=true`, `availableSchools=[]`, `savedSchoolId='sch-stale'` → `{ role: 'admin', schoolId: null, clearLocalStorage: true }` (LS deve ser limpo)
- [ ] **Cenário 3 — SaaS admin clica numa escola (school ativa após boot):** `isSuperUser=true`, `availableSchools=[{schoolId:'sch-1'}]`, `savedSchoolId='sch-1'` → `{ role: 'admin', schoolId: 'sch-1', clearLocalStorage: false, startPendingListener: true }`
- [ ] **Cenário 4 — Professor aprovado com escola salva:** `isSuperUser=false`, `userSnap.schools['sch-1'].role='teacher'`, `savedSchoolId='sch-1'`, `availableSchools=[{schoolId:'sch-1'}]` → `{ role: 'teacher', schoolId: 'sch-1', clearLocalStorage: false }`
- [ ] **Cenário 5 — Professor pendente (sem entry em `schools[schoolId]`):** `isSuperUser=false`, `userSnap.schools={}`, `savedSchoolId='sch-1'`, `availableSchools=[]` → `{ role: 'pending', schoolId: 'sch-1', clearLocalStorage: false, startApprovalListener: true }`
- [ ] **Cenário 6 — Usuário sem escola (não-SaaS admin, availableSchools=[]):** `isSuperUser=false`, `userSnap` inexistente, `savedSchoolId=null`, `availableSchools=[]` → `{ role: 'pending', schoolId: null }` (App.jsx detecta `!isSaasAdmin && availableSchools.length===0` e redireciona para `/no-school`)
- [ ] **Cenário extra — Usuário com escola stale no LS (não-membro):** `isSuperUser=false`, `availableSchools=[{schoolId:'sch-real'}]`, `savedSchoolId='sch-stale'` → `{ schoolId: 'sch-real', clearLocalStorage: true }` (usa a única escola disponível e limpa LS)

---

## Componentes Compartilhados

Nenhum componente visual novo. Impacto restrito à camada de lógica (`src/lib/`) e stores (`src/store/`).

## Modelos de Dados

### Retorno de `bootSequence`

```js
{
  role:                  'admin' | 'coordinator' | 'teacher-coordinator' | 'teacher' | 'pending' | null,
  schoolId:              string | null,
  clearLocalStorage:     boolean,    // se true: localStorage.removeItem('gestao_active_school')
  startPendingListener:  boolean,    // se true: onSnapshot em schools/{schoolId}/pending_teachers
  startApprovalListener: boolean     // se true: onSnapshot em schools/{schoolId}/pending_teachers/{uid}
}
```

### Entradas relevantes do Firestore (sem alteração de schema)

`users/{uid}`:
```js
{
  schools: {
    [schoolId]: {
      role:         'teacher' | 'coordinator' | 'teacher-coordinator' | 'admin' | 'pending' | 'rejected',
      status:       'pending' | 'approved' | 'rejected',
      teacherDocId: string | null
    }
  }
}
```

`localStorage` — chave `gestao_active_school`: `string | null` (schoolId salvo entre sessões)

## Regras de Negócio

**RN-1 — SaaS admin sem membership real:** Quando `isSuperUser=true` e `availableSchools=[]`, o `savedSchoolId` do `localStorage` é stale. `bootSequence` retorna `clearLocalStorage: true` e `schoolId: null`, evitando que `_resolveRole` dispare re-resolves em cascata via o subscribe do `useSchoolStore`.

**RN-2 — Professor pendente preserva contexto de escola:** Quando o usuário ainda não tem entrada aprovada em `users/{uid}.schools[schoolId]` mas tem um `savedSchoolId` válido (escola existe no Firestore), o `schoolId` é preservado para que a `PendingPage` possa carregar config/subjects e permitir o preenchimento do formulário de cadastro.

**RN-3 — Escola stale para não-admin:** Quando `savedSchoolId` não está em `availableSchools` (e o usuário não é SaaS admin), `bootSequence` retorna `clearLocalStorage: true` e seleciona a primeira escola disponível (`availableSchools[0]`) ou `null`.

**RN-4 — Admin local com schoolId ativo inicia listener de pending:** Quando `role='admin'` e `schoolId != null`, o listener `onSnapshot(schools/{schoolId}/pending_teachers)` deve ser iniciado para manter o contador de pendentes atualizado no badge.

**RN-5 — `bootSequence` é pura:** Não pode acessar `localStorage`, não pode chamar Firebase, não pode mutar nenhum store. Recebe todos os inputs como parâmetros e retorna apenas um objeto com as decisões.

**RN-6 — Lógica de escola única:** Se `availableSchools` tem exatamente uma escola e `savedSchoolId` é `null`, `bootSequence` retorna `schoolId: availableSchools[0].schoolId` (auto-seleção).

**RN-7 — Role `rejected` resulta em logout:** Quando `users/{uid}.schools[schoolId].role === 'rejected'`, `bootSequence` retorna `{ role: null }` e `_resolveRole` dispara `signOut(auth)`.

## Fora do Escopo (v1)

- Refatoração da lógica de troca de escola em runtime (`switchSchool`, `_handleMembershipRevoked`) — continua nos stores
- Alterações no `useAppStore` ou na lógica de carregamento de dados (`loadFromFirestore`, `setupRealtimeListeners`)
- Migração de testes existentes (`useAuthStore.isSaasAdmin.test.js`, `useAuthStore.multitenant.test.js`, `useSchoolStore.init.test.js`) — são mantidos e continuam passando
- Cobertura de testes E2E (Playwright/Cypress) — fora do escopo desta iteração
- Testes do `_startMembershipListener` e `_handleMembershipRevoked`
- Testes de integração com o emulador Firebase (os testes novos usam Vitest com mocks, seguindo o padrão dos testes existentes)
