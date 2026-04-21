# Spec: Multi-Escolas (SaaS-Ready)

## Visão Geral

O sistema GestãoEscolar evoluirá de **single-school** para **multi-tenant**, suportando múltiplas escolas independentes com dados completamente isolados. Cada escola terá sua própria hierarquia de usuários, configurações de períodos/áreas/matérias/turmas, e operações (substituições, faltas, advertências) totalmente segregadas.

**Problema resolvido:** Atualmente, o sistema funciona com uma única escola hardcoded. O novo requisito viabiliza:
- Suporte a N escolas simultâneas com dados isolados
- Modelo de negócio SaaS com billing futuro por escola
- Redução de custo de implantação em novas organizações

---

## Stack Tecnológica

- **Frontend:** React 18.3.1 + React Router 6.26 + Zustand 4.5.4 (multi-tenant state)
- **Backend:** Firebase Firestore (estrutura multi-tenant via caminhos aninhados)
- **Auth:** Firebase Auth (login centralizado + acesso a múltiplas escolas)
- **Banco de dados:** Firestore com estrutura `schools/{schoolId}/...`
- **Storage:** Local Storage para cache por school
- **Deployment:** Firebase Hosting (sem mudanças)

---

## Páginas e Rotas

### Página de Login — `/`

**Descrição:** Usuário faz login com Google ou email/senha. Sistema detecta quais escolas tem acesso e exibe seletor (se 2+) ou redireciona direto (se 1).

**Componentes:**
- `LoginForm`: input email/botão Google OAuth
- `SchoolSelector`: modal/dropdown com lista de escolas (se aplicável)
- `OnboardingFlow`: configuração de primeira escola (se novo admin do sistema)

**Behaviors:**
- [ ] Usuário clica "Entrar com Google" → abre popup Google
- [ ] Firebase Auth valida credencial → `onAuthStateChanged` dispara
- [ ] Sistema busca `users/{uid}` e lê campo `schools` (dicionário de acesso)
- [ ] Se 0 escolas: redireciona para onboarding de criação de escola
- [ ] Se 1 escola: seta `currentSchoolId` no store e redireciona para dashboard
- [ ] Se 2+ escolas: exibe modal `<SchoolSelector>` com lista interativa
- [ ] Usuário seleciona escola → store seta `currentSchoolId` e `currentSchool`
- [ ] Redireciona para dashboard (admin/coordinator) ou home (teacher)
- [ ] Session mantém-se ativa mesmo alternando escolas (logout reseta tudo)

---

### Página Home do Professor — `/home`

**Descrição:** Versão teacher-only com saudação personalizada e stats do mês **da escola atual**.

**Componentes:**
- `WelcomeCard`: "Bem-vindo, Ana! Você está na Escola Municipal X"
- `MonthlyStatsCard`: faltas e substituições **desta escola**
- `QuickAccessCards`: atalhos para absences, schedule

**Behaviors:**
- [ ] Carregar dados (professores, horários, faltas) filtrados por `currentSchoolId`
- [ ] Exibir nome da escola em destaque (para lembrar qual está usando)
- [ ] Stats (faltas, subs) só contam registros da escola atual
- [ ] Botões navegam com `schoolId` implícito no contexto

---

### Página Dashboard — `/dashboard`

**Descrição:** Visão executiva da escola atual. Admin/Coordinator: alertas e tabelas globais. Teacher: resumo pessoal.

**Componentes:**
- `SchoolHeader`: "Escola Municipal X | Admin: admin@x.edu.br | CNPJ: XX.XXX..."
- `SchoolSwitcher`: botão flutuante ou dropdown para trocar de escola (se usuário tem 2+)
- `KPICards`: 4 cards com métricas agregadas **desta escola**
  - Total de professores (contar `schools/{schoolId}/teachers`)
  - Aulas/semana (média, somando `schedules`)
  - Faltas abertas (count `absences` onde `status !== 'covered'`)
  - Sem substituto (count de slots orphaned)
- `WorkloadWarningsTable`: professores acima de `workloadWarn/Danger` **desta escola**
- `RecentActionsLog`: últimas ações (approvals, denials, etc.) **desta escola**

**Behaviors:**
- [ ] Ao montar, verificar `currentSchoolId` é válido (user tem acesso)
- [ ] Carregar config, teachers, schedules, absences **apenas desta escola**
- [ ] Recalcular KPIs a cada mudança de dados (via Zustand listeners)
- [ ] Exibir alerta "Você está logado em X escola(s)" com opção de trocar
- [ ] Admin vê abas de gestão (Segmentos, Períodos, etc.) da escola atual
- [ ] Coordinator vê dados operacionais (sem abas de config)
- [ ] Teacher vê resumo pessoal (sem dados globais)

---

### Página de Calendário — `/calendar`

**Descrição:** Grid semanal de ausências e substitutos. Todos os dados filtrados por `currentSchoolId`.

