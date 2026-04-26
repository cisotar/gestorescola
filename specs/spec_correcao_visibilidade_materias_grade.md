# Spec: Correção de Visibilidade de Matérias — Modal e Grade Horária

## Visão Geral

Dois problemas visuais independentes afetam a exibição de matérias na grade horária:

1. **AddScheduleModal** — o bloco "Matéria" (label + pills de matérias regulares) aparece ao abrir o modal, antes de qualquer turma ser selecionada. O comportamento correto é ocultá-lo até que uma turma esteja selecionada, e pré-selecionar "— sem matéria —" assim que uma turma for escolhida.

2. **Cards de slot nas grades** (`ScheduleGrid` e `SchoolGrid`) — quando um schedule tem `sharedSubject` preenchido, ele é renderizado numa terceira linha separada, em fonte `text-[9px]` italic, abaixo da linha de `subjLabel`. Schedules regulares exibem a matéria em `text-[10px]` na segunda linha. O resultado são dois estilos diferentes para o mesmo conceito semântico ("matéria do slot"). O comportamento correto é uma única linha de matéria na segunda posição, com estilo unificado, exibindo `sharedSubject` quando preenchido, senão `subjLabel`.

Nenhuma mudança de modelo de dados ou de lógica de persistência é necessária.

---

## Stack Tecnológica

- Frontend: React 18 + Tailwind CSS 3.4 (tokens do projeto)
- Estado local: `useState` (sem alterações no store)
- Arquivos afetados:
  - `src/components/ui/AddScheduleModal.jsx`
  - `src/components/ui/ScheduleGrid.jsx`
  - `src/components/ui/SchoolGrid.jsx`
- Sem alterações em store, lib, páginas ou modelo de dados

---

## Páginas e Rotas

### AddScheduleModal — componente de modal (sem rota própria)

**Descrição:** Modal aberto pelo professor ao clicar em "＋" em um slot vazio da grade horária (`SchedulePage`). O modal guia a seleção sequencial: Ano/Série → Turma (regular ou compartilhada) → Matéria → confirmar.

Atualmente o bloco "Matéria" (label `.lbl` + pills de `mySubjs` + pill "— sem matéria —") é renderizado incondicionalmente: aparece imediatamente ao abrir o modal, antes de qualquer seleção de turma. Isso cria confusão visual porque as matérias exibidas não têm contexto sem turma escolhida.

**Análise do código atual (`AddScheduleModal.jsx` linha 187–212):**

O bloco `{/* Matéria */}` é um `<div>` renderizado sempre, sem condição de guarda. O estado inicial de `subjId` é `mySubjs[0]?.id ?? ''`, o que significa que a primeira matéria do professor é pré-selecionada ao abrir — não "— sem matéria —".

**Componentes:**
- `AddScheduleModal`: único arquivo afetado

**Behaviors:**

- [ ] **B1 — Ocultar bloco de matérias quando nenhuma turma selecionada:** Envolver o bloco `{/* Matéria */}` (label + pills) numa condição `{turma && ...}`. Enquanto `turma === ''`, o bloco não é renderizado.

- [ ] **B2 — Estado inicial de subjId ao abrir o modal:** Alterar o `useState` de `subjId` de `mySubjs[0]?.id ?? ''` para `''` (string vazia). O estado inicial deve representar "sem matéria selecionada", não a primeira matéria do professor.

- [ ] **B3 — Pill "— sem matéria —" pré-ativa ao selecionar turma:** Quando o bloco de matérias aparece pela primeira vez (turma recém-selecionada), `subjId` já é `''`, portanto a pill "— sem matéria —" já aparece com estilo `pillOn` — sem necessidade de código adicional. Validar que o comportamento é esse após B2.

- [ ] **B4 — Bloco de matérias visível tanto para turmas regulares quanto compartilhadas:** A condição de guarda `{turma && ...}` cobre ambos os casos — turma regular (`grade + letter`) e turma compartilhada (`sharedSeries.name`). O bloco deve aparecer em ambos.

