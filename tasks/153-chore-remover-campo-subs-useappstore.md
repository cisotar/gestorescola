title:	[Chore] Remover campo `subs` morto do useAppStore
state:	OPEN
author:	cisotar
labels:	enhancement
comments:	0
assignees:	
projects:	
milestone:	
number:	153
--
## Context
O campo `subs: {}` existe no estado inicial de `useAppStore` e é persisitido no `localStorage` mas não é utilizado por nenhuma funcionalidade do sistema. Está documentado como código morto em `references/architecture.md`.

## What to do
- Em `useAppStore.js`: remover `subs: {}` do estado inicial
- Em `src/lib/db.js`:
  - `_saveToLS`: remover `subs: subs ?? {}` do objeto serializado
  - `_loadFromLS`: sem mudança necessária (campo simplesmente deixa de existir)
  - `saveToFirestore`: verificar se `subs` está no batch — remover se estiver
- Buscar por `subs` em todo o codebase e remover referências órfãs
- Verificar que nenhuma página ou componente depende de `store.subs`

## Files affected
- `src/store/useAppStore.js` — remover do estado inicial e de qualquer acesso
- `src/lib/db.js` — remover de `_saveToLS`

## Acceptance criteria
- [ ] `store.subs` não existe mais no estado do Zustand
- [ ] `localStorage` não persiste mais o campo `subs`
- [ ] Nenhuma referência a `subs` no codebase (verificar com grep)
- [ ] App inicializa normalmente sem o campo

## Notes
Mudança de baixo risco. Não afeta dados do Firestore (campo nunca foi salvo lá). O cache localStorage antigo com `subs` simplesmente será ignorado na próxima carga.
