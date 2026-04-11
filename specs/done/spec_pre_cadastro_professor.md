# Spec: Pré-cadastro no Primeiro Acesso do Professor

## Visão Geral

Quando um professor faz login pela primeira vez, o sistema cria um doc em `pending_teachers` e exibe a `PendingPage` — atualmente uma tela de espera simples com campo de telefone opcional. A melhoria transforma essa tela em um formulário de pré-cadastro que coleta telefone (obrigatório) e matérias (multi-seleção por segmento EF/EM) **antes** da aprovação do admin. Ao aprovar, o professor já entra no sistema com os dados completos.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Estado:** Zustand (`useAppStore` para subjects/segments, `useAuthStore` para user/role)
- **Backend/DB:** Firebase Firestore — coleção `pending_teachers` (já existe)
- **Auth:** Firebase Auth + Google Provider (fluxo existente — sem alteração)

---

## Estado Atual vs. Novo Fluxo

### Atual
```
Login Google → _resolveRole → requestTeacherAccess (cria doc em pending_teachers)
  → role = 'pending' → PendingPage (tela de espera + telefone opcional)
  → Admin aprova → approveTeacher lê { celular, subjectIds } do doc (mas subjectIds nunca foi preenchido)
```

### Novo
```
Login Google → _resolveRole → requestTeacherAccess (sem mudança)
  → role = 'pending' → PendingPage
      ├─ [formulário não enviado] → exibe Form: nome (readonly), email (readonly),
      │                              telefone (obrigatório), matérias (multi-select EF/EM)
      └─ [após submit] → exibe tela de espera com resumo dos dados enviados
  → Admin aprova → approveTeacher já lê { celular, subjectIds } do doc ✓
```

A função `approveTeacher` em `db.js:175` já lê `data.celular` e `data.subjectIds` do doc — **não precisa de alteração**.

---

## Páginas e Rotas

### PendingPage (modificada) — renderizada quando `role === 'pending'`

**Descrição:** Substitui a tela de espera simples por um formulário de pré-cadastro com dois estados internos. Não é uma nova rota — o `App.jsx` já renderiza `PendingPage` para `role === 'pending'`.

**Componentes internos:**
- `PreCadastroForm` — formulário com os campos (novo, definido no mesmo arquivo)
- `WaitingScreen` — tela de confirmação após envio (renomeia/substitui o conteúdo atual)

**Estado interno da página:**
```js
// Determina qual tela exibir:
// 'form' → formulário não submetido ainda
// 'waiting' → dados já enviados, aguardando admin
const [step, setStep] = useState('form') // ou 'waiting' se celular já salvo no doc
const [celular, setCelular] = useState('')
const [selectedSubjects, setSelectedSubjects] = useState([]) // array de subjectIds
const [saving, setSaving] = useState(false)
```

Ao montar, verificar se o doc `pending_teachers/{user.uid}` já tem `celular` preenchido — se sim, iniciar diretamente em `step = 'waiting'` (evita re-preenchimento após reload).

**Behaviors — formulário (`step === 'form'`):**
- [ ] Ver nome pré-preenchido do Google Account (readonly)
- [ ] Ver email pré-preenchido do Google Account (readonly)
- [ ] Preencher telefone (obrigatório — botão "Enviar" desabilitado se vazio)
- [ ] Ver lista de matérias separadas por segmento (Ensino Fundamental / Ensino Médio), carregadas de `store.subjects` + `store.segments`
- [ ] Selecionar múltiplas matérias em um ou ambos os segmentos (toggle visual — pill selecionado/não selecionado)
- [ ] Submeter formulário → salva `{ celular, subjectIds }` no doc `pending_teachers/{uid}` → avança para `step = 'waiting'`
- [ ] Ver estado de loading durante o save ("Salvando…")
- [ ] Ver mensagem de erro se o save falhar (inline, sem `alert()`)
- [ ] Fazer logout pela página

**Behaviors — aguardando aprovação (`step === 'waiting'`):**
- [ ] Ver confirmação de que os dados foram enviados
- [ ] Ver resumo: nome, email, telefone, matérias selecionadas
- [ ] Fazer logout pela página

---

## Componentes Compartilhados

Nenhum novo componente compartilhado. Tudo definido internamente em `PendingPage.jsx`.

Os dados de matérias e segmentos vêm de `useAppStore()` — já carregados pelo `loadFromFirestore()` no `App.jsx` antes de renderizar qualquer página.

---

## Modelos de Dados

### `pending_teachers` (Firestore) — campos adicionados

```js
// Campos já existentes (sem alteração):
{
  id: string,          // = uid do Firebase Auth
  uid: string,
  email: string,
  name: string,        // displayName do Google
  photoURL: string,
  requestedAt: Timestamp,
  status: 'pending',
}

// Campos novos (preenchidos pelo formulário):
{
  celular: string,     // obrigatório antes de submeter
  subjectIds: string[] // IDs das matérias selecionadas
}
```

`approveTeacher` em `db.js:175` já lê `data.celular ?? ''` e `data.subjectIds ?? []` ao criar o doc do professor — **nenhuma alteração necessária**.

### Nova função em `db.js`

```js
export async function updatePendingData(uid, { celular, subjectIds }) {
  await updateDoc(doc(db, 'pending_teachers', uid), { celular, subjectIds })
}
```

A função `updatePendingPhone` existente (`db.js:153`) será **substituída** por `updatePendingData` que salva ambos os campos de uma vez.

---

## Regras de Negócio

1. **Telefone obrigatório:** o botão "Enviar cadastro" fica desabilitado enquanto o campo celular estiver vazio.
2. **Matérias opcionais no submit:** o professor pode submeter sem selecionar matérias (admin pode completar depois na aprovação). Mas a UI deve deixar claro que matérias são recomendadas.
3. **Persistência imediata:** os dados são salvos em `pending_teachers/{uid}` no momento do submit — não há rascunho intermediário.
4. **Re-entry seguro:** se o professor recarregar a página após ter submetido, o sistema detecta `celular` já preenchido no doc e exibe diretamente `WaitingScreen`.
5. **Segmentos:** a separação EF/EM é derivada de `store.segments` + `store.areas.segmentIds` — mesma lógica de `SettingsPage.jsx` (`TabSchedules`).
6. **Fluxo de auth inalterado:** `_resolveRole`, `requestTeacherAccess`, `approveTeacher`, `rejectTeacher` — nenhuma alteração.

---

## Fora do Escopo (v1)

- Edição posterior dos dados pelo professor após submissão (antes da aprovação)
- Validação de formato de telefone (ex: máscara, SMS)
- Upload de documentos ou foto
- Nova rota `/pre-cadastro` — a página é renderizada pelo guard existente em `App.jsx`
- Alteração de `approveTeacher` ou qualquer outra função de `db.js` além de `updatePendingData`
- Alteração de `useAuthStore.js` ou `App.jsx`
