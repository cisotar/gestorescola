# Spec: Regras de Seleção de Substitutos

## Visão Geral

Refinamento das regras de elegibilidade, cálculo de carga horária mensal e ordenação de candidatos substitutos no sistema GestãoEscolar. O objetivo é garantir que o algoritmo de ranking reflita corretamente quem pode substituir, com qual prioridade, e que o comportamento do Professor Coordenador (`teacher-coordinator`) seja tratado como presença degradada na fila — nunca como exclusão.

---

## Stack Tecnológica

- Frontend: React 18.3.1 + Tailwind CSS 3.4.10
- Estado: Zustand 4.5.4 (`useAppStore`, `useAuthStore`)
- Lógica de negócio: `src/lib/absences.js` (funções `rankCandidates`, `suggestSubstitutes`, `monthlyLoad`, `isBusy`, `isUnderWeeklyLimit`)
- Banco de dados: Firebase Firestore
- Roteamento: React Router 6.26.0

---

## Páginas e Rotas

### CalendarPage — `/calendar`

**Descrição:** Calendário semanal interativo. Admin e Coordenadores visualizam ausências, acionam o ranking de substitutos e atribuem manualmente ou aceitam sugestão automática (top 3).

**Componentes:**
- `DayModal` (interno): modal de slot, exibe pills de sugestão com `SuggestionPills` e botão "ver todos os candidatos"
- `ToggleRuleButtons`: alterna entre modo Qualitativo e Quantitativo
- `SuggestionPills`: exibe top 3 sugestões com badge de carga mensal

**Behaviors:**
- [ ] Exibir top 3 sugestões: ao abrir um slot de ausência sem substituto, chamar `suggestSubstitutes(slot, ruleType, store)` e renderizar as pills com nome e carga do candidato
- [ ] Aceitar sugestão: ao clicar em uma pill de sugestão, atribuir o candidato ao slot via `assignSub(absenceId, slotId, teacherId)` e atualizar o status da ausência
- [ ] Ver todos os candidatos: ao clicar em "ver todos", exibir modal secundário com a lista completa retornada por `rankCandidates(...)`, ordenada pela regra ativa
- [ ] Escolher manualmente: ao selecionar qualquer candidato da lista completa (não apenas o top 3), atribuir o substituto ao slot
- [ ] Professor Coordenador com limite semanal atingido: exibir o candidato `teacher-coordinator` com badge visual de "limite semanal atingido" nas últimas posições de sua categoria — não omiti-lo da lista
- [ ] Alternar regra: ao clicar em `ToggleRuleButtons`, recalcular todas as sugestões visíveis usando a nova regra, sem fechar o modal

---

### CalendarDayPage — `/calendar/day`

**Descrição:** Versão mobile do modal de dia. Mesma lógica de ranking e atribuição do `CalendarPage`, renderizada em página dedicada.

**Componentes:**
- `ToggleRuleButtons`: alterna regra global da sessão
- `SuggestionPills` por slot

**Behaviors:**
- [ ] Mesmos behaviors de exibição e atribuição de `CalendarPage`
- [ ] Professor Coordenador com limite semanal atingido: mesmo comportamento de badge e posição degradada
- [ ] Alternar regra: ao mudar a regra no toggle, todos os slots da página recalculam as pills imediatamente

---

### AbsencesPage — `/absences`

**Descrição:** Exibe ausências agrupadas por professor, dia, semana ou mês. Admin pode atribuir substitutos diretamente nos slots listados.

**Behaviors:**
- [ ] Exibir sugestões: para cada slot sem substituto, mostrar pills de top 3 usando a regra ativa da sessão
- [ ] Atribuir substituto: clicar em pill ou escolher manualmente da lista completa atribui o candidato ao slot
- [ ] Professor Coordenador com limite semanal atingido: aparece no final da lista de candidatos de sua categoria com indicação visual

---

## Componentes Compartilhados

