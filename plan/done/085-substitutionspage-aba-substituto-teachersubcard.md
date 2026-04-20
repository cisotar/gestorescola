# Plano Técnico — #85 Aba Substituto (ViewBySubstitute + TeacherSubCard)

### Análise do Codebase

- `src/pages/SubstitutionsPage.jsx` — scaffold do #83. `allSubSlots` (L113–119) e `filteredSlots` (L122–136) já prontos. Stub `ViewBySubstitute` (L185–187) a ser substituído.
- `src/pages/AbsencesPage.jsx:107–153` — `SlotRow` serve de modelo estrutural para `SubSlotRow`.
- `src/pages/AbsencesPage.jsx:326–367` — padrão de card com `colorOfTeacher` + avatar + nome + matérias.
- `src/lib/helpers.js` — `colorOfTeacher`, `teacherSubjectNames`, `parseDate`, `findTurma`.
- `src/lib/periods.js:79` — `slotLabel(timeSlot, periodConfigs)` → rótulo da aula.
- `store.absences[].slots[]`: `{ id, date, day, timeSlot, subjectId, turma, substituteId }`. `teacherId` está no nível da absence.

### Decisões-Chave

1. **`covered` sem filtro de substituto** — adicionar `filteredSlotsAllSubs` no pai (mesmos filtros de `filteredSlots` menos `selSubstitute`). Cada `TeacherSubCard` recebe seu subset derivado.
2. **`absenceCount` via `store.absences` direto** — `filteredSlots` só contém substituições; para contar faltas do substituto, iterar `store.absences[].slots` com `teacherId === teacher.id` e mesmos filtros de período/segmento/turma. Pré-computar no pai como `absenceCountByTeacher: Map<teacherId, number>`.
3. **Teachers exibidos** — se `selSubstitute` setado, lista é `[selSubstitute]`; senão, IDs únicos em `filteredSlotsAllSubs.map(s => s.substituteId)`.
4. **Escopo do absenceCount** — aplica todos os filtros (mês + segmento + turma) para coerência com `covered`. Decisão em aberto — pode ser ajustada se o produto preferir saldo absoluto.

### Cenários

- **Admin sem filtro:** múltiplos cards ordenados por nome, cada um colapsado por padrão.
- **Admin com filtro:** um único card.
- **Teacher:** `selSubstitute` preso em `teacher.id`, um único card do próprio usuário.
- **Borda:** professor sem faltas → `absenceCount=0`, `balance=covered` (verde). Saldo zero → verde (`≥ 0`). Saldo negativo → vermelho.
- **Vazio:** nenhum substituto no período → estado vazio.
- **Teacher removido:** `store.teachers.find` retorna `undefined` → pular card.

### Schema de Banco de Dados
N/A — somente leitura.

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

- `src/pages/SubstitutionsPage.jsx`:
  1. No pai: adicionar `filteredSlotsAllSubs` e `absenceCountByTeacher` (`useMemo`) após `filteredSlots` (~L136).
  2. Atualizar invocação de `<ViewBySubstitute>` (~L174) passando `filteredSlotsAllSubs`, `absenceCountByTeacher`, `selSubstitute`.
  3. Substituir stub `ViewBySubstitute` (L185–187) por:
     - `SubSlotRow({ sl, store })` — `[Horário · Turma — Substituto cobriu Faltante]`, substituto em `text-ok font-bold`.
     - `TeacherSubCard({ teacher, store, coveredSlots, absenceCount })` — header colorido + covered/balance + lista colapsável (`useState`).
     - `ViewBySubstitute({ store, isAdmin, filteredSlots, filteredSlotsAllSubs, absenceCountByTeacher, selSubstitute, ... })` — deriva teachers, renderiza cards, trata vazio.

### Arquivos que NÃO devem ser tocados
- `src/pages/AbsencesPage.jsx`, demais páginas, `ScheduleGrid`, `src/components/**`, `src/lib/**`, `src/store/**`, `tailwind.config.js`.

### Dependências Externas
Nenhuma.

### Ordem de Implementação
1. Criar `SubSlotRow`.
2. Criar `TeacherSubCard` usando `SubSlotRow`.
3. Criar `ViewBySubstitute` real usando `TeacherSubCard`.
4. Adicionar `filteredSlotsAllSubs` e `absenceCountByTeacher` no pai.
5. Atualizar invocação de `<ViewBySubstitute>` com novas props.
6. Remover stub antigo.
7. `npm run build` → verificar zero erros.
