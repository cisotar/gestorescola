# Spec: Permissões de Escrita Completas para o Professor

## Visão Geral

O professor deve ter privilégio de escrita irrestrito sobre **todos os seus próprios dados** — nome (recebido da conta Google), telefone, apelido, email, matérias e horários — sem precisar de autorização de nenhum administrador para inserir, editar ou remover esses dados.

Hoje existem três falhas que bloqueiam esse privilégio:

1. **`teachers/{docId}` — regra Firestore restritiva demais.** A regra atual usa `hasOnly(['celular', 'whatsapp', 'subjectIds'])`, o que rejeita qualquer `update` que inclua campos como `apelido` ou `name`. Como o `patchTeacherSelf` envia `{ celular, apelido, subjectIds }` — incluindo `apelido` — a regra bloqueia no servidor.

2. **`teachers/{docId}` — nome não é editável pelo professor.** A UI mostra o nome como `(não editável)` e o `TabProfile` nunca envia `name` nas atualizações. Mas o spec diz que o professor deve poder atualizar o nome recebido do Google caso queira corrigi-lo.

3. **`schedules/{docId}` — `addSchedule` e `removeSchedule` passam pelo guard do coordenador.** Qualquer action que chama `_isCoordinator()` e retorna um `_submitApproval` antes de executar pode bloquear um professor com `role === 'teacher-coordinator'` que deveria ter escrita direta nos próprios horários. O `role` `teacher` não tem esse problema, mas o `teacher-coordinator` usa o mesmo `TabProfile` e pode cair no guard.

---

## Stack Tecnológica

- Frontend: React 18 + Zustand
- Backend: Firebase Firestore 10.14.1
- Auth: Firebase Google Auth (email via `request.auth.token.email`)
- Regras: `firestore.rules` (deploy via `firebase deploy --only firestore:rules`)

---

## Páginas e Rotas

### Meu Perfil — `/settings` (tab `profile`)

**Descrição:** Página onde o professor autenticado visualiza e edita seus dados pessoais e suas matérias. Acessível por `role === 'teacher'` e `role === 'teacher-coordinator'`.

**Componentes:**
- `TabProfile`: formulário com nome, telefone, apelido, matérias e botão salvar
- `SubjectSelector`: seletor de matérias por segmento/área
- `SubjectChangeModal`: modal de confirmação quando troca de matéria afeta horários cadastrados
- `ScheduleGridModal`: visualização da grade horária do próprio professor

**Behaviors:**
- [ ] Editar nome: professor altera o campo nome (pré-preenchido com `displayName` do Google) e salva; campo `name` é atualizado no Firestore via `patchTeacherSelf`
- [ ] Editar telefone: professor altera o campo celular e salva; campo `celular` é atualizado no Firestore
- [ ] Editar apelido: professor altera o apelido e salva; campo `apelido` é atualizado no Firestore
- [ ] Editar email: campo email é exibido como somente leitura (vem da conta Google e é usado para autenticação — não pode ser alterado)
- [ ] Editar matérias: professor seleciona/deseleciona matérias e salva; campo `subjectIds` é atualizado no Firestore
- [ ] Salvar sem conflito: `updateTeacherProfile(id, { name, celular, apelido, subjectIds })` persiste direto via `patchTeacherSelf` — sem passar por `saveToFirestore`
- [ ] Salvar com conflito de matérias: `SubjectChangeModal` aparece; ao confirmar migração ou remoção, chama `updateTeacherProfile` com todos os campos
- [ ] Sucesso: toast `'Perfil salvo'` aparece após escrita bem-sucedida
- [ ] Falha de permissão: erro no console + toast de erro; sem crash da UI

---

### Minha Grade Horária — `/settings` (tab `my-schedules`)

**Descrição:** Aba de grade horária disponível para coordenadores-professores. Exibe a grade e permite inserir/remover aulas diretamente, sem passar por fluxo de aprovação, quando o `role` for `teacher-coordinator` atuando nos próprios slots.

**Componentes:**
- `TabMySchedules`: wrapper que passa `myTeacher` para `ScheduleGrid`
- `ScheduleGrid`: grid interativo com botões `+` (add) e `✕` (remove)
- `AddScheduleModal`: modal de seleção de turma ao adicionar aula

**Behaviors:**
- [ ] Adicionar aula: professor clica `+` na célula → `AddScheduleModal` → confirma → `addSchedule(sched)` grava direto em `schedules/{id}` sem submeter para aprovação
- [ ] Remover aula: professor clica `✕` na célula → `removeSchedule(id)` deleta direto em `schedules/{id}` sem submeter para aprovação
- [ ] Sucesso ao adicionar: toast `'Aula adicionada'` aparece
- [ ] Bloqueio de slot ocupado: célula com `🔒` não exibe botão `+` — comportamento mantido

