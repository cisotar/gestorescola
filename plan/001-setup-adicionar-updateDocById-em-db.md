# Plano Técnico: [Setup] Adicionar função updateDocById() em db.js

## Análise do Codebase

### O que já existe em `src/lib/db.js`:

1. **Importações Firebase** (linha 2-5):
   ```javascript
   import {
     doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
     collection, writeBatch, serverTimestamp, query, where, onSnapshot,
   } from 'firebase/firestore'
   ```
   - ✅ `updateDoc` já está importado! (não precisa adicionar)

2. **Funções de CRUD básicas** (linhas 191-208):
   - `saveDoc(colName, item)` — usa `setDoc()` para criar/substituir
   - `deleteDocById(colName, id)` — usa `deleteDoc()` para deletar
   - `saveConfig(state)` — função específica para `meta/config`

3. **Padrão de error handling** (linhas 191-197):
   ```javascript
   export async function saveDoc(colName, item) {
     try { await setDoc(doc(db, colName, item.id), item) } catch (e) { console.error(e) }
   }
   ```
   - Segue try-catch com console.error
   - Async com await
   - Sem throw (falha silenciosa, mas logada)

### Onde adicionar a nova função:

**Localização:** Entre `deleteDocById()` (linha 195-197) e `saveConfig()` (linha 199-208)

**Por quê:** Segue a ordem lógica — Create → Delete → **Update** → Special (saveConfig)

---

## Cenários

### Caminho Feliz (Happy Path)

1. **Em `useAppStore.js` action `updateTeacher()`:**
   ```javascript
   updateTeacher: (id, changes) => {
     set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t) }))
     updateDocById('teachers', id, { celular: '98765-4321', apelido: 'João' })
     // Aguarda (async, mas não há await no caller)
   }
   ```

2. **No Firestore:**
   - Documento `teachers/{id}` recebe update parcial
   - Apenas campos `celular` e `apelido` são sobrescritos
   - Outros campos (nome, email, subjectIds) permanecem intactos

3. **Esperado:**
   - Função resolve sem erro
   - Console log (erro) aparece apenas se Firestore falhar
   - Estado local (Zustand) já foi atualizado via `set()`

### Casos de Borda

**Caso 1: Collection não existe**
- Firestore cria collection automaticamente ao primeiro update
- Comportamento: ✅ OK (Firebase auto-cria)

**Caso 2: Documento não existe**
- `updateDoc()` falha com erro "No document to update"
- Comportamento: ❌ Erro capturado e logado, usuário não vê nada
- Mitigação: OK (caso raro — documento foi deletado remotamente enquanto usuário editava)

**Caso 3: Campo não existe no documento**
- `updateDoc()` cria o campo automaticamente
- Comportamento: ✅ OK (Firebase auto-cria)

**Caso 4: Conexão offline**
- Promise never resolves, fala silenciosamente (sem throw)
- Comportamento: ✅ OK (listeners `onSnapshot()` sincronizam quando volta online)

**Caso 5: Changes é objeto vazio `{}`**
- `updateDoc(doc, {})` é no-op (rápido, sem erro)
- Comportamento: ✅ OK

### Tratamento de Erros

| Erro | Captura? | Log? | Impacto |
|------|----------|------|---------|
| Documento não existe | Sim (try-catch) | console.error | Estado local OK, Firestore fora de sync (raro) |
| Permissão negada | Sim | console.error | Usuário não vê erro, estado local OK |
| Offline | Não capturado | — | Promise pende, resync automático via listener |
| JSON serialization (objeto cíclico) | Não | — | Erro do JS antes de chamar Firebase |

---

## Implementação

### Função a Adicionar

**Localização:** `src/lib/db.js`, linha 198 (entre `deleteDocById` e `saveConfig`)

**Código:**
```javascript
export async function updateDocById(colName, id, changes) {
  try { 
    await updateDoc(doc(db, colName, id), changes) 
  } catch (e) { 
    console.error(e) 
  }
}
```

**Documentação comentada (opcional, mas recomendado):**
```javascript
// ─── Atualização Granular ──────────────────────────────────────────────────
// Atualiza apenas campos específicos de um documento (não sobrescreve o inteiro)
// Usar em ações de UI: editar professor, horário, ausência, etc.
// Retorna: Promise que resolve mesmo se offline (resync via listener)
export async function updateDocById(colName, id, changes) {
  try { 
    await updateDoc(doc(db, colName, id), changes) 
  } catch (e) { 
    console.error(e) 
  }
}
```

