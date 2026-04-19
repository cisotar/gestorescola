# Spec: Refatoração de /schedule para /grades

## Visão Geral

Consolidar a exibição de grades horárias em uma única página `/grades` com duas abas (Por Professor e Por Turma), eliminando a duplicação entre `SchedulePage` e `SchoolSchedulePage`. A nova estrutura permitirá visualização flexível de grades com filtros por professor/turma, diagonais de expediente para professores com turno duplo, e geração de PDFs específicos por seleção.

### Problema que resolve

1. **Duplicação de código:** `SchedulePage` (grade individual) e `SchoolSchedulePage` (grade coletiva) compartilham `ScheduleGrid` mas têm estruturas divergentes
2. **Falta de filtro cruzado:** Não há forma de filtrar grade de turma por professor específico
3. **Navegação confusa:** Usuários veem dois cards diferentes para "Grade Horária" vs "Grade da Escola"
4. **PDF sem contexto:** Relatórios não refletem claramente a seleção aplicada (turma + professor opcional)

### Resultado esperado

Uma página unificada `/grades` onde:
- **Aba "Por Professor":** Dropdown de professor → exibe grade individual com diagonais de expediente se turno duplo → PDF mostra tabela entrada/saída + grade separada por períodos
- **Aba "Por Turma":** Dropdown de turma → Dropdown opcional de filtro por professor → exibe grade da turma → PDF reflete a seleção (turma ou turma+professor)

---

## Stack Tecnológica

- **Frontend:** React 18.3.1 + React Router 6.26.0
- **Estado:** Zustand 4.5.4 (`useAppStore`, `useAuthStore`)
- **UI/CSS:** Tailwind CSS 3.4.10 + classes utilitárias customizadas
- **Relatórios:** `lib/reports.js` — geração de HTML com `window.print()`
- **Períodos:** `lib/periods.js` — serialização de slots e cálculo de horários
- **Persistência:** Firebase Firestore 10.12.2 (teachers, schedules)

---

## Páginas e Rotas

### Grades — `/grades`

**Descrição:** Página unificada de visualização de grades horárias com duas abas independentes. Ambas as abas permitem geração de PDF com contexto da seleção atual.

**Estrutura de state (local):**
```js
const [activeTab, setActiveTab] = useState('professor') // 'professor' | 'turma'

// Aba "Por Professor"
const [selectedTeacherId, setSelectedTeacherId] = useState(null)

// Aba "Por Turma"
const [selectedTurma, setSelectedTurma] = useState(null)
const [professorFilter, setProfessorFilter] = useState(null) // opcional
```

**Componentes:**
- `GradesHeader`: Título + navegação voltar
- `GradesTabs`: Abas "Por Professor" e "Por Turma" com indicadores de seleção
- `TabProfessor`: Dropdown de professor + grade individual + botão PDF
- `TabTurma`: Dropdown de turma + Dropdown de professor (opcional) + grade da turma + botão PDF
- `ScheduleGrid`: Reutilizado de `SettingsPage` — exibe matriz de horários (existente)

**Behaviors:**

#### ABA 1: "Por Professor"

- [ ] **Ao abrir a aba:** Carregar lista de professores aprovados (`store.teachers` com `status === 'approved'`) ordenados alfabeticamente
- [ ] **Ao selecionar professor via dropdown:** 
  - Atualizar `selectedTeacherId` 
  - Listar pares únicos `segmentId|turno` do professor via `store.schedules.filter(s => s.teacherId === id)`
  - Detectar turno duplo: se há 2+ turnos distintos entre os pares, ativar modo separado
  - Renderizar grade(s) via `<ScheduleGrid>`
- [ ] **Exibir diagonais de expediente:** Se `teacher.horariosSemana` está preenchido, mostrar linhas de "Disponibilidade" (início/fim) abaixo da primeira aula de cada dia
- [ ] **Separar períodos em turno duplo:** Se turno duplo:
  - Renderizar `<GradeTurnoCard>` separado para cada turno (ex: uma seção para "Manhã", outra para "Tarde")
  - Cada seção mostra: nome do segmento + label de turno + ScheduleGrid filtrada por `segmentId|turno`