**Componentes:**
- `SchoolHeader`: qual escola sendo editada
- `WeekSelector`: semana anterior/próxima
- `AbsenceGrid`: matriz dia × período com slots e substitutos
- `SubstituteRanking`: pills com top 3 candidatos
- `SlotModal`: edição de ausência/substituto

**Behaviors:**
- [ ] Carregar schedules, teachers, absences **desta escola**
- [ ] Exibir apenas professores **desta escola**
- [ ] Ranking de substitutos leva em conta apenas professores **desta escola** e load mensal **desta escola**
- [ ] Ao editar: salvar em `schools/{schoolId}/absences/`
- [ ] Validações (isBusy, monthlyLoad, etc.) consideram apenas dados **desta escola**

---

### Página de Absências — `/absences`

**Descrição:** 4 abas de relatório (professor/dia/semana/mês) com export PDF. Dados **da escola atual**.

**Componentes:**
- `TabBar`: Por Professor / Por Dia / Por Semana / Por Mês
- `AbsenceTable`: tabela dinâmica conforme aba ativa
- `ExportButton`: gera HTML e abre print

**Behaviors:**
- [ ] Carregar absences de `schools/{schoolId}/absences/`
- [ ] Listar apenas teachers de `schools/{schoolId}/teachers/`
- [ ] Filter por professor: dropdown com **professores desta escola**
- [ ] PDF incluir cabeçalho: "Relatório de Ausências — Escola Municipal X | Período: ..."
- [ ] Queries de agregação (por dia, semana, mês) respeitam `schoolId`

---

### Página de Substituições — `/substitutions`

**Descrição:** 5 abas de relatório + ranking de substitutos. Dados **da escola atual**.

**Componentes:**
- `TabBar`: Ranking / Por Dia / Por Semana / Por Professor / Por Mês
- `RankingTable`: quem substituiu mais (top 10)
- `SubstitutionTable`: tabela conforme aba
- `ExportButton`: PDF com dados **desta escola**

**Behaviors:**
- [ ] Carregar history de `schools/{schoolId}/history/`
- [ ] Ranking de substitutos conta apenas substituições **desta escola**
- [ ] Filtros (professor, período) limitados a **professores/períodos desta escola**
- [ ] PDF incluir cabeçalho com nome da escola

---

### Página de Grade Horária — `/schedule`

**Descrição:** Grade individual de um professor (ou geral, se admin). Dados **da escola atual**.

**Componentes:**
- `SchoolContext`: qual escola sendo editada
- `ScheduleGrid`: matriz semanal com slots
- `AddScheduleModal`: criar aula
- `TeacherSelector`: (admin) escolher qual professor visualizar

**Behaviors:**
- [ ] Carregar schedules de `schools/{schoolId}/schedules/`
- [ ] Teacher vê apenas sua grade (FK para `currentTeacher.id`)
- [ ] Admin pode selecionar qualquer professor **desta escola**
- [ ] Ao adicionar aula: salvar em `schools/{schoolId}/schedules/`
- [ ] Validar que `teacherId` e `turma` existem nesta escola
- [ ] Períodos (timeSlot) derivados de `schools/{schoolId}/meta/config`

---

### Página de Grade Escolar — `/school-schedule`

**Descrição:** Grade geral com filtros por segmento/turno. Admin/Coordinator only. Dados **da escola atual**.

**Componentes:**
- `FilterBar`: segmento + turno + período (opcional)
- `ScheduleGrid`: matriz grande mostrando todos os professores
- `ExportButton`: PDF

**Behaviors:**
- [ ] Carregar schedules + segments de `schools/{schoolId}/...`
- [ ] Dropdown de segmento lista apenas segmentos **desta escola** (`meta/config.segments`)
- [ ] Filtro de turno limita a turnos disponíveis no segmento selecionado
- [ ] Grade regenerada a cada mudança de filtro
- [ ] PDF: cabeçalho "Grade Horária — Escola Municipal X"

---

### Página de Configurações — `/settings`

**Descrição:** 8 abas para admin (ou reduzidas para coordinator/teacher). **Tudo isolado por escola**.

**Componentes:**
- `TabBar`: Segmentos / Períodos / Áreas / Professores / Turmas / Formação / Admins / Solicitações
- Tab-specific forms/tables

**Behaviors (admin):**
- [ ] **Segmentos:** CRUD em `schools/{schoolId}/meta/config.segments`
- [ ] **Períodos:** CRUD em `schools/{schoolId}/meta/config.periodConfigs`
- [ ] **Áreas:** CRUD em `schools/{schoolId}/meta/config.areas` (soft-link para subjects)
- [ ] **Professores:** listar `schools/{schoolId}/teachers/`, add/edit/remove
  - Email pode repetir em outra escola → identificação é `(email, schoolId)` composto
  - Campo `profile`: "teacher" | "coordinator" | "teacher-coordinator" (local desta escola)
