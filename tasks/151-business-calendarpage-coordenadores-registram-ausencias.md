title:	[Business] CalendarPage: coordenadores podem registrar ausências
state:	OPEN
author:	cisotar
labels:	enhancement
comments:	0
assignees:	
projects:	
milestone:	
number:	151
--
## Context
`CalendarPage` é acessível a coordenadores (`canAccessAdmin` em `App.jsx`) mas todos os botões de gestão de ausências verificam `isAdmin = role === 'admin'`. Coordenadores conseguem apenas visualizar o calendário — não podem marcar faltas nem atribuir substitutos, o que torna a página inútil para eles na prática.

## What to do
- Em `CalendarPage` e `CalendarDayPage`, adicionar `canManage = isAdmin || isCoordinator()` e substituir `isAdmin` nos gates de UI e no prop passado para `DayModal`
- Ampliar regra Firestore de `absences` de `isAdmin()` para `isAuthenticated()` e reimplantar

## Files affected
- `src/pages/CalendarPage.jsx` — adicionar `canManage`, substituir 1 gate direto + prop para DayModal
- `src/pages/CalendarDayPage.jsx` — adicionar `canManage`, substituir 5 gates diretos
- `firestore.rules` — `absences` write de `isAdmin()` para `isAuthenticated()`

## Acceptance criteria
- [ ] Coordenador abre CalendarPage e vê os botões de "Marcar falta" e "Atribuir substituto"
- [ ] Coordenador consegue marcar um slot como ausente (persiste no Firestore)
- [ ] Coordenador consegue atribuir substituto a um slot
- [ ] Admin continua funcionando normalmente (sem regressão)
- [ ] Professor comum (`role: 'teacher'`) não vê os botões de gestão

## Notes
Depende de #144 (routing de coordenadores). `AbsencesPage` também usa `isAdmin` para operações de escrita (deletar slot, seleção em lote) mas está **fora do escopo desta issue** — tratar em issue separada se necessário.

---

## Plano Técnico

### Análise do Codebase

**`src/pages/CalendarPage.jsx`:**
- Linha 437: `const { role } = useAuthStore()` — apenas `role` é desestruturado
- Linha 438: `const isAdmin = role === 'admin'`
- Gates de UI que bloqueiam coordenadores (dentro de `DayModal`, componente definido na linha 216):
  - Linha 295: barra de ações rápidas (Marcar dia inteiro, Aceitar sugestões)
  - Linha 326: botões de toggle de regra de substituição
  - Linha 376: `SubPicker` para ausência já com substituto
  - Linha 385: `SubPicker` para ausência sem substituto
  - Linha 404: botões "Marcar falta" / "Desfazer"
- Linha 613: `{isAdmin && <RangeAbsenceBar .../>}` — gate direto na página
- Linha 629: `isAdmin={isAdmin}` — prop passado para `DayModal`; os gates 295/326/376/385/404 estão DENTRO de `DayModal` e usam o parâmetro recebido

**`src/pages/CalendarDayPage.jsx`:**
- Linha 176: `const { role } = useAuthStore()`
- Linha 177: `const isAdmin = role === 'admin'`
- Gates de UI diretos (sem prop passing):
  - Linha 347: barra de ações rápidas
  - Linha 368: botões de toggle de regra
  - Linha 420: `SubPicker` com substituto
  - Linha 430: `SubPicker` sem substituto
  - Linha 449: botões "Marcar falta" / "Desfazer"

**`firestore.rules`:**
- Linha atual: `match /absences/{doc} { allow read: if true; allow write: if isAdmin(); }`
- `isCoordinator()` foi removida das regras (teachers usam UUID como ID, não emailKey)
- Solução pragmática: `allow write: if isAuthenticated()` — apenas usuários logados escrevem; a UI já restringe a admins e coordenadores

**`useAppStore.createAbsence` (linha 371):** sem guard de coordinator — chama `saveDoc('absences', ...)` diretamente. Correto para esta feature (coordenadores escrevem diretamente, sem pending_action).

