# Spec: Testes Automatizados — Cobertura de Áreas Descobertas

## Visão Geral

Criar suítes de testes automatizados para duas áreas do projeto SaaS Gestão Escolar que
atualmente não têm cobertura:

1. **Cloud Functions** (`functions/src/`) — `createAbsence`, `updateAbsence`, `deleteAbsence`
   e `applyPendingAction`, usando Jest + TypeScript no mesmo estilo de
   `approveTeacher.validation.test.ts` (mocks totais de `firebase-admin` e
   `firebase-functions/v1`, sem emulator).

2. **Helpers críticos** (`src/lib/`) — `dates.js`, `turmas.js`, `periods/index.js`,
   `permissions.js` e `runResilientWrite.js`, usando Vitest + JavaScript no mesmo estilo
   de `absences.test.js` (fixtures manuais, zero mocks de Firebase, funções puras).

O problema resolvido é o item em aberto no `architecture.md` §14: "Sem testes automatizados
— Regressões difíceis de detectar sem suite de testes".

---

## Stack Tecnológica

- **Cloud Functions (Área 1):** Jest 30 + ts-jest 29 + TypeScript 5 (config já existe em
  `functions/package.json`). Sem emulator nem SDK real.
- **Helpers (Área 2):** Vitest (config já existe no projeto raiz). JavaScript puro, sem
  transpilação adicional.
- **Banco de dados:** Nenhum acesso real. Área 1 usa mocks de `firebase-admin`; Área 2 usa
  fixtures em memória.
- **Outros:** `useNetworkStore` (Zustand) precisa de mock para `runResilientWrite.js`;
  `withTimeout` e `mapFirestoreError` são testados indiretamente via `runResilientWrite`.

---

## Arquivos de Teste a Criar

### Arquivo 1 — `functions/src/__tests__/absenceFunctions.test.ts`

**Descrição:** Testa os três handlers de ausência (`createAbsence`, `updateAbsence`,
`deleteAbsence`) e o handler de ações pendentes (`applyPendingAction`). Segue exatamente
o padrão de `approveTeacher.validation.test.ts`: captura handlers pelo índice de registro
em `registeredHandlers[]`, controla estado de mocks via variáveis mutáveis no módulo.

**Ordem de registro em `registeredHandlers[]` (0-based, conforme `index.ts`):**

```
0 → createAbsence
1 → updateAbsence
2 → deleteAbsence
3 → approveTeacher        ← já coberto em approveTeacher.validation.test.ts
4 → rejectTeacher
5 → reinstateRemovedUser
6 → setTeacherRoleInSchool
7 → designateSchoolAdmin
8 → joinSchoolAsAdmin
9 → removeTeacherFromSchool
10 → applyPendingAction
```

**Componentes do mock (replicar da referência):**

- `firebase-functions/v1`: captura handlers via `onCall`, exporta `HttpsError` como
  classe com `code` e `message`.
- `firebase-admin`: controla `collection().doc().get()`, `collection().doc().set()`,
  `collection().doc().update()`, `collection().doc().delete()`, `collection().where().limit().get()`,
  `batch()` com `set / update / delete / commit`.
- `./auth`: mock de `verifyCoordinatorOrAdmin` e `verifyAdmin`.
- `./actions`: mock de `ACTION_MAP` com handlers controlados por teste.

**Behaviors — createAbsence:**

- [ ] Validar teacherId obrigatório: lança `HttpsError` com code `invalid-argument` quando
  `teacherId` está vazio ou ausente.
- [ ] Validar slots de formação: lança `HttpsError` com code `invalid-argument` quando
  algum slot tem `subjectId` começando com `"formation-"`.
- [ ] Verificar professor inexistente: lança `HttpsError` com code `not-found` quando nem
  `doc.exists` nem a query `where("id","==",teacherId)` encontram o professor.
- [ ] Criar ausência com caminho global (sem schoolId): chama
  `collection("absences").doc(id).set(...)`.
- [ ] Criar ausência com caminho multi-tenant (com schoolId): chama
  `collection("schools/sch-x/absences").doc(id).set(...)`.
- [ ] Gerar slots normalizados: o objeto gravado tem `substituteId: null`, campos
  `id`, `date`, `day`, `timeSlot`, `scheduleId`, `subjectId`, `turma` para cada slot
  do input.
