# Spec: Ajuste no Fluxo de Aprovação e Implementação de Atividades de Formação

## Visão Geral

Este spec cobre duas entregas relacionadas ao ciclo de vida do professor:

1. **Bug fix crítico** — dados preenchidos pelo professor no cadastro inicial (telefone, apelido, matérias e grade horária) não chegam corretamente ao Admin nem são preservados após a aprovação.
2. **Feature: Atividades de Formação** — permitir que professores registrem individualmente atividades como ATPCG, ATPCA, Multiplica e PDA na grade horária, sem conflito de horário entre si, e com contagem normal na carga horária.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite, Tailwind CSS
- **Estado global:** Zustand (`useAppStore`, `useAuthStore`)
- **Banco de dados:** Firebase Firestore
- **Auth:** Google OAuth via Firebase Auth
- **Hospedagem:** Firebase Hosting

---

## Diagnóstico Técnico do Bug

### Causa raiz — `approveTeacher` em `src/lib/db.js`

A função `approveTeacher(pendingId, state, setState)` é chamada assim em `SettingsPage.jsx`:

```js
await approveTeacher(p.id, store, store.hydrate)
```

O terceiro argumento `store.hydrate` é definido como:

```js
hydrate: (data) => set({ ...data, loaded: true })
```

Dentro de `approveTeacher`, `setState` é chamado com um _functional updater_:

```js
setState(s => ({ teachers: [...s.teachers, teacher] }))
```

Porém `hydrate(fn)` executa `set({ ...fn, loaded: true })`. Como espalhar uma função em um objeto (`...fn`) resulta em `{}`, o `set` efetivo é `set({ loaded: true })` — um no-op que não altera o estado em memória.

**Consequência:** o Firestore é atualizado corretamente (novo professor criado, schedules migrados), mas o store Zustand em memória não reflete essas mudanças sem recarregar a página.

### Causa secundária — `apelido` descartado em `updatePendingData`

