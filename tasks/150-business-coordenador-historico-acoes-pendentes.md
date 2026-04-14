title:	[Business] Coordenador: ver histórico das próprias ações submetidas
state:	OPEN
author:	cisotar
labels:	enhancement
comments:	0
assignees:	
projects:	
milestone:	
number:	150
--
## Context
Coordenadores submetem `pending_actions` mas não têm UI para acompanhar o status (pendente / aprovada / rejeitada) das suas submissões. Atualmente só o admin vê a aba "🔔 Aprovações". O coordenador fica às cegas após submeter uma ação.

## What to do
- Na `SettingsPage`, dentro da aba "👤 Meu Perfil" (única visível para coordenadores), adicionar uma seção "Minhas Solicitações" abaixo do perfil
- Buscar as `pending_actions` onde `coordinatorId === myTeacher.id` usando `getPendingActions()` filtrado por ID, ou criar nova função `getMyPendingActions(coordinatorId)`
- Exibir lista com: descrição (`summary`), data de submissão (`createdAt`), status com badge colorido (pendente=âmbar, aprovada=verde, rejeitada=vermelho)
- Se `status === 'rejected'`, exibir o `rejectionReason` abaixo da linha
- Limitar exibição às últimas 20 ações (ordenadas por `createdAt desc`)
- Permitir recarregar a lista manualmente (botão "Atualizar")

## Files affected
- `src/pages/SettingsPage.jsx` — `TabProfile`: adicionar seção "Minhas Solicitações"
- `src/lib/db.js` — adicionar `getMyPendingActions(coordinatorId)`
- `firestore.rules` — ampliar read de `pending_actions` para `isAuthenticated()`

## Acceptance criteria
- [x] Coordenador vê lista das próprias ações na aba "Meu Perfil"
- [x] Cada item exibe: descrição, data relativa, badge de status
- [x] Ação rejeitada exibe o motivo de rejeição
- [x] Lista está vazia quando não há submissões
- [x] Admin não vê a seção "Minhas Solicitações" (não é professor)
- [x] Professor comum (`profile: 'teacher'`) não vê a seção

## Notes
Depende de #142 (coleção `pending_actions`) e #146 (UI de aprovações). Requer leitura da regra Firestore atual: `allow read: if isAdmin()` — será necessário ampliar para o próprio coordenador ler suas ações. Considerar `allow read: if isAdmin() || (isAuthenticated() && resource.data.coordinatorId == request.auth.uid... )` — mas regras Firestore não suportam joins; alternativa: criar query filtrada no cliente com `where('coordinatorId', '==', id)` e ajustar rule para `allow read: if isAdmin() || isAuthenticated()`.

---

## Plano Técnico

### Análise do Codebase

**`src/lib/db.js` (linhas 449–499):**
- `submitPendingAction` salva `coordinatorId = auth.teacher?.id` (UUID do teacher, não `auth.uid`) — importante para a regra Firestore
- `getPendingActions()` filtra apenas `status == 'pending'`; não serve para o histórico do coordenador
- `timeAgo(ts)` já existe em `SettingsPage.jsx` (linha 2205) — reutilizável dentro do mesmo arquivo

**`src/pages/SettingsPage.jsx`:**
- `TabProfile` (linha 2098): recebe `{ teacher }`, já importa `useAuthStore` e `useAppStore`
- `timeAgo(ts)` (linha 2205): já definida no arquivo, disponível para o componente novo
- Importações atuais de `db.js` (linha 11): `getPendingActions`, `approvePendingAction`, etc. — adicionar `getMyPendingActions` aqui
- A seção nova vai após o `<button className="btn btn-dark">Salvar</button>` (linha 2190) e antes do `</div>` final (linha 2199)

**`firestore.rules`:**
- Linha atual: `allow read: if isAdmin()` — bloqueia coordenadores
- `coordinatorId` é UUID do teacher, não `request.auth.uid` → impossível usar `resource.data.coordinatorId == request.auth.uid`
- Solução: `allow read: if isAdmin() || isAuthenticated()` com filtragem client-side