---

## Arquivos a Modificar

### `src/lib/db.js`

| Linhas | Alteração | Tipo |
|--------|-----------|------|
| 1-5 | Importações | Nenhuma (updateDoc já está importado) |
| 198 | Inserir nova função | Novo |

**Diff (simplificado):**
```diff
export async function deleteDocById(colName, id) {
  try { await deleteDoc(doc(db, colName, id)) } catch (e) { console.error(e) }
}

+// ─── Atualização Granular ─────────────────────────────────────────────────────
+// Atualiza apenas campos específicos de um documento (não sobrescreve o inteiro)
+export async function updateDocById(colName, id, changes) {
+  try { 
+    await updateDoc(doc(db, colName, id), changes) 
+  } catch (e) { 
+    console.error(e) 
+  }
+}
+
export async function saveConfig(state) {
  try {
    await setDoc(doc(db, 'meta', 'config'), {
```

---

## Arquivos que NÃO devem ser tocados

- `src/store/useAppStore.js` — A importação e uso virão em #126
- `src/lib/firebase.js` — Nenhuma mudança necessária
- `package.json` — Nenhuma dependência nova

---

## Dependências Externas

**Nenhuma!** Todas as dependências já estão presentes:

- ✅ Firebase `updateDoc` — já importado em `db.js` (linha 3)
- ✅ Zustand — não depende de Zustand nesta função
- ✅ React — não é usada aqui

---

## Ordem de Implementação

1. **Abrir arquivo** `src/lib/db.js`
2. **Verificar importação** `updateDoc` está presente (linha 3) ✅
3. **Inserir função** após `deleteDocById()` (linha 198)
4. **Salvar arquivo**
5. **Rodar dev** `npm run dev` e validar sem erros
6. **Verificar console** F12 → Console → sem erros de "updateDocById is not defined"

---

## Diferença: updateDoc vs setDoc

| Método | Comportamento | Uso |
|--------|--|--|
| `setDoc(doc, data)` | **Sobrescreve tudo** — se não passar um campo, ele é deletado | Criar novo doc ou substituir inteiro |
| `updateDoc(doc, data)` | **Atualiza parcial** — só modifica campos listados, resto fica intacto | Editar apenas alguns campos |

**Exemplo:**
```javascript
// setDoc: perda de dados!
doc original: { id: '123', name: 'João', celular: '98765', email: 'joao@test.com' }
setDoc(doc, { celular: '11111' })
resultado: { id: '123', celular: '11111' }  ❌ name e email desapareceram!

// updateDoc: seguro
doc original: { id: '123', name: 'João', celular: '98765', email: 'joao@test.com' }
updateDoc(doc, { celular: '11111' })
resultado: { id: '123', name: 'João', celular: '11111', email: 'joao@test.com' }  ✅ tudo preservado!
```

---

## Riscos e Decisões Técnicas

| Risco | Mitigação |
|-------|-----------|
| **Offline:** documento não existe no servidor | OK — listeners sincronizam quando volta; erro será ignorado |
| **Concorrência:** dois admins editam professor ao mesmo tempo | OK — Firestore usa last-write-wins (padrão); listeners propagam |
| **Documentação:** função não documentada** | ✅ Adicionar comentário explicativo acima |

---

## Validação

**Após implementação:**

```bash
# 1. Verificar sintaxe
npm run dev
# Deve compilar sem erros

# 2. Validar export
grep -n "export async function updateDocById" src/lib/db.js
# Deve encontrar a função

# 3. Validar importação em useAppStore (próxima issue)
# será: import { ..., updateDocById } from '../lib/db'
```

---

## Resumo

✅ **Mudança trivial:** 1 função de 4 linhas  
✅ **Sem dependências:** imports já existem  
✅ **Sem riscos:** segue padrão existente (try-catch, console.error)  
✅ **Pronto para próximas issues:** #126, #128, #129 dependem disso  

**Status:** Pronto para executar com `/execute tasks/001-setup-adicionar-updateDocById-em-db.md`
