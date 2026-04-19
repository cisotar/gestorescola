# Spec: GestãoEscolar

## Visão Geral

Sistema web de gestão escolar para coordenar a grade horária de professores, registrar ausências e organizar substituições. Permite que administradores e coordenadores configurem segmentos, disciplinas e horários, enquanto professores consultam sua grade e solicitam aprovações. O sistema também calcula automaticamente o ranking de candidatos a substituto e gera relatórios em PDF.

## Stack Tecnológica

- **Frontend:** React 18.3.1 + React Router 6 (SPA)
- **Estado:** Zustand 4.5.4
- **Backend:** Firebase (Firestore + Authentication)
- **Estilização:** Tailwind CSS 3.4 com tokens customizados
- **Build:** Vite 5.4
- **Hosting:** Firebase Hosting (`gestordesubstituicoes-react.web.app`)
- **PDFs:** `window.print()` com HTML/CSS gerado via `src/lib/reports.js`

---

## Papéis de Usuário

| Role | Quem é | Acesso |
|---|---|---|
| `admin` | Diretor / Equipe técnica | Total — configura tudo, aprova ações |
| `coordinator` | Coordenador Geral | Acesso às páginas admin; ações submetidas para aprovação; só turmas compartilhadas |
| `teacher-coordinator` | Professor Coordenador | Acesso às páginas admin; ações submetidas para aprovação; qualquer turma |
| `teacher` | Professor | Consulta própria grade, ausências e substituições |
| `pending` | Candidato a professor | Aguarda aprovação na PendingPage |

---

## Páginas e Rotas

### Login — `/` (redireciona)
**Descrição:** Tela de entrada com autenticação Google.

**Behaviors:**
- [ ] Clicar "Entrar com Google" abre popup OAuth do Google
- [ ] Após login bem-sucedido, redireciona conforme role: admin/coordinator → `/dashboard`; teacher → `/home`; pending → aguarda
- [ ] Se o popup for fechado sem login, nenhuma ação

---

### PendingPage — `/` (role: pending)
**Descrição:** Tela de espera para professores aguardando aprovação do admin.

**Componentes:**
- Formulário opcional de telefone/celular e seleção de disciplinas
- Botão de salvar dados complementares

**Behaviors:**
- [ ] Exibir mensagem informando que o acesso está pendente
- [ ] Preencher e salvar celular/WhatsApp (persiste em `pending_teachers/{uid}`)
- [ ] Selecionar disciplinas de interesse
- [ ] Quando o admin aprova, a página atualiza automaticamente e redireciona

---

### HomePage — `/home` (role: teacher)
**Descrição:** Painel do professor com resumo do mês.

**Componentes:**
- Cards de estatísticas (aulas na semana, faltas, substituições no mês)
- ActionCards para navegação rápida
- Card "Minha Grade" com link para `/schedule`

**Behaviors:**
- [ ] Ver contagem de aulas semanais, faltas e substituições do mês atual
- [ ] Acessar grade horária individual
- [ ] Acessar AbsencesPage

---

### DashboardPage — `/dashboard` (role: admin/coordinator)
**Descrição:** Painel administrativo com alertas e visão geral da escola.

**Componentes:**
- KPIs de carga horária (professores com carga acima do limite de alerta/perigo)
- Lista de professores com sobrecarga
- Histórico recente de substituições
- Atalhos para páginas frequentes

**Behaviors:**
- [ ] Ver alertas de sobrecarga (warn ≥ limite de alerta; danger ≥ limite máximo)
- [ ] Ver quantos professores estão acima de cada limite
- [ ] Navegar para configurações de carga horária

---

### CalendarPage — `/calendar` (role: admin/coordinator)
**Descrição:** Calendário semanal interativo por professor para registrar ausências e atribuir substitutos.

**Componentes:**
- `TeacherSidebar`: lista de professores com busca e filtro por segmento
- `WeekHeader`: navegação por semanas (← semana → + "hoje")
- `ScheduleGrid`: grade do professor selecionado (dias × aulas)
- `DayModal`: modal de um dia específico com slots, botões de falta, substituto e ranking
- `RangeAbsenceBar`: barra para marcar ausência em intervalo de datas

