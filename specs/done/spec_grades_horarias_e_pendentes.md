# Spec: Grades Horárias, Exportação PDF e Melhorias de Fluxo

## Visão Geral

Quatro melhorias interligadas:
1. **Página de Grade Pessoal** — professor (ou admin) acessa a grade de um professor em página dedicada, com exportação PDF
2. **Grade da Escola** — nova visão global dos horários com filtros por turma e por professor, com exportação PDF
3. **AbsencesPage** — ao marcar falta, exibir automaticamente ambos os turnos do professor; relatório com grade por turno
4. **PendingPage** — após seleção de matérias, professor preenche sua grade horária antes de aguardar aprovação; layout de duas colunas em desktop

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Estado:** Zustand (`useAppStore`, `useAuthStore`)
- **PDF:** `openPDF` + funções HTML em `src/lib/reports.js` (padrão já existente)
- **Componentes reutilizados:** `ScheduleGrid`, `ScheduleGridModal`, `AddScheduleModal` (todos em `SettingsPage.jsx`)

---

## Páginas e Rotas

---

### 1. SchedulePage — `/schedule` (nova página)

**Descrição:** Exibe a grade horária de um professor específico em página dedicada. Admin acessa via parâmetro `?teacherId=xxx`; professor logado vê a própria grade. Reutiliza `ScheduleGrid` e `AddScheduleModal` exportados de `SettingsPage.jsx`.

**Componentes:**
- `ScheduleGrid` — grade semanal do professor (já existente, será exportado)
- `BotãoExportarPDF` — abre PDF da grade pessoal via `openPDF`

**Behaviors:**
- [ ] Admin clica em "Ver Grade" no card de um professor em `TabTeachers` → navega para `/schedule?teacherId=xxx`
- [ ] Professor logado clica em "Minha Grade" no `HomePage` → navega para `/schedule`
- [ ] A grade exibe todos os segmentos do professor (manhã e/ou tarde), lado a lado em desktop
- [ ] Admin pode clicar em um slot da grade e adicionar/editar horário (mesmo `AddScheduleModal` existente)
- [ ] Botão "Exportar PDF" gera documento com cabeçalho `GestãoEscolar — Grade Horária` + nome do professor + data de geração
- [ ] PDF exibe uma tabela por segmento: colunas = dias da semana (Seg–Sex), linhas = aulas (1ª–7ª), células = `Turma • Disciplina`
- [ ] Botão "Voltar" retorna à página anterior (`history.back()`)

---

### 2. SchoolSchedulePage — `/school-schedule` (nova página)

**Descrição:** Visão consolidada de todos os horários da escola. Filtros por turma e por professor. Exclusiva para admin.

**Componentes:**
- `FiltroTurma` — select/chips com todas as turmas disponíveis (derivadas de `schedules`)
- `FiltroProfessor` — select com todos os professores
- `TabelaGradeEscola` — tabela estilo grade: linhas = aulas, colunas = dias, células = `Professor • Disciplina` (filtrada)
- `BotãoExportarPDF` — exporta a visão atual com os filtros ativos

**Behaviors:**
- [ ] Página carrega com todos os horários sem filtro aplicado
- [ ] Admin seleciona um professor → grade filtra para mostrar apenas as aulas daquele professor
- [ ] Admin seleciona uma turma → grade filtra para mostrar apenas as aulas daquela turma
- [ ] Filtros são independentes e cumulativos (professor + turma ao mesmo tempo)
- [ ] Botão "Limpar filtros" reseta para visão completa
- [ ] Botão "Exportar PDF" abre relatório com cabeçalho `GestãoEscolar — Grade da Escola` + filtros aplicados + tabela filtrada
- [ ] Em desktop, filtros ficam em sidebar lateral (esquerda); grade ocupa o restante
- [ ] Em mobile, filtros ficam em accordion acima da grade

---

### 3. HomePage — `/home` (melhorias)

**Descrição:** Cards de ação para o professor logado. Adicionar card de acesso à grade pessoal.

**Behaviors:**
- [ ] Card "Minha Grade" com ícone 📅 leva para `/schedule`
- [ ] Card "Minha Grade" é exibido apenas para professores com `schedules` cadastrados

---

### 4. AbsencesPage — `/absences` (melhorias)

**Descrição:** Melhorias em dois pontos: (a) professor com dois turnos vê ambas as grades automaticamente; (b) ao marcar falta, visualiza todas as aulas daquele dia.

#### 4a. Exibição automática de dois turnos

**Behaviors:**
- [ ] Ao selecionar um professor em "Por Professor", verificar se ele tem horários em mais de um segmento (turnos distintos)
- [ ] Se sim, exibir automaticamente as grades dos dois turnos abaixo da lista de faltas (sem necessidade de ação extra)
- [ ] As grades são somente-leitura (não permitem edição de horário nesta página)
- [ ] Em desktop, as duas grades ficam lado a lado; em mobile, empilhadas

