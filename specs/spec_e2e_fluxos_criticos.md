# Spec: Testes E2E — Fluxos Críticos

**Versão:** 1.0 | **Data:** 2026-04-29 | **Autor:** Arquitetura de QA

> **Objetivo:** Especificar suite E2E automatizada com Playwright cobrindo fluxos críticos de Ausências, Substituições e Gerenciamento de Usuários, incluindo happy paths e edge cases de permissões, race conditions e remoção/re-adição com mesmo email.

---

## Visão Geral

Esta suite E2E valida os fluxos de negócio mais críticos do GestãoEscolar usando **Playwright** como framework de automação. Os testes cobrem:

1. **Fluxos de Ausência** (3 testes) — criar, aprovar, rejeitar, remover com auditoria
2. **Fluxos de Substituição** (2 testes) — atribuição e remoção de substitutos com controle de acesso
3. **Fluxos de Usuário** (4 testes) — convites, bloqueios, re-adição, restauração de permissões

Cada fluxo inclui:
- **Happy path** — cenário esperado de sucesso
- **Edge cases** — permissões insuficientes, race conditions, email duplicado
- **Auditoria** — verificação de logs e mudanças de estado

### Não cobertas nesta v1 (Fora do Escopo)

- Testes de carga / stress (performance com 1000+ usuários)
- Testes de UI visual (screenshot comparison)
- Testes de integração com terceiros (Google OAuth, emails reais)
- Testes de features de relatório (PDF generation — validado manualmente)

---

## Stack Tecnológica

| Componente | Versão | Papel |
|---|---|---|
| **Playwright** | ^1.48 | Framework E2E — automação de browser |
| **Node.js** | 18+ | Runtime de testes |
| **TypeScript** (opcional) | Latest | Type safety em helpers |
| **Firebase Emulator** | Latest | Ambiente isolado para testes (recomendado) |
| **dotenv** | Latest | Carregamento de variáveis de ambiente |
| **npm** | 8+ | Gestor de dependências |

### Convenções de Ambiente

```bash
# .env.test — não commitar, usar .env.test.example como template
PLAYWRIGHT_BASE_URL=http://localhost:5173          # Dev server ou staging
FIREBASE_EMULATOR_HOST=localhost:9099               # Emulator (opcional)
TEST_ADMIN_EMAIL=admin@test-escola.com
TEST_ADMIN_PASSWORD=TestPassword123!
TEST_SCHOOL_ID=test-escola-001                    # Usar escola test fixa
```

---

## Arquitetura dos Testes

### Estrutura de Pastas

```
e2e/
├── tests/
│   ├── fluxo-ausencias.spec.js            ← 3 testes: criar → aprovar/rejeitar/remover
│   ├── fluxo-substituicoes.spec.js        ← 2 testes: atribuir → remover
│   ├── fluxo-usuarios.spec.js             ← 4 testes: convite → bloqueio → re-adição → permissões
│   └── auth.setup.js                      ← Setup inicial: login + seed data
├── fixtures/
│   ├── escola-seed.json                   ← Dados iniciais (teachers, schedules, config)
│   ├── usuarios-teste.json                ← Email/password para cada role
│   └── timeouts.js                        ← Constantes de timeout por operação
├── helpers/
│   ├── db-helpers.js                      ← Funções puras de manipulação de dados
│   ├── ui-helpers.js                      ← Seletores CSS, funções de clique/preencher
│   ├── assertions.js                      ← Validações customizadas (ex: statusAusencia)
│   └── auth-helpers.js                    ← Login/logout, verificação de role
├── .auth/
│   ├── admin.json                         ← Storage state salvo de login admin
│   ├── coordinator.json                   ← Storage state de coordenador
│   ├── teacher.json                       ← Storage state de professor
│   └── .gitignore                         ← ignorar storage states commitados
├── playwright.config.js                   ← Config Playwright (timeout, retries, etc)
├── package.json                           ← Scripts: test, test:debug, test:headed
└── README.md                              ← Guia de execução
```

### Exemplo: playwright.config.js

```javascript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30 * 1000,           // 30s por teste
  expect: { timeout: 5000 },    // Assertions
  fullyParallel: false,         // Serial — evita race conditions
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
```

---

## Pages e Rotas

### [Login] — `/`

**Descrição:** Página inicial sem autenticação. Botão "Entrar com Google" abre popup ou fake login em dev.

**Componentes:**
- `LoginButton` — dispara `signInWithPopup(auth, GoogleAuthProvider)`
- Redirecionamento automático para `/dashboard` (admin/coord) ou `/home` (teacher)

**Behaviors (Happy Path):**
- [ ] Behavior 1: Admin clica "Entrar com Google" → autenticação via Firebase → redireciona para `/dashboard`
- [ ] Behavior 2: Professor clica "Entrar com Google" → autenticação → redireciona para `/home`
- [ ] Behavior 3: Usuário pendente clica "Entrar com Google" → autenticação → redireciona para `<PendingPage>`

**Behaviors (Edge Cases):**
- [ ] Behavior 4: Usuário com email removido tenta logar → Firebase Auth retorna user, mas Firestore rejeita acesso → tela de bloqueio

---

### [Dashboard] — `/dashboard`

**Descrição:** Overview com stats globais (admin/coord) ou resumo pessoal (teacher).

**Componentes:**
- `KPICards` — 4 cards: professores, aulas/semana, faltas, sem substituto
- `AlertsSection` — avisos de carga horária (amarelo/vermelho)
- `TeacherLoadTable` — tabela de carga por professor (admin/coord only)

