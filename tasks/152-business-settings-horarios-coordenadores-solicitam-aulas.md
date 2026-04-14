title:	[Business] Settings/Horários: coordenadores podem solicitar aulas via SettingsPage
state:	OPEN
author:	cisotar
labels:	enhancement
comments:	0
assignees:	
projects:	
milestone:	
number:	152
--
## Context
O store tem guard para `addSchedule` e `removeSchedule` que submete `pending_action` quando o usuário é coordinator. Porém a aba "🗓 Horários" só aparece para `isAdmin = role === 'admin'`. Coordenadores não têm nenhum caminho de UI para solicitar inclusão ou remoção de aulas — o guard do store nunca é acionado na prática.

## What to do
- Avaliar se coordenadores devem ver a aba "🗓 Horários" completa ou uma aba simplificada "📋 Minhas Aulas"
- **Opção recomendada (menor esforço):** exibir a aba "🗓 Horários" para coordenadores também, mas com escopo restrito ao próprio professor do coordenador:
  - `ScheduleGridModal` exibe apenas a grade do coordenador logado (não o seletor de professor)
  - Botão "Adicionar aula" abre `AddScheduleModal` com `teacher = myTeacher`
  - O store já intercepta a chamada via `_isCoordinator()` → `_submitApproval`
  - Toast confirma que a solicitação foi enviada para aprovação
- Adicionar "🗓 Minhas Aulas" como aba extra no array de tabs do coordenador (separado de ADMIN_TABS)
- Em `SettingsPage`, o render de tabs deve checar `isAdmin || isCoordinator()` para montar o conjunto correto de abas

## Files affected
- `src/pages/SettingsPage.jsx` — tabs visíveis para coordinator; ScheduleGridModal com escopo restrito

## Acceptance criteria
- [x] Coordenador vê uma aba de horários na SettingsPage
- [x] A aba mostra a grade do próprio coordenador (não permite selecionar outro professor)
- [x] Botão "Adicionar aula" está visível e abre o AddScheduleModal
- [x] Ao salvar, o store submete como `pending_action` e exibe toast de confirmação
- [x] Admin continua vendo a aba "🗓 Horários" completa com todos os professores
- [x] Professor comum não vê aba de horários na SettingsPage

## Notes
Depende de #145 (guards do store), #149 (restrição a turmas compartilhadas para coordinator). `AddScheduleModal` já filtra turmas para `profile: 'coordinator'` — comportamento correto sem mudanças adicionais.

---

## Plano Técnico

### Análise do Codebase

**`src/store/useAppStore.js` (linhas 322–338):**
- `addSchedule` e `removeSchedule` já têm guard `_isCoordinator()` → `_submitApproval` com toast de confirmação
- Nenhuma mudança necessária no store — o comportamento correto já existe

**`src/pages/SettingsPage.jsx`:**
- `ADMIN_TABS` (linha 25): array com 8 abas somente para admin; renderizado em `isAdmin ? ADMIN_TABS.map(...) : <button>👤 Meu Perfil</button>`
- `initialTab` (linha 36): `if (!isAdmin) return 'profile'` — coordinator cai no else
- `ScheduleGrid` (linha 1575): componente completo que recebe `teacher` e `store`; já chama `addSchedule`/`removeSchedule` do store — nenhuma mudança necessária
- `TabSchedules` (linha 1482): mostra seletor de todos os professores — NÃO usar para coordenadores
- `ScheduleGridModal` (linha 1566): wrapper modal de `ScheduleGrid` — já usado em `TabProfile` (linha 2222); sem mudanças necessárias

**Padrão de reutilização:**
- Criar `TabMySchedules`: renderiza diretamente `<ScheduleGrid teacher={myTeacher} store={store} />` sem seletor de professor
- O `ScheduleGrid` existente já tem o botão ＋ que abre `AddScheduleModal` e chama `addSchedule` — o store guard intercepta para coordinators automaticamente

### Cenários

**Caminho Feliz — Coordenador adiciona aula:**
1. Coordenador abre `/configuracoes` → vê abas "👤 Meu Perfil" e "🗓 Minhas Aulas"
2. Clica em "🗓 Minhas Aulas" → `TabMySchedules` renderiza grade do próprio perfil
3. Clica ＋ em um slot → `AddScheduleModal` abre com `teacher = myTeacher`
4. Seleciona turma e disciplina → clica Salvar → `addSchedule(sched)` chama store
5. Store detecta `_isCoordinator()` → `_submitApproval('addSchedule', ...)` → toast "Solicitação enviada para aprovação do ADM"
6. Grade não atualiza (slot não foi adicionado de fato) — comportamento esperado