- [ ] **Turmas:** CRUD em `schools/{schoolId}/meta/config.segments[].grades[].classes`
- [ ] **Formação (sharedSeries):** CRUD em `schools/{schoolId}/meta/config.sharedSeries`
- [ ] **Admins:** listar `schools/{schoolId}/admins/`, add/remove (admins locais desta escola)
- [ ] **Solicitações:** listar `schools/{schoolId}/pending_actions/` (se aprovação requerida)

**Behaviors (coordinator):**
- [ ] Aba "Perfil": editar `schools/{schoolId}/teachers/{uid}` (subset de campos)
- [ ] Aba "Histórico": ver últimas 20 ações **desta escola** do tipo pending_actions
- [ ] Sem acesso a outras 6 abas

**Behaviors (teacher):**
- [ ] Aba "Perfil": editar próprio name/celular/apelido em `schools/{schoolId}/teachers/{uid}`
- [ ] Sem acesso a abas de config

---

### Página de Carga Horária — `/workload`

**Descrição:** Tabela com aulas/semana, faltas, subs por professor. Dados **da escola atual**.

**Componentes:**
- `WorkloadTable`: colunas (Professor, Aulas/Semana, Faltas, Subs, Score)
- Badge de alertas amarelo/vermelho conforme `workloadWarn/Danger` **desta escola**

**Behaviors:**
- [ ] Carregar teachers, schedules, absences, history de `schools/{schoolId}/...`
- [ ] Calcular carga: somar aulas regulares + substituições mensais
- [ ] Badges comparar com config `schools/{schoolId}/meta/config.workloadWarn/Danger`
- [ ] Ordenação padrão: carga descendente

---

### Página Pendente — `/pending`

**Descrição:** Usuário recém-logado aguardando aprovação do admin **da escola selecionada**.

**Componentes:**
- `PendingMessage`: "Sua solicitação foi enviada para Admin X | Aguarde aprovação"
- `ProfileForm`: completar telefone/apelido/matérias
- `LogoutButton`: sair e tentar outra escola (se múltiplas)

**Behaviors:**
- [ ] Exibir: "Você solicitou acesso à [Escola Y]. Aguardando aprovação do admin [email]"
- [ ] Listener `onSnapshot(schools/{schoolId}/pending_teachers/{uid})` detecta aprovação
- [ ] Ao aprovar: role muda, redireciona para dashboard/home
- [ ] Usuário pode fazer logout e tentar login novamente em outra escola

---

### Página de Gerenciamento de Escolas — `/admin/schools` (nova)

**Descrição:** Apenas para **Admin do Sistema**. Criar/editar/deletar escolas.

**Componentes:**
- `SchoolTable`: lista de todas as escolas
- `CreateSchoolModal`: form com nome, CNPJ, email do admin
- `EditSchoolModal`: editar config básica (nome, metadata)
- `DeleteSchoolConfirm`: confirmar remoção (com aviso de dados)

**Behaviors:**
- [ ] Admin do Sistema acessa `/admin/schools`
- [ ] Tabela lista `meta/schools/{schoolId}` para TODAS as escolas
- [ ] Clique "Nova Escola" abre modal: Nome, CNPJ, Email do Admin
- [ ] Ao salvar: criar doc em `meta/schools/{schoolId}` + coleções vazias
  - `schools/{schoolId}/meta/config` (inicializar com estrutura default)
  - `schools/{schoolId}/teachers/`
  - `schools/{schoolId}/schedules/`
  - `schools/{schoolId}/absences/`
  - `schools/{schoolId}/history/`
  - `schools/{schoolId}/admins/`
  - `schools/{schoolId}/pending_teachers/`
- [ ] Enviar email convite para admin-escola
- [ ] Admin-escola faz login → vê onboarding de configuração
- [ ] Clique "Editar" permite mudar nome, CNPJ, metadata, admin
- [ ] Clique "Deletar" → confirmação → remove escola inteira (CUIDADO!)

---

### Página Onboarding para Primeira Escola — `/onboarding/school-setup` (nova)

**Descrição:** Admin-escola novo completa setup inicial: cria segmentos, períodos, áreas, matérias, turmas.

**Componentes:**
- `SetupStepper`: 5 passos (Segmentos → Períodos → Áreas → Matérias → Turmas)
- Step-specific forms
- `CompleteButton`: finaliza e redireciona para settings completo

**Behaviors:**
- [ ] Novo admin-escola faz login → vê este fluxo se `meta/config` vazio
- [ ] Passo 1: criar 1+ segmentos (Ensino Fundamental, Médio, etc.)
- [ ] Passo 2: configurar períodos para cada segmento+turno
- [ ] Passo 3: criar 1+ áreas (Ciências, Línguas, etc.) + cores
- [ ] Passo 4: criar matérias (Biologia, Português, etc.) + FK para áreas
- [ ] Passo 5: criar turmas (6º Ano A, 6º Ano B, etc.) dentro de segmentos/séries
- [ ] Ao completar: salvar tudo em `schools/{schoolId}/meta/config` atomicamente
- [ ] Redirecionar para `/settings` com abas de Professores/Formação prontas

