# Spec: Correção de Matérias no AddScheduleModal

## Visão Geral

O `AddScheduleModal` permite ao professor cadastrar um slot (aula) na grade horária.
Ao selecionar uma turma compartilhada (`sharedSeries`) que possui matérias cadastradas
(`series.subjects`), o modal atualmente exibe essas matérias em um `<select>` (dropdown),
divergindo do padrão visual de pills usado para matérias regulares. Além disso, a
validação do botão "Adicionar" ignora `sharedSubject` como satisfatório para o
campo "matéria", exigindo indevidamente um `subjectId` regular.

Este spec corrige os dois problemas: unifica a apresentação visual (pills em ambos os
casos) e unifica a lógica de validação (qualquer matéria — regular ou de turma
compartilhada — satisfaz o requisito de matéria selecionada).

## Stack Tecnológica

- Frontend: React 18 + Tailwind CSS 3.4 (tokens de design do projeto)
- Estado local: `useState` dentro do componente (sem store)
- Arquivo único afetado: `src/components/ui/AddScheduleModal.jsx`
- Sem alterações em store, lib ou outros componentes

## Páginas e Rotas

### AddScheduleModal — componente de modal (sem rota própria)

**Descrição:** Modal aberto a partir de `SchedulePage` quando o professor clica em
um slot vazio da grade horária. Permite selecionar Ano/Série, Turma (regular ou
compartilhada) e Matéria (regular ou da turma compartilhada) antes de confirmar o
cadastro do slot.

**Componentes:**
- `AddScheduleModal`: componente principal (único arquivo, sem sub-componentes)
- `Modal`: wrapper reutilizável de overlay/backdrop (`src/components/ui/Modal.jsx`)

**Behaviors:**

- [ ] **B1 — Exibir matérias de turma compartilhada como pills:** Quando `selectedSharedSeries?.subjects?.length > 0` e `!isRestType`, renderizar cada item de `selectedSharedSeries.subjects` como um `<button>` pill com as mesmas classes CSS das matérias regulares (`pillOff` / `pillOn`), substituindo o `<select className="inp">` atual.

- [ ] **B2 — Selecionar sharedSubject via pill:** Ao clicar em uma pill de matéria de turma compartilhada, definir `sharedSubject` com o valor da string clicada. Se a mesma pill for clicada novamente, desmarcar (toggle: `sharedSubject === s ? '' : s`).

- [ ] **B3 — Exclusão mútua ao selecionar sharedSubject:** Ao selecionar qualquer pill de matéria de turma compartilhada (`sharedSubject`), limpar `subjId` setando-o para `''`.

- [ ] **B4 — Exclusão mútua ao selecionar subjectId regular:** Ao selecionar qualquer pill de matéria regular (`subjId`), limpar `sharedSubject` setando-o para `''`.

- [ ] **B5 — Validar matéria unificada na função `save()`:** Substituir a verificação `if (isSharedAndNeedsSubject && !subjId)` pela lógica expandida abaixo, respeitando todos os cenários:
  - Turma compartilhada com `subjects.length > 0` E `sharedSubject` vazio E `subjId` vazio → bloquear e alertar `'Selecione a matéria.'`
  - Turma compartilhada com `subjects.length > 0` E `sharedSubject` preenchido → matéria OK, não exigir `subjId`
  - Turma compartilhada sem `subjects` (`subjects.length === 0` ou ausente) → não exigir matéria
  - Turma regular (`!isShared`) → exigir `subjId` preenchido (comportamento atual mantido implicitamente pela seção de matérias regulares)

- [ ] **B6 — Atualizar disabled do botão "Adicionar":** O atributo `disabled` do botão deve refletir a lógica unificada do B5: `disabled={!turma || (isSharedAndNeedsSubject && !sharedSubject && !subjId)}`. Remover a condição anterior `(!isRestType && selectedSharedSeries?.subjects?.length > 0 && !sharedSubject)`.

- [ ] **B7 — Campo `sharedSubject` ausente quando turma regular:** Quando nenhuma turma compartilhada está selecionada (`selectedSharedSeries === null`), a seção de matérias de turma compartilhada não deve ser renderizada (comportamento atual mantido).

- [ ] **B8 — Limpar sharedSubject ao trocar para turma regular:** Ao clicar em uma turma regular (pill de Turma no bloco de Ano/Série), executar `setSharedSubject('')` — isso já ocorre via `onClick={() => { setGrade(''); setTurma(...); setSubjId(''); setSharedSubject('') }}` nas turmas compartilhadas, verificar simetria no handler das turmas regulares.