- [ ] **Gerar PDF:** Ao clicar em "Exportar PDF":
  - Chamar `generateGradesProfessorHTML(professor, selectedTurnos, store)` (nova função em `reports.js`)
  - Em turno duplo: gerar páginas separadas por período com tabela de entrada/saída se disponível
  - Incluir timestamp e contexto (nome professor, segmento, turno)
- [ ] **Validação:** Se nenhum professor selecionado, exibir mensagem "Selecione um professor para visualizar a grade"

#### ABA 2: "Por Turma"

- [ ] **Ao abrir a aba:** Carregar lista de turmas únicas (`allTurmaObjects(store.segments)`) ordenadas por segmento/série/letra
- [ ] **Ao selecionar turma via dropdown:** 
  - Atualizar `selectedTurma`
  - Carregar schedules da turma: `store.schedules.filter(s => s.turma === selectedTurma)`
  - Limpar filtro de professor (reset `professorFilter` para `null`)
  - Renderizar grade via `<ScheduleGrid>`
- [ ] **Filtro opcional de professor:** 
  - Dropdown secundário: "Filtrar por professor (opcional)"
  - Ao selecionar professor: filtrar schedules da turma para apenas `s.teacherId === selectedProfessor`
  - Atualizar `professorFilter` e re-renderizar grade
  - Opção "Limpar filtro" reseta para `null` e exibe grade completa
- [ ] **Exibir grade:** Renderizar via `<ScheduleGrid>` com `showTeacher={true}` (para mostrar nomes dos professores nas células)
- [ ] **Gerar PDF:** Ao clicar em "Exportar PDF":
  - Chamar `generateGradesTurmaHTML(turma, professorFilter, store)` (nova função em `reports.js`)
  - Refletir filtro no título/cabeçalho: "Grade de [Turma]" ou "Grade de [Turma] — Professor [Nome]"
  - Incluir lista de aulas/professores se houver filtro ativo
- [ ] **Validação:** Se nenhuma turma selecionada, exibir mensagem "Selecione uma turma para visualizar a grade"

---

## Componentes Compartilhados

### `ScheduleGrid`
- **Origem:** `src/pages/SettingsPage.jsx` (componente interno)
- **Reutilização:** Atualmente usado em `SchedulePage` e `SchoolSchedulePage`; será importado em `GradesPage`
- **Modificações planejadas:** Extrair para `src/components/ui/ScheduleGrid.jsx` para evitar dependência circular de `SettingsPage`
- **Props principais:**
  - `teacher`: objeto completo do professor
  - `store`: store da app
  - `segmentFilter`: `{ segmentId, turno }` — opcional, filtra aulas específicas
  - `showTeacher`: bool — se `true`, exibe nomes dos professores nas células; se `false`, exibe turmas
  - `useApelido`: bool — usar apelido ao invés de nome completo
  - `horariosSemana`: objeto com horários de expediente — opcional

### `GradeTurnoCard`
- **Origem:** `src/pages/SchedulePage.jsx` (componente interno)
- **Reutilização:** Será importada em `GradesPage` para modo turno duplo
- **Responsabilidade:** Renderizar cabeçalho (segmento + turno) + aviso de horários ausentes + ScheduleGrid filtrada

### Novas funções em `lib/reports.js`

#### `generateGradesProfessorHTML(teacher, turnos, store, useApelido = false)`
- **Entrada:** objeto professor, array de turnos `[{ segmentId, turno }, ...]`, store global, flag de apelido
- **Saída:** string HTML completa com doctype
- **Comportamento:**
  - Cabeçalho: "Grade Horária — [Nome do Professor]" + segmento + turno(s)
  - Uma página por turno (se múltiplos)
  - Tabela com dias da semana (columns) × aulas (rows)
  - Se `teacher.horariosSemana` preenchido: linha de "Disponibilidade" com entrada/saída por dia
  - Footer: timestamp, nota de geração
  - CSS @media print para controlar quebras de página

