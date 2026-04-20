# Plano Técnico — #86 Aba Dia (ViewByDay)

### Análise do Codebase

- `src/pages/SubstitutionsPage.jsx:228` — chamada atual: `<ViewByDay store={store} isAdmin={isAdmin} filteredSlots={filteredSlots} />`.
- `src/pages/SubstitutionsPage.jsx:360–362` — stub atual de `ViewByDay` a ser substituído.
- `src/pages/SubstitutionsPage.jsx:124–138` — `filteredSlots` do pai já aplica `selSubstitute` / `selSegment` / `selTurma` / `filterMonth` / `filterYear`.
- `src/pages/SettingsPage.jsx:1558–1702` — `ScheduleGrid({ teacher, store, readOnly, substitutionMap })`. **Teacher-centric**: filtra schedules por `teacherId`, deriva segmentos de `teacher.subjectIds`, renderiza 5 dias × N aulas, `substitutionMap` é indexado só por `timeSlot` (sem `day`).
- `src/lib/periods.js:16, 51` — `gerarPeriodos(cfg)` e `getCfg(segId, turno, periodConfigs)` já exportados.
- `src/lib/helpers.js` — `formatISO`, `parseDate`, `formatBR`, `dateToDayLabel` (retorna `null` para fim de semana).
- `src/lib/db.js:205` + `src/pages/SettingsPage.jsx:977, 2116` — confirma campo `teacher.apelido` (opcional, string).
- `src/pages/AbsencesPage.jsx:542–543` — padrão de navegação com setas `prev/next` (referência).
- Slot enriquecido em `filteredSlots`: `{ id, date, day, timeSlot, turma, subjectId, substituteId, teacherId, absenceId }`.

### Decisão-Chave: NÃO usar `ScheduleGrid`

A `ScheduleGrid` é fundamentalmente teacher-centric e inadequada para "grade da escola em um dia":

1. Só desenha cards de schedules cujo `teacherId` bate com a prop `teacher` — um teacher sintético renderiza grade vazia.
2. Deriva segmentos via `teacherSegmentIds(teacher, ...)`, acoplado a `subjectIds`.
3. Layout é `5 dias × N aulas`, queremos `1 dia × N aulas × M turmas`.
4. `substitutionMap` é indexado só por `timeSlot` — destaque vazaria por todos os 5 dias.

Adaptá-la exigiria novas props (`schedulesOverride`, `dayFilter`, chave `day+slot`, ocultar modais de edição) e deixaria a API inchada. **Melhor implementar uma visualização própria: `DayGridBySegment` — uma tabela por segmento, linhas = aulas, colunas = turmas do segmento, células mostrando titular ou substituto do dia selecionado.**

A prop `substitutionMap` da `ScheduleGrid` (#84) continua disponível para outros consumidores (ex.: grade individual do professor em `/schedule`), apenas não é usada por esta aba.

**Plano B descartado:** agrupar por substituto no dia (estilo `generateByDayHTML`) — mais simples, mas não é "grade do dia com destaque" no sentido literal do issue. Documentado para referência.

### Cenários

- **Dia útil com substituições:** grade renderiza titulares + destaques verdes nas células onde houve substituição. Nome do sub = `apelido || primeiroNome`.
- **Dia útil sem substituições:** grade renderiza só titulares + banner `"Nenhuma substituição neste dia"`.
- **Fim de semana:** `dayLabel === null` → estado vazio `"Sem aulas em fim de semana"`. Setas ◀ / ▶ pulam sáb/dom.
- **Default `selDate`:** hoje; se hoje for sáb/dom, ajusta para próxima segunda.
- **`selSegment` setado no filtro global:** só renderiza tabelas daquele segmento.
- **`selTurma` setado:** filtra colunas dentro do segmento correspondente.
- **Substituição sem schedule correspondente (schedule apagado depois):** célula mostra só o destaque verde do sub, sem titular.
- **Célula sem schedule nem sub:** `—`.
- **Filtro de mês do pai em mês diferente do `selDate`:** permitido, mas destaque verde fica vazio (não sincronizamos — decisão consciente para não acoplar dimensões de filtro).

### Schema de Banco de Dados
N/A — apenas leitura.

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

- **`src/pages/SubstitutionsPage.jsx`**:
  1. Imports: adicionar `formatBR` (helpers) e `gerarPeriodos`, `getCfg` (periods).
  2. Helpers de módulo: `initialDate()`, `prevBusinessDay(iso)`, `nextBusinessDay(iso)`, `dayDisplayName(teacher)`.
  3. Substituir stub `ViewByDay` (L360–362) por:
     - `DayPicker({ selDate, setSelDate })` — setas ◀/▶ (pulam fim de semana) + label + `<input type="date">`.
     - `DayGridBySegment({ seg, store, dayLabel, subByTurmaSlot, turmaFilter })` — tabela `aulas × turmas`. Lookup: `store.schedules.find(s => s.day === dayLabel && s.timeSlot === slot && s.turma === turma)`. Destaque em `text-ok` quando `subByTurmaSlot.get(\`${turma}||${slot}\`)` existe.
     - `ViewByDay({ store, isAdmin, filteredSlots, selSegment, selTurma })` — `useState(selDate)` default `initialDate()`; `daySlots = filteredSlots.filter(sl => sl.date === selDate && sl.substituteId)`; `subByTurmaSlot = useMemo` construído a partir de `daySlots`; renderiza `DayPicker` + uma `DayGridBySegment` por segmento (filtrado por `selSegment` se setado).
  4. Atualizar chamada L228 para passar `selSegment` e `selTurma` adicionais.

### Arquivos que NÃO devem ser tocados
- `src/pages/SettingsPage.jsx` (`ScheduleGrid` permanece intacta).
- Componentes já implementados em `SubstitutionsPage.jsx`: `ViewBySubstitute`, `SubSlotRow`, `TeacherSubCard`, `ViewRanking`, stubs `ViewByWeek`/`ViewByMonth`, `SubFilterToolbar`, `filteredSlotsAllSubs`, `absenceCountByTeacher`.
- Demais páginas, `src/components/**`, `src/lib/**` (exceto leitura), `src/store/**`, `tailwind.config.js`.

### Dependências Externas
Nenhuma.

### Ordem de Implementação

1. Adicionar imports (`formatBR`, `gerarPeriodos`, `getCfg`).
2. Criar helpers de módulo (`initialDate`, `prev/nextBusinessDay`, `dayDisplayName`).
3. Criar `DayPicker`.
4. Criar `DayGridBySegment` (respeita `turmaFilter` opcional; retorna `null` se segmento vazio).
5. Substituir stub `ViewByDay` pela versão real.
6. Atualizar chamada em L228 com `selSegment`/`selTurma`.
7. `npm run build` → zero erros.
8. Validação manual:
   - Dia útil com substituições → destaques verdes corretos.
   - Setas ◀/▶ pulam fim de semana.
   - `<input type="date">` direto num sábado → estado vazio.
   - `selSegment`/`selTurma` afetam quais tabelas/colunas aparecem.
   - Substituto com `apelido` → destaque usa apelido; sem apelido → primeiro nome.
   - Dia sem substituições → grade de titulares + banner informativo.