**Behaviors:**
- [ ] Selecionar professor na sidebar para ver sua grade semanal
- [ ] Navegar entre semanas com botões ← → ou clicar "Hoje"
- [ ] Clicar em um dia para abrir o DayModal
- [ ] Marcar slot como ausente (cria registro em `absences`)
- [ ] Ver ranking de candidatos a substituto com score de compatibilidade (mesma matéria/área/segmento)
- [ ] Atribuir substituto a um slot — escolha do ranking ou qualquer professor
- [ ] Remover ausência ou substituto de um slot
- [ ] Marcar ausência em intervalo de datas (RangeAbsenceBar)
- [ ] Limpar todos os substitutos de um dia
- [ ] Gerar histórico ao confirmar substituição (salva em `history`)

---

### CalendarDayPage — `/calendar/day` (mobile, role: admin)
**Descrição:** Visão mobile do calendário: um dia por vez com swipe.

**Behaviors:**
- [ ] Navegar entre dias da semana com pills clicáveis
- [ ] Ver cards de período colapsáveis com status de cada slot
- [ ] Marcar ausente / atribuir substituto no mobile

---

### AbsencesPage — `/absences` (role: admin/coordinator/teacher)
**Descrição:** Relatório de ausências em 4 abas com filtros e exportação PDF.

**Componentes:**
- `SubFilterToolbar`: filtros de substituto, segmento, turma e mês/ano
- `ViewByTeacher`: tabela por professor com contagem de faltas e substitutos
- `ViewByDay`: lista agrupada por data
- `ViewByWeek`: agrupamento por semana
- `ViewByMonth`: agrupamento por mês
- `TeacherSubCard`: card de detalhe do professor (extrato de faltas + slots)
- `SubSlotRow`: linha de ausência com info de slot, substituto e ações

**Behaviors:**
- [ ] Filtrar por substituto, segmento, turma, mês e ano
- [ ] Alternar entre as 4 abas de visualização
- [ ] Clicar num professor para ver extrato detalhado de suas faltas
- [ ] Selecionar múltiplos slots para operações em lote (atribuir/remover substituto)
- [ ] Desfazer operação em lote (undo)
- [ ] Exportar relatório da aba atual em PDF
- [ ] Enviar resumo de ausências por WhatsApp

---

### SubstitutionsPage — `/substitutions` (role: admin/coordinator/teacher)
**Descrição:** Relatório consolidado de substituições com múltiplas visões e ranking.

**Componentes:**
- `SubFilterToolbar`: filtros de segmento, turma, mês/ano
- 5 abas: Por Substituto / Por Dia / Por Semana / Por Mês / Ranking
- Botões de PDF para cada aba

**Behaviors:**
- [ ] Filtrar substituições por segmento, turma, mês e ano
- [ ] Ver extrato por substituto (quantas subs, quais dias/slots)
- [ ] Ver substituições agrupadas por dia
- [ ] Ver substituições agrupadas por semana / mês
- [ ] Ver ranking de substitutos com carga total do mês
- [ ] Exportar cada visão em PDF
- [ ] Enviar por WhatsApp

---

### SchedulePage — `/schedule` (role: admin/teacher)
**Descrição:** Grade horária individual de um professor com exportação PDF.

**Behaviors:**
- [ ] Professor vê sua própria grade (todas as semanas)
- [ ] Admin acessa via `?teacherId=...` para ver grade de qualquer professor
- [ ] Alternar entre nome e apelido nas células
- [ ] Exportar grade em PDF

---

### SchoolSchedulePage — `/school-schedule` (role: admin/coordinator)
**Descrição:** Grade horária geral da escola — todos os segmentos, com filtros.

**Componentes:**
- `SchoolGrid`: grade de dias × aulas com células mostrando professor/turma/matéria
- Filtros de segmento e turma
- Toggle nome/apelido nas células

**Behaviors:**
- [ ] Filtrar por segmento e turma
- [ ] Alternar exibição de nome / apelido dos professores nas células
- [ ] Exportar grade da escola em PDF

---

