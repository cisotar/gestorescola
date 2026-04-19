# Spec: Correção das Regras de Sugestão de Substitutos no Mobile

## Visão Geral

Corrigir bugs e gaps na implementação das regras de sugestão de substitutos na página mobile `CalendarDayPage`. A feature já foi implementada no desktop (`CalendarPage`) e parcialmente no mobile — a estrutura base existe, mas três comportamentos estão incorretos: o botão "Aceitar sugestões" ignora a regra selecionada pelo ADM, o `SubPicker` no modo troca não recebe `ruleType`, e a lista completa de candidatos no modal secundário não respeita a regra ativa.

**Problema resolvido:** Garantir que a regra Qualitativa/Quantitativa selecionada pelo ADM no toggle se aplique a **todas** as ações de atribuição de substitutos no mobile — sugestões inline, aceitação em lote e seleção manual via modal.

---

## Stack Tecnológica

- Frontend: React 18.3.1 + React Router 6.26.0
- Estado: Zustand 4.5.4
- Estilização: Tailwind CSS 3.4.10
- Lógica: `src/lib/absences.js` (`suggestSubstitutes`, `rankCandidates`, `monthlyLoad`)
- Arquivo principal: `src/pages/CalendarDayPage.jsx`
- Componente compartilhado: `src/components/ui/ToggleRuleButtons.jsx`

---

## Páginas e Rotas

### CalendarDayPage (Mobile) — `/calendar/day`

**Descrição:** Página full-screen para um professor + semana em mobile. Exibe os períodos do dia ativo com cards de ausência, sugestões inline de substitutos e ações rápidas. O toggle Qualitativa/Quantitativa aparece quando há faltas sem substituto e controla todas as sugestões da sessão.

**Componentes:**
- `ToggleRuleButtons` (já existe em `src/components/ui/ToggleRuleButtons.jsx`): toggle no topo das ações quando `anyAbsent && !allHasSub`
- `SubPicker` (componente local, definido acima do `export default`): renderiza sugestões inline (compact) e modal de lista completa
- `FullCandidateList` (componente local): lista scrollável de todos os candidatos no modal secundário

**Behaviors (o que o usuário pode fazer):**
- [ ] ADM seleciona "Qualitativa" ou "Quantitativa" → todos os `SubPicker compact` na tela recalculam suas top-3 sugestões imediatamente
- [ ] ADM clica "✓ Aceitar sugestões" → sistema atribui o top-1 da regra **ativa** (`ruleType`) para cada falta sem substituto (não mais sempre `rankCandidates()[0]`)
- [ ] ADM clica "↺ Trocar" num slot que já tem substituto → modal abre com a lista completa ordenada pela regra **ativa**
- [ ] ADM faz swipe lateral entre dias → `ruleType` **persiste** para os outros dias da semana (estado no componente pai, não no `SubPicker`)
- [ ] ADM vê `ToggleRuleButtons` desaparecer automaticamente quando atribui o último substituto do dia
- [ ] ADM clica "ver todos (N)" → modal secundário abre com lista completa de candidatos, ordenada pela regra ativa

---

## Componentes Compartilhados

### `ToggleRuleButtons`
- **Onde:** `src/components/ui/ToggleRuleButtons.jsx`
- **Props:** `activeRule` (string: `'qualitative' | 'quantitative'`), `onRuleChange` (callback)
- **Comportamento:** dois botões lado a lado; ativo = `btn-dark`, inativo = `btn-ghost`
- **Sem alteração necessária** — componente já está correto

### `SubPicker` (local em `CalendarDayPage.jsx`)
- **Modo compact** (`compact={true}`): recebe `ruleType` do pai e passa para `suggestSubstitutes`
- **Modo modal** (sem `compact`): usado no "↺ Trocar" — deve receber `ruleType` do pai para ordenar `FullCandidateList`
- **Correção necessária:** o modo modal atualmente **não recebe `ruleType`** — a `FullCandidateList` usa `candidates` de `rankCandidates()` que não muda com a regra

### `FullCandidateList` (local em `CalendarDayPage.jsx`)
- **Recebe:** `candidates` (array já ordenado), `curSub`, `store`, `onSelect`, `matchLabel`
- **Sem alteração de interface** — a ordenação deve ser resolvida em quem chama, não aqui

---

## Modelos de Dados

Sem alterações nos modelos. Referência:

### AbsenceSlot (passado para `suggestSubstitutes`)
```js
{
  absentTeacherId: string,
  date: string,        // ISO date
  slot: string,        // "segId|turno|aulaIdx"
  subjectId: string | null
}
```

### Retorno de `suggestSubstitutes`
```js
// Array de Teacher objects (até 3)
[{ id, name, email, subjectIds, status, ... }]
```

### Retorno de `rankCandidates`
```js
// Array de candidatos com score e load
[{ teacher, score, load, match, sameSeg }]
```

---

## Regras de Negócio

### 1. `handleAcceptAll` deve respeitar `ruleType`

**Comportamento atual (bug):**
```js
const top = rankCandidates(teacher.id, activeDate, slot, sched?.subjectId,
  store.teachers, store.schedules, store.absences, store.subjects, store.areas)[0]
if (top) assignSubstitute(absenceId, slotId, top.teacher.id)
```

