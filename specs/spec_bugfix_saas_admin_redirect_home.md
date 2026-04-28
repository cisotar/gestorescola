# Spec: Bugfix — SaaS Admin redirecionado para /home em vez de /admin

## Visão Geral

O super-admin do SaaS (`isSaasAdmin = true`) fazia login e era redirecionado para `/home`
em vez de `/admin`. O bug era causado por `useSchoolStore.init()` restaurar um
`currentSchoolId` do localStorage mesmo quando o SaaS admin não tem membership real em
nenhuma escola. Com `currentSchoolId` preenchido, a condição de redirect em `App.jsx`
nunca era satisfeita e o app caía na rota padrão `<Navigate to="/home" />`.

Fix já implementado. Nenhuma feature nova. Escopo restrito a uma linha em `src/App.jsx`.

---

## Stack Tecnológica

- Frontend: React 18 + Vite
- Estado: Zustand (`useAuthStore`, `useSchoolStore`)
- Persistência local: `localStorage` (chave `gestao_active_school`)
- Backend: Firebase Firestore (coleção `schools/`)
- Roteamento: React Router 6

---

## Causa Raiz

### Sequência de eventos que reproduzia o bug

```
1. SaaS admin faz login pela segunda vez (ou recarrega a página)

2. useSchoolStore.init(uid) é chamado em _resolveRole

3. loadAvailableSchools(uid) retorna [] porque users/{uid}.schools não existe
   (SaaS admin não tem membership em nenhuma escola via coleção users/)

4. localStorage.getItem('gestao_active_school') = 'sch-default'
   (persistido de uma sessão anterior ou de um teste)

5. Bloco: savedId && availableSchools.length === 0
   └── valida getDoc(schools/sch-default) → snap.exists() = true
   └── setCurrentSchool('sch-default') → currentSchoolId = 'sch-default'

6. Em App.jsx, a condição de redirect era:
   if (isSaasAdmin && !currentSchoolId && !pathname.startsWith('/admin'))
                       ↑ currentSchoolId = 'sch-default' → condição FALSA

7. App cai em <Route index element={<Navigate to="/home" replace />} />
   → Usuário vê /home em vez de /admin
```

### Por que o bloco do LS existe em useSchoolStore.init()

O bloco `savedId && availableSchools.length === 0` é intencional para suportar
professores pendentes (`role === 'pending'`): eles não têm membership confirmado em
`users/{uid}.schools` ainda, mas precisam que o contexto de escola seja preservado
entre reloads para a `PendingPage` funcionar. O bloco valida que a escola existe no
Firestore antes de restaurar, mas não verifica membership — o que é correto para
`pending`, mas incorreto para SaaS admin.

---

## Fix Aplicado

**Arquivo:** `src/App.jsx`

**Antes:**
```js
if (isSaasAdmin && !currentSchoolId && !pathname.startsWith('/admin') && !pathname.startsWith('/join/'))
```

**Depois:**
```js
if (isSaasAdmin && availableSchools.length === 0 && !pathname.startsWith('/admin') && !pathname.startsWith('/join/'))
```

### Justificativa da mudança

A condição antiga (`!currentSchoolId`) era facilmente burlada pelo `useSchoolStore.init()`
que restaurava um `currentSchoolId` stale do localStorage. A condição nova
(`availableSchools.length === 0`) usa a fonte de verdade correta: a lista de escolas
às quais o SaaS admin tem membership real. Um `currentSchoolId` restaurado do localStorage
sem membership correspondente em `availableSchools` não satisfaz mais a condição de ficar
no app normal.

### Comportamento intencional preservado

Se o SaaS admin tiver membership real em uma escola (ex: foi adicionado manualmente como
membro via `users/{uid}.schools`) e tiver selecionado essa escola (`currentSchoolId`
definido, `availableSchools.length > 0`), ele permanece no app normal da escola — esse
comportamento continua correto e inalterado.

---

## Páginas e Rotas

### AdminPanelPage — `/admin`

**Descrição:** Painel de administração do SaaS. Destino correto do SaaS admin sem
membership em escolas. Renderizado apenas quando `isSaasAdmin === true`; admin local
sem a flag vê `<Navigate to="/home" />`.

**Behaviors:**
- [ ] Redirecionar: ao detectar `isSaasAdmin && availableSchools.length === 0`, navegar para `/admin` via `<Navigate replace />`
- [ ] Ignorar: presença de `currentSchoolId` no localStorage não deve interferir no redirect quando `availableSchools` está vazio
- [ ] Preservar: SaaS admin que seleciona uma escola do painel (`availableSchools.length > 0`) permanece no app normal da escola sem ser forçado de volta para `/admin`

