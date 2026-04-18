# Spec: Correção da Promoção de Perfis de Professores

## Visão Geral

O admin consegue visualizar o `ProfilePillDropdown` nos cards e na tabela da aba Professores em `/settings`, mas a promoção de um professor (ex: de `teacher` para `coordinator` ou `teacher-coordinator`) não persiste após a interação. A causa é um conjunto de falhas silenciosas e inconsistências na lógica de escrita no Firestore e no tratamento de erros.

---

## Stack Tecnológica

- Frontend: React 18 + Tailwind CSS
- Backend: Firebase Firestore (regras v2)
- Estado: Zustand (`useAuthStore`, `useAppStore`)
- Página afetada: `src/pages/SettingsPage.jsx`
- Store afetado: `src/store/useAppStore.js`
- I/O afetado: `src/lib/db.js`

---

## Páginas e Rotas

### Configurações — `/settings` (aba Professores)

**Descrição:** O admin vê professores agrupados por segmento em cards. Cada card tem um `ProfilePillDropdown` que permite promover/rebaixar o professor entre os perfis `teacher`, `coordinator`, `teacher-coordinator` e `admin`. Ao selecionar um novo perfil no dropdown, a mudança deve persistir no Firestore e a UI deve refletir o novo estado permanentemente.

**Componentes:**

- `TabTeachers`: Componente da aba Professores.
- `ProfilePillDropdown`: Dropdown de seleção de perfil (pill visual com opções).
- `handleProfileChange`: Handler que orquestra a mudança de perfil.

**Behaviors:**

- [ ] **Promover professor para coordinator:** Ao selecionar `Coord. Geral` no dropdown de um professor com perfil `teacher`, atualizar `profile: 'coordinator'` no documento `teachers/{id}` do Firestore e no store em memória. Exibir toast de confirmação. O dropdown deve refletir o novo perfil imediatamente e persistir após reload.
- [ ] **Promover professor para teacher-coordinator:** Ao selecionar `Prof. Coord.` no dropdown, atualizar `profile: 'teacher-coordinator'` no Firestore e no store. Mesmo comportamento acima.
- [ ] **Rebaixar coordinator para teacher:** Ao selecionar `Professor` no dropdown de um `coordinator`, atualizar `profile: 'teacher'` no Firestore e no store.
- [ ] **Promover para admin:** Ao selecionar `Admin`, chamar `addAdmin(t.email, t.name)` para adicionar à coleção `admins/` E atualizar `profile: 'teacher'` no documento `teachers/{id}` (limpando o profile, pois admin é gerenciado pela coleção `admins/`, não pelo campo `profile`). Exibir confirmação antes de salvar.
- [ ] **Rebaixar admin para outro perfil:** Ao selecionar qualquer perfil diferente de `admin` quando `currentProfile(t) === 'admin'`, chamar `removeAdmin(t.email)` E atualizar `profile: newProfile` no Firestore.
- [ ] **Capturar erros de escrita no Firestore:** Se `updateDocById` falhar (ex: erro de permissão ou rede), exibir toast de erro. Não deixar a UI em estado divergente do Firestore.
- [ ] **Não interceptar ação de admin como coordenador:** `store.updateTeacher` verifica `_isCoordinator()` para decidir se submete a ação para aprovação. Para admin (`role === 'admin'`), esta verificação deve retornar `false` — garantir que nunca haja regressão nesse fluxo.

---

## Diagnóstico Técnico dos Bugs

### Bug 1 — `updateTeacher` sem `await` no `handleProfileChange`

**Arquivo:** `src/pages/SettingsPage.jsx`, função `handleProfileChange` (~linha 1229)

**Problema:**
```js
// Código atual — sem await
store.updateTeacher(t.id, { profile: newProfile })
```

`updateTeacher` é `async`. Sem `await`, qualquer erro assíncrono (incluindo falha silenciosa do `updateDocById`) não é capturado pelo `try/catch` de `handleProfileChange`. O toast de sucesso é exibido antes de a escrita no Firestore ser confirmada.

**Correção:**
```js
await store.updateTeacher(t.id, { profile: newProfile })
```

---

### Bug 2 — `updateDocById` não relança erros

