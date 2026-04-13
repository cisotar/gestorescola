# Spec: Redução de Requisições Firestore — Desacoplamento de Salvamentos Granulares

## Visão Geral

Eliminar escritas redundantes ao Firestore causadas pelo `debouncedSave()` que reescreve coleções inteiras mesmo quando ações granulares já foram executadas. Atualmente, criar um professor gera 5-6 writes (1 granular + 4-5 pelo debounce). O objetivo é reduzir para 1-2 writes por ação, mantendo persistência confiável e sem regressões.

**Problema resolvido:** Operações de CRUD granulares (`saveDoc`, `updateDocById`, `deleteDocById`) são anuladas pelo `saveToFirestore` chamado 2 segundos depois, que reescreve todas as coleções. Isso dobra/triplica o custo de cada ação.

---

## Stack Tecnológica

- Frontend: React 18.3.1
- Estado: Zustand 4.5.4
- Backend: Firebase Firestore + Cloud Functions (futura)
- Arquivos: `src/store/useAppStore.js`, `src/lib/db.js`

---

## Páginas e Rotas

Nenhuma página específica afetada. A otimização é de escopo global — afeta todas as páginas que persistem dados.

---

## Componentes Compartilhados

Nenhum componente afetado visualmente. Apenas lógica de persistência.

---

## Modelos de Dados

Sem alterações nos modelos. Mesmas coleções Firestore:
- `meta/config` — configuração global
- `teachers` — professores
- `schedules` — grade horária
- `absences` — ausências
- `history` — histórico de substituições

---

## Regras de Negócio

### 1. Ações granulares (CRUD) NÃO devem chamar `debouncedSave`

**Ações que já usam `saveDoc`/`updateDocById`/`deleteDocById` — não devem chamar `debouncedSave` depois:**
- `addTeacher` → `saveDoc('teachers', teacher)` — remove `debouncedSave()`
- `updateTeacher` → `updateDocById('teachers', id, changes)` — remove `debouncedSave()`
- `removeTeacher` → `deleteDocById('teachers', id)` + orphan cleanup — remove `debouncedSave()`
- `addSchedule` → `saveDoc('schedules', item)` — remove `debouncedSave()`
- `removeSchedule` / `updateSchedule` → `deleteDocById` / `updateDocById` — remove `debouncedSave()`
- `createAbsence` → `saveDoc('absences', newAbsence)` — remove `debouncedSave()`
- `assignSubstitute` / `deleteAbsenceSlot` / `clearDaySubstitutes` / `clearDayAbsences` → `updateDocById('absences', ...)` — remove `debouncedSave()`
- `addHistory` → `saveDoc('history', newEntry)` — remove `debouncedSave()`

### 2. Ações estruturais (config) MANTÊM `debouncedSave`

**Ações que modificam estrutura/config — mantêm `debouncedSave` para batch econômico:**
- `addSegment` / `removeSegment` / `setSegmentTurno` / `addGrade` / `removeGrade` / `addClassToGrade` / `removeClassFromGrade` — mudam `state.segments` → `debouncedSave()`
- `savePeriodCfg` — muda `state.periodConfigs` → `debouncedSave()`
- `addArea` / `updateArea` / `removeArea` — mudam `state.areas` → `debouncedSave()`
- `addSubject` / `removeSubject` / `saveAreaWithSubjects` — mudam `state.subjects` → `debouncedSave()`
- `setWorkload` — muda `state.workloadWarn/Danger` → `debouncedSave()`

### 3. `saveToFirestore` deve ser seletivo

Quando chamado, `saveToFirestore` deve reescrever apenas as coleções que realmente mudaram, não todas. Alternativas:
- **Opção A (simples):** Adicionar flags ao estado (`segmentsChanged`, `configChanged`, etc.) e verificar antes de `_syncCol`
- **Opção B (melhor):** Separa `saveConfig()` (só meta/config) de `saveToFirestore()` (tudo). Ações estruturais chamam `saveConfig()`, não `saveToFirestore()`

Recomendação: **Opção B** — mais limpa e separação clara de responsabilidades.

### 4. Falha de conexão — fallback via localStorage

Se `saveDoc`/`updateDocById` falhar (sem conexão), o estado local fica dessincronizado. Solução:
- `localStorage` já é usado como fallback — `_saveToLS(state)` é chamado no `save()` e no `saveToFirestore()`
- Adicionar também em `saveDoc` / `updateDocById` — ao falhar, salvar no localStorage com flag "pendente"
- Ao reconectar, sincronizar pendências

---

## Implementação Técnica

### Estratégia: Opção B (separar `saveConfig`)

**Passo 1 — Criar `saveConfig(state)` dedicada em `src/lib/db.js`**

```js
export async function saveConfig(state) {
  _saveToLS(state)
  try {
    await setDoc(doc(db, 'meta', 'config'), {
      segments: state.segments,
      periodConfigs: state.periodConfigs,
      areas: state.areas,
      subjects: state.subjects,
      sharedSeries: state.sharedSeries ?? [],
      workloadWarn: state.workloadWarn,
      workloadDanger: state.workloadDanger,
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    console.error('[db] saveConfig falhou:', e)
    throw e
  }
}
```

> Nota: essa função **já existe em db.js** (linha ~211–220). Reusar.

**Passo 2 — Ações estruturais chamam `saveConfig()` em vez de `debouncedSave()`**

Mudar em `useAppStore.js`:
- `addSegment` / `removeSegment` / `setSegmentTurno` / `addGrade` / `removeGrade` / `addClassToGrade` / `removeClassFromGrade` / `savePeriodCfg` / `addArea` / `updateArea` / `removeArea` / `addSubject` / `removeSubject` / `saveAreaWithSubjects` / `setWorkload`

Dentro de cada action:
```js
// ANTES
debouncedSave()

// DEPOIS
const state = get()
await saveConfig(state)
```

Ou, se preferir manter async fora do action, deixar `debouncedSave()` mas apontar para uma `debouncedSaveConfig` que chama `saveConfig` (não `saveToFirestore`).

**Passo 3 — Remover `debouncedSave()` de ações granulares**

Mudar em `useAppStore.js`:
- `addTeacher` — remove `debouncedSave()`, mantém `saveDoc('teachers', teacher)`
- `updateTeacher` — remove `debouncedSave()`, mantém `updateDocById('teachers', id, changes)`
- `removeTeacher` — remove `debouncedSave()`, mantém `deleteDocById`
- `addSchedule` — remove `debouncedSave()`, mantém `saveDoc('schedules', item)`
- `removeSchedule` / `updateSchedule` — remove `debouncedSave()`, mantém `deleteDocById` / `updateDocById`
- `createAbsence` — remove `debouncedSave()`, mantém `saveDoc('absences', newAbsence)`
- `assignSubstitute` / `deleteAbsenceSlot` / `clearDaySubstitutes` / `clearDayAbsences` — remove `debouncedSave()`, mantém `updateDocById('absences', ...)`
- `deleteAbsence` — remove `debouncedSave()`, mantém `deleteDocById('absences', id)`
- `addHistory` — remove `debouncedSave()`, mantém `saveDoc('history', newEntry)`
- `deleteHistory` — remove `debouncedSave()`, mantém `deleteDocById('history', id)`

---

## Fora do Escopo (v1)

- [ ] Implementar queue de sincronização offline (v+1)
- [ ] Adicionar retry automático para escritas falhadas
- [ ] Criar dashboard de análise de writes (logging)
- [ ] Otimizar listeners com `where()` queries (v+1)
- [ ] Implementar sharding para coleções gigantes
- [ ] Migrar para Cloud Firestore com regras de security
