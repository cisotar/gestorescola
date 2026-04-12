# Spec: Otimização de Queries Firestore (Reduzir Quota Exhausted)

## Visão Geral
O app está esgotando o quota diário do Firestore (Free Tier: ~50k leituras/dia) devido a:
1. **Múltiplos listeners (`onSnapshot`)** ativos simultaneamente
2. **Carregamento desnecessário** de dados em cada navegação
3. **Salvamentos repetidos** mesmo sem mudança (debounce ausente)
4. **Sem cache em memória** entre requisições similares

O objetivo é **reduzir requisições em ~70%** através de:
- Consolidar listeners em uma única inicialização
- Implementar cache inteligente no Zustand
- Debounce/throttle de salvamentos
- Batch operations onde possível

---

## Stack Tecnológica
- Frontend: React 18.3.1, Zustand 4.5.4
- Backend: Firebase Firestore (Free Tier)
- Persistência: LocalStorage (fallback)
- Estratégia: Cache-first + Firestore para sync

---

## Problema Raiz

### Situação Atual
1. **`loadFromFirestore()` é chamado em cada carregamento** da página (sem verif. se dados já existem)
   - 4 `getDocs()` por load = 4 reads cada
   - Multiplos acessos por dia = quota rápido

2. **`save()` é chamado após cada ação** sem debounce
   - Criar teacher → save (1 write)
   - Add schedule → save (1 write)
   - Mesmo deletar = save (1 write)
   - Total: ~3-5 writes por ação × 50+ ações/dia = 150-250 writes

3. **Sem listeners (`onSnapshot`)** → dados ficam sincronizados apenas em reload
   - Mudanças remotas não refletem até F5
   - Força reload manual frequente

4. **LocalStorage como fallback funciona, mas sem cache strategy**
   - Sempre tenta Firestore primeiro, falha, cai no cache
   - Perda de dados offline

---

## Estratégia de Otimização

### 1. **Single Listener (Consolidado)**
Ao invés de `getDocs()` a cada load, usar **um único `onSnapshot()`** persistente:
```js
// ANTES: 4 getDocs() independentes a cada load
const [config, teachers, schedules, absences] = await Promise.all([
  getDoc(...),    // 1 read
  getDocs(...),   // 1 read
  getDocs(...),   // 1 read
  getDocs(...),   // 1 read
])

// DEPOIS: 1 listener + cache
onSnapshot(doc(db, 'meta', 'config'), (snap) => {
  store.hydrate(snap.data())
})
onSnapshot(collection(db, 'teachers'), (snap) => {
  store.setTeachers(snap.docs.map(d => d.data()))
})
// Total: 1 read inicial + updates em tempo real
```

**Benefício**: -75% de leituras (de 4 reads por load → 1 listener setup)

---

### 2. **Debounce de Salvamento**
Atrasar `save()` para aguardar 2-3 segundos sem ação antes de gravar:
```js
// ANTES: save() imediato após cada ação
addTeacher: (t) => {
  set(...)
  get().save()  // 1 write aqui
}

// DEPOIS: save() com debounce
let saveTimer = null
const debouncedSave = () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => get().save(), 2000)
}

addTeacher: (t) => {
  set(...)
  debouncedSave()  // não escreve imediatamente
}
```

**Benefício**: -60% de writes (de 200+ writes/dia → ~50)

---

### 3. **Cache Strategy (Cache-First)**
Verificar LocalStorage antes de Firestore:
```js
// ANTES: sempre tenta Firestore
async function loadFromFirestore() {
  try {
    const snap = await getDoc(...)  // 1 read mesmo se LS tem dado recente
  } catch (e) {
    return _loadFromLS()
  }
}

// DEPOIS: LS com TTL
async function loadFromFirestore() {
  const cached = _loadFromLS()
  if (cached && cached.timestamp > Date.now() - 3600000) {  // se < 1 hora
    return cached.data
  }
  try {
    const snap = await getDoc(...)  // só vai se cache expirou
  } catch (e) {
    return cached?.data || FALLBACK
  }
}
```

