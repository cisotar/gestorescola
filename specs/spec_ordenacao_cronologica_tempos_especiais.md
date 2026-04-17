# Spec: Ordenação Cronológica dos Tempos Especiais em Grades Horárias

## Visão Geral

Em grades horárias com estrutura tabular (linhas = períodos, colunas = dias da semana), os "Tempos Especiais" (slots do tipo `eN`, derivados de `gradeEspecial`) são renderizados atualmente **sempre após todas as aulas regulares**, independentemente do horário real de início configurado. Isso produz uma tabela visualmente incorreta quando um tempo especial tem início antes de aulas regulares (ex: uma entrada especial às 07:00 aparece depois de uma aula regular das 12:30).

A correção consiste em unificar as listas de períodos regulares e especiais em uma única lista ordenada por horário de início (`toMin(inicio)`) antes de percorrê-la para renderização. A referência de implementação já existe em `CalendarDayPage.jsx` (linha 243), que faz exatamente isso.

**Arquivos afetados:**
- `src/pages/SettingsPage.jsx` — componente `ScheduleGrid`
- `src/pages/SchoolSchedulePage.jsx` — componente `SchoolGrid`
- `src/lib/reports.js` — função `_scheduleGrid`

**Arquivos não afetados:**
- `src/pages/SchedulePage.jsx` — usa `ScheduleGrid` de `SettingsPage.jsx`; recebe a correção automaticamente
- `src/pages/CalendarDayPage.jsx` — já implementa a ordenação corretamente (referência)

---

## Stack Tecnológica

- **Frontend:** React 18.3.1 + Tailwind CSS 3.4.10
- **Estado:** Zustand (`useAppStore`)
- **Lógica de períodos:** `src/lib/periods.js` — `gerarPeriodos`, `gerarPeriodosEspeciais`, `toMin`, `makeEspecialSlot`, `getCfg`
- **Geração de relatórios:** `src/lib/reports.js` — geração de HTML para impressão via `window.print()`
- **Banco de dados:** Firestore (não afetado por esta mudança — apenas renderização)

---

## Conceitos Técnicos Relevantes

### Tipos de período

| Tipo | Origem | Formato do slot | Contador |
|---|---|---|---|
| Regular | `gerarPeriodos(cfg).filter(p => !p.isIntervalo)` | `segId\|turno\|{aulaIdx}` (numérico) | `p.aulaIdx` (1-based) |
| Especial | `gerarPeriodosEspeciais(cfg).filter(p => !p.isIntervalo)` | `segId\|turno\|e{idx}` | `espCount` incremental (1-based) |

### Função de referência (`CalendarDayPage.jsx`)

```js
const periodos = [...regulares, ...especiais].sort((a, b) => toMin(a.inicio) - toMin(b.inicio))
```

`toMin(s)` converte `"HH:MM"` em minutos totais: `h * 60 + m`. Está exportada de `src/lib/periods.js`.

### Distinção visual por tipo

As linhas de período especial têm estilo visual diferente das regulares. Esta distinção deve ser **preservada** após a unificação — cada item da lista mesclada deve carregar uma flag indicando se é especial ou regular.

---

## Behaviors por Arquivo

### Behavior 1 — `ScheduleGrid` em `SettingsPage.jsx`

**Localização:** `src/pages/SettingsPage.jsx`, dentro do `relevantSegments.map(seg => ...)`, no bloco `<tbody>` (linhas ~2094–2264).

**Situação atual:** Dois blocos separados:
1. `aulas.map(p => ...)` — renderiza linhas regulares com `aulaIdx` numérico como chave de slot
2. IIFE que percorre `especiais`, incrementa `espCount` a cada item não-intervalo, e renderiza linhas com `makeEspecialSlot(seg.id, turno, espCount)` como chave de slot

**Behavior desejado:**

- [ ] Criar lista mesclada antes do JSX: iterar `aulas` (já filtrados de `isIntervalo`) marcando cada item com `{ ...p, _tipo: 'regular' }`, iterar `gerarPeriodosEspeciais(cfg)` filtrando `isIntervalo` e atribuindo `espCount` incremental sequencialmente, marcando cada item com `{ ...p, _tipo: 'especial', _espIdx: espCount }`. Concatenar e ordenar por `toMin(p.inicio)`.
- [ ] Percorrer a lista mesclada uma única vez em `periodos.map(p => ...)`.
- [ ] Para linhas regulares (`p._tipo === 'regular'`): manter exatamente o JSX atual do bloco `aulas.map`, usando `p.aulaIdx` para o slot key (`${seg.id}|${turno}|${p.aulaIdx}`), e a classe de linha `border-b border-bdr/50` sem fundo especial.
- [ ] Para linhas especiais (`p._tipo === 'especial'`): manter exatamente o JSX atual do bloco IIFE, usando `makeEspecialSlot(seg.id, turno, p._espIdx)` como slot key e as classes `border-b border-bdr/50 bg-surf2` + `border-l-2 border-accent` na primeira célula.
- [ ] O handler de abertura do modal de adição de aula regular deve continuar passando `aulaIdx: p.aulaIdx` (numérico).
- [ ] O handler de abertura do modal de adição de aula especial deve continuar passando `aulaIdx: \`e${p._espIdx}\`` (string `"e1"`, `"e2"`, etc.).
- [ ] O `slotKey` usado em `substitutionMap?.[slot]` deve continuar derivado da mesma chave de slot do respectivo tipo.
- [ ] Nenhuma outra prop, callback ou lógica de `ScheduleGrid` deve ser alterada.

