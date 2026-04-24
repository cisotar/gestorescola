# Spec: UX da Grade Horária — Botões de Remoção e Drag and Drop

## Visão Geral

Duas melhorias de experiência de uso no componente `ScheduleGrid`, que renderiza a grade horária de professores. A primeira torna o botão de remover aula (✕) mais visível e fácil de acionar. A segunda permite arrastar um card de aula já inserido para outro slot da grade, movendo a aula em vez de exigir que o usuário a apague e re-insira no lugar certo.

---

## Stack Tecnológica

- Frontend: React 18 + JSX
- Estado global: Zustand (`useAppStore`)
- Banco de dados: Firebase Firestore
- Estilização: Tailwind CSS (utility-first, tokens customizados do projeto)
- Drag and drop: HTML5 Drag and Drop API nativa — sem bibliotecas externas
- Componente central: `src/components/ui/ScheduleGrid.jsx`

---

## Páginas e Rotas

### Grade Horária Individual — `/schedule`

**Descrição:** Página onde o professor (ou admin visualizando outro professor) gerencia sua grade semanal de aulas. Usa `ScheduleGrid` no modo edição (`readOnly = false`).

**Componentes:**
- `ScheduleGrid`: matriz dias × aulas com cards de aula inseridos e botões de ação

**Behaviors — Melhoria 1: Botão de Remover Aula**

- [ ] Exibir o botão ✕ sempre visível dentro do card de aula, sem depender de hover do grupo para aparecer (`hidden group-hover:block` substituído por visibilidade permanente com opacidade reduzida)
- [ ] Aumentar a área de toque do botão: tamanho mínimo de 20×20 px, com padding suficiente para acionamento confortável em mobile
- [ ] Aplicar cor de fundo visível no hover do botão (ex: `bg-err-l rounded`) para sinalizar claramente a ação destrutiva
- [ ] Manter a cor do ícone `text-t3` no estado repouso e mudar para `text-err` no hover — sem quebrar o padrão de cores do design system
- [ ] Remover a dependência da classe `group` no card pai para controlar visibilidade do botão (o botão deve ser independente)
- [ ] Comportamento idêntico aplicado nos cards de aulas regulares (`_tipo === 'regular'`) e nas aulas especiais (`_tipo === 'especial'`)

**Behaviors — Melhoria 2: Drag and Drop de Cards de Aula**

- [ ] Tornar cada card de aula (`div` com `key={s.id}`) draggable via atributo `draggable="true"` — apenas quando `readOnly === false`
- [ ] Ao iniciar o drag (`onDragStart`), armazenar no estado local (`dragSource`) o objeto `{ scheduleId, fromDay, fromSlot }` para uso no drop
- [ ] Ao entrar em uma célula válida de destino (`onDragEnter`/`onDragOver`), prevenir o comportamento padrão do browser e aplicar indicador visual de "célula receptora" (ex: borda accent com `border-accent` e fundo `bg-accent-l/40`)
- [ ] Ao sair de uma célula (`onDragLeave`), remover o indicador visual de destino
- [ ] Ao soltar (`onDrop`) em uma célula de destino:
  - Chamar `updateSchedule(scheduleId, { day: targetDay, timeSlot: targetSlot })` via `useAppStore`
  - Exibir toast de confirmação: `toast('Aula movida', 'ok')`
  - Limpar `dragSource` do estado local
- [ ] Ao soltar no mesmo slot de origem (mesmo `day` + `timeSlot`), não executar nenhuma ação e não exibir toast
- [ ] Células que já contêm aula do mesmo professor no destino (conflito `teacherConflict`) devem rejeitar o drop: não executar `updateSchedule`, exibir toast de erro `toast('Horário já ocupado neste dia', 'err')`
- [ ] Células com `isBlocked === true` (fora do horário de trabalho do professor) devem rejeitar o drop com o mesmo toast de erro
- [ ] Células do tipo `CelulaFora` (horário fora do turno) não recebem eventos de drop
- [ ] Durante o drag ativo, alterar cursor na grade inteira para `cursor-grabbing` (via classe condicional na `div` raiz do segmento)
- [ ] Aplicar cursor `cursor-grab` ao card de aula em estado de repouso quando `readOnly === false`
- [ ] Ao final do drag (evento `onDragEnd`), limpar qualquer estado de highlight residual, independentemente de o drop ter ocorrido ou não
- [ ] O drag deve funcionar apenas em modo edição (`readOnly === false`); em `readOnly === true`, os cards não recebem `draggable` nem handlers de DnD