### SettingsPage — `/settings` (role: admin/coordinator/teacher)
**Descrição:** Central de configurações com abas diferenciadas por perfil.

#### Abas do Admin/Coordinator (8 abas):

**🏫 Segmentos**
- [ ] Criar e remover segmentos (ex: Fundamental I, Médio)
- [ ] Definir turno (manhã/tarde) por segmento
- [ ] Adicionar e remover anos/séries por segmento
- [ ] Adicionar e remover turmas por série

**📚 Disciplinas**
- [ ] Criar áreas de conhecimento com cor e segmentos associados
- [ ] Adicionar e remover matérias por área
- [ ] Salvar área com lista de matérias (migra schedules afetados)
- [ ] Remover área (com mapa de substituição de matérias)

**🧩 Turmas Compartilhadas**
- [ ] Criar séries de formação compartilhada (ex: FORMAÇÃO)
- [ ] Adicionar e remover atividades por série (ex: ATPCG, Multiplica)
- [ ] Remover série de formação

**👩‍🏫 Professores**
- [ ] Listar professores aprovados com busca
- [ ] Adicionar novo professor manualmente
- [ ] Editar nome, apelido, email, celular, disciplinas e perfil
- [ ] Remover professor (apaga schedules órfãos)
- [ ] Aprovar/rejeitar professores pendentes com seleção de perfil (teacher/coordinator/teacher-coordinator)
- [ ] Ver e editar grade horária de cada professor

**⏰ Períodos**
- [ ] Configurar horário de início e duração das aulas por segmento/turno
- [ ] Definir quantidade de aulas e intervalos

**🗓 Horários**
- [ ] Adicionar aula a um professor (dia, slot, turma, matéria)
- [ ] Editar ou remover aula existente
- [ ] Ver grade completa de cada professor na aba

**✅ Aprovação (admin apenas)**
- [ ] Aprovar ou rejeitar professores pendentes com seleção de perfil
- [ ] Gerenciar lista de administradores (adicionar/remover)

**🔔 Aprovações Pendentes (admin apenas)**
- [ ] Ver lista de ações submetidas por coordenadores aguardando aprovação
- [ ] Aprovar ação → executa no store e marca como aprovada
- [ ] Rejeitar ação com motivo → marca como rejeitada
- [ ] Badge com contagem de pendentes no tab

#### Aba do Professor (1 aba):

**👤 Meu Perfil**
- [ ] Ver e editar celular, WhatsApp, apelido
- [ ] Ver e editar disciplinas (matérias que ministra)
- [ ] Ver grade horária própria

---

### WorkloadPage — `/workload` (role: admin/coordinator)
**Descrição:** Tabela de carga horária de todos os professores com indicadores visuais.

**Behaviors:**
- [ ] Ver lista ordenada alfabeticamente de todos os professores
- [ ] Ver aulas/semana de cada professor com barra de progresso colorida (verde/âmbar/vermelho)
- [ ] Ver total de faltas e substituições do período
- [ ] Coordenador Geral exibe badge "fora do cômputo" (não entra no ranking de substitutos)

---

## Componentes Compartilhados

| Componente | Uso |
|---|---|
| `Modal` | Todos os modais do sistema (overlay + Escape to close + scroll interno) |
| `ActionCard` | Cards de navegação rápida em HomePage e DashboardPage |
| `Toast` | Feedbacks temporários de sucesso/erro/aviso (bottom-center, auto-hide 3s) |
| `Spinner` | Tela de loading durante inicialização |
| `Navbar` | Navegação desktop (tabs) + mobile (hamburger com overlay) |
| `Layout` | Wrapper Navbar + Outlet com max-width 1400px |
| `ScheduleGrid` | Grade horária reutilizada em SettingsPage e SchedulePage |
| `AddScheduleModal` | Modal de adicionar/editar aula, usado pelo admin e pelos coordenadores |

---

## Modelos de Dados

### `meta/config` (documento único)
| Campo | Tipo | Descrição |
|---|---|---|
| `segments` | array | Segmentos com séries e turmas |
| `periodConfigs` | object | Configuração de períodos por segmento/turno |
| `areas` | array | Áreas de conhecimento |
| `subjects` | array | Disciplinas (vinculadas a uma área) |
| `sharedSeries` | array | Turmas de formação compartilhada |
| `workloadWarn` | number | Limite de alerta de carga (default: 20) |
| `workloadDanger` | number | Limite de perigo de carga (default: 26) |