---

### HomePage — `/home`

**Descrição:** Página inicial do professor. Não deve ser acessível ao SaaS admin sem
membership em escola.

**Behaviors:**
- [ ] Bloquear: SaaS admin sem membership nunca deve cair em `/home` como destino padrão do `<Route index>`

---

## Componentes Compartilhados

- `useSchoolStore` (`src/store/useSchoolStore.js`): mantém `currentSchoolId`,
  `availableSchools` e `init()`. O comportamento de `init()` não foi alterado — o fix
  está exclusivamente na leitura de `availableSchools` em `App.jsx`.

---

## Modelos de Dados

### `useSchoolStore` — estado relevante para o fix

| Campo | Tipo | Descrição |
|---|---|---|
| `currentSchoolId` | `string \| null` | ID da escola ativa. Pode ser restaurado do localStorage mesmo sem membership real. |
| `availableSchools` | `Array` | Lista de escolas com membership confirmado via `users/{uid}.schools`. Vazio para SaaS admin sem membership. |

### `users/{uid}` — Firestore

Campo `schools` ausente ou vazio para SaaS admins sem membership. A ausência desse
campo é o que causa `availableSchools = []` após `loadAvailableSchools()`.

### `localStorage` — chave `gestao_active_school`

Persiste o `currentSchoolId` selecionado entre sessões. Valor stale (escola existente
no Firestore mas sem membership do usuário) é a condição que disparava o bug.

---

## Regras de Negócio

- **RN-1:** O redirect de SaaS admin para `/admin` é determinado por `availableSchools.length === 0`, não por `!currentSchoolId`. Um `currentSchoolId` restaurado do localStorage sem membership correspondente não é suficiente para manter o usuário no app normal.
- **RN-2:** O bloco `savedId && availableSchools.length === 0` em `useSchoolStore.init()` é preservado para professores pendentes (`role === 'pending'`). Não há alteração em `useSchoolStore.js`.
- **RN-3:** SaaS admin com membership real em uma escola (`availableSchools.length > 0`) deve permanecer no app normal da escola — não deve ser redirecionado para `/admin` contra sua vontade.
- **RN-4:** A ordem dos guards em `App.jsx` é relevante: o redirect para `/admin` (SaaS admin sem membership) precede o redirect para `/no-school` (usuário comum sem escola). A ordem não foi alterada.
- **RN-5:** As exceções `!pathname.startsWith('/admin')` e `!pathname.startsWith('/join/')` são mantidas para evitar loops de redirect.

---

## Critérios de Aceite

| # | Cenário | Condição inicial | Resultado esperado |
|---|---|---|---|
| CA-1 | SaaS admin faz login sem membership em nenhuma escola | `availableSchools = []`, `localStorage = 'sch-default'` | Redirecionado para `/admin` |
| CA-2 | SaaS admin faz login sem membership, sem localStorage | `availableSchools = []`, `localStorage = null` | Redirecionado para `/admin` |
| CA-3 | SaaS admin com membership em uma escola | `availableSchools = [{ schoolId: 'sch-x' }]`, `currentSchoolId = 'sch-x'` | Permanece no app normal, não é redirecionado para `/admin` |
| CA-4 | SaaS admin já está em `/admin` | `availableSchools = []`, `pathname = '/admin'` | Nenhum redirect — exceção de pathname ativa |
| CA-5 | Professor pendente faz login com escola no localStorage | `availableSchools = []`, `role = 'pending'`, `localStorage = 'sch-x'` | PendingPage é exibida, contexto de escola preservado |
| CA-6 | Professor regular faz login | `availableSchools = [{ schoolId: 'sch-x' }]`, `role = 'teacher'` | Redirecionado para `/home` normalmente |
| CA-7 | Admin local faz login | `availableSchools = [{ schoolId: 'sch-x' }]`, `role = 'admin'` | Redirecionado para `/dashboard` normalmente |

---

## Fora do Escopo (v1)

- Corrigir `useSchoolStore.init()` para distinguir SaaS admin de professor pendente no bloco `savedId && availableSchools.length === 0` — a condição é necessária para `pending` e não foi tocada.
- Limpar o localStorage ao detectar `currentSchoolId` stale para SaaS admin — o comportamento atual é seguro; o LS stale simplesmente é ignorado pela nova condição.
- Adicionar testes automatizados para o fluxo de redirect de SaaS admin.
- Qualquer alteração em `useSchoolStore.js` ou em `useAuthStore.js`.
