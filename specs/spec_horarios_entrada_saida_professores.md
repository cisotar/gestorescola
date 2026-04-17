# Spec: Horários de Entrada e Saída dos Professores

## Visão Geral

Cada professor possui horários de entrada e saída que variam por dia da semana. Um professor só pode ser sugerido ou atribuído como substituto nos horários em que estiver presente na escola — ou seja, entre seu horário de entrada e saída do dia correspondente. O sistema coleta esses horários no momento do pré-cadastro, exige o preenchimento para professores já aprovados que ainda não os tenham, e permite edição a qualquer tempo pelo próprio professor, pelo coordenador e pelo administrador.

Além disso, nenhum professor pode acumular mais de 32 aulas por semana (próprias + substituições), sendo excluídas dessa contagem as aulas em turmas de formação (ATPCG, ATPCS, Multiplia, PDA, alinhamentos e demais atividades vinculadas a `sharedSeries` no `meta/config`).

---

## Stack Tecnológica

- **Frontend:** React 18.3.1 + Vite 5 + Tailwind CSS 3.4.10
- **Estado:** Zustand 4.5.4 (`useAppStore`, `useAuthStore`)
- **Backend/DB:** Firebase Firestore — coleções `teachers/` e `pending_teachers/`
- **Lógica de negócio:** `src/lib/absences.js` (ranking/disponibilidade), `src/lib/helpers.js` (utilitários de data/hora)
- **Roteamento:** React Router DOM 6

---

## Páginas e Rotas

### PendingPage — renderizada quando `role === 'pending'`

**Descrição:** Formulário de pré-cadastro exibido ao professor que aguarda aprovação. Já coleta telefone e matérias (spec anterior). Este spec adiciona o bloco de horários de entrada e saída por dia da semana como um terceiro passo ou seção do mesmo formulário.

**Componentes:**
- `PreCadastroForm` (existente, a ser estendido): adicionar seção "Seus horários na escola" com campos de entrada e saída para cada dia útil (segunda a sexta)
- `HorarioDiaSemana` (componente local, definido no mesmo arquivo): linha com label do dia, input de entrada e input de saída; permite deixar o dia em branco (professor não trabalha naquele dia)

**Behaviors:**
- [ ] Ver seção "Seus horários na escola" abaixo das matérias, com cinco linhas (Segunda a Sexta)
- [ ] Para cada dia, preencher horário de entrada e horário de saída via `<input type="time">` (formato HH:MM)
- [ ] Deixar um dia completamente em branco para indicar que não trabalha naquele dia (validação: se um dos dois campos estiver preenchido, o outro também é obrigatório — não é válido ter apenas entrada ou apenas saída)
- [ ] Ver mensagem de validação inline caso a saída seja anterior ou igual à entrada no mesmo dia
- [ ] Submeter o formulário com os horários incluídos (campo `horariosSemana` salvo no doc `pending_teachers/{uid}`)
- [ ] Ver o botão "Enviar cadastro" permanecer desabilitado enquanto houver erro de validação nos horários

---

### SettingsPage — `/settings` (aba Perfil)

**Descrição:** Aba de perfil acessível por todos os roles após aprovação. Exibe os dados do professor e, quando os horários de entrada/saída ainda não estiverem preenchidos, exibe um aviso de destaque com formulário embutido para preenchimento imediato. Quando já preenchidos, exibe os horários com opção de edição.

**Componentes:**
- `AvisoHorariosPendentes` (componente local, uso único): banner de alerta exibido quando `teacher.horariosSemana` está ausente ou vazio; contém o formulário `HorariosSemanaForm` diretamente inline para permitir preenchimento sem navegar a outra tela
- `HorariosSemanaForm` (componente local, uso único): formulário com cinco linhas de dias úteis (entrada + saída cada); reutilizado tanto no aviso quanto na edição normal
- `SecaoHorarios` (componente local, uso único): exibe os horários preenchidos em modo leitura com botão "Editar horários" que abre o `HorariosSemanaForm` em modo edição (inline ou modal)

**Behaviors — professor sem horários cadastrados:**
- [ ] Ao abrir a aba Perfil, ver banner de aviso de alta visibilidade: "Seus horários na escola ainda não foram informados. Preencha agora para aparecer como substituto disponível."
- [ ] Preencher os horários de entrada e saída para cada dia diretamente no banner (sem navegação adicional)
- [ ] Salvar os horários via botão "Salvar horários" — persiste `horariosSemana` no doc `teachers/{id}` via `patchTeacherSelf(id, { horariosSemana })` (para o próprio professor) ou `updateDocById('teachers', id, { horariosSemana })` (para admin/coord)
- [ ] Após salvar, o banner de aviso desaparece e a seção de horários passa ao modo leitura
- [ ] Ver toast de confirmação "Horários salvos com sucesso"

