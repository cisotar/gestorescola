title:	[Business] Coordenador: ver histórico das próprias ações submetidas
state:	OPEN
author:	cisotar
labels:	enhancement
comments:	0
assignees:	
projects:	
milestone:	
number:	150
--
## Context
Coordenadores submetem `pending_actions` mas não têm UI para acompanhar o status (pendente / aprovada / rejeitada) das suas submissões. Atualmente só o admin vê a aba "🔔 Aprovações". O coordenador fica às cegas após submeter uma ação.

## What to do
- Na `SettingsPage`, dentro da aba "👤 Meu Perfil" (única visível para coordenadores), adicionar uma seção "Minhas Solicitações" abaixo do perfil
- Buscar as `pending_actions` onde `coordinatorId === myTeacher.id` usando `getPendingActions()` filtrado por ID, ou criar nova função `getMyPendingActions(coordinatorId)`
- Exibir lista com: descrição (`summary`), data de submissão (`createdAt`), status com badge colorido (pendente=âmbar, aprovada=verde, rejeitada=vermelho)
- Se `status === 'rejected'`, exibir o `rejectionReason` abaixo da linha
- Limitar exibição às últimas 20 ações (ordenadas por `createdAt desc`)
- Permitir recarregar a lista manualmente (botão "Atualizar")

## Files affected
- `src/pages/SettingsPage.jsx` — `TabProfile`: adicionar seção "Minhas Solicitações"
- `src/lib/db.js` — adicionar `getMyPendingActions(coordinatorId)` se necessário

## Acceptance criteria
- [ ] Coordenador vê lista das próprias ações na aba "Meu Perfil"
- [ ] Cada item exibe: descrição, data relativa, badge de status
- [ ] Ação rejeitada exibe o motivo de rejeição
- [ ] Lista está vazia quando não há submissões
- [ ] Admin não vê a seção "Minhas Solicitações" (não é professor)
- [ ] Professor comum (`profile: 'teacher'`) não vê a seção

## Notes
Depende de #142 (coleção `pending_actions`) e #146 (UI de aprovações). Requer leitura da regra Firestore atual: `allow read: if isAdmin()` — será necessário ampliar para o próprio coordenador ler suas ações. Considerar `allow read: if isAdmin() || (isAuthenticated() && resource.data.coordinatorId == request.auth.uid... )` — mas regras Firestore não suportam joins; alternativa: criar query filtrada no cliente com `where('coordinatorId', '==', id)` e ajustar rule para `allow read: if isAdmin() || isAuthenticated()`.
