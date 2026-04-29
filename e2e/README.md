# Testes E2E com Playwright + Firebase Emulators

Testes end-to-end rodam **100% contra Firebase Emulators** (Auth + Firestore +
Cloud Functions). Nenhum teste toca produção. Toda a infraestrutura sobe e
desce automaticamente via `globalSetup` / `globalTeardown` do Playwright.

## Como funciona (visão de alto nível)

```
playwright test
     │
     ▼
┌────────────────────────────────────────────────────────────────┐
│  e2e/global-setup.js                                           │
│  1. Spawn `firebase emulators:start` (auth/firestore/functions)│
│  2. Healthcheck portas 9099/8080/5001                          │
│  3. node scripts/seed-emulator.js (1 escola + 6 usuarios)      │
│  4. Admin SDK gera custom token p/ cada usuario                │
│     -> e2e/.auth/tokens.json                                   │
└────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────────────┐
│  webServer: vite --mode test                                   │
│  -> .env.test seta VITE_USE_FIREBASE_EMULATOR=true             │
│  -> src/lib/firebase/index.js conecta SDK aos emulators        │
└────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────────────┐
│  testes em e2e/tests/*.spec.js                                 │
│  loginAs(page, "admin@test-escola.com")                        │
│    -> le token de tokens.json                                  │
│    -> page.evaluate(signInWithCustomToken(auth, token))        │
└────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────────────┐
│  e2e/global-teardown.js                                        │
│  1. SIGINT no PID salvo em e2e/.emulator.pid                   │
│  2. SIGKILL apos 10s se nao morreu                             │
│  3. Apaga tokens.json e .emulator.pid                          │
└────────────────────────────────────────────────────────────────┘
```

## Pré-requisitos

- Node.js 18+
- `firebase-tools` global ou via `npx`
- `firebase login` **NÃO é necessário** — emulators rodam offline

```bash
npm install
npx playwright install --with-deps chromium
```

## Setup

```bash
cp .env.test.example .env.test     # ja vem configurado para emulator
```

Não precisa preencher credenciais — `.env.test` aponta para um projectId
fictício (`saasgestaoescolar-test`) e os emulators aceitam qualquer apiKey.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run test:e2e` | Roda toda a suíte. Sobe emulator do zero, seed, testes, mata emulator. |
| `npm run test:e2e:reuse` | Reusa emulator que você subiu manualmente em outra aba (rápido para iterar). |
| `npm run test:e2e:headed` | Mesma coisa com navegador visível. |
| `npm run test:e2e:ui` | Abre Playwright UI interativa. |
| `npm run test:e2e:debug` | Abre Playwright Inspector (passo a passo). |
| `npm run test:e2e:report` | Mostra relatório HTML do último run. |
| `npm run emulator:start` | Sobe emulator manualmente (para iterar com `:reuse`). |
| `npm run emulator:seed` | Roda seed contra emulator que já está rodando. |

## Modo "reuse" (recomendado durante desenvolvimento)

Subir o emulator a cada `npm run test:e2e` é lento (~15s). Durante
desenvolvimento iterativo, deixe o emulator vivo:

```bash
# Aba 1
npm run emulator:start

# Aba 2 (quantas vezes quiser)
npm run test:e2e:reuse
```

`globalSetup` detecta `E2E_REUSE_EMULATOR=true`, **não** spawna novo
processo, apenas roda seed + gera tokens.

## Inspeção de dados durante debug

O Emulator UI sobe em **http://localhost:4000** (configurado em
`firebase.json`). Lá você vê:

- Auth: lista de usuários, custom claims, deletar manualmente
- Firestore: navegar por coleções, editar docs ao vivo
- Functions: logs de invocações, payloads

Quando rodando via `npm run test:e2e` (não-reuse), o UI sobe e morre com
a suíte. Para inspecionar com calma, use o modo `:reuse`.

## Adicionando novos usuários ao seed

1. Adicione entrada em `e2e/fixtures/usuarios-teste.json`:
   ```json
   {
     "uid": "uid-novo-papel",
     "email": "novo@test-escola.com",
     "displayName": "Novo Teste",
     "role": "teacher",
     "profile": "teacher",
     "description": "..."
   }
   ```
2. Se o role precisa de doc em `teachers/`, ele será criado automaticamente
   (lista de roles aprovados está em `scripts/seed-emulator.js`).
3. Para roles novos, edite `scripts/seed-emulator.js` (função `seedFirestore`).
4. Rode `npm run emulator:seed` para validar.

## Reset entre testes

`e2e/helpers/db-helpers.js` expõe:

```js
import { resetEmulatorState, reseedEmulator } from '../helpers/db-helpers.js'

test.beforeEach(async () => {
  await reseedEmulator() // reset + seed em <2s
})
```

Para suítes read-only, basta o seed inicial do `globalSetup` — não precisa
chamar `reseedEmulator` em cada teste.

## Troubleshooting

### "Timeout aguardando emulators" no globalSetup

- Confira `e2e/.emulator.log` para o erro real.
- Portas 8080/9099/5001/4000 livres? `lsof -ti:9099 | xargs kill -9`
- `firebase --version` instalado? Use `firebase-tools` >= 13.

### "tokens.json nao encontrado" no helper

Você está rodando teste fora do `playwright test`. Rode `npm run emulator:start`
em outra aba e `npm run test:e2e:reuse` aqui — `globalSetup` cria o arquivo.

### `loginAs` trava ou redireciona errado

A app precisa expor `window.__e2eFirebase` em modo emulator (próxima issue).
Sem isso, o helper cai num fallback que cria instância duplicada do SDK e
pode não disparar `onAuthStateChanged`.

### Build de produção quebrou após esta issue

Não deveria. `connect*Emulator` está dentro de
`if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true')` que Vite
remove em build quando a flag não está setada. Validar:
```bash
npm run build && grep -r connectAuthEmulator dist/   # zero matches
```

## CI

```yaml
- run: npx playwright install --with-deps chromium
- run: npm run test:e2e
  env:
    CI: true
```

`firebase-tools` precisa estar disponível no PATH do runner. Em GitHub
Actions, instalar via `npm install -g firebase-tools` ou usar action
`w9jds/firebase-action`.

## Arquivos relacionados

- `playwright.config.js` — globalSetup/Teardown apontados
- `e2e/global-setup.js` — sobe emulator + seed + tokens
- `e2e/global-teardown.js` — mata emulator + limpa
- `e2e/helpers/auth-helpers.js` — loginAs/logout via custom token
- `e2e/helpers/db-helpers.js` — resetEmulatorState/reseedEmulator + factories
- `scripts/seed-emulator.js` — popula 1 escola + 6 usuários
- `src/lib/firebase/index.js` — connect aos emulators quando flag ativa
- `firebase.json` — emulators auth/firestore/functions/ui
- `.env.test` — VITE_USE_FIREBASE_EMULATOR=true + project fictício
