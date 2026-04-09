title:	[useAuthStore] Badge de pedidos pendentes atualiza em tempo real
state:	OPEN
author:	cisotar
labels:	enhancement
comments:	0
assignees:	
projects:	
milestone:	
number:	5
--
## Context
O admin só vê o contador de pedidos pendentes (`pendingCt`) no momento do login. Se um novo professor solicitar acesso enquanto o admin já está logado, o badge não atualiza sem reload da página.

## What to do
- Em `_resolveRole`, bloco `admin`: substituir `listPendingTeachers()` por um `onSnapshot` na coleção `pending_teachers` filtrado por `status == 'pending'`
- A cada mudança na coleção, atualizar `pendingCt` com `snap.size`
- Guardar o unsubscribe em `_unsubPending` no store
- Atualizar `logout` para cancelar ambos os listeners (`_unsubPending` e `_unsubApproval`) antes de fazer signOut

```js
// src/store/useAuthStore.js
import { onSnapshot, collection, query, where } from 'firebase/firestore'

// em _resolveRole, bloco admin:
const q = query(collection(db, 'pending_teachers'), where('status', '==', 'pending'))
const unsub = onSnapshot(q, snap => {
  set({ pendingCt: snap.size })
})
set({ role: 'admin', _unsubPending: unsub })

// logout:
logout: () => {
  get()._unsubPending?.()
  get()._unsubApproval?.()
  set({ _unsubPending: null, _unsubApproval: null })
  return signOut(auth)
},
```

## Files affected
- `src/store/useAuthStore.js` — substituir leitura única por listener, adicionar `_unsubPending`, atualizar `logout`

## Acceptance criteria
- [ ] Admin faz login → novo professor se cadastra → badge de pendentes atualiza **sem reload**
- [ ] Logout cancela o listener sem erros no console
- [ ] Reload da página ainda funciona normalmente (carga inicial intacta)

## Notes
O campo `_unsubApproval` também é cancelado no `logout` — implementar junto com a Issue 2 para não ter dois PRs tocando no mesmo método.

---

## Plano Técnico

### Análise do Codebase

- `src/store/useAuthStore.js` — store Zustand de autenticação. Estado atual: `pendingCt` existe mas é setado uma única vez via `listPendingTeachers()` em `_resolveRole`. `logout` faz apenas `signOut(auth)` sem cleanup. `db` **não está importado** aqui — só `auth` e `provider`. `onSnapshot`, `query`, `where`, `collection` também não estão importados.
- `src/lib/firebase.js` — exporta `db`, `auth`, `provider`. Precisa ser importado em `useAuthStore`.
- `src/lib/db.js` — já importa `query`, `where`, `getDocs` do Firestore, mas esses imports **não estão disponíveis em `useAuthStore`** — precisam ser adicionados diretamente lá.
- `src/components/layout/Navbar.jsx` — **`pendingCt` nunca é consumido aqui**. O badge ainda não existe na UI. Esta issue precisa também renderizá-lo na Navbar, caso contrário o listener não tem efeito visível.

### Cenários

**Caminho Feliz:**
1. Admin faz login → `_resolveRole` detecta role admin
2. `onSnapshot` é registrado na coleção `pending_teachers` filtrado por `status == 'pending'`
3. Firebase dispara imediatamente com o estado atual → `pendingCt` é setado
4. Novo professor solicita acesso → Firestore atualiza → `onSnapshot` dispara → `pendingCt` atualiza → badge na Navbar re-renderiza
5. Admin faz logout → `_unsubPending?.()` cancela o listener → `signOut` é chamado

**Casos de Borda:**
- Admin já logado sem pedidos pendentes: `snap.size === 0` → badge não aparece (ou `pendingCt === 0`)
- Admin aprova todos os pedidos: `snap.size` cai para 0 → badge some
- Erro de permissão no Firestore: `onSnapshot` chama o callback de erro — deve ser capturado silenciosamente

**Tratamento de Erros:**
- Adicionar segundo argumento ao `onSnapshot` para capturar erros sem quebrar a sessão:
  ```js
  onSnapshot(q, snap => { set({ pendingCt: snap.size }) }, err => console.warn('[pendingCt]', err))
  ```

### Schema de Banco de Dados
Não aplicável — coleção `pending_teachers` já existe. Apenas leitura via listener.

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

- `src/store/useAuthStore.js`
  - Adicionar import de `db` de `'../lib/firebase'`
  - Adicionar import de `{ onSnapshot, collection, query, where }` de `'firebase/firestore'`
  - Remover import de `listPendingTeachers` de `'../lib/db'` (não será mais usado aqui)
  - Adicionar `_unsubPending: null` e `_unsubApproval: null` ao estado inicial
  - Em `_resolveRole`, bloco admin: substituir `listPendingTeachers()` por `onSnapshot`
  - Atualizar `logout` para cancelar os listeners antes de `signOut`

- `src/components/layout/Navbar.jsx`
  - Ler `pendingCt` de `useAuthStore`
  - Renderizar badge numérico no botão ⚙️ (desktop) e no link Configurações (mobile) quando `isAdmin && pendingCt > 0`

### Arquivos que NÃO devem ser tocados
- `src/lib/db.js` — `listPendingTeachers` permanece lá para uso em outros lugares (SettingsPage)
- `src/pages/SettingsPage.jsx` — continua usando `listPendingTeachers` normalmente
- `src/App.jsx` — sem alteração nesta issue

### Dependências Externas
- `firebase/firestore` v10 — `onSnapshot` com query filtrada. Já instalado. Docs: https://firebase.google.com/docs/firestore/query-data/listen

### Ordem de Implementação
1. Atualizar imports em `useAuthStore.js` (adicionar `db`, `onSnapshot`, `query`, `where`; remover `listPendingTeachers`)
2. Adicionar `_unsubPending: null`, `_unsubApproval: null` ao estado inicial
3. Substituir o bloco admin em `_resolveRole` pelo listener `onSnapshot`
4. Atualizar `logout` com cancelamento dos listeners
5. Renderizar o badge em `Navbar.jsx` — esta etapa é independente das anteriores e pode ser feita em paralelo