Em [src/lib/db.js:153](../src/lib/db.js#L153), a função desestrutura apenas `{ celular, subjectIds }`, descartando silenciosamente o `apelido` antes de salvar no Firestore.

### Causa terciária — re-entry pula para `waiting` sem mostrar a grade

Em `PendingPage`, o `useEffect` de re-entry vai direto para `step = 'waiting'` se `celular` já estiver salvo, impedindo o professor de ver ou editar os horários que já cadastrou.

---

## Páginas e Rotas

### 1. PendingPage — `/` (role: pending)

**Descrição:** Fluxo de 3 passos para o professor recém-logado: `form` → `schedule` → `waiting`. Permite preencher telefone, apelido, matérias e grade horária antes da aprovação.

**Componentes:**
- `StepForm`: nome (read-only), e-mail (read-only), celular, apelido, seleção de matérias
- `StepSchedule`: `ScheduleGrid` com `syntheticTeacher = { id: user.uid, subjectIds }`
- `StepWaiting`: confirmação + contador de horários cadastrados
- `ScheduleGrid` (importado de `SettingsPage`)

**Behaviors:**
- [ ] **Preencher dados do cadastro:** professor informa telefone (obrigatório), apelido (opcional) e matérias (obrigatório) e avança para a grade
- [ ] **Salvar apelido corretamente:** `updatePendingData` deve incluir `apelido` no `updateDoc` (bug a corrigir em `db.js`)
- [ ] **Preencher grade horária:** professor adiciona aulas via `ScheduleGrid` usando `user.uid` como `teacherId`; cada entrada é salva imediatamente via `addSchedule`
- [ ] **Re-entry com grade pré-existente:** ao retornar com `celular` já salvo, ir para `step = 'schedule'` (não `waiting`), permitindo adicionar ou remover aulas; `waiting` é atingido apenas ao clicar "Concluir" ou "Pular"
- [ ] **Registrar atividade de formação na grade:** no modal de adicionar aula, selecionar ATPCG, ATPCA, Multiplica ou PDA em vez de uma turma regular; o sistema não bloqueia esse slot por conflito com outros professores na mesma atividade
- [ ] **Pular grade:** botão "Pular por agora" avança direto para `waiting` sem exigir criação de schedules
- [ ] **Sair da conta:** botão disponível em todos os steps

---

### 2. SettingsPage — Tab Teachers (`/settings?tab=teachers`, role: admin)

**Descrição:** Aba de gerenciamento de professores. Exibe professores aprovados, pendentes e sem segmento. O admin pode aprovar/recusar pendentes e visualizar/editar a grade sugerida antes de aprovar.

**Componentes internos:**
- `TabAdmin` / `TabTeachers`: lista de pendentes com ações de aprovar/rejeitar
- Card de professor pendente: nome, badge, e-mail, apelido, celular, matérias, contagem de horários, botões de ação
- `ScheduleGridModal` (já existe): exibe `ScheduleGrid` em modal

**Behaviors:**
- [ ] **Ver dados completos do pendente:** o card exibe nome, e-mail, apelido, celular e matérias selecionadas (lidos do documento em `pending_teachers`)
- [ ] **Ver grade sugerida do pendente:** se o pendente tem `subjectIds` preenchido, botão "👁 Ver" abre `ScheduleGridModal` em modo `readOnly=true` com `{ id: p.id, subjectIds: p.subjectIds }`; se `subjectIds` está vazio, botão não aparece
- [ ] **Editar grade do pendente antes de aprovar:** botão "✏️ Grade" abre `ScheduleGridModal` em modo editável; mudanças são salvas com `teacherId = p.id` (uid do pendente)
- [ ] **Aprovar professor com persistência correta:** ao clicar "Aprovar":
  1. `approveTeacher` cria o professor aprovado com `id: uid()` novo, copiando `name`, `email`, `celular`, `apelido`, `subjectIds` do documento `pending_teachers`
  2. Migra schedules no Firestore de `teacherId: pendingId` → `teacherId: teacher.id` via `writeBatch`
  3. Atualiza o store Zustand em memória **usando `set()` direto** (não `store.hydrate`) — professor adicionado e schedules migrados sem reload
  4. Remove o pendente da lista; toast "Professor aprovado" exibido
- [ ] **Rejeitar professor:** remove documento de `pending_teachers` e todos os schedules com `teacherId === pending.uid` no Firestore e em memória
- [ ] **Editar professor aprovado:** modal pré-preenchido com nome, e-mail, celular, apelido, matérias; ao salvar, persiste via `store.save()`

---

### 3. ScheduleGrid + AddSlotModal (teacher e admin)

**Descrição:** Grade horária interativa usada em `PendingPage`, `TabTeachers` e `SchedulePage`. Já existe suporte parcial a Atividades de Formação via `FORMATION_SERIES` e `isFormationSeries`.

**Behaviors — já implementados (validar):**
- [ ] **Múltiplos professores na mesma atividade de formação:** `isFormationSeries(turma)` bypassa o bloqueio de turma ocupada; professores diferentes podem ter ATPCG no mesmo slot sem conflito
- [ ] **Conflito do próprio professor mantido:** um professor não pode ter duas entradas no mesmo slot/dia, mesmo que uma seja de formação

**Behaviors — a implementar ou corrigir:**
- [ ] **Seção "Formação" visível para professor pendente sem segmentos:** no `AddSlotModal`, o grupo de Formação (ATPCG, ATPCA, Multiplica, PDA) aparece independentemente de segmentos — verificar que funciona com `syntheticTeacher` sem segmentos definidos
- [ ] **Distinção visual entre formação fixa e variável:** chips de ATPCG/ATPCA exibem badge "Fixo" e chips de Multiplica/PDA exibem badge "Variável" no `ScheduleGrid` para facilitar identificação
- [ ] **Remover entrada de formação:** botão ✕ no chip da atividade funciona igual ao de aulas regulares via `removeSchedule`

---

### 4. WorkloadPage — `/workload` (role: admin)

**Behaviors:**
- [ ] **Atividades de formação contam como aulas:** schedules com `turma` em `FORMATION_SERIES` incrementam o contador de aulas do professor normalmente — validar ausência de filtro que as exclua

---

## Componentes Compartilhados

- **`ScheduleGrid`** (`src/pages/SettingsPage.jsx`, exportado): grade interativa; recebe `teacher`, `store` e `readOnly`
- **`ScheduleGridModal`** (exportado): wrapper que abre `ScheduleGrid` em `Modal`; recebe `teacher`, `store`, `readOnly`
- **`Modal`** (`src/components/ui/Modal.jsx`): overlay base, tamanhos `sm/md/xl/2xl/4xl`

---

## Modelos de Dados

### `pending_teachers/{uid}`

```
{
  id:          string  (Firebase Auth UID),
  uid:         string,
  email:       string,
  name:        string,
  photoURL:    string,
  celular:     string,
  apelido:     string,   // era ignorado em updatePendingData — corrigido neste spec
  subjectIds:  string[],
  requestedAt: Timestamp,
  status:      'pending'
}
```

### `schedules/{id}`

```
{
  id:        string,
  teacherId: string,   // user.uid enquanto pendente; teacher.id após migração
  subjectId: string | null,
  turma:     string,   // turma regular ('6º Ano A') OU série de formação ('FORMAÇÃO - ATPCG')
  day:       string,
  timeSlot:  string    // "segId|turno|aulaIdx"
}
```

### `teachers/{id}` — após aprovação

```
{
  id:         string,   // uid() — distinto do Firebase Auth UID
  name:       string,   // copiado de pending_teachers
  email:      string,
  celular:    string,
  apelido:    string,
  whatsapp:   string,
  subjectIds: string[],
  status:     'approved'
}
```

### `FORMATION_SERIES` — constante em `src/lib/constants.js`

```js
export const FORMATION_SERIES = [
  'FORMAÇÃO - ATPCG',    // fixo
  'FORMAÇÃO - ATPCA',    // fixo
  'FORMAÇÃO - MULTIPLICA', // variável
  'FORMAÇÃO - PDA',      // variável
]
```

---

## Regras de Negócio

1. **Migração de schedules é atômica:** usa `writeBatch` no Firestore; a atualização do store em memória usa `set()` imutável logo após o commit.
2. **`approveTeacher` não usa `hydrate`:** o terceiro argumento deve ser substituído por chamadas diretas ao Zustand `set` ou por actions específicas (`addTeacher`, etc.).
3. **Atividade de formação não conflita entre professores:** `isFormationSeries(turma)` bypassa o `hardBlockedTurmas`; o check do próprio professor no slot continua ativo.
4. **Formação conta como carga horária:** nenhum filtro especial — schedules de formação são somados junto com aulas regulares.
5. **ATPCG / ATPCA (fixos):** lançados pelo Admin para cada professor; múltiplos professores podem ter a mesma série no mesmo slot.
6. **Multiplica / PDA (variáveis):** lançados pelo próprio professor em `SchedulePage` ou durante o passo `schedule` da `PendingPage`.
7. **Rejeição limpa:** schedules com `teacherId === pending.uid` são removidos do Firestore e do store ao rejeitar.

---

## Fora do Escopo (v1)

- Cadastro em lote de ATPCG/ATPCA para múltiplos professores de uma só vez
- Notificação ao professor quando aprovado
- Relatório separado de horas de formação vs. horas de aula
- Criação dinâmica de Séries de Formação pelo Admin (lista é constante)
- Desfazer aprovação / mover professor de volta para pendente
- Sincronização em tempo real via `onSnapshot` (coberta por `spec_atualizacao_tempo_real.md`)