---

### Behavior 2 — `SchoolGrid` em `SchoolSchedulePage.jsx`

**Localização:** `src/pages/SchoolSchedulePage.jsx`, função `SchoolGrid`, dentro de `<tbody>` (linhas ~31–143).

**Situação atual:** Dois blocos separados:
1. `aulas.map((aula, i) => ...)` — renderiza linhas regulares usando `aula.aulaIdx` numérico para filtrar `schedules`
2. IIFE que percorre `especiais`, incrementa `espCount`, e renderiza linhas usando `makeEspecialSlot(seg.id, turno, espCount)` como `slotKey` para filtrar `schedules`

**Behavior desejado:**

- [ ] Criar lista mesclada antes do JSX: para regulares, marcar com `{ ...aula, _tipo: 'regular' }`; para especiais filtradas de `isIntervalo`, atribuir `espCount` incremental e marcar com `{ ...p, _tipo: 'especial', _espIdx: espCount }`. Ordenar por `toMin(p.inicio)`.
- [ ] Percorrer a lista mesclada uma única vez em `periodos.map((p, i) => ...)`.
- [ ] Para linhas regulares: manter o JSX atual (stripe `i % 2 === 0 ? 'bg-bg' : 'bg-surf'`, filtro de `schedules` por `Number(ai) === p.aulaIdx`).
- [ ] Para linhas especiais: manter o JSX atual (`bg-surf2`, `border-l-2 border-accent`, filtro de `schedules` por `s.timeSlot === makeEspecialSlot(seg.id, turno, p._espIdx)`).
- [ ] A lógica de `isEmpty` (linha 40) para linhas regulares deve continuar funcionando — aplicar apenas a linhas regulares ou adaptar para a lista mesclada mantendo o comportamento original (ocultar a linha inteira se não há aulas em nenhum dia).
- [ ] Props `showTeacher` e `useApelido` devem continuar aplicadas exatamente como hoje para ambos os tipos.
- [ ] Nenhuma prop, lógica de filtro ou comportamento de exibição de dados fora da ordem de renderização deve ser alterada.

---

### Behavior 3 — `_scheduleGrid` em `reports.js`

**Localização:** `src/lib/reports.js`, função `_scheduleGrid` (linhas ~427–494).

**Situação atual:**
- `const rows = aulas.map(...)` — gera strings HTML das linhas regulares
- `const especialRows = especiais.map(...)` — gera strings HTML das linhas especiais (com contador `aulaCount` incremental)
- `return \`...\${rows}\${especialRows}...\`` — concatena regulares antes, especiais depois

**Behavior desejado:**

- [ ] Antes de construir HTML, montar uma lista mesclada em memória: para cada aula regular, criar objeto `{ tipo: 'regular', aulaIdx, label, inicio, fim }`; para cada item especial não-intervalo, incrementar `aulaCount` e criar objeto `{ tipo: 'especial', aulaCount, label, inicio, fim }`. Ordenar a lista por `toMin(inicio)`.
- [ ] Percorrer a lista mesclada uma única vez, gerando a string HTML de cada linha conforme o tipo.
- [ ] Para linhas regulares: manter exatamente o HTML atual (filtro de `schedules` por `s.timeSlot === \`\${seg.id}|\${turno}|\${aulaIdx}\``, estilos inline atuais).
- [ ] Para linhas especiais: manter exatamente o HTML atual (filtro por `makeEspecialSlot`, estilos inline `background:#F4F2EE;border-left:3px solid #C05621`).
- [ ] Os estilos de intervalo (`border-style:dashed`) e células vazias especiais (`color:#c8c4bb`) devem ser preservados — intervalos especiais são itens com `isIntervalo === true` e continuam a ser pulados na contagem de `aulaCount`.
- [ ] A variável `aulaCount` deve ser incrementada na mesma ordem que hoje (1-based, conta apenas itens com `isIntervalo === false`), garantindo que os `slotKey` gerados sejam idênticos aos atualmente persistidos nos `schedules`.
- [ ] A assinatura da função `_scheduleGrid(seg, turno, schedules, store, showTeacher, useApelido)` não deve mudar.

---

### Behavior 4 — Invariante Global

