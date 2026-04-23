# Spec: Tipos de Turmas Compartilhadas — Formação, Eletiva e Descanso

## Visão Geral

Expande o sistema de turmas compartilhadas (`sharedSeries`) adicionando um terceiro tipo: **descanso**. Os tipos formação e eletiva já existem parcialmente no código mas precisam de ajustes comportamentais. O tipo descanso tem semântica distinta: não exige seleção de matéria e exibe "almoço/janta" no lugar do nome da matéria em toda grade horária.

**Problema resolvido:** Slots de almoço/janta de professores que trabalham em turno duplo precisam aparecer na grade horária com identificação visual específica, sem poluir a lista de matérias e sem acionar o fluxo de substituição.

---

## Stack Tecnológica

- Frontend: React 18 + Tailwind CSS (SPA)
- Estado global: Zustand (`useAppStore`)
- Banco de dados: Firestore (`meta/config` → campo `sharedSeries`)
- Utilitários: `src/lib/helpers/turmas.js` (funções `isFormationSlot`, `isSharedSeries`)
- Componentes afetados: `TabSharedSeries.jsx`, `AddScheduleModal.jsx`, `ScheduleGrid.jsx`, `CalendarPage.jsx`, `CalendarDayPage.jsx`, `GradesPage.jsx`

---

## Modelo de Dados

### `sharedSeries[]` em `meta/config`

Campo existente. Cada item recebe o novo tipo possível:

```js
{
  id:   "shared-xyz",   // uid()
  name: "ALMOÇO",       // label exibido na grade
  type: "rest"          // "formation" | "elective" | "rest"  ← novo valor
}
```

**Contrato dos três tipos:**

| type | Exige matéria ao adicionar slot | Exibe na grade | Demanda substituto | Badge |
|---|---|---|---|---|
| `formation` | Sim (matéria do prof) | nome da matéria | Não | "Dispensa de Substituição" |
| `elective` | Sim (matéria do prof) | nome da matéria | Sim (fluxo normal) | nenhum |
| `rest` | Não | "almoço/janta" (fixo) | Não | "Descanso" |

### `schedules/` — sem mudança de estrutura

Slots de descanso são gravados normalmente. `subjectId` fica `null` para slots de tipo `rest`.

```js
{
  teacherId: "...",
  day:       "Segunda",
  timeSlot:  "seg-fund|manha|3",
  turma:     "ALMOÇO",     // name do sharedSeries de tipo rest
  subjectId: null          // sempre null para rest
}
```

---

## Regras de Negócio

1. **Tipo `rest` nunca exige matéria.** Em `AddScheduleModal`, quando a turma selecionada pertence a um `sharedSeries.type === 'rest'`, o seletor de matéria é completamente ocultado (não apenas opcional — ele não aparece). `subjectId` é gravado como `null`.

2. **Tipo `rest` não gera ausência.** Em `CalendarPage` e `CalendarDayPage`, slots de descanso recebem o mesmo tratamento de bloqueio que slots de formação: o botão "Marcar Falta" fica desabilitado e nenhum fluxo de substituição é acionado.

3. **Tipo `formation` e `elective` continuam exigindo matéria.** A validação em `AddScheduleModal` permanece: `if (isShared && !subjId) alert('Selecione a matéria.')` — mas agora a condição deve excluir o tipo `rest`: `if (isSharedAndNeedsSubject && !subjId)`.

4. **Tipo `elective` demanda substituto.** O fluxo de ausência para eletivas segue o caminho das aulas regulares — botão "Marcar Falta" habilitado, ranking de candidatos funciona normalmente.

5. **Exibição na grade para `rest`.** Em qualquer componente que renderize `subj?.name ?? '—'` para um slot de turma compartilhada, verificar se a turma é de tipo `rest`: se sim, exibir o texto fixo "almoço/janta" em vez do nome da matéria.

