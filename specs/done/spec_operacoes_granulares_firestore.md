# Spec: Operações Granulares no Firestore (Fase 4)

## Visão Geral

Atualmente, o aplicativo sincroniza o **estado completo** da aplicação a cada 2 segundos (debounce) quando há alterações. Isso significa que ao adicionar um professor, o sistema grava ~850 documentos (todos os teachers, schedules, absences, history). 

Esta spec implementa **operações granulares**: cada ação (criar, editar, deletar) grava **apenas os documentos modificados**, não o estado inteiro. Resultado: **redução de ~40-50% das escritas** ao Firebase.

**Problema:** `saveToFirestore()` usa `_syncCol()` que faz `batch.set()` para **todos** os documentos de cada coleção, mesmo que não tenham mudado.

**Solução:** Usar `saveDoc()` e `deleteDocById()` para operações individuais, mantendo `saveToFirestore()` apenas para sincronização completa (ex: login, mudança de segmento global).

---

## Stack Tecnológica

- **Frontend**: React 18.3.1, Zustand 4.5.4
- **Backend**: Firebase Firestore (Free Tier)
- **Persistência**: LocalStorage (fallback) + Firestore
- **Estratégia**: Operações granulares + debounce + cache TTL

---

## Arquivos Afetados

### `src/lib/db.js`
**Funções existentes (usar diretamente):**
- `saveDoc(colName, item)` — salva 1 documento (já existe)
- `deleteDocById(colName, id)` — deleta 1 documento (já existe)
- `saveConfig(state)` — salva apenas `meta/config` (já existe)

**Função a criar:**
- `updateDoc(colName, id, changes)` — atualiza apenas campos específicos (novo)

### `src/store/useAppStore.js`
**Ações a modificar (usar saveDoc/deleteDocById direto):**
- `addTeacher()` → usar `saveDoc('teachers', teacher)` em vez de `debouncedSave()`
- `removeTeacher()` → usar `deleteDocById()` para cada schedule + `deleteDocById('teachers', id)`
- `addSchedule()` → usar `saveDoc('schedules', item)` (já faz, mas garantir)
- `removeSchedule()` → usar `deleteDocById('schedules', id)` (já faz, mas garantir)
- `addArea()` → continuar com `debouncedSave()` (faz sentido, altera config global)
- `addSubject()` → continuar com `debouncedSave()` (faz sentido, altera config global)
- `addSharedSeries()` → continuar com `debouncedSave()` (faz sentido, altera config)
- Criar absences/history → usar `saveDoc()` direto (não debounce)
- Deletar absences/history → usar `deleteDocById()` direto (não debounce)

**Mantém com debouncedSave():**
- Ações que modificam `meta/config`: `addSegment`, `removeSegment`, `addArea`, `removeArea`, `addSubject`, `removeSubject`, `savePeriodCfg`, etc.
- Lógica: config é centralizada, vale a pena debounce

---

## Categorização de Ações

### ✅ Conversão: Operação Granular (Imediata, sem debounce)

Ações que afetam **1 documento** ou **coleções independentes**:

1. **Teachers**
   - `addTeacher(name, opts)` → `saveDoc('teachers', teacher)` ✅
   - `removeTeacher(id)` → `deleteDocById('teachers', id)` + loop de `deleteDocById('schedules', s.id)` ✅
   - `updateTeacher(id, changes)` → criar `updateDocById('teachers', id, changes)` ✅

2. **Schedules**
   - `addSchedule(sched)` → `saveDoc('schedules', item)` ✅ (já faz)
   - `removeSchedule(id)` → `deleteDocById('schedules', id)` ✅ (já faz)
   - `updateSchedule(id, changes)` → `updateDocById('schedules', id, changes)` ✅

3. **Absences**
   - `createAbsence(teacherId, rawSlots)` → `saveDoc('absences', absence)` ✅
   - `deleteAbsence(id)` → `deleteDocById('absences', id)` ✅ (já faz)
   - `assignSubstitute()` → `updateDocById('absences', absenceId, {slots})` ✅
   - `deleteAbsenceSlot()` → `updateDocById('absences', absenceId, {slots})` ✅

