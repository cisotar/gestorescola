# Plano Técnico: [Teachers] Testes de validação para operações de professores

## Análise do Codebase

### Componentes de testes:
- `src/pages/SettingsPage.jsx` — TabTeachers (linhas 969-1300)
  - Modal para adicionar professor (linha 1078: `store.addTeacher()`)
  - Modal para editar professor (linha 1075: `store.updateTeacher()`)
  - Botão para deletar professor (linha 1181: `store.removeTeacher()`)
- `src/store/useAppStore.js` — Actions implementadas em #126
  - `addTeacher()` → `saveDoc()` (1 write)
  - `updateTeacher()` → `updateDocById()` (1 write)
  - `removeTeacher()` → `deleteDocById()` × N (N writes)
- `src/lib/db.js` — Funções base
  - `updateDocById()` implementado em #125

### Método de Observação:
- DevTools Network tab → requisições para `firestore.googleapis.com`
- Cada `setDoc()`, `updateDoc()`, `deleteDoc()` = 1 write Firestore
- Listeners `onSnapshot()` sincronizam (não contam como writes do usuário)

---

## Cenários

### Teste 1 — Adicionar Professor

**Passos:**
1. http://localhost:5174 → Settings → "Professores"
2. "+ Novo Professor" → Modal
3. Preencher nome, celular, matérias (opcionais)
4. "Salvar"

**Validação:**
- UI atualiza imediatamente (estado local)
- F12 → Network → **1 `setDoc()`** para `teachers/{id}`
- Antes: ~850 `setDoc()` para todas collections

**Por que funciona:**
- `addTeacher()` chama `saveDoc('teachers', teacher)` (granular)
- `debouncedSave()` foi removido em #126

---

### Teste 2 — Editar Professor

**Passos:**
1. Na mesma página, ✏️ em professor existente
2. Modal: mudar nome ou celular
3. "Salvar"

**Validação:**
- F12 → Network → **1 `updateDoc()`** para `teachers/{id}`
- Antes: ~850 `setDoc()` para todas collections

**Por que funciona:**
- `updateTeacher()` agora chama `updateDocById('teachers', id, changes)`
- Apenas campos especificados são atualizados (não sobrescreve documento)

---

### Teste 3 — Deletar Professor com Schedules

**Passos:**
1. Adicionar novo professor (Teste 1)
2. Settings → "Horários" → adicionar 2-3 horários para esse professor
3. Voltar Settings → "Professores"
4. ✕ no professor → Confirmar

**Validação:**
- F12 → Network → **3-4 operações:**
  - 1 `deleteDoc()` para `teachers/{id}`
  - 2-3 `deleteDoc()` para `schedules/{id}`
- Antes: ~850 `setDoc()`

**Por que funciona:**
- `removeTeacher()` executa:
  - `deleteDocById('teachers', id)` → 1 write
  - Loop: `deleteDocById('schedules', s.id)` → N writes
- `debouncedSave()` foi removido

---

### Teste 4 — Múltiplos Professores (Validar Remoção de Debounce)

**Passos:**
1. Settings → "Professores"
2. "+ Novo Professor" × 5 (em < 10 segundos)
3. Preencher nome diferente em cada
4. "Salvar" em cada

**Validação:**
- F12 → Network → **~5 `setDoc()` operações** (1 por professor)
- Antes: 1 `debouncedSave()` ao final com delay de 2s que sincronizava 850 docs

**Por que funciona:**
- Sem debounce, cada `addTeacher()` é granular imediatamente
- Cada `saveDoc()` é independente, não aguarda timer

---

## Tratamento de Erros

| Erro | Verificar | Solução |
|------|-----------|---------|
| Operação silenciosa | Console (F12) sem erro, mas não sincroniza | Network tab → firestore response → permissão ou quota? |
| "updateDocById is not defined" | Console | Linha 3 em `useAppStore.js`: verificar import |
| Debounce ainda ativo | Múltiplas operações após 2s | Verificar linhas 261, 265, 279 em `useAppStore.js` |
| Listener não sincroniza | UI não atualiza | Verificar `onSnapshot()` em `db.js` |

---

## Ordem de Testes

1. **Teste 1** (Adicionar) — sem dependências, mais simples
2. **Teste 2** (Editar) — valida `updateDocById()`
3. **Teste 4** (Múltiplos) — valida remoção de debounce
4. **Teste 3** (Deletar + Schedules) — mais complexo

---

## Métricas de Sucesso

| Operação | Antes | Depois | Melhoria |
|----------|-------|--------|----------|
| Adicionar professor | ~850 writes | 1 write | 850× |
| Editar professor | ~850 writes | 1 write | 850× |
| Deletar professor + 3 schedules | ~850 writes | 4 writes | ~212× |
| Adicionar 5 professores | ~850 writes (1 debounce) | ~5 writes | 170× |

**Expectativa geral:** Redução de ~100k writes/dia para ~2k writes/dia em Settings

---

## Validação

**Após testes:**
1. Documentar resultados de cada teste (quantos writes observados)
2. Comparar com "antes" (estimado ~850 writes por operação)
3. Se tudo passar → pronto para #128 (Schedules)
