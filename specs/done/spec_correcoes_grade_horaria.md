# Spec: Correções — Grade Horária da Escola (SchoolSchedulePage)

## Visão Geral
Correções de bugs e ajustes de UI/UX na página `/school-schedule` e na geração de PDFs de grade horária. A página existe mas não exibe dados (bug de comparação de tipos), possui classes CSS inexistentes no tema e o conteúdo das células não se adapta ao filtro ativo.

## Stack Tecnológica
- Frontend: React 18 + Vite + Tailwind CSS
- Tema: classes customizadas (`bg-surf`, `bg-surf2`, `border-bdr`, `inp`, `card`, `btn`) — NÃO usar variantes genéricas como `bg-surface`, `border-border`, `input`
- Dados: Zustand (`useAppStore`) + Firebase Firestore

---

## Páginas e Rotas

### SchoolSchedulePage — `/school-schedule`

**Descrição:** Grade horária consolidada da escola com filtros por professor e turma. Exibida para todos os clientes do site.

**Componentes:**
- `SchoolGrid`: tabela JSX que renderiza a grade de um segmento (linhas = aulas, colunas = dias da semana)
- Sidebar de filtros (desktop) / accordion (mobile)
- Botão "Exportar PDF"

**Behaviors:**

- [ ] **B1 — Corrigir comparação de `s.day`**: em `SchoolGrid`, a linha `const day = dayIdx + 1` compara número com string. `s.day` armazenado no Firestore é uma string como `'Segunda'`, `'Terça'`, etc. (mesmo padrão de `CalendarPage` e `CalendarDayPage`). Corrigir para `const day = DAYS[dayIdx]`.

- [ ] **B2 — Corrigir classes CSS inexistentes no tema**: substituir todas as ocorrências de classes inválidas em `SchoolSchedulePage.jsx`:
  - `border-border` → `border-bdr`
  - `bg-surface` → `bg-surf`
  - `bg-surface2` → `bg-surf2`
  - `className="input"` (nos `<select>`) → `className="inp"`
  Essas classes inexistentes causam a grade "flutuando" (sem bordas visíveis) e textos com contraste insuficiente.

- [ ] **B3 — Conteúdo de célula adaptado ao filtro ativo**:
  - **Visão por professor** (`filterTeacher` selecionado): célula exibe apenas `Turma • Disciplina` — o nome do professor já está no contexto da grade
  - **Visão por turma ou sem filtro** (`filterTurma` selecionado, ou nenhum filtro): célula exibe `Professor • Disciplina`
  - **Ambos os filtros** (professor + turma): célula exibe `Turma • Disciplina` (professor no título)
  - Passar prop `showTeacher` para `SchoolGrid` baseada em `!filterTeacher`

- [ ] **B4 — Encapsular grade em card**: cada bloco de segmento na grade principal deve ter o cabeçalho (`seg.name — turnoLabel`) e a tabela dentro de um container `card` com `p-4`, para delimitar visualmente o espaço.

---

### PDF — `generateSchoolScheduleHTML` e `_wrap`

**Descrição:** Geração do PDF de grade horária. O título principal (`.doc-ttl`) está hardcoded como `"GestãoEscolar — Relatório de Substituições"` em `_wrap`, o que é incorreto para PDFs de grade.

**Behaviors:**

- [ ] **B5 — Corrigir título do PDF**: `_wrap` (linha 60 de `reports.js`) tem `.doc-ttl` hardcoded `"GestãoEscolar — Relatório de Substituições"`. Adicionar parâmetro opcional `docTitle` a `_wrap`:
  ```js
  function _wrap(title, metaHTML, bodyHTML, docTitle = 'GestãoEscolar — Relatório de Substituições')
  ```
  Usar `docTitle` na linha `.doc-ttl`. Retrocompatível — todos os callers existentes continuam sem passar `docTitle` e recebem o título padrão.

- [ ] **B6 — `generateSchoolScheduleHTML` passar `docTitle`**: chamar `_wrap` com `docTitle = 'GestãoEscolar — Grade Horária'` para que o PDF de grade exiba o cabeçalho correto.

- [ ] **B7 — `generateTeacherScheduleHTML` passar `docTitle`**: idem — usar `'GestãoEscolar — Grade Horária'`.

- [ ] **B8 — Conteúdo das células do PDF adaptado ao filtro**:
  - `_scheduleGrid` já tem parâmetro `showTeacher` (boolean)
  - `generateSchoolScheduleHTML` já chama `_scheduleGrid(seg, turnoSeg, filtered, store, true)` — mostra professor sempre
  - Ajustar para: se `filter.teacherId` presente → `showTeacher = false`; caso contrário → `showTeacher = true`
  - Isso alinha o PDF com o comportamento visual da página (B3)

---

## Componentes Compartilhados

- `SchoolGrid` (`SchoolSchedulePage.jsx`) — tabela JSX de grade: afetado por B1, B2, B3, B4
- `_wrap` (`reports.js`) — casca HTML dos PDFs: afetado por B5
- `_scheduleGrid` (`reports.js`) — tabela HTML de grade para PDF: afetado por B8
- `generateSchoolScheduleHTML` (`reports.js`) — afetado por B6, B8
- `generateTeacherScheduleHTML` (`reports.js`) — afetado por B7

## Modelos de Dados

**Schedule** (sem alteração):
- `id`, `teacherId`, `subjectId`, `turma`, `day` (string: `'Segunda'`…`'Sexta'`), `timeSlot` (`"${segId}|${turno}|${aulaIdx}"`)

## Regras de Negócio

1. `s.day` é sempre string label do dia (`'Segunda'` a `'Sexta'`) — nunca número
2. Quando professor está no título/contexto, a célula não repete o nome
3. PDF de grade horária não é "Relatório de Substituições" — são documentos distintos

## Fora do Escopo (v1)
- Alteração do layout de filtros (sidebar/accordion já funciona)
- Paginação ou agrupamento adicional da grade
- Novos campos no schedule