**`src/store/useAuthStore.js`:**
- `isCoordinator()` (linha 91): retorna true para `coordinator` e `teacher-coordinator` — usar como guard da seção

### Cenários

**Caminho Feliz — Coordenador acessa Meu Perfil:**
1. Coordenador abre `/configuracoes` → vê aba "👤 Meu Perfil"
2. `TabProfile` renderiza → `isCoordinator()` true → seção "Minhas Solicitações" aparece
3. `useEffect` chama `getMyPendingActions(t.id)` → Firestore retorna até 20 docs
4. Lista exibe cada ação com `summary`, `timeAgo(createdAt)`, badge de status
5. Ação rejeitada exibe `rejectionReason` em texto menor abaixo

**Caminho Feliz — Sem submissões:**
- Lista retorna vazia → exibe "Nenhuma solicitação enviada ainda."

**Caso de Borda — Professor comum (`role: 'teacher'`):**
- `isCoordinator()` = false → seção não renderiza

**Caso de Borda — Admin:**
- `role === 'admin'` → não entra em `TabProfile` (admin vê outras abas); mesmo que chegasse, `isCoordinator()` = false

**Caso de Borda — Erro de rede ao carregar:**
- `try/catch` no `useEffect` → `setError(true)` → exibir "Erro ao carregar. Tente novamente." + botão Atualizar

**Caso de Borda — Coordenador clica "Atualizar":**
- Chama `loadActions()` novamente → atualiza lista

**Tratamento de Erros:**
- Falha no Firestore: mensagem inline "Erro ao carregar solicitações."
- Lista vazia: mensagem "Nenhuma solicitação enviada ainda."

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

**1. `src/lib/db.js`** (após linha 474, dentro do bloco Pending Actions)
```js
export async function getMyPendingActions(coordinatorId) {
  const snap = await getDocs(
    query(
      collection(db, 'pending_actions'),
      where('coordinatorId', '==', coordinatorId),
      orderBy('createdAt', 'desc'),
      limit(20)
    )
  )
  return snap.docs.map(d => d.data())
}
```
Adicionar `limit` ao import do firebase/firestore se ainda não estiver presente.

**2. `src/pages/SettingsPage.jsx`**

- Linha 11 — adicionar `getMyPendingActions` ao import de `db.js`
- Dentro de `TabProfile` (linha 2098):
  - Adicionar `const { isCoordinator } = useAuthStore()` (já importado no arquivo)
  - Adicionar estados: `const [myActions, setMyActions] = useState([])`, `const [loadingActions, setLoadingActions] = useState(false)`, `const [actionsError, setActionsError] = useState(false)`
  - Adicionar `loadActions` + `useEffect` que chama quando `isCoordinator() && t?.id`
  - Após `<button>Salvar</button>` (linha 2190), adicionar seção condicional `{isCoordinator() && <MyRequestsSection ... />}`
- Definir `MyRequestsSection` como componente inline (após `TabProfile`), antes de `function timeAgo`

**3. `firestore.rules`**
```
// Antes:
match /pending_actions/{id} {
  allow read: if isAdmin();

// Depois:
match /pending_actions/{id} {
  allow read: if isAdmin() || isAuthenticated();
```

### Arquivos que NÃO devem ser tocados
- `src/store/useAppStore.js` — `_submitApproval` não precisa de mudança
- `src/pages/SettingsPage.jsx` — `TabApprovals` e `PendingActionCard` não são tocados (são para admins)
- Qualquer outro arquivo

### Dependências Externas
- `limit` do `firebase/firestore` — verificar se já está importado em `db.js`

### Ordem de Implementação
1. **`src/lib/db.js`** — adicionar `getMyPendingActions` (base de dados para o restante)
2. **`firestore.rules`** — ampliar read + `firebase deploy --only firestore:rules`
3. **`src/pages/SettingsPage.jsx`** — adicionar import, estados, `MyRequestsSection`
