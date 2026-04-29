# Status — Testes E2E (Playwright + Firebase Emulator)

**Última atualização:** 2026-04-29
**Branch:** main
**Commit base:** infra Firebase Emulator + Playwright para testes E2E

---

## Visão geral

Implementação de testes E2E para os 9 fluxos críticos do SaaS, usando Playwright contra Firebase Emulator Suite (Auth + Firestore + Functions).

A infraestrutura está pronta e validada por smoke tests. Os testes dos fluxos em si ainda não foram escritos.

---

## ✅ O que está feito

### 1. Especificação e planejamento
- `specs/spec_e2e_fluxos_criticos.md` — spec de 1.228 linhas com 9 fluxos, 84+ asserts, helpers, fixtures
- 6 issues criadas no GitHub (#492 a #497) e tasks correspondentes em `tasks/`
- Issue extra #498 criada para resolver gap arquitetural (auth real via emulator)

### 2. Infraestrutura Firebase Emulator
- `firebase.json` — Auth Emulator (porta 9099) + UI (porta 4000) adicionados
- `src/lib/firebase/index.js` — `connect*Emulator` ativado quando `VITE_USE_FIREBASE_EMULATOR=true`
- `src/main.jsx` — expõe `window.__e2eFirebase` apenas em modo emulator
- Build de produção verificado: nenhum vazamento de hook E2E no bundle final

### 3. Seed do Emulator
- `scripts/seed-emulator.js` — idempotente, ~1.3s para popular do zero
- Cria: 1 escola, 6 usuários (admin, coordenador, professor, professor-coord, pendente, removido)
- Coleções populadas: `schools/`, `meta/config`, `teachers/`, `pending_teachers/`, `admins/`, `users/` (índice reverso)

### 4. Playwright + integração
- `playwright.config.js` — chromium-only, globalSetup/Teardown, webServer Vite com flag emulator
- `e2e/global-setup.js` — sobe emulator, roda seed, gera custom tokens via Admin SDK
- `e2e/global-teardown.js` — encerra emulator gracefully (SIGINT + fallback SIGKILL)
- `e2e/helpers/auth-helpers.js` — `loginAs(page, email)` via `signInWithCustomToken` real
- `e2e/helpers/db-helpers.js` — `resetEmulatorState()` via REST do emulator
- `e2e/helpers/ui-helpers.js` — preencher form, clicar e aguardar nav, dropdown, toast, modal
- `e2e/fixtures/usuarios-teste.json` — 6 usuários determinísticos
- `e2e/fixtures/escola-seed.json` — config base da escola
- `e2e/fixtures/timeouts.js` — constantes de timeout

### 5. Smoke tests verdes (2/2)
- `e2e/tests/smoke-emulator.spec.js`:
  - ✅ App conecta ao emulator e expõe `window.__e2eFirebase`
  - ✅ Admin loga via custom token e é redirecionado para `/dashboard`

### 6. Suporte a workflow dev
- `npm run emulator:start` — sobe Auth + Firestore + Functions
- `npm run emulator:seed` — popula emulator
- `npm run test:e2e` — fluxo completo (sobe emulator, roda testes, encerra)
- `npm run test:e2e:reuse` — reaproveita emulator já rodando (mais rápido em dev)
- `npm run test:e2e:debug` / `:headed` / `:ui` — modos de debug

### 7. Documentação
- `e2e/README.md` — setup, comandos, troubleshooting

---

## 🚧 O que ainda falta

### Issue #493 (parcial) — Helpers e Fixtures
**Status:** ~80% feito.
**Falta:**
- `e2e/helpers/assertions.js` — `assertToastAppears`, `assertAbsenceStatus`, `assertTableRowExists`, `assertAccessDenied`
- Validar que todos os helpers funcionam contra a app real (rodando smoke por helper)

### Issue #494 — Testes Ausências (3 cenários)
**Status:** Não iniciada.
**Cenários:**
1. Criar ausência → Aprovar ausência → Gerar relatório
2. Criar ausência → Rejeitar ausência → Verificar mudança de status
3. Criar ausência → Remover ausência → Confirmar remoção e auditoria

**Pré-requisitos:**
- Adicionar `data-testid` em componentes da página `/absences` e modais
- Mapear seletores reais (botões "Nova ausência", modal de confirmação, badges de status)

### Issue #495 — Testes Substituições (2 cenários)
**Status:** Não iniciada.
**Cenários:**
4. Criar ausência → Atribuir substituição → Confirmar acesso do substituto
5. Atribuir substituição → Remover substituição → Confirmar bloqueio do substituto

**Pré-requisitos:**
- Helpers para navegar pelo calendário/grade
- Login como múltiplos usuários no mesmo teste (substituto)

### Issue #496 — Testes Usuários (4 cenários)
**Status:** Não iniciada.
**Cenários:**
6. Convidar professor → Aceitar convite → Professor loga com acesso
7. Remover professor → Bloqueio no login → Re-adição com mesmo email → Novo convite funciona
8. Remover coordenador + professor → Re-adição → Permissões restauradas
9. Remover super admin → Re-adição → Verificar acesso total

**Pré-requisitos:**
- Helpers para gerar links de convite
- Mock ou bypass do flow OAuth (já que estamos no emulator, criar usuário direto via Admin SDK durante o teste)

### Issue #497 — CI/CD GitHub Actions
**Status:** Não iniciada.
**Trabalho:**
- `.github/workflows/e2e-tests.yml`
- Cache do Playwright + Firebase Emulator
- Trigger em PR e push para `main`
- Upload de artifacts (relatório HTML, screenshots, vídeos) em caso de falha
- PR comment com resumo dos testes

### Follow-ups técnicos identificados
- **Build automático de Functions** — `globalSetup` assume que `functions/lib/` já está compilado. Adicionar `cd functions && npm run build` no setup (ou validar antes).
- **Reset entre testes** — atualmente o reset é global (via `db-helpers.resetEmulatorState`). Quando paralelizarmos, precisaremos isolar por test ID.
- **Auth UI** — UI do emulator (porta 4000) está habilitada, útil pra debug. Pode ser desabilitada em CI pra economizar memória.
- **`references/architecture.md`** — copiar trade-offs e decisões da issue #498 para documentação permanente.

---

## 📊 Métricas

| Item | Valor |
|---|---|
| Issues criadas | 7 (#492-498) |
| Issues 100% completas | 1 (#498) |
| Issues parciais | 2 (#492 setup, #493 helpers) |
| Linhas de código (infra) | ~600 |
| Smoke tests passando | 2/2 |
| Tempo estimado restante | 15-25h |

---

## 🧪 Como validar o que está pronto

```bash
# 1. Subir o emulator manualmente (pra inspecionar UI em http://localhost:4000)
npm run emulator:start

# 2. Em outro terminal, popular dados
npm run emulator:seed

# 3. Rodar smoke tests (sobe e desce emulator automaticamente)
npm run test:e2e

# 4. Inspecionar relatório HTML
npm run test:e2e:report
```

Esperado: 2 testes passando em ~14s.

---

## 🔑 Decisões arquiteturais

1. **Emulator > produção** — testes não tocam produção. Dados são determinísticos e descartáveis.
2. **Custom token > OAuth real** — `signInWithCustomToken` é instantâneo e confiável; OAuth real seria lento e frágil.
3. **Chromium-only** — SaaS interno, suporte multi-browser não é prioridade. Triplicar tempo de teste sem ganho real.
4. **Serial execution** — `workers: 1` por enquanto. Paralelizar exige isolamento por test ID no Firestore.
5. **`window.__e2eFirebase` exposto só em modo emulator** — verificado por build prod limpo.

---

## 📍 Próxima sessão

Sugestão de retomada (em ordem):

1. **Implementar issue #494** (testes de ausência) — fluxo mais simples e crítico
2. **Adicionar `data-testid`** nos componentes conforme necessidade dos testes
3. **Refatorar helpers** se aparecerem padrões repetidos
4. Avançar para #495 e #496
5. Fechar com #497 (CI/CD)

Recomendação: **uma issue por sessão**, com validação manual no browser entre cada cenário.