#### `generateGradesTurmaHTML(turma, professorFilter, store, useApelido = false)`
- **Entrada:** nome da turma (string), teacherId opcional (null = sem filtro), store global, flag de apelido
- **Saída:** string HTML completa com doctype
- **Comportamento:**
  - Cabeçalho: "Grade da Turma — [Turma]" ou "Grade da Turma — [Turma] / Professor [Nome]"
  - Uma página única (grades de turma não separam por período)
  - Tabela com dias da semana × aulas
  - Mostra nomes dos professores em cada célula
  - Se filtro de professor ativo: legenda informando "Visualização filtrada por [Professor]"
  - Footer: timestamp
  - CSS @media print para controle de quebra de página

---

## Modelos de Dados

### Teacher (existente)
```js
{
  id:           string,        // uid()
  name:         string,        // nome completo
  email:        string,        // email único
  apelido:      string,        // opcional; alternativa ao nome
  subjectIds:   string[],      // disciplinas que leciona
  status:       "approved",    // status no sistema
  profile:      "teacher" | "coordinator" | "teacher-coordinator",
  horariosSemana: {            // opcional; entrada/saída por dia
    "Segunda": { entrada: "HH:MM", saida: "HH:MM" },
    "Terça":   { entrada: "HH:MM", saida: "HH:MM" },
    // ...
  }
}
```

### Schedule (existente)
```js
{
  id:         string,        // uid()
  teacherId:  string,        // FK → teachers[].id
  day:        string,        // "Segunda" | "Terça" | ...
  timeSlot:   string,        // "segId|turno|aulaIdx" (ex: "seg-fund|manha|3")
  turma:      string,        // "6º Ano A"
  subjectId:  string         // FK → subjects[].id
}
```

### Segment (existente, estrutura hierárquica)
```js
{
  id:      string,     // uid()
  name:    string,     // "Ensino Fundamental"
  turno:   string,     // "manha" | "tarde" | "noite"
  grades: [            // série
    {
      name: "6º Ano",
      classes: [       // turma
        { letter: "A", turno: "manha" },
        { letter: "B", turno: "manha" }
      ]
    }
  ]
}
```

---

## Regras de Negócio

### Acesso à página `/grades`

- **Admin:** Acesso completo a ambas as abas — pode selecionar qualquer professor ou turma
- **Coordinator / Teacher-Coordinator:** Acesso completo a ambas as abas
- **Teacher:** Acesso apenas à aba "Por Professor" com professor pré-selecionado como o próprio (`myTeacher.id`)
  - Não pode alterar a seleção de professor
  - Aba "Por Turma" fica desabilitada ou oculta
- **Pending:** Sem acesso (redirecionamento para `/home`)

### Turno duplo — Exibição em múltiplas páginas

- Professor é considerado "turno duplo" se leciona em 2+ turnos distintos
- No PDF de professor com turno duplo:
  - Cada período em página separada (`page-break-before: always`)
  - Cada página mostra cabeçalho repetido, tabela de entrada/saída (se disponível), grade
  - Rodapé com "Página X de Y"

### Filtro de professor em turma

- O dropdown de filtro é **opcional** — se não selecionado, exibe grade completa da turma
- Ao aplicar filtro, mostra apenas aulas daquele professor na turma especificada
- Se nenhuma aula do professor está na turma, exibir mensagem "Nenhuma aula deste professor nesta turma"

### Diagonais de expediente

- Renderizadas **apenas** em grade de professor (não em turma)
- Exibem entrada/saída por dia da semana (segunda a sexta)
- Derivadas de `teacher.horariosSemana`
- Se ausentes, exibir aviso: "Horários de entrada e saída não cadastrados"

### Ordenação

- **Dropdowns de professor:** Ordem alfabética por `name`
- **Dropdowns de turma:** Ordem hierárquica (Segmento → Série → Letra)
- **Dias da semana:** Sempre Segunda → Sexta (DAYS constant)
- **Horários:** Derivados de `periodConfigs` via `gerarPeriodos()` (sem armazenamento redundante)

---

## Fluxo de Navegação