---

### Página de Seletor de Escola (Switcher) — Modal/Dropdown (novo)

**Descrição:** Se usuário tem 2+ escolas, exibir seletor em navbar ou como modal.

**Componentes:**
- `SchoolSwitcher`: dropdown com logos/nomes das escolas
- `CurrentSchoolBadge`: exibir qual escola está usando no navbar

**Behaviors:**
- [ ] Navbar exibe badge "Você está em: Escola X"
- [ ] Clique abre dropdown com todas as escolas do usuário (de `users/{uid}.schools`)
- [ ] Selecionar escola: seta `currentSchoolId` no store
- [ ] Redireciona para dashboard/home com novo contexto
- [ ] Todos os dados carregam do novo `schoolId`

---

## Componentes Compartilhados

### Novo: `SchoolHeader` — Contexto da Escola

Exibido em todas as páginas admin/coordinator. Mostra nome da escola, admin, CNPJ.

```jsx
<SchoolHeader schoolId={currentSchoolId} />
// Renderiza: "Escola Municipal X | Admin: admin@x.edu.br | CNPJ: XX.XXX..."
```

### Novo: `SchoolSwitcher` — Seletor de Escolas

Se `userSchools.length > 1`, exibir dropdown interativo no navbar.

```jsx
<SchoolSwitcher 
  currentSchoolId={currentSchoolId} 
  onSwitch={(schoolId) => store.switchSchool(schoolId)} 
/>
```

### Existente adaptado: `KPICards`

- Receber `schoolId` explicitamente
- Queries limitadas a `schools/{schoolId}/teachers`, `schools/{schoolId}/schedules`, etc.

### Existente adaptado: Componentes de relatório (Modal, Navbar, etc.)

- Adicionar contexto de escola em cabeçalhos
- PDFs incluirem nome da escola

---

## Modelos de Dados

### Coleção nova: `meta/schools/` (raiz global)

Documento índice centralizado listando todas as escolas do sistema:

```js
schools/{schoolId}
{
  id: "sch-abc123",
  name: "Escola Municipal X",
  cnpj: "XX.XXX.XXX/0001-XX",
  adminEmail: "admin@escola-x.edu.br",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  isActive: true,
  metadata: {
    address: "Rua..., Cidade, Estado",
    phone: "11 3456-7890",
    website: "https://...",
    city: "São Paulo",
    state: "SP"
  }
}
```

### Coleção nova: `users/` (raiz global, restruturada)

Índice global de usuários com acesso a múltiplas escolas:

```js
users/{uid}
{
  uid: "firebase-uid-abc123",
  email: "professor@escola.sp.gov.br",
  name: "Ana Souza",
  photoURL: "https://...",
  schools: {
    "sch-abc123": {
      role: "teacher",           // "teacher" | "coordinator" | "teacher-coordinator" | "admin"
      status: "approved",        // "approved" | "pending"
      startDate: Timestamp,
      school: {
        name: "Escola Municipal X",
        adminEmail: "admin@x.edu.br"
      }
    },
    "sch-def456": {
      role: "coordinator",
      status: "pending",
      startDate: Timestamp,
      school: {
        name: "Escola Municipal Y",
        adminEmail: "admin@y.edu.br"
      }
    }
  }
}
```

**Nota:** Campo `schools` é dicionário para acesso rápido. Cada entrada contém `role` local à escola e `status` (approved/pending naquela escola).

### Estrutura reorganizada: `schools/{schoolId}/meta/config`

Configuração isolada por escola (idêntica à estrutura atual, mas nested):

```js
schools/{schoolId}/meta/config
{
  segments: [
    {
      id: "seg-fund",
      name: "Ensino Fundamental",
      turno: "manha",
      grades: [
        {
          name: "6º Ano",
          classes: [
            { letter: "A", turno: "manha" }
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
        intervalos: [...]
      }
    }
  },
  areas: [...],
  subjects: [...],
  sharedSeries: [...],
  workloadWarn: 20,
  workloadDanger: 26,
  updatedAt: Timestamp
}
```

### Estrutura reorganizada: `schools/{schoolId}/teachers/`

Professores isolados por escola:

```js
schools/{schoolId}/teachers/{teacherId}
{
  id: "lv9k2a7",
  name: "Ana Souza",
  email: "ana@escola.sp.gov.br",
  celular: "11999999999",
  whatsapp: "",
  apelido: "Aninha",
  subjectIds: ["subj-bio", "subj-cien"],
  status: "approved",
  profile: "teacher",        // "teacher" | "coordinator" | "teacher-coordinator"
  createdAt: Timestamp
}
```

**Importante:** O mesmo email pode aparecer em múltiplas escolas com `profile` diferente.

### Estrutura reorganizada: `schools/{schoolId}/schedules/`

Grade horária isolada por escola:

