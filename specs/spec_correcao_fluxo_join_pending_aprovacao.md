# Spec: Correção do Fluxo de Cadastro via Convite (JoinPage → PendingPage → Aprovação)

## Visão Geral

Restaurar o fluxo ponta a ponta de onboarding de professor via link de convite (`/join/:slug`) num app SaaS multi-tenant de gestão escolar. Hoje, o caminho está quebrado em três pontos: (1) o usuário fica preso em spinner infinito após acessar o link de convite, (2) a grade de horários disponíveis e matérias não persiste em `pending_teachers/{uid}`, e (3) o admin não consegue aprovar o pedido — seja porque a grade chega vazia, seja por erro CORS/region nas Cloud Functions.

A correção precisa garantir que o professor consiga avançar do convite até a HomePage (após aprovação) sem reload manual, com isolamento multi-tenant intacto e toda aprovação rodando server-side via Cloud Function.

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Zustand + React Router v6
- **Backend:** Firebase Cloud Functions (Node, region `southamerica-east1`)
- **Banco de dados:** Firebase Firestore (multi-tenant em `schools/{schoolId}/...`)
- **Auth:** Firebase Auth (Google Sign-In via popup)
- **UI:** Tailwind CSS + componentes próprios (`Modal`, `Spinner`, `ScheduleGrid`)

## Páginas e Rotas

### JoinPage — `/join/:slug`

**Descrição:** Entrada do convite. Resolve o `slug` em `schoolId`, persiste o contexto da escola no localStorage, autentica o usuário se necessário e o roteia para o destino correto (HomePage se já aprovado, PendingPage se novo/pendente).

**Componentes:**
- `LoadingState`: spinner com label "Verificando convite…"
- `SlugErrorState`: card de erro para slug inválido/inexistente
- Tela de erro recuperável com botão "Tentar novamente"

**Behaviors:**
- [ ] Resolver slug em `schoolId` consultando `school_slugs/{slug}` (leitura pública)
- [ ] Validar existência de `schools/{schoolId}` antes de qualquer redirect
- [ ] Persistir `schoolId` em `localStorage['gestao_active_school']` antes do redirect para login
- [ ] Redirecionar para `/login` salvando `pendingJoinSlug` em sessionStorage se não autenticado
- [ ] Verificar `users/{uid}.schools[schoolId].status` — se `approved`, ativar escola e ir para `/home` (teacher) ou `/dashboard` (admin/coordinator)
- [ ] Verificar existência de `schools/{schoolId}/pending_teachers/{uid}` — se existe, ativar escola e ir para `/`
- [ ] Para usuário novo, criar `pending_teachers/{uid}` via `requestTeacherAccess()` e ativar escola
- [ ] Aguardar `authLoading === false` antes de iniciar a lógica de resolve
- [ ] Após `setCurrentSchool`, NÃO ficar em spinner local — delegar render ao App.jsx que reagirá ao `role === 'pending'`

### PendingPage — `/` (renderizada quando `role === 'pending'`)

**Descrição:** Wizard de 3 passos para o professor pendente: (form) preencher dados pessoais + matérias + horários disponíveis, (schedule) montar grade horária prévia, (waiting) confirmar envio e aguardar aprovação.

**Componentes:**
- `HorarioDiaSemana`: par de inputs entrada/saída por dia da semana
- `ModalErroValidacao`: modal de erros de validação no submit
- `ModalCopiaHorario`: oferece copiar horário do primeiro dia para a semana toda
- `ScheduleGrid`: grade horária reutilizada (recebe `teacher` sintético)
- Card "Link de convite necessário" quando não há `currentSchoolId`

**Behaviors:**
- [ ] Re-hidratar dados do passo `form` lendo `pending_teachers/{uid}` no mount, pulando para `schedule` se `celular` já estiver preenchido
- [ ] Validar telefone brasileiro `[1-9][0-9]9[0-9]{7,8}` antes de avançar
- [ ] Validar seleção de ao menos 1 matéria
- [ ] Validar pelo menos 1 dia com entrada e saída válidas (saída > entrada)
- [ ] Persistir `{ celular, apelido, subjectIds, horariosSemana }` em `pending_teachers/{uid}` via `updatePendingData()` ao concluir o passo `form`
- [ ] Avançar para `step='schedule'` apenas após confirmação de gravação bem-sucedida
- [ ] Permitir cadastrar aulas em `schedules/{id}` com `teacherId === user.uid` (perfil sintético) durante o passo `schedule`
- [ ] Bloquear botão "Concluir" até existir ao menos 1 aula em `schedules` com `teacherId === user.uid`
- [ ] Renderizar passo `waiting` com resumo dos dados e contagem de aulas cadastradas
- [ ] Permitir retorno de `waiting` para `schedule` ou `form` sem perda de dados
- [ ] Reagir automaticamente ao listener de aprovação (em useAuthStore) — quando `role` mudar de `pending` para `teacher`, App.jsx re-renderiza para `<Navigate to="/home">`
- [ ] Em qualquer reload no estado pending, voltar para PendingPage com dados carregados (sem perda)