- [ ] Retornar `{ id }` no sucesso onde `id` é uma string não-vazia.
- [ ] Status inicial: o documento gravado tem `status: "open"`.
- [ ] Respeitar `verifyCoordinatorOrAdmin`: quando o mock lança, a função propaga o erro
  sem gravar nada.

**Behaviors — updateAbsence:**

- [ ] Validar absenceId obrigatório: lança `HttpsError` com code `invalid-argument`
  quando `absenceId` está vazio.
- [ ] Ausência inexistente: lança `HttpsError` com code `not-found` quando `doc.exists`
  é false.
- [ ] Rejeitar slots de formação: lança `HttpsError` com code `invalid-argument` quando
  algum slot tem `subjectId` com prefixo `"formation-"`.
- [ ] Calcular status corretamente após atualização:
  - Todos os slots com `substituteId` não-nulo → `status: "covered"`.
  - Nenhum slot com `substituteId` → `status: "open"`.
  - Alguns com, outros sem → `status: "partial"`.
- [ ] Chamar `doc.update()` com `{ slots, substituteId, status }`.
- [ ] Retornar `{ ok: true }` no sucesso.
- [ ] `substituteId` ausente no input resulta em `null` no update (não `undefined`).

**Behaviors — deleteAbsence:**

- [ ] Validar absenceId obrigatório: lança `HttpsError` com code `invalid-argument`
  quando `absenceId` está vazio.
- [ ] Chamar `doc.delete()` no caminho correto (global ou multi-tenant conforme schoolId).
- [ ] Retornar `{ ok: true }` no sucesso.
- [ ] Propagar erro de `verifyCoordinatorOrAdmin` sem deletar.

**Behaviors — applyPendingAction:**

- [ ] Validar pendingActionId obrigatório: lança `HttpsError` com code `invalid-argument`
  quando `pendingActionId` está vazio.
- [ ] Ação inexistente: lança `HttpsError` com code `not-found` quando `pendingDoc.exists`
  é false.
- [ ] Ação já processada: lança `HttpsError` com code `failed-precondition` quando
  `pendingData.status` já é `"approved"` ou `"rejected"`.
- [ ] Aprovação com `approved: true`: chama o handler correspondente de `ACTION_MAP` com
  `(db, payload)`.
- [ ] Ação desconhecida com `approved: true`: lança `HttpsError` com code `invalid-argument`
  quando `actionType` não existe no `ACTION_MAP`.
- [ ] Rejeição com `approved: false`: não chama nenhum handler de `ACTION_MAP`.
- [ ] Gravar audit log: chama `collection(adminActionsPath).doc(id).set(...)` com campos
  `actionType`, `actorEmail`, `pendingActionId`, `payload`, `approved`, `rejectionReason`.
- [ ] Atualizar status da pending_action: chama `collection(pendingActionsPath).doc(id).update(...)`
  com `{ status: "approved" | "rejected", reviewedBy, reviewedAt, rejectionReason }`.
- [ ] `rejectionReason` ausente no input resulta em `null` (não `undefined`) no update.
- [ ] Retornar `{ ok: true }` no sucesso.
- [ ] Caminho multi-tenant correto: quando `schoolId` é fornecido, usa
  `schools/{schoolId}/pending_actions` e `schools/{schoolId}/admin_actions`.

---

### Arquivo 2 — `src/__tests__/helpers.dates.test.js`

**Descrição:** Testa `dates.js` — funções usadas em toda a lógica de cálculo de carga
horária e ranking de candidatos. Sem mocks, sem Firebase.

**Behaviors — parseDate:**

- [ ] Converter string ISO válida `"2026-04-14"` para `Date` com dia local correto (sem
  UTC shift — `getFullYear()` === 2026, `getMonth()` === 3, `getDate()` === 14).
- [ ] Retornar `new Date(NaN)` para string nula, `undefined` ou não-string.
- [ ] Retornar `new Date(NaN)` para string vazia `""`.
- [ ] Processar corretamente meses com zero à esquerda (ex: `"2026-01-01"` → Janeiro).

**Behaviors — formatISO:**

- [ ] Converter `Date` válida para `"YYYY-MM-DD"` com padding de zero.
- [ ] Retornar `null` para `Date` inválida (`NaN`).
- [ ] Retornar `null` quando argumento é `null` ou `undefined`.
- [ ] Meses e dias de um dígito recebem zero à esquerda (ex: 1º de Janeiro → `"...-01-01"`).

**Behaviors — formatBR:**