**Behaviors — professor com horários cadastrados:**
- [ ] Ver tabela/lista de horários por dia em modo leitura (Segunda a Sexta: entrada — saída; dias sem horário exibem "—")
- [ ] Clicar "Editar horários" para entrar em modo edição (campos `<input type="time">` com valores pré-preenchidos)
- [ ] Editar qualquer combinação de dias
- [ ] Salvar alterações — persiste via mesma função de patch
- [ ] Cancelar edição sem salvar — dados retornam ao estado anterior
- [ ] Ver toast de confirmação após salvar

**Behaviors — admin ou coordenador editando perfil de outro professor:**
- [ ] Acessar o perfil de qualquer professor via SettingsPage → aba "Professores" → botão de edição
- [ ] Ver a seção de horários do professor com os mesmos controles de leitura/edição
- [ ] Editar e salvar horários de outro professor via `updateDocById('teachers', id, { horariosSemana })`
- [ ] Ver toast de confirmação "Horários de [Nome] atualizados"

---

### CalendarPage / CalendarDayPage — `/calendar` e `/calendar/day`

**Descrição:** Páginas de marcação de substituições. Nenhuma alteração visual é necessária nesta fase. A lógica de disponibilidade descrita abaixo é aplicada internamente pelas funções de ranking.

**Behaviors (nenhuma mudança de UI — comportamento interno apenas):**
- [ ] Ao calcular candidatos para substituto, desconsiderar professores cujo horário de entrada/saída no dia da falta não cobre o slot em questão
- [ ] Ao calcular candidatos, desconsiderar professores que já atingiram 32 aulas na semana (próprias + substituições, excluindo turmas de formação)

---

## Componentes Compartilhados

- `HorariosSemanaForm`: definido em `src/pages/SettingsPage.jsx` como componente local (uso em dois pontos da mesma página: aviso e edição normal). Recebe `value` (objeto `horariosSemana`), `onChange` e `onSave` / `onCancel`. Renderiza cinco linhas (`Segunda` a `Sexta`), cada uma com dois `<input type="time">`.
- Sem novos componentes em `src/components/` — todos os novos elementos são de uso único dentro de suas respectivas páginas.

---

## Modelos de Dados

### `teachers/` — campo adicionado

```js
{
  // ... campos existentes (id, name, email, celular, subjectIds, status, profile, apelido, whatsapp) ...

  horariosSemana: {
    "Segunda": { entrada: "07:00", saida: "12:30" },
    "Terca":   { entrada: "07:00", saida: "12:30" },
    "Quarta":  { entrada: "07:00", saida: "17:00" },
    "Quinta":  { entrada: "13:00", saida: "17:30" },
    "Sexta":   { entrada: "07:00", saida: "12:30" }
    // Um dia ausente do objeto = professor não trabalha naquele dia
  }
}
```

- Chaves são os mesmos labels usados no campo `day` de `schedules/`: `"Segunda"`, `"Terca"`, `"Quarta"`, `"Quinta"`, `"Sexta"`.
- Um par `{ entrada, saida }` com strings vazias `""` ou ausência da chave equivalem a "não trabalha naquele dia".
- O campo é opcional no schema — professores sem `horariosSemana` são tratados como disponíveis o dia inteiro para não bloquear o sistema antes do preenchimento (comportamento de fallback transitório, descrito nas Regras de Negócio).

### `pending_teachers/` — campo adicionado

```js
{
  // ... campos existentes ...
  horariosSemana: { /* mesmo formato de teachers/ */ }
}
```

Ao aprovar (`approveTeacher` em `db.js`), o campo `horariosSemana` já lido do doc pendente é copiado para o novo doc em `teachers/`, assim como já ocorre com `celular` e `subjectIds`.

---

## Regras de Negócio

### RN-01 — Disponibilidade por horário de entrada/saída

Para que um professor seja candidato válido a substituto em um slot, o intervalo de tempo do slot (`inicio`..`fim`, derivado de `resolveSlot(timeSlot, periodConfigs)` em `periods.js`) deve estar **inteiramente contido** no intervalo `entrada`..`saida` do professor para aquele dia da semana.

Condição de disponibilidade:
```
entrada_professor <= inicio_slot  E  fim_slot <= saida_professor
```