```js
schools/{schoolId}/schedules/{scheduleId}
{
  id: "mx3p9q1",
  teacherId: "lv9k2a7",
  day: "Segunda",
  timeSlot: "seg-fund|manha|1",
  turma: "6º Ano A",
  subjectId: "subj-bio"
}
```

### Estrutura reorganizada: `schools/{schoolId}/absences/`

Ausências isoladas por escola:

```js
schools/{schoolId}/absences/{absenceId}
{
  id: "ab7r3n2",
  teacherId: "lv9k2a7",
  createdAt: Timestamp,
  status: "open",
  slots: [
    {
      id: "sl2x8k1",
      date: "2026-04-14",
      day: "Segunda",
      timeSlot: "seg-fund|manha|1",
      scheduleId: "mx3p9q1",
      subjectId: "subj-bio",
      turma: "6º Ano A",
      substituteId: null
    }
  ]
}
```

### Estrutura reorganizada: `schools/{schoolId}/history/`

Histórico de substituições isolado por escola:

```js
schools/{schoolId}/history/{historyId}
{
  id: "hy1z9m4",
  teacherId: "lv9k2a7",
  subId: "lv9k2a7-outro",
  date: "2026-04-14",
  day: "Segunda",
  slotLabel: "1ª Aula (07:00–07:50)",
  registeredAt: Timestamp
}
```

### Estrutura reorganizada: `schools/{schoolId}/pending_teachers/`

Solicitações de acesso isoladas por escola:

```js
schools/{schoolId}/pending_teachers/{uid}
{
  uid: "firebase-uid-abc123",
  email: "joao@escola.sp.gov.br",
  name: "João Silva",
  photoURL: "https://...",
  requestedAt: Timestamp,
  status: "pending",
  celular: "11988887777",
  apelido: "João",
  subjectIds: ["subj-bio"]
}
```

### Estrutura reorganizada: `schools/{schoolId}/admins/`

Admins locais à escola:

```js
schools/{schoolId}/admins/{emailSanitized}
{
  email: "novo.admin@escola.sp.gov.br",
  name: "Novo Admin",
  addedAt: Timestamp,
  addedBy: "email@admin.escola"
}
```

### Estrutura reorganizada: `schools/{schoolId}/pending_actions/`

Ações de coordenadores pendentes de aprovação (isoladas por escola):

```js
schools/{schoolId}/pending_actions/{actionId}
{
  id: "pa9x2k7",
  coordinatorId: "lv9k2a7",
  coordinatorName: "Maria Coord",
  action: "addClassToGrade",
  payload: { segId, gradeName, letter },
  summary: "Adicionar 6º Ano C (manhã)",
  createdAt: Timestamp,
  status: "pending",
  reviewedBy: null,
  reviewedAt: null,
  rejectionReason: null
}
```

---

## Regras de Negócio

### 1. Hierarquia de Acesso Multi-Escola

| Role | Escopo | Permissões | Onde criar |
|---|---|---|---|
| **Admin do Sistema** (novo) | Global (todas as escolas) | Criar/editar/deletar escolas; visualizar relatórios agregados | Email hardcoded em `HARDCODED_SYSTEM_ADMINS` ou coleção `meta/system_admins/` |
| **Admin da Escola** | Uma escola (local) | Gerir usuários; editar config (períodos, áreas, matérias); acessar todos os dados | Designado no `meta/schools/{schoolId}.adminEmail` |
| **Diretor da Escola** (novo) | Uma escola (local) | Mesmos privilégios de Coordenador Geral + relatórios executivos; sem editar config | `schools/{schoolId}/teachers/{uid}.profile = "coordinator"` com flag especial |
| **Coordenador Geral** | Uma escola (local) | Acesso a todos os dados operacionais (substituições, faltas, advertências); ações requerem aprovação do admin | `schools/{schoolId}/teachers/{uid}.profile = "coordinator"` |
| **Professor-Coordenador** | Uma escola (local) | Coordenar turmas/disciplinas próprias; submeter ações para aprovação | `schools/{schoolId}/teachers/{uid}.profile = "teacher-coordinator"` |
| **Professor** | Uma escola (local) | Ver grade própria, registrar ausências, visualizar substituições, editar perfil | `schools/{schoolId}/teachers/{uid}.profile = "teacher"` |
| **Pendente** | Uma escola (local) | Nenhum acesso; aguardando aprovação do admin da escola | `schools/{schoolId}/pending_teachers/{uid}.status = "pending"` |

### 2. Isolamento de Dados

**Regra crítica:** Nenhum dado de uma escola pode ser acessado a partir de outra.

- Queries sempre filtram por `schoolId`
- Firestore rules verificam `schoolId` em cada leitura/escrita
- Frontend verifica `currentSchoolId` antes de renderizar dados
- Não reutilizar IDs entre escolas (usar `uid()` sempre)

### 3. Identificação de Usuários Única (Composto)

Um professor é identificado unicamente por `(email, schoolId)`:
- Email "ana@escola.sp.gov.br" é `teacher` na Escola A
- Email "ana@escola.sp.gov.br" é `coordinator` na Escola B
- São identidades **completamente separadas** (roles, subjects, grades podem diferir)
- `users/{uid}.schools[schoolId]` guarda o role e status locais