### `teachers/{id}`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | UUID gerado por `uid()` |
| `name` | string | Nome completo |
| `apelido` | string? | Apelido exibido nas grades |
| `email` | string | Email (lowercase) |
| `celular` | string | Telefone |
| `whatsapp` | string | WhatsApp |
| `subjectIds` | string[] | IDs das disciplinas |
| `status` | string | `'approved'` |
| `profile` | string | `'teacher'` \| `'coordinator'` \| `'teacher-coordinator'` |

### `schedules/{id}`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | UUID |
| `teacherId` | string | Referência ao teacher |
| `day` | string | `'Segunda'` … `'Sexta'` |
| `timeSlot` | string | `'segId\|turno\|aulaIdx'` |
| `turma` | string | Nome da turma ou série de formação |
| `subjectId` | string? | ID da disciplina |

### `absences/{id}`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | UUID |
| `teacherId` | string | Professor ausente |
| `createdAt` | timestamp | Data de criação |
| `status` | string | `'open'` \| `'partial'` \| `'covered'` |
| `slots` | array | Lista de slots ausentes (ver abaixo) |

**Slot de ausência:**
| Campo | Tipo |
|---|---|
| `id` | string |
| `date` | ISO string `'YYYY-MM-DD'` |
| `day` | string `'Segunda'`…`'Sexta'` |
| `timeSlot` | string |
| `scheduleId` | string? |
| `subjectId` | string? |
| `turma` | string |
| `substituteId` | string? |

### `pending_actions/{id}`
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | UUID |
| `coordinatorId` | string | ID do professor/coordinator |
| `coordinatorName` | string | Nome para exibição |
| `action` | string | Nome da action do store (ex: `'addSchedule'`) |
| `payload` | object | Parâmetros da action |
| `summary` | string | Descrição legível da ação |
| `status` | string | `'pending'` \| `'approved'` \| `'rejected'` |
| `reviewedBy` | string? | Email do admin que revisou |
| `rejectionReason` | string? | Motivo da rejeição |

---

## Regras de Negócio

1. **Coordenador Geral (`profile: 'coordinator'`) não pode ter aulas regulares** — apenas turmas de formação compartilhada (`sharedSeries`) são permitidas na grade
2. **Coordenador Geral não entra no ranking de substitutos** — é excluído de `rankCandidates()` pelo campo `profile`
3. **Ações de coordinators são submetidas como `pending_actions`** — o store intercepta via `_isCoordinator()` e chama `_submitApproval()` em vez de executar direto
4. **Ranking de substitutos** prioriza: (0) mesma matéria + mesmo segmento → (1) mesma matéria → (2) mesma área + mesmo segmento → (3) mesma área → (4) outra área; desempate por menor carga mensal
5. **Carga mensal** = aulas regulares dadas no mês + substituições realizadas no mês
6. **Formato de slot** `"segId|turno|aulaIdx"` — único por segmento/turno/horário
7. **Admins hardcoded** (`contato.tarciso@gmail.com`, `tarciso@prof.educacao.sp.gov.br`, `fernandamarquesi@prof.educacao.sp.gov.br`) não precisam estar na coleção `admins`
8. **Cache localStorage** (`gestao_v7_cache`) com TTL de 1h — fallback quando Firestore está offline
9. **Professores removidos** têm seus schedules órfãos deletados automaticamente
10. **Matérias removidas de uma área** migram schedules afetados via mapa de "de-para"

---

## Fora do Escopo (v1)

- Notificações push / email para coordenadores quando ação é aprovada/rejeitada
- Histórico de alterações (audit log) por ação
- Multi-escola (um único Firebase project por escola)
- App mobile nativo (apenas PWA responsivo)
- Integração com sistemas de RH ou ponto eletrônico
- Criação de turmas/segmentos por coordenadores (hoje é admin-only mesmo com guards)
- Substituições aceitas/recusadas pelos próprios professores
