# Plano Técnico: [Schedules] Operações granulares em ações de horários

## Análise do Codebase

### Arquivo: `src/store/useAppStore.js`

**Ações a modificar:**

1. **`addSchedule()` (linhas 281-286)**
   - Atual: `saveDoc('schedules', item)` + `debouncedSave()`
   - Solução: Remover `debouncedSave()` (linha 285)

2. **`removeSchedule()` (linhas 287-291)**
   - Atual: `deleteDocById('schedules', id)` + `debouncedSave()`
   - Solução: Remover `debouncedSave()` (linha 290)

3. **`updateSchedule()` (linhas 292-295)**
   - Atual: `set(state)` + `debouncedSave()`
   - Solução: Trocar `debouncedSave()` por `updateDocById('schedules', id, changes)`

**Importações:**
- ✅ `updateDocById` já importado em #126
- ✅ `saveDoc` já existe
- ✅ `deleteDocById` já existe

---

## Cenários

### Teste 1 - Adicionar Horário
1. Settings → "Horários" → "+ Novo Horário"
2. Preencher professor, matéria, dia, hora
3. Salvar
4. **Esperado:** 1 `setDoc()` para `schedules/{id}`

### Teste 2 - Editar Horário
1. Settings → "Horários" → ✏️ em horário
2. Mudar professor ou matéria
3. Salvar
4. **Esperado:** 1 `updateDoc()` para `schedules/{id}`

### Teste 3 - Deletar Horário
1. Settings → "Horários" → ✕ em horário
2. Confirmar
3. **Esperado:** 1 `deleteDoc()` para `schedules/{id}`

### Teste 4 - Múltiplos Horários
1. Adicionar 3-5 horários em < 10 segundos
2. **Esperado:** ~3-5 `setDoc()` (não 1 debounce)

---

## Arquivos a Modificar

**`src/store/useAppStore.js`**

| Linhas | Alteração |
|--------|-----------|
| 285 | Remover `debouncedSave()` de `addSchedule()` |
| 290 | Remover `debouncedSave()` de `removeSchedule()` |
| 294 | Trocar `debouncedSave()` por `updateDocById('schedules', id, changes)` |

---

## Ordem de Implementação

1. Remover `debouncedSave()` de `addSchedule()` (linha 285)
2. Remover `debouncedSave()` de `removeSchedule()` (linha 290)
3. Trocar `debouncedSave()` por `updateDocById()` em `updateSchedule()` (linha 294)
4. Validar: `npm run dev` sem erros

---

## Diferenças Key

| Ação | Antes | Depois |
|------|-------|--------|
| `addSchedule()` | `saveDoc()` + `debouncedSave()` | `saveDoc()` |
| `removeSchedule()` | `deleteDocById()` + `debouncedSave()` | `deleteDocById()` |
| `updateSchedule()` | `set()` + `debouncedSave()` | `set()` + `updateDocById()` |

**Impacto:** 1-N writes por operação (em vez de ~850)

---

## Nota

Ações de migração (`migrateMultipleSubjects`, `migrateScheduleSubject`, `removeSchedulesBySubject`) mantêm `debouncedSave()` porque modificam múltiplas coleções — fora do escopo desta issue.