**Behaviors:**
- [ ] Behavior 1: Admin abre `/dashboard` → carrega KPIs em tempo real
- [ ] Behavior 2: Professor abre `/dashboard` → vê resumo: saldo de aulas do mês, últimas faltas
- [ ] Behavior 3: Coordenador abre `/dashboard` → pode ver tabela de carga, mas não pode editar (apenas sugerir para aprovação)

---

### [Ausências] — `/absences`

**Descrição:** Listagem de ausências com 4 abas (professor, dia, semana, mês) + export PDF.

**Componentes:**
- `AbsenceTabPanel` — tabs para diferentes agrupamentos
- `AbsenceCard` — card de ausência com status badge, slots, ações
- `SlotRow` — linha de slot com data, turma, substituto (ou "sem")
- `ExportButton` — dinâmico import de `/lib/reports`, abre print dialog

**Behaviors:**
- [ ] Behavior 1: Admin abre `/absences` → aba "Professor" → lista ausências de todos
- [ ] Behavior 2: Professor abre `/absences` → aba "Professor" → filtra automaticamente suas ausências
- [ ] Behavior 3: Usuário clica "Exportar PDF" → geração de HTML via `generateByDayHTML(...)` → abre dialog print
- [ ] Behavior 4: Admin edita ausência (remove slot) → status recalculado (`open` → `partial` → `covered`)

---

### [Substituições] — `/substitutions`

**Descrição:** 5 abas de relatório + ranking de substitutos + atribuição rápida via pills.

**Componentes:**
- `SubstitutionRankingTable` — ranking por professor com histórico mensal
- `SuggestionPills` — top 3 candidatos com score e carga
- `DayGrouping` — slots agrupados por dia (aberta / parcial / coberta)
- `SubstituteModal` — modal com lista de candidatos ordenados por score

**Behaviors:**
- [ ] Behavior 1: Admin abre `/substitutions` → aba "Substituto" → lista professores substitutos do mês
- [ ] Behavior 2: Coordenador clica em slot descoberto → `SuggestionPills` renderiza 3 opções → click em uma atribui
- [ ] Behavior 3: Substituto é professor com `profile: 'teacher'` bloqueado em `sharedSeries` (formação)
- [ ] Behavior 4: Admin remove substituição → slot volta a `substituteId: null` → status da ausência recalculado

---

### [Configurações] — `/settings`

**Descrição:** 8 abas para admin, 2 para coordenador, 1 para professor.

**Componentes (Admin):**
1. **Segmentos** — CRUD de segmentos (fundamental, médio) com turmas
2. **Períodos** — config de `inicio`, `duracao`, `qtd`, `intervalos` por segment/turno
3. **Áreas** — CRUD de áreas de conhecimento
4. **Disciplinas** — CRUD de matérias (vinculadas a áreas)
5. **Turmas de Formação** — CRUD de `sharedSeries` (ATPCG, etc.)
6. **Professores** — tabela com CRUD + email de convite + status de aprovação
7. **Admins** — adicionar/remover admins dinâmicos (coleção `admins/`)
8. **Solicitações** — pending_actions com status + filtros por ação/data

**Behaviors (Admin):**
- [ ] Behavior 1: Admin clica "Adicionar Professor" → abre modal → preenche nome/email/matérias → salva em Firestore
- [ ] Behavior 2: Admin clica "Convidar" → email gerado com link `/join/:slug` ou convite direto
- [ ] Behavior 3: Admin aprova professor pendente → status `pending` → `approved` → role atualizado em tempo real
- [ ] Behavior 4: Admin remove professor → status → bloqueado no login → pode ser re-adicionado (mesmo email)
- [ ] Behavior 5: Coordenador clica "Adicionar Professor" → ação interceptada → cria `pending_action` com status `pending`
- [ ] Behavior 6: Admin aprova `pending_action` → re-executa action → professor adicionado
- [ ] Behavior 7: Admin rejeita `pending_action` → status `rejected` + motivo salvo

---

## Componentes Compartilhados

| Componente | Onde usado | Descrição |
|---|---|---|
| `Modal` | Todas as páginas | Overlay com conteúdo; fecha com Escape ou backdrop click |
| `ActionCard` | HomePage, Dashboard | Card clicável com ícone, label, desc; chevron à direita |
| `Toast` | Todas as operações | Fixed bottom-center; auto-dismiss 3s; tipos: ok/warn/err |
| `Spinner` | Loading states | Rotate animation; tamanhos: sm/md/lg |
| `Navbar` | Layout wrapper | Tabs desktop / hamburger mobile; filtrado por role |
| `Layout` | Todas as páginas | `<Navbar> + <Outlet>` + max-w-screen-xl |
| `SuggestionPills` | SubstitutionsPage, CalendarPage | Top 3 pills; badge de score + carga; click atribui |
| `ToggleRuleButtons` | CalendarPage | Toggle `qualitative` ↔ `quantitative` ranking |
| `KPICards` | Dashboard | Grid 2×4 com stats; card 4 muda cor por status (ok/err) |

---

## Modelos de Dados (Firestore)

### `schools/{schoolId}`

```javascript
{
  id: "sch-test-001",
  name: "Escola Teste",
  slug: "escola-teste",
  plan: "trial",
  status: "active",
  adminEmail: "admin@test-escola.com",
  createdAt: Timestamp,
}
```

### `schools/{schoolId}/meta/config`