- [ ] A ordenação só afeta a **posição visual** das linhas na tabela. Nenhum dado é criado, removido ou transformado.
- [ ] Os `timeSlot` keys gerados (tanto regulares quanto especiais) devem ser byte-a-byte idênticos aos gerados hoje — garantindo que aulas, substituições e ausências existentes continuem sendo encontradas corretamente.
- [ ] O contador `espCount`/`aulaCount` para slots especiais deve ser atribuído **antes** da ordenação, na mesma ordem em que `gerarPeriodosEspeciais` retorna os itens (order field do `gradeEspecial.itens`). A ordenação visual acontece depois da atribuição dos índices.
- [ ] O visual diferenciado dos tempos especiais (fundo `bg-surf2`, borda lateral `border-l-2 border-accent`, e no PDF `background:#F4F2EE;border-left:3px solid #C05621`) deve ser preservado independentemente da posição da linha.
- [ ] O modal de adição de aula (`AddScheduleModal`) em `ScheduleGrid` deve continuar recebendo o `aulaIdx` correto para o tipo de linha clicado.
- [ ] A marcação de falta (`CalendarDayPage`) não é afetada — já usa a mesma lógica de ordenação.
- [ ] `SchedulePage.jsx` não requer nenhuma mudança — importa e usa `ScheduleGrid` diretamente.

---

## Componentes Compartilhados

- **`ScheduleGrid`** (`SettingsPage.jsx`, exportado): usado em `SettingsPage` (aba de configuração de grades) e em `SchedulePage` (grade individual do professor). Recebe `teacher`, `store`, `readOnly`, `substitutionMap` e `segmentFilter`.
- **`ScheduleGridModal`** (`SettingsPage.jsx`, exportado): wrapper modal em torno de `ScheduleGrid`. Não requer mudança.
- **`toMin`** (`src/lib/periods.js`, exportado): função de conversão `"HH:MM" → minutos`. Já importada em `CalendarDayPage`; deve ser importada também em `SettingsPage.jsx` e `SchoolSchedulePage.jsx` se ainda não estiver.
- **`_scheduleGrid`** (`reports.js`, função interna): usada por `generateTeacherScheduleHTML` e `generateSchoolScheduleHTML`. Não é exportada.

---

## Modelos de Dados

Nenhuma entidade do Firestore é alterada. Os objetos relevantes para esta mudança são estruturas em memória derivadas de `periods.js`:

### Período regular (retornado por `gerarPeriodos`)

```js
{
  aulaIdx: 3,           // 1-based, numérico
  label: "3ª Aula",
  inicio: "08:40",
  fim: "09:30",
  isIntervalo: false
}
```

### Período especial (retornado por `gerarPeriodosEspeciais`)

```js
{
  label: "Tempo Especial 1",
  inicio: "07:00",
  fim: "07:40",
  isEspecial: true,
  isIntervalo: false,
  aulaIdx: "e1"         // string — presente apenas em alguns caminhos internos
}
```

### Item mesclado (estrutura intermediária criada pela correção)

```js
// Regular
{ ...periodoRegular, _tipo: 'regular' }

// Especial (com espCount atribuído antes da sort)
{ ...periodoEspecial, _tipo: 'especial', _espIdx: 1 }
```

---

## Regras de Negócio

1. **A atribuição de `espCount`/`aulaCount` precede a ordenação:** o índice de um tempo especial (`e1`, `e2`…) é determinado pela ordem original de `gerarPeriodosEspeciais`, não pela posição final na tabela. Alterar essa ordem romperia os `timeSlot` persistidos.

2. **Intervalos especiais são ignorados na contagem e na renderização de células:** itens com `isIntervalo === true` dentro de `gerarPeriodosEspeciais` não geram linha na tabela e não incrementam `espCount`/`aulaCount`.

3. **Consistência de slot keys:** o formato `makeEspecialSlot(segId, turno, n)` → `"segId|turno|eN"` deve produzir exatamente os mesmos valores que hoje para que os registros de `schedules`, `absences` e `history` continuem vinculados corretamente.

4. **Stripe de linhas em `SchoolGrid`:** o stripe alternado (`.bg-bg` / `.bg-surf`) no bloco de linhas regulares usa o índice `i` da iteração. Após a mesclagem, linhas especiais têm estilo próprio (`bg-surf2`) e não participam do stripe. A lógica de stripe pode ser aplicada somente a linhas do tipo `'regular'` ou descartada para toda a lista mesclada — o critério é que o comportamento visual das linhas especiais não seja afetado.

---

## Fora do Escopo (v1)

- Reordenação ou edição da configuração de `gradeEspecial.itens` via UI (Settings).
- Alteração do formato de `timeSlot` para incluir horário.
- Suporte a ordenação por critério diferente de `inicio` (ex: por `aulaIdx` numérico).
- Exibição de intervalos especiais como linhas separadas na tabela.
- Migração de dados existentes no Firestore.
- Testes automatizados (ausentes na base de código; débito técnico conhecido).
- Qualquer alteração em `CalendarDayPage.jsx` (já correto).
- Qualquer alteração em `SchedulePage.jsx` (herda a correção via `ScheduleGrid`).
