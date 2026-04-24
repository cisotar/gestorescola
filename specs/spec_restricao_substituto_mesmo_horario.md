# Spec: Restrição de Substituto no Mesmo Horário

## Visão Geral

Impede que um professor substituto seja alocado mais de uma vez no mesmo horário (timeSlot) dentro de um mesmo dia, mesmo que as ausências sejam de professores e/ou turmas diferentes. A regra se aplica tanto à atribuição manual (seleção via SubPicker) quanto à atribuição automática ("Aceitar sugestões").

Problema atual: se no mesmo dia faltam os professores João, Maria e José, todos com aula na 1ª aula, o sistema permite selecionar Ziraldo como substituto nas três ocorrências simultaneamente — o que é fisicamente impossível.

---

## Stack Tecnológica

- Frontend: React 18 + Zustand (`useAppStore`)
- Lógica de negócio: `src/lib/absences/validation.js` e `src/lib/absences/ranking.js`
- Banco de dados: Firestore — coleção `absences/` (fonte da verdade)
- Sem alterações de modelo de dados no Firestore

---

## Páginas e Rotas

### CalendarPage — `/calendar`

**Descrição:** Calendário semanal interativo. Contém o componente `SubPicker` (seleção manual de substituto por slot) e o botão "Aceitar sugestões" (`handleAcceptAll`) que atribui automaticamente o melhor candidato disponível para cada slot descoberto do professor selecionado no dia.

**Componentes:**
- `SubPicker`: exibe lista de candidatos e pills de sugestão para um slot de ausência específico; chama `assignSubstitute` ao confirmar
- `handleAcceptAll`: itera sobre os slots em aberto do professor no dia, chama `rankCandidates` para cada um e invoca `assignSubstitute` com o primeiro resultado

**Behaviors:**
- [ ] Filtrar candidatos no `SubPicker`: ao calcular `candidates` via `rankCandidates`, professores já alocados como substitutos em qualquer slot com o mesmo `date` + `timeSlot` (em qualquer ausência) devem ser excluídos da lista retornada
- [ ] Filtrar sugestões no `SubPicker`: ao calcular `suggestions` via `suggestSubstitutes`, aplicar a mesma restrição — o professor já alocado no mesmo horário do dia não deve aparecer nos top-3
- [ ] Bloquear atribuição manual duplicada: se `handleAssign` for chamado com um professor que já está alocado no mesmo `date` + `timeSlot` (cenário de race condition ou chamada direta), exibir toast de erro e cancelar a operação sem invocar `assignSubstitute`
- [ ] Respeitar restrição no "Aceitar sugestões": `handleAcceptAll` em `CalendarPage` deve recalcular os candidatos a cada iteração, garantindo que um professor recém-atribuído num slot anterior do loop já seja excluído ao processar o próximo slot do mesmo horário
- [ ] Manter compatibilidade: a nova restrição deve compor-se com `isBusy` já existente — não substituí-la; um professor com aula regular no horário continua sendo descartado pelo `isBusy` antes da nova verificação ser aplicada

---

### CalendarDayPage — `/calendar/day`

**Descrição:** Versão mobile do calendário diário. Compartilha os mesmos componentes `SubPicker` e lógica de atribuição automática de `handleAcceptAll`.

**Componentes:**
- `SubPicker` (mesmo componente, modo `compact`)
- `handleAcceptAll`: mesma lógica de `CalendarPage`, mas para o contexto mobile

**Behaviors:**
- [ ] Filtrar candidatos no `SubPicker` mobile: idêntico ao comportamento em `CalendarPage` — professores já alocados no mesmo `date` + `timeSlot` excluídos
- [ ] Respeitar restrição no "Aceitar sugestões" mobile: mesma lógica iterativa de `CalendarPage`

---

## Componentes Compartilhados

- `SubPicker` (definido em `CalendarPage.jsx` e replicado em `CalendarDayPage.jsx`): recebe `date`, `slot`, `subjectId` e renderiza candidatos; a restrição é aplicada dentro das funções de lib que ele chama — sem mudança na interface do componente
- `SuggestionPills` / `ToggleRuleButtons` (`src/components/ui/`): não são alterados — a restrição opera nas funções de ranking que os alimentam

---

## Modelos de Dados

Nenhuma alteração de esquema no Firestore. A restrição é computada em tempo de execução a partir dos dados já existentes em `absences[].slots[].substituteId`.