---

### Grade Horária na PendingPage — `/pending`

**Descrição:** Professor pendente (aguardando aprovação) preenche dados e grade horária. Usa `user.uid` como `teacherId` temporário.

**Behaviors:**
- [ ] Preencher telefone + matérias: `updatePendingData(user.uid, { celular, apelido, subjectIds })` grava em `pending_teachers/{uid}`
- [ ] Adicionar aula: `addSchedule({ teacherId: user.uid, ... })` cria doc em `schedules/{id}` — permitido pela regra `create: request.resource.data.teacherId == request.auth.uid`
- [ ] Remover aula: `removeSchedule(id)` deleta o doc — permitido pela regra `delete: resource.data.teacherId == request.auth.uid`

---

## Componentes Compartilhados

- `ScheduleGrid` (`SettingsPage.jsx`): grid reutilizado em `TabMySchedules`, `TabProfile` (via modal) e `PendingPage`. Chama `addSchedule` / `removeSchedule` do store diretamente.
- `SubjectChangeModal` (`SettingsPage.jsx`): confirmação de impacto ao trocar matérias; usado em `TabProfile` e `TabTeachers`.

---

## Modelos de Dados

### `teachers/{id}`

```js
{
  id:         string,   // uid() — Document ID
  name:       string,   // editável pelo próprio professor
  email:      string,   // lowercase; usado como chave de identidade — não editável
  celular:    string,   // editável pelo professor
  whatsapp:   string,   // editável pelo professor
  apelido:    string,   // editável pelo professor
  subjectIds: string[], // editável pelo professor
  status:     string,   // 'approved' — editável apenas pelo admin
  profile:    string,   // 'teacher' | 'coordinator' | 'teacher-coordinator' — editável apenas pelo admin
}
```

**Campos que o professor pode editar:** `name`, `celular`, `whatsapp`, `apelido`, `subjectIds`
**Campos que apenas o admin pode editar:** `status`, `profile`, `id`, `email`

### `schedules/{id}`

```js
{
  id:        string,  // uid()
  teacherId: string,  // teacher.id (ou user.uid para pendentes)
  day:       string,  // 'Segunda' | 'Terça' | 'Quarta' | 'Quinta' | 'Sexta'
  timeSlot:  string,  // '{segId}|{turno}|{aulaIdx}'
  turma:     string,
  subjectId: string,
}
```

O professor tem privilégio total de criar, atualizar e deletar docs onde `teacherId` corresponde ao seu `teacher.id` ou ao seu `user.uid`.

---

## Regras de Negócio

1. **Professor edita apenas seus próprios dados.** A correspondência de identidade é feita por email (`resource.data.email.lower() == request.auth.token.email.lower()`) para o doc de `teachers`, e por `teacherId` para `schedules`.

2. **Email não é editável.** O campo `email` do doc `teachers` é a chave de identidade usada nas regras Firestore e não pode ser alterado pelo professor — qualquer tentativa de incluir `email` nas `affectedKeys` deve ser bloqueada pela regra do servidor.

3. **Nome é editável.** Embora venha do Google no momento da criação (via `approveTeacher`), o professor pode corrigir o próprio nome. O campo `name` deve constar na lista de campos permitidos na regra Firestore.

4. **Horários: escrita direta, sem aprovação.** `addSchedule`, `removeSchedule` e `updateSchedule` para o próprio `teacherId` não passam pelo fluxo `_submitApproval`. O guard `_isCoordinator()` não deve bloquear o professor quando ele está editando os próprios dados — apenas quando está tentando agir sobre dados de terceiros (segmentos, áreas, outros professores).

5. **`saveToFirestore` nunca é chamado por professores.** A função `save()` no store, que dispara `saveToFirestore` (gravando `meta/config`, `absences`, `history`), deve ser protegida por `role === 'admin'`. Professores usam apenas operações granulares: `patchTeacherSelf`, `saveDoc`, `deleteDocById`, `updateDocById`.

6. **`teacher-coordinator` tem as mesmas permissões de escrita que `teacher` nos próprios dados.** O `role === 'teacher-coordinator'` não é admin, não passa por `_submitApproval` para editar os próprios horários/perfil.

---

## Diagnóstico Técnico

### Falha 1 — Regra Firestore rejeita `apelido`

**Arquivo:** `firestore.rules`, linha 16-17
**Estado atual:**
```
&& request.resource.data.diff(resource.data).affectedKeys()
    .hasOnly(['celular', 'whatsapp', 'subjectIds']);
```
**Problema:** `patchTeacherSelf(id, { celular, apelido, subjectIds })` envia `apelido`, que não está na lista. A regra rejeita a escrita com `PERMISSION_DENIED`.

