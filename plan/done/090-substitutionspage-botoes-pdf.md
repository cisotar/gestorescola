# Plano Técnico — #90 SubstitutionsPage Integração dos Botões de PDF

## Objetivo
Conectar as 3 funções de PDF de `reports.js` (criadas em #89) aos botões correspondentes em `SubstitutionsPage.jsx`:
- Aba **Substituto** — "📄 Folha de Ponto" e "📄 Extrato de Saldo" no header de cada `TeacherSubCard`.
- Aba **Ranking** — "📄 PDF Ranking" no topo de `ViewRanking`.

## Escopo
- **Tocar somente** `src/pages/SubstitutionsPage.jsx`.
- **Não tocar** `ViewByDay`/`ViewByWeek`/`ViewByMonth` (stubs / escopo de outras issues).
- **Não tocar** `reports.js` — funções prontas: `generateSubstitutionTimesheetHTML`, `generateSubstitutionBalanceHTML`, `generateSubstitutionRankingHTML`, `openPDF`.

## Decisões-chave

### 1. Botões por card, não por view (Opção A)
Os botões ficam no header de cada `TeacherSubCard` — admin pode exportar PDF de qualquer professor visível sem ter que filtrar um por um. O pedágio é lidar com o `<button>` expansível do header: precisa ou refatorar para `<div>` ou aninhar com `stopPropagation`.

### 2. Refatorar o header do `TeacherSubCard` para `<div>`
Hoje o header inteiro é um `<button type="button">`. HTML não permite `<button>` aninhado em `<button>`. Trocar por `<div>` contendo:
- um `<button>` que envolve "avatar + nome + matérias" (flex-1) → toggle
- os botões de PDF como irmãos (shrink-0)
- as badges de `covered`/`balance` (shrink-0)
- um `<button>` do chevron `▾/▸` (shrink-0) → toggle

### 3. `e.stopPropagation()` nos handlers dos botões de PDF — defesa em profundidade
Mesmo após eliminar o aninhamento, manter `e.stopPropagation()` protege contra regressões futuras (qualquer ancestral que vier a ser clicável) e contra propagação de `Enter` via teclado.

### 4. `absenceSlots` computado on-demand (Opção A2)
O `absenceCountByTeacher` atual é um Map de contagem — não serve para o PDF de Extrato, que precisa dos slots em si. Alternativas:
- **A1** pré-computar `absenceSlotsByTeacher` no pai como Map de listas.
- **A2** computar só no clique iterando `store.absences` com os mesmos filtros.

**Escolha: A2** via helper top-level `computeAbsenceSlots(teacherId, filters, store)`. Evita inchar `useMemo`s no render e mantém o handler local no card. **Não alterar** o `absenceCountByTeacher` existente — risco de regressão numa issue predominantemente UI.

### 5. Passagem de `filters` ao card
Criar objeto `filters = { selSegment, selTurma, filterMonth, filterYear }` no pai, passar para `ViewBySubstitute` e daí para cada `TeacherSubCard`. Mínimo acoplamento de props.

### 6. Ranking — usar `sorted`, não `rows`
O botão de PDF no `ViewRanking` passa `sorted` para `generateSubstitutionRankingHTML`, refletindo a ordenação atual da view (toggle "Carga Total" ↔ "Substituições").

## Mudanças no código

### Imports (topo do arquivo)
```js
import {
  openPDF,
  generateSubstitutionTimesheetHTML,
  generateSubstitutionBalanceHTML,
  generateSubstitutionRankingHTML,
} from '../lib/reports'
```

### Helper top-level `computeAbsenceSlots`
Mesma lógica de filtros do `absenceCountByTeacher` (segmento/turma/mês/ano), mas retorna array de slots enriquecidos com `teacherId` e `absenceId`. Filtra por `ab.teacherId === teacherId`.

### `SubstitutionsPage` — invocação de `<ViewBySubstitute>`
Adicionar prop `filters={{ selSegment, selTurma, filterMonth, filterYear }}`.

### `ViewBySubstitute`
Receber `filters` via destructuring e repassar ao `<TeacherSubCard>`.

### `TeacherSubCard`
1. Receber nova prop `filters`.
2. Trocar o `<button>` pai por `<div>`.
3. Criar dois botões de toggle (área do nome flex-1 + chevron no final) + dois botões de PDF entre eles.
4. Handlers:
   - `handleTimesheetPDF(e)` → `e.stopPropagation(); openPDF(generateSubstitutionTimesheetHTML(teacher, coveredSlots, store))`
   - `handleBalancePDF(e)` → `e.stopPropagation(); const absenceSlots = computeAbsenceSlots(teacher.id, filters, store); openPDF(generateSubstitutionBalanceHTML(teacher, coveredSlots, absenceSlots, store))`
5. Labels: `"📄 Folha de Ponto"`, `"📄 Extrato de Saldo"` com `btn btn-ghost btn-sm`.

### `ViewRanking`
1. `const handleRankingPDF = () => openPDF(generateSubstitutionRankingHTML(sorted, filterMonth, filterYear, store))`
2. No `<div className="flex justify-end">` existente (L432), adicionar `gap-2` e o novo botão `"📄 PDF Ranking"` ao lado do toggle de ordenação.

## Ordem de execução
1. Imports + helper `computeAbsenceSlots`.
2. Props `filters` do pai → `ViewBySubstitute` → `TeacherSubCard`.
3. Refatorar header do `TeacherSubCard` (div + 2 toggles + 2 botões PDF).
4. Botão PDF Ranking em `ViewRanking`.
5. `npm run build` — zero erros.
6. Smoke manual: click nos 3 botões, cada um abre janela de impressão; click no nome/chevron ainda expande/colapsa; aba Ranking reflete ordenação atual no PDF.

## Riscos
- **Regressão no toggle do card:** mitigada por `stopPropagation` + refatoração para `<div>` pai. Testar manualmente.
- **Layout mobile apertado** (2 botões + 2 badges + chevron no header): aceitar v1 com labels completos; se estourar, follow-up para colapsar em ícones + tooltip.
- **`absenceCountByTeacher` × `computeAbsenceSlots` fora de sync:** ambas usam o mesmo conjunto de filtros, mas são código duplicado. Aceitar na v1. Issue futura pode unificar.
- **Popup blocker:** `openPDF` chama `window.open` — comportamento herdado, não tratar aqui.

## Arquivos tocados
- **Modificar:** `src/pages/SubstitutionsPage.jsx`
- **Não tocar:** `src/lib/reports.js`, demais páginas, views Dia/Semana/Mês (stubs).

## Critérios de aceite
- [ ] "Folha de Ponto" e "Extrato de Saldo" aparecem no header do `TeacherSubCard`.
- [ ] Clicar nos botões de PDF abre janela de impressão e **não** expande/colapsa o card.
- [ ] "PDF Ranking" na aba Ranking usa a ordenação atual (`sorted`).
- [ ] Toggle do card e alternância de ordenação continuam funcionando.
- [ ] Zero regressão visual em Dia/Semana/Mês.
- [ ] `npm run build` passa.