### App.jsx — Orquestração de boot

**Descrição:** Componente raiz que coordena `init` de auth, hidratação de dados e gates por role.

**Behaviors:**
- [ ] Chamar `useAuthStore.init()` uma única vez no mount
- [ ] Quando `role === 'pending'`, chamar `hydrate({})` imediatamente para destravar o gate `!loaded` (evitar deadlock que causa spinner infinito)
- [ ] Quando `role` é admin/teacher/coordinator e `currentSchoolId` definido, chamar `loadFromFirestore` e registrar listeners realtime
- [ ] Renderizar Spinner global apenas enquanto `loading === true` OU `loaded === false`
- [ ] Não disparar `loadFromFirestore` para `role === 'pending'` (evita PERMISSION_DENIED em coleções restritas)
- [ ] Permitir render de JoinPage mesmo sem `role` (rota pública gerencia auth internamente)
- [ ] Reagir reativamente a mudança de `role` causada pelo listener de aprovação — sair de PendingPage e ir para Routes sem reload manual

## Componentes Compartilhados

- **Spinner:** loader visual (já existe em `src/components/ui/Spinner.jsx`)
- **Modal:** wrapper de modal genérico (`src/components/ui/Modal.jsx`)
- **ScheduleGrid:** grade horária reutilizada por PendingPage e fluxo regular do teacher
- **Toast:** sistema de notificações (`src/components/ui/Toast.jsx`)

## Modelos de Dados

### `schools/{schoolId}/pending_teachers/{uid}`
```
{
  id: string,                  // == uid
  uid: string,                 // == Firebase Auth UID
  email: string,               // lowercase
  name: string,                // displayName do Google
  photoURL: string,
  requestedAt: Timestamp,
  status: 'pending',
  profile: null,
  // Campos preenchidos pela PendingPage (passo form):
  celular: string,             // dígitos (sem máscara)
  apelido: string,
  subjectIds: string[],        // FK → schools/{schoolId}/config/.subjects
  horariosSemana: {            // disponibilidade por dia
    [day: string]: { entrada: 'HH:mm', saida: 'HH:mm' }
  }
}
```

### `users/{uid}` (raiz, multi-tenant)
```
{
  schools: {
    [schoolId]: {
      role: 'admin' | 'coordinator' | 'teacher-coordinator' | 'teacher' | 'rejected',
      status: 'approved' | 'rejected'
    }
  }
}
```

### `schools/{schoolId}/teachers/{teacherId}` (criado/atualizado por approveTeacher)
```
{
  id: string,                  // teacherId interno (≠ Firebase UID)
  name, email, celular, apelido, subjectIds, horariosSemana,
  status: 'approved',
  profile: 'teacher' | 'coordinator' | 'teacher-coordinator',
  whatsapp: string
}
```

### `schools/{schoolId}/schedules/{id}` (criado em PendingPage step `schedule`)
```
{
  id, teacherId, turma, subjectId, day, slotIndex, ...
}
```
Durante o passo `schedule`, `teacherId === user.uid` (Auth UID). A Cloud Function `approveTeacher` migra esses schedules órfãos para o `teacherId` final do `teachers/{teacherId}` criado.

### `school_slugs/{slug}` (raiz, leitura pública)
```
{ schoolId: string }
```

## Regras de Negócio

