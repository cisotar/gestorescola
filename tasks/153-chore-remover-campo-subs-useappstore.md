title:	[Chore] Remover campo `subs` morto do useAppStore
state:	OPEN
author:	cisotar
labels:	enhancement
comments:	0
assignees:	
projects:	
milestone:	
number:	153
--
## Context
O campo `subs: {}` existe no estado inicial de `useAppStore` e é persistido no `localStorage` mas não é utilizado por nenhuma funcionalidade do sistema. Está documentado como código morto em `references/architecture.md`.

## What to do
- Em `useAppStore.js`: remover `subs: {}` do estado inicial
- Em `src/lib/db.js`:
  - `_saveToLS`: remover `subs` da destructuring e `subs: subs ?? {}` do objeto serializado
  - `_loadFromLS`: sem mudança necessária (campo simplesmente deixa de existir)
  - `saveToFirestore`: campo não está no batch — sem alteração
- Buscar por `subs` em todo o codebase e remover referências órfãs
- Verificar que nenhuma página ou componente depende de `store.subs`

## Files affected
- `src/store/useAppStore.js` — remover do estado inicial e de qualquer acesso
- `src/lib/db.js` — remover de `_saveToLS`

## Acceptance criteria
- [ ] `store.subs` não existe mais no estado do Zustand
- [ ] `localStorage` não persiste mais o campo `subs`
- [ ] Nenhuma referência a `store.subs` no codebase
- [ ] App inicializa normalmente sem o campo

## Notes
Mudança de baixo risco. Não afeta dados do Firestore (campo nunca foi salvo lá). O cache localStorage antigo com `subs` simplesmente será ignorado na próxima carga.

---

## Plano Técnico

### Análise do Codebase

Grep completo de `\bsubs\b` no projeto revelou:

- `src/store/useAppStore.js:53` — `subs: {}` no estado inicial → **remover**
- `src/lib/db.js:423` — `subs` na destructuring de `_saveToLS` → **remover**
- `src/lib/db.js:428` — `subs: subs ?? {}` no objeto JSON → **remover**
- `src/lib/db.js` (saveToFirestore, linhas 159-180) — **não contém `subs`** ✓
- `src/pages/DashboardPage.jsx:13` — `const subs = absences...` — variável local (substituições), **sem relação com `store.subs`** ✓
- `src/pages/WorkloadPage.jsx:16` — `const subs = absences...` — idem ✓
- `src/pages/SettingsPage.jsx:414+` — `const subs = store.subjects.filter(...)` — local var de subjects, **sem relação** ✓
- `src/pages/HomePage.jsx:19` — `mySubs` — local var ✓
- `references/architecture.md:353` — menção de débito técnico (será removida em #154)

**Conclusão:** exatamente 3 linhas a alterar, em 2 arquivos.

### Cenários

**Caminho Feliz:**
1. Dev remove as 3 linhas
2. App inicia normalmente — `useAppStore` não tem mais `subs`
3. `_saveToLS` salva localStorage sem o campo `subs`
4. Cache antigo no localStorage do usuário ainda tem `subs`, mas `_loadFromLS` retorna o JSON como está — o campo extra é ignorado pelo `hydrate()` que só lê campos conhecidos

**Casos de Borda:**
- Usuário com cache localStorage antigo (que tem `subs`): o campo extra no JSON simplesmente não é lido por nenhum código → sem efeito colateral
- Nenhum componente acessa `store.subs` — confirmado pelo grep

**Tratamento de Erros:**
- Nenhum — é remoção de código morto, sem I/O envolvido

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

**1. `src/store/useAppStore.js`** — linha 53: remover linha inteira
```js
// Antes:
  subs:          {},

// Depois: linha removida
```

**2. `src/lib/db.js`** — função `_saveToLS` (linhas 422-428):
```js
// Antes:
const { segments, periodConfigs, areas, subjects, teachers,
        schedules, subs, absences, history, sharedSeries, workloadWarn, workloadDanger } = state
localStorage.setItem(LS_KEY, JSON.stringify({
  data: {
    segments, periodConfigs, areas, subjects, teachers,
    sharedSeries: sharedSeries ?? [],
    schedules, subs: subs ?? {}, absences: absences ?? [],
    history: history ?? [], workloadWarn, workloadDanger,
  },

// Depois:
const { segments, periodConfigs, areas, subjects, teachers,
        schedules, absences, history, sharedSeries, workloadWarn, workloadDanger } = state
localStorage.setItem(LS_KEY, JSON.stringify({
  data: {
    segments, periodConfigs, areas, subjects, teachers,
    sharedSeries: sharedSeries ?? [],
    schedules, absences: absences ?? [],
    history: history ?? [], workloadWarn, workloadDanger,
  },
```

### Arquivos que NÃO devem ser tocados
- `src/pages/DashboardPage.jsx` — usa variável local `subs`, sem relação
- `src/pages/WorkloadPage.jsx` — idem
- `src/pages/SettingsPage.jsx` — idem
- `src/pages/HomePage.jsx` — idem
- `references/architecture.md` — atualização coberta pela #154
- Qualquer outro arquivo

### Dependências Externas
Nenhuma.

### Ordem de Implementação

1. **`src/store/useAppStore.js`** — remover linha 53
2. **`src/lib/db.js`** — atualizar `_saveToLS` (2 sub-itens na mesma função)