6. **Validação em `useAppStore`.** As actions `addSharedSeries` e `updateSharedSeries` já validam o campo `type`. A lista aceita agora deve ser `['formation', 'elective', 'rest']`.

7. **Badge visual distinto para `rest`.** Na grade horária, slots de descanso exibem um badge diferente de "Dispensa de Substituição" — exibem "Descanso" com cor neutra (ex: `bg-surf2 text-t2`).

---

## Páginas e Rotas

### SettingsPage — `/settings` (aba "Formação")

**Descrição:** Admin gerencia turmas compartilhadas. Atualmente suporta apenas os tipos "formation" e "elective". Precisa adicionar a opção "descanso" no modal de criação/edição.

**Componentes:**
- `TabSharedSeries`: aba existente com listagem e modal de criação/edição
- `SharedSeriesModal` (interno a `TabSharedSeries`): formulário de criação/edição

**Behaviors:**
- [ ] Adicionar `rest` ao seletor de tipo: o radio group em `SharedSeriesModal` ganha uma terceira opção "Descanso (almoço/janta — sem matéria, sem substituto)"
- [ ] Atualizar o badge de tipo nos cards da listagem: `rest` exibe badge cinza/neutro com texto "Descanso" (atualmente só há lógica para `formation` → azul e `elective` → âmbar)
- [ ] Atualizar o texto descritivo no rodapé do card de cada turma compartilhada listada para refletir o tipo `rest`: "Slot de descanso. Não requer matéria nem substituto."
- [ ] Atualizar o estado vazio da aba: o texto "Crie turmas de Formação ou Eletiva para uso em múltiplos professores simultâneos." deve incluir "ou Descanso"

---

### SchedulePage — `/schedule`

**Descrição:** Professor ou admin configura a grade horária individual de um professor. O fluxo de adição de aula usa `AddScheduleModal`, onde o professor seleciona turma e matéria.

**Componentes:**
- `ScheduleGrid`: renderiza a matriz de horários e chama `AddScheduleModal`
- `AddScheduleModal`: modal de seleção de turma + matéria

**Behaviors:**
- [ ] Em `AddScheduleModal`, detectar se a turma compartilhada selecionada tem `type === 'rest'`: se sim, ocultar completamente a seção "Matéria" (não exibir nem a mensagem de obrigatoriedade)
- [ ] Atualizar a validação de save em `AddScheduleModal`: a regra `if (isShared && !subjId) alert('Selecione a matéria.')` deve verificar `isSharedAndNeedsSubject` — apenas tipos `formation` e `elective` exigem matéria; tipo `rest` passa sem `subjId`
- [ ] Em `ScheduleGrid`, ao renderizar um slot de turma compartilhada com `subjectId === null` E turma de tipo `rest`, exibir o texto "almoço/janta" no lugar de `subj?.name ?? '—'`
- [ ] Garantir que `onSave` grave `subjectId: null` quando o tipo for `rest` (o `AddScheduleModal` já passa `subjId || null`, mas a turma `rest` não deve nem tentar buscar `subjId`)

---

### GradesPage (SchoolSchedulePage) — `/school-schedule`

**Descrição:** Grade horária geral de toda a escola. Exibe aulas por turma ou por professor. Slots de sharedSeries aparecem aqui também.

**Componentes:**
- Tabela de grade por professor/turma (renderiza `subj?.name ?? '—'` para cada slot)

**Behaviors:**
- [ ] Ao renderizar o nome da matéria de um slot, verificar se a turma do slot pertence a um `sharedSeries` com `type === 'rest'`: se sim, exibir "almoço/janta" em vez de `subj?.name ?? '—'`

---

### CalendarPage — `/calendar`

**Descrição:** Calendário semanal interativo de ausências e substituições. Slots de formação já recebem "Dispensa de Substituição" e bloqueiam o botão de marcar falta. Slots de eletiva seguem fluxo normal. Slots de descanso precisam de tratamento equivalente ao de formação.