### Cenários

**Caminho Feliz — Coordinator marca falta:**
1. Coordinator acessa `/calendar`
2. Seleciona professor na sidebar, navega para a semana
3. Clica num dia → `DayModal` abre com botões visíveis (`canManage = true`)
4. Clica "Marcar falta" em um slot → `store.createAbsence()` → `saveDoc('absences', ...)` → Firestore aceita (`isAuthenticated()` = true)
5. Slot atualiza visualmente como ausente

**Caminho Feliz — Coordinator atribui substituto:**
1. Com ausência marcada, coordinator vê `SubPicker` no slot
2. Seleciona substituto → `store.assignSubstitute()` → `updateDocById('absences', ...)` → Firestore aceita
3. Slot mostra nome do substituto

**Caso de Borda — Teacher (`role: 'teacher'`) tenta acessar CalendarPage:**
- `canManage = false` → botões não renderizados
- Não tem acesso visual às ações de gestão

**Caso de Borda — Coordinator tenta escrever ausência diretamente via console:**
- Firestore rule `isAuthenticated()` permite (trade-off de segurança aceitável para este sistema)

**Caso de Borda — CalendarDayPage no mobile:**
- Mesma lógica: `canManage` substitui `isAdmin` nas 5 ocorrências

**Tratamento de Erros:**
- Se Firestore rejeitar (regras antigas ainda em cache): `saveDoc` captura o erro com `console.error` mas não faz toast — comportamento existente, sem mudança

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

**1. `src/pages/CalendarPage.jsx`**

Linha 437 — adicionar `isCoordinator` na desestruturação:
```js
// Antes:
const { role } = useAuthStore()
const isAdmin = role === 'admin'

// Depois:
const { role, isCoordinator } = useAuthStore()
const isAdmin    = role === 'admin'
const canManage  = isAdmin || isCoordinator()
```

Linha 613 — gate da `RangeAbsenceBar`:
```js
// Antes:
{isAdmin && <RangeAbsenceBar teacher={teacher} dates={dates} store={store} />}

// Depois:
{canManage && <RangeAbsenceBar teacher={teacher} dates={dates} store={store} />}
```

Linha 629 — prop para `DayModal` (os 5 gates internos seguem automaticamente):
```js
// Antes:
store={store} isAdmin={isAdmin}

// Depois:
store={store} isAdmin={canManage}
```

**2. `src/pages/CalendarDayPage.jsx`**

Linha 176 — adicionar `isCoordinator`:
```js
// Antes:
const { role } = useAuthStore()
const isAdmin = role === 'admin'

// Depois:
const { role, isCoordinator } = useAuthStore()
const isAdmin   = role === 'admin'
const canManage = isAdmin || isCoordinator()
```

Linhas 347, 368, 420, 430, 449 — substituir `isAdmin` por `canManage`:
```js
// Antes (5 ocorrências):
{isAdmin && ...}
isAdmin && ...

// Depois:
{canManage && ...}
canManage && ...
```

**3. `firestore.rules`**

```
// Antes:
match /absences/{doc} { allow read: if true; allow write: if isAdmin(); }

// Depois:
match /absences/{doc} { allow read: if true; allow write: if isAuthenticated(); }
```

### Arquivos que NÃO devem ser tocados
- `src/pages/AbsencesPage.jsx` — usa `isAdmin` para operações de escrita; escopo desta issue é apenas CalendarPage
- `src/store/useAppStore.js` — `createAbsence` e `assignSubstitute` não precisam de guard
- Qualquer outro arquivo

### Dependências Externas
Nenhuma.

### Ordem de Implementação
1. **`src/pages/CalendarPage.jsx`** — adicionar `canManage` (3 linhas: declaração + RangeAbsenceBar + prop DayModal)
2. **`src/pages/CalendarDayPage.jsx`** — adicionar `canManage` e substituir 5 gates
3. **`firestore.rules`** — ampliar write de absences
4. **`firebase deploy --only firestore:rules`** — implantação obrigatória para o Firestore aceitar os writes