### 4. Fluxo de Criação de Escola

1. Admin do Sistema acessa `/admin/schools`
2. Clica "Nova Escola" → abre modal
3. Preenche: nome, CNPJ, email do admin-escola, endereço (opcional)
4. Sistema cria:
   - `meta/schools/{schoolId}` com metadados
   - `schools/{schoolId}/meta/config` com estrutura default vazia
   - Coleções vazias (teachers, schedules, absences, history, admins, pending_teachers, pending_actions)
   - Entrada em `users/{adminEmail}.schools[schoolId] = { role: 'admin', status: 'approved' }`
5. Envia email para admin-escola: "Sua escola foi criada. Clique aqui para fazer login e configurar"
6. Admin-escola faz login → sees `/onboarding/school-setup`
7. Configura segmentos, períodos, áreas, matérias, turmas
8. Redireciona para `/settings` com abas prontas para gerenciar professores

### 5. Fluxo de Login Multi-Escola

1. Usuário faz login com Google (`signInWithPopup`)
2. `onAuthStateChanged` dispara → ler `users/{uid}`
3. Se campo `schools` não existe → ler `teachers/` de escola default (migration path)
4. Contar quantas escolas tem acesso:
   - **0 escolas:** redirecionar para `/onboarding/first-school` (novo)
   - **1 escola:** seta `currentSchoolId` automaticamente
   - **2+ escolas:** exibir modal `<SchoolSelector>`
5. Após selecionar (ou direto se 1): seta `useAppStore.currentSchoolId`
6. Todas as queries Firestore usam `schools/{currentSchoolId}/...`
7. Listeners (onSnapshot) registram-se para a escola atual
8. Ao trocar de escola: cancelar listeners antigos, registrar novos

### 6. Migração da Base Existente

Para escolas já em produção (single-school):

1. Criar "Escola Padrão" com `schoolId = "sch-default"`
2. Mover todos os docs (teachers, schedules, etc.) para `schools/sch-default/...`
3. Manter `meta/config` em lugar visível (não nested) durante transição
4. Queries legadas que leem de raiz são redirecionadas para `schools/sch-default/...` via helper
5. Após período de transição, suportar apenas estrutura nova

### 7. Regras Firestore (Security)

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Admin do Sistema (email hardcoded ou em meta/system_admins)
    match /meta/{document=**} {
      allow read, write: if isSystemAdmin();
    }
    
    // Estrutura de escolas
    match /schools/{schoolId} {
      // Qualquer pessoa logada lê dados públicos da escola (name, cnpj)
      match /meta/config {
        allow read: if request.auth != null;
        allow write: if isSchoolAdmin(schoolId);
      }
      
      // Dados operacionais: admin, coordinator, ou professors com acesso
      match /{document=**} {
        allow read, write: if isSchoolAdmin(schoolId);
        allow read: if hasSchoolAccess(schoolId);
        allow write: if (hasSchoolAccess(schoolId) && 
                       canWriteDocument(schoolId, resource));
      }
    }
    
    // Users (global, todos podem ler próprio doc)
    match /users/{uid} {
      allow read: if request.auth.uid == uid;
      allow write: if request.auth.uid == uid || isSystemAdmin();
    }
  }
  
  // Helper functions
  function isSystemAdmin() {
    return request.auth.email in [
      'admin@gestorescola.com.br',
      'suporte@gestorescola.com.br'
    ] || exists(/databases/$(database)/documents/meta/system_admins/$(request.auth.email));
  }
  
  function isSchoolAdmin(schoolId) {
    let userSchools = get(/databases/$(database)/documents/users/$(request.auth.uid)).data.schools;
    return userSchools[schoolId].role == 'admin' && userSchools[schoolId].status == 'approved';
  }
  
  function hasSchoolAccess(schoolId) {
    let userSchools = get(/databases/$(database)/documents/users/$(request.auth.uid)).data.schools;
    return schoolId in userSchools && userSchools[schoolId].status == 'approved';
  }
  
  function canWriteDocument(schoolId, resource) {
    // Lógica customizada por collection (teachers, schedules, etc.)
    return true;  // simplificado; expandir conforme necessário
  }
}
```

---

## Mudanças na Arquitetura

### 1. Zustand Store (`useAppStore`) — Adições

```js
{
  // ─── Multi-Escola ──────────────────────────────────
  currentSchoolId:     "sch-abc123",      // escola sendo usada
  currentSchool:       { name, adminEmail, cnpj, ... },  // metadata
  userSchools:         [
    { schoolId: "sch-abc123", role: "teacher", status: "approved" },
    { schoolId: "sch-def456", role: "coordinator", status: "pending" }
  ],
  
  // ─── Actions ──────────────────────────────────────────
  setCurrentSchool:    (schoolId) => { /* seta context */ },
  switchSchool:        (schoolId) => { /* cancela listeners, muda schoolId, carrega dados novos */ },
  createSchool:        (name, cnpj, adminEmail) => { /* cria em meta/schools + coleções */ },
  deleteSchool:        (schoolId) => { /* aviso e remoção */ },
  updateSchool:        (schoolId, updates) => { /* edita meta/schools/{schoolId} */ },
}
```

### 2. Helper Utilities (`src/lib/firebase/`)

Novo módulo `src/lib/firebase/multi-tenant.js`:

```js
// Gera referência para coleção isolada por school
export function getSchoolRef(schoolId, collection) {
  return doc(db, 'schools', schoolId, collection)
}

