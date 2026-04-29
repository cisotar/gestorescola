# Spec: Bugfix — SaaS Admin redirecionado para /no-school após login

## Visão Geral

O super-admin do SaaS (`contato.tarciso@gmail.com`) faz login via Google OAuth e é
redirecionado para `/no-school` em vez de `/admin`. O bug impede o acesso ao painel
de administração do SaaS em produção. Nenhuma feature nova será criada — o escopo é
exclusivamente diagnosticar e corrigir a causa-raiz do redirecionamento incorreto.

---

## Stack Tecnológica

- Frontend: React 18 + Vite (variáveis `VITE_*` embutidas no bundle em build-time)
- Estado: Zustand (`useAuthStore`, `useSchoolStore`)
- Backend: Firebase Firestore (coleção `admins/`) + Firebase Hosting
- Auth: Firebase Google OAuth (`onAuthStateChanged`)
- Build/Deploy: `npm run build` + `firebase deploy --only hosting`

---

## Fluxo de Autenticação Afetado

### Sequência de decisão em `_resolveRole` (linha 199, `useAuthStore.js`)

```
onAuthStateChanged(user)
  └── _resolveRole(user)
        │
        ├─ Step 1: SUPER_USERS.includes(user.email?.toLowerCase())
        │       └─ SUPER_USERS = [import.meta.env.VITE_SUPER_ADMIN_EMAIL].filter(Boolean)
        │           SE VITE_SUPER_ADMIN_EMAIL não foi embutida no bundle → SUPER_USERS = []
        │           → isSuperUser = false
        │
        ├─ Step 1b: get().isSaasAdmin (alreadyKnownSaasAdmin)
        │       → false (primeiro login)
        │
        ├─ Step 1c: await isAdmin(user.email)  [consulta /admins/{emailKey}]
        │       └─ emailKey(email) = email.toLowerCase()
        │           SE documento não existe no Firestore → isAdmin = false
        │
        └─ isSaasAdminFlag = false → continua para Step 2
              └─ sem schoolId → role = 'pending'

App.jsx linha 159:
  !isSaasAdmin && availableSchools.length === 0 → Navigate to="/no-school"
```

---

## Hipóteses e Diagnóstico

### Hipótese 1 — VITE_SUPER_ADMIN_EMAIL ausente no build de produção (mais provável)

**Causa:** Vite emite variáveis `VITE_*` no bundle **em build-time**. O arquivo `.env.local`
é lido apenas em ambiente de desenvolvimento (`npm run dev`). No deploy via
`firebase deploy`, o build é gerado localmente com `npm run build` — portanto `.env.local`
**é lido** se estiver presente na máquina de quem faz o deploy.

Se o deploy foi feito em uma máquina diferente (CI, outra workstation) ou se `.env.local`
estava ausente no momento do build, `import.meta.env.VITE_SUPER_ADMIN_EMAIL` resulta em
`undefined` e `SUPER_USERS` fica `[]`.

**Como confirmar:** Abrir DevTools no browser em produção e executar no console:

```js
// O valor embutido no bundle — não é possível ler import.meta.env diretamente,
// mas o efeito pode ser observado via log já existente:
// Procurar em DevTools > Console > Network por:
// [auth._resolveRole] start { uid: "...", email: "contato.tarciso@gmail.com", schoolId: null }
// Se isSaasAdminFlag permanecer false nos logs subsequentes, a env var está ausente.
```

Alternativamente, buscar no bundle minificado (`dist/assets/index-*.js`) pela string
`contato.tarciso@gmail.com` — se não encontrada, a variável não foi embutida.

### Hipótese 2 — Documento `/admins/{emailKey}` ausente no Firestore de produção

**Causa:** Mesmo que `VITE_SUPER_ADMIN_EMAIL` falhe, `_resolveRole` tem fallback:
`await isAdmin(user.email)` (linha 208). Se o documento `/admins/contato.tarciso@gmail.com`
não existir no Firestore de produção, ambas as verificações falham simultaneamente.

**Ponto de atenção — inconsistência de sanitização de email:**

A `architecture.md` documenta a convenção de sanitização:
```
email.toLowerCase().replace(/[.#$/[\]]/g, '_')
```

Porém a função `emailKey` em `src/lib/db/index.js` (linha 113) implementa:
```js
const emailKey = (email) => email.toLowerCase()
// SEM o replace de caracteres especiais
```

Isso significa que o Document ID usado seria `contato.tarciso@gmail.com` (com ponto),
e não `contato_tarciso@gmail_com`. O Firestore **aceita pontos em Document IDs**
(a restrição é apenas para IDs que contêm `/`), portanto o ponto em si não causa erro —
mas **o documento precisa ter sido criado com exatamente o mesmo emailKey** que está
sendo consultado. Se foi criado manualmente via Console com a convenção antiga (usando
`replace`), o ID seria diferente e a consulta retornaria `snap.exists() === false`.