- [ ] Converter `"2026-04-14"` para `"14/04/2026"`.
- [ ] Retornar `"—"` para valor falsy (`null`, `undefined`, `""`).

**Behaviors — dateToDayLabel:**

- [ ] Segunda-feira → `"Segunda"`.
- [ ] Sexta-feira → `"Sexta"`.
- [ ] Sábado → `null`.
- [ ] Domingo → `null`.
- [ ] Cobrir os cinco dias úteis com suas labels em português.

**Behaviors — weekStart:**

- [ ] Retornar a Segunda da semana quando input é uma Quarta.
- [ ] Retornar a própria data quando input já é Segunda.
- [ ] Retornar a Segunda anterior quando input é Domingo.
- [ ] Retornar `null`-safe (não lança) quando input é string inválida.

**Behaviors — businessDaysBetween:**

- [ ] Retornar apenas dias úteis (Seg–Sex) no intervalo.
- [ ] Não incluir Sábado nem Domingo.
- [ ] Incluir as datas `from` e `to` quando ambas são dias úteis.
- [ ] Retornar `[]` quando `from > to`.
- [ ] Retornar array com um elemento quando `from === to` e é dia útil.

**Behaviors — formatMonthlyAulas:**

- [ ] Retornar `"1 aula"` para count 1.
- [ ] Retornar `"N aulas"` para count diferente de 1 (incluindo 0 e 2+).

---

### Arquivo 3 — `src/__tests__/helpers.turmas.test.js`

**Descrição:** Testa `turmas.js` — funções usadas para identificar turmas de formação,
descanso e compartilhadas, que determinam se um slot precisa de substituto.

**Behaviors — allTurmaObjects:**

- [ ] Retornar lista plana com todos os objetos turma de uma hierarquia
  `segments → grades → classes`.
- [ ] Cada objeto retornado tem campos `label`, `segmentId`, `segmentName`, `gradeName`,
  `letter`, `turno`.
- [ ] `label` é `"${grade.name} ${cls.letter}"`.
- [ ] Retornar `[]` para `segments` vazio.
- [ ] Turno padrão `"manha"` quando `cls.turno` está ausente.

**Behaviors — isSharedSeries:**

- [ ] Retornar `true` quando `turmaName` corresponde exatamente ao `name` de algum item
  em `sharedSeries`.
- [ ] Retornar `false` para match parcial ou diferença de capitalização
  (ex: `"formação"` != `"FORMAÇÃO"`).
- [ ] Retornar `false` quando `sharedSeries` é array vazio.
- [ ] Retornar `false` quando `turmaName` é turma regular não listada.

**Behaviors — isFormationSlot:**

- [ ] Retornar `true` para turma cujo `name` existe em `sharedSeries` com `type === "formation"`.
- [ ] Retornar `false` para turma com `type === "elective"` (mesmo que esteja em sharedSeries).
- [ ] Retornar `false` para turma com `type === "rest"`.
- [ ] Retornar `false` quando `turma` é `null` ou `undefined`.
- [ ] Ignorar `_subjectId` (segundo parâmetro) — qualquer valor não afeta o resultado.
- [ ] Retornar `false` para turma regular que não está em `sharedSeries`.

**Behaviors — isRestSlot:**

- [ ] Retornar `true` para turma com `type === "rest"` em `sharedSeries`.
- [ ] Retornar `false` para turma com `type === "formation"`.
- [ ] Retornar `false` para `null` ou `undefined`.
- [ ] Retornar `false` quando `sharedSeries` é vazio.

---

### Arquivo 4 — `src/__tests__/helpers.periods.test.js`

**Descrição:** Testa `periods/index.js` — núcleo da resolução de horários. As funções
`toMin`, `resolveSlot` e `gerarPeriodos` são usadas em toda a lógica de cálculo de carga
e exibição de slots.

**Behaviors — toMin:**

- [ ] `"07:00"` → 420.
- [ ] `"13:30"` → 810.
- [ ] `"00:00"` → 0.
- [ ] Input falsy (`""`, `null`, `undefined`) → 0 (usa fallback `"00:00"`).

**Behaviors — fromMin:**

- [ ] 420 → `"07:00"`.
- [ ] 810 → `"13:30"`.
- [ ] 0 → `"00:00"`.

**Behaviors — gerarPeriodos:**

- [ ] Gerar `qtd` aulas com `aulaIdx` de 1 a `qtd`.
- [ ] Cada aula tem `inicio` e `fim` calculados sequencialmente a partir de `inicio` com
  duração `duracao`.