- [ ] **B5 — Reset de subjId ao trocar de turma:** Ao selecionar outra turma (regular ou compartilhada), o handler atual já chama `setSharedSubject('')`. Verificar que `setSubjId('')` também é chamado (ou já está implícito) nos handlers de seleção de turma regular e compartilhada, para que "— sem matéria —" volte a aparecer ativa.

- [ ] **B6 — Comportamentos existentes não afetados:** A lógica de validação de conflitos, o bloco "Matéria da Turma Compartilhada" (pills de `selectedSharedSeries.subjects`), o disabled do botão "Adicionar" e o payload de `onSave` não são alterados por este spec.

---

### Grade Horária individual — `/schedule` (`ScheduleGrid.jsx`)

**Descrição:** Grade por professor. Cada célula exibe um mini-card por schedule (`mine`). O mini-card tem:
- linha 1: `s.turma` — nome da turma (uppercase, `text-[11px]`)
- linha 2: `subjLabel` — nome da matéria regular (`text-[10px]`)
- linha 3 (condicional): `s.sharedSubject` — matéria de turma compartilhada, somente se preenchido (`text-[9px] italic`)

**Análise do código atual (`ScheduleGrid.jsx` linhas 224–226 e 341–343):**

```jsx
<div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide truncate">{s.turma}</div>
<div className="text-[#4a4740] text-[10px] truncate">{subjLabel}</div>
{s.sharedSubject && <span className="text-[9px] text-t3 truncate italic">{s.sharedSubject}</span>}
```

O mesmo padrão aparece duas vezes no arquivo: slots regulares (linha ~224) e slots especiais (linha ~341).

**Comportamento desejado:** Uma única linha de matéria na posição 2, exibindo `s.sharedSubject` se preenchido, senão `subjLabel`. Eliminar a terceira linha condicional.

**Componentes:**
- `ScheduleGrid` — bloco de renderização do mini-card (ocorre em dois locais no arquivo: slot regular e slot especial)

**Behaviors:**

- [ ] **B7 — Unificar label de matéria no mini-card (slots regulares):** Substituir as duas linhas de matéria pelo padrão unificado:
  ```jsx
  <div className="text-[#4a4740] text-[10px] truncate">{s.sharedSubject || subjLabel}</div>
  ```
  Remover o `{s.sharedSubject && <span ...>}` condicional logo abaixo.

- [ ] **B8 — Unificar label de matéria no mini-card (slots especiais):** Aplicar a mesma substituição no bloco de renderização de slots especiais (`_tipo === 'especial'`), onde o padrão idêntico se repete.

- [ ] **B9 — Preservar lógica de subjLabel para turmas rest:** `subjLabel` já é calculado como `isRestSlot(s.turma, store.sharedSeries) ? 'almoço/janta' : (subj?.name ?? '—')`. Ao usar `s.sharedSubject || subjLabel`, turmas do tipo rest que não têm `sharedSubject` continuarão exibindo 'almoço/janta' corretamente.

---

### Grade horária coletiva — `/school-schedule` (`SchoolGrid.jsx`)

**Descrição:** Grade por turma ou escola. Cada célula exibe um mini-card por schedule com o mesmo padrão de três linhas presente no `ScheduleGrid`. O mesmo problema de inconsistência de estilo ocorre aqui.

**Análise do código atual (`SchoolGrid.jsx` linhas 93–103 e 141–151):**

Aparece em quatro combinações (showTeacher true/false × slot regular/especial), todas com o mesmo padrão:

```jsx
<div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide">{/* nome */}</div>
<div className="text-[#4a4740] text-[10px]">{isRestSlot(...) ? 'almoço/janta' : (subject?.name ?? '—')}</div>
{s.sharedSubject && <span className="text-[9px] text-t3 truncate italic">{s.sharedSubject}</span>}
```

**Componentes:**
- `SchoolGrid` — bloco de renderização do mini-card (ocorre em quatro locais: showTeacher×true/false para slot regular, showTeacher×true/false para slot especial)

**Behaviors:**