```javascript
{
  segments: [
    {
      id: "seg-fund",
      name: "Fundamental",
      turno: "manha",
      grades: [
        {
          name: "6º Ano",
          classes: [
            { letter: "A", turno: "manha" },
            { letter: "B", turno: "manha" }
          ]
        }
      ]
    }
  ],
  periodConfigs: {
    "seg-fund": {
      "manha": {
        inicio: "07:00",
        duracao: 50,
        qtd: 7,
        intervalos: [
          { apos: 2, duracao: 10 },
          { apos: 5, duracao: 60 }
        ]
      }
    }
  },
  areas: [
    {
      id: "area-ling",
      name: "Linguagens",
      colorIdx: 0,
      segmentIds: ["seg-fund"]
    }
  ],
  subjects: [
    {
      id: "subj-port",
      name: "Português",
      areaId: "area-ling"
    }
  ],
  sharedSeries: [
    {
      id: "shared-formacao",
      name: "FORMAÇÃO",
      type: "formation"
    }
  ],
  workloadWarn: 20,
  workloadDanger: 26
}
```

### `schools/{schoolId}/teachers/`

```javascript
{
  id: "t-admin-001",
  name: "Admin Teste",
  email: "admin@test-escola.com",
  celular: "11999999999",
  subjectIds: ["subj-port"],
  status: "approved",
  profile: "admin"    // "teacher" | "coordinator" | "teacher-coordinator" | "admin"
}
```

### `schools/{schoolId}/absences/`

```javascript
{
  id: "ab-001",
  teacherId: "t-prof-001",
  createdAt: Timestamp,
  status: "open",     // "open" | "partial" | "covered"
  slots: [
    {
      id: "sl-001",
      date: "2026-05-10",
      day: "Segunda",
      timeSlot: "seg-fund|manha|1",
      scheduleId: "sch-001",
      subjectId: "subj-port",
      turma: "6º Ano A",
      substituteId: null    // null | "t-sub-001"
    }
  ]
}
```

### `schools/{schoolId}/pending_teachers/`

```javascript
{
  id: "firebase-uid-xyz",
  uid: "firebase-uid-xyz",
  email: "novo.prof@test-escola.com",
  name: "Novo Professor",
  photoURL: "https://...",
  requestedAt: Timestamp,
  status: "pending",  // "pending" | "approved"
  celular: "11988887777",
  apelido: "Novo",
  subjectIds: ["subj-port"]
}
```

### `schools/{schoolId}/pending_actions/`

```javascript
{
  id: "pa-001",
  coordinatorId: "t-coord-001",
  coordinatorName: "Coord Teste",
  action: "addTeacher",
  payload: { name, email, subjectIds, profile },
  summary: "Adicionar Professor João Silva",
  createdAt: Timestamp,
  status: "pending",  // "pending" | "approved" | "rejected"
  reviewedBy: "admin@test-escola.com",
  reviewedAt: Timestamp,
  rejectionReason: null
}
```

---

## Regras de Negócio (Críticas)

### 1. Ciclo de Vida de Ausências

```
Criar ausência (teacherId, slots[])
  └─ status = "open"
       └─ Para cada slot, substituteId = null
           ├─ Se admin atribui substituto → status recalcula
           ├─ Se admin remove substituto → status recalcula
           └─ Se admin remove último slot → ausência deletada
```

**Cálculo de status:**
- `covered` — todos os slots têm `substituteId !== null`
- `partial` — alguns slots têm, outros não
- `open` — nenhum slot tem substituto

### 2. Ciclo de Vida de Usuários (Professor/Coordenador)

```
1. Convite enviado → cria doc em pending_teachers/{uid} com status: "pending"
2. Admin aprova → pending_teachers/{uid}.status = "approved" → copia para teachers/ → deleta pending_teachers/{uid}
3. Professor logado → role atualizado em tempo real (listener em pending_teachers/{uid})
4. Admin remove professor → teachers/{id} deletado → próximo login bloqueado
5. Admin re-adiciona com mesmo email → novo teachers/{id} com novo uid → novo convite
```

**Bloqueio de Login:**
- Se `user.uid` não está em `teachers/` aprovado OU `pending_teachers/` aprovado → redireciona para bloqueio (role = null)
- Se email foi removido mas `pending_teachers/{old-uid}` ainda existe → detecta no boot, mostra aviso

### 3. Permissões de Substituição

```
Professor pode ser substituto se:
  ✓ profile === "teacher" (não coordenador puro)
  ✓ não está ausente na mesma data + timeSlot
  ✓ não leciona na mesma data + timeSlot
  ✓ não atingiu limite semanal de substituições
```

### 4. Interceptação de Actions para Coordenadores

```
Coordenador tenta addTeacher()
  └─ _isCoordinator() === true?
       ├─ SIM → cria pending_action com status: "pending"
       │        toast("Solicitação enviada para aprovação")
       │        PARA (não adiciona professor ainda)
       └─ NÃO → executa normalmente (admin path)
```

### 5. Auditoria de Removals

Ao remover professor/coordenador:
1. Registrar em audit log: `{ action: 'remove_teacher', teacherId, removedBy, timestamp }`
2. Invalidar sessão ativa (listeners closados)
3. Bloquear re-login até re-adição

---

## Cenários de Teste (E2E Specs)

### FLUXO 1: Ausências — Criar → Aprovar → Gerar Relatório

**Arquivo:** `e2e/tests/fluxo-ausencias.spec.js` → `test('Criar ausência → Aprovar → Gerar relatório')`

**Setup:**
- Admin logado
- Professor "Prof Teste A" registrado com matéria "Português"
- Escola com grade de segunda (6º Ano A, 1ª aula, Prof Teste A)

