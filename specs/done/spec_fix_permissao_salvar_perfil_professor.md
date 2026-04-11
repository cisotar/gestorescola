# Spec: Fix — Professor não consegue salvar matérias no próprio perfil

## Contexto

Quando um professor acessa **Meu Perfil** e tenta associar uma matéria (ou alterar celular), ao salvar aparece o erro:

```
[db] Falha ao salvar: FirebaseError: Missing or insufficient permissions.
Sync falhou, salvo localmente: FirebaseError: Missing or insufficient permissions.
```

## Causa Raiz

O fluxo atual ao salvar em `TabProfile`:

```
store.updateTeacher(id, { celular, subjectIds })
  └─ get().save()
       └─ saveToFirestore(state)
            ├─ batch.set(meta/config, ...)   ← ❌ professor não tem permissão
            ├─ _syncCol('teachers',  ...)    ← batch.set (escreve todos os campos)
            ├─ _syncCol('schedules', ...)    ← condicional
            ├─ _syncCol('absences',  ...)    ← ❌ professor não tem permissão
            └─ _syncCol('history',   ...)    ← ❌ professor não tem permissão
```

A regra do Firestore para `teachers/{docId}` permite que professor faça `update` do próprio doc **apenas** nos campos `['celular', 'whatsapp', 'subjectIds']`. Mas `_syncCol` usa `batch.set` (reescreve o doc inteiro, incluindo `name`, `id`, `status`), e também tenta gravar em coleções que professor não pode tocar (`meta`, `absences`, `history`).

## Solução

Criar um caminho de escrita exclusivo para professores que:
1. **Usa `updateDoc`** (não `setDoc`) — só envia os campos que mudaram
2. **Não aciona `saveToFirestore`** — não tenta escrever em `meta`, `absences` ou `history`

### 1. Nova função em `src/lib/db.js`

```js
// Atualização parcial do próprio perfil — usada apenas por professores
export async function patchTeacherSelf(id, changes) {
  await updateDoc(doc(db, 'teachers', id), changes)
}
```

`updateDoc` só envia os campos especificados. A regra do Firestore verifica `diff(resource.data).affectedKeys().hasOnly(['celular', 'whatsapp', 'subjectIds'])` — com `updateDoc({ celular, subjectIds })` isso é satisfeito. ✅

### 2. Nova action em `src/store/useAppStore.js`

```js
// Atualiza local + persiste apenas o doc do professor (sem saveToFirestore)
updateTeacherProfile: async (id, changes) => {
  set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t) }))
  await patchTeacherSelf(id, changes)
},
```

Não chama `get().save()` — portanto não aciona `saveToFirestore`.

### 3. Substituição em `src/pages/SettingsPage.jsx` — `TabProfile`

Substituir todas as chamadas de `store.updateTeacher(t.id, ...)` por `store.updateTeacherProfile(t.id, ...)` dentro de `TabProfile.save()`. A função é `async` — os handlers já são `async` ou chamados sem await (aceitável).

Há 3 pontos de chamada em `TabProfile`:
```js
// antes (3 ocorrências)
store.updateTeacher(t.id, { celular, subjectIds: selSubjs })

// depois
store.updateTeacherProfile(t.id, { celular, subjectIds: selSubjs })
```

### 4. Import em `useAppStore.js`