**Como confirmar:** Firebase Console > Firestore > coleção `admins` — verificar se existe
algum documento e qual é o Document ID exato.

### Hipótese 3 — Case mismatch no email

**Causa:** `emailKey` aplica `.toLowerCase()` antes de consultar. Se o Google OAuth
retornar o email com letra maiúscula (ex: `Contato.Tarciso@gmail.com`), o ID consultado
será `contato.tarciso@gmail.com`. Se o documento foi criado com casing diferente,
haverá mismatch. Pouco provável, mas deve ser verificado.

---

## Páginas e Rotas

### NoSchoolPage — `/no-school`

**Descrição:** Exibida quando `!isSaasAdmin && availableSchools.length === 0`. O SaaS
admin está caindo aqui porque `isSaasAdmin` permanece `false` durante o `_resolveRole`.

**Behaviors afetados pelo bug:**
- [ ] Verificar: `isSaasAdmin` é setado para `true` antes da checagem de `availableSchools.length`
- [ ] Verificar: o redirect `Navigate to="/admin"` (linha 150 do `App.jsx`) é alcançado antes do redirect para `/no-school` (linha 159)

### AdminPanelPage — `/admin`

**Descrição:** Destino correto do SaaS admin. Acessível apenas quando `isSaasAdmin === true`.

**Behaviors esperados após o fix:**
- [ ] Login com `contato.tarciso@gmail.com` deve resultar em `isSaasAdmin: true` no store
- [ ] App.jsx deve redirecionar para `/admin` sem exibir NoSchoolPage
- [ ] Não deve haver documento em `pending_teachers` criado para o SaaS admin

---

## Plano de Investigação

### Fase 1 — Verificar o bundle de produção (5 minutos)

- [ ] Baixar o bundle atual de produção (`dist/assets/index-*.js` ou via DevTools) e buscar
  a string `contato.tarciso@gmail.com`. Presença confirma que `VITE_SUPER_ADMIN_EMAIL`
  foi embutida; ausência confirma a Hipótese 1.
- [ ] Alternativamente: fazer um `npm run build` local com `.env.local` presente e verificar
  se a string aparece em `dist/assets/`.

### Fase 2 — Verificar o Firestore de produção (5 minutos)

- [ ] Acessar Firebase Console > projeto `gestordesubstituicoes` > Firestore.
- [ ] Navegar até a coleção `admins/`.
- [ ] Verificar se existe algum documento. Anotar o Document ID exato.
- [ ] Se existir: confirmar se o ID é `contato.tarciso@gmail.com` (com ponto, sem replace)
  ou `contato_tarciso@gmail_com` (com replace da convenção antiga).

### Fase 3 — Logs em tempo real no browser (5 minutos)

- [ ] Fazer login com a conta do SaaS admin em produção com DevTools aberto.
- [ ] Filtrar console por `[auth._resolveRole]` e `[auth]`.
- [ ] Confirmar qual step está falhando e qual valor de `isSaasAdminFlag` é setado.

---

## Solução

A solução definitiva combina duas ações independentes para garantia de redundância
("defense in depth"). Qualquer uma das duas, isolada, já resolve o bug — mas ambas
devem ser aplicadas.

### Ação 1 — Criar documento no Firestore (correção imediata, sem deploy)

Criar manualmente o documento `admins/contato.tarciso@gmail.com` no Firestore de produção:

**Via Firebase Console:**
1. Acessar Firestore > coleção `admins`.
2. Clicar em "Add document".
3. Document ID: `contato.tarciso@gmail.com` (exatamente como `emailKey` gera — sem replace).
4. Campos:
   - `email` (string): `contato.tarciso@gmail.com`
   - `name` (string): `Tarciso`
   - `addedAt` (timestamp): agora

**Resultado:** Na próxima tentativa de login, `isAdmin(user.email)` retornará `true`,
`isSaasAdminFlag` será `true`, e o redirecionamento para `/admin` ocorrerá corretamente.
Essa ação é retroativa — não requer rebuild nem redeploy.

### Acao 2 — Garantir VITE_SUPER_ADMIN_EMAIL no build de produção (correção estrutural)

Criar o arquivo `.env.production` na raiz do projeto com a variável:

```
VITE_SUPER_ADMIN_EMAIL=contato.tarciso@gmail.com
```

Vite lê `.env.production` automaticamente em `npm run build` (modo `production`),
independente de `.env.local`. Ao contrário de `.env.local`, `.env.production` pode ser
commitado com segurança — o email do SaaS admin não é segredo (é publicamente visível
para qualquer usuário que inspecione o bundle JavaScript).

