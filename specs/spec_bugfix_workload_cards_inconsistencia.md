# Spec: Correção de Inconsistência de Contagem em WorkloadCards

## Visão Geral

O Dashboard exibe números de carga horária divergentes dos exibidos na página
`/cargahoraria` porque `WorkloadCards.jsx` aplica regras de contagem diferentes
das adotadas em `WorkloadShared.jsx` (a referência canônica). Há duas
inconsistências independentes:

1. `AulasAtribuidasCard` conta todas as aulas agendadas, incluindo formação e
   recesso, em vez de excluí-las.
2. `getTeacherStats` conta faltas de aulas de formação e sem restrição de período
   (início do mês/ano até hoje), em vez de excluir formação e respeitar o
   intervalo temporal.

Após a correção, Dashboard e `/cargahoraria` devem exibir os mesmos números para
cada professor.

---

## Stack Tecnológica

- Frontend: React 18 + Tailwind CSS
- Estado global: Zustand (`useAppStore`)
- Banco de dados: Firestore (via Firebase SDK v10)
- Build: Vite 5

---

## Páginas e Rotas

### Dashboard — `/dashboard`

**Descrição:** Visão consolidada da escola para admin e coordenadores. Contém dois
cards de carga horária: `AulasAtribuidasCard` (ranking de aulas por professor) e
`WorkloadTable` (tabela com Dadas, Faltas, Subs e Saldo).

**Componentes:**
- `AulasAtribuidasCard` (`src/components/ui/WorkloadCards.jsx`): exibe o número de
  aulas atribuídas por professor, excluindo formação e recesso.
- `WorkloadTable` (`src/components/ui/WorkloadCards.jsx`): exibe Aulas Dadas,
  Faltas, Subs e Saldo por professor, usando `getTeacherStats` internamente.
- `getTeacherStats` (função local em `WorkloadCards.jsx`): calcula Faltas e Subs;
  precisa ser corrigida para excluir formação e respeitar o período.

**Behaviors:**
- [ ] Calcular "Atribuídas" excluindo slots de formação: aplicar
  `isFormationSlot(s.turma, null, sharedSeries)` ao filtrar `schedules`.
- [ ] Calcular "Atribuídas" excluindo slots de recesso: aplicar
  `isRestSlot(s.turma, sharedSeries)` ao filtrar `schedules`.
- [ ] Calcular "Faltas" contando apenas ausências cujo slot **não** é de formação:
  aplicar `isFormationSlot(sl.turma, null, sharedSeries)` ao filtrar os slots de
  ausência.
- [ ] Calcular "Faltas" restringindo ao período (início do mês ou do ano até hoje):
  derivar `fromDate` como `${y}-${m}-01` (mês) ou `${y}-01-01` (ano) e filtrar
  `sl.date >= fromDate && sl.date <= today`.
- [ ] Receber `sharedSeries` como prop em `AulasAtribuidasCard` para que os filtros
  de formação e recesso sejam aplicáveis.
- [ ] Receber `sharedSeries` e `period` como parâmetros (ou usar valores locais
  deriváveis de `today`) em `getTeacherStats` para que os filtros de período e de
  formação sejam aplicáveis.
- [ ] Manter `aulasDadas` e `subsGiven` calculados pela função `monthlyLoad` de
  `src/lib/absences` (já correto — sem alteração).
- [ ] Não alterar a aparência visual de nenhum dos dois cards.

---

### Carga Horária — `/cargahoraria`

**Descrição:** Tabela consolidada de carga horária detalhada, servida por
`WorkloadConsolidatedTable` em `WorkloadShared.jsx`. Esta página já está correta e
serve de referência canônica. Nenhuma alteração é necessária aqui.

**Behaviors:**
- [ ] Após a correção de `WorkloadCards.jsx`, os valores exibidos no Dashboard devem
  ser numericamente iguais aos desta página para cada professor e período equivalente.

---

## Componentes Compartilhados

- `WorkloadConsolidatedTable` (`src/components/ui/WorkloadShared.jsx`): referência
  correta das regras de contagem. Não será alterado neste spec.
- `isFormationSlot(turma, _subjectId, sharedSeries)` (`src/lib/helpers/turmas.js`):
  retorna `true` quando a turma pertence a uma `sharedSeries` de `type: 'formation'`.
- `isRestSlot(turma, sharedSeries)` (`src/lib/helpers/turmas.js`): retorna `true`
  quando a turma pertence a uma `sharedSeries` de `type: 'rest'`.

---

## Modelos de Dados

### `schedules/` (coleção Firestore)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | uid() |
| `teacherId` | string | FK → teachers[].id |
| `day` | string | "Segunda" … "Sexta" |
| `timeSlot` | string | "segmentId\|turno\|aulaIdx" |
| `turma` | string | Nome da turma (ex: "6º Ano A") ou nome de sharedSeries (ex: "FORMAÇÃO") |
| `subjectId` | string | FK → subjects[].id |

### `absences/` (coleção Firestore) — slots relevantes

| Campo | Tipo | Descrição |
|---|---|---|
| `teacherId` | string | FK → teachers[].id — professor ausente |
| `slots[].date` | string | ISO date — dia específico da falta ("YYYY-MM-DD") |
| `slots[].turma` | string | Nome da turma do slot ausente |
| `slots[].substituteId` | string\|null | FK → teachers[].id — null = sem substituto |

