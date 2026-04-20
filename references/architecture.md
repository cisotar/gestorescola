# Arquitetura — GestãoEscolar

**Versão:** 2.4.0 | **Atualizado:** 2026-04-19 | **Firebase Project:** `gestordesubstituicoes`

> **Público-alvo:** Este documento é o guia técnico de onboarding para novos desenvolvedores. Ele explica **como o sistema funciona sob o capô**, não apenas o que existe. Leia do início ao fim antes de abrir o primeiro PR.

---

## Sumário

1. [Filosofia e Visão Sistêmica](#1-filosofia-e-visão-sistêmica)
2. [Stack Tecnológica](#2-stack-tecnológica)
3. [Estrutura de Pastas — Convenções de Projeto](#3-estrutura-de-pastas--convenções-de-projeto)
4. [Modelo de Dados — Firestore](#4-modelo-de-dados--firestore)
5. [Gerenciamento de Estado — Zustand](#5-gerenciamento-de-estado--zustand)
6. [Sistema de Permissões (RBAC)](#6-sistema-de-permissões-rbac)
7. [Fluxo de Inicialização e Autenticação](#7-fluxo-de-inicialização-e-autenticação)
8. [Fluxos Críticos de Código](#8-fluxos-críticos-de-código)
9. [Roteamento](#9-roteamento)
10. [Páginas e suas Responsabilidades](#10-páginas-e-suas-responsabilidades)
11. [Lógica de Negócio (`src/lib/`)](#11-lógica-de-negócio-srclib)
12. [Padrões de UI e Componentização](#12-padrões-de-ui-e-componentização)
13. [Convenções de Código](#13-convenções-de-código)
14. [Débitos Técnicos e Limitações Conhecidas](#14-débitos-técnicos-e-limitações-conhecidas)
15. [Otimizações de Bundle e Performance](#15-otimizações-de-bundle-e-performance)

---

## 1. Filosofia e Visão Sistêmica

### O que é este sistema?

GestãoEscolar é uma **SPA (Single-Page Application) reativa** construída sobre Firebase. Ela gerencia três domínios interdependentes de uma escola:

1. **Grade horária** — quem leciona o quê, quando e para qual turma.
2. **Ausências** — registro e status (aberta / parcialmente coberta / coberta).
3. **Substituições** — ranking automático de candidatos e histórico de quem substituiu quem.

### Diagrama de camadas do sistema

```
┌────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (SPA)                                 │
│                                                                        │
│  ┌──────────────┐    ┌───────────────────────────────────────────────┐ │
│  │  React UI    │◄───│           Zustand Stores                      │ │
│  │  (pages +    │    │  useAuthStore  │  useAppStore                 │ │
│  │  components) │    │  (auth, role)  │  (config, dados, actions)    │ │
│  └──────┬───────┘    └───────────────┴───────────────────────────────┘ │
│         │                        ▲              ▲                      │
│         │ eventos UI             │ hydrate()    │ setXxx()             │
│         ▼                        │              │                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        src/lib/                                 │   │
│  │  db/ (I/O + cache)    │  absences/    │  reports/ (lazy)       │   │
│  │  helpers/             │  periods/     │  settings/ (lazy)      │   │
│  │  firebase/            │  constants.js │  index.js (re-exports) │   │
│  └───────────────────────┴───────────────┴────────────────────────┘   │
│              │                                                         │
│              │ onSnapshot / get / set / delete                         │
│  ┌───────────▼─────────────┐    ┌───────────────────────────────────┐  │
│  │   Firebase Firestore    │    │        Local Storage              │  │
│  │   (fonte da verdade)    │◄──►│  cache 'gestao_v7_cache' (1h TTL) │  │
│  └─────────────────────────┘    └───────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Por que SPA + Firebase (sem back-end próprio)?

A escolha elimina a necessidade de servidor dedicado. O Firebase fornece:
- **Autenticação** via Google OAuth.
- **Firestore** como banco de dados em tempo real com sincronização via `onSnapshot`.
- **Hosting** com redirect de SPA já configurado.

O custo operacional fica próximo de zero para o volume esperado (escola única), e o deploy é um único comando (`firebase deploy`).

### Por que Zustand + Local Storage?

```
┌─────────────────────────────────────────────────────────────────┐
│  Por que não Context/Redux?                                     │
│                                                                 │
│  Zustand foi escolhido por três razões:                         │
│  1. API minimal — store é um objeto simples, sem boilerplate.   │
│  2. Acesso fora de componentes — essencial para funções em      │
│     db.js que precisam ler/escrever no store sem hooks.         │
│     Ex: aprovação de teacher chama useAppStore.getState()       │
│  3. Sem Provider wrapping — qualquer módulo importa o store     │
│     de forma síncrona: useAppStore.getState().teachers          │
└─────────────────────────────────────────────────────────────────┘
```

O **Local Storage** age como camada de cache e fallback, reduzindo drasticamente o número de leituras no Firestore (que são cobradas por documento):

| Situação | Comportamento |
|---|---|
| Cache no LS com menos de 1 hora | Retorna do cache, evita round-trip ao Firestore |
| Firestore disponível, cache expirado | Busca do Firestore e grava novo timestamp no LS |
| Firestore indisponível (offline/quota) | Usa cache do LS mesmo que expirado |
| Nenhum cache disponível | Retorna `{}`, store usa `INITIAL_STATE` |

A chave de cache é `gestao_v7_cache`. O sufixo `v7` é incrementado **manualmente** sempre que há mudanças incompatíveis no formato dos dados para forçar limpeza de caches antigos.

---

## 2. Stack Tecnológica

| Componente | Versão | Papel no sistema |
|---|---|---|
| **React** | 18.3.1 | Framework UI — renderização declarativa de páginas e componentes |
| **React Router** | 6.26.0 | Roteamento SPA — sem recarregamento de página entre rotas |
| **Zustand** | 4.5.4 | Estado global — dois stores (auth + app), acesso síncrono fora de componentes |
| **Firebase Auth** | 10.12.2 | Autenticação via Google OAuth (popup flow) |
| **Firestore** | 10.12.2 | Banco de dados NoSQL em tempo real — fonte da verdade |
| **Tailwind CSS** | 3.4.10 | Estilização — utility-first com tokens de design customizados |
| **Vite** | 5.4.1 | Build tool e dev server (HMR instantâneo) |
| **PostCSS + Autoprefixer** | — | Pipeline CSS para Tailwind |

**Fontes (Google Fonts, carregadas em `index.html`):**

| Fonte | Uso |
|---|---|
| **Figtree** | Toda UI textual (`font-sans`) |
| **DM Mono** | Valores numéricos, IDs, dados tabulares (`font-mono`) |

**Scripts disponíveis:**

```bash
npm run dev      # dev server Vite (HMR em http://localhost:5173)
npm run build    # build de produção → dist/
npm run preview  # preview do build local antes de deploy
firebase deploy  # deploy para gestordesubstituicoes-react.web.app
```

---

## 3. Estrutura de Pastas — Convenções de Projeto

```
src/
├── App.jsx              # Raiz da aplicação: orquestra init, auth e rotas
├── main.jsx             # Entry point: monta React + BrowserRouter no DOM
├── index.css            # CSS global: tokens Tailwind + classes utilitárias
│
├── pages/               # ► UMA página = UM arquivo = UMA rota
│   ├── LoginPage.jsx       #   Nenhuma lógica de negócio aqui — só UI
│   ├── PendingPage.jsx     #   Páginas chamam actions do store para mutações
│   ├── HomePage.jsx        #   Componentes internos ficam no mesmo arquivo,
│   ├── DashboardPage.jsx   #   acima do export default, sem export próprio
│   ├── CalendarPage.jsx
│   ├── CalendarDayPage.jsx
│   ├── AbsencesPage.jsx
│   ├── SubstitutionsPage.jsx
│   ├── SchedulePage.jsx
│   ├── SchoolSchedulePage.jsx
│   ├── SettingsPage.jsx
│   └── WorkloadPage.jsx
│
├── components/          # ► Componentes reutilizáveis entre 2+ páginas
│   ├── layout/          #   Estrutura de página (nav, wrapper)
│   │   ├── Layout.jsx   #   Wrapper com <Navbar> + <Outlet>
│   │   └── Navbar.jsx   #   Tabs desktop + hamburger mobile
│   └── ui/              #   Primitivos de UI sem lógica de negócio
│       ├── Modal.jsx
│       ├── ActionCard.jsx
│       ├── Toast.jsx
│       ├── Spinner.jsx
│       ├── SuggestionPill.jsx
│       ├── SuggestionPills.jsx
│       └── ToggleRuleButtons.jsx
│
├── store/               # ► Estado global (Zustand)
│   ├── useAppStore.js   #   Dados da escola: professores, horários, ausências…
│   └── useAuthStore.js  #   Sessão: usuário, role, listeners de auth
│
├── lib/                 # ► Lógica pura — sem React, sem estado, sem side-effects de UI
│   ├── index.js         #   Re-exports seletivos de todos os módulos (ponto de entrada único)
│   ├── constants.js     #   DAYS[], COLOR_PALETTE[] — valores imutáveis
│   │
│   ├── firebase/        #   SDK Firebase — inicialização isolada
│   │   └── index.js     #     exporta: app, db, auth, provider
│   │
│   ├── db/              #   Toda I/O com Firestore + LocalStorage
│   │   ├── index.js     #     loadFromFirestore, saveToFirestore, saveDoc, …
│   │   ├── config.js    #     saveConfig — setDoc atômico para meta/config
│   │   ├── cache.js     #     _saveToLS / _loadFromLS (gestao_v7_cache)
│   │   └── listeners.js #     setupRealtimeListeners, registerAbsencesListener, …
│   │
│   ├── helpers/         #   Utilitários granulares por categoria
│   │   ├── index.js     #     re-export agregado
│   │   ├── dates.js     #     formatISO, formatBR, parseDate, weekStart, …
│   │   ├── ids.js       #     uid() — gerador de IDs únicos
│   │   ├── colors.js    #     colorOfTeacher, COLOR_PALETTE, COLOR_NEUTRAL
│   │   ├── turmas.js    #     allTurmaObjects, isFormationSlot, …
│   │   └── permissions.js #   canEditTeacher
│   │
│   ├── periods/         #   Geração e serialização de períodos/slots
│   │   └── index.js     #     gerarPeriodos, resolveSlot, makeSlot, parseSlot, …
│   │
│   ├── absences/        #   Lógica de ausências: criação, ranking, queries
│   │   ├── index.js     #     re-export agregado
│   │   ├── validation.js #    isBusy, isAvailableBySchedule, weeklyLimitStatus
│   │   ├── ranking.js   #     rankCandidates, suggestSubstitutes, monthlyLoad
│   │   └── mutations.js #     createAbsence, assignSubstitute, deleteAbsenceSlot, …
│   │
│   ├── reports/         #   Geração de HTML para impressão (PDF via window.print)
│   │   └── index.js     #     generateDayHTML, generateByDayHTML, openPDF, …
│   │
│   └── settings/        #   Helpers de configuração e UI de settings
│       ├── index.js     #     re-export agregado
│       └── helpers.js   #     PROFILE_OPTIONS, teacherSegmentIds, timeAgo, …
│
└── hooks/               # ► Custom hooks React
    └── useToast.js      #   Store do toast + helper global toast()
```

### Regra de ouro para novos arquivos

| Diretório | Adicionar quando… | Nunca adicionar… |
|---|---|---|
| `pages/` | Criar uma nova rota acessível via URL | Componentes reutilizáveis (→ `components/`) |
| `components/ui/` | Criar um primitivo visual usado em 2+ páginas | Componentes com acesso direto ao store |
| `components/layout/` | Criar elemento estrutural de página (nav, sidebar) | Lógica de negócio |
| `lib/` | Escrever função pura de negócio/transformação sem React | Funções com useState/useEffect |
| `hooks/` | Encapsular lógica com estado React reutilizável | Hooks de uso único (ficam na página) |
| `store/` | Criar um domínio de estado global separado | Dados locais de UI (ficam no componente) |

### Componentes de uso único

Se um componente é usado **somente em uma página**, ele fica no mesmo arquivo da página, definido **acima do `export default`**, sem `export` próprio. Não criar arquivos separados para componentes de uso único — o contexto co-localizado facilita a leitura.

---

## 4. Modelo de Dados — Firestore

### Visão geral das coleções

```
Firestore
├── meta/
│   └── config              ← documento único: configurações globais da escola
│
├── teachers/               ← professores aprovados (Document ID = uid())
├── schedules/              ← aulas na grade horária (Document ID = uid())
├── absences/               ← faltas registradas com slots (Document ID = uid())
├── history/                ← substituições confirmadas — registros imutáveis
│
├── pending_teachers/       ← solicitações de acesso (Document ID = user.uid)
├── admins/                 ← admins dinâmicos (Document ID = email sanitizado)
└── pending_actions/        ← ações de coordenadores pendentes de aprovação
```

### Diagrama de relacionamentos

```
meta/config
  ├── segments[] ──────────────────────────────────┐
  │     └── grades[]                               │ segmentIds[]
  │           └── classes[]                        │
  │                                                ▼
  ├── areas[]  ◄──── areaId ──── subjects[] ────► subjectIds[]
  │                                                     ▲
  │                                                     │ subjectId
  └── periodConfigs{}                                   │
                                              schedules/
teachers/ ◄────── teacherId ─────── absences/ ─────► slots[]
                                        │                └── substituteId → teachers/
                                        │
                                     history/
                                     (teacherId + subId → teachers/)
```

---

### `meta/config` — Configurações Globais

Documento único em `meta/config`. Toda mutação usa `saveConfig(state)` (um `setDoc` atômico).

```js
{
  segments: [
    {
      id: "seg-fund",             // uid() gerado na criação
      name: "Ensino Fundamental",
      turno: "manha",             // "manha" | "tarde" | "noite"
      grades: [
        {
          name: "6º Ano",
          classes: [
            { letter: "A", turno: "manha" },
            { letter: "B", turno: "manha" }
          ]
        }
        // ...mais séries
      ]
    }
    // ...mais segmentos
  ],

  periodConfigs: {
    "seg-fund": {
      "manha": {
        inicio:     "07:00",   // horário da 1ª aula
        duracao:    50,        // minutos por aula
        qtd:        7,         // total de aulas por dia
        intervalos: [
          { apos: 2, duracao: 10 },   // intervalo de 10min após a 2ª aula
          { apos: 5, duracao: 60 }    // almoço de 60min após a 5ª aula
        ],

        // ── Campos opcionais — retrocompatível com configs existentes ──────
        inicioPeriodo: "06:45",  // horário de início do turno escolar (antes da 1ª aula)
        fimPeriodo:    "12:30",  // horário de encerramento do turno escolar

        gradeEspecial: {         // grade para dias especiais (ex: dias de evento)
          inicioEspecial: "14:00",  // horário de início da 1ª entrada da grade especial
          itens: [
            // ordem é 0-based e define a sequência de exibição
            { tipo: "intervalo", ordem: 0, duracao: 15, label: "Entrada"  },
            { tipo: "aula",      ordem: 1, duracao: 40, label: "Aula 1"   },
            { tipo: "aula",      ordem: 2, duracao: 40, label: "Aula 2"   }
            // slots gerados: "seg-fund|manha|e1", "seg-fund|manha|e2"
          ]
        }
      }
    }
  },

  areas: [
    {
      id: "area-ciencias",
      name: "Ciências da Natureza",
      colorIdx: 3,             // índice em COLOR_PALETTE (constants.js)
      segmentIds: ["seg-fund", "seg-med"],
      shared: false
    }
  ],

  subjects: [
    {
      id: "subj-bio",
      name: "Biologia",
      areaId: "area-ciencias"  // FK → areas[].id
    }
  ],

  sharedSeries: [              // turmas de formação compartilhada (ATPCG, etc.)
    {
      id: "shared-formacao",
      name: "FORMAÇÃO",
      type: "formation",         // "formation" | "elective" (formato após migração #224)
                                 // formation: não demanda substituto (ex: ATPCG, ATPCA)
                                 // elective: demanda substituto como aulas regulares
    }
  ],

  workloadWarn:   20,          // aulas/mês → badge amarelo
  workloadDanger: 26,          // aulas/mês → badge vermelho
  updatedAt: Timestamp         // serverTimestamp() em cada saveConfig
}
```

**Relacionamentos internos:** `subjects[].areaId → areas[].id` e `areas[].segmentIds[] → segments[].id`. O campo `periodConfigs` é indexado por `segmentId + turno`, permitindo que `periods.js` calcule horários de início/fim de qualquer slot sem armazenar redundâncias.

---

### `teachers/` — Professores

```js
{
  id:         "lv9k2a7",      // uid() — também é o Firestore Document ID
  name:       "Ana Souza",
  email:      "ana@escola.sp.gov.br",
  celular:    "11999999999",
  whatsapp:   "",             // separado de celular para links wa.me
  apelido:    "Aninha",       // opcional; exibido na grade horária
  subjectIds: ["subj-bio", "subj-cien"],  // FK → subjects[].id (1..N)
  status:     "approved",     // único valor em uso atualmente
  profile:    "teacher"       // "teacher" | "coordinator" | "teacher-coordinator"
}
```

- **`teacher.profile`** é o campo que determina o `role` no `useAuthStore` após login.
- **`teacher.subjectIds`** define de quais matérias o professor é candidato a substituto.
- Um professor sem `subjectIds` tem `score 4` (pior) em qualquer ranking.

---

### `schedules/` — Grade Horária

Representa uma **aula recorrente** (semanal) de um professor num slot de tempo.

```js
{
  id:        "mx3p9q1",       // uid()
  teacherId: "lv9k2a7",      // FK → teachers[].id
  day:       "Segunda",      // "Segunda" | "Terça" | "Quarta" | "Quinta" | "Sexta"
  timeSlot:  "seg-fund|manha|1",  // formato: segmentId|turno|aulaIdx (1-indexed)
  turma:     "6º Ano A",     // label da turma (ou nome de sharedSeries como "FORMAÇÃO")
  subjectId: "subj-bio"      // FK → subjects[].id (ou activities[].id em sharedSeries)
}
```

**O campo `timeSlot`** é a chave de serialização do sistema. O formato `segmentId|turno|aulaIdx` permite derivar horário de início/fim em tempo de execução via `resolveSlot(timeSlot, periodConfigs)` em `periods.js`, sem armazenar horários redundantes no banco.

---

### `absences/` — Faltas

Uma ausência agrupa múltiplos **slots** (aulas) de uma mesma ocorrência.

```js
{
  id:        "ab7r3n2",
  teacherId: "lv9k2a7",      // FK → teachers[].id (professor ausente)
  createdAt: "2026-04-14T10:30:00.000Z",
  status:    "open",         // "open" | "partial" | "covered"

  slots: [
    {
      id:           "sl2x8k1",
      date:         "2026-04-14",      // ISO date string (dia específico da falta)
      day:          "Segunda",
      timeSlot:     "seg-fund|manha|1",
      scheduleId:   "mx3p9q1",        // FK → schedules[].id (null se slot extra)
      subjectId:    "subj-bio",       // FK → subjects[].id (null se extra)
      turma:        "6º Ano A",
      substituteId: null              // FK → teachers[].id (null = sem substituto)
    }
  ]
}
```

**Cálculo de `status`** é centralizado em `_calcStatus(slots)` dentro de `absences.js`:
- `covered` → todos os slots têm `substituteId !== null`
- `partial` → alguns têm, outros não
- `open` → nenhum slot tem substituto

---

### `history/` — Histórico de Substituições

Registros imutáveis. Nunca são editados após criação.

```js
{
  id:           "hy1z9m4",
  teacherId:    "lv9k2a7",         // professor que foi substituído
  subId:        "lv9k2a7-outro",   // professor que fez a substituição
  date:         "2026-04-14",
  day:          "Segunda",
  slotLabel:    "1ª Aula (07:00–07:50)",
  registeredAt: "2026-04-14T11:00:00.000Z"
}
```

---

### `pending_teachers/` — Solicitações de Acesso

Document ID = `user.uid` do Firebase Auth. Isso permite o listener de aprovação individual: `onSnapshot(doc(db, 'pending_teachers', user.uid), ...)`.

```js
{
  id:          "firebase-uid-abc123",
  uid:         "firebase-uid-abc123",
  email:       "joao@escola.sp.gov.br",
  name:        "João Silva",
  photoURL:    "https://...",
  requestedAt: Timestamp,
  status:      "pending",      // "pending" | "approved"
  celular:     "11988887777",  // preenchido na PendingPage
  apelido:     "João",
  subjectIds:  ["subj-bio"]
}
```

---

### `admins/` — Administradores Dinâmicos

Document ID = email sanitizado via `email.replace(/[.#$/[\]]/g, '_')`. Complementa a lista `HARDCODED_ADMINS` em `db.js`. Um usuário é admin se seu email está na lista hardcoded **ou** se existe um documento nesta coleção.

```js
{
  email:   "novo.admin@escola.sp.gov.br",
  name:    "Novo Admin",
  addedAt: Timestamp
}
```

> **Atenção — débito técnico:** Os emails em `HARDCODED_ADMINS` requerem deploy para alteração. O objetivo é migrar para usar exclusivamente a coleção `admins/`.

---

### `pending_actions/` — Aprovação de Coordenadores

Ações submetidas por coordenadores que aguardam aprovação do admin antes de serem executadas.

```js
{
  id:               "pa9x2k7",
  coordinatorId:    "lv9k2a7",          // FK → teachers[].id
  coordinatorName:  "Maria Coord",
  action:           "addClassToGrade",  // nome da action do useAppStore
  payload:          { segId, gradeName, letter },  // argumentos originais
  summary:          "Adicionar 6º Ano C (manhã)",  // texto legível para o admin
  createdAt:        Timestamp,
  status:           "pending",          // "pending" | "approved" | "rejected"
  reviewedBy:       null,               // email do admin revisor
  reviewedAt:       null,
  rejectionReason:  null
}
```

---

## 5. Gerenciamento de Estado — Zustand

### Arquitetura dos dois stores

```
┌──────────────────────────────────────────────────────────────────┐
│  useAuthStore                  useAppStore                       │
│  ──────────────────            ──────────────────────────────    │
│  user (FirebaseUser)           segments, periodConfigs           │
│  role (string)                 areas, subjects, sharedSeries     │
│  teacher (Teacher|null)        workloadWarn, workloadDanger      │
│  loading (bool)                                                  │
│  pendingCt (number)            teachers, schedules               │
│                                absences, history                 │
│  login() logout()              loaded, teachersLoaded, ...       │
│  isAdmin() isCoordinator()                                       │
│  isTeacher() isPending()       hydrate() save()                  │
│  isGeneralCoordinator()        addTeacher() updateTeacher()      │
│  isTeacherCoordinator()        addSchedule() removeSchedule()    │
│                                createAbsence() assignSub()       │
└──────────────────────────────────────────────────────────────────┘
              ▲                           ▲
              │ usa getState().teachers   │ usa isCoordinator()
              └───────────────────────────┘
              (comunicação síncrona entre stores, sem dependência circular)
```

---

### `useAuthStore` — Estado de Autenticação

```js
{
  user:           null,    // Firebase User object (ou null)
  role:           null,    // 'admin'|'coordinator'|'teacher-coordinator'|'teacher'|'pending'|null
  teacher:        null,    // documento teachers[] do usuário logado (null para admins puros)
  loading:        true,    // true até onAuthStateChanged resolver
  pendingCt:      0,       // badge de solicitações pendentes (só admin vê)
  _unsubPending:  null,    // unsub do listener pending_teachers (só admin)
  _unsubApproval: null,    // unsub do listener pending_teachers/{uid} (só pending)
}
```

**Helpers de role — usados em guards de rota e renderização condicional:**

| Método | Retorna `true` quando | Uso típico |
|---|---|---|
| `isAdmin()` | `role === 'admin'` | Abas de configuração, gestão de professores |
| `isTeacher()` | `role === 'teacher'` | Redirecionamento para `/home`, grade pessoal |
| `isPending()` | `role === 'pending'` | Renderiza `<PendingPage>` em vez das rotas |
| `isCoordinator()` | `role === 'coordinator'` **ou** `'teacher-coordinator'` | Acesso ao dashboard, interceptação de actions |
| `isGeneralCoordinator()` | `role === 'coordinator'` (puro) | Verificações onde coord. puro não leciona |
| `isTeacherCoordinator()` | `role === 'teacher-coordinator'` | Acesso à grade pessoal + dashboard |

---

### `useAppStore` — Estado Central da Escola

O store central contém **45+ actions**. Sua estrutura de estado:

```js
{
  // ─── Configuração (persistida em meta/config) ───────────────────────────
  segments:       [],       // árvore: segmento → série → turma
  periodConfigs:  {},       // config de períodos por segmentId/turno
  areas:          [],       // áreas de conhecimento
  subjects:       [],       // disciplinas (filhos de areas)
  sharedSeries:   [],       // turmas de formação compartilhada
  workloadWarn:   20,       // limite de alerta de carga horária (amarelo)
  workloadDanger: 26,       // limite crítico de carga (vermelho)

  // ─── Dados operacionais (coleções Firestore separadas) ──────────────────
  teachers:  [],
  schedules: [],
  absences:  [],            // lazy: só carregado quando AbsencesPage abre
  history:   [],            // lazy: só carregado quando necessário

  // ─── Flags de carregamento ───────────────────────────────────────────────
  loaded:          false,   // true após hydrate() inicial
  teachersLoaded:  false,
  schedulesLoaded: false,
  absencesLoaded:  false,
  historyLoaded:   false,
}
```

---

### Como o `hydrate()` funciona

`hydrate(data)` é a **única porta de entrada** para popular o store a partir de dados externos. Ele é chamado em dois contextos distintos:

**Contexto 1 — Inicialização (chamada única):**
```
App.jsx useEffect
  └── loadFromFirestore() → retorna dados (do Firestore ou cache LS)
        └── store.hydrate(data) → popula todos os campos, seta loaded = true
```

**Contexto 2 — Sincronização em tempo real (chamada contínua):**
```js
// db.js — listener permanente após inicialização
onSnapshot(doc(db, 'meta', 'config'), snap => {
  if (snap.exists()) {
    store.hydrate({
      segments:      snap.data().segments,
      periodConfigs: snap.data().periodConfigs,
      areas:         snap.data().areas,
      subjects:      snap.data().subjects,
      sharedSeries:  snap.data().sharedSeries ?? [],
      workloadWarn:  snap.data().workloadWarn,
      workloadDanger:snap.data().workloadDanger,
    })
  }
})
```

**Efeito prático:** Quando um admin adiciona uma turma nova em `meta/config`, **todos os usuários ativos** recebem a atualização em milissegundos via `onSnapshot → hydrate()`, sem reload de página.

**Dados com lazy loading:** `absences` e `history` seguem um fluxo diferente — são carregados sob demanda pela primeira página que os acessa via `loadAbsencesIfNeeded()` / `loadHistoryIfNeeded()`. Só então registram seu próprio listener `onSnapshot`.

---

### Padrão de mutação imutável

Toda action que modifica o store segue o mesmo padrão em dois passos:

```js
// 1. Mutação imutável via set() — sem mutar o objeto original
set(s => ({
  teachers: s.teachers.map(t =>
    t.id === id ? { ...t, ...changes } : t
  )
}))

// 2. Persistência granular no Firestore
updateDocById('teachers', id, changes)   // melhor: só os campos alterados
// OU
saveDoc('teachers', newTeacher)          // para inserts
// OU
deleteDocById('teachers', id)            // para remoções
// OU
saveConfig(get())                        // exclusivo para meta/config
```

Nunca use `get().save()` (sincronização completa via `writeBatch`) para mutações pontuais. Ele existe apenas como fallback de recuperação. Prefira sempre as funções granulares.

---

## 6. Sistema de Permissões (RBAC)

### As cinco roles

| Role | Quem é | Como é atribuído | Pode editar escola? |
|---|---|---|:---:|
| `admin` | Administrador escolar | Email em `HARDCODED_ADMINS` ou coleção `admins/` | ✅ Sim |
| `coordinator` | Coordenador pedagógico puro | `teacher.profile === 'coordinator'` | 🔶 Com aprovação |
| `teacher-coordinator` | Professor que também coordena | `teacher.profile === 'teacher-coordinator'` | 🔶 Com aprovação |
| `teacher` | Professor regular | `teacher.profile === 'teacher'` (default) | ❌ Não |
| `pending` | Usuário recém-logado sem cadastro | Sem `teachers/` com `status: 'approved'` | ❌ Não |

### Matriz de acesso por rota

| Rota | admin | coordinator | teacher-coordinator | teacher | pending |
|---|:---:|:---:|:---:|:---:|:---:|
| `/dashboard` | ✅ completo | ✅ completo | ✅ completo | ✅ resumo | ❌ |
| `/calendar` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `/calendar/day` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `/absences` | ✅ todas | ✅ todas | ✅ todas | ✅ próprias | ❌ |
| `/substitutions` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `/schedule` | ✅ qualquer | ❌ | ✅ própria | ✅ própria | ❌ |
| `/school-schedule` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `/settings` | ✅ 8 abas | ✅ perfil + histórico | ✅ perfil + histórico | ✅ só perfil | ❌ |
| `/workload` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `/home` | ❌ | ❌ | ❌ | ✅ | ❌ |
| Redirecionamento | → `/dashboard` | → `/dashboard` | → `/dashboard` | → `/home` | → `<PendingPage>` |

> **Implementação:** As rotas não têm `PrivateRoute` ou guards individuais. O controle é feito por (1) redirect inicial em `App.jsx` baseado no role e (2) renderização condicional **dentro** das páginas verificando `isAdmin()`, `isCoordinator()`, etc.

---

### O workflow de aprovação de coordenadores

Coordenadores têm leitura total, mas **20 actions de escrita são interceptadas** antes de tocar o Firestore:

```
Coordenador clica "Adicionar Turma"
      │
      ▼
store.addClassToGrade(segId, gradeName, letter)
      │
      ├─ _isCoordinator() === false? ──► executa action normalmente (admin path)
      │
      └─ _isCoordinator() === true?
              │
              ▼
       _submitApproval('addClassToGrade', { segId, gradeName, letter }, summary)
              │
              ▼
       submitPendingAction() → grava em pending_actions/ { status: 'pending' }
              │
              ▼
       toast('Solicitação enviada para aprovação do ADM', 'warn')
              │
              ▼
       PARA AQUI — a turma NÃO é adicionada imediatamente
```

```
Admin abre Settings → aba "Solicitações"
      │
      ▼
Lista pending_actions onde status === 'pending'
      │
      ├─ Admin clica "Rejeitar" ──► status: 'rejected' + motivo salvo
      │
      └─ Admin clica "Aprovar"
              │
              ▼
       approvePendingAction(id, adminEmail)
              │
              ▼
       status: 'approved' + re-executa a action original com o payload salvo
              │
              ▼
       A turma é criada de fato no store e no Firestore
```

**Actions guardadas (interceptadas para coordenadores):**

```
addTeacher            updateTeacher         removeTeacher
addSchedule           updateSchedule        removeSchedule
addSegment            removeSegment
addGrade              removeGrade
addClassToGrade       removeClassFromGrade
savePeriodCfg
addArea               updateArea            removeArea
addSubject            removeSubject         saveAreaWithSubjects
setWorkload
```

### Regra especial: coordenadores na grade horária

Em `addSchedule`, existe validação adicional: se o professor-alvo tem `profile === 'coordinator'`, apenas turmas pertencentes a `sharedSeries` (ex: "FORMAÇÃO") são permitidas. Coordenadores puros não ministram aulas regulares na grade.

---

## 7. Fluxo de Inicialização e Autenticação

```
App.jsx monta no DOM
      │
      ├── useEffect #1 (executa imediatamente)
      │       │
      │       └── loadFromFirestore()
      │               │
      │               ├─ Cache LS válido (< 1h)?
      │               │       └─ SIM → retorna data do cache (sem Firestore)
      │               │
      │               ├─ Cache expirado ou ausente?
      │               │       └─ Promise.all([config, teachers, schedules, absences, history])
      │               │               │
      │               │               ├─ SUCESSO → retorna dados frescos
      │               │               └─ ERRO (offline/quota) → usa cache LS (mesmo expirado) ou {}
      │               │
      │               └── hydrate(data) → store.loaded = true
      │                       └── setupRealtimeListeners()
      │                               ├── onSnapshot(meta/config) → hydrate() a cada mudança
      │                               ├── onSnapshot(teachers/)   → setTeachers() a cada mudança
      │                               └── onSnapshot(schedules/)  → setSchedules() a cada mudança
      │
      ├── useEffect #2 (aguarda loaded === true)
      │       └── useAuthStore.init(teachers)
      │               └── onAuthStateChanged(auth, user => ...)
      │                       │
      │                       ├─ user === null
      │                       │       └── set({ loading: false }) → renderiza <LoginPage>
      │                       │
      │                       └─ user existe → _resolveRole(user, teachers)
      │                               │
      │                               ├─ isAdmin(email)?
      │                               │       ├── role = 'admin'
      │                               │       └── inicia onSnapshot(pending_teachers where status=='pending')
      │                               │           → mantém badge de contagem atualizado
      │                               │
      │                               ├─ getTeacherByEmail(email) + status==='approved'?
      │                               │       ├── profile === 'coordinator'         → role = 'coordinator'
      │                               │       ├── profile === 'teacher-coordinator' → role = 'teacher-coordinator'
      │                               │       └── else                              → role = 'teacher'
      │                               │
      │                               └─ else (não encontrado ou não aprovado)
      │                                       ├── role = 'pending'
      │                                       ├── requestTeacherAccess(user) → grava pending_teachers/{uid}
      │                                       └── inicia onSnapshot(pending_teachers/{uid})
      │                                           → detecta aprovação do admin em tempo real
      │
      └── Renderização condicional final em App.jsx:
              loading || !loaded  → <Spinner>
              !role               → <LoginPage>
              role === 'pending'  → <PendingPage>
              else                → <Layout> + <Routes>
```

**Login:** `signInWithPopup(auth, GoogleAuthProvider)` abre popup do Google. O `onAuthStateChanged` detecta automaticamente após o login, sem nenhum redirecionamento manual.

**Logout:** `signOut(auth)` + cancela **todos** os listeners ativos (`_unsubPending`, `_unsubApproval`, `absencesUnsubscribe`, `historyUnsubscribe`) para evitar memory leaks.

---

## 8. Fluxos Críticos de Código

### 8.1 Sincronização: Cache de 1 Hora e Fallback Local

O mecanismo de cache está inteiramente em `src/lib/db.js`:

```
loadFromFirestore() é chamado na inicialização
        │
        ▼
_loadFromLS()
  └── lê 'gestao_v7_cache' do localStorage
        │
        ├─ cache existe E (Date.now() - timestamp) < 3_600_000 ms (1h)?
        │       └── retorna cache.data imediatamente
        │           log: "[db] Usando cache LS (válido por Xmin)"
        │
        └─ cache expirado ou inexistente?
                │
                ▼
        Promise.all([
          _loadConfig(),         // getDocs(meta/config)
          _loadCol('teachers'),  // getDocs(teachers/)
          _loadCol('schedules'), // getDocs(schedules/)
          _loadCol('absences'),  // getDocs(absences/)
          _loadCol('history')    // getDocs(history/)
        ])
                │
                ├─ SUCESSO → retorna dados frescos
                │           (LS será atualizado no próximo save())
                │
                └─ ERRO (offline / quota excedida / regras)
                        └── usa cached.data (mesmo expirado)
                            ou {} se não há cache algum
```

**Objeto armazenado no LocalStorage:**

```js
// chave: 'gestao_v7_cache'
{
  data: {
    segments, periodConfigs, areas, subjects, sharedSeries,
    teachers, schedules, absences, history,
    workloadWarn, workloadDanger
  },
  timestamp: 1713100000000  // Date.now() no momento do save
}
```

O LS é **sempre** gravado junto com o Firestore a cada `save()` via `_saveToLS(state)`. Isso garante que o cache reflete sempre o último estado persistido com sucesso.

---

### 8.2 Relatórios: PDFs via `window.print()`

`src/lib/reports.js` não depende de nenhuma biblioteca externa (sem Puppeteer, jsPDF, html2canvas). A estratégia é gerar HTML puro e usar o diálogo de impressão nativo do browser:

```
Usuário clica "Exportar PDF"
        │
        ▼
generateXxxHTML(dados, store)
        │
        └── Constrói string HTML completa com:
              _css()      → estilos inline (font, table, cores, @media print)
              _wrap()     → estrutura: header + body + footer com timestamp
              _slotRow()  → linhas de tabela específicas do relatório
        │
        ▼
openPDF(html)
        │
        ├── win = window.open('', '_blank')    → nova aba em branco
        ├── win.document.write(html)           → injeta HTML gerado
        ├── win.document.close()
        └── setTimeout(() => win.print(), 500) → aguarda renderização, abre diálogo
```

O CSS inclui `@media print { ... }` que remove sombras, controla quebras de página e ajusta padding para impressão. O usuário escolhe "Salvar como PDF" no diálogo do browser.

**Funções exportadas:**

| Função | Relatório gerado |
|---|---|
| `generateDayHTML(date, store)` | Ausências de um dia específico |
| `generateTeacherHTML(teacherId, store)` | Ausências de um professor com grade |
| `generateByDayHTML(month, year, store)` | Agrupado por dia no mês |
| `generateByWeekHTML(month, year, store)` | Agrupado por semana |
| `generateByMonthHTML(month, year, store)` | Consolidado mensal |

---

### 8.3 Substituições: Algoritmo de Ranking de Candidatos

`rankCandidates()` em `src/lib/absences.js` retorna os professores disponíveis ordenados por compatibilidade com a aula ausente:

```
Para cada professor aprovado (exceto o ausente e coordenadores puros):
        │
        ├─ isBusy(professor, date, timeSlot)?
        │       └─ SIM → descarta (conflito de horário)
        │
        └─ calcScore(professor, absentTeacher, timeSlot):
                │
                ├─ score 0: mesma matéria + mesmo segmento  ← MELHOR
                ├─ score 1: mesma matéria + outro segmento
                ├─ score 2: mesma área   + mesmo segmento
                ├─ score 3: mesma área   + outro segmento
                └─ score 4: outra área                      ← PIOR
                │
                └─ Desempate (mesmo score):
                        monthlyLoad(professor, date) → menor carga vence
```

**`isBusy(teacherId, date, timeSlot, ...)`** verifica dois tipos de conflito:
1. Professor tem aula regular (`schedules`) no mesmo `day` + `timeSlot`.
2. Professor já é substituto designado (`absences[].slots[].substituteId`) na mesma `date` + `timeSlot`.

**`monthlyLoad(teacherId, referenceDate, ...)`** soma:
- Aulas regulares do professor de `monthStart` até `referenceDate` (via `businessDaysBetween`).
- Substituições realizadas no mês (slots onde `substituteId === teacherId`).

O resultado é o número total de aulas/substituições no mês — base para os badges `workloadWarn` e `workloadDanger`.

**`suggestSubstitutes(slot, ruleType, store)`** — versão simplificada para pills de sugestão rápida:

| Modo | Estratégia | Quando usar |
|---|---|---|
| `qualitative` | Prioriza compatibilidade de matéria/área (score 0→4), desempata por carga | Encontrar o substituto mais adequado pedagogicamente |
| `quantitative` | Ignora compatibilidade, ordena apenas por menor carga mensal | Distribuir carga de forma equitativa |

Ambos retornam os **top 3 candidatos** disponíveis.

---

## 9. Roteamento

```
/                 → redirect /dashboard (admin/coordinator) ou /home (teacher)
/home             → HomePage              — professor
/dashboard        → DashboardPage         — todos (conteúdo diferenciado por role)
/calendar         → CalendarPage          — admin + coordinator
/calendar/day     → CalendarDayPage       — mobile (requer location.state com dados de contexto)
/absences         → AbsencesPage          — todos
/substitutions    → SubstitutionsPage     — todos
/schedule         → SchedulePage          — admin + teacher (grade individual)
/school-schedule  → SchoolSchedulePage    — admin + coordinator
/settings         → SettingsPage          — todos (abas diferenciadas por role)
/workload         → WorkloadPage          — admin + coordinator
*                 → redirect /dashboard ou /home
```

**Guard global em `App.jsx`:**
```js
const canAccessAdmin = isAdmin || isCoordinator()
// Determina redirect inicial e visibilidade de links no Navbar
```

**Passagem de estado entre rotas** — sem query params, usa `location.state`:
```js
// Navegar com contexto
navigate('/calendar/day', {
  state: { teacherId, segId, weekDates, todayISO }
})

// Consumir na rota destino
const { teacherId, segId } = useLocation().state ?? {}
```

**Seleção de tab via query param:**
```js
// Ex: /settings?tab=teachers
const tab = new URLSearchParams(useLocation().search).get('tab') ?? 'profile'
```

---

## 10. Páginas e suas Responsabilidades

| Página | Roles com acesso | Responsabilidade principal |
|---|---|---|
| `LoginPage` | — (não logado) | Botão "Entrar com Google", sem lógica de negócio |
| `PendingPage` | `pending` | Mensagem de espera + formulário (telefone/apelido/matérias) + listener de aprovação automática via `onSnapshot` |
| `HomePage` | `teacher` | Saudação personalizada + stats do mês (faltas, subs) + action cards de acesso rápido |
| `DashboardPage` | todos | Admin/coord: alertas de carga, stats globais, tabela de carga por professor; Teacher: resumo pessoal |
| `CalendarPage` | admin, coordinator | Calendário semanal interativo: grade de ausências, ranking de substitutos, modal de slot |
| `CalendarDayPage` | admin, coordinator | Versão mobile: pills de dias, cards colapsáveis por período (requer `location.state`) |
| `AbsencesPage` | todos | 4 abas: por professor / por dia / por semana / por mês + export PDF por aba |
| `SubstitutionsPage` | todos | 5 abas de relatório + ranking de substitutos + export PDF |
| `SchedulePage` | admin, teacher | Grade horária individual com CRUD de aulas (modal de adição/edição) + export PDF |
| `SchoolSchedulePage` | admin, coordinator | Grade horária geral com filtros por segmento/turno + export PDF |
| `SettingsPage` | todos | **Admin:** 8 abas (Segmentos, Períodos, Áreas, Professores, Turmas, Formação, Admins, Solicitações). **Coordinator/Teacher-Coord:** perfil + histórico de solicitações. **Teacher:** somente perfil |
| `WorkloadPage` | admin, coordinator | Tabela: aulas/semana, faltas e substituições por professor com badges de carga |

**Convenção de componentes internos:** componentes usados exclusivamente em uma página são definidos no mesmo arquivo, acima do `export default`, sem `export`. Não criar arquivos separados para componentes de uso único.

---

## 11. Lógica de Negócio (`src/lib/`)

### Estrutura Modular

`src/lib/` é organizado em subpastas temáticas. Cada subpasta tem um `index.js` que
re-exporta seletivamente seus membros públicos. O arquivo `src/lib/index.js` agrega
todos os módulos como ponto de entrada único — facilitando imports em partes do código
que precisam de múltiplos domínios.

**Padrão de importação granular vs monolítico:**

```javascript
// Evitar — importa todo o namespace do módulo
import { formatISO, uid } from '../lib'

// Preferir — import granular, favorece tree-shaking
import { formatISO } from '../lib/helpers/dates'
import { uid } from '../lib/helpers/ids'

// Aceitável — quando precisa de múltiplas funções de domínios distintos
import { uid, formatISO, colorOfTeacher } from '../lib/helpers'
```

**Quando usar cada forma:**

| Situação | Import recomendado |
|---|---|
| 1 função de 1 sub-módulo específico | `from '../lib/helpers/dates'` |
| 2–3 funções do mesmo domínio | `from '../lib/helpers'` |
| Funções de vários domínios | `from '../lib'` (agregador) |
| Reports em handlers de export | `await import('../lib/reports')` (dynamic) |

---

### `periods/` — Geração e Serialização de Períodos

O sistema **não armazena horários fixos**. Em vez disso, deriva os horários em tempo de execução a partir da configuração em `periodConfigs`.

```
getCfg(segmentId, turno, periodConfigs)
    → { inicio, duracao, qtd, intervalos, inicioPeriodo?, fimPeriodo?, gradeEspecial? }
      (campos opcionais ficam undefined em configs antigas — sem erro)

gerarPeriodos(cfg)
    → [ { aulaIdx, label, inicio, fim, isIntervalo }, ... ]
      (inclui intervalos como entradas com isIntervalo: true)

getAulas(segId, turno, periodConfigs)
    → filtra isIntervalo === false → só as aulas "reais"

makeSlot(segId, turno, aulaIdx)        →  "seg-fund|manha|3"
makeEspecialSlot(segId, turno, idx)    →  "seg-fund|manha|e1"

parseSlot("seg-fund|manha|3")          →  { segmentId, turno, aulaIdx: 3 }
parseSlot("seg-fund|manha|e1")         →  { segmentId, turno, aulaIdx: "e1", isEspecial: true }

resolveSlot(timeSlot, periodConfigs)   →  { label: "3ª Aula", inicio: "08:40", fim: "09:30" }
                                          (retorna null para slots especiais — sem erro)
slotLabel(timeSlot, periodConfigs)     →  "3ª Aula"
slotFullLabel(timeSlot, periodConfigs) →  "3ª Aula (08:40–09:30)"

gerarPeriodosEspeciais(cfg)
    → [ { label, inicio, fim, isEspecial: true, isIntervalo }, ... ]
      derivado de cfg.gradeEspecial.itens ordenados por ordem
      retorna [] se gradeEspecial ausente ou itens vazio
```

**Formato dos timeSlots especiais:** `"segmentId|turno|e{idx}"` onde `idx` é 1-based e conta apenas os itens do tipo `"aula"` dentro de `gradeEspecial.itens` (intervalos não são contados na indexação).

---

### `helpers/` — Utilitários Gerais (organizado por categoria)

| Sub-módulo | Função | Descrição |
|---|---|---|
| `helpers/ids` | `uid()` | `Date.now().toString(36) + random(5 chars)` — **sempre usar, nunca usar index de array** |
| `helpers/colors` | `colorOfTeacher(teacher, store)` | Cor baseada na 1ª matéria do professor via `COLOR_PALETTE[area.colorIdx]` |
| `helpers/turmas` | `allTurmaObjects(segments)` | Flatten de `segments → grades → classes` em lista plana com metadata de contexto |
| `helpers/dates` | `formatISO(d)` | `Date → "YYYY-MM-DD"` |
| `helpers/dates` | `formatBR(s)` | `"YYYY-MM-DD" → "DD/MM/YYYY"` |
| `helpers/dates` | `parseDate(s)` | `"YYYY-MM-DD" → Date` (sem UTC shift — usa construtor local para evitar off-by-one) |
| `helpers/dates` | `dateToDayLabel(s)` | `"2026-04-14" → "Segunda"` (retorna `null` para fins de semana) |
| `helpers/dates` | `weekStart(s)` | Retorna a segunda-feira da semana da data informada |
| `helpers/dates` | `businessDaysBetween(from, to)` | Array de datas ISO de dias úteis (Seg–Sex) entre dois intervalos |
| `helpers/turmas` | `isFormationSlot(timeSlot, store)` | Retorna `true` se slot pertence a turma de formação (sem substituto) |
| `helpers/permissions` | `canEditTeacher(viewer, target)` | Verifica se o usuário viewer pode editar o perfil de target |

---

### `absences/` — Lógica de Ausências (organizado por responsabilidade)

Todas as funções são **puras** (recebem dados, retornam dados, sem side-effects). O `useAppStore` importa e usa os resultados para atualizar o estado.

**`absences/mutations`** — operações de estado:

| Função | Descrição |
|---|---|
| `createAbsence(teacherId, rawSlots, absences)` | Cria novo objeto ausência com slots serializados e IDs gerados |
| `assignSubstitute(absenceId, slotId, subId, absences)` | Atualiza `substituteId` e recalcula `status` |
| `deleteAbsenceSlot(absenceId, slotId, absences)` | Remove slot; deleta ausência inteira se ficar vazia |
| `deleteAbsence(id, absences)` | Remove ausência inteira |
| `absencesOf(teacherId, absences)` | Ausências de um professor, ordenadas por data desc |
| `absenceSlotsInWeek(weekStart, absences)` | Todos os slots de ausência numa semana específica |

**`absences/validation`** — verificações de disponibilidade:

| Função | Descrição |
|---|---|
| `isBusy(teacherId, date, timeSlot, ...)` | Detecta conflito de horário (aula ou substituição existente) |
| `isAvailableBySchedule(teacher, day, timeSlot)` | Verifica horariosSemana do professor |
| `weeklyLimitStatus(teacherId, weekStart, store)` | Retorna status de limite semanal de substituições |

**`absences/ranking`** — seleção de substitutos:

| Função | Descrição |
|---|---|
| `rankCandidates(...)` | Ver seção 8.3 — retorna lista ordenada de candidatos |
| `suggestSubstitutes(slot, ruleType, store)` | Top 3 sugestões rápidas para pills |
| `monthlyLoad(teacherId, referenceDate, ...)` | Carga total do mês: aulas regulares + substituições |

---

### `reports/` — Geração de PDFs

Ver seção 8.2. **Este módulo é carregado via dynamic import** — nunca importar estaticamente em componentes de página (o chunk reports só deve ser baixado quando o usuário clica em "Exportar").

```javascript
// Em AbsencesPage, SchedulePage, SubstitutionsPage
const handleExport = async () => {
  const { openPDF, generateByDayHTML } = await import('../lib/reports')
  const html = generateByDayHTML(month, year, store)
  openPDF(html)
}
```

Nunca importar `openPDF` direto em componentes sem chamar primeiro um `generateXxxHTML` — a função `openPDF` espera HTML completo com doctype.

---

### `db/` — Toda I/O com Firebase

Ver seções 4 (modelo de dados) e 8.1 (cache). Organizado internamente em 4 arquivos:

- `db/config.js` — `saveConfig()`: setDoc atômico para `meta/config`
- `db/cache.js` — `_saveToLS()` / `_loadFromLS()`: gestão do cache `gestao_v7_cache`
- `db/listeners.js` — listeners em tempo real (onSnapshot para config, teachers, schedules)
- `db/index.js` — todas as funções exportadas publicamente

Funções exportadas por categoria:

| Categoria | Funções |
|---|---|
| Carregamento inicial | `loadFromFirestore()` |
| Listeners em tempo real | `setupRealtimeListeners(store)`, `registerAbsencesListener(store)`, `registerHistoryListener(store)` |
| Persistência granular | `saveDoc(col, item)`, `updateDocById(col, id, changes)`, `deleteDocById(col, id)` |
| Configuração | `saveConfig(state)` → `setDoc(meta/config, ...)` atômico |
| Cache LS | `_saveToLS(state)` — chamado internamente pelo `save()` |
| Admins | `isAdmin(email)`, `addAdmin(email, name)`, `listAdmins()`, `removeAdmin(email)` |
| Professores | `getTeacherByEmail(email, teachers)`, `patchTeacherSelf(id, changes)` |
| Acesso pendente | `requestTeacherAccess(user)`, `listPendingTeachers()`, `approveTeacher(...)`, `rejectTeacher(...)` |
| Pending actions | `submitPendingAction(...)`, `getPendingActions()`, `getMyPendingActions(coordId)`, `approvePendingAction(id, admin)`, `rejectPendingAction(id, admin, reason)`, `subscribePendingActionsCount(cb)` |

---

## 12. Padrões de UI e Componentização

### Tokens Tailwind Customizados

Definidos em `tailwind.config.js` como extensões do tema padrão. Usar **sempre** os tokens em vez de valores arbitrários:

| Token | Hex | Uso semântico |
|---|---|---|
| `navy` | `#1A1814` | Navbar, botões primários, texto de maior hierarquia |
| `accent` | `#C05621` | CTAs, badge de alerta, cor de marca |
| `accent-l` | `#FFF7ED` | Background suave de destaque (hover, highlight) |
| `surf` | `#FFFFFF` | Cards, modais, superfícies elevadas |
| `surf2` | `#F4F2EE` | Backgrounds secundários, estados de hover |
| `bg` | `#F7F6F2` | Background de página (corpo) |
| `bdr` | `#E5E2D9` | Bordas de separadores e inputs |
| `t1` | `#1A1814` | Texto primário (títulos, labels de formulário) |
| `t2` | `#6B6760` | Texto secundário (descrições, metadados) |
| `t3` | `#A09D97` | Texto terciário (placeholders, datas, rodapés) |
| `ok` / `ok-l` | verde / verde claro | Sucesso, cobertura completa, aprovado |
| `err` / `err-l` | vermelho / vermelho claro | Erro, ausência sem substituto, rejeitado |
| `warn` | âmbar | Alerta de carga, cobertura parcial, pendente |

**Tipografia:** `font-sans` (Figtree) para UI, `font-mono` (DM Mono) para valores numéricos e IDs.

### Classes Utilitárias (`index.css`)

Definidas via `@layer components` com `@apply`. Usar **sempre** essas classes antes de criar estilos inline:

| Classe | Composição semântica |
|---|---|
| `btn` | Base: padding, radius `rounded-lg`, transition, focus ring |
| `btn-dark` | `btn` + bg `navy` + texto branco + hover mais claro |
| `btn-ghost` | `btn` + bg transparente + borda `bdr` |
| `btn-danger` | `btn` + bg `err` + texto branco |
| `btn-sm` / `btn-xs` | Variantes menores de qualquer `btn-*` |
| `inp` | Input/select: borda `bdr`, focus ring `accent`, padding padrão |
| `card` | Fundo `surf`, borda `bdr`, `rounded-xl`, sombra suave |
| `lbl` | `text-xs font-semibold text-t2 uppercase tracking-wide` |
| `badge` | Inline tag com padding mínimo e border-radius |
| `scroll-thin` | Scrollbar fina estilizada (webkit) |

### Componentes Compartilhados (`src/components/`)

| Componente | Props principais | Comportamento |
|---|---|---|
| `Modal` | `open`, `onClose`, `title`, `size` | Overlay fixed z-200; fecha com Escape e click no backdrop; scroll interno com `scroll-thin`; tamanhos: `sm` / `md` / `2xl` / `4xl` |
| `ActionCard` | `icon`, `label`, `desc`, `onClick`, `variant` | Card clicável com chevron à direita; `variant="primary"` usa fundo navy com texto branco |
| `Toast` | — | Conectado ao `useToastStore`; fixed bottom-center; auto-dismiss após 3000ms; tipos: `ok` / `warn` / `err` |
| `Spinner` | `size` | `animate-spin` com tamanho customizável (`sm`, `md`, `lg`) |
| `Navbar` | — | Desktop: tabs horizontais filtradas por role; Mobile: ícone hamburger com overlay e menu lateral deslizante |
| `Layout` | — | `<Navbar>` + `<Outlet>` centralizado com `max-w-screen-xl` |
| `SuggestionPills` | `candidates`, `onSelect` | Exibe top 3 candidatos com badge de score e carga mensal; click atribui substituto |
| `ToggleRuleButtons` | `rule`, `onChange` | Toggle entre modo `qualitative` / `quantitative` de ranking |
| `KPICards` | `teachers`, `schedules`, `absences` | Grid 2×4 com 4 KPIs globais (professores, aulas/semana, faltas totais, sem substituto); card 4 usa `bg-err-l text-err` quando há slots descobertos, `bg-ok-l text-ok` quando todos cobertos; sem acesso a store |

### Responsividade

Mobile-first com breakpoints padrão Tailwind:
- `md:` → 768px (tablet)
- `lg:` → 1024px (desktop)

**Detecção de mobile em código:** `window.innerWidth < 1024` — usado em `CalendarPage` para decidir entre renderizar o modal inline (desktop) ou navegar para `CalendarDayPage` (mobile). Não usar `useMediaQuery` — a detecção é pontual e não precisa ser reativa.

---

## 13. Convenções de Código

| Aspecto | Convenção | Motivo |
|---|---|---|
| **IDs** | Sempre `uid()` de `helpers/ids` — nunca `Date.now()` puro ou index de array | Colisão improvável em inserts paralelos ou offline |
| **Mutações de estado** | `set(s => { ... })` imutável + persistência granular ao final | Zustand requer imutabilidade; evita re-renders em cascata |
| **Componentes de uso único** | Definidos no mesmo arquivo da página, sem `export` | Evita proliferação de arquivos; contexto co-localizado |
| **Callbacks de evento** | Prefixo `handle` — `handleSave`, `handleMarkAbsent` | Consistência e legibilidade em toda a base |
| **Props de fechar modal** | Sempre `onClose` | Padronizado em todos os modais |
| **Estado entre rotas** | `location.state` via React Router | Evita query params complexos para objetos com múltiplos campos |
| **Detecção de mobile** | `window.innerWidth < 1024` | Padrão do projeto — não usar `useMediaQuery` |
| **Toast** | `import { toast } from '../hooks/useToast'` + `toast('msg', 'ok'/'warn'/'err')` | Importar sempre o helper, não o store diretamente |
| **Nomes de arquivos** | Páginas/Componentes: `PascalCase.jsx` / Libs/Hooks: `camelCase.js` | Distinção visual imediata do tipo de arquivo |
| **Persistência de config** | Chamar `saveConfig(get())` após mutações em `segments`, `areas`, `subjects`, `periodConfigs` | `saveConfig` é atômico e não toca as coleções grandes de dados |
| **Persistência de docs** | Chamar `saveDoc` / `updateDocById` / `deleteDocById` para `teachers`, `schedules`, `absences`, `history` | Granular; evita o `writeBatch` pesado da `saveToFirestore` |
| **Emails como chave** | `email.toLowerCase().replace(/[.#$/[\]]/g, '_')` antes de usar como Document ID | Firestore proíbe `.`, `#`, `$`, `/`, `[`, `]` em IDs |

---

## 14. Débitos Técnicos e Limitações Conhecidas

| Item | Impacto | Status |
|---|---|---|
| Listeners lazy para `absences` e `history` | Primeira abertura de AbsencesPage tem latência visível | ⚠️ Intencional — trade-off de não carregar tudo no boot |
| Regras Firestore para `pending_actions` incompletas | Coordenadores podem criar docs mas regras de execução das actions precisam revisão | ⚠️ Revisão periódica necessária |
| Main bundle ainda grande (~676 KB / 178 KB gzip) | Firebase SDK + Zustand stores carregados no boot; pages lazy-loaded mas core não | 🟡 Mitigado — pages lazy; reports/settings lazy; próximo passo: `manualChunks` para Firebase |
| Admins hardcoded em `db.js` (`HARDCODED_ADMINS`) | Adicionar admin requer alteração de código + deploy | 🔴 Aberto — migrar para coleção `admins/` exclusivamente |
| Sem testes automatizados | Regressões difíceis de detectar sem suite de testes | 🔴 Aberto |
| `window.innerWidth` para detecção de mobile | Não reativo a resize da janela | 🟡 Baixo impacto — uso é pontual em `CalendarPage` |
| Histórico de solicitações para coordenadores | Coordenadores veem as últimas 20 ações na aba de perfil da SettingsPage | ✅ Parcialmente resolvido |

---

## 15. Otimizações de Bundle e Performance

### Estratégia atual (Fases 285–293)

O projeto usa três camadas de otimização de carregamento:

**1. Lazy-loading de páginas** — `React.lazy()` + `Suspense`

Todas as 12 páginas são carregadas sob demanda via dynamic import em `App.jsx`:

```javascript
const HomePage          = lazy(() => import('./pages/HomePage'))
const CalendarPage      = lazy(() => import('./pages/CalendarPage'))
const SettingsPage      = lazy(() => import('./pages/SettingsPage'))
// … demais páginas
```

Resultado: cada página gera um chunk separado (2–67 KB) que só é baixado quando o
usuário navega até ela pela primeira vez.

**2. Lazy-loading de reports** — `dynamic import` em handlers

`reports/` (~29 KB, 7.4 KB gzip) nunca bloqueia o carregamento inicial:

```javascript
// Em AbsencesPage, SchedulePage, SubstitutionsPage
const handleExport = async () => {
  const { openPDF, generateByDayHTML } = await import('../lib/reports')
  const html = generateByDayHTML(month, year, store)
  openPDF(html)
}
```

O chunk `index-CYXUsAk1.js` (reports) só aparece na aba Network quando o usuário
clica em "Exportar PDF".

**3. Estrutura modular de src/lib/** — tree-shaking granular

A reorganização em subpastas permite que o bundler aplique tree-shaking mais
preciso. Imports granulares são preferidos:

```javascript
// Evitar (importa namespace completo)
import { formatISO, uid } from '../lib'

// Preferir (import granular — permite dead-code elimination)
import { formatISO } from '../lib/helpers/dates'
import { uid }       from '../lib/helpers/ids'
```

### Firebase SDK — tree-shaking

O projeto usa a API modular do Firebase v10 (não o compat):

```javascript
// firebase/ usa imports específicos — NÃO o namespace completo
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
```

```javascript
// db/ usa apenas as funções necessárias
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, writeBatch, serverTimestamp, query, where, onSnapshot, orderBy, limit,
} from 'firebase/firestore'
```

Importações nominais garantem que o Firebase SDK aplique tree-shaking: apenas
`auth` e `firestore` são incluídos no bundle final. Módulos como `storage`,
`functions`, `analytics` e `database` são excluídos automaticamente.

### Tailwind CSS — purge automático

Tailwind 3.4 analisa todos os arquivos em `src/` para gerar apenas as classes
utilizadas. O arquivo CSS final (index.css) tem 32 KB (6.4 KB gzip).

Regra: nunca concatenar nomes de classes dinamicamente — o purge não consegue
detectar classes geradas em runtime:

```javascript
// Errado — purge não detecta
const cls = `bg-${color}-100`

// Correto — classe completa no fonte
const cls = color === 'red' ? 'bg-red-100' : 'bg-blue-100'
```

### Bundle size — números de referência (build 2026-04-19)

| Chunk | Tamanho (raw) | Gzip | Quando carregado |
|---|---|---|---|
| `index` (main) | 676 KB | 178 KB | Sempre (boot) |
| `SettingsPage` | 67 KB | 17 KB | Ao navegar para /settings |
| `SubstitutionsPage` | 34 KB | 9 KB | Ao navegar para /substitutions |
| `reports` | 30 KB | 7 KB | Ao clicar "Exportar PDF" |
| `AbsencesPage` | 22 KB | 6 KB | Ao navegar para /absences |
| `CalendarPage` | 18 KB | 6 KB | Ao navegar para /calendar |
| demais páginas | 2–13 KB | 1–5 KB | Sob demanda |
| `index.css` | 33 KB | 6 KB | Sempre (boot) |

**Gzip total na inicialização (first load):** ~184 KB (main + CSS)

### Próximo passo recomendado

Para reduzir o main bundle abaixo de 500 KB, o próximo passo seria configurar
`manualChunks` no `vite.config.js` para isolar o Firebase SDK num chunk dedicado:

```javascript
// vite.config.js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        'vendor':   ['react', 'react-dom', 'react-router-dom', 'zustand'],
      }
    }
  }
}
```

Impacto estimado: -150 a -200 KB no main bundle (Firebase SDK representa ~200 KB do total).
