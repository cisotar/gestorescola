# Spec: Regras de Sugestão de Substitutos (Toggle Global)

## Visão Geral
Após marcar uma ou mais faltas de um professor em um dia, o ADM pode escolher entre duas regras de sugestão de substitutos:
- **Qualitativa**: prioriza professores da mesma matéria ou área (com nível de hierarquia), depois por menor carga mensal
- **Quantitativa**: prioriza apenas pela menor carga mensal (sem considerar matéria/área)

O toggle (Qualitativa / Quantitativa) aparece **uma única vez no topo do modal/página** quando há faltas sem substituto, e sua seleção se aplica **imediatamente a todos os slots** que mostram sugestões, sem a necessidade de abrir modais secundários.

## Stack Tecnológica
- Frontend: React 18.3.1, React Router 6.26.0, Zustand 4.5.4
- UI: Tailwind CSS 3.4.10, componentes customizados (btn, badge)
- Lógica: funções em `src/lib/absences.js` (rankCandidates, suggestSubstitutes, monthlyLoad)
- PDFs: `src/lib/reports.js` (generateSlotCertificateHTML, openPDF)

## Páginas e Rotas

### DayModal (Desktop) — dentro de `CalendarPage`
**Descrição:** Modal aberto ao clicar num professor/data no calendário. Exibe todos os slots do professor naquele dia com opção de marcar faltas e atribuir substitutos.

**Componentes:**
- `ToggleRuleButtons` (Qualitativa/Quantitativa): toggle no topo, aparece quando há faltas sem substituto
- `SubPicker` (modo compact): lista de top-3 sugestões empilhadas por slot
- Botões de ação: Marcar dia inteiro, Aceitar sugestões, Remover substitutos, Remover faltas, Baixar PDF

**Behaviors:**
- [ ] ADM clica "Marcar falta" num slot → falta registrada, `ToggleRuleButtons` aparece no topo (se não estava visível)
- [ ] ADM clica "Qualitativa" ou "Quantitativa" → rule muda globalmente, todos os `SubPicker compact` recalculam top-3 imediatamente
- [ ] ADM clica um nome de substituto (pill) → substituto atribuído, "✓ Nome" aparece no slot, modal permanece aberto
- [ ] ADM clica "↺ Trocar" (se já há substituto) → modal secundário abre com lista completa
- [ ] ADM clica "Baixar Comprovante" (após atribuição nessa sessão) → PDF gerado e aberto
- [ ] ADM clica "Desfazer" → falta e substituto removidos do slot, `ToggleRuleButtons` desaparece se não há mais faltas sem substituto

### CalendarDayPage (Mobile) — rota dedicada para mobile
**Descrição:** Página full-screen para um professor + dia, com navegação swipe entre dias da semana. Mesmos comportamentos do DayModal.

**Componentes:**
- Header com card do professor
- Pills dos dias (sticky, navegável)
- `ToggleRuleButtons` (Qualitativa/Quantitativa): aparece abaixo das ações rápidas quando há faltas sem substituto
- `SubPicker` (modo compact): lista de top-3 sugestões empilhadas por slot
- Mesmos botões de ação

**Behaviors:**
- [ ] ADM marca falta → `ToggleRuleButtons` aparece na página
- [ ] ADM muda regra → todos os slots atualizam sugestões imediatamente
- [ ] ADM toca um substituto ou "ver todos" → mesmo fluxo do desktop
- [ ] ADM faz swipe lateral → navega entre dias da semana

---

## Componentes Compartilhados

### ToggleRuleButtons
- **Onde**: `src/components/ui/ToggleRuleButtons.jsx`
- **Props**: `activeRule` (string: 'qualitative' | 'quantitative'), `onRuleChange` (callback)
- **Comportamento**: dois botões lado a lado (Qualitativa / Quantitativa); ativo fica `btn-dark`, inativo fica `btn-ghost`
- **Visibilidade**: renderizado no topo de `DayModal` / `CalendarDayPage` apenas quando `anyAbsent && !allHasSub`

### SubPicker
- **Onde**: `src/pages/CalendarPage.jsx` e `src/pages/CalendarDayPage.jsx` (funções locais)
- **Props (modo compact)**:
  - `absenceId`, `slotId`, `teacherId`, `date`, `slot`, `subjectId`, `store`
  - `compact={true}`: renderiza inline (top-3 empilhados)
  - `ruleType`: string ('qualitative' | 'quantitative'), passado do `DayModal`/`CalendarDayPage`
- **Comportamento**: lista top-3 sugestões usando `suggestSubstitutes(absenceSlot, ruleType, store)`, com botão "ver todos" para modal com lista completa

---

## Modelos de Dados

### Absence (Firestore)
```
{
  id: string (UUID),
  teacherId: string,
  slots: [
    {
      id: string,
      date: string (ISO),
      timeSlot: string ("segId|turno|aulaIdx"),
      substituteId: string | null,
      scheduleId: string,
      subjectId: string | null,
      turma: string
    }
  ]
}
```