- **RN-1 (multi-tenant):** Toda leitura/escrita de dados de escola precisa estar sob `schools/{schoolId}/...`. Nada de coleções globais para teachers/schedules/pending.
- **RN-2 (preserva contexto pending):** Em reload no estado `pending`, `useSchoolStore.init(uid)` deve restaurar `schoolId` do localStorage mesmo sem entrada em `users/{uid}.schools` (ainda não aprovado).
- **RN-3 (re-resolve role):** Mudança de `currentSchoolId` após login precisa disparar `_resolveRole` novamente — usar `useSchoolStore.subscribe` em `init`.
- **RN-4 (listener de aprovação):** Listener em `pending_teachers/{uid}` deve ser registrado com `schoolId` correto. Quando o doc é deletado (sinal de aprovação ou rejeição), reler `users/{uid}.schools[schoolId]` e atualizar `role` reativamente.
- **RN-5 (no client-side approval):** Aprovação e rejeição de professor pendente são exclusivamente Cloud Functions (`approveTeacher`, `rejectTeacher`). O frontend nunca escreve em `teachers/` ou `users/{uid}` para esse fluxo.
- **RN-6 (region):** Cloud Functions `approveTeacher`, `rejectTeacher` e demais callables rodam em `southamerica-east1`. O cliente Firebase deve estar configurado para essa region.
- **RN-7 (gate por role):** App.jsx renderiza PendingPage somente se `role === 'pending'` e o pathname não for `/join/...`. Após aprovação, re-renderiza Routes e o `<Route index>` redireciona para `/home`.
- **RN-8 (no deadlock):** O critério de saída do spinner global (`!loading && loaded`) precisa ser atingível para `role === 'pending'`. Solução: no useEffect que carrega Firestore, fazer `hydrate({})` imediato no branch `role === 'pending'` para destravar `loaded`.
- **RN-9 (rules de pending):** O dono do doc (`request.auth.uid == docId`) tem `write` em `pending_teachers/{uid}`. Admin/coordenador têm `read`. Aprovação é via Cloud Function (Admin SDK bypassa rules).
- **RN-10 (migração de schedules órfãos):** `approveTeacher` migra todos os `schedules` com `teacherId == pendingUid` para o `teacherId` real do teacher criado, em batch atômico junto com a criação do teacher e a escrita em `users/{uid}`.
- **RN-11 (rejeição):** `rejectTeacher` deleta `pending_teachers/{uid}`, deleta schedules órfãos e marca `users/{uid}.schools[schoolId] = { role: 'rejected', status: 'rejected' }`. Cliente detecta `rejected` no `_resolveRole` e desloga.

## Pontos Críticos de Investigação

1. **Spinner infinito (Problema 1):** Verificar a cadeia `init() → _resolveRole → set({ loading: false })` versus `useEffect (role, currentSchoolId, loading) → hydrate({})`. O branch `role === 'pending'` precisa chamar `hydrate({})` (já existe em App.jsx linha 47-50). Confirmar que `hydrate` está marcando `loaded: true` mesmo com objeto vazio (verificar em `useAppStore.hydrate` — atualmente `loaded: true` é setado independente do payload, então o pulo deveria funcionar).
2. **Race entre JoinPage e _resolveRole:** Quando JoinPage chama `setCurrentSchool(schoolId)`, o subscribe em `useAuthStore.init` re-roda `_resolveRole`. Confirmar que o `requestTeacherAccess` interno em `_resolveRole` step 4 é idempotente com o que JoinPage também executa (ambos chamam a mesma função, `getDoc → if exists return`).
3. **updatePendingData não persiste (Problema 2):** Verificar que `pending_teachers/{uid}` rule permite update do dono (`docId == uid`). A rule atual cobre `write` (que inclui update). Investigar se `updateDoc` está sendo chamado com `currentSchoolId` correto e se o doc já existe (caso contrário usar `setDoc` com merge). Logs em `[PendingPage] handleSubmit` devem aparecer no console.
4. **Admin não aprova (Problema 3):** Já corrigido via region migration (commit 70abfb0). Validar que o cliente está chamando a função com region correta — `httpsCallable(functions, 'approveTeacher')` precisa que `functions` esteja inicializada com `getFunctions(app, 'southamerica-east1')`.
5. **Redirect pós-aprovação:** Listener em `_resolveRole` step 4 detecta deleção do `pending_teachers/{uid}`, relê `users/{uid}.schools[schoolId]`, e faz `set({ role: normalized })`. Como App.jsx assina `role` via `useAuthStore()`, o componente re-renderiza, sai do branch `role === 'pending'` e cai em Routes com `<Route index>` redirecionando para `/home`.

## Critérios de Aceite

1. Professor novo acessa `/join/eepmtm` → vê PendingPage em menos de 3 segundos (sem spinner infinito)
2. Preenche form (telefone + matérias + horários disponíveis) → clica "Próximo" → dados salvos em `pending_teachers/{uid}` (verificável no console Firebase)
3. Cadastra ao menos 1 aula no passo `schedule` → clica "Concluir" → vê tela `waiting` com resumo
4. Admin abre aba Professores → vê pedido com matérias e horários preenchidos → clica "Aprovar" → Cloud Function executa sem CORS/region error
5. Professor logado na PendingPage é redirecionado automaticamente para `/home` após aprovação (sem reload)
6. Reload em qualquer momento do fluxo pending preserva `schoolId` e dados já preenchidos
7. Rejeição via admin desloga o professor automaticamente

## Fora do Escopo (v1)

- Notificação push/email para o professor avisando aprovação/rejeição
- Edição de dados de cadastro pelo professor após aprovação (já coberto por `updateTeacherProfile` no fluxo regular)
- Suporte a múltiplas escolas simultâneas para um mesmo professor durante onboarding (uma escola por vez)
- Convites com expiração ou limite de uso
- Reaprovação após rejeição (atualmente o usuário rejeitado é deslogado e não tem caminho de retry no UI)
- Refatoração ampla de `useAuthStore._resolveRole` (manter cirúrgico, apenas ajustes mínimos para destravar o fluxo)
