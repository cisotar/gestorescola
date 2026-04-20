# Plano Técnico — #89 reports.js Funções de PDF para Substituições

## Objetivo
Adicionar 3 funções exportadas em `src/lib/reports.js` que geram HTML de relatórios de substituição (Folha de Ponto, Extrato de Saldo, Ranking) reusando o template base existente (`_wrap()` + `_css()`).

## Reuso do CSS base
**Template compartilhado já existe:** `_wrap(title, metaHTML, bodyHTML, docTitle)` + `_css()` em `reports.js` (L19–67). Todas as 3 novas funções **devem** chamar `_wrap()` — sem CSS inline duplicado. Classes herdadas: `.doc-hdr`, `.m-blk/m-lbl/m-val`, `.section`, `.sec-hdr`, `.teacher-hdr`, `table/th/td`, `.ok` (verde), `.err` (vermelho).

## Imports necessários
Nada a acrescentar — `formatBR`, `slotFullLabel`, `parseDate`, `MONTH_NAMES` já estão no topo do arquivo.

## Local de inserção
Após `generateSchoolScheduleHTML` (fim do arquivo, ~L534). Numerar como `// ─── 10. ... ───`, `// ─── 11. ... ───`, `// ─── 12. ... ───`.

## Funções

### 1. `generateSubstitutionTimesheetHTML(teacher, slots, store)`
- **Propósito:** Folha de Ponto do substituto
- **metaHTML:** Substituto · Período · Total de aulas
- **Body:** `<table>` com colunas **Data | Horário | Turma | Professor Faltante**
- **Ordenação:** por `date` + `timeSlot` ascendente
- **Faltante:** `store.teachers.find(t => t.id === sl.teacherId)`
- **Horário:** `slotFullLabel(sl.timeSlot, store.periodConfigs)`
- **Data:** `formatBR(sl.date)`
- **docTitle:** `'GestãoEscolar — Folha de Ponto'`

### 2. `generateSubstitutionBalanceHTML(teacher, coveredSlots, absenceSlots, store)`
- **Propósito:** Balanço de faltas × substituições
- **metaHTML:** Professor · Faltas (`.err`) · Substituições (`.ok`) · Saldo (`.ok` se ≥ 0, `.err` se < 0)
- **Body:** duas `<div class="section">`:
  1. **Faltas Cometidas (N)** — tabela Data | Horário | Turma | Disciplina
  2. **Substituições Realizadas (M)** — mesma tabela
  - Fallback vazio em cada seção: `<p>Nenhuma ... no período.</p>`
- **Rodapé:** bloco destacado `background:#f4f2ee` com totais
- **Saldo:** `M − N`, classe `ok` se ≥ 0, `err` se < 0, com sinal `+`/`−`
- **docTitle:** `'GestãoEscolar — Extrato de Saldo'`
- **Importante:** ordenar ambos arrays internamente antes de renderizar.

### 3. `generateSubstitutionRankingHTML(rankingData, month, year, store)`
- **Propósito:** Ranking mensal de carga real
- **Parâmetro:** `rankingData = [{ teacher, scheduled, substitutions, total }]` já ordenado (não reordenar)
- **metaHTML:** Mês (`${MONTH_NAMES[month]} ${year}`) · Total de professores
- **Body:** `<table>` com colunas **# | Professor | Próprias | Substituições | Total** (total em `<strong>`)
- **Posição:** `idx + 1`
- **Fallback vazio:** `<p>Nenhum professor no ranking.</p>`
- **docTitle:** `'GestãoEscolar — Ranking de Carga'`

## Riscos / Atenções
- Arrays vazios → fallback explícito ou deixar `_wrap` tratar (Timesheet usa fallback genérico; Balance/Ranking usam específico).
- Saldo negativo → classe `.err` + sinal explícito (`+`/`−`).
- Professor não encontrado → sempre `?.name ?? '—'`.
- Não quebrar funções existentes: adicionar apenas no final, sem tocar `_css()`, `_wrap()` ou qualquer `generate*` anterior.

## Ordem de Implementação
1. Adicionar `generateSubstitutionTimesheetHTML` após `generateSchoolScheduleHTML`
2. Adicionar `generateSubstitutionBalanceHTML` em seguida
3. Adicionar `generateSubstitutionRankingHTML` em seguida
4. `npm run build` — validar sintaxe
5. Smoke test rápido via console

## Arquivos tocados
- **Modificar:** `src/lib/reports.js` (apenas adições no final)
- **Não tocar:** `SubstitutionsPage.jsx` (botões virão no #90), outras páginas/libs