**Importante:** `.env.production` deve ser adicionado ao `.gitignore` ou não — decisão
de segurança da equipe. O email de admin não é uma credencial sensível (não é uma chave
de API), portanto commitar é aceitável. Chaves Firebase (`VITE_FIREBASE_API_KEY` etc.)
já estão expostas no bundle por design do Firebase.

**Resultado:** Mesmo sem o documento Firestore, `SUPER_USERS` conterá o email e o login
funcionará via path rápido (sem RTT ao Firestore).

### Acao 3 — Não aplicar (fora do escopo)

Alinhar `emailKey` em `db/index.js` com a convenção documentada (`replace` de caracteres
especiais) é um refactor separado que pode quebrar documentos `admins/` já existentes.
Não fazer neste bugfix.

---

## Critérios de Aceite

| # | Critério | Como verificar |
|---|---|---|
| CA-1 | Login com `contato.tarciso@gmail.com` resulta em `isSaasAdmin: true` no store | DevTools > Console: `useAuthStore.getState().isSaasAdmin` |
| CA-2 | Após login, o usuário é redirecionado para `/admin` sem exibir `/no-school` | Observar a URL final após o login completar |
| CA-3 | Nenhum documento é criado em `pending_teachers` para o SaaS admin | Firestore Console: verificar ausência de doc em qualquer `schools/*/pending_teachers/` para o uid do SaaS admin |
| CA-4 | O log `[auth._resolveRole]` no console mostra `isSaasAdminFlag = true` no step 1 ou 1c | DevTools > Console filtrado por `[auth._resolveRole]` |
| CA-5 | Funcionalidade existente não é afetada: professores pendentes ainda veem PendingPage | Testar login com conta de professor não cadastrado |
| CA-6 | Em build local com `.env.production`, a string do email aparece no bundle gerado | `grep -r "contato.tarciso" dist/assets/` |

---

## Modelos de Dados

### `admins/` — coleção Firestore (raiz, não scoped por escola)

Document ID: `email.toLowerCase()` (sem replace de caracteres especiais, conforme implementação atual de `emailKey`).

```js
{
  email:   "contato.tarciso@gmail.com",  // string, lowercase
  name:    "Tarciso",                    // string
  addedAt: Timestamp                     // serverTimestamp()
}
```

### `useAuthStore` — campos relevantes

```js
{
  isSaasAdmin: boolean,  // true quando SUPER_USERS contém o email OU admins/{key} existe
  role: 'admin' | 'pending' | null,
  // Determinante do redirect em App.jsx:
  // isSaasAdmin && !currentSchoolId && !pathname.startsWith('/admin') → Navigate to="/admin"
  // !isSaasAdmin && availableSchools.length === 0 → Navigate to="/no-school"
}
```

---

## Regras de Negócio

- **RN-1:** `isSaasAdmin` é determinado em `_resolveRole` como:
  `alreadyKnownSaasAdmin || isSuperUser || await isAdmin(user.email)`.
  Qualquer um dos três paths sendo `true` é suficiente.
- **RN-2:** `SUPER_USERS` é uma constante avaliada em module-load-time (fora do store).
  Não é reativa. Se a env var não estava presente no build, `SUPER_USERS` é `[]`
  para o tempo de vida daquele bundle — não há forma de corrigir em runtime sem redeploy.
- **RN-3:** O path `isAdmin(user.email)` (Firestore) é o único fallback disponível sem
  redeploy. É consultado mesmo quando `isSuperUser === false`.
- **RN-4:** A função `emailKey` usa apenas `toLowerCase()`, sem replace de caracteres.
  O Document ID em `admins/` deve ser criado com exatamente o mesmo algoritmo para
  a consulta retornar `snap.exists() === true`.
- **RN-5:** O redirect para `/admin` (linha 150 do `App.jsx`) precede o redirect para
  `/no-school` (linha 159) na árvore de decisão — a ordem de rendering importa.
- **RN-6:** O SaaS admin não deve ter documentos em `pending_teachers` de nenhuma escola.
  A `requestTeacherAccess` não é chamada quando `isSaasAdminFlag === true`.

---

## Fora do Escopo (v1)

- Refatorar `emailKey` para incluir `replace(/[.#$/[\]]/g, '_')` — risco de quebrar
  documentos `admins/` existentes; é um refactor independente.
- Migrar `HARDCODED_ADMINS` (se existir) para a coleção `admins/` — débito técnico
  separado documentado em `architecture.md`.
- Implementar pipeline de CI/CD para injetar variáveis de ambiente automaticamente.
- Adicionar UI no painel `/admin` para gerenciar a lista de SaaS admins.
- Auditar outros locais onde `emailKey` pode produzir Document IDs inconsistentes.