// Exemplo de uso:
getDocs(collection(db, getSchoolRef(schoolId, 'teachers')))
// Equivale a:
getDocs(collection(db, `schools/${schoolId}/teachers`))

// Helpers para o prefixo comum
export function getSchoolDocRef(schoolId, subcollection, docId) {
  return doc(db, 'schools', schoolId, subcollection, docId)
}

export function getSchoolCollectionRef(schoolId, subcollection) {
  return collection(db, 'schools', schoolId, subcollection)
}
```

### 3. Atualização de `db/` (I/O com Firestore)

Todas as funções que atualmente fazem:
```js
getDocs(collection(db, 'teachers'))
```

Devem mudar para:
```js
getDocs(getSchoolCollectionRef(schoolId, 'teachers'))
```

Adicionar parâmetro `schoolId` a todas as funções públicas:

```js
export async function loadTeachers(schoolId) {
  const snap = await getDocs(getSchoolCollectionRef(schoolId, 'teachers'))
  return snap.docs.map(doc => doc.data())
}

export async function saveTeacher(schoolId, teacher) {
  await setDoc(getSchoolDocRef(schoolId, 'teachers', teacher.id), teacher)
}

export async function deleteTeacher(schoolId, teacherId) {
  await deleteDoc(getSchoolDocRef(schoolId, 'teachers', teacherId))
}
```

### 4. Listeners (`db/listeners.js`)

Atualizar `setupRealtimeListeners()` para aceitar `schoolId`:

```js
export function setupRealtimeListeners(schoolId, store) {
  // Listener para meta/config
  onSnapshot(
    getSchoolDocRef(schoolId, 'meta', 'config'),
    snap => {
      if (snap.exists()) {
        store.hydrate({ /* dados */ })
      }
    }
  )
  
  // Listener para teachers
  onSnapshot(
    getSchoolCollectionRef(schoolId, 'teachers'),
    snap => {
      store.setTeachers(snap.docs.map(d => d.data()))
    }
  )
  
  // ... demais listeners
}
```

Chamar em `App.jsx`:
```js
useEffect(() => {
  if (currentSchoolId) {
    setupRealtimeListeners(currentSchoolId, store)
  }
}, [currentSchoolId])
```

### 5. Cache LocalStorage (`db/cache.js`)

Atualizar chave para incluir `schoolId`:

```js
function getCacheKey(schoolId) {
  return `gestao_v7_cache_${schoolId}`
}

export function _saveToLS(schoolId, state) {
  localStorage.setItem(getCacheKey(schoolId), JSON.stringify({
    data: state,
    timestamp: Date.now()
  }))
}

