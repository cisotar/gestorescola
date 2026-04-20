# Plano Técnico — #103 Aba "Por Dia" lista agrupada por substituto

### Análise do Codebase

**Blocos a remover** de `SubstitutionsPage.jsx`:
- `dayDisplayName` (L592–596) — helper de nome, não mais necessário
- `DayPicker` (L618–648) — substituído por toolbar integrado no ViewByDay
- `DayGridBySegment` (L650–716) — grade horária, substituída por lista

**Blocos a manter:**
- `initialDate` (L598–604) — dia útil atual
- `prevBusinessDay` (L606–610) — navegação ‹
- `nextBusinessDay` (L612–616) — navegação ›

**ViewByDay** (L718–789) — reescrever por completo.

**Referência:** AbsencesPage `ViewByDay` (L467–526) — date picker + pills rápidos + agrupamento por professor.

### Decisões-Chave

1. **Combinar:** pills rápidos (AbsencesPage) + navegação ‹ ► (DayPicker atual) + botão "Hoje"
2. **Agrupamento inline** por substituto (sem componente GroupedBySubstitute separado — simples o suficiente)
3. **PDF:** usar `generateSubstitutionTimesheetHTML(null, daySlots, store)` (teacher=null → cabeçalho genérico). A #108 pode refinar.
4. **WhatsApp:** mensagem inline no ViewByDay (reutiliza `WhatsAppButton` já existente)
5. **Props simplificadas:** remover `selSegment` e `selTurma` da invocação (não mais necessários sem a grade)

### Cenários

**Feliz:** pills com 10 datas → clicar → lista de subs agrupados. ‹ ► pula fim de semana. Hoje volta.
**Teacher:** filteredSlots já filtrado → mostra apenas datas dele.
**Bordas:** dia sem subs → estado vazio; nenhum slot → pills vazios.

### Arquivos a Modificar

**`src/pages/SubstitutionsPage.jsx`:**
1. Remover `dayDisplayName`, `DayPicker`, `DayGridBySegment` (L592–716, exceto helpers de data L598–616)
2. Reescrever `ViewByDay` (L718–789): toolbar (‹ label ► Hoje picker PDF WhatsApp) + pills + agrupamento por substituto + SubSlotRow
3. Pai L261: remover `selSegment` e `selTurma` da invocação

### Arquivos que NÃO devem ser tocados
- AbsencesPage, reports.js, helpers.js, absences.js, store
- WhatsAppButton, SubSlotRow, ViewBySubstitute, ViewByWeek, ViewByMonth, ViewRanking

### Ordem de Implementação
1. Remover blocos obsoletos
2. Reescrever ViewByDay
3. Simplificar invocação no pai
4. `npm run build`
5. Validar: navegação, pills, agrupamento, PDF, WhatsApp, vazio