4. **History**
   - `addHistory(entry)` → `saveDoc('history', entry)` ✅
   - `deleteHistory(id)` → `deleteDocById('history', id)` ✅

### ⏸️ Mantém Debounce: Operação Centralizada

Ações que afetam **meta/config** (compartilhado, vale debounce):

1. **Segments, Grades, Classes**
   - `addSegment()` → `debouncedSave()` (altera segments em config)
   - `removeSegment()` → `debouncedSave()`
   - `addGrade()` → `debouncedSave()`
   - etc.

2. **Areas & Subjects**
   - `addArea()` → `debouncedSave()`
   - `removeArea()` → `debouncedSave()`
   - `addSubject()` → `debouncedSave()`
   - `removeSubject()` → `debouncedSave()`
   - `saveAreaWithSubjects()` → `debouncedSave()`

3. **SharedSeries & Periods**
   - `addSharedSeries()` → `debouncedSave()`
   - `updateSharedSeries()` → `debouncedSave()`
   - `removeSharedSeries()` → `debouncedSave()`
   - `savePeriodCfg()` → `debouncedSave()`

**Lógica:** Todas afetam `meta/config`, que é pequeno (~10KB). Vale agrupar com debounce.

---

## Implementação Detalhada

### 1. Nova Função em `db.js`

```javascript
export async function updateDocById(colName, id, changes) {
  try { 
    await updateDoc(doc(db, colName, id), changes) 
  } catch (e) { 
    console.error(e) 
  }
}
```

**Por que `updateDoc` em vez de `setDoc`?**
- `setDoc()` sobrescreve o documento inteiro (mais caro se houver dados grandes)
- `updateDoc()` atualiza apenas os campos alterados (mais eficiente)

---

### 2. Modificações em `useAppStore.js`

#### 2.1 Teachers

**Antes:**
```javascript
addTeacher: (name, opts = {}) => {
  const teacher = { id: uid(), name: name.trim(), subjectIds: opts.subjectIds ?? [], ... }
  set(s => ({ teachers: [...s.teachers, teacher] }))
  saveDoc('teachers', teacher)  // ✅ já está correto
  debouncedSave()  // ❌ REMOVE ISSO
}
```

**Depois:**
```javascript
addTeacher: (name, opts = {}) => {
  const teacher = { id: uid(), name: name.trim(), subjectIds: opts.subjectIds ?? [], ... }
  set(s => ({ teachers: [...s.teachers, teacher] }))
  saveDoc('teachers', teacher)  // já salva o professor
  // ❌ Remover debouncedSave() daqui
}
```

**removeTeacher:**
```javascript
removeTeacher: (id) => {
  const schedulesToDelete = get().schedules.filter(x => x.teacherId === id)
  set(s => ({
    teachers:  s.teachers.filter(t => t.id !== id),
    schedules: s.schedules.filter(x => x.teacherId !== id),
  }))
  deleteDocById('teachers', id)  // Firestore: deleta professor
  schedulesToDelete.forEach(s => deleteDocById('schedules', s.id))  // Firestore: deleta cada schedule
  // ❌ Remover debouncedSave() daqui
}
```

**updateTeacher:**
```javascript
updateTeacher: (id, changes) => {
  set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t) }))
  updateDocById('teachers', id, changes)  // ✅ Novo: atualiza só os campos
  // ❌ Remover debouncedSave() daqui
}
```

#### 2.2 Schedules

**addSchedule:** Já está correto com `saveDoc()`, remover `debouncedSave()`

```javascript
addSchedule: (sched) => {
  const item = { id: uid(), ...sched }
  set(s => ({ schedules: [...s.schedules, item] }))
  saveDoc('schedules', item)
  // ❌ Remover debouncedSave()
}
```

**removeSchedule:** Já está correto com `deleteDocById()`, remover `debouncedSave()`