---

## Componentes Compartilhados

- `ScheduleGrid` (`src/components/ui/ScheduleGrid.jsx`): único componente modificado. Usado em `SchedulePage` (grade individual do professor) e indiretamente via `ScheduleGridModal` (modal de grade em outras páginas como `CalendarPage`). Ambas as melhorias se aplicam ao mesmo componente; o modo `readOnly` controla se a edição (incluindo DnD) está habilitada.

---

## Modelos de Dados

### `schedules/` — Grade Horária (sem mudança de schema)

```js
{
  id:        "mx3p9q1",
  teacherId: "lv9k2a7",
  day:       "Segunda",               // campo atualizado pelo DnD
  timeSlot:  "seg-fund|manha|1",      // campo atualizado pelo DnD
  turma:     "6º Ano A",
  subjectId: "subj-bio"
}
```

O drag and drop altera apenas `day` e `timeSlot` de um schedule existente. Os demais campos (`teacherId`, `turma`, `subjectId`) permanecem intactos.

### Estado local do componente (`useState`)

```js
// Já existente
const [modal, setModal] = useState(null)

// Novo — rastreia o card sendo arrastado
const [dragSource, setDragSource] = useState(null)
// { scheduleId: string, fromDay: string, fromSlot: string }

// Novo — rastreia a célula sob o cursor durante o drag
const [dragTarget, setDragTarget] = useState(null)
// { day: string, slot: string }
```

---

## Regras de Negócio

1. **Conflito de professor no destino:** se o professor já tem outro schedule com `day === targetDay` e `timeSlot === targetSlot`, o drop é rejeitado — o servidor rejeitaria também (mas a validação ocorre no cliente antes de chamar `updateSchedule`).

2. **Célula bloqueada no destino:** slots marcados como `isBlocked` (calculados via `isTimeBlocked`) são slots dentro do horário de trabalho do professor, portanto fora do turno de ensino. O drop é rejeitado.

3. **Células fora do turno (`CelulaFora`):** renderizadas sem handlers de drop. O browser descarta o evento nativamente.

4. **Mesmo slot:** arrastar um card para exatamente o mesmo `day` + `timeSlot` de origem não executa nenhuma operação e não chama `updateSchedule`.

5. **`readOnly === true`:** sem `draggable`, sem handlers. Grade funciona exclusivamente em leitura (ex: visualização de grade na `CalendarPage` ou em substituições).

6. **Persistência via store:** a chamada é `updateSchedule(id, { day, timeSlot })`. O store aplica a mutação imutável e chama `updateDocById('schedules', id, { day, timeSlot })` no Firestore — consistente com o padrão de mutação do projeto.

7. **Visibilidade do botão ✕:** o botão nunca some; apenas muda de opacidade/cor no hover. Isso resolve o problema de usuários mobile que não têm hover e não conseguiam acionar o botão.

---

## Fora do Escopo (v1)

- Drag and drop entre professores diferentes (mover uma aula de um professor para a grade de outro).
- Drag and drop na visão de grade da escola inteira (`SchoolSchedulePage`) — essa grade é `readOnly` para todos os perfis não-admin.
- Animação de arrastar com preview customizado do card (ghost image personalizado via `setDragImage`).
- Drag and drop em touch (iOS/Android nativos): a HTML5 DnD API não funciona em touch sem polyfill. Fora do escopo desta versão.
- Undo/redo de movimentos de aula.
- Validação de `freeTurmas` no destino: não será verificado se a turma do schedule sendo movido está disponível no slot destino (ex: outra área compartilhada pode já ocupar a turma). O usuário é responsável por verificar isso visualmente na grade.