- `SuggestionPills` (`src/components/ui/SuggestionPills.jsx`): exibe top 3 candidatos com badge de carga e indicador de `match` (matéria / área / outro). Recebe `candidates` (array de objetos `{ teacher, load, match, score }`) e `onSelect` (callback). Não conhece regra de negócio — apenas renderiza o que recebe.
- `ToggleRuleButtons` (`src/components/ui/ToggleRuleButtons.jsx`): toggle entre `qualitative` e `quantitative`. Props: `rule` (string), `onChange` (callback). Ativo fica `btn-dark`, inativo fica `btn-ghost`.

---

## Modelos de Dados

### Teacher (`teachers/`)
```js
{
  id:         string,         // uid()
  name:       string,
  subjectIds: string[],       // FK → subjects[].id
  status:     "approved",
  profile:    "teacher" | "coordinator" | "teacher-coordinator"
}
```
Campos relevantes para as regras:
- `profile === 'coordinator'`: jamais elegível como substituto (excluído do pool)
- `profile === 'teacher-coordinator'`: elegível, mas com limite de 10 substituições/semana
- `profile === 'teacher'`: elegível sem restrição de limite semanal de substituições

### Absence (`absences/`)
```js
{
  id:        string,
  teacherId: string,           // professor ausente
  status:    "open" | "partial" | "covered",
  slots: [
    {
      id:           string,
      date:         string,    // "YYYY-MM-DD"
      day:          string,    // "Segunda" … "Sexta"
      timeSlot:     string,    // "segId|turno|aulaIdx"
      scheduleId:   string | null,
      subjectId:    string | null,
      turma:        string,
      substituteId: string | null
    }
  ]
}
```

### Schedule (`schedules/`)
```js
{
  id:        string,
  teacherId: string,
  day:       string,
  timeSlot:  string,
  turma:     string,
  subjectId: string | null
}
```

### Subject (`meta/config → subjects[]`)
```js
{ id: string, name: string, areaId: string }
```

### Area (`meta/config → areas[]`)
```js
{ id: string, name: string, colorIdx: number, segmentIds: string[], shared: boolean }
```

### SharedSeries (`meta/config → sharedSeries[]`)
```js
{
  id: string,
  name: string,
  activities: [ { id: string, name: string, tipo: string, order: number } ]
}
```

---

## Regras de Negócio

### 1. Elegibilidade (quem entra no pool de candidatos)

| Perfil | Elegível? | Restrição |
|---|:---:|---|
| `admin` | Nunca | Excluído antes de qualquer cálculo |
| `coordinator` | Nunca | Excluído do pool (`t.profile !== 'coordinator'`) |
| `teacher` | Sim | Sem limite de substituições/semana |
| `teacher-coordinator` | Sim | Máximo 10 substituições/semana; se atingido, posicionado no final da sua categoria — não removido |

**Verificação de conflito de horário (`isBusy`):** um candidato é descartado somente se:
- Possui aula regular (`schedules`) no mesmo `day` + `timeSlot`, OU
- Já está atribuído como substituto (`slots[].substituteId`) na mesma `date` + `timeSlot`

**Verificação de disponibilidade por horário (`isAvailableBySchedule`):** se o professor possui `horariosSemana` configurado, o slot da aula deve estar dentro do intervalo `entrada–saída` do dia. Professores sem `horariosSemana` passam automaticamente.

### 2. Aulas Compartilhadas (Formação)

- Aulas de séries compartilhadas (`sharedSeries`, ex: ATPCG, FORMAÇÃO) **contam como aulas dadas** no cálculo de carga horária mensal (`monthlyLoad`).
- Aulas compartilhadas **não geram slot de ausência**: se um professor falta em uma turma de formação, nenhuma substituição é registrada ou necessária para esse slot.
- Na verificação de limite semanal (`isUnderWeeklyLimit`), aulas de formação também entram no cômputo de aulas próprias — um `teacher-coordinator` não pode usar slots de formação para "esconder" carga.

### 3. Cálculo de Carga Horária Mensal (`monthlyLoad`)

```
carga = aulas_proprias_no_mês − faltas_do_professor + substituições_realizadas_no_mês
```