### Schedule
```
{
  id: string,
  teacherId: string,
  day: string ("seg" | "ter" | ... | "dom"),
  timeSlot: string,
  turma: string,
  subjectId: string | null
}
```

### Subject
```
{
  id: string,
  name: string,
  areaId: string | null
}
```

### Area
```
{
  id: string,
  name: string,
  subjectIds: string[]
}
```

---

## Regras de Negócio

### Regra Qualitativa
1. **Candidatos base**: todos os professores ativos exceto o professor ausente, sem conflito de horário
2. **Pontuação** (menor = melhor):
   - Nível 1 (mesma matéria): 1000 pontos + carga mensal
   - Nível 2 (mesma área): 2000 pontos + carga mensal
   - Nível 3 (outra área): 3000 pontos + carga mensal
   - Bônus: -500 se no mesmo segmento
3. **Ordem final**: top-3 por menor pontuação

### Regra Quantitativa
1. **Candidatos base**: idem qualitativa
2. **Pontuação**: apenas carga mensal (menor = melhor)
3. **Ordem final**: top-3 por menor carga mensal

### Carga Mensal
- Calcula total de aulas programadas para o professor em todo o mês (calendário ou 30 dias a partir da data de referência)
- Desconsidera faltas já marcadas para esse professor

### Visibilidade do Toggle
- Aparece quando: `anyAbsent && !allHasSub` (há faltas e nem todas têm substituto)
- Desaparece quando: `allHasSub` (todas as faltas têm substituto) ou sem faltas
- Posição fixa: topo do modal / abaixo das ações rápidas na página mobile

### Escopo da Regra
- **Global**: muda aplicada a **todos os slots** da sessão atual (não persiste entre aberturas do modal)
- **Por sessão**: ao fechar e reabrir o modal, volta para "Qualitativa" (padrão)

---

## Fora do Escopo (v1)
- Salvar preferência de regra do usuário entre sessões
- Aplicar regras diferentes a diferentes slots
- Histórico de sugestões
- Exportação de sugestões
- Integração com notificações de substitutos

---

## Verificação Manual

### Cenário 1: Qualitativa (padrão)
1. Abrir modal de um professor
2. Marcar 2 faltas (matérias diferentes)
3. Verificar que `ToggleRuleButtons` apareceu no topo
4. Verificar que "Qualitativa" está ativo (escuro)
5. Para cada slot: verificar top-3 sugestões — devem incluir mesma matéria primeiro
6. Clicar um substituto → atribuído, "✓ Nome" aparece, modal aberto
7. Clicar "Qualitativa" novamente (já ativo) → sem mudança visual
8. Clicar "Quantitativa" → top-3 recalculam, ordem pode mudar (agora apenas por carga)

### Cenário 2: Trocar de Qualitativa para Quantitativa
1. Modal aberto com 3 faltas, "Qualitativa" ativo
2. Top-3 do slot 1: [Prof A (mesma matéria, 2 aulas), Prof B (outra área, 1 aula), Prof C (outra área, 3 aulas)]
3. Clicar "Quantitativa"
4. Top-3 do slot 1 agora: [Prof B (1 aula), Prof A (2 aulas), Prof C (3 aulas)]
5. Clicar Prof B → atribuído
6. Marcar nova falta → top-3 atualizam seguindo "Quantitativa"

### Cenário 3: Todos os slots têm substituto
1. Modal aberto, 3 faltas com 3 substitutos
2. `ToggleRuleButtons` deve estar **invisível** (não renderizado)
3. Clicar "Desfazer" num slot → remove substituto, `ToggleRuleButtons` reaparece

### Cenário 4: Mobile (swipe entre dias)
1. Abrir página mobile para professor (Segunda)
2. Marcar falta → `ToggleRuleButtons` aparece abaixo das ações
3. Clicar "Quantitativa" → pills atualizam
4. Fazer swipe para direita → navegar para Terça (estado `ruleType` persiste)
5. Marcar falta em Terça → sugestões já usam "Quantitativa"
6. Fazer swipe para esquerda → volta para Segunda (sugestões de Segunda ainda em "Quantitativa")

### Cenário 5: Modal "ver todos"
1. Modal principal: 3 sugestões visíveis
2. Clicar "ver todos (12)"
3. Modal secundário abre com lista completa ordenada por regra ativa
4. Clicar um professor nessa lista → atribuído, modal secundário fecha, modal principal ainda aberto
5. `ToggleRuleButtons` no modal principal continua ativo

---

## Notas Técnicas

- `ruleType` é estado local: não persiste entre aberturas do modal
- Sugestões são recalculadas via `useMemo` sempre que `ruleType` muda
- `SubPicker compact` não gerencia `ruleType` internamente — recebe como prop do pai
- PDF de comprovante (`generateSlotCertificateHTML`) segue o padrão existente e não muda