### `sharedSeries` (dentro de `meta/config`)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | uid() |
| `name` | string | Nome exibido na grade (ex: "FORMAÇÃO", "ALMOÇO") |
| `type` | string | `"formation"` \| `"elective"` \| `"rest"` |

---

## Regras de Negócio

### Definição canônica das métricas (deve ser aplicada em todos os lugares)

| Métrica | Definição |
|---|---|
| **Atribuídas** | Aulas agendadas (`schedules`) do professor, excluindo formação (`type: 'formation'`) e recesso (`type: 'rest'`) |
| **Dadas** | Ocorrências passadas de aulas regulares até hoje, excluindo formação (calculado por `monthlyLoad`) |
| **Faltas** | Slots de ausência do professor, excluindo formação, dentro do período (início do mês/ano até hoje) |
| **Subs** | Slots de ausência de outros professores onde `substituteId === teacherId`, dentro do período |
| **Saldo** | Dadas − Faltas + Subs |

### Regras de filtro para "Atribuídas"

| Tipo de turma | Conta como "Atribuída"? |
|---|:---:|
| Turma regular (não está em sharedSeries) | Sim |
| sharedSeries `type: 'elective'` | Sim |
| sharedSeries `type: 'formation'` | Não |
| sharedSeries `type: 'rest'` | Não |

### Regras de filtro para "Faltas"

| Condição | Deve ser excluído? |
|---|:---:|
| Slot de ausência de aula de formação (`isFormationSlot` retorna `true`) | Sim |
| Slot fora do período atual (antes de `fromDate` ou após `today`) | Sim |

---

## Alteração Técnica

**Arquivo a corrigir:** `src/components/ui/WorkloadCards.jsx`

**Arquivo de referência (não alterar):** `src/components/ui/WorkloadShared.jsx`

### Correção 1 — Adicionar imports necessários (topo do arquivo)

Importar as funções de classificação de turma que já são usadas em `WorkloadShared.jsx`:

```js
// adicionar ao topo do arquivo, junto com imports existentes
import { isFormationSlot, isRestSlot } from '../../lib/helpers/turmas'
```

### Correção 2 — `getTeacherStats` (linhas 4-13)

Adicionar os parâmetros `sharedSeries` e `period` à assinatura e aplicar filtros
de formação e de período ao cálculo de faltas.

```js
// antes
function getTeacherStats(teacherId, today, schedules, absences, sharedSeries = []) {
  const aulasDadas = monthlyLoad(teacherId, today, schedules, absences, sharedSeries)
  const faltas     = (absences || [])
    .filter(ab => ab.teacherId === teacherId)
    .reduce((acc, ab) => acc + ab.slots.length, 0)
  const subs       = (absences || [])
    .flatMap(ab => ab.slots)
    .filter(sl => sl.substituteId === teacherId).length
  return { aulasDadas, absences: faltas, subsGiven: subs }
}

// depois
function getTeacherStats(teacherId, today, schedules, absences, sharedSeries = [], period = 'month') {
  const [y, m] = today.split('-')
  const fromDate = period === 'month' ? `${y}-${m}-01` : `${y}-01-01`

  const aulasDadas = monthlyLoad(teacherId, today, schedules, absences, sharedSeries)

  const faltas = (absences || [])
    .filter(ab => ab.teacherId === teacherId)
    .flatMap(ab => ab.slots ?? [])
    .filter(sl =>
      sl.date >= fromDate &&
      sl.date <= today &&
      !isFormationSlot(sl.turma, null, sharedSeries)
    ).length

  const subs = (absences || [])
    .flatMap(ab => ab.slots ?? [])
    .filter(sl =>
      sl.substituteId === teacherId &&
      sl.date >= fromDate &&
      sl.date <= today
    ).length

  return { aulasDadas, absences: faltas, subsGiven: subs }
}
```

### Correção 3 — `AulasAtribuidasCard` (linha 15)

Adicionar `sharedSeries` à assinatura da prop e aplicar filtros de formação e
recesso ao cálculo de `count`:

```js
// antes
export function AulasAtribuidasCard({ teachers, schedules }) {
  // ...
  const rows = lecturers
    .map(t => ({
      t,
      count: (schedules ?? []).filter(s => s.teacherId === t.id).length,
    }))

// depois
export function AulasAtribuidasCard({ teachers, schedules, sharedSeries = [] }) {
  // ...
  const rows = lecturers
    .map(t => ({
      t,
      count: (schedules ?? []).filter(s =>
        s.teacherId === t.id &&
        !isFormationSlot(s.turma, null, sharedSeries) &&
        !isRestSlot(s.turma, sharedSeries)
      ).length,
    }))
```

### Correção 4 — Passar `sharedSeries` no call site do Dashboard

Localizar o uso de `AulasAtribuidasCard` em `DashboardPage.jsx` e acrescentar a
prop `sharedSeries`. O mesmo se aplica ao `WorkloadTable` se o componente receber o
parâmetro `period` que é passado via estado da UI.

---

## Fora do Escopo (v1)

- Alterar `WorkloadShared.jsx` ou `WorkloadConsolidatedTable` — já estão corretos.
- Criar o toggle de período (mês/ano) no Dashboard — `WorkloadTable` usará `'month'`
  por padrão até que um toggle seja implementado.
- Modificar o algoritmo `monthlyLoad` ou `rankCandidates` — não relacionados.
- Criar testes automatizados para os componentes corrigidos — débito técnico separado.
- Alterar o modelo de dados no Firestore ou a estrutura de `sharedSeries`.
- Expor os valores corrigidos em relatórios PDF.