**Passos:**
1. Navegar para `/absences`
2. Verificar que não há ausências de "Prof Teste A" nesta semana
3. Clicar "Criar Ausência"
4. Modal abre: preencher data (segunda), professor (Prof Teste A), turma (6º Ano A), aula 1
5. Clicar "Salvar"
6. Verificar toast sucesso + card de ausência aparece
7. Verificar status badge = "aberta" (vermelho)
8. Clicar em ausência → detalhe abre
9. Clicar "Atribuir Substituto" → modal com ranking
10. Selecionar "Prof Teste B" (score 0, disponível)
11. Clicar "Confirmar"
12. Verificar status badge mudou para "parcial" (amarelo) ou "coberta" (verde, se 1 slot)
13. Clicar "Exportar PDF" → nova aba com dialog de impressão
14. Fechar dialog (não imprimir — apenas verificar HTML gerado)
15. Voltar para lista
16. Verificar absent em "Prof Teste A" aparece coberta

**Assertions:**
- [ ] Toast "Ausência criada com sucesso" aparece
- [ ] Card tem status "aberta"
- [ ] Substituto atribuído aparece no slot
- [ ] Status muda para "coberta" ou "parcial"
- [ ] PDF gerado contém data, professor, turma, horário

**Edge Cases Cobertos:**
- Tentar criar com data no passado → erro "Data não pode ser passada"
- Tentar atribuir professor que também está ausente na mesma data → erro
- Tentar atribuir sem selecionar candidato → erro "Selecione um substituto"

---

### FLUXO 2: Ausências — Criar → Rejeitar → Verificar Mudança de Status

**Arquivo:** `e2e/tests/fluxo-ausencias.spec.js` → `test('Criar ausência → Rejeitar → Verificar mudança de status')`

**Setup:**
- Admin logado
- Professor registrado
- Ausência criada e coberta (status = "covered")

**Passos:**
1. Navegar para `/absences`
2. Encontrar ausência coberta de "Prof Teste A"
3. Clicar em ausência → detalhe abre
4. Clicar "Remover Substituição" no slot com substituto
5. Clicar "Confirmar Remoção"
6. Verificar status badge mudou de "coberta" para "aberta"
7. Toast "Substituição removida"

**Assertions:**
- [ ] Status recalculado corretamente (covered → open)
- [ ] Slot mostra "Sem substituto" novamente
- [ ] Toast sucesso aparece

**Edge Cases Cobertos:**
- Remover e re-atribuir rapidamente (race condition) → sistema mantém último estado
- Remover slot que é o único → ausência inteira deletada

---

### FLUXO 3: Ausências — Criar → Remover → Confirmar Remoção e Auditoria

**Arquivo:** `e2e/tests/fluxo-ausencias.spec.js` → `test('Criar ausência → Remover → Confirmar remoção e auditoria')`

**Setup:**
- Admin logado
- Professor registrado
- 2 ausências do professor: uma com 1 slot, outra com 3 slots

**Passos:**
1. Navegar para `/absences`
2. Clicar em ausência com 1 slot (removível inteira)
3. Clicar "Deletar Ausência"
4. Modal confirma "Tem certeza? Isso removerá a ausência permanentemente"
5. Clicar "Sim, Deletar"
6. Toast "Ausência deletada"
7. Verificar que não aparece mais na lista
8. Verificar em `/settings` → aba "Auditoria" que aparece entrada: `{ action: 'delete_absence', id, removedBy: 'admin@...', timestamp }`

**Assertions:**
- [ ] Ausência removida da lista
- [ ] Toast sucesso
- [ ] Audit log contém registro de remoção
- [ ] Timestamp está correto (hoje)

**Edge Cases Cobertos:**
- Tentar deletar 2 vezes seguidas → segunda requisição falha (conflict)
- Remover enquanto alguém visualiza → re-render automático mostra removido

---

### FLUXO 4: Substituição — Criar Ausência → Atribuir Substituto → Confirmar Acesso do Substituto

**Arquivo:** `e2e/tests/fluxo-substituicoes.spec.js` → `test('Criar ausência → Atribuir substituto → Confirmar acesso')`

**Setup:**
- Admin logado
- Professor Ausente (PA) registrado
- Professor Substituto (PS) registrado, matéria compatível
- Ausência criada para PA, slot descoberto

**Passos:**
1. Navegar para `/substitutions`
2. Aba "Dia" — encontrar slot descoberto de PA
3. Clicar "Atribuir Substituto"
4. Modal renderiza ranking:
   - PS no topo (score 0: mesma matéria + segmento)
   - Outros abaixo (scores 1-4)
5. Clicar em PS
6. Toast "Substituto atribuído"
7. Volta para lista — slot agora mostra PS como substituto
8. **Logout** (destruir session)
9. Login como PS
10. Navegar para `/substitutions` → aba "Substituto"
11. Verificar que PS aparece no ranking com 1 substituição atribuída neste mês
12. Navegar para `/schedule` (grade pessoal)
13. Verificar que no dia da substituição (segunda), slot mostra aula de PA (não sua aula regular)
14. Badge de carga horária mostra +1 no mês

**Assertions:**
- [ ] Substituto aparece no ranking (aba "Substituto")
- [ ] Grade pessoal mostra aula como substituto
- [ ] Carga mensal incrementada
- [ ] PS consegue acessar `/substitutions` e `/schedule` normalmente (não está bloqueado)

**Edge Cases Cobertos:**
- Atribuir professor com limite semanal atingido → aviso "Limite de substituições nesta semana"
- Atribuir professor que leciona no mesmo horário → erro "Conflito de horário"
- Remover PA do sistema enquanto PS está logado → PS perde acesso à substituição (re-render)

---

