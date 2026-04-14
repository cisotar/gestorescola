title:	[Business] Settings/Horários: coordenadores podem solicitar aulas via SettingsPage
state:	OPEN
author:	cisotar
labels:	enhancement
comments:	0
assignees:	
projects:	
milestone:	
number:	152
--
## Context
O store tem guard para `addSchedule` e `removeSchedule` que submete `pending_action` quando o usuário é coordinator. Porém a aba "🗓 Horários" só aparece para `isAdmin = role === 'admin'`. Coordenadores não têm nenhum caminho de UI para solicitar inclusão ou remoção de aulas — o guard do store nunca é acionado na prática.

## What to do
- Avaliar se coordenadores devem ver a aba "🗓 Horários" completa ou uma aba simplificada "📋 Minhas Aulas"
- **Opção recomendada (menor esforço):** exibir a aba "🗓 Horários" para coordenadores também, mas com escopo restrito ao próprio professor do coordenador:
  - `ScheduleGridModal` exibe apenas a grade do coordenador logado (não o seletor de professor)
  - Botão "Adicionar aula" abre `AddScheduleModal` com `teacher = myTeacher`
  - O store já intercepta a chamada via `_isCoordinator()` → `_submitApproval`
  - Toast confirma que a solicitação foi enviada para aprovação
- Adicionar "🗓 Minhas Aulas" como aba extra no array de tabs do coordenador (separado de ADMIN_TABS)
- Em `SettingsPage`, o render de tabs deve checar `isAdmin || isCoordinator()` para montar o conjunto correto de abas

## Files affected
- `src/pages/SettingsPage.jsx` — tabs visíveis para coordinator; ScheduleGridModal com escopo restrito

## Acceptance criteria
- [ ] Coordenador vê uma aba de horários na SettingsPage
- [ ] A aba mostra a grade do próprio coordenador (não permite selecionar outro professor)
- [ ] Botão "Adicionar aula" está visível e abre o AddScheduleModal
- [ ] Ao salvar, o store submete como `pending_action` e exibe toast de confirmação
- [ ] Admin continua vendo a aba "🗓 Horários" completa com todos os professores
- [ ] Professor comum não vê aba de horários na SettingsPage

## Notes
Depende de #145 (guards do store), #149 (restrição a turmas compartilhadas para coordinator). `AddScheduleModal` já filtra turmas para `profile: 'coordinator'` — comportamento correto sem mudanças adicionais.