**Comportamento correto:**
```js
const absenceSlot = {
  absentTeacherId: teacher.id,
  date: activeDate,
  slot,
  subjectId: sched?.subjectId ?? null,
}
const top = suggestSubstitutes(absenceSlot, ruleType, store)[0]
if (top) assignSubstitute(absenceId, slotId, top.id)
```

> Nota: `suggestSubstitutes` retorna teacher objects diretamente (`.id`, não `.teacher.id`).

### 2. `SubPicker` no modo "↺ Trocar" deve receber `ruleType`

**Comportamento atual (bug):** o `SubPicker` renderizado quando já há substituto (linhas 407–411) não recebe `ruleType`. A `FullCandidateList` exibe candidatos na ordem de `rankCandidates`, sem refletir a regra ativa.

**Comportamento correto:** passar `ruleType` para o `SubPicker` em **todos** os casos de renderização — com e sem substituto já atribuído.

**Impacto em `SubPicker`:** o modo modal (não-compact) não usa `ruleType` atualmente. A correção é:
- Adicionar ordenação dos `candidates` pelo `ruleType` dentro do `SubPicker` antes de passar para `FullCandidateList`, **ou**
- Usar `suggestSubstitutes` para obter os top-3 e `rankCandidates` para a lista completa já ordenada pela regra ativa.

A abordagem mais simples: no modo modal, manter `candidates = rankCandidates(...)` para a lista completa, mas reordenar por `suggestSubstitutes` quando `ruleType === 'quantitative'` (carga mensal). Alternativamente, usar `ruleType` para decidir a chave de ordenação nos `candidates`.

**Solução recomendada:** o `SubPicker` já calcula `suggestions` via `suggestSubstitutes` — no modal, exibir os `candidates` (lista completa de `rankCandidates`) mas com os sugeridos (`suggestions`) destacados no topo, indicando a regra ativa.

### 3. `ruleType` persiste entre dias no swipe

Já funciona corretamente — `ruleType` é estado do componente pai (`CalendarDayPage`), não do `SubPicker`. Ao navegar entre dias via swipe ou pills, o estado não é destruído. Não requer alteração de código.

### 4. `ToggleRuleButtons` some ao completar todas as atribuições

Já implementado via `anyAbsent && !allHasSub`. O `allHasSub` é calculado com `useMemo` sobre `store.absences` — ao atribuir via `assignSubstitute`, o store Zustand atualiza e o memo recalcula. Não requer alteração de código. Verificar que não há stale closure no cálculo de `dayAbsMap`.

---

## Implementação Técnica

### Alteração 1 — `handleAcceptAll` em `CalendarDayPage.jsx`

**Arquivo:** `src/pages/CalendarDayPage.jsx`  
**Localização:** função `handleAcceptAll`, linhas ~247–256

Substituir uso de `rankCandidates()[0]` por `suggestSubstitutes(absenceSlot, ruleType, store)[0]`:

```js
const handleAcceptAll = () => {
  Object.entries(dayAbsMap).forEach(([slot, { absenceId, slotId, substituteId }]) => {
    if (substituteId) return
    const sched = dayMine.find(s => s.timeSlot === slot)
    const absenceSlot = {
      absentTeacherId: teacher.id,
      date: activeDate,
      slot,
      subjectId: sched?.subjectId ?? null,
    }
    const top = suggestSubstitutes(absenceSlot, ruleType, store)[0]
    if (top) assignSubstitute(absenceId, slotId, top.id)
  })
  toast('Substituições confirmadas', 'ok')
}
```

### Alteração 2 — Passar `ruleType` ao `SubPicker` com substituto já atribuído

**Arquivo:** `src/pages/CalendarDayPage.jsx`  
**Localização:** bloco de renderização do SubPicker quando `sub` existe, linhas ~407–411

Adicionar `ruleType={ruleType}` na chamada:

```jsx
{isAdmin && (
  <SubPicker
    absenceId={abs.absenceId} slotId={abs.slotId}
    teacherId={teacher.id} date={activeDate} slot={p.slot}
    subjectId={sched.subjectId} store={store}
    ruleType={ruleType}   {/* ← adicionar */}
  />
)}
```

### Alteração 3 — `SubPicker` modo modal: ordenar `FullCandidateList` por `ruleType`

**Arquivo:** `src/pages/CalendarDayPage.jsx`  
**Localização:** função `SubPicker`, cálculo de `candidates`

No modo não-compact (modal de troca), a `FullCandidateList` exibe `candidates` de `rankCandidates`. Para respeitar `ruleType = 'quantitative'`, reordenar os candidatos por carga mensal quando a regra for quantitativa:

```js
const sortedCandidates = useMemo(() => {
  if (ruleType === 'quantitative') {
    return [...candidates].sort((a, b) => a.load - b.load)
  }
  return candidates // rankCandidates já ordena por score qualitativo
}, [candidates, ruleType])
```

Usar `sortedCandidates` no lugar de `candidates` ao passar para `FullCandidateList`.

---

## Fora do Escopo (v1)

- [ ] Alterar visual/layout do `SubPicker` ou `FullCandidateList`
- [ ] Modificar lógica de `suggestSubstitutes` ou `rankCandidates` em `absences.js`
- [ ] Alterar comportamento no desktop (`CalendarPage.jsx`)
- [ ] Persistir `ruleType` entre sessões (localStorage)
- [ ] Aplicar regras diferentes por slot individualmente
- [ ] Animações ao mostrar/esconder `ToggleRuleButtons`
- [ ] Notificações ao professor substituto
