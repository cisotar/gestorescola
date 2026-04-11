# Spec: Correção do Isolamento da Grade Horária

## Visão Geral

A `ScheduleGrid` exibe o calendário semanal de **um professor específico**. Os mini-cards implementados na issue #20 introduziram um vazamento: ao calcular slots bloqueados, a grade exibe turma e nome de *outros* professores — revelando dados que não pertencem ao professor exibido.

A correção é simples: a grade sempre exibe apenas as aulas do professor-alvo. Slots ocupados por outros professores mostram apenas indicadores visuais neutros (🔒 ou —), **sem revelar nenhum dado de terceiros**, independentemente de quem esteja visualizando (admin ou professor).

A prop `isAdmin` introduzida na issue #23 deve ser **removida** de `ScheduleGrid` e `ScheduleGridModal` — ela não faz sentido no contexto de uma grade individual.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Estado:** Zustand (`useAppStore` — `schedules`, `areas`, `subjects`)
- **Arquivo:** `src/pages/SettingsPage.jsx`

---

## Páginas e Rotas

### SettingsPage — `/settings`

**Componentes afetados:**
- `ScheduleGrid` — renderiza a grade semanal de um professor
- `ScheduleGridModal` — wrapper modal que abre a `ScheduleGrid`

---

**Behaviors:**

- [ ] A grade exibe apenas as aulas do professor cujo calendário está sendo visualizado
- [ ] Slots em que o professor já tem aula (`teacherConflict`): exibir 🔒, sem mini-cards
- [ ] Slots em que todas as turmas estão ocupadas por outros (`freeTurmas.length === 0`): exibir `—`, sem mini-cards
- [ ] Em nenhum slot são exibidos nome, turma ou qualquer dado de outros professores
- [ ] Essa regra vale para admin e para professor — não há distinção de papel na grade

---

## Modelos de Dados

Sem alteração de modelos. A correção é exclusivamente de renderização.

---

## Regras de Negócio

1. `ScheduleGrid` **não recebe** prop `isAdmin` — removida.
2. `ScheduleGridModal` **não recebe** prop `isAdmin` — removida.
3. Todas as chamadas de `ScheduleGrid` e `ScheduleGridModal` no código removem o repasse de `isAdmin`.
4. As duas ramificações com mini-cards são substituídas:
   - `teacherConflict === true` → renderiza apenas o ícone 🔒
   - `freeTurmas.length === 0` → renderiza apenas `—`
5. `occupiedTurmas` e `occupiedByTeacher` continuam sendo calculados internamente apenas para determinar `freeTurmas` e `hardBlockedTurmas` (lógica de áreas compartilhadas) — nunca são exibidos.

---

## Componentes Compartilhados

Nenhum novo componente. Mudanças internas a `SettingsPage.jsx`.

---

## Fora do Escopo

- Qualquer exibição de dados de outros professores na grade (nem em tooltip, nem em hover)
- Alteração da lógica de áreas compartilhadas (issue #25 permanece intacta)
- Alteração de outras páginas além de `SettingsPage.jsx`
