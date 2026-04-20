# Plano Técnico — #106 Seleção em massa e exclusão com undo

### Análise do Codebase

**AbsencesPage (referência completa):**
- `SelectionToolbar` (L23–43): toggle ☑/✕ + botões rápidos (tudo, desmarcar, só faltas, só subs)
- `BulkActionBar` (L47–56): barra fixa inferior `bg-navy` com contagem + excluir
- `UndoBar` (L60–68): barra fixa `bg-amber-700` com contagem + desfazer (5s)
- Pai (L168–204): `selectedIds`, `selectionMode`, `undoBuffer`, `undoTimer`, handlers `onToggle/onSelectAll/onClearAll/onSelectFaltas/onSelectSubs/handleBulkDelete/handleUndo`, `selProps` bundled
- `SlotRow`: aceita `selectionMode/isSelected/onToggle` — checkbox quando ativo

**SubstitutionsPage:**
- `SubSlotRow` (L269–317): **já tem** `selectionMode`, `isSelected`, `onToggle` props com checkbox funcional
- Mas **nenhuma view passa essas props** — SubSlotRow sempre recebe defaults (`false/false/undefined`)
- Store: `deleteManySlots(slotIds)` e `restoreAbsences(snapshot)` já existem

### Decisões-Chave

1. **Copiar SelectionToolbar/BulkActionBar/UndoBar** da AbsencesPage para SubstitutionsPage (componentes internos, não exportados — adaptando texto "substituição" em vez de "ausência")
2. **Estado de seleção no pai** — mesmo padrão: `selectedIds`, `selectionMode`, `undoBuffer`, `undoTimer`, `selProps`
3. **Passar `selProps` a todas as views** — cada view propaga `selectionMode/isSelected/onToggle` ao SubSlotRow
4. **Visível somente para admin** — `SelectionToolbar` já guarda `if (!isAdmin) return null`
5. **Tab change limpa seleção** — `handleTabChange` reseta `selectionMode` e `selectedIds`
6. **`pb-16` no container** quando barra fixa visível

### Cenários

**Feliz:** Admin ativa seleção → checkboxes aparecem → seleciona slots → barra fixa mostra contagem → exclui → UndoBar aparece 5s → desfaz.
**Bordas:** Trocar de aba limpa seleção. Teacher não vê botão de seleção. Undo após 5s não é mais possível.

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

**`src/pages/SubstitutionsPage.jsx`:**

1. **Adicionar 3 componentes** (antes de SubSlotRow, ~L267):
   - `SelectionToolbar` — cópia da AbsencesPage com texto adaptado
   - `BulkActionBar` — texto "substituição" em vez de "ausência"
   - `UndoBar` — texto "substituição"

2. **Pai (~L129–264):** adicionar:
   - Estados: `selectedIds`, `selectionMode`, `undoBuffer`, `undoTimer`
   - Handlers: `onToggle`, `onSelectAll`, `onClearAll`, `onSelectFaltas`, `onSelectSubs`, `handleBulkDelete`, `handleUndo`
   - `selProps` bundle
   - `handleTabChange` limpa seleção
   - `pb-16` condicional no container
   - Renderizar `BulkActionBar`/`UndoBar` no final
   - Passar `selProps` a cada view

3. **ViewByDay (~L610):** receber `selProps`, passar `selectionMode/isSelected/onToggle` ao SubSlotRow, adicionar SelectionToolbar

4. **ViewByWeek (~L730):** idem

5. **ViewByMonth (~L850):** idem (na vista de substituições, não no ranking)

6. **ViewBySubstitute (~L358):** idem (no painel central, lista de SubSlotRow)

### Arquivos que NÃO devem ser tocados
- AbsencesPage.jsx, reports.js, helpers.js, store
- SubSlotRow (já tem props de seleção)

### Ordem de Implementação
1. Adicionar SelectionToolbar, BulkActionBar, UndoBar
2. Adicionar estados e handlers no pai
3. Atualizar handleTabChange para limpar seleção
4. Adicionar pb-16 e barras fixas no return do pai
5. Passar selProps a cada view e propagar ao SubSlotRow
6. `npm run build`
7. Validar