export function _loadFromLS(schoolId) {
  const cached = localStorage.getItem(getCacheKey(schoolId))
  // ... validar, retornar ou false
}
```

Isso permite cache isolado por escola, acelerando switch entre escolas.

### 6. Hydrate com contexto de escola

```js
useEffect(() => {
  async function init() {
    const data = await loadFromFirestore(currentSchoolId)
    store.hydrate(data)
    setupRealtimeListeners(currentSchoolId, store)
  }
  if (currentSchoolId) init()
}, [currentSchoolId])
```

### 7. Query de acesso do usuário

Nova função `getUserSchools(uid)`:

```js
export async function getUserSchools(uid) {
  const userDoc = await getDoc(doc(db, 'users', uid))
  if (!userDoc.exists()) return []
  return Object.entries(userDoc.data().schools ?? {}).map(([schoolId, data]) => ({
    schoolId,
    role: data.role,
    status: data.status,
    school: data.school
  }))
}
```

---

## Fora do Escopo (v1)

- [ ] Billing por escola (implementar na v2)
- [ ] SSO/LDAP integrado (v2)
- [ ] API pública para integração com SIE externo (v2)
- [ ] Relatórios agregados do Admin do Sistema (v2)
- [ ] Sincronização com Google Classroom (v2)
- [ ] Múltiplas moedas / IVA por país (v3)
- [ ] Auditoria detalhada de ações por usuário (v2, parcial em pending_actions)
- [ ] Backup/restore de escola (v2)
- [ ] Testes automatizados (will be handled separadamente)
- [ ] Documentação de API (v2)

---

## Benefícios

1. **SaaS-Ready:** Suporta crescimento orgânico (1→N escolas) sem refatoração
2. **Isolamento Total:** Dados de uma escola não "vazam" para outra (Firestore rules + frontend)
3. **Escalabilidade:** Cada escola tem índices/listeners independentes
4. **Flexibilidade Operacional:** Cada escola configura períodos/turmas conforme sua realidade
5. **Identificação Composta:** Mesmo email funciona em múltiplas escolas com roles distintos
6. **Fallback Seguro:** Cache por school permite usar offline + switch rápido entre contextos
7. **Redução de Onboarding:** Admin do Sistema cria escola + admin local configura → pronto

---

## Riscos e Mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| Usuário acessa dados de escola A enquanto logado em B | 🔴 Alta | Firestore rules check `schoolId`; frontend valida antes de render |
| Query lenta com centenas de escolas | 🟡 Média | Índices em `schools/{schoolId}/teachers`, `schools/{schoolId}/schedules` |
| Migração quebra dados históricos | 🔴 Alta | Manter estrutura single-school como fallback; testar com DB real antes de prod |
| Admin de escola A torna-se admin global acidentalmente | 🟡 Média | Separar `isSchoolAdmin()` de `isSystemAdmin()` em helpers + Firestore rules |
| Botão "Deletar Escola" deletado sem aviso | 🟡 Média | Modal de confirmação com listagem de professores/aulas que serão perdidas |
| Cache desincronizado entre escolas | 🟡 Média | Usar chave de cache isolada por schoolId (`gestao_v7_cache_{schoolId}`) |
| Listener não é cancelado ao mudar de escola → memory leak | 🔴 Alta | Guardar unsub functions; chamar antes de registrar novos listeners |
| Nova escola sem `meta/config` causa erro | 🟡 Média | Inicializar `meta/config` com estrutura default vazia ao criar escola |

---

## Sumário de Novas Páginas/Modais

| Item | Rota/Tipo | Descrição |
|---|---|---|
| Seletor de Escola | Modal ou Dropdown | Escolher entre múltiplas escolas logadas |
| Gerenciamento de Escolas | `/admin/schools` | Admin do Sistema cria/edita/deleta escolas |
| Onboarding de Primeira Escola | `/onboarding/school-setup` | Admin-escola novo configura segmentos/períodos/etc. |
| Onboarding de Primeira Escola (usuário) | `/onboarding/first-school` | Usuário que acabou de se registrar vê options |

---

## Sumário de Comportamentos

**Total de behaviors identificados: 47**

### Autenticação & Acesso (8)
1. Usuário faz login com Google
2. Sistema carrega escolas do usuário
3. Se 0 escolas: redirecionar para criar primeira
4. Se 1 escola: entrar automaticamente
5. Se 2+ escolas: exibir seletor
6. Usuário seleciona escola do seletor
7. Sistema carrega contexto (data) da escola
8. Usuário faz logout → limpar todas as sessões

### Dashboard & Home (7)
9. Admin/Coordinator vê dados agregados da escola
10. Teacher vê resumo pessoal
11. KPIs recalculam a cada mudança de dados
12. Exibir alerta "você está em X escolas"
13. Botão para trocar de escola (se múltiplas)
14. Header exibe nome da escola em destaque
15. Teacher vê grade/faltas/subs da escola atual

### Calendário (5)
16. Carregar schedules/absences da escola atual
17. Exibir apenas professores da escola
18. Ranking considera apenas professores da escola
19. Validar isBusy, monthlyLoad por escola
20. Salvar ausência/substituto na escola atual

### Absências & Substituições (8)
21. Carregar absences de `schools/{schoolId}/absences`
22. Listar apenas professores da escola
23. Filtro por professor mostra lista da escola
24. PDF incluir cabeçalho da escola
25. Queries agregadas (dia/semana/mês) por escola
26. Carregar history de `schools/{schoolId}/history`
27. Ranking de substitutos contar apenas substituições da escola
28. PDFs incluir contexto da escola

### Configurações (9)
29. Criar/editar/deletar segmentos (admin)
30. Criar/editar/deletar períodos (admin)
31. Criar/editar/deletar áreas (admin)
32. Criar/editar/deletar professores (admin)
33. Criar/editar/deletar turmas (admin)
34. Criar/editar/deletar formação (admin)
35. Gerir admins locais da escola (admin)
36. Visualizar solicitações pendentes (admin)
37. Editar perfil (coordinator/teacher)

### Gerenciamento de Escolas (4)
38. Admin do Sistema acessa `/admin/schools`
39. Criar nova escola (form + save + send email)
40. Editar configuração da escola
41. Deletar escola (com aviso)

### Onboarding (3)
42. Novo admin-escola vê setup stepper (5 passos)
43. Completar setup salva `meta/config` atomicamente
44. Redirecionar para settings após setup

### Seletor de Escola (2)
45. Exibir badge da escola atual no navbar
46. Trocar de escola via dropdown

### Validações & Mitigações (1)
47. Validar schoolId antes de executar queries

