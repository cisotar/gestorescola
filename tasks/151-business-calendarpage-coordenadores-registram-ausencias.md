title:	[Business] CalendarPage: coordenadores podem registrar ausências
state:	OPEN
author:	cisotar
labels:	enhancement
comments:	0
assignees:	
projects:	
milestone:	
number:	151
--
## Context
`CalendarPage` é acessível a coordenadores (`canAccessAdmin` em `App.jsx`) mas todos os botões de gestão de ausências verificam `isAdmin = role === 'admin'`. Coordenadores conseguem apenas visualizar o calendário — não podem marcar faltas nem atribuir substitutos, o que torna a página inútil para eles na prática.

## What to do
- Em `CalendarPage`, trocar `const isAdmin = role === 'admin'` por `const canManage = role === 'admin' || role === 'coordinator' || role === 'teacher-coordinator'`
- Substituir todas as referências `isAdmin` usadas para gates de UI de ausência (botões "Marcar falta", "Atribuir substituto", `DayModal` com ações, `RangeAbsenceBar`) por `canManage`
- Manter `isAdmin` apenas onde fizer sentido restringir (ex: configurações que não se aplicam a coordenadores)
- Revisar `firestore.rules`: a regra `allow write: if isAdmin()` para `absences` precisará incluir coordenadores. Opções:
  - Ampliar para `isAuthenticated()` (pragmático, dado que o acesso à página já é restrito)
  - Ou criar função `canManageAbsences()` que verifica admin ou teacher com profile coordinator
- Verificar `CalendarDayPage` — mesmos guards de `isAdmin` para mobile

## Files affected
- `src/pages/CalendarPage.jsx` — substituir guards `isAdmin` por `canManage`
- `src/pages/CalendarDayPage.jsx` — idem para mobile
- `firestore.rules` — ampliar write de `absences` para coordenadores
- Deploy das regras: `firebase deploy --only firestore:rules`

## Acceptance criteria
- [ ] Coordenador abre CalendarPage e vê os botões de "Marcar falta" e "Atribuir substituto"
- [ ] Coordenador consegue marcar um slot como ausente (persiste no Firestore)
- [ ] Coordenador consegue atribuir substituto a um slot
- [ ] Admin continua funcionando normalmente (sem regressão)
- [ ] Professor comum (`role: 'teacher'`) não vê os botões de gestão

## Notes
Depende de #144 (routing de coordenadores). Requer atenção à regra Firestore de `absences` — atualmente `allow write: if isAdmin()` apenas, o que bloqueia writes de coordenadores mesmo que o JS libere o botão.