#### 4b. Visualização das aulas do dia ao marcar falta

**Behaviors:**
- [ ] Na modal de criação de falta, ao selecionar um dia, exibir um painel com as aulas cadastradas daquele professor naquele dia (`schedules` onde `day` bate com o dia da semana selecionado)
- [ ] As aulas aparecem como chips/cards clicáveis: `Turma • Disciplina • Horário`
- [ ] Clicar em uma aula a seleciona como a aula de ausência (preenche os campos automaticamente)
- [ ] Se o professor não tiver aulas cadastradas naquele dia, exibir mensagem "Nenhuma aula cadastrada para esse dia"

#### 4c. PDF com grade por turno

**Behaviors:**
- [ ] No relatório por professor (botão "PDF" em ViewByTeacher), se o professor tiver dois turnos, gerar uma seção de grade horária para cada turno antes da lista de ausências
- [ ] Cabeçalho da grade no PDF: `Grade Horária — [Segmento] — [Turno]`
- [ ] A grade no PDF usa o mesmo layout de tabela: linhas = aulas, colunas = dias

---

### 5. PendingPage — `/pending` (melhorias)

**Descrição:** Após o professor enviar celular e matérias, em vez de ir direto para a tela "Aguardando aprovação", ele é conduzido para um passo intermediário onde preenche sua grade horária. Em desktop, aproveitamento de layout horizontal.

**Behaviors:**
- [ ] Fluxo de steps: `form` → `schedule` → `waiting`
- [ ] Ao clicar "Enviar cadastro" com dados válidos, salva no Firestore e vai para step `schedule`
- [ ] No step `schedule`: exibe o título "Monte sua grade de horários" + subtítulo "Isso ajuda a escola a organizar substituições"
- [ ] No step `schedule`, a grade usa o mesmo `ScheduleGrid` + `AddScheduleModal` existente, com o `teacher` sintético construído a partir de `user.uid` e `selectedSubjs`
- [ ] Botão "Concluir" (ou "Pular por agora") avança para step `waiting`
- [ ] Os horários adicionados no step `schedule` são salvos via `saveDoc('schedules', ...)` imediatamente (mesmo comportamento de `AddScheduleModal`)
- [ ] Em desktop (≥ lg): layout de duas colunas — esquerda: form de matérias; direita: grade horária — ocupando toda a largura disponível
- [ ] Em mobile: form em cima, grade abaixo (empilhado)
- [ ] Step `waiting` mantém comportamento atual; se o professor já passou pelo schedule, exibe também um resumo da grade preenchida

---

## Componentes Compartilhados

- `ScheduleGrid` — exportado de `SettingsPage.jsx` para uso em `SchedulePage.jsx` e `PendingPage.jsx`
- `ScheduleGridModal` — exportado já (usado em `TabProfile`)
- `AddScheduleModal` — exportado de `SettingsPage.jsx` para uso em `SchedulePage.jsx` e `PendingPage.jsx`
- `openPDF` + novas funções `generateTeacherScheduleHTML` e `generateSchoolScheduleHTML` em `src/lib/reports.js`

---

## Modelos de Dados

Sem alteração de modelos. As novas páginas operam sobre `schedules`, `teachers`, `subjects`, `areas`, `segments` e `periodConfigs` já existentes.

**Schedule** (já existente):
```js
{ id, teacherId, segId, turno, aulaIdx, day, turma, subjectId }
```

---

## Regras de Negócio

### PDF de grade horária (novo)
- Tabela: colunas = `['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']`
- Linhas = uma por aula (`aulaIdx` 0..N), célula = `Turma • Disciplina` ou vazio
- Cabeçalho igual ao existente: `GestãoEscolar — Grade Horária` + metadados
- Um bloco de tabela por segmento (quando professor tem dois turnos)

### Grade da Escola (novo)
- Agrupa por `(segId, turno, aulaIdx, day)` → lista de `{ professor, turma, disciplina }`
- Filtro por turma: `schedules.turma === filtroTurma`
- Filtro por professor: `schedules.teacherId === filtroTeacherId`

### Dois turnos em AbsencesPage
- Detectar via `store.schedules.filter(s => s.teacherId === t.id)` → extrair `[...new Set(s.map(s => s.segId))]`
- Se `relevantSegments.length > 1` → renderizar duas grades

### Grade no PendingPage
- `teacher` sintético: `{ id: pendingUid, subjectIds: selectedSubjs, name: user.displayName }`
- Os schedules são gravados em Firestore imediatamente ao adicionar — mesmo fluxo do `AddScheduleModal`
- Ao ser aprovado, os schedules já existem vinculados ao `id` que será reutilizado na coleção `teachers`

---

## Fora do Escopo

- Edição de grade horária da escola como um todo (só visualização + filtro + PDF)
- Exportação em formato Excel/CSV
- Notificações ao admin quando professor preenche grade no passo `schedule` do pending
- Página de grade para usuários não autenticados