**Benefício**: -50% de reads em múltiplos acessos (f5, múltiplas abas)

---

### 4. **Batch Writes**
Agrupar múltiplas escritas em um único `writeBatch()`:
```js
// ANTES: cada ação = 1 write
await updateDoc(doc(db, 'teachers', t.id), ...)  // 1 write
await setDoc(doc(db, 'schedules', s.id), ...)    // 1 write
await updateDoc(doc(db, 'absences', a.id), ...)  // 1 write

// DEPOIS: 1 batch = 1 write
const batch = writeBatch(db)
batch.update(doc(db, 'teachers', t.id), ...)
batch.set(doc(db, 'schedules', s.id), ...)
batch.update(doc(db, 'absences', a.id), ...)
await batch.commit()  // 3 operations = 3 writes (não 9)
```

**Nota**: já há batching em `saveToFirestore()`, falta consolidar ações pequenas

**Benefício**: -40% de writes em operações multi-documento

---

### 5. **Lazy Load de Collections Grandes**
Carregar teachers/schedules apenas quando necessário:
```js
// ANTES: teachers carregado sempre
loadFromFirestore() {
  const teachers = await _loadCol('teachers')  // 1 read
}

// DEPOIS: load on-demand
loadTeachersIfNeeded: async () => {
  if (get().teachers.length > 0) return  // já carregou
  const teachers = await _loadCol('teachers')
  set({ teachers })
}

// uso: componentes chamam loadTeachersIfNeeded() quando precisam
```

**Benefício**: -30% de reads (se usuário não acessa seção de teachers, não carrega)

---

## Arquivos a Modificar

### 1. `src/lib/db.js`
- Adicionar `setupRealtimeListeners()` que retorna unsubscribe functions
- Implementar cache com timestamp em LS
- Mover `loadFromFirestore()` → `loadInitial()` (carrega LS + listeners)

### 2. `src/store/useAppStore.js`
- Adicionar `saveTimer` (debounce)
- Substituir `save()` por `save()` + `debouncedSave()`
- Adicionar `loadTeachersIfNeeded()`, `loadSchedulesIfNeeded()`, etc.

### 3. `src/main.jsx` ou `src/App.jsx`
- Chamar `setupRealtimeListeners()` na inicialização
- Retornar função unsubscribe no cleanup

### 4. `src/pages/*.jsx` (optativo)
- Chamar `loadTeachersIfNeeded()` quando componente precisar

---

## Métricas de Sucesso

| Métrica | Antes | Depois | Redução |
|---------|-------|--------|---------|
| Reads/load | 4 | 1 + listener | -75% |
| Writes/ação | 1 | 0.2 (debounced) | -80% |
| Leituras/dia | ~50k | ~15k | -70% |
| Escritas/dia | ~200 | ~80 | -60% |
| **Total requisições/dia** | **~250** | **~95** | **-62%** |

---

## Implementação (Ordem)

1. **Fase 1** (Crítica): Debounce + Cache
   - Implementar debounce em `save()`
   - LS com TTL
   - Redução imediata de ~40%

2. **Fase 2** (Alta): Single Listener
   - `setupRealtimeListeners()` em `db.js`
   - Substituir `getDocs()` por `onSnapshot()`
   - Redução de ~30% adicional

3. **Fase 3** (Média): Lazy Load
   - Adicionar `loadTeachersIfNeeded()` etc
   - Chamar sob demanda
   - Redução de ~10-15% adicional

---

## Fora do Escopo (v1)
- Implementar IndexedDB (complexo, LS suficiente por enquanto)
- Compressão de dados
- Pagination de collections grandes
- Replicação local com biblioteca sync (FireSync, Watermelon)
- Upgrade para Firebase Blaze (pay-as-you-go)

---

## Notas Técnicas

- **LS Cache TTL**: Usar 1 hora (3600s) como padrão
- **Debounce Delay**: 2-3 segundos é ideal (não demora, agrupa ações)
- **Listeners**: Não limpar listeners desnecessariamente (não rescrever `onSnapshot` a cada render)
- **Error Handling**: Fallback sempre para LS cache se Firestore falhar