Se o professor não tiver `horariosSemana` cadastrado (campo ausente ou vazio), ele é considerado disponível para todos os slots do dia — comportamento de fallback para não bloquear o sistema durante a migração de dados.

### RN-02 — Limite semanal de 32 aulas

Um professor não pode ser designado como substituto se, na semana da falta, a soma de aulas dele já ultrapassar ou atingir 32. O cálculo considera:

- **Aulas próprias da semana:** schedules do professor para os dias úteis da semana corrente (contando apenas dias já ocorridos + o dia da falta)
- **Substituições já confirmadas na semana:** slots em `absences/` onde `substituteId === professor.id` e `date` cai na mesma semana ISO

**Excluídos da contagem:** qualquer aula (schedule ou substituição) cuja turma ou subjectId pertença a uma entrada de `sharedSeries` no `meta/config` (turmas de formação: ATPCG, ATPCS, Multiplia, PDA, alinhamentos etc.). A identificação é feita verificando se `schedule.turma` corresponde ao `name` de alguma `sharedSeries`, ou se `schedule.subjectId` corresponde ao `id` de alguma `activity` dentro de `sharedSeries`.

Se a soma for 32 ou mais, o professor é descartado do ranking de candidatos para aquela substituição.

### RN-03 — Validação de entrada/saída no formulário

- Ambos os campos (`entrada` e `saida`) devem ser preenchidos juntos ou deixados vazios juntos — não é válido ter apenas um dos dois.
- `saida` deve ser estritamente posterior à `entrada` no mesmo dia (rejeitar valores iguais).
- Não é necessário que o professor informe todos os cinco dias — dias em branco indicam que ele não trabalha naquele dia.

### RN-04 — Aviso para professores sem horários

Quando um professor aprovado acessa `SettingsPage` (aba Perfil) e seu campo `horariosSemana` está ausente ou vazio, o sistema exibe um banner de aviso de alta visibilidade no topo da aba. O banner permanece visível até que os dados sejam salvos. O professor não é bloqueado de usar o sistema, mas receberá o aviso em todas as visitas enquanto não preencher os horários.

### RN-05 — Permissões de edição

| Quem | Pode editar horários de quem |
|------|------------------------------|
| Professor (`teacher`) | Somente os próprios horários |
| Coordenador (`coordinator` / `teacher-coordinator`) | Qualquer professor — via aba "Professores" da SettingsPage (ação interceptada via `pending_actions` quando necessário) |
| Admin | Qualquer professor — diretamente, sem aprovação |

### RN-06 — Integração com o algoritmo de ranking (`rankCandidates`)

A função `rankCandidates` em `src/lib/absences.js` deve ser estendida com duas novas verificações, aplicadas **antes** do cálculo de score:

1. `isAvailableBySchedule(teacher, day, timeSlot, periodConfigs)` — verifica RN-01
2. `isUnderWeeklyLimit(teacher, date, schedules, absences, sharedSeries)` — verifica RN-02

Professores que não passarem em qualquer uma dessas verificações são descartados do ranking exatamente como hoje ocorre com `isBusy()`.

### RN-07 — Turmas de formação excluídas do limite semanal

A identificação de uma aula como "formação" segue esta lógica, em ordem de prioridade:

1. `schedule.turma` é igual ao `name` de algum item em `meta/config.sharedSeries` (ex: `"FORMAÇÃO"`)
2. `schedule.subjectId` é igual ao `id` de alguma `activity` dentro de qualquer `sharedSeries`

Se qualquer condição for verdadeira, a aula não é contabilizada no limite de 32 aulas/semana.

---

## Fora do Escopo (v1)

- Alteração visual das grades horárias exibidas por professor (SchedulePage, SchoolSchedulePage) — os horários de entrada/saída não aparecem nas grades nesta versão
- Notificação automática ao professor solicitando o preenchimento dos horários (ex: e-mail, WhatsApp)
- Histórico de alterações dos horários de entrada/saída
- Horários diferenciados por quinzena, semana par/ímpar ou período letivo
- Integração dos horários com o cálculo de carga horária mensal existente (`WorkloadPage`) — permanece inalterada
- Exibição dos horários de entrada/saída nos relatórios PDF existentes
- Validação de sobreposição entre o horário de entrada/saída e os slots já cadastrados na grade do professor
- Alteração no modelo de `schedules/` — os schedules permanecem sem referência a `horariosSemana`
- Migração retroativa automática de professores existentes (o preenchimento é feito sob demanda via aviso na aba Perfil)