### Entrada na página

1. Usuário clica em card "Grades Horárias" (renomeado de "Grade da Escola") no HomePage/DashboardPage
2. Navega para `/grades`
3. Se teacher: pré-selecionado em "Por Professor", aba "Por Turma" desabilitada
4. Se admin/coordinator: ambas as abas disponíveis, nenhuma pré-seleção

### Mudança de aba

- `activeTab` state muda
- Dropdowns mantêm estado interno mas não afetam a outra aba
- Ao retornar a uma aba, selecção anterior é restaurada (via state local)

### Mudança de seleção (professor ou turma)

1. Dropdown onChange → atualizar state (`selectedTeacherId` ou `selectedTurma`)
2. Recalcular pares segmentId|turno e renderizar grade(s)
3. Detectar turno duplo → renderizar múltiplas grids se necessário

### Export PDF

1. Botão "Exportar PDF" em qualquer aba
2. Chamar função apropriada (`generateGradesProfessor` ou `generateGradesTurma`)
3. Função retorna HTML completo
4. `openPDF(html)` abre em aba nova
5. Usuário seleciona "Salvar como PDF" no diálogo nativo

---

## Fora do Escopo (v1)

- [ ] **Grade em turno duplo com períodos em abas:** Grade de professor com turno duplo será em páginas separadas do PDF, não em abas na UI
- [ ] **Filtro avançado de turma (por segmento/série):** Apenas dropdown simples de turma completa
- [ ] **Visualização de conflitos de horário:** Não será indicado graficamente se há aulas sobrepostas
- [ ] **Edição in-line de horários:** Página é read-only — CRUD de aulas fica em `SettingsPage`
- [ ] **Sincronização de cache entre abas:** Cada aba gerencia seu estado local; mudanças feitas em `SettingsPage` refletem no reload
- [ ] **Histórico de versões de grade:** Não há versionamento — sempre exibe estado atual
- [ ] **Impressão com múltiplas seleções:** Uma seleção por vez (um professor OU uma turma)
- [ ] **Integração de horários de expediente em turma:** Diagonais de expediente apenas para professor
- [ ] **API de relatórios em formato CSV:** PDFs via `window.print()` são o único formato de export

---

## Migração de Componentes Existentes

### De `SchedulePage.jsx`
- ✅ `GradeTurnoCard` → importar em `GradesPage`
- ✅ Lógica de detecção de turno duplo → mover para `GradesPage` (aba "Por Professor")
- ✅ Botão de PDF com `generateTeacherScheduleHTML` → será usado em aba "Por Professor"

### De `SchoolSchedulePage.jsx`
- ✅ `SchoolGrid` → será substituído por uso direto de `ScheduleGrid` em aba "Por Turma"
- ✅ Filtros de segmento/turno → simplificados para dropdown de turma única

### De `SettingsPage.jsx`
- ✅ `ScheduleGrid` → será extraído e movido para `src/components/ui/ScheduleGrid.jsx`
  - Evita dependência circular entre `SettingsPage` e `GradesPage`
  - Ambas as páginas importam de `components/ui`

### Linhas de código a remover
- `src/pages/SchedulePage.jsx` → será depreciado; alunos que acessam `/schedule` serão redirecionados para `/grades?teacher=<id>`
- `src/pages/SchoolSchedulePage.jsx` → será depreciado; alunos que acessam `/school-schedule` serão redirecionados para `/grades?turma=<id>`
- Navbar links atualizados para apontar para `/grades` com query params opcionais

---

## Plano de Implementação em Fases

### Fase 1: Estrutura Base
1. Criar `src/pages/GradesPage.jsx` com skeleton de abas (sem lógica ainda)
2. Extrair `ScheduleGrid` de `SettingsPage` para `src/components/ui/ScheduleGrid.jsx`
3. Extrair `GradeTurnoCard` de `SchedulePage` para componente reutilizável
4. Atualizar `SettingsPage` para importar de `components/ui`