### FLUXO 5: Substituição — Atribuir → Remover Substituição → Confirmar Bloqueio do Substituto

**Arquivo:** `e2e/tests/fluxo-substituicoes.spec.js` → `test('Atribuir substituto → Remover → Confirmar bloqueio')`

**Setup:**
- Admin logado
- Ausência com substituto atribuído
- PS é o substituto

**Passos:**
1. Navegar para `/substitutions`
2. Aba "Dia" — encontrar slot com PS como substituto
3. Clicar "Remover Substituto"
4. Modal confirma "Remover PS como substituto?"
5. Clicar "Sim"
6. Toast "Substituto removido"
7. Slot volta a "Sem substituto"
8. **Logout**, login como PS
9. Navegar para `/schedule` → verifica que slot desapareceu (não é mais substituto)
10. Navegar para `/substitutions` → aba "Substituto" → verifica que substituição foi removida do ranking

**Assertions:**
- [ ] Slot muda para "Sem substituto"
- [ ] PS não vê mais a substituição em sua grade
- [ ] Ranking mensal de PS não conta mais essa substituição
- [ ] Toast sucesso

**Edge Cases Cobertos:**
- Remover, re-atribuir, remover novamente (rapid fire) → sistema mantém consistência
- Remover enquanto PS visualiza sua grade → grade re-renderiza (listener atualiza)

---

### FLUXO 6: Usuário — Convidar Professor → Aceitar Convite → Professor Loga com Acesso

**Arquivo:** `e2e/tests/fluxo-usuarios.spec.js` → `test('Convidar professor → Aceitar convite → Login com acesso')`

**Setup:**
- Admin logado
- Nenhum professor com email "novo.prof@test.com" registrado

**Passos:**
1. Navegar para `/settings` → aba "Professores"
2. Clicar "Adicionar Professor"
3. Preencher:
   - Nome: "Novo Professor"
   - Email: "novo.prof@test.com"
   - Matérias: ["Português"]
   - Celular: "11999999999"
4. Clicar "Salvar"
5. Toast "Professor adicionado, aguardando cadastro"
6. Tabela mostra novo professor com status "Pendente de cadastro"
7. Clicar "Enviar Convite" → email link seria enviado (mockado em dev)
8. **Logout** (destruir session admin)
9. Simular login como novo professor:
   - Firebase Auth cria user com "novo.prof@test.com"
   - Sistema detecta email em `pending_teachers/{uid}` com `status: 'pending'`
   - Renderiza `<PendingPage>`
10. Preencher celular/apelido em PendingPage
11. Clicar "Solicitar Acesso"
12. Toast "Solicitação enviada, aguardando aprovação do administrador"
13. **Logout** (destroy pending session)
14. Login como admin
15. Navegar para `/settings` → aba "Professores"
16. Tabela mostra "Novo Professor" com status "Aprovação Pendente"
17. Clicar "Aprovar"
18. Toast "Professor aprovado"
19. Tabela atualiza: status → "Aprovado", badge verde
20. **Logout**
21. Login novamente como "novo.prof@test.com"
22. Sistema detecta aprovação → redireciona para `/home` (teacher path)
23. `/dashboard` acessível, `/settings` acessível (abas limitadas)

**Assertions:**
- [ ] Professor criado em `pending_teachers/{uid}` com `status: 'pending'`
- [ ] `PendingPage` renderizada para email novo
- [ ] Após aprovação, `teachers/{id}` criado com `status: 'approved'`
- [ ] Login bem-sucedido com acesso a rotas de teacher
- [ ] Role no store = "teacher"
- [ ] Pode visualizar `/home` e `/absences`

**Edge Cases Cobertos:**
- Enviar convite duas vezes → email não duplicado em pending_teachers
- Professor tenta acessar `/dashboard` antes de aprovação → bloqueado, redireciona para pending
- Admin aprova e revoga no mesmo dia → professor é bloqueado, verifica bloqueio

---

### FLUXO 7: Usuário — Remover Professor → Verificar Bloqueio no Login → Adicionar Novamente → Novo Convite Funciona

**Arquivo:** `e2e/tests/fluxo-usuarios.spec.js` → `test('Remover professor → Bloqueio no login → Re-adição com novo convite')`

**Setup:**
- Admin logado
- Professor "Removível" registrado, aprovado, com email "remov@test.com"
- Sessão ativa deste professor em outra aba (simulada)

**Passos:**
1. Admin navega para `/settings` → aba "Professores"
2. Encontra "Removível" (remov@test.com)
3. Clicar "Remover"
4. Modal confirma "Remover 'Removível' permanentemente? Isso bloqueará seu acesso."
5. Clicar "Sim, Remover"
6. Toast "Professor removido"
7. Tabela atualiza, professor desaparece
8. `teachers/{id}` deletado, `pending_teachers/{uid}` criado com `status: 'blocked'` (opcional, para auditoria)
9. **Logout**
10. Tentar login como "remov@test.com"
11. Firebase Auth autentica (user existe em Google)
12. Sistema checa `teachers/` → não encontrado
13. Sistema checa `pending_teachers/{uid}` → não encontrado OU `status: 'blocked'`
14. Renderiza tela de bloqueio:
    - Mensagem: "Sua conta foi removida. Entre em contato com o administrador."
    - Email de contato: "admin@test-escola.com"
    - Botão "Sair"
15. **Logout**
16. Admin login
17. Admin navega para `/settings` → aba "Professores"
18. Clicar "Adicionar Professor" novamente
19. Preencher:
    - Nome: "Removível (Re-adicionado)"
    - Email: "remov@test.com" (mesmo email)
    - Matérias: ["Português"]