**Arquivo:** `src/lib/db.js`, função `updateDocById`

**Problema:**
```js
export async function updateDocById(colName, id, changes) {
  try {
    await updateDoc(doc(db, colName, id), changes)
  } catch (e) {
    console.error(e)  // engole o erro — nenhum caller sabe que falhou
  }
}
```

Erros de permissão, rede ou documento inexistente são silenciados. A UI atualiza localmente via `set()`, mas o Firestore não é atualizado. Quando o `onSnapshot` dispara em seguida (com os dados antigos do Firestore), o store é sobrescrito com o estado anterior — revertendo a mudança visualmente.

**Correção:**
```js
export async function updateDocById(colName, id, changes) {
  await updateDoc(doc(db, colName, id), changes)
  // Sem try/catch — permite que o caller capture e trate o erro
}
```

Todos os callers de `updateDocById` que não propagam erros devem ser auditados e atualizados para ter `try/catch` adequado. Na `updateTeacher` do `useAppStore`:

```js
updateTeacher: async (id, changes) => {
  const teacher = get().teachers.find(t => t.id === id)
  if (_isCoordinator()) return _submitApproval('updateTeacher', { id, changes }, `Editar professor ${teacher?.name ?? id}`)
  set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t) }))
  try {
    await updateDocById('teachers', id, changes)
  } catch (e) {
    // Reverter o store em caso de falha
    set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...Object.fromEntries(Object.keys(changes).map(k => [k, teacher?.[k]])) } : t) }))
    throw e  // Propagar para o caller
  }
},
```

---

### Bug 3 — Promoção a `admin` não limpa o `profile` no documento `teachers/`

**Arquivo:** `src/pages/SettingsPage.jsx`, função `handleProfileChange`

**Problema:**
```js
if (newProfile === 'admin') {
  await addAdmin(t.email, t.name)
  setAdmins(a => [...a, (t.email ?? '').toLowerCase()])
  // store.updateTeacher NÃO é chamado aqui
}
```

Quando um professor é promovido a admin, o campo `profile` no documento `teachers/{id}` NÃO é atualizado. O professor continua com `profile: 'teacher'` (ou qualquer que fosse). Isso não causa bug imediato (pois admin é gerenciado pela coleção `admins/`), mas gera inconsistência de dados.

**Correção:** Após `addAdmin`, também atualizar o documento do teacher para remover o profile de coordenação (definir `profile: 'teacher'`), já que admin é determinado pela coleção `admins/`:

```js
if (newProfile === 'admin') {
  await addAdmin(t.email, t.name)
  setAdmins(a => [...a, (t.email ?? '').toLowerCase()])
  // Limpar profile coordinator se o professor era coordinator/teacher-coordinator
  if (t.profile && t.profile !== 'teacher') {
    await store.updateTeacher(t.id, { profile: 'teacher' })
  }
}
```

---

### Bug 4 — `addTeacher` cria professor sem o campo `profile`

**Arquivo:** `src/store/useAppStore.js`, action `addTeacher`

**Problema:**
```js
const teacher = { id: uid(), name: name.trim(), subjectIds: opts.subjectIds ?? [],
  email: opts.email ?? '', whatsapp: '', celular: opts.celular ?? '', status: 'approved' }
// profile não está incluído no objeto
```

Professor criado pelo admin manualmente via modal não tem `profile` no documento do Firestore. A `currentProfile(t)` usa `t.profile ?? 'teacher'` para fazer fallback, o que mascara o problema, mas o campo ausente é uma inconsistência de dados.

**Correção:**
```js
const teacher = { id: uid(), name: name.trim(), subjectIds: opts.subjectIds ?? [],
  email: opts.email ?? '', whatsapp: '', celular: opts.celular ?? '', status: 'approved',
  profile: opts.profile ?? 'teacher' }
```

---

### Bug 5 — Race condition: `set()` local vs `onSnapshot` do Firestore

**Arquivos:** `src/store/useAppStore.js` + `src/lib/db.js`