- [ ] **B9 — Payload de onSave inalterado:** O objeto passado para `onSave` continua incluindo `{ teacherId, subjectId, turma, day, timeSlot, sharedSubject }`. O `finalSubjectId` para turma compartilhada com `sharedSubject` preenchido deve ser `null` (já implementado via `isRestType ? null : (subjId || null)`). Confirmar que o campo `sharedSubject` do payload recebe o valor correto quando selecionado via pill.

---

## Componentes Compartilhados

- `Modal` (`src/components/ui/Modal.jsx`): sem alterações — usado como wrapper.

## Modelos de Dados

### sharedSeries (de `meta/config`, via `store.sharedSeries`)

```js
{
  id:       string,       // uid()
  name:     string,       // ex: "FORMAÇÃO", "ELETIVA"
  type:     string,       // "formation" | "elective" | "rest"
  subjects: string[]      // array de strings — nomes das matérias da turma compartilhada
                          // campo OPCIONAL — ausente ou vazio = sem matérias cadastradas
}
```

### Estado local do AddScheduleModal

| Campo | Tipo | Descrição |
|---|---|---|
| `subjId` | `string` | ID de matéria regular (`subjects[].id`). Vazio quando nenhuma selecionada ou quando `sharedSubject` está ativo. |
| `grade` | `string` | Nome do Ano/Série selecionado (ex: `"6º Ano"`). |
| `turma` | `string` | Nome da turma selecionada — pode ser `"6º Ano A"` (regular) ou `"FORMAÇÃO"` (compartilhada). |
| `sharedSubject` | `string` | Nome da matéria da turma compartilhada (string livre de `series.subjects`). Vazio quando nenhuma selecionada ou quando `subjId` está ativo. |

### Payload de onSave (sem alteração)

```js
{
  teacherId:    string,       // teacher.id
  subjectId:    string|null,  // subjId || null (null para turma rest ou quando sharedSubject ativo)
  turma:        string,       // nome da turma
  day:          string,       // "Segunda" | "Terça" | ...
  timeSlot:     string,       // "segId|turno|aulaIdx"
  sharedSubject: string|null  // nome da matéria compartilhada ou null
}
```

## Regras de Negócio

**RN1 — Exclusão mútua entre subjectId e sharedSubject:**
Os dois campos de matéria são mutuamente exclusivos. Ao ativar um, o outro deve ser
zerado. Nunca devem estar ambos preenchidos no payload de `onSave`.

**RN2 — Matéria obrigatória quando disponível:**
Se a turma selecionada (regular ou compartilhada) tem matérias disponíveis, o
cadastro não pode prosseguir sem que uma matéria esteja selecionada. A condição
de "matéria disponível" é:
- Para turmas regulares: `mySubjs.length > 0`
- Para turmas compartilhadas: `!isRestType && selectedSharedSeries?.subjects?.length > 0`

**RN3 — Turmas compartilhadas do tipo rest não exigem matéria:**
`isRestType === true` (tipo `"rest"`) sempre dispensa a seleção de matéria,
independentemente de haver `subjects` cadastrados.

**RN4 — Pill "— sem matéria —" para turmas regulares:**
A pill de deseleção `"— sem matéria —"` (que seta `subjId = ''`) continua presente
na seção de matérias regulares. Ela existe para permitir aulas sem matéria vinculada
quando `mySubjs` é vazio (mas o parágrafo de "nenhuma matéria vinculada" cobre esse
caso). A verificação de obrigatoriedade (RN2) deve garantir que a pill "— sem matéria —"
não permita confirmar se há matérias disponíveis.

**RN5 — Conflitos de horário:**
As validações de conflito existentes (professor já tem aula no slot, turma já tem
professor, turma reservada para área compartilhada) não são alteradas por este spec.

## Fora do Escopo (v1)

- Alterações no modelo de dados `sharedSeries` no Firestore
- Alterações na aba "Formação" da SettingsPage (onde `series.subjects` é cadastrado)
- Alterações no payload consumido por `store.addSchedule`
- Alterações em `SchedulePage`, `SchoolSchedulePage` ou qualquer outra página
- Suporte a multi-seleção de matérias (apenas uma matéria por slot)
- Reordenação ou agrupamento visual das seções do modal
- Testes automatizados