- [ ] Inserir entradas com `isIntervalo: true` após a aula indicada em `intervalos[].apos`.
  O `inicio` do intervalo é derivado de `iv.inicio` quando fornecido, ou do fim da aula
  anterior.
- [ ] Retornar `[]` quando `cfg` é `null` ou `undefined`.
- [ ] Primeira aula começa exatamente em `cfg.inicio`.
- [ ] Segunda aula começa imediatamente após a primeira (sem intervalo).

**Behaviors — parseSlot:**

- [ ] `"seg-fund|manha|3"` → `{ segmentId: "seg-fund", turno: "manha", aulaIdx: 3 }` (número).
- [ ] `"seg-fund|manha|e2"` → `{ segmentId: "seg-fund", turno: "manha", aulaIdx: "e2", isEspecial: true }`.
- [ ] Retornar `null` quando input é `null`, `undefined` ou string sem dois `|`.

**Behaviors — makeSlot:**

- [ ] `makeSlot("seg-fund", "manha", 3)` → `"seg-fund|manha|3"`.

**Behaviors — resolveSlot:**

- [ ] Resolver slot regular válido para `{ label, inicio, fim, isIntervalo: false }`.
- [ ] Retornar `null` para slot especial `"seg-fund|manha|e1"` (isEspecial).
- [ ] Retornar `null` para slot com `aulaIdx` fora do range (ex: aulaIdx 10 em grade com
  qtd 5).
- [ ] Retornar `null` para input `null` ou `undefined`.

**Behaviors — slotLabel:**

- [ ] Retornar `"1ª Aula"` para `"seg-fund|manha|1"` com config completa.
- [ ] Retornar o próprio `timeSlot` quando resolveSlot retorna `null` (fallback).

**Behaviors — slotFullLabel:**

- [ ] Retornar `"1ª Aula (07:00–07:50)"` para slot resolvido com duração 50min.
- [ ] Retornar o próprio `timeSlot` quando slot não resolve (fallback).

---

### Arquivo 5 — `src/__tests__/helpers.permissions.test.js`

**Descrição:** Testa `permissions.js` — única função de controle de acesso a grade
individual (`canEditTeacher`). Implementa RBAC de quem pode editar a grade de quem.

**Behaviors — canEditTeacher:**

- [ ] Admin (`role === "admin"`) pode editar qualquer professor (usuarioLogado `null`).
- [ ] Coordenador puro (`role === "coordinator"`) pode editar qualquer professor.
- [ ] Teacher-coordinator (`role === "teacher-coordinator"`) pode editar qualquer professor.
- [ ] Professor (`role === "teacher"`) pode editar somente a si mesmo
  (`usuarioLogado.id === professorAlvo.id`).
- [ ] Professor tentando editar outro professor retorna `false`.
- [ ] Professor sem `id` (anomalia) retorna `false` ao tentar editar qualquer um.
- [ ] `authStore` nulo ou sem `role` retorna `false`.
- [ ] `professorAlvo` nulo retorna `false`.
- [ ] Role `"pending"` retorna `false`.
- [ ] Role desconhecido (string arbitrária) retorna `false`.

---

### Arquivo 6 — `src/__tests__/helpers.runResilientWrite.test.js`

**Descrição:** Testa `runResilientWrite.js` — wrapper de escrita resiliente. Requer mock
de `useNetworkStore` (Zustand store) e de `withTimeout`/`mapFirestoreError` para controlar
cenários de falha.

**Estratégia de mock:** Vitest `vi.mock()` para `../../store/useNetworkStore` e para
`./withTimeout`. `mapFirestoreError` pode ser testado via integração real (não mock) pois
é função pura.

**Behaviors — quando offline:**

- [ ] Retornar `{ ok: false, code: "offline", message: "..." }` sem invocar `operation`.
- [ ] A função `operation` não é chamada.

**Behaviors — quando online e sucesso:**

- [ ] Invocar `operation` e retornar `{ ok: true, data }` com o valor resolvido.
- [ ] `data` é `undefined` quando `operation` resolve com `void`/`undefined`.

**Behaviors — quando online e timeout:**

- [ ] Retornar `{ ok: false, code: "timeout", ... }` quando `withTimeout` rejeita com
  `{ code: "timeout" }`.

**Behaviors — quando online e erro Firestore:**