**Componentes:**
- Grade de slots por professor/dia (inline)
- Modal de slot (quando clicado)

**Behaviors:**
- [ ] Criar ou refatorar o helper de detecção: em vez de apenas `isFormationSlot`, ter uma função `isNoSubstituteSlot(turma, subjectId, sharedSeries)` que retorna `true` para tipos `formation` e `rest` — ou manter `isFormationSlot` e adicionar `isRestSlot` separado; o importante é que ambos bloqueiem o botão de marcar falta
- [ ] Para slots de tipo `rest`: exibir badge "Descanso" (distinto de "Dispensa de Substituição") no lugar onde hoje aparece o nome da matéria
- [ ] Para slots de tipo `rest`: desabilitar o botão "Marcar Falta" (mesmo comportamento do tipo `formation`)
- [ ] Para slots de tipo `elective`: manter o botão "Marcar Falta" habilitado e o fluxo de substituição normal (sem badge especial)
- [ ] Exibir "almoço/janta" no lugar de `subj?.name ?? '—'` para slots de tipo `rest`

---

### CalendarDayPage — `/calendar/day`

**Descrição:** Versão mobile do calendário, com cards colapsáveis por período. Usa a mesma lógica de `isFormationSlot` que `CalendarPage`.

**Behaviors:**
- [ ] Aplicar a mesma lógica de detecção de `rest` que CalendarPage: botão "Marcar Falta" desabilitado, badge "Descanso" exibido
- [ ] Exibir "almoço/janta" no lugar do nome da matéria para slots de tipo `rest`
- [ ] Slots de tipo `elective` continuam habilitados para marcação de falta

---

## Componentes Compartilhados

### `isFormationSlot` — `src/lib/helpers/turmas.js`

Função existente que detecta apenas `type === 'formation'`. Precisa ser complementada ou substituída para cobrir o tipo `rest` no contexto de "bloquear marcar falta".

Duas opções de abordagem:
- **Opção A (recomendada):** Adicionar `isRestSlot(turma, sharedSeries)` análoga a `isFormationSlot`; nos pontos de uso criar a variável composta `const blockAbsence = isFormation || isRest`.
- **Opção B:** Renomear `isFormationSlot` para `isNoSubstituteSlot` e expandir a lógica para cobrir `type === 'formation' || type === 'rest'`. Requer atualizar todos os pontos de uso.

A Opção A tem menor risco de regressão.

### `useAppStore` — `src/store/useAppStore.js`

Actions `addSharedSeries` e `updateSharedSeries` validam `type` contra `['formation', 'elective']`. Precisa adicionar `'rest'` à lista de tipos aceitos.

### `TabSharedSeries.jsx` — `src/components/settings/tabs/TabSharedSeries.jsx`

Componente de gerenciamento. Radio group de tipo precisa de terceira opção. Badge de tipo precisa de cor para `rest`.

### `AddScheduleModal.jsx` — `src/components/ui/AddScheduleModal.jsx`

Lógica de exibição/ocultação da seção de matéria para turmas compartilhadas. Hoje exibe sempre que `selectedSharedSeries` está definido. Precisa verificar `selectedSharedSeries?.type !== 'rest'` antes de exibir.

---

## Fora do Escopo (v1)

- Criar um novo "tipo de turma" genérico configurável pelo admin (seria uma feature maior de customização de tipos).
- Relatórios diferenciados por tipo de turma compartilhada (ex: relatório só de descansos).
- Permitir múltiplos professores no mesmo slot de descanso com regras específicas (a lógica de slots compartilhados já permite isso sem mudanças).
- Interface de migração de dados: turmas existentes com `type === 'elective'` que administrativamente eram "descanso" precisam ser editadas manualmente pelo admin — não há migração automática.
- Notificação ou alerta ao professor sobre slots de descanso na grade (funcionalidade de comunicação interna).