20. Clicar "Salvar"
21. Novo professor criado em `pending_teachers/{nova-uid}` (uid diferente, novo cookie de auth)
22. Toast "Professor adicionado"
23. Clicar "Enviar Convite"
24. **Logout**
25. Login como "remov@test.com" (novo uid de Auth)
26. Sistema agora vê novo doc em `pending_teachers/{nova-uid}` com `status: 'pending'`
27. Renderiza `<PendingPage>` normalmente
28. Preencher dados + solicitar acesso
29. **Logout**
30. Admin aprova
31. Login como "remov@test.com" → agora funciona, acesso restaurado

**Assertions:**
- [ ] Tela de bloqueio renderizada após remoção
- [ ] Re-adição com mesmo email cria novo `pending_teachers` doc
- [ ] Novo convite funciona (não há conflito de email)
- [ ] Após aprovação, acesso completo restaurado
- [ ] Audit log registra remoção + re-adição

**Edge Cases Cobertos:**
- Tentar re-login imediatamente após remoção (cache LS pode ter dados antigos) → bloqueio anyway
- Remover durante login (race condition) → bootSequence detecta bloqueio
- Re-adicionar antes de 24h → sem restrição, novo convite pode ser enviado

---

### FLUXO 8: Usuário — Remover Coordenador + Professor → Adicionar Novamente → Verificar Permissões Restauradas

**Arquivo:** `e2e/tests/fluxo-usuarios.spec.js` → `test('Remover coordenador + professor → Re-adição → Permissões restauradas')`

**Setup:**
- Admin logado
- Coordenador "Coord Teste" registrado com `profile: 'coordinator'`
- Professor "Prof Teste" registrado com `profile: 'teacher'`
- Coordenador tem 2 `pending_actions` submetidas aguardando aprovação

**Passos:**
1. Admin navega para `/settings` → aba "Professores"
2. Remove "Coord Teste"
3. Remove "Prof Teste"
4. Toast "Professores removidos"
5. Navegra para aba "Solicitações"
6. As 2 `pending_actions` do coordenador ainda aparecem (soft deletion — não deletadas)
7. **Logout**
8. Tentar login como coordenador → bloqueio (tela de bloqueio)
9. Tentar login como professor → bloqueio
10. **Logout**
11. Admin login
12. Admin navega para `/settings` → aba "Professores"
13. Clicar "Adicionar Professor" → "Coord Teste", profile: "coordinator"
14. Clicar "Adicionar Professor" → "Prof Teste", profile: "teacher"
15. Clicar "Enviar Convite" para ambos
16. **Logout**
17. Login como coordenador (novo uid de Firebase Auth)
18. Sistema detecta novo `pending_teachers` de coordenador
19. Renderiza `<PendingPage>`
20. Preenche dados, solicita acesso
21. **Logout**
22. Admin aprova ambos
23. **Logout**
24. Login como coordenador
25. Redireciona para `/dashboard` (role = "coordinator")
26. Navega para `/settings` → aba "Solicitações"
27. Verifica que as 2 `pending_actions` antigos ainda estão lá (histórico)
28. Tenta criar nova `pending_action` (adicionar matéria) → funciona, nova action criada
29. **Logout**
30. Login como professor
31. Redireciona para `/home` (role = "teacher")
32. Acessa `/schedule`, `/absences`, `/substitutions` normalmente
33. Tenta acessar `/calendar` → bloqueado (teacher não pode ver calendar)

**Assertions:**
- [ ] Ambos bloqueados após remoção
- [ ] Re-adição restaura acesso para ambos
- [ ] Coordenador pode criar `pending_actions` novamente
- [ ] Professor acessa rotas de teacher, sem acesso a admin/coordinator
- [ ] Histórico de `pending_actions` antigos preservado (auditoria)
- [ ] Roles atribuídos corretamente

**Edge Cases Cobertos:**
- Re-adicionar coordenador com `profile: 'teacher'` (downgrade de role) → funciona, role muda
- Remover enquanto há `pending_actions` ativas → ações não são deletadas, apenas orfãs
- Re-adicionar com `profile: 'teacher-coordinator'` (novo tipo) → validação funciona

---

### FLUXO 9: Usuário — Remover Super Admin → Adicionar Novamente → Verificar Acesso Total

**Arquivo:** `e2e/tests/fluxo-usuarios.spec.js` → `test('Remover super admin → Re-adição → Acesso total verificado')`

**Setup:**
- 2 super admins: "Admin Teste 1" (na list hardcoded ou coleção `admins/`)
- Admin Teste 1 logado
- Admin Teste 2 removível (em `admins/` ou será removido)

**Passos:**
1. Admin 1 navega para `/settings` → aba "Admins"
2. Lista mostra "Admin Teste 2" com label "Admin" + botão "Remover"
3. Clicar "Remover"
4. Modal confirma "Remover 'Admin Teste 2' como super admin?"
5. Clicar "Sim"
6. Toast "Admin removido"
7. Tabela atualiza
8. **Logout**
9. Tentar login como Admin Teste 2
10. Firebase autentica, mas sistema checa `teachers/` + `admins/` → não encontrado
11. Renderiza tela de bloqueio
12. **Logout**
13. Admin 1 login novamente
14. Navega para `/settings` → aba "Admins"
15. Clicar "Adicionar Admin"
16. Modal: preencher email de Admin Teste 2 novamente
17. Clicar "Adicionar"
18. Novo doc em `admins/` (email sanitizado) com `addedAt: Timestamp`
19. Toast "Admin adicionado"
20. **Logout**
21. Login como Admin Teste 2
22. Sistema valida: email em `admins/` → role = "admin"
23. Redireciona para `/dashboard` (admin path)
24. Navega para `/settings` → todas as 8 abas acessíveis
25. Tenta todas as ações críticas:
    - Adicionar/remover professor → funciona
    - Adicionar/remover segmento → funciona
    - Aprovar `pending_actions` → funciona
    - Adicionar novo admin → funciona