### Fase 2: Aba "Por Professor"
1. Implementar dropdown de professor
2. Implementar lógica de detecção de turno duplo
3. Renderizar `ScheduleGrid(s)` conforme turno duplo ou não
4. Integrar `generateGradesProfessorHTML` (nova função em `reports.js`)
5. Adicionar botão de PDF e testar export

### Fase 3: Aba "Por Turma"
1. Implementar dropdown de turma (via `allTurmaObjects`)
2. Implementar dropdown opcional de filtro de professor
3. Renderizar `ScheduleGrid` com `showTeacher=true`
4. Integrar `generateGradesTurmaHTML` (nova função em `reports.js`)
5. Adicionar botão de PDF e testar export

### Fase 4: Controle de Acesso e Redirecionamentos
1. Guardar `/grades` para roles apropriados (admin, coordinator, teacher-coordinator, teacher)
2. Implementar lógica de teacher (pré-seleção, aba "Por Turma" desabilitada)
3. Atualizar Navbar: renomear card e apontar para `/grades`
4. Adicionar redirecionamentos legados (`/schedule` → `/grades?teacher=...`, `/school-schedule` → `/grades?turma=...`)

### Fase 5: Testes e Refinamento
1. Testar acesso por role
2. Testar PDFs em cenários: turno simples, turno duplo, com/sem filtro
3. Testar responsividade mobile (dropdowns em tela pequena)
4. Depreciar `SchedulePage` e `SchoolSchedulePage` (ou deixar com redirect)

---

## Resumo de Mudanças em Outras Páginas

### `HomePage.jsx`
- Renomear card "Grade da Escola" para "Grades Horárias"
- Atualizar `onClick` para navegar para `/grades`

### `DashboardPage.jsx`
- Se houver card de acesso rápido à grade, atualizar para `/grades`

### `SettingsPage.jsx`
- Importar `ScheduleGrid` de `src/components/ui/ScheduleGrid.jsx` (após extração)

### `App.jsx` — Rotas
```jsx
<Route path="/grades" element={<GradesPage />} />

// Opcionais: redirecionamentos legados (para compatibilidade)
<Route path="/schedule" element={<SchedulePage />} />         // ainda funciona para back-compat
<Route path="/school-schedule" element={<SchoolSchedulePage />} /> // ainda funciona
```

### `Navbar.jsx`
- Atualizar links que apontam para `/schedule` ou `/school-schedule` para apontar para `/grades`

---

## Checklist de Implementação

- [ ] Criar `GradesPage.jsx` com estrutura base (abas, estado)
- [ ] Extrair `ScheduleGrid` para `components/ui/ScheduleGrid.jsx`
- [ ] Extrair `GradeTurnoCard` para componente ou manter inline
- [ ] Implementar aba "Por Professor" completa
- [ ] Implementar aba "Por Turma" com filtro opcional
- [ ] Criar `generateGradesProfessorHTML()` em `reports.js`
- [ ] Criar `generateGradesTurmaHTML()` em `reports.js`
- [ ] Testar PDFs: turno simples, turno duplo, com/sem filtro
- [ ] Implementar guards de acesso (role-based)
- [ ] Implementar pré-seleção para `teacher` role
- [ ] Atualizar HomePage: renomear card e link
- [ ] Atualizar Navbar: links para `/grades`
- [ ] Testar responsividade mobile
- [ ] Testar redirecionamentos legados (se aplicável)
- [ ] Depreciar ou remover `SchedulePage` / `SchoolSchedulePage` (após validação)

---

## Referências

- **Architecture.md:** Seções 9 (Roteamento), 10 (Páginas), 11 (Lógica de Negócio), 12 (Padrões UI)
- **Reports.js:** Funções `openPDF()`, `generateTeacherScheduleHTML()`, `generateSchoolScheduleHTML()`
- **Periods.js:** `gerarPeriodos()`, `getCfg()`, `makeSlot()`, `parseSlot()`, `resolveSlot()`
- **Helpers.js:** `allTurmaObjects()`, `colorOfTeacher()`, `formatISO()`, `dateToDayLabel()`
- **SettingsPage.jsx:** Componente `ScheduleGrid` (a ser extraído)
