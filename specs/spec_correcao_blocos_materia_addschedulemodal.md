# Spec: Correção de Exibição Exclusiva dos Blocos de Matéria no AddScheduleModal

## Visão Geral

O `AddScheduleModal` possui dois blocos de seleção de matéria que devem ser mutuamente
exclusivos, mas atualmente aparecem simultaneamente quando uma turma compartilhada com
matérias cadastradas é selecionada. O bloco "Matéria" (matérias regulares do professor)
não verifica se a turma selecionada é compartilhada, portanto é renderizado sempre que
`turma` está preenchida — mesmo quando o correto seria exibir apenas o bloco de matérias
da turma compartilhada.

A correção é cirúrgica: adicionar a guarda `!selectedSharedSeries` à condição de
renderização do bloco "Matéria" regular, garantindo que cada bloco apareça exclusivamente
de acordo com o tipo de turma selecionada.

## Stack Tecnológica

- Frontend: React 18 + Tailwind CSS 3.4
- Estado local: `useState` dentro do componente (sem store)
- Arquivo único afetado: `src/components/ui/AddScheduleModal.jsx`
- Sem alterações em store, lib, outros componentes ou modelo de dados

## Páginas e Rotas

### AddScheduleModal — componente de modal (sem rota própria)

**Descrição:** Modal aberto a partir de `SchedulePage` quando o professor clica em um
slot vazio da grade horária. Permite selecionar Ano/Série, Turma (regular ou
compartilhada) e Matéria (regular ou da turma compartilhada) antes de confirmar o
cadastro do slot.

**Componentes:**
- `AddScheduleModal`: componente principal (`src/components/ui/AddScheduleModal.jsx`)
- `Modal`: wrapper reutilizável de overlay/backdrop (`src/components/ui/Modal.jsx`)

**Behaviors:**

- [ ] **B1 — Bloco "Matéria" exibido apenas para turmas regulares:** A condição de
  renderização do bloco "Matéria" (pills de `mySubjs` + pill "— sem matéria —") deve
  ser `{turma && !selectedSharedSeries && (...)}`. Quando uma turma compartilhada estiver
  selecionada (`selectedSharedSeries !== null`), este bloco não deve ser renderizado,
  independentemente do valor de `turma`.

- [ ] **B2 — Bloco "Matéria da Turma Compartilhada" exibido apenas para turmas
  compartilhadas com matérias:** O bloco de matérias da turma compartilhada continua
  condicionado a `{!isRestType && selectedSharedSeries?.subjects?.length > 0 && (...)}`,
  sem alteração. Apenas o bloco "Matéria" regular recebe a guarda adicional.

- [ ] **B3 — Nenhum bloco de matéria quando turma compartilhada sem matérias
  cadastradas:** Quando `selectedSharedSeries` está presente mas `subjects` é vazio ou
  ausente (turma compartilhada sem matérias), nem o bloco regular nem o bloco
  compartilhado devem ser exibidos. Este comportamento é consequência natural de B1 e B2
  sem qualquer código adicional.

- [ ] **B4 — Nenhum bloco de matéria para turma compartilhada do tipo rest:**
  Quando `isRestType === true`, o bloco "Matéria da Turma Compartilhada" já é suprimido
  pela condição `!isRestType`. Com B1 aplicado, o bloco regular também fica suprimido.
  Nenhuma matéria é exibida para turmas do tipo `rest`.

- [ ] **B5 — Estado `subjId` limpo ao selecionar turma compartilhada:** O handler
  `onClick` das pills de turmas compartilhadas já executa `setSubjId('')`. Verificar que
  essa limpeza garante que, ao voltar a exibir o bloco regular (selecionando uma turma
  regular), nenhuma pill de matéria regular apareça destacada indevidamente.

- [ ] **B6 — Estado `sharedSubject` limpo ao selecionar turma regular:** O handler
  `onClick` das pills de turmas regulares já executa `setSharedSubject('')`. Verificar
  simetria: ao voltar para turma regular após ter selecionado matéria compartilhada, o
  bloco de matérias compartilhadas desaparece e `sharedSubject` está zerado.

- [ ] **B7 — Validação e payload de `onSave` inalterados:** A lógica de `save()`,
  incluindo a verificação `isSharedAndNeedsSubject && !sharedSubject && !subjId`, e o
  objeto passado a `onSave` não são alterados por este spec. A mudança é exclusivamente
  de renderização.

---

## Componentes Compartilhados

- `Modal` (`src/components/ui/Modal.jsx`): sem alterações — usado como wrapper.

## Modelos de Dados

Nenhuma alteração em modelos de dados. Para referência, os campos de estado local
relevantes:

| Campo | Tipo | Descrição |
|---|---|---|
| `turma` | `string` | Nome da turma selecionada — pode ser `"6º Ano A"` (regular) ou `"FORMAÇÃO"` (compartilhada). |
| `subjId` | `string` | ID de matéria regular. Vazio quando turma compartilhada está ativa. |
| `sharedSubject` | `string` | Nome da matéria compartilhada. Vazio quando turma regular está ativa. |
| `selectedSharedSeries` | `object\|null` | Objeto `sharedSeries` correspondente a `turma`, ou `null` se turma regular. Derivado via `store.sharedSeries.find(ss => ss.name === turma)`. |

## Regras de Negócio

**RN1 — Exclusão mútua entre os blocos de matéria:**
O bloco "Matéria" (regular) e o bloco "Matéria da Turma Compartilhada" nunca devem
ser exibidos simultaneamente. A distinção é determinada por `selectedSharedSeries`:
- `selectedSharedSeries === null` → exibir bloco regular (se `turma` preenchida)
- `selectedSharedSeries !== null` → exibir bloco compartilhado (se aplicável) e suprimir bloco regular

**RN2 — Matéria obrigatória quando disponível:**
Regra já implementada e não alterada: se a turma selecionada tem matérias disponíveis,
o cadastro exige seleção de uma matéria. A condição de disponibilidade é:
- Turma regular: `mySubjs.length > 0`
- Turma compartilhada: `!isRestType && selectedSharedSeries?.subjects?.length > 0`

**RN3 — Turmas compartilhadas do tipo rest dispensam matéria:**
`isRestType === true` sempre dispensa seleção de matéria.

**RN4 — Pill "— sem matéria —" pertence apenas ao bloco regular:**
A pill de deseleção `"— sem matéria —"` continua presente exclusivamente no bloco de
matérias regulares. Não existe equivalente no bloco compartilhado.

## Implementação Esperada

A mudança de código é de uma linha. A condição atual do bloco "Matéria" regular:

```jsx
{turma && (
  <div>
    <label className="lbl">Matéria</label>
    ...
  </div>
)}
```

Deve ser alterada para:

```jsx
{turma && !selectedSharedSeries && (
  <div>
    <label className="lbl">Matéria</label>
    ...
  </div>
)}
```

Nenhuma outra linha do arquivo precisa ser alterada.

## Fora do Escopo (v1)

- Alterações no modelo de dados `sharedSeries` no Firestore
- Alterações na aba "Formação" da SettingsPage
- Alterações no payload consumido por `store.addSchedule`
- Alterações em `SchedulePage`, `SchoolSchedulePage` ou qualquer outra página
- Reordenação ou agrupamento visual das seções do modal
- Testes automatizados
- Fusão dos dois blocos em um único componente (desnecessária para corrigir o bug)