Adicionar `patchTeacherSelf` ao import de `'../lib/db'`.

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/lib/db.js` | Nova função `patchTeacherSelf(id, changes)` usando `updateDoc` |
| `src/store/useAppStore.js` | Nova action `updateTeacherProfile(id, changes)` + import de `patchTeacherSelf` |
| `src/pages/SettingsPage.jsx` | `TabProfile`: 3× `store.updateTeacher` → `store.updateTeacherProfile` |

`TabTeachers` (onde admin edita professores) continua usando `store.updateTeacher` + `saveToFirestore` normalmente — sem alteração.

---

## O que NÃO muda

- Regras do Firestore (`firestore.rules`) — já estão corretas; o problema era no código cliente
- `store.updateTeacher` — continua existindo para uso pelo admin
- Fluxo de aprovação de pendentes — inalterado

---

---

## Plano Técnico

### Análise do Codebase

- `src/lib/db.js:3` — `updateDoc` já está importado de `'firebase/firestore'`. Nenhum import novo necessário neste arquivo.
- `src/lib/db.js:153-155` — padrão de `patchTeacherSelf` já existe em `updatePendingPhone`: `updateDoc(doc(db, 'pending_teachers', uid), { celular })`. Basta replicar para a coleção `teachers`.
- `src/store/useAppStore.js:3` — import atual: `{ saveToFirestore, saveDoc, deleteDocById, _saveToLS }`. Adicionar `patchTeacherSelf` aqui.
- `src/store/useAppStore.js:217-220` — `updateTeacher` chama `get().save()` → `saveToFirestore`. A nova action `updateTeacherProfile` terá a mesma atualização local mas chamará `patchTeacherSelf` diretamente.
- `src/pages/SettingsPage.jsx:1397,1403,1412` — as 3 chamadas `store.updateTeacher(t.id, { celular, subjectIds: selSubjs })` estão **exclusivamente em `TabProfile`** (busca confirmada: `TabTeachers` usa `store.updateTeacher(editId, form)` com `editId`, não `t.id`, e deve permanecer intocada).

### Cenários

**Caminho Feliz:**
1. Professor acessa Meu Perfil → seleciona matéria(s) / altera celular → clica Salvar
2. `save()` em `TabProfile` chama `store.updateTeacherProfile(t.id, { celular, subjectIds })`
3. Store local é atualizado imediatamente
4. `patchTeacherSelf` chama `updateDoc(doc(db, 'teachers', id), { celular, subjectIds })` — apenas esses 2 campos vão ao Firestore
5. Regra do Firestore valida: email bate + campos alterados são subset de `['celular', 'whatsapp', 'subjectIds']` ✅
6. Dado persiste; sem erros no console

**Casos de Borda:**
- Professor com conflito de matérias (via `SubjectChangeModal`): os handlers `onMigrate` e `onRemove` também chamam `store.updateTeacher` → precisam virar `store.updateTeacherProfile` (linhas 1397 e 1403)
- `patchTeacherSelf` falha (offline / regra bloqueou): o store local já foi atualizado, dado fica desincronizado até próximo reload. Comportamento idêntico ao fluxo atual — sem regressão
- Admin editando professor via `TabTeachers`: usa `store.updateTeacher` (linhas 529, 535, 544 com `editId`) — não é alterado, continua com `saveToFirestore`

**Tratamento de Erros:**
- Sem try/catch explícito em `updateTeacherProfile` — erro propagará para o caller. `TabProfile.save()` não tem try/catch hoje, comportamento mantido. Pode-se adicionar `console.warn` no store se necessário.

### Schema de Banco de Dados
Não aplicável — sem mudanças no schema. Apenas o caminho de escrita muda (de `set` completo para `updateDoc` parcial).

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

- `src/lib/db.js` — adicionar ao final da seção de professores (após `listPendingTeachers`, ~linha 160):
  ```js
  export async function patchTeacherSelf(id, changes) {
    await updateDoc(doc(db, 'teachers', id), changes)
  }
  ```

- `src/store/useAppStore.js`
  - Linha 3: adicionar `patchTeacherSelf` ao import de `'../lib/db'`
  - Após `updateTeacher` (~linha 220): adicionar action `updateTeacherProfile`

- `src/pages/SettingsPage.jsx` — 3 substituições em `TabProfile` (linhas 1397, 1403, 1412):
  - `store.updateTeacher(t.id, { celular, subjectIds: selSubjs })` → `store.updateTeacherProfile(t.id, { celular, subjectIds: selSubjs })`

### Arquivos que NÃO devem ser tocados
- `src/pages/SettingsPage.jsx` linhas 529, 535, 544 (`TabTeachers`) — admin escreve como admin, usa `saveToFirestore` corretamente
- `firestore.rules` — regras já estão corretas

### Dependências Externas
Nenhuma nova — `updateDoc` de `firebase/firestore` já está importado em `db.js`.

### Ordem de Implementação
1. `db.js` — adicionar `patchTeacherSelf` (base para o store)
2. `useAppStore.js` — adicionar import + action `updateTeacherProfile`
3. `SettingsPage.jsx` — substituir as 3 chamadas em `TabProfile`

---

## Verificação Manual

- [ ] Professor acessa Meu Perfil → seleciona uma matéria → salva → sem erros no console
- [ ] Dado persiste após reload (confirmado no Firestore)
- [ ] Admin editando professor via `TabTeachers` continua funcionando normalmente
- [ ] Professor não consegue salvar campos não permitidos (`name`, `status`) — regra do Firestore bloqueia no servidor
