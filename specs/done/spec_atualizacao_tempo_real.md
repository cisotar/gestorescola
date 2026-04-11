# Spec: Atualização em Tempo Real com onSnapshot

## Problema

O app usa `getDocs` (leitura única) em todos os pontos críticos. Três situações exigem
reload manual da página para refletir mudanças no Firestore:

| Situação | Quem espera | O que não atualiza |
|---|---|---|
| Novo professor faz pedido | Admin | `pendingCt` no badge da navbar |
| Admin aprova professor | Professor pendente | Continua preso na PendingPage |
| Admin aprova professor | Admin / outros usuários | Lista de professores não reflete o novo membro |

## Solução

Três listeners `onSnapshot` bem delimitados, sem alterar a arquitetura geral.
A carga inicial (`loadFromFirestore` + `getDocs`) é mantida — os listeners são
adicionados depois e mantêm os dados vivos.

---

## Listener 1 — `pending_teachers` (coleção) → badge do admin

**Onde**: `useAuthStore`, método `_resolveRole`, ao confirmar role = `'admin'`

**Substituir** a leitura única `listPendingTeachers()` por um `onSnapshot` na coleção
`pending_teachers`. A cada mudança, recalcula o `pendingCt`.

```js
// src/store/useAuthStore.js
import { onSnapshot, collection, query, where } from 'firebase/firestore'

// em _resolveRole, bloco admin:
const q = query(collection(db, 'pending_teachers'), where('status', '==', 'pending'))
const unsub = onSnapshot(q, snap => {
  set({ pendingCt: snap.size })
})
set({ role: 'admin', _unsubPending: unsub })
```

O `unsubscribe` deve ser guardado no store e chamado no `logout`:

```js
logout: () => {
  get()._unsubPending?.()
  get()._unsubApproval?.()
  set({ _unsubPending: null, _unsubApproval: null })
  return signOut(auth)
},
```

---

## Listener 2 — `pending_teachers/{uid}` (documento) → aprovação automática

**Onde**: `useAuthStore`, método `_resolveRole`, ao confirmar role = `'pending'`

Observa o próprio documento do professor. Quando o documento é removido (aprovação
deleta o doc de pending_teachers e cria o professor), re-executa `_resolveRole` para
transicionar automaticamente da PendingPage para a HomePage sem reload.

```js
// em _resolveRole, bloco pending:
set({ role: 'pending' })
try { await requestTeacherAccess(user) } catch {}

const unsub = onSnapshot(doc(db, 'pending_teachers', user.uid), async snap => {
  if (!snap.exists()) {
    // doc removido = professor foi aprovado ou rejeitado
    unsub()
    set({ _unsubApproval: null })
    await get()._resolveRole(user, get()._teachers)
  }
})
set({ _unsubApproval: unsub })
```

> `get()._teachers` — ver Listener 3: o store precisa guardar a referência atualizada
> dos teachers para re-resolver o role corretamente após a aprovação.

---

## Listener 3 — `teachers` (coleção) → lista de professores em tempo real

**Onde**: `src/App.jsx`, após a carga inicial do Firestore.

Adiciona um `onSnapshot` na coleção `teachers` que substitui o array no `useAppStore`
sempre que houver mudança (novo professor aprovado, professor removido, dados editados).

```js
// src/App.jsx
import { onSnapshot, collection } from 'firebase/firestore'
import { db } from './lib/firebase'

useEffect(() => {
  loadFromFirestore().then(data => {
    hydrate(data)

    // Listener em tempo real para teachers
    const unsub = onSnapshot(collection(db, 'teachers'), snap => {
      const teachers = snap.docs.map(d => d.data())
      setTeachers(teachers)         // nova action no useAppStore
    })
    return unsub  // cleanup ao desmontar
  })
}, [])
```

**Nova action em `useAppStore`:**

```js
setTeachers: (teachers) => set({ teachers }),
```

**Ajuste em `useAuthStore`**: guardar referência dos teachers para uso no Listener 2:

```js
// em init(), após _resolveRole:
set({ _teachers: teachers })
// OU: usar useAppStore.getState().teachers diretamente no onSnapshot callback
```

> Alternativa mais simples para o Listener 2: em vez de re-executar `_resolveRole`,
> chamar diretamente `getTeacherByEmail(user.email)` e, se encontrado com status
> 'approved', fazer `set({ role: 'teacher', teacher })`.

---

## Resumo das mudanças

| Arquivo | Mudança |
|---|---|
| `src/store/useAuthStore.js` | Listener 1 (pendingCt admin), Listener 2 (aprovação pendente), unsubscribe no logout, campos internos `_unsubPending`, `_unsubApproval` |
| `src/store/useAppStore.js` | Nova action `setTeachers(teachers)` |
| `src/App.jsx` | Listener 3 (teachers em tempo real) com cleanup no useEffect |
| `src/lib/db.js` | Sem alteração |

---

## Verificação manual

- [ ] Admin faz login → novo professor se cadastra → badge de pendentes atualiza **sem reload**
- [ ] Professor pendente aguarda → admin aprova → PendingPage some e HomePage aparece **sem reload**
- [ ] Admin adiciona professor manualmente → lista de professores em outra aba atualiza **sem reload**
- [ ] Logout cancela todos os listeners (sem erros de "cannot update unmounted component")
- [ ] Reload da página ainda funciona normalmente (carga inicial intacta)