26. Navega para `/calendar` → acessível
27. Navega para `/workload` → acessível
28. Role no store = "admin"

**Assertions:**
- [ ] Admin removido, bloqueado no login
- [ ] Re-adição via `admins/` coleção funciona
- [ ] Novo admin tem acesso completo (todas as rotas + abas)
- [ ] Pode executar todas as ações críticas de admin
- [ ] Role corretamente atribuído como "admin"

**Edge Cases Cobertos:**
- Remover último admin → erro "Deve haver pelo menos um admin ativo"
- Tentar remover admin que está logado → sessão não é invalidada (continua até logout)
- Re-adicionar com email diferente (typo) → novo admin criado, antigo bloqueado
- Hardcoded vs dinâmico admin — ambos funcionam (lógica de OR em `isAdmin()`)

---

## Helpers e Utilities

### `e2e/helpers/auth-helpers.js`

```javascript
/**
 * Faz login de um usuário via email/password (dev mock)
 * Em prod: usa Google OAuth (popup)
 */
export async function loginAs(page, email, password) {
  await page.goto('/')
  
  // Dev: se houver input mock, preencher
  await page.fill('[data-testid="email-input"]', email)
  await page.fill('[data-testid="password-input"]', password)
  await page.click('[data-testid="login-button"]')
  
  // Aguardar redirecionamento
  await page.waitForURL(/\/(dashboard|home|settings)/, { timeout: 10000 })
}

export async function logout(page) {
  await page.click('[data-testid="navbar-logout"]')
  await page.waitForURL('/', { timeout: 5000 })
}

export async function getRole(page) {
  // Extrair role do localStorage ou DOM
  const roleEl = await page.locator('[data-testid="user-role"]').textContent()
  return roleEl
}

export async function isLoggedIn(page) {
  try {
    await page.waitForURL(/\/(dashboard|home|settings)/, { timeout: 2000 })
    return true
  } catch {
    return false
  }
}
```

### `e2e/helpers/ui-helpers.js`

```javascript
export async function fillForm(page, fields) {
  // fields = { 'input[name="email"]': 'test@test.com', ... }
  for (const [selector, value] of Object.entries(fields)) {
    await page.fill(selector, value)
  }
}

export async function clickAndWaitForNavigation(page, selector, expectedUrl) {
  await Promise.all([
    page.waitForURL(expectedUrl, { timeout: 10000 }),
    page.click(selector),
  ])
}

export async function getToastMessage(page) {
  return await page.locator('[data-testid="toast-message"]').textContent()
}

export async function closeModal(page) {
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="modal"]', { state: 'hidden' })
}

export async function selectFromDropdown(page, selectSelector, optionText) {
  await page.click(selectSelector)
  await page.click(`text=${optionText}`)
}

export async function waitForTableRow(page, name) {
  return page.locator(`tr:has-text("${name}")`)
}
```

### `e2e/helpers/db-helpers.js`

```javascript
/**
 * Funções puras de manipulação de dados para setup/teardown
 * Não fazem I/O direto — retornam dados estruturados
 */

export function createTeacher(name, email, subjectIds, profile = 'teacher') {
  return {
    id: `t-${Date.now()}`,
    name,
    email,
    subjectIds,
    status: 'approved',
    profile,
  }
}

export function createAbsence(teacherId, slots) {
  return {
    id: `ab-${Date.now()}`,
    teacherId,
    createdAt: new Date(),
    status: 'open',
    slots: slots.map(s => ({
      id: `sl-${Date.now()}`,
      ...s,
      substituteId: null,
    })),
  }
}

export function createPendingTeacher(email, name, uid) {
  return {
    id: uid,
    uid,
    email,
    name,
    photoURL: '',
    requestedAt: new Date(),
    status: 'pending',
    subjectIds: [],
  }
}

export function calcAbsenceStatus(slots) {
  const total = slots.length
  const covered = slots.filter(s => s.substituteId).length
  
  if (covered === total) return 'covered'
  if (covered === 0) return 'open'
  return 'partial'
}
```

### `e2e/helpers/assertions.js`

```javascript
export async function assertToastAppears(page, message, type = 'ok') {
  const toast = page.locator('[data-testid="toast-message"]')
  await expect(toast).toContainText(message)
  await expect(toast).toHaveClass(new RegExp(type))
}

export async function assertAbsenceStatus(page, teacherName, expectedStatus) {
  const card = page.locator(`text=${teacherName}`)
  const badge = card.locator('[data-testid="status-badge"]')
  await expect(badge).toContainText(expectedStatus)
}

export async function assertTableRowExists(page, ...columns) {
  const row = page.locator('tr', { has: page.locator(`text=${columns[0]}`) })
  for (const col of columns.slice(1)) {
    await expect(row).toContainText(col)
  }
}

export async function assertAccessDenied(page) {
  await expect(page).toHaveURL(/\/settings/)
  await expect(page.locator('text=Acesso negado')).toBeVisible()
}
```

---

## Setup e Teardown (Fixtures)

### `e2e/auth.setup.js`

Cria storage states para admin, coordinator, teacher (reutilizados em testes).