- [ ] **B10 — Unificar label de matéria nos mini-cards de SchoolGrid (todos os blocos):** Em cada um dos quatro blocos de renderização, substituir:
  ```jsx
  <div className="text-[#4a4740] text-[10px]">{isRestSlot(s.turma, store.sharedSeries) ? 'almoço/janta' : (subject?.name ?? '—')}</div>
  {s.sharedSubject && <span className="text-[9px] text-t3 truncate italic">{s.sharedSubject}</span>}
  ```
  por:
  ```jsx
  <div className="text-[#4a4740] text-[10px]">{s.sharedSubject || (isRestSlot(s.turma, store.sharedSeries) ? 'almoço/janta' : (subject?.name ?? '—'))}</div>
  ```

- [ ] **B11 — Retrocompatibilidade total:** Schedules sem `sharedSubject` (campo ausente, `null` ou `''`) continuam exibindo `subject?.name ?? '—'` ou `'almoço/janta'` normalmente. `s.sharedSubject || fallback` resolve corretamente pois falsy (null/undefined/'') faz o fallback para o valor existente.

---

## Componentes Compartilhados

- `AddScheduleModal` (`src/components/ui/AddScheduleModal.jsx`): usado em `ScheduleGrid` via `setModal`. Recebe mudança de visibilidade condicional do bloco de matérias.
- `ScheduleGrid` (`src/components/ui/ScheduleGrid.jsx`): usado em `SchedulePage`. Recebe unificação do label de matéria nos mini-cards.
- `SchoolGrid` (`src/components/ui/SchoolGrid.jsx`): usado em `SchoolSchedulePage`. Recebe a mesma unificação.

---

## Modelos de Dados

Nenhuma alteração no modelo de dados. Os campos envolvidos já existem:

### `schedules/` — campos já existentes

| Campo | Tipo | Descrição |
|---|---|---|
| `turma` | `string` | Nome da turma (regular ou compartilhada) |
| `subjectId` | `string \| null` | FK para `subjects[].id` — matéria regular |
| `sharedSubject` | `string \| null` | Nome textual da matéria de turma compartilhada |

**Prioridade de exibição nos mini-cards:** `sharedSubject` (se truthy) tem precedência sobre `subjectId` resolvido. Um schedule nunca deve ter ambos preenchidos simultaneamente (exclusão mútua garantida pelo `AddScheduleModal`).

---

## Regras de Negócio

**RN1 — Sequência de seleção no modal:** A exibição de matérias só faz sentido após uma turma ser escolhida. Turma é pré-requisito visual para matéria.

**RN2 — Estado inicial neutro:** Ao abrir o modal, nenhuma matéria deve estar pré-selecionada. "— sem matéria —" aparece ativa automaticamente quando o bloco se torna visível (porque `subjId === ''`).

**RN3 — Uma única linha de matéria por mini-card:** Cada slot ocupa espaço limitado na célula da grade. Uma linha para turma, uma para matéria. Não há espaço semântico para duas linhas de matéria com estilos diferentes.

**RN4 — sharedSubject tem precedência sobre subjectId na exibição:** Quando preenchido, `sharedSubject` representa a matéria efetivamente ministrada naquele slot de turma compartilhada. O `subjectId` de um schedule de turma compartilhada tende a ser `null`; mas mesmo quando não for, `sharedSubject` é o dado mais específico e deve prevalecer visualmente.

**RN5 — Sem alteração na lógica de substituição:** `sharedSubject` é puramente visual/informativo na grade. A lógica de ranking de candidatos, criação de ausências e substituições não consome esse campo.

---

## Fora do Escopo (v1)

- Edição de `sharedSubject` de um schedule já existente (via interface de edição de slot)
- Exibição de `sharedSubject` em relatórios PDF (`reports/`)
- Exibição de `sharedSubject` em `AbsencesPage` ou `CalendarPage`
- Filtro de grade por matéria de turma compartilhada
- Validação de obrigatoriedade de matéria para turmas regulares (comportamento atual mantido)
- Alterações no modal de edição de schedule (se existir)
- Testes automatizados