**Fix:** Adicionar `'apelido'` e `'name'` à lista de campos permitidos:
```
.hasOnly(['celular', 'whatsapp', 'apelido', 'name', 'subjectIds']);
```

### Falha 2 — Campo `name` não aparece na UI nem no payload de salvamento

**Arquivo:** `src/pages/SettingsPage.jsx`, função `TabProfile`
**Estado atual:** O nome é exibido apenas como texto (`t.name`) e não há `<input>` para edição. A chamada `store.updateTeacherProfile(t.id, { celular, apelido, subjectIds })` não inclui `name`.

**Fix:**
- Adicionar estado `const [nome, setNome] = useState(t?.name ?? '')`
- Adicionar `<input>` para o campo nome (com label "Nome (como você prefere ser identificado)")
- Incluir `name: nome.trim()` no payload de `updateTeacherProfile`

### Falha 3 — Guard de coordenador pode bloquear `addSchedule`/`removeSchedule` do professor

**Arquivo:** `src/store/useAppStore.js`, ações `addSchedule`, `removeSchedule`, `updateSchedule`
**Estado atual:**
```js
addSchedule: async (sched) => {
  if (_isCoordinator()) return _submitApproval('addSchedule', ...)
  ...
}
```
**Problema:** `_isCoordinator()` retorna `true` para `role === 'teacher-coordinator'`. Quando esse professor edita a própria grade via `TabProfile` ou `PendingPage`, a action submete para aprovação em vez de salvar.

**Fix:** O guard deve checar não apenas o role, mas também se o `teacherId` do schedule pertence ao próprio professor. Para isso, a lógica correta é: só redirecionar para aprovação se `_isCoordinator()` **E** o `teacherId` não corresponde ao próprio professor.

```js
addSchedule: async (sched) => {
  const myTeacher = useAuthStore.getState().teacher
  const isOwnSchedule = myTeacher && sched.teacherId === myTeacher.id
  if (_isCoordinator() && !isOwnSchedule) return _submitApproval('addSchedule', ...)
  ...
}
```

O mesmo padrão se aplica a `removeSchedule` e `updateSchedule`.

---

## Behaviors Consolidados

- [ ] Editar nome: professor digita novo nome → salva → `name` atualizado no Firestore via `updateDoc` (sem `PERMISSION_DENIED`)
- [ ] Editar telefone: professor edita celular → salva → `celular` atualizado no Firestore
- [ ] Editar apelido: professor edita apelido → salva → `apelido` atualizado no Firestore (sem `PERMISSION_DENIED`)
- [ ] Editar matérias: professor altera `subjectIds` → salva → atualizado no Firestore
- [ ] Email é somente leitura: campo email não tem `<input>`, não é enviado no payload
- [ ] Adicionar aula (teacher): `addSchedule` grava direto em Firestore, sem fluxo de aprovação
- [ ] Remover aula (teacher): `removeSchedule` deleta direto no Firestore, sem fluxo de aprovação
- [ ] Adicionar aula (teacher-coordinator) nos próprios horários: `addSchedule` identifica `isOwnSchedule === true` → grava direto, sem aprovação
- [ ] Remover aula (teacher-coordinator) nos próprios horários: `removeSchedule` identifica `isOwnSchedule === true` → deleta direto, sem aprovação
- [ ] Adicionar aula (teacher-coordinator) em horários de terceiros: guard `_isCoordinator() && !isOwnSchedule` → submete para aprovação (comportamento inalterado)
- [ ] Professor pendente adiciona/remove aula: `schedules` usa `user.uid` como `teacherId` → regra Firestore permite (`teacherId == request.auth.uid`)
- [ ] `saveToFirestore` não é chamado para professores: `save()` no store verifica `role === 'admin'` antes de chamar `saveToFirestore`

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---|---|
| `firestore.rules` | Adicionar `'apelido'` e `'name'` na `hasOnly()` da regra `teachers/{docId}` |
| `src/pages/SettingsPage.jsx` | `TabProfile`: adicionar estado + input para `name`; incluir `name` no payload de `updateTeacherProfile` |
| `src/store/useAppStore.js` | `addSchedule`, `removeSchedule`, `updateSchedule`: guard `_isCoordinator()` só redireciona para aprovação se `!isOwnSchedule` |

---

## Fora do Escopo (v1)

- Edição de email (permanece somente leitura — é a chave de autenticação)
- Edição de `status` ou `profile` pelo professor (exclusivo do admin)
- Alterar o fluxo de aprovação de coordenadores para ações sobre dados de terceiros
- Migração de dados históricos no Firestore
- Adicionar validação de formato de nome
- Alterar a UI de outras abas (`TabTeachers`, `TabSchedules`, etc.)
