# Spec: Refinamentos visuais e de filtros — Grade Horária da Escola

## Visão Geral
Ajustes de tipografia, layout de células em duas linhas, largura uniforme das colunas de dias, novo filtro de segmento antes do filtro de turma — aplicados tanto na página `/school-schedule` quanto no relatório PDF baixável.

## Stack Tecnológica
- Frontend: React 18 + Vite + Tailwind CSS
- PDF: HTML gerado por `_scheduleGrid` em `src/lib/reports.js`, aberto via `openPDF`
- Dados: Zustand (`useAppStore`) — `schedules`, `segments`, `teachers`, `subjects`

---

## Páginas e Rotas

### SchoolSchedulePage — `/school-schedule`

**Componentes afetados:**
- `SchoolGrid` — tabela JSX da grade
- Sidebar de filtros

**Behaviors:**

- [ ] **B1 — Tipografia da grade (app)**: aplicar cores mais escuras nas células:
  - Cabeçalho de dias (thead `<th>`): `text-[#1a1814] font-bold` (preto)
  - Coluna de aulas (primeira `<td>`): label da aula em `text-[#1a1814] font-bold`; horário (início–fim) em `text-[#4a4740] text-[10px]`
  - Linha 1 da célula (nome do professor ou turma/série): `text-[#1a1814] font-semibold` (preto)
  - Linha 2 da célula (matéria): `text-[#4a4740]` (cinza bem escuro)
  - Célula vazia (`—`): manter `text-t3`

- [ ] **B2 — Layout duas linhas na célula (app)**:
  - Substituir layout inline (`span • span`) por bloco de duas linhas:
  ```jsx
  // Visão por turma (showTeacher=true):
  <div className="leading-tight">
    <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide">
      {teacher?.name ?? '—'}
    </div>
    <div className="text-[#4a4740] text-[10px]">{subject?.name ?? '—'}</div>
  </div>

  // Visão por professor (showTeacher=false):
  <div className="leading-tight">
    <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide">
      {s.turma ?? '—'}
    </div>
    <div className="text-[#4a4740] text-[10px]">{subject?.name ?? '—'}</div>
  </div>
  ```

- [ ] **B3 — Colunas de dias com largura uniforme (app)**:
  - Adicionar `table-fixed` à `<table>`
  - Primeira coluna (Aula): largura fixa `w-20` (já tem) ou `w-[90px]`
  - Demais colunas (dias): sem largura definida → distribuição automática igual com `table-fixed`
  - Remover `w-20` do `<th>` de "Aula" e usar `style` ou classe dedicada

- [ ] **B4 — Filtro de segmento antes do filtro de turma**:
  - Novo estado `filterSegmento` (`useState('')`)
  - Select "Segmento" aparece entre o select de professor e o select de turma
  - Opções: segmentos que possuem schedules (derivados de `store.schedules → timeSlot → segId → store.segments`)
  - Quando `filterTeacher` está ativo, filtrar também por segmentos que esse professor usa
  - `allTurmas` passa a ser filtrado também por `filterSegmento`:
    ```js
    const allTurmas = [...new Set(
      store.schedules
        .filter(s =>
          (!filterTeacher  || s.teacherId === filterTeacher) &&
          (!filterSegmento || s.timeSlot?.split('|')[0] === filterSegmento)
        )
        .map(s => s.turma).filter(Boolean)
    )].sort()
    ```
  - Ao mudar `filterSegmento`, resetar `filterTurma`
  - Ao mudar `filterTeacher`, resetar `filterSegmento` e `filterTurma`
  - `filtered` (schedules para a grade) inclui o novo filtro:
    ```js
    const filtered = store.schedules.filter(s =>
      (!filterTeacher  || s.teacherId === filterTeacher) &&
      (!filterSegmento || s.timeSlot?.split('|')[0] === filterSegmento) &&
      (!filterTurma    || s.turma === filterTurma)
    )
    ```
  - Chip de filtro ativo para segmento (mesmo padrão dos chips existentes)
  - "Limpar filtros" reseta os três filtros

---

### PDF — `_scheduleGrid` em `reports.js`

**Behaviors:**

- [ ] **B5 — Tipografia do PDF (duas linhas na célula)**:
  - Atualizar `_scheduleGrid` para renderizar duas linhas na célula:
  ```js
  // Visão por turma (showTeacher=true):
  `<strong style="color:#1a1814;font-size:11px;text-transform:uppercase;letter-spacing:.02em">${teacher?.name ?? '—'}</strong>
  <br><span style="color:#4a4740;font-size:10px">${subj?.name ?? '—'}</span>`

  // Visão por professor (showTeacher=false):
  `<strong style="color:#1a1814;font-size:11px;text-transform:uppercase;letter-spacing:.02em">${s.turma ?? '—'}</strong>
  <br><span style="color:#4a4740;font-size:10px">${subj?.name ?? '—'}</span>`
  ```
  - Remover o separador ` · ` e o `s.turma` da linha do professor (formato antigo misturava turma+matéria na linha do professor)

- [ ] **B6 — Cabeçalho e primeira coluna mais escuros no PDF**:
  - `<th>` dos dias: adicionar `color:#1a1814` (já tem fundo, mas a cor do texto era herdada do CSS base)
  - Primeira `<td>` (label da aula): `<strong>` já está — adicionar `color:#1a1814` explícito
  - Horário (início–fim): `color:#4a4740` em vez de `color:#a09d97`

- [ ] **B7 — Colunas de dias com largura uniforme no PDF**:
  - Adicionar `style="table-layout:fixed;width:100%"` à `<table>`
  - Primeira coluna: `style="width:90px;white-space:nowrap"`
  - Demais colunas: sem largura → distribuição automática igual com `table-layout:fixed`

---

## Componentes Compartilhados

- `SchoolGrid` (`SchoolSchedulePage.jsx`) — afetado por B1, B2, B3
- Sidebar de filtros (`SchoolSchedulePage.jsx`) — afetado por B4
- `_scheduleGrid` (`reports.js`) — afetado por B5, B6, B7

## Modelos de Dados
Sem alteração. `filterSegmento` é estado local de UI derivado de `s.timeSlot.split('|')[0]`.

## Regras de Negócio

1. Hierarquia de filtros: Professor → Segmento → Turma (cada nível reduz o escopo do próximo)
2. Mudar professor reseta segmento e turma; mudar segmento reseta turma
3. Linha 1 da célula = entidade "principal" (professor na visão por turma; turma na visão por professor)
4. Linha 2 da célula = matéria (sempre)

## Fora do Escopo (v1)
- Filtro de segmento no PDF (o PDF já reflete os filtros da página via parâmetros)
- Ordenação customizada dos dias ou das aulas
- Exportação para Excel/CSV