**Problema:** O fluxo atual é:
1. `updateTeacher` chama `set(...)` → atualiza store local (síncrono)
2. `updateTeacher` chama `updateDocById(...)` → escrita no Firestore (async, não awaited)
3. Se `updateDocById` falha, o Firestore não é atualizado
4. O `onSnapshot` da coleção `teachers/` dispara (pode ser por outros eventos)
5. `store.setTeachers(snap.docs.map(d => d.data()))` sobrescreve o store com dados antigos do Firestore
6. A UI reverte para o estado anterior — promoção parece não ter surtido efeito

**Correção:** Garantir que `updateDocById` seja awaited em `updateTeacher` e que falhas revertam o estado local (ver Bug 2).

---

## Componentes Compartilhados

- `ProfilePillDropdown`: Dropdown de seleção de perfil. Sem mudanças necessárias no componente em si — o problema está nos handlers externos.
- `handleProfileChange`: Função em `TabTeachers`. Precisa `await store.updateTeacher(...)` e tratamento de erro adequado.

---

## Modelos de Dados

### `teachers/` (Firestore)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | uid() — coincide com o Document ID |
| `name` | string | Nome do professor |
| `email` | string | E-mail (usado como chave de busca) |
| `status` | `'approved'` | Status de aprovação |
| `profile` | `'teacher' \| 'coordinator' \| 'teacher-coordinator'` | Perfil funcional. **Obrigatório — deve ser setado na criação.** |
| `subjectIds` | string[] | Matérias do professor |
| `celular` | string | Telefone |
| `apelido` | string | Nome de exibição |
| `whatsapp` | string | Número WhatsApp |
| `horariosSemana` | object? | Horários de entrada/saída por dia |

> O perfil `admin` não é armazenado neste campo. Admins são identificados pela coleção `admins/` ou pela lista `HARDCODED_ADMINS` em `db.js`.

---

## Regras de Negócio

1. **O campo `profile` deve ser obrigatório e estar presente em todo documento `teachers/`.** Default: `'teacher'`.
2. **Promoção de perfil é feita pelo admin via `ProfilePillDropdown` na aba Professores.** Nenhum outro fluxo altera `profile` diretamente (exceto `approveTeacher` que já seta o `profile` na aprovação inicial).
3. **Mudança de perfil deve ser atômica:** o store local só deve refletir a mudança após confirmação do Firestore, OU deve reverter em caso de erro.
4. **Erro de escrita no Firestore deve ser comunicado ao usuário via toast de erro.** Nunca silenciar erros de `updateDocById` quando chamados de ações críticas de UI.
5. **`_isCoordinator()` em `useAppStore` nunca deve retornar `true` para `role === 'admin'`.** A verificação em `useAuthStore.isCoordinator()` garante isso — este invariante deve ser preservado.
6. **Promoção a admin deve manter o documento `teachers/` com `profile: 'teacher'`** (não `'admin'`), pois admin é determinado pela coleção `admins/`.

---

## Resumo das Correções

### `src/lib/db.js` — `updateDocById`

Remover o `try/catch` interno de `updateDocById` para que erros sejam propagados. Callers críticos devem ter seu próprio `try/catch`.

### `src/store/useAppStore.js` — `updateTeacher`

Adicionar `await` antes de `updateDocById`. Em caso de erro, reverter o estado local do store e relançar a exceção para o caller.

### `src/store/useAppStore.js` — `addTeacher`

Incluir `profile: opts.profile ?? 'teacher'` na criação do objeto do professor.

### `src/pages/SettingsPage.jsx` — `handleProfileChange`

- Adicionar `await` antes de `store.updateTeacher(...)`.
- Quando `newProfile === 'admin'`, adicionar chamada de `store.updateTeacher(t.id, { profile: 'teacher' })` para limpar o profile coordinator.
- Capturar erros de `updateTeacher` no `catch` existente e garantir que o toast de erro seja exibido.

---

## Fora do Escopo (v1)

- Notificação em tempo real para o professor promovido (atualização do `useAuthStore` sem necessidade de logout/login).
- Auditoria de alterações de perfil (histórico de quem promoveu quem e quando).
- Restrição de que um coordenador não possa auto-promover seu perfil.
- Migração de documentos legados sem o campo `profile` para adicionar `profile: 'teacher'` (pode ser feito via script separado).
