# Spec: Corrigir Login + Tela de Aguardando Aprovação com Telefone

## Contexto

A troca de `signInWithPopup` por `signInWithRedirect` quebrou o login para todos os
usuários (admin, professores aprovados e pendentes). Os warnings de COOP eram cosméticos
— gerados pelo próprio SDK do Firebase, sem impacto funcional. O fluxo com popup é
estável e amplamente usado em produção.

Esta spec:
1. Reverte o login para `signInWithPopup` (estado pré-regressão)
2. Melhora a `PendingPage` para coletar o telefone do professor na primeira visita

---

## Arquivo 1 — `src/store/useAuthStore.js`

### Reverter para signInWithPopup

```js
// imports
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
// remover: signInWithRedirect, getRedirectResult

// init — voltar à versão original (síncrona, sem await getRedirectResult)
init: (teachers) => {
  return new Promise(resolve => {
    onAuthStateChanged(auth, async user => {
      set({ user, role: null, teacher: null })
      if (user) await get()._resolveRole(user, teachers)
      set({ loading: false })
      resolve()
    })
  })
},

// login — voltar para popup
login: async () => {
  try { await signInWithPopup(auth, provider) }
  catch (e) { if (e.code !== 'auth/popup-closed-by-user') alert('Erro ao fazer login: ' + e.message) }
},
```

> Os warnings de COOP são emitidos pelo SDK do Firebase e não indicam falha funcional.
> Não é necessário nenhuma outra mudança para eliminá-los.

---

## Arquivo 2 — `src/lib/db.js`

### Adicionar função para salvar telefone do professor pendente

```js
export async function updatePendingPhone(uid, celular) {
  await updateDoc(doc(db, 'pending_teachers', uid), { celular })
}
```

Adicionar após `requestTeacherAccess`.

---

## Arquivo 3 — `src/pages/PendingPage.jsx`

### Reescrever com campo de telefone

```jsx
import { useState } from 'react'
import useAuthStore from '../store/useAuthStore'
import { updatePendingPhone } from '../lib/db'

export default function PendingPage() {
  const { user, logout } = useAuthStore()
  const [phone, setPhone]   = useState('')
  const [saved, setSaved]   = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!phone.trim()) return
    setSaving(true)
    try {
      await updatePendingPhone(user.uid, phone.trim())
      setSaved(true)
    } catch (e) {
      alert('Erro ao salvar telefone: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg p-4">
      <div className="bg-surf border border-bdr rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h2 className="text-xl font-extrabold mb-2">Aguardando aprovação</h2>
        <p className="text-sm text-t2 leading-relaxed mb-6">
          Olá, <strong>{user?.displayName}</strong>!<br />
          Seu acesso está aguardando aprovação pelo administrador.
        </p>

        {/* Dados de contato */}
        <div className="text-left space-y-3 mb-6">
          <div>
            <label className="text-xs font-bold text-t2 block mb-1">E-mail</label>
            <div className="inp bg-surf2 text-t3 cursor-not-allowed">{user?.email}</div>
          </div>

          {saved ? (
            <div className="flex items-center gap-2 text-ok text-sm font-semibold py-2">
              <span>✓</span> Telefone salvo com sucesso
            </div>
          ) : (
            <div>
              <label className="text-xs font-bold text-t2 block mb-1">Telefone (opcional)</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  className="inp flex-1"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !phone.trim()}
                  className="btn btn-dark"
                >
                  {saving ? '…' : 'Salvar'}
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={logout} className="btn btn-ghost w-full">
          Sair da conta
        </button>
      </div>
    </div>
  )
}
```

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/store/useAuthStore.js` | Reverte para `signInWithPopup`, remove redirect |
| `src/lib/db.js` | Adiciona `updatePendingPhone(uid, celular)` |
| `src/pages/PendingPage.jsx` | Reescreve com campo de e-mail (read-only) e telefone |

---

## Verificação manual

- [ ] Admin consegue fazer login normalmente
- [ ] Professor aprovado consegue fazer login normalmente
- [ ] Novo professor vê a tela "Aguardando aprovação" após login
- [ ] E-mail aparece preenchido e não editável
- [ ] Campo de telefone salva corretamente no Firestore (`pending_teachers/{uid}.celular`)
- [ ] Após salvar, aparece confirmação "✓ Telefone salvo com sucesso"
- [ ] Botão "Sair da conta" funciona
