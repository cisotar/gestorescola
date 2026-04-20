# Plano Técnico — #104 Abas "Por Semana" e "Por Mês" — agrupamento hierárquico

### Análise do Codebase

**Estado atual — SubstitutionsPage:**
- `ViewByWeek` (L732–799): navegação ‹ ► + Hoje, `byDate` por dia, renderiza `SubSlotRow` flat (sem agrupamento por substituto). Sem dropdown de professor, sem PDF, sem WhatsApp.
- `ViewByMonth` (L803–839): recebe `filterMonth`/`filterYear` do pai, agrupa por data, `SubSlotRow` flat. Sem navegação própria, sem dropdown, sem PDF, sem WhatsApp.
- `ViewByDay` (L600–728): referência do padrão desejado — agrupa por substituto com header colorido (avatar + nome + contagem), usa `WhatsAppButton` e PDF.
- `WhatsAppButton` (L320–354): simplificado, recebe `{ message }`.
- Imports já disponíveis: `openPDF`, `generateSubstitutionTimesheetHTML`, `MONTH_NAMES`, `weekStart`, `formatBR`, `dateToDayLabel`, `colorOfTeacher`, `teacherSubjectNames`, `slotLabel`.

**Referência — AbsencesPage:**
- `ViewByWeek` (L530–612): navegação ‹ ► + Hoje + dropdown de professor + PDF + WhatsApp + `GroupedByTeacher` por dia.
- `ViewByMonth` (L616–705): navegação ‹ ► ano + pills de mês + Hoje + dropdown + PDF + WhatsApp + `GroupedByTeacher` por dia.
- Ambas usam `GroupedByTeacher` para agrupamento — na SubstitutionsPage usaremos agrupamento por **substituto** (mesma lógica do ViewByDay #103).

### Decisões-Chave

1. **Agrupamento por substituto** reutiliza a lógica inline do ViewByDay: `Map(substituteId → slots[])` → header com avatar + nome + contagem → `SubSlotRow` por slot.
2. **Extrair helper `groupBySubstitute(slots, store)`** para evitar duplicação entre ViewByDay, ViewByWeek e ViewByMonth — retorna `[{ teacher, slots }]` sorted by name.
3. **ViewByWeek** ganha: dropdown de professor substituto + PDF (`generateSubstitutionTimesheetHTML(null, weekSlots, store)`) + WhatsApp (mensagem inline).
4. **ViewByMonth** ganha: navegação ‹ ► + pills de mês + Hoje + dropdown + PDF + WhatsApp. Não depende mais de `filterMonth`/`filterYear` do pai — gerencia seu próprio estado.
5. **Hierarquia visual:** Dia (separator) → Substituto (card com header colorido) → SubSlotRow. Dentro da semana, os dias ficam dentro de um card semanal container.
6. **Cards semanais no ViewByMonth:** agrupar dias em semanas (Mon-Fri), cada semana num `card` container — segue a spec "cards semanais como containers".

### Cenários

**Feliz — Semana:**
1. Admin abre aba "Por Semana" → semana atual exibida (Seg–Sex)
2. Cada dia com substituições mostra separador de dia → cards de substituto → SubSlotRow
3. Navegação ‹ ► muda semana, "Hoje" volta para semana atual
4. Dropdown filtra por professor substituto
5. PDF e WhatsApp geram relatório da semana

**Feliz — Mês:**
1. Admin abre aba "Por Mês" → mês atual exibido
2. Dias agrupados em cards semanais (Seg–Sex)
3. Dentro de cada card semanal: separador de dia → substituto → SubSlotRow
4. Navegação ‹ ► muda ano, pills mudam mês, "Hoje" volta para mês atual
5. PDF e WhatsApp geram relatório do mês

**Bordas:**
- Semana/mês sem substituições → estado vazio com ícone ✅
- Dropdown filtra todos → nenhum resultado → estado vazio
- Teacher logado → `filteredSlots` já vem filtrado pelo pai → dropdown desnecessário (esconder)

### Schema de Banco de Dados
N/A.

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

#### `src/pages/SubstitutionsPage.jsx`

**1. Extrair helper `groupBySubstitute(slots, store)` (~L590, antes de `initialDate`):**
```jsx
function groupBySubstitute(slots, store) {
  const map = new Map()
  for (const sl of slots) {
    if (!map.has(sl.substituteId)) map.set(sl.substituteId, [])
    map.get(sl.substituteId).push(sl)
  }
  return [...map.entries()]
    .map(([id, ss]) => ({ teacher: store.teachers.find(t => t.id === id), slots: ss }))
    .filter(g => g.teacher)
    .sort((a, b) => a.teacher.name.localeCompare(b.teacher.name))
}
```

**2. Refatorar ViewByDay** para usar `groupBySubstitute` em vez de lógica inline (L627–640 → `const grouped = useMemo(() => groupBySubstitute(daySlots, store), [daySlots, store.teachers])`).

**3. Reescrever ViewByWeek (L732–799):**
- Props: `{ store, isAdmin, filteredSlots }`
- State: `weekRef`, `filterSub` (dropdown de substituto)
- Derivar: `weekSlots`, `days`, `subsThisWeek` (para dropdown)
- Agrupar: por dia → por substituto (usando `groupBySubstitute`)
- Toolbar: ‹ label ► Hoje | dropdown substituto | PDF WhatsApp
- Conteúdo: dias → separador → cards de substituto → SubSlotRow
- PDF: `generateSubstitutionTimesheetHTML(null, weekSlots, store)`
- WhatsApp: mensagem inline por dia → por substituto → slots

**4. Reescrever ViewByMonth (L803–839):**
- Props: `{ store, isAdmin, filteredSlots }` (remove `filterMonth`/`filterYear` — gerencia próprio estado)
- State: `year`, `month`, `filterSub`
- Derivar: `monthSlots`, `subsThisMonth`, semanas do mês
- Toolbar: ‹ ano ► | pills mês | Hoje | dropdown substituto | PDF WhatsApp
- Conteúdo: card por semana → dias → separador → cards substituto → SubSlotRow
- PDF: `generateSubstitutionTimesheetHTML(null, monthSlots, store)`
- WhatsApp: mensagem inline

**5. Atualizar invocação no pai (L263–264):**
```jsx
// Antes:
{mode === 'week'  && <ViewByWeek  store={store} isAdmin={isAdmin} filteredSlots={filteredSlots} />}
{mode === 'month' && <ViewByMonth store={store} isAdmin={isAdmin} filteredSlots={filteredSlots} filterMonth={filterMonth} filterYear={filterYear} />}

// Depois:
{mode === 'week'  && <ViewByWeek  store={store} isAdmin={isAdmin} filteredSlots={filteredSlots} />}
{mode === 'month' && <ViewByMonth store={store} isAdmin={isAdmin} filteredSlots={filteredSlots} />}
```

### Arquivos que NÃO devem ser tocados
- AbsencesPage.jsx, reports.js, helpers.js, periods.js
- SubSlotRow, WhatsAppButton, ViewBySubstitute, ViewByDay (exceto refatorar para usar groupBySubstitute), ViewRanking

### Dependências Externas
Nenhuma.

### Ordem de Implementação
1. Extrair `groupBySubstitute` helper
2. Refatorar `ViewByDay` para usá-lo
3. Reescrever `ViewByWeek`
4. Reescrever `ViewByMonth`
5. Atualizar invocação no pai (remover `filterMonth`/`filterYear` de ViewByMonth)
6. `npm run build` → zero erros
7. Validar: navegação, dropdown, agrupamento, PDF, WhatsApp, vazio
