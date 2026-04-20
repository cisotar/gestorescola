# Plano Técnico: [Absences] Operações granulares em ações de ausências e histórico

## Análise do Codebase

### Arquivo: `src/store/useAppStore.js`

**Ações a modificar (6 ao total):**

1. **`createAbsence()` (linhas 326-329)**
   - Substituir `debouncedSave()` por `saveDoc('absences', newAbsence)`
   - Buscar via: `get().absences[get().absences.length - 1]`

2. **`deleteAbsence()` (linhas 338-342)**
   - Remover `debouncedSave()` (linha 341)
   - Manter: `deleteDocById('absences', id)`

3. **`assignSubstitute()` (linhas 330-333)**
   - Substituir `debouncedSave()` por `updateDocById('absences', absenceId, { slots, status })`
   - Buscar atualizado via: `get().absences.find(a => a.id === absenceId)`

4. **`deleteAbsenceSlot()` (linhas 334-337)**
   - Substituir `debouncedSave()` por `updateDocById('absences', absenceId, { slots, status })`
   - Adicionar validação: `if (updated)`

5. **`addHistory()` (linhas 396-399)**
   - Substituir `debouncedSave()` por `saveDoc('history', newEntry)`
   - Buscar via: `get().history[get().history.length - 1]`

6. **`deleteHistory()` (linhas 400-403)**
   - Substituir `debouncedSave()` por `deleteDocById('history', id)`

---

## Cenários

### Teste 1 — Criar Ausência
1. Absences → "+ Nova Ausência"
2. Professor, datas, slots
3. Salvar
4. **Esperado:** 1 `setDoc()` para `absences/{id}`

### Teste 2 — Atribuir Substituto
1. Clicar em ausência → professor substituto
2. Salvar
3. **Esperado:** 1 `updateDoc()` para `absences/{id}` (slots + status)

### Teste 3 — Remover Slot
1. Clicar em ausência → remover slot
2. Confirmar
3. **Esperado:** 1 `updateDoc()` para `absences/{id}`

### Teste 4 — Deletar Ausência
1. Clicar em ausência → deletar
2. Confirmar
3. **Esperado:** 1 `deleteDoc()` para `absences/{id}`

### Teste 5 — Adicionar Histórico
1. Ação que gera histórico
2. Verificar em histórico
3. **Esperado:** 1 `setDoc()` para `history/{id}`

---

## Arquivos a Modificar

**`src/store/useAppStore.js`** — 6 ações

| Ação | Linhas | Alteração |
|------|--------|-----------|
| `createAbsence()` | 328 | Substituir `debouncedSave()` por `saveDoc()` |
| `deleteAbsence()` | 341 | Remover `debouncedSave()` |
| `assignSubstitute()` | 332 | Substituir `debouncedSave()` por `updateDocById()` |
| `deleteAbsenceSlot()` | 336 | Substituir `debouncedSave()` por `updateDocById()` |
| `addHistory()` | 398 | Substituir `debouncedSave()` por `saveDoc()` |
| `deleteHistory()` | 402 | Substituir `debouncedSave()` por `deleteDocById()` |

---

## Ordem de Implementação

1. `createAbsence()` → `saveDoc()`
2. `deleteAbsence()` → remover debounce
3. `assignSubstitute()` → `updateDocById()`
4. `deleteAbsenceSlot()` → `updateDocById()`
5. `addHistory()` → `saveDoc()`
6. `deleteHistory()` → `deleteDocById()`
7. Validar: `npm run dev`

---

## Diferenças Key

| Ação | Antes | Depois |
|------|-------|--------|
| `createAbsence()` | `debouncedSave()` | `saveDoc()` |
| `deleteAbsence()` | `deleteDocById()` + `debouncedSave()` | `deleteDocById()` |
| `assignSubstitute()` | `debouncedSave()` | `updateDocById()` |
| `deleteAbsenceSlot()` | `debouncedSave()` | `updateDocById()` |
| `addHistory()` | `debouncedSave()` | `saveDoc()` |
| `deleteHistory()` | `debouncedSave()` | `deleteDocById()` |

**Impacto:** 1 write por operação (antes: ~850)

---

## Notas

- Ações de batch (`deleteManySlots`, `clearDaySubstitutes`, etc.) mantêm `debouncedSave()` — fora do escopo
- Validações `if (updated)` em `deleteAbsenceSlot()` evitam erros
- Estado local sempre atualizado antes de chamar DB operations