Detalhe de implementação:
- **Aulas próprias no mês**: iterar `businessDaysBetween(monthStart, referenceDate)` e contar quantas entradas em `schedules` o professor tem em cada `day` label.
- **Faltas do professor**: dias em que o professor é o `teacherId` da ausência — nesses dias, as aulas regulares dele *não contam* como aulas dadas.
- **Substituições realizadas**: slots em `absences[].slots` onde `substituteId === teacherId` e `slot.date` está no intervalo do mês até `referenceDate`.
- `referenceDate` é o dia da substituição sendo avaliada (não o final do mês).

> **Atenção:** a implementação atual em `monthlyLoad` soma aulas próprias + substituições, mas **não desconta faltas do professor**. Esse desconto deve ser implementado neste projeto.

### 4. Limite Semanal para `teacher-coordinator` (`isUnderWeeklyLimit`)

- O limite é de **10 substituições por semana** (não 32 como está na implementação atual — isso deve ser corrigido).
- A semana é calculada de `weekStart(date)` até `date` (inclusive), considerando apenas dias úteis.
- Aulas de formação compartilhada são excluídas do cômputo (tanto aulas próprias quanto substituições em slots de formação).
- Se `ownAulas + subsAulas >= 10` para um `teacher-coordinator`, ele **não é removido do pool** — é mantido, mas posicionado ao final da sua categoria no ranking.

### 5. Regra Quantitativa (apenas carga horária)

Ordenação do pool de candidatos:
1. Calcular `monthlyLoad` de cada candidato.
2. Ordenar por menor carga (crescente).
3. Professores `teacher-coordinator` com limite semanal atingido vão para o final da fila, independentemente da carga.

### 6. Regra Qualitativa (matéria + área + carga)

Ordenação do pool de candidatos por prioridade de categoria:

| Score | Critério | Desempate |
|---|---|---|
| 0 | Mesma matéria + mesmo segmento | Menor carga mensal |
| 1 | Mesma matéria + outro segmento | Menor carga mensal |
| 2 | Mesma área + mesmo segmento | Menor carga mensal |
| 3 | Mesma área + outro segmento | Menor carga mensal |
| 4 | Outra área | Menor carga mensal |

Dentro de cada score, professores `teacher-coordinator` com limite semanal atingido são posicionados após os demais com mesmo score.

### 7. Apresentação ao Admin

- As **top 3 sugestões prioritárias** são exibidas como pills (`SuggestionPills`) diretamente no slot.
- O admin pode **ver todos os candidatos** disponíveis (lista completa ordenada pela regra ativa) e escolher qualquer um.
- O admin pode **aceitar a sugestão automática** (clicar na pill) ou **escolher manualmente** qualquer candidato da lista completa.
- Candidatos `teacher-coordinator` com limite atingido aparecem com indicação visual (badge ou aviso) em qualquer posição onde são exibidos.

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---|---|
| `src/lib/absences.js` | Corrigir `monthlyLoad` para descontar faltas do professor; corrigir limite de `isUnderWeeklyLimit` de 32 para 10 (apenas para `teacher-coordinator`); ajustar `rankCandidates` e `suggestSubstitutes` para manter `teacher-coordinator` com limite atingido na fila (posição degradada) |
| `src/components/ui/SuggestionPills.jsx` | Suportar exibição de badge visual quando candidato é `teacher-coordinator` com limite semanal atingido |
| `src/pages/CalendarPage.jsx` | Passar informação de limite atingido ao renderizar candidatos; exibir lista completa com badge |
| `src/pages/CalendarDayPage.jsx` | Idem CalendarPage |
| `src/pages/AbsencesPage.jsx` | Idem CalendarPage |

---

## Fora do Escopo (v1)

- Configurar o limite semanal de substituições do `teacher-coordinator` via interface de Settings (o valor 10 fica como constante no código).
- Notificações automáticas para o substituto sugerido (WhatsApp, e-mail).
- Histórico de recusas de substituição por professor.
- Ranking diferenciado por turno (manhã, tarde, noite).
- Sugestões para ausências em aulas de formação compartilhada (não geram slots de substituição).
- Persistência da regra ativa (qualitativa/quantitativa) entre sessões do browser.