- [ ] Retornar `{ ok: false, code: "permission-denied", message: "..." }` quando
  `operation` rejeita com `{ code: "permission-denied" }`.
- [ ] Retornar `{ ok: false, code: "unavailable", message: "..." }` para erro de rede.
- [ ] Retornar `{ ok: false, code: "unknown", message: "..." }` para erro sem código.

**Behaviors — timeout customizado:**

- [ ] Respeitar `options.timeoutMs` ao chamar `withTimeout`.
- [ ] Respeitar `options.timeoutMessage` ao chamar `withTimeout`.

**Behaviors — garantia de não-lançamento:**

- [ ] `runResilientWrite` nunca propaga exceção — sempre retorna o discriminated union.

---

## Componentes Compartilhados

Nenhum componente de UI envolvido. Todos os arquivos de teste são independentes e podem
ser executados em qualquer ordem.

---

## Modelos de Dados

Os testes usam as mesmas entidades descritas no `architecture.md`. As fixtures relevantes
por arquivo são:

**Área 1 (Cloud Functions):**

```
PendingTeacherDoc: { email, name, subjectIds, celular, apelido, horariosSemana? }
AbsenceDoc:        { id, teacherId, createdAt, status, slots[] }
Slot:              { id, date, day, timeSlot, scheduleId, subjectId, turma, substituteId }
PendingActionDoc:  { id, action, payload, status, coordinatorId, ... }
```

**Área 2 (Helpers):**

```
Teacher:    { id, name, profile, subjectIds, horariosSemana? }
AuthStore:  { role, teacher, user }
SharedSeries: { id, name, type: "formation" | "elective" | "rest" }
Segment:    { id, name, turno, grades[{ name, classes[{ letter, turno }] }] }
PeriodCfg:  { inicio, duracao, qtd, intervalos[{ apos, duracao }] }
```

---

## Regras de Negócio

As regras já implementadas nos arquivos-fonte que os testes devem verificar:

1. **Slots de formação bloqueados nas Cloud Functions:** qualquer slot com
   `subjectId.startsWith("formation-")` é rejeitado em `createAbsence` e `updateAbsence`
   (code `invalid-argument`). Esta é a guarda server-side para a regra do negócio que
   slots de formação não demandam substituto.

2. **`calcStatus` determinístico:** `covered` exige todos os slots com `substituteId`
   não-nulo; `partial` exige pelo menos um com e um sem; `open` é o estado sem nenhum.
   Testado em `updateAbsence`.

3. **`applyPendingAction` é idempotência-safe:** ações com `status !== "pending"` são
   rejeitadas com `failed-precondition` para evitar dupla execução.

4. **Coordenadores não aparecem no ranking:** `rankCandidates` (já testado em
   `absences.test.js`) filtra `profile === "coordinator"`. Os testes de
   `isFormationSlot`/`isRestSlot` complementam essa regra detectando corretamente os
   tipos de slot que não precisam de substituto.

5. **UTC-safe em `parseDate`:** usa construtor `new Date(y, m-1, d)` (local) em vez de
   `new Date(isoString)` (UTC) para evitar off-by-one em fusos negativos.

6. **`canEditTeacher` é o guardião da rota `/schedule`:** o RBAC de edição de grade
   individual passa inteiramente por esta função — nenhum guard de rota separado existe.

7. **`runResilientWrite` não lança nunca:** toda chamada que falha retorna
   `{ ok: false, code, message }` em vez de propagar a exceção.

---

## Fora do Escopo (v1)

- Testes de integração com Firebase Emulator (qualquer função ou coleção que precise de
  emulator real).
- Testes de componentes React (páginas, modais, Navbar) — escopo é exclusivamente lógica
  de negócio e Cloud Functions.
- Testes de `auth.ts` (verificação de tokens JWT) — requer mocks de Admin Auth SDK
  adicionais fora do escopo desta sprint.
- Testes de `reports/index.js` — depende de `window.open` e `window.print`, exige
  ambiente browser (jsdom) separado.
- Testes e2e (Playwright/Cypress).
- Cobertura de `actions.ts` além do que `applyPendingAction` já exercita indiretamente
  (ACTION_MAP handlers individuais são testados via mock, não individualmente).
- Testes de `rejectTeacher`, `reinstateRemovedUser`, `setTeacherRoleInSchool`,
  `designateSchoolAdmin`, `joinSchoolAsAdmin`, `removeTeacherFromSchool` — fora do escopo
  listado na tarefa.
