# Plano Técnico — #87 Abas Semana e Mês (ViewByWeek + ViewByMonth)

### Análise do Codebase

- `src/pages/SubstitutionsPage.jsx` — scaffold do #83 + #85 + #88:
  - Pai `SubstitutionsPage` (L97–234) já calcula `filteredSlots` (L124–138) aplicando TODOS os filtros globais (substituto, segmento, turma, mês, ano).
  - `SubSlotRow` (L238–254) — criado pelo #85, **reutilizar as-is**. Assinatura: `({ sl, store })`.
  - Stubs a substituir: `ViewByWeek` (L363–365) e `ViewByMonth` (L366–368).
  - **Não tocar:** `SubFilterToolbar`, `SubstitutionsPage`, `SubSlotRow`, `TeacherSubCard`, `ViewBySubstitute`, `ViewByDay` (#86), `ViewRanking` (#88).
  - Invocações no pai (L229–230) já corretas: `<ViewByWeek store filteredSlots />` e `<ViewByMonth store filteredSlots filterMonth filterYear />`. Não precisam mudar.
- `src/pages/AbsencesPage.jsx:532–614` — modelo estrutural de `ViewByWeek` (estado local `weekRef`, navegação `prev/next`, agrupamento por dia).
- `src/pages/AbsencesPage.jsx:618–700` — modelo estrutural de `ViewByMonth` (agrupamento `byDate` + `Object.keys().sort()`).
- `src/lib/helpers.js`:
  - `weekStart(s)` (L83) — recebe **ISO string**, não `Date`. Para "hoje": `weekStart(formatISO(new Date()))`.
  - `parseDate`, `formatISO`, `formatBR`, `dateToDayLabel` — todos usados.
  - `businessDaysBetween` **não** é necessário (gera-se 5 dias por aritmética sobre `monDate`).

### Decisões-Chave

1. **Reuso de `SubSlotRow`** — importar do mesmo arquivo (já existe em L238). Zero duplicação.
2. **Não refiltrar por substituto/segmento/turma/mês** — `filteredSlots` já vem pronto. `ViewByWeek` só corta por intervalo semanal; `ViewByMonth` reaplica mês/ano por robustez (idempotente).
3. **`ViewByWeek` tem estado local `weekRef`** — `useState(() => weekStart(formatISO(new Date())))`. Independente do filtro global.
4. **`ViewByMonth` não tem estado** — consome `filterMonth`/`filterYear` vindos do pai.
5. **Agrupamento por dia via `useMemo`** — `byDate = { 'YYYY-MM-DD': [slots...] }`. Datas ordenáveis lexicograficamente (ISO).
6. **`ViewByWeek` itera `days` (seg..sex)** — padrão idêntico ao de `AbsencesPage`; dias vazios são omitidos.
7. **Interação Semana × filtro de mês** — `filteredSlots` já está cortado ao mês. Se o usuário navegar para semana de outro mês, a lista fica vazia. Aceito intencionalmente (documentado); mudar exigiria expor slot sem filtro de mês no pai (fora de escopo).
8. **Ordenação dentro do dia** — ordem natural do array (não há parse de `timeSlot`).
9. **Import atualizado** — adicionar `weekStart` e `formatBR` ao import de `helpers` (L4).

### Cenários

- **Semana — feliz:** cabeçalho `‹ [dd/MM – dd/MM] ›`, setas funcionam, 5 dias úteis listados com separadores, dias vazios pulados.
- **Mês — feliz:** lista cronológica do mês filtrado globalmente, separadores por dia.
- **Teacher:** `selSubstitute` preso → `filteredSlots` já escopado ao próprio teacher; views funcionam sem mudanças.
- **Vazio:** `<p className="text-t3 text-sm">Nenhuma substituição neste período.</p>`.
- **Navegar para semana fora do mês filtrado:** lista vazia (comportamento documentado).
- **`sl.date` ausente:** ignorado no agrupamento.
- **Teacher removido:** `SubSlotRow` já trata via fallback `'—'`.

### Schema de Banco de Dados
N/A — somente leitura.

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

- `src/pages/SubstitutionsPage.jsx`:
  1. **Import (L4)** — adicionar `weekStart` e `formatBR` ao import de `helpers`.
  2. **Substituir stub `ViewByWeek` (L363–365)** por:
     - `useState(() => weekStart(formatISO(new Date())))` para `weekRef`.
     - Derivar `monISO`, `monDate`, `friDate`, `friISO`, `label = formatBR(monISO) + ' – ' + formatBR(friISO)`.
     - `prev` / `next`: `parseDate(monISO)` → `setDate(±7)` → `formatISO` → `setWeekRef`.
     - `days` (5 dias úteis) via `useMemo`.
     - `weekSlots = filteredSlots.filter(sl => sl.date >= monISO && sl.date <= friISO)` via `useMemo`.
     - `byDate` agrupado via `useMemo`.
     - Header com botões `◀ Semana anterior`, label, `Semana seguinte ▶`, botão `Hoje`.
     - Se `weekSlots.length === 0` → `<p className="text-t3 text-sm">Nenhuma substituição neste período.</p>`.
     - Caso contrário: iterar `days`, para cada dia com slots renderizar separador + lista de `<SubSlotRow>`.
  3. **Substituir stub `ViewByMonth` (L366–368)** por:
     - `monthSlots` via `useMemo` refiltra `filteredSlots` por `filterMonth`/`filterYear` (idempotente).
     - `byDate` + `sortedDates = Object.keys(byDate).sort()` via `useMemo`.
     - Vazio → mesma mensagem.
     - Caso contrário: iterar `sortedDates`, renderizar separador + `<SubSlotRow>` por slot.

- **Separador de dia (padronizado nas duas views):**
  ```jsx
  <div className="text-xs font-bold text-t2 uppercase tracking-wider py-1 mt-3">
    {dateToDayLabel(date)} — {formatBR(date)}
  </div>
  ```

### Arquivos que NÃO devem ser tocados
- `src/pages/AbsencesPage.jsx`, demais páginas.
- `src/pages/SubstitutionsPage.jsx` — qualquer função além dos dois stubs (imports a L4 podem ser estendidos).
- `src/components/**`, `src/lib/**`, `src/store/**`, `tailwind.config.js`.

### Dependências Externas
Nenhuma.

### Ordem de Implementação

1. Estender import de `helpers` em L4 com `weekStart` e `formatBR`.
2. Substituir stub `ViewByWeek`.
3. Substituir stub `ViewByMonth`.
4. `npm run build` → zero erros.
5. Validação manual:
   - Semana: setas avançam/retrocedem; botão Hoje volta; semana vazia exibe mensagem; filtros globais afetam.
   - Mês: lista cronológica; sem seletor próprio; filtro global de mês/ano controla.
   - Separadores no formato `SEGUNDA — 07/04/2026`.