```javascript
removeSchedule: (id) => {
  set(s => ({ schedules: s.schedules.filter(x => x.id !== id) }))
  deleteDocById('schedules', id)
  // ❌ Remover debouncedSave()
}
```

**updateSchedule:** Trocar para `updateDocById()`

```javascript
updateSchedule: (id, changes) => {
  set(s => ({ schedules: s.schedules.map(x => x.id === id ? { ...x, ...changes } : x) }))
  updateDocById('schedules', id, changes)  // ✅ Em vez de debouncedSave()
}
```

#### 2.3 Absences & History

**Todas essas ações**: usar `saveDoc()` ou `deleteDocById()` ou `updateDocById()`, remover `debouncedSave()`

```javascript
createAbsence: (teacherId, rawSlots) => {
  set(s => ({ absences: _createAbsence(teacherId, rawSlots, s.absences) }))
  // ✅ Adicionar: const newAbsence = s.absences.find(...); saveDoc('absences', newAbsence)
  // ❌ Remover debouncedSave()
}

deleteAbsence: (id) => {
  set(s => ({ absences: _deleteAbsence(id, s.absences) }))
  deleteDocById('absences', id)
  // ❌ Remover debouncedSave()
}

assignSubstitute: (absenceId, slotId, substituteId) => {
  set(s => ({ absences: _assignSubstitute(absenceId, slotId, substituteId, s.absences) }))
  const updated = get().absences.find(a => a.id === absenceId)
  updateDocById('absences', absenceId, { slots: updated.slots, status: updated.status })
  // ❌ Remover debouncedSave()
}

addHistory: (entry) => {
  set(s => ({ history: [...s.history, { id: uid(), ...entry, registeredAt: new Date().toISOString() }] }))
  const newEntry = get().history[get().history.length - 1]
  saveDoc('history', newEntry)
  // ❌ Remover debouncedSave()
}

deleteHistory: (id) => {
  set(s => ({ history: s.history.filter(h => h.id !== id) }))
  deleteDocById('history', id)
  // ❌ Remover debouncedSave()
}
```

---

### 3. Ações que MANTÊM `debouncedSave()`

Todas as ações que modificam `segments`, `areas`, `subjects`, `periodConfigs`, `sharedSeries`:

```javascript
addSegment: (name, turno = 'manha') => {
  const seg = { id: uid(), name: name.trim(), turno, grades: [] }
  set(s => ({
    segments: [...s.segments, seg],
    periodConfigs: { ...s.periodConfigs, [seg.id]: { [turno]: defaultCfg(turno) } },
  }))
  debouncedSave()  // ✅ MANTÉM ISSO
}

removeArea: (id) => {
  set(s => {
    const removedSubjIds = new Set(s.subjects.filter(x => x.areaId === id).map(x => x.id))
    return {
      areas:    s.areas.filter(a => a.id !== id),
      subjects: s.subjects.filter(x => x.areaId !== id),
      teachers: s.teachers.map(t => ({ ...t, subjectIds: (t.subjectIds ?? []).filter(sid => !removedSubjIds.has(sid)) })),
    }
  })
  debouncedSave()  // ✅ MANTÉM ISSO
}

// ... todas as outras ações de config
```

---

## Migração de Dados (Lógica)

### Problema: Operações Multi-documento

Algumas ações afetam múltiplas coleções (ex: `removeTeacher` afeta teachers + schedules):

```javascript
removeTeacher: (id) => {
  const schedulesToDelete = get().schedules.filter(x => x.teacherId === id)
  
  // Estado local (imediato)
  set(s => ({
    teachers:  s.teachers.filter(t => t.id !== id),
    schedules: s.schedules.filter(x => x.teacherId !== id),
  }))
  
  // Firestore (granular)
  deleteDocById('teachers', id)  // 1 write
  schedulesToDelete.forEach(s => deleteDocById('schedules', s.id))  // N writes
  
  // Total: N+1 writes (eficiente!)
}
```

**Vantagem:** Operações paralelas. Firestore executa cada delete concorrentemente.

---

## Testes de Validação

