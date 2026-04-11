# Spec: Isolamento da Grade por Professor e Áreas Compartilhadas

## Visão Geral

Dois problemas distintos na `ScheduleGrid`:

1. **Bug de vazamento de dados (issue #20 introduziu):** quando um professor adiciona uma aula num slot, a grade passa a exibir também as aulas de *outros* professores naquele mesmo slot — comportamento introduzido pelos mini-cards implementados na issue #20. Professores devem ver apenas suas próprias aulas; mini-cards de terceiros são exclusivos para admin.

2. **Feature: áreas compartilhadas (Formação e Eletiva):** certas áreas do conhecimento permitem que múltiplos professores ocupem o mesmo slot/turma simultaneamente (ex: momentos de formação coletiva). Atualmente o sistema bloqueia qualquer segundo professor no mesmo slot/turma. É preciso excepcionar turmas cujos ocupantes pertencem a uma área marcada como "compartilhada".

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Estado:** Zustand (`useAppStore` — `areas`, `subjects`, `schedules`)
- **Backend/DB:** Firebase Firestore (coleções `meta/config` para areas/subjects, `schedules`)

---

## Páginas e Rotas

### SettingsPage — `/settings`

**Componentes afetados:**
- `ScheduleGrid` — renderiza a grade semanal de um professor
- `AddScheduleModal` — modal de seleção de turma ao adicionar aula
- `TabAreas` — onde o admin configura áreas do conhecimento

---

**Behaviors — Correção do isolamento (Bug):**

- [ ] Professor vê apenas suas próprias aulas na grade — nenhuma aula de outros professores é exibida
- [ ] Quando `teacherConflict` (professor já tem aula no slot): mostrar 🔒 sem mini-cards de terceiros
- [ ] Quando `freeTurmas.length === 0` (todas turmas ocupadas por outros): mostrar `—` sem mini-cards de terceiros
- [ ] Admin continua vendo mini-cards com nome do professor e turma em ambos os casos (comportamento da issue #20 mantido para admin)

**Behaviors — Áreas compartilhadas (Feature):**

- [ ] Admin pode marcar uma área como "compartilhada" na aba de configuração de áreas (`TabAreas`)
- [ ] Uma turma ocupada exclusivamente por professores de áreas compartilhadas **não** é bloqueada para novos professores com subjects da mesma área compartilhada
- [ ] Na grade: uma turma com ocupante compartilhado exibe `＋` (não `—`), permitindo que outro professor de área compartilhada adicione aula
- [ ] No `AddScheduleModal`: pill de turma compartilhada-occupied aparece disponível (não bloqueado)
- [ ] No `AddScheduleModal.save()`: se o professor tentar adicionar um subject de área NÃO compartilhada a uma turma ocupada por compartilhada, bloquear com mensagem de erro
- [ ] Uma turma com ocupante de área NÃO compartilhada continua bloqueada normalmente (comportamento atual)

---

## Modelos de Dados

### `areas` — campo novo

```js
{
  id: string,
  name: string,
  colorIdx: number,
  segmentIds: string[],
  shared: boolean,      // NOVO — default false
}
```

Sem alteração nas outras coleções. A lógica de "compartilhado" é derivada em runtime consultando `area.shared` através de `subject.areaId`.

### Helper de consulta (derivado, sem persistir)

```js
// Verifica se um schedule pertence a área compartilhada
function isSharedSchedule(schedule, store) {
  const subj = store.subjects.find(s => s.id === schedule.subjectId)
  const area = store.areas.find(a => a.id === subj?.areaId)
  return area?.shared === true
}
```

---

## Regras de Negócio

### Bug — isolamento

1. `ScheduleGrid` deve receber `isAdmin: boolean` como prop.
2. Mini-cards de outros professores (turma + nome) só são renderizados quando `isAdmin === true`.
3. Para professores (`isAdmin === false`): `teacherConflict` → 🔒 apenas; `freeTurmas.length === 0` → `—` apenas.

### Feature — áreas compartilhadas

4. Uma turma+slot é **livre para área compartilhada** se todos os ocupantes existentes naquele turma+slot (por outros professores) têm subjects de áreas com `shared: true`.
5. Uma turma+slot é **bloqueada** se pelo menos um ocupante tem subject de área com `shared: false`.
6. Na grade (`ScheduleGrid`): ao calcular `freeTurmas`, incluir turmas que são "livres para área compartilhada" (regra 4).
7. No modal (`AddScheduleModal`): pills de turmas "livres para área compartilhada" ficam desbloqueados. Validação final em `save()`:
   - Se a turma tem ocupante compartilhado e o novo subject NÃO é de área compartilhada → bloquear: `"Esta turma está reservada para área compartilhada"`
8. O campo `shared` é editável apenas pelo admin na `TabAreas`.
9. `addArea` e `updateArea` no store passam a aceitar e persistir o campo `shared`.

---

## Componentes Compartilhados

Nenhum novo componente. Todas as mudanças são internas a `SettingsPage.jsx` e `useAppStore.js`.

---

## Fora do Escopo (v1)

- Indicar visualmente na grade que uma turma é "compartilhada" (além de permitir a adição)
- Múltiplas turmas da mesma área compartilhada no mesmo slot pelo mesmo professor (regra de unicidade de professor permanece)
- Configuração de "compartilhado" fora da aba de áreas (ex: por turma, por horário)
- Alteração de regras de Firestore Security Rules
