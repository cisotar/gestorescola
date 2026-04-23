# Spec: Onboarding de Horários do Professor

## Visão Geral

Dois cenários distintos exigem que o professor preencha seus horários antes de usar o sistema plenamente:

1. **Novo professor (não aprovado):** ao longo do fluxo da `PendingPage`, o professor deve informar horários de entrada/saída **e** cadastrar sua grade de aulas antes de concluir. Ambas as etapas são obrigatórias para avançar ao estado de espera.

2. **Professor já aprovado sem horários cadastrados:** ao acessar a `HomePage`, o professor vê banners de aviso contextuais — um para horários de entrada/saída ausentes e outro para grade horária sem aulas — com botões de redirecionamento direto para as telas de cadastro correspondentes.

O objetivo é eliminar professores no sistema com dados incompletos que afetam o algoritmo de ranking de substitutos (`isAvailableBySchedule` e `isBusy`).

---

## Stack Tecnológica

- **Frontend:** React 18.3.1 + Tailwind CSS 3.4
- **Estado:** Zustand (`useAppStore`, `useAuthStore`)
- **Backend/DB:** Firebase Firestore — coleções `teachers/`, `pending_teachers/`, `schedules/`
- **Actions do store:** `store.updateTeacherProfile(id, changes)`
- **Persistência pendente:** `updatePendingData(uid, data)` em `src/lib/db`
- **Constantes:** `DAYS` de `src/lib/constants`
- **Roteamento:** React Router 6 (`useNavigate`)

---

## Páginas e Rotas

### PendingPage — `/` (role=pending)

**Descrição:** Fluxo de cadastro em 3 steps (`form` → `schedule` → `waiting`). Atualmente o step `schedule` permite pular via "Pular por agora". A alteração torna o cadastro de grade horária **obrigatório**: o professor não pode avançar ao step `waiting` sem ao menos 1 aula cadastrada. O step `form` já exige `horariosSemana` com ao menos 1 dia completo — manter esse comportamento.

**Componentes:**

- `HorarioDiaSemana` (co-localizado): linha individual de horário por dia — já existe, sem alterações.
- `ScheduleGrid` (importado de `components/ui/ScheduleGrid`): grade de cadastro de aulas — já existe.
- Banner de aviso de grade vazia: texto informativo + contagem de aulas cadastradas exibidos na coluna esquerda do step `schedule`.

**Behaviors:**

- [ ] Manter obrigatoriedade de horários de entrada/saída: o botão "Enviar cadastro" no step `form` permanece desabilitado se `!temAoMenosUmDiaCompleto` ou `hasHorarioError` — comportamento já implementado, não alterar.
- [ ] Tornar grade horária obrigatória no step `schedule`: o botão "Concluir" fica desabilitado enquanto `myScheduleCount === 0`.
- [ ] Remover botão "Pular por agora": remover o `<button onClick={() => setStep('waiting')}>Pular por agora</button>` do step `schedule`. O único caminho para `waiting` é pelo botão "Concluir" com grade preenchida.
- [ ] Exibir contagem de aulas cadastradas: no step `schedule`, mostrar na coluna esquerda o número de aulas já cadastradas na `ScheduleGrid` (`myScheduleCount`), com texto do tipo "X aula(s) cadastrada(s)".
- [ ] Exibir aviso de grade vazia: se `myScheduleCount === 0`, exibir mensagem informativa abaixo do resumo de dados enviados: "Cadastre ao menos uma aula na grade ao lado para concluir".
- [ ] Habilitar "Concluir" ao ter ao menos 1 aula: quando `myScheduleCount >= 1`, o botão "Concluir" fica habilitado e navega para o step `waiting`.
- [ ] Preservar comportamento do step `waiting`: sem alterações — exibe resumo + contagem de aulas cadastradas + botão de logout.

---

### HomePage — `/home` (role=teacher)

**Descrição:** Página inicial do professor aprovado. Exibir banners de aviso contextuais quando o professor não tem horários de entrada/saída cadastrados e/ou não tem aulas na grade horária. Os banners são exibidos logo abaixo da saudação e acima dos KPICards, com chamadas de ação claras para as telas de cadastro.

**Componentes:**

- `BannerHorariosAusentes` (co-localizado, acima do `export default`): banner de aviso para `horariosSemana` vazio.
- `BannerGradeVazia` (co-localizado, acima do `export default`): banner de aviso para grade sem aulas.

**Behaviors:**