### Índice derivado em memória (não persistido)

Para uso interno nas funções de ranking durante uma sessão de atribuição em lote (`handleAcceptAll`):

```
Map<`${date}|${timeSlot}`, Set<substituteId>>
```

Construído a partir de `absences[].slots` filtrando `sl.substituteId !== null`. Representa todos os substitutos já alocados por combinação de data e horário. Atualizado a cada `assignSubstitute` dentro do loop de `handleAcceptAll`.

---

## Regras de Negócio

### RN-01 — Unicidade de substituto por data+horário

Um professor substituto só pode aparecer uma vez como `substituteId` em slots que compartilham o mesmo `date` E o mesmo `timeSlot`, considerando **todas** as ausências do sistema naquele dia.

Formalmente: para qualquer par `(date, timeSlot)`, o conjunto `{ sl.substituteId | sl.date === date && sl.timeSlot === timeSlot && sl.substituteId !== null }` deve ter cardinalidade ≤ 1 por professor.

### RN-02 — Precedência de restrições

A ordem de descarte de candidatos é:
1. `isBusy` (conflito de aula regular ou substituição já registrada no mesmo slot) — existente
2. `isAvailableBySchedule` (fora do horário de disponibilidade do professor) — existente
3. **[NOVO]** Professor já alocado como substituto em outro slot com mesmo `date` + `timeSlot`

### RN-03 — Atribuição automática iterativa

Em `handleAcceptAll`, quando múltiplos slots do mesmo horário estão em aberto para professores diferentes, cada atribuição feita dentro do loop deve ser imediatamente refletida na verificação do próximo slot. Não utilizar um snapshot congelado de `store.absences` antes do loop; recomputar a restrição a cada iteração ou usar o índice derivado em memória descrito no modelo de dados.

### RN-04 — Escopo da restrição

A restrição se aplica apenas a slots que representam substituições ativas (não-nulas). Remover um substituto (`assignSubstitute(absenceId, slotId, null)`) libera o professor para ser alocado naquele horário novamente.

### RN-05 — Não afeta outros campos de ranking

A nova restrição não altera os scores de compatibilidade (matéria/área/segmento), nem os critérios de desempate por carga mensal ou limite semanal de teacher-coordinator. Apenas remove o professor da lista de elegíveis antes do ranking ser calculado.

---

## Implementação — Ponto de Mudança Único

Toda a restrição deve ser implementada em **`src/lib/absences/validation.js`** através de uma nova função exportada:

```js
/**
 * Retorna o conjunto de IDs de professores já alocados como substitutos
 * para uma combinação específica de data e horário, excluindo opcionalmente
 * o slot atual (útil ao reatribuir um slot já coberto).
 *
 * @param {string} date      - ISO date string ("2026-04-14")
 * @param {string} timeSlot  - Slot serializado ("seg-fund|manha|1")
 * @param {Array}  absences  - Array completo de ausências do store
 * @param {string} [excludeSlotId] - ID do slot a ignorar na verificação (para edição)
 * @returns {Set<string>}    - Conjunto de substituteIds já alocados neste horário
 */
export function substitutesAtSlot(date, timeSlot, absences, excludeSlotId = null)
```

Com essa função disponível, `rankCandidates` e `suggestSubstitutes` passam a receber (ou derivar internamente) o conjunto e filtram candidatos antes de computar scores.

Alternativa equivalente: adicionar o filtro diretamente dentro de `rankCandidates` e `suggestSubstitutes` sem expor `substitutesAtSlot` publicamente, caso os chamadores não precisem do conjunto isolado.

A escolha entre as duas abordagens fica para o plano técnico, mas o ponto de mudança deve permanecer em `src/lib/absences/` — nunca nas páginas.

---

## Fora do Escopo (v1)

- Interface visual para indicar "professor indisponível por já estar alocado neste horário" — candidatos simplesmente não aparecem na lista
- Validação retroativa de dados históricos já gravados no Firestore com duplicidade
- Restrição de múltiplas substituições por semana além do que já existe em `weeklyLimitStatus`
- Alterações no modelo de dados do Firestore (nenhum campo novo em `absences/` ou `history/`)
- Notificação ao usuário quando todos os candidatos de um horário estiverem esgotados além do toast já existente "Nenhum disponível"
- Relatórios ou dashboards que mostrem estatísticas de conflitos de alocação