### Teste 1: Adicionar Professor
- **Antes**: 1 ação → 1 `saveToFirestore()` → 850 writes
- **Depois**: 1 ação → 1 `saveDoc('teachers')` → 1 write
- **Redução**: 99% ✅

### Teste 2: Editar Período (config)
- **Antes**: 1 ação → `debouncedSave()` → 2s depois → 850 writes
- **Depois**: 1 ação → `debouncedSave()` → 2s depois → 850 writes
- **Redução**: 0% (esperado, pois altera config centralizada) ✅

### Teste 3: Deletar 10 Horários em sequência
- **Antes**: 10 ações → 10 `debouncedSave()` → agrupa em 1 → 850 writes
- **Depois**: 10 ações → 10 `deleteDocById()` → 10 writes paralelos
- **Redução**: 98% ✅

### Teste 4: Criar Ausência + Atribuir Substituto
- **Antes**: 2 ações → 2 `debouncedSave()` → 1.700 writes
- **Depois**: 2 ações → 2 `saveDoc/updateDocById()` → 2 writes
- **Redução**: 99% ✅

---

## Métricas de Sucesso

| Operação | Antes | Depois | Redução |
|----------|-------|--------|---------|
| Adicionar professor | 850 writes | 1 write | **-99.9%** |
| Remover professor (+ 10 schedules) | 850 writes | 11 writes | **-98.7%** |
| Atualizar professor | 850 writes | 1 write | **-99.9%** |
| Criar/deletar schedule | 850 writes | 1 write | **-99.9%** |
| Criar/deletar ausência | 850 writes | 1 write | **-99.9%** |
| Adicionar disciplina | 850 writes | 850 writes | **0%** (config) |
| **Média por ação** | **~500 writes** | **~10 writes** | **-98%** |

**Impacto Cumulativo:**
- Antes: ~200 ações/dia × 500 writes = **100k writes/dia**
- Depois: ~200 ações/dia × 10 writes = **2k writes/dia**
- **Redução Total: -98%** (antes tinha limite de 50k free tier)

---

## Riscos e Mitigações

### Risco 1: Inconsistência entre estado local e Firestore
**Problema:** Se `saveDoc()` falhar, estado local fica diferente do Firestore.
**Mitigação:** 
- Listeners `onSnapshot()` ja existentes (commit 363057f) sincronizam automaticamente
- LocalStorage serve como fallback
- Error logs em console

### Risco 2: Operações simultâneas em diferentes clientes
**Problema:** Dois admins editam schedule ao mesmo tempo.
**Mitigação:** 
- Firestore valida conflitos (last-write-wins)
- Listeners propagam mudanças automaticamente
- OK para este use case (escolar, poucos usuários simultâneos)

### Risco 3: Debounce de config pode causar perda de dados
**Problema:** Usuario edita período 2x em < 2s, segunda edição sobrescreve primeira.
**Mitigação:**
- Aumentar debounce para 3-5s (conferir com UX)
- Usar `updateDoc()` em vez de `setDoc()` para config
- OK porque mudanças de config são raras

---

## Fora do Escopo (v1)

- ❌ Implementar IndexedDB (LocalStorage suficiente)
- ❌ Compressão de dados
- ❌ Pagination de collections
- ❌ Replicação local com Firebase Realtime Sync
- ❌ Upgrade para Firebase Blaze (talvez desnecessário após otimizações)

---

## Próximas Etapas

1. **Implementar `updateDocById()` em `db.js`**
2. **Modificar ações de professores, horários, ausências, histórico**
3. **Testar cada ação em dev (F12 → Network → Firestore calls)**
4. **Medir quota: antes vs depois**
5. **Deploy e monitorar por 1-2 dias**

---

## Referências

- Spec anterior: `specs/spec_otimizacao_firestore.md`
- Commits anteriores:
  - `bf4d2ab` - Debounce (2000ms)
  - `5d82c0d` - Cache TTL
  - `363057f` - Real-time listeners
  - `3fc946c` - Lazy loading