- [ ] Detectar horários de entrada/saída ausentes: verificar se `myTeacher?.horariosSemana` está vazio ou ausente. Considerar ausente quando `!myTeacher?.horariosSemana || Object.keys(myTeacher.horariosSemana).length === 0`.
- [ ] Exibir banner de horários ausentes: quando horários estão ausentes, renderizar `BannerHorariosAusentes` acima dos KPICards com texto "Seus horários de entrada e saída não estão cadastrados" e botão "Cadastrar horários" que navega para `/settings?tab=profile`.
- [ ] Detectar grade horária vazia: verificar se `schedules.filter(s => s.teacherId === myTeacher?.id).length === 0`.
- [ ] Exibir banner de grade vazia: quando a grade está vazia, renderizar `BannerGradeVazia` com texto "Sua grade horária está vazia" e botão "Cadastrar grade" que navega para `/grades?teacher={myTeacher.id}`.
- [ ] Exibir ambos os banners simultaneamente: se o professor não tem nem horários nem grade, exibir ambos os banners empilhados (horários acima, grade abaixo), sem colapsar um ao outro.
- [ ] Ocultar banners quando dados estão completos: não renderizar o banner quando o dado correspondente está preenchido — sem lógica de dismiss manual (banners desaparecem automaticamente ao preencher os dados).
- [ ] Não exibir banners para professores com dados completos: se `horariosSemana` tem ao menos 1 dia e a grade tem ao menos 1 aula, nenhum banner é renderizado e a página exibe seu conteúdo normal sem alterações.

---

## Componentes Compartilhados

- `SecaoHorarios` (`src/components/ui/SecaoHorarios.jsx`): já existe — exibe e edita `horariosSemana` de um professor. Usado em `GradesPage` e `SettingsPage`. Pode ser referenciado no botão "Cadastrar horários" da `HomePage` que aponta para `/settings?tab=profile` onde este componente já está disponível.

---

## Modelos de Dados

### `teachers/{id}` — campos relevantes

```js
{
  horariosSemana: {
    "Segunda": { entrada: "07:00", saida: "17:00" },
    "Terça":   { entrada: "07:00", saida: "17:00" },
    // dias sem trabalho não têm chave no objeto
  }
  // Ausência do campo = professor sem horários cadastrados
  // Tratar com: teacher?.horariosSemana ?? {}
}
```

### `schedules/{id}` — campos relevantes

```js
{
  teacherId: "lv9k2a7",   // FK → teachers[].id
  day:       "Segunda",
  timeSlot:  "seg-fund|manha|1",
  turma:     "6º Ano A",
  subjectId: "subj-bio"
}
```

Ausência de documentos com `teacherId === myTeacher.id` indica grade vazia.

### `pending_teachers/{uid}` — campos relevantes

```js
{
  horariosSemana: {
    "Segunda": { entrada: "07:00", saida: "17:00" }
  },
  subjectIds: ["subj-bio"],
  celular: "11987654321"
}
```

A persistência de `horariosSemana` em `pending_teachers` já ocorre via `updatePendingData` — sem alterações.

---

## Regras de Negócio

### Critério de "ao menos 1 dia completo" (PendingPage — step form)

Já implementado. Um dia é completo quando `v?.entrada && v?.saida && v.saida > v.entrada`. Manter sem alterações.

### Critério de "grade não vazia" (PendingPage — step schedule)

```js
const myScheduleCount = store.schedules.filter(s => s.teacherId === user.uid).length
const gradePreenchida = myScheduleCount >= 1
```

O botão "Concluir" só habilita quando `gradePreenchida === true`.

### Detecção de horários ausentes (HomePage)

```js
const semHorarios = !myTeacher?.horariosSemana || Object.keys(myTeacher.horariosSemana).length === 0
```

### Detecção de grade vazia (HomePage)

```js
const semGrade = schedules.filter(s => s.teacherId === myTeacher?.id).length === 0
```

### Ordem de exibição dos banners (HomePage)

Quando ambos estão ausentes, exibir na ordem:
1. Banner de horários de entrada/saída (campo mais básico do cadastro)
2. Banner de grade horária (dado que depende da aprovação)

### Impacto no algoritmo de ranking

- `isAvailableBySchedule(teacher, day, timeSlot)` usa `teacher.horariosSemana` para verificar se o professor está no horário de trabalho. Sem horários cadastrados, a função retorna comportamento indefinido/permissivo — banner visa corrigir isso.
- Professores sem grade na coleção `schedules/` aparecem como candidatos a substituto em qualquer slot, pois `isBusy()` não encontra conflitos — banner visa incentivar o preenchimento.

---

## Fora do Escopo (v1)

- Bloquear acesso às demais rotas da `HomePage` enquanto dados estiverem incompletos (apenas avisar, não redirecionar forçosamente).
- Exibir banners para coordenadores ou admins que estejam editando perfis de outros professores.
- Validação de horários de entrada/saída contra os `periodConfigs` do segmento (ex: alertar se entrada é depois da 1ª aula).
- Envio de notificação push/e-mail ao admin quando professor preenche horários ou grade após aprovação.
- Exibição de banner na `DashboardPage` para admins/coordenadores sobre professores com dados incompletos.
- Criação de relatório de professores sem horários ou sem grade.
- Dismiss manual de banners (fechar banner sem preencher os dados).
