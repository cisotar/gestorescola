# Spec: Correção da Contagem de Aulas Atribuídas

## Visão Geral

A coluna "Atribuídas" na tabela de carga horária (`WorkloadConsolidatedTable`) conta
atualmente **todas** as aulas de um professor na grade, incluindo slots de formação
(`type: 'formation'`) e de descanso (`type: 'rest'`), que não demandam substituto. A
correção filtra esses slots para que "Atribuídas" represente apenas aulas que, quando
perdidas, exigem cobertura por substituto.

---

## Stack Tecnológica

- Frontend: React 18 + Tailwind CSS
- Estado global: Zustand (`useAppStore`)
- Banco de dados: Firestore (via Firebase SDK v10)
- Build: Vite 5

---

## Páginas e Rotas

### Carga Horária — `/workload`

**Descrição:** Tabela com a carga de cada professor: aulas atribuídas, aulas de
formação, aulas dadas, faltas, substituições realizadas e saldo. Acessível a admin e
coordenadores.

**Componentes:**
- `WorkloadConsolidatedTable` (em `src/components/ui/WorkloadShared.jsx`): renderiza a
  tabela consolidada; recebe `teachers`, `schedules`, `absences`, `sharedSeries`,
  `period` e `variant` como props.
- `WorkloadRow`: linha individual da tabela; recebe o valor `atribuidas` já calculado
  pelo componente pai.

**Behaviors:**
- [ ] Contar como "Atribuída" toda aula cujo campo `turma` aponta para uma turma regular
  (ex: "6º Ano A") — essas turmas não constam em `sharedSeries`.
- [ ] Contar como "Atribuída" toda aula cujo campo `turma` corresponde a uma entrada de
  `sharedSeries` com `type: 'elective'` (ex: "Eletiva 2024") — eletivas exigem
  substituto.
- [ ] Não contar como "Atribuída" aulas cujo campo `turma` corresponde a uma entrada de
  `sharedSeries` com `type: 'formation'` (ex: "FORMAÇÃO") — formações não geram
  demanda de substituto.
- [ ] Não contar como "Atribuída" aulas cujo campo `turma` corresponde a uma entrada de
  `sharedSeries` com `type: 'rest'` (ex: "ALMOÇO") — períodos de descanso não geram
  demanda de substituto.
- [ ] O cálculo deve usar as funções já existentes `isFormationSlot(turma, null,
  sharedSeries)` e `isRestSlot(turma, sharedSeries)` de
  `src/lib/helpers/turmas.js`.
- [ ] Importar `isRestSlot` junto com o `isFormationSlot` já importado na linha 2 de
  `WorkloadShared.jsx`.
- [ ] A coluna "Formação" (já calculada corretamente via `isFormationSlot`) não é
  alterada por esta correção.

---

### HomePage — `/home`

**Descrição:** Card de carga horária exibido ao professor logado. Usa o mesmo
`WorkloadConsolidatedTable` (ou componente derivado do mesmo arquivo compartilhado).

**Behaviors:**
- [ ] O valor "Atribuídas" exibido no card deve refletir a mesma lógica corrigida da
  página `/workload`, sem nenhuma alteração adicional, pois ambos consomem o mesmo
  componente compartilhado.

---

## Componentes Compartilhados

- `WorkloadConsolidatedTable` (`src/components/ui/WorkloadShared.jsx`): usado em
  `WorkloadPage` e no card de carga horária da `HomePage`. É o único local onde o
  cálculo de `atribuidas` precisa ser alterado.

---

## Modelos de Dados

### `schedules/` (coleção Firestore)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | uid() |
| `teacherId` | string | FK → teachers[].id |
| `day` | string | "Segunda" … "Sexta" |
| `timeSlot` | string | "segmentId\|turno\|aulaIdx" |
| `turma` | string | Nome da turma ou nome de sharedSeries |
| `subjectId` | string | FK → subjects[].id |

### `sharedSeries` (dentro de `meta/config`)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | uid() |
| `name` | string | Nome exibido na grade (ex: "FORMAÇÃO", "ALMOÇO") |
| `type` | string | `"formation"` \| `"elective"` \| `"rest"` |

---

## Regras de Negócio

| Tipo de turma | Exige substituto | Conta como "Atribuída" |
|---|:---:|:---:|
| Turma regular (não está em sharedSeries) | Sim | Sim |
| sharedSeries com `type: 'elective'` | Sim | Sim |
| sharedSeries com `type: 'formation'` | Não | Não |
| sharedSeries com `type: 'rest'` | Não | Não |

A verificação é feita **por nome** (`s.turma === ss.name`), portanto depende da
consistência dos nomes gravados em `schedules[].turma` versus `sharedSeries[].name`.
Isso já é um invariante mantido pelo sistema no momento do cadastro de aulas.

---

## Alteração Técnica

**Arquivo:** `src/components/ui/WorkloadShared.jsx`

**Linha 2 — adicionar `isRestSlot` ao import existente:**

```js
// antes
import { isFormationSlot } from '../../lib/helpers/turmas'

// depois
import { isFormationSlot, isRestSlot } from '../../lib/helpers/turmas'
```

**Linha 67 — corrigir o cálculo de `atribuidas`:**

```js
// antes
const atribuidas = schedules.filter(s => s.teacherId === teacher.id).length

// depois
const atribuidas = schedules.filter(s =>
  s.teacherId === teacher.id &&
  !isFormationSlot(s.turma, null, sharedSeries) &&
  !isRestSlot(s.turma, sharedSeries)
).length
```

Nenhuma outra linha do arquivo precisa ser modificada.

---

## Fora do Escopo (v1)

- Alterar o comportamento das colunas "Formação", "Dadas", "Faltas", "Subs" ou "Saldo"
  — essas já estão corretas.
- Modificar o algoritmo de ranking de substitutos (`rankCandidates`) — não está
  relacionado à exibição da tabela de carga.
- Criar testes automatizados para o componente (débito técnico separado).
- Alterar o modelo de dados em Firestore ou a estrutura de `sharedSeries`.
- Expor o campo "Atribuídas corrigido" em relatórios PDF — fora do escopo desta
  correção pontual.
