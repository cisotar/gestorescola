# Spec: Corrigir COOP Warning — signInWithPopup → signInWithRedirect

## Problema

Ao fazer login (ou ao tentar), o console exibe repetidamente:

```
Cross-Origin-Opener-Policy policy would block the window.closed call.
```

### Causa raiz

`signInWithPopup` abre um popup e testa `window.closed` para detectar quando ele fecha.
O Firebase Hosting serve os assets com o header `Cross-Origin-Opener-Policy: same-origin`,
que bloqueia o acesso cross-origin a `window.closed`. O resultado é que o popup nunca é
detectado como fechado, o fluxo de autenticação fica preso, e o erro é repetido no console.

### Solução

Substituir `signInWithPopup` por `signInWithRedirect` + `getRedirectResult`.
Com redirect não há popup nem `window.closed` — o browser navega para o Google e volta para
a app; o Firebase resolve o resultado via `getRedirectResult` na carga seguinte.

---

## Arquivo: `src/store/useAuthStore.js`

### 1. Alterar import

```js
// antes
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'

// depois
import { signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth'
```

### 2. Alterar `login()`

```js
// antes
login: async () => {
  try { await signInWithPopup(auth, provider) }
  catch (e) { if (e.code !== 'auth/popup-closed-by-user') alert('Erro ao fazer login: ' + e.message) }
},

// depois
login: async () => {
  try { await signInWithRedirect(auth, provider) }
  catch (e) { alert('Erro ao fazer login: ' + e.message) }
},
```

### 3. Tratar `getRedirectResult` em `init()`

Chamar `getRedirectResult` no início de `init()` para processar o resultado do redirect
ao retornar do Google, e capturar eventuais erros (ex: conta bloqueada):

```js
init: (teachers) => {
  return new Promise(resolve => {
    // Processa resultado do redirect (se houver)
    getRedirectResult(auth).catch(e => {
      console.warn('[auth redirect]', e.code, e.message)
    })

    onAuthStateChanged(auth, async user => {
      set({ user, role: null, teacher: null })
      if (user) await get()._resolveRole(user, teachers)
      set({ loading: false })
      resolve()
    })
  })
},
```

> `getRedirectResult` retorna `null` se não houver redirect pendente — é seguro chamá-lo sempre.
> O `onAuthStateChanged` continua sendo a fonte de verdade do estado do usuário.

---

## Arquivo alterado

| Arquivo | Mudança |
|---|---|
| `src/store/useAuthStore.js` | Troca popup por redirect; adiciona getRedirectResult em init |

---

## Verificação manual

- [ ] Clicar em "Entrar com Google" → redireciona para Google (sem popup)
- [ ] Após autenticar → retorna para a app e faz login corretamente
- [ ] Console sem warnings de COOP
- [ ] Professor pendente vê tela "Aguardando aprovação" após o redirect
- [ ] Admin e professor aprovado entram nas páginas corretas
- [ ] Fechar a aba ou cancelar no Google → não gera erros no console