```javascript
import { test as setup } from '@playwright/test'

setup.describe.configure({ mode: 'parallel' })

const testUsers = [
  { email: 'admin@test-escola.com', role: 'admin', file: 'admin.json' },
  { email: 'coord@test-escola.com', role: 'coordinator', file: 'coordinator.json' },
  { email: 'prof@test-escola.com', role: 'teacher', file: 'teacher.json' },
]

for (const { email, role, file } of testUsers) {
  setup(`Login e salvar storage state — ${role}`, async ({ page, context }) => {
    await page.goto('/')
    
    // Dev: mock login
    await page.fill('[data-testid="email-input"]', email)
    await page.fill('[data-testid="password-input"]', 'TestPassword123!')
    await page.click('[data-testid="login-button"]')
    
    // Aguardar load completo
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 15000 })
    await page.waitForLoadState('networkidle')
    
    // Salvar storage state
    await context.storageState({ path: `e2e/.auth/${file}` })
  })
}
```

### `playwright.config.js` — Usar storage states

```javascript
projects: [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'admin-tests',
    use: {
      ...devices['Desktop Chrome'],
      storageState: 'e2e/.auth/admin.json',
    },
    testMatch: '**/admin/**',
  },
  {
    name: 'coordinator-tests',
    use: {
      ...devices['Desktop Chrome'],
      storageState: 'e2e/.auth/coordinator.json',
    },
    testMatch: '**/coordinator/**',
  },
]
```

---

## Package.json Scripts

```json
{
  "scripts": {
    "test": "playwright test",
    "test:debug": "playwright test --debug",
    "test:headed": "playwright test --headed",
    "test:ui": "playwright test --ui",
    "test:fluxo-ausencias": "playwright test fluxo-ausencias.spec.js",
    "test:fluxo-substituicoes": "playwright test fluxo-substituicoes.spec.js",
    "test:fluxo-usuarios": "playwright test fluxo-usuarios.spec.js",
    "test:all-e2e": "playwright test",
    "report": "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0"
  }
}
```

---

## Fora do Escopo (v1)

- [ ] Testes de carga (k6, Artillery) — 1000+ usuários simultâneos
- [ ] Testes visuais (Percy, Chromatic) — screenshot comparison
- [ ] Testes de API direta (REST/GraphQL) — apenas UI testada
- [ ] Integração real com Google OAuth — usar mock em dev
- [ ] Teste de envio de emails reais — usar Mailhog em dev
- [ ] Teste de PDF generation — apenas HTML verificado (print dialog)
- [ ] Teste de offline mode (service workers)
- [ ] Teste de performance (Lighthouse automation)
- [ ] Testes de acessibilidade (axe-core) — apenas estrutura preparada
- [ ] Teste de segurança (XSS, CSRF) — validado em code review + Firestore Rules

---

## Checklist de Implementação

Antes de rodar os testes:

- [ ] Playwright instalado (`npm install -D @playwright/test`)
- [ ] `.env.test` criado com `PLAYWRIGHT_BASE_URL`, `TEST_ADMIN_EMAIL`, etc
- [ ] `e2e/` pasta criada com estrutura de diretórios
- [ ] Helper functions implementadas (auth, ui, db, assertions)
- [ ] Fixtures (usuarios-teste.json, escola-seed.json) criadas
- [ ] Storage states salvos em `.auth/` (admin.json, coordinator.json, teacher.json)
- [ ] `playwright.config.js` atualizado com paths corretos
- [ ] `package.json` scripts adicionados
- [ ] Testes rodam sem erros: `npm run test -- --headed`
- [ ] Relatório HTML gerado: `npm run report`

---

## Referências e Links Úteis

| Recurso | URL |
|---|---|
| Playwright Docs | https://playwright.dev |
| Best Practices | https://playwright.dev/docs/best-practices |
| Locators | https://playwright.dev/docs/locators |
| Fixtures | https://playwright.dev/docs/test-fixtures |
| Network Replay | https://playwright.dev/docs/network#record-and-playback-network-requests |
| GestãoEscolar Architecture | `/references/architecture.md` |

---

## Próximas Iterações

### v1.1 — Integration Tests
- Testes de API do Firestore (Admin SDK)
- Testes de Firestore Rules (permitir/negar acesso)
- Testes de Cloud Functions (se implementadas)

### v1.2 — Visual Regression
- Adicionar Percy ou Chromatic
- Snapshots de páginas críticas (login, dashboard, settings)

### v1.3 — Performance Testing
- Lighthouse automated
- Core Web Vitals monitoring
- Bundle size regression tests

### v1.4 — Security Testing
- OWASP Top 10 coverage
- Dependency scanning (snyk)
- Rate limiting validation

---

## Suporte e Debugging

### Rodar um teste isolado com debug

```bash
npx playwright test fluxo-ausencias.spec.js --debug
```

### Gerar relatório HTML

```bash
npm run report
```

### Capturar screenshots em falhas

Configurado em `playwright.config.js`:
```javascript
screenshot: 'only-on-failure'
```

Arquivos salvos em `test-results/` com timestamp.

### Rodar em modo UI (recomendado para desenvolvimento)

```bash
npm run test:ui
```

Abre interface visual do Playwright onde você pode executar testes, pausar, inspetar elementos, etc.

---

## Contato e Issues

- **Problemas com testes:** Abrir issue em `e2e/issues/` com:
  - Teste que falhou
  - Screenshot/video (se capturado)
  - Log de erro completo
  - Ambiente (Windows/Mac/Linux, browser)

- **Melhorias propostas:** Discussão em `e2e/discussions/`

---

**Fim do Spec**