**Caminho Feliz — Coordenador remove aula:**
1. Coordenador vê grade com aulas cadastradas → hover sobre célula → botão ✕ aparece
2. Clica ✕ → `removeSchedule(id)` → store detecta coordinator → `_submitApproval('removeSchedule', ...)`
3. Toast de confirmação. Aula permanece na grade até aprovação admin.

**Caso de Borda — Coordenador sem perfil de teacher (`myTeacher = null`):**
- `TabMySchedules` exibe: "Perfil de professor não encontrado."

**Caso de Borda — Admin:**
- `isAdmin = true` → renderiza `ADMIN_TABS` normalmente; não vê `COORDINATOR_TABS`

**Caso de Borda — Professor comum (`role: 'teacher'`):**
- `isAdmin = false`, `isCoordinator() = false` → renderiza apenas "👤 Meu Perfil" (comportamento atual)

**Tratamento de Erros:**
- Se `submitPendingAction` falhar: store já captura o erro e exibe toast "Erro ao enviar solicitação" (comportamento existente)

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

**`src/pages/SettingsPage.jsx`** — 5 pontos de mudança:

**1. Linha 15 — adicionar `isCoordinator` ao destructuring:**
```js
// Antes:
const { role, user, teacher: myTeacher } = useAuthStore()
// Depois:
const { role, user, teacher: myTeacher, isCoordinator } = useAuthStore()
```

**2. Após linha 34 (ADMIN_TABS) — adicionar COORDINATOR_TABS:**
```js
const COORDINATOR_TABS = [
  { id: 'profile',      label: '👤 Meu Perfil' },
  { id: 'my-schedules', label: '🗓 Minhas Aulas' },
]
```

**3. Linha 52 — heading:**
```js
// Antes:
{isAdmin ? 'Configurações' : 'Meu Perfil'}
// Depois:
{isAdmin ? 'Configurações' : isCoordinator() ? 'Meu Perfil' : 'Meu Perfil'}
// (sem mudança de texto, mas estrutura pronta para extensão futura — pode deixar como está)
```

**4. Linhas 57–68 — render de tabs:**
```jsx
// Antes:
{isAdmin
  ? ADMIN_TABS.map(t => (...))
  : <button className={tabClass('profile')} ...>👤 Meu Perfil</button>}

// Depois:
{isAdmin
  ? ADMIN_TABS.map(t => (...))
  : isCoordinator()
    ? COORDINATOR_TABS.map(t => (
        <button key={t.id} className={tabClass(t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
      ))
    : <button className={tabClass('profile')} onClick={() => setTab('profile')}>👤 Meu Perfil</button>}
```

**5. Linha 79 (após `tab === 'profile'`) — adicionar render da nova aba:**
```jsx
{tab === 'my-schedules' && <TabMySchedules />}
```

**6. Após `TabSchedules` (linha 1562) — adicionar `TabMySchedules`:**
```jsx
function TabMySchedules() {
  const store = useAppStore()
  const { teacher: myTeacher } = useAuthStore()
  if (!myTeacher) return <p className="text-sm text-t3">Perfil de professor não encontrado.</p>
  return (
    <div>
      <p className="text-sm text-t2 mb-4">
        Clique em <strong>＋</strong> para solicitar inclusão de aula.
        Clique em <strong>✕</strong> para solicitar remoção.
        As solicitações são enviadas para aprovação do administrador.
      </p>
      <ScheduleGrid teacher={myTeacher} store={store} />
    </div>
  )
}
```

### Arquivos que NÃO devem ser tocados
- `src/store/useAppStore.js` — guards já implementados
- `src/pages/SettingsPage.jsx` — `ScheduleGrid`, `AddScheduleModal`, `TabSchedules`, `ScheduleGridModal` não são tocados
- `firestore.rules` — sem mudança de regras (schedules já tem `allow write: if isAdmin()` + regras de professor; o coordinator submete via pending_action, não escreve diretamente)

### Dependências Externas
Nenhuma.

### Ordem de Implementação
1. **`src/pages/SettingsPage.jsx`** — todos os 6 pontos de mudança em sequência:
   a. Adicionar `isCoordinator` ao destructuring (linha 15)
   b. Adicionar `COORDINATOR_TABS` após `ADMIN_TABS` (linha 34)
   c. Atualizar render de tabs (linhas 57–68)
   d. Adicionar render `tab === 'my-schedules'` (linha 79)
   e. Adicionar componente `TabMySchedules` (após linha 1562)
