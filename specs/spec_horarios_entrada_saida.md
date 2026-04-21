# Spec: Horários de Entrada/Saída — GradesPage e PendingPage

## Visão Geral

Duas melhorias relacionadas ao campo `teacher.horariosSemana` (horários de entrada e saída por dia da semana):

1. **Feature 1 — GradesPage:** Exibir e permitir edição inline dos horários de entrada/saída do professor diretamente na página `/grades`, antes de cada grade de aulas, sem precisar navegar para Settings.

2. **Feature 2 — PendingPage:** Tornar o preenchimento de horários obrigatório no step `form` antes de o professor pendente avançar para o step `schedule`. Atualmente é opcional.

Ambas as features compartilham a lógica visual já implementada nos componentes `SecaoHorarios`, `HorariosSemanaForm` e `HorarioDiaSemana`, que estão **duplicados** em `TabTeachers.jsx` e `TabProfile.jsx`. Uma oportunidade de extração para componente compartilhado está documentada mas é opcional nesta versão.

---

## Stack Tecnológica

- **Frontend:** React 18.3.1 + Tailwind CSS 3.4
- **Estado:** Zustand (`useAppStore`, `useAuthStore`)
- **Backend/DB:** Firebase Firestore — coleção `teachers/`, documento `pending_teachers/{uid}`
- **Actions do store:** `store.updateTeacherProfile(id, changes)` e `store.updateTeacher(id, changes)`
- **Persistência pendente:** `updatePendingData(uid, data)` em `src/lib/db`
- **Constantes:** `DAYS` de `src/lib/constants` — `["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]`

---

## Páginas e Rotas

### GradesPage — `/grades`

**Descrição:** Página de grades horárias. Na aba "Por Professor", quando um professor está selecionado, exibir um componente compacto de horários de entrada/saída **acima** de cada `GradeTurnoCard`. O componente reflete o estado atual de `teacher.horariosSemana` e permite edição inline condicionada às permissões do usuário.

**Componentes:**

- `SecaoHorarios` (extraído ou co-localizado): exibe os horários de entrada/saída por dia no modo leitura; ao clicar "Editar horários", alterna para `HorariosSemanaForm` com inputs `<input type="time">` por dia.
- `HorariosSemanaForm` (extraído ou co-localizado): formulário de edição dos 5 dias com validação por linha (entrada sem saída / saída sem entrada / saída <= entrada).
- `HorarioDiaSemana` (extraído ou co-localizado): linha individual por dia com dois inputs de horário e mensagem de erro inline.

**Behaviors:**

- [ ] Exibir bloco de horários: quando um professor está selecionado na aba "Por Professor", renderizar `SecaoHorarios` acima dos `GradeTurnoCard`s, usando `selectedTeacher.horariosSemana`.
- [ ] Exibir modo leitura: quando não está em edição, listar os 5 dias da semana com `entrada – saida` (ex: `07:00 – 17:00`) ou `—` para dias sem horário cadastrado.
- [ ] Exibir aviso de horários ausentes: se `horariosSemana` estiver vazio ou nulo, exibir texto informativo compacto (ex: "Horários de entrada e saída não cadastrados") ao lado do label da seção.
- [ ] Controlar visibilidade do botão "Editar horários": exibir o botão apenas se `canEditTeacher(myTeacher, selectedTeacher, useAuthStore.getState())` retornar `true`. Professores com `role=teacher` só editam o próprio; admins e coordenadores editam qualquer professor.
- [ ] Entrar em modo edição: ao clicar "Editar horários", exibir `HorariosSemanaForm` com os valores atuais de `selectedTeacher.horariosSemana` pré-preenchidos.
- [ ] Validar campos no modo edição: para cada dia, se apenas entrada ou apenas saída estiver preenchida, exibir erro inline. Se saída <= entrada, exibir erro "Saída deve ser após a entrada". O botão "Salvar horários" fica desabilitado enquanto houver qualquer erro.
- [ ] Salvar horários (professor editando o próprio): chamar `store.updateTeacherProfile(teacher.id, { horariosSemana })`, exibir toast `ok` "Horários salvos com sucesso", sair do modo edição.
- [ ] Salvar horários (admin/coordenador editando outro professor): chamar `store.updateTeacher(teacher.id, { horariosSemana })` (sujeito ao workflow de aprovação de coordenadores), exibir toast `ok` ao concluir, sair do modo edição.
- [ ] Cancelar edição: ao clicar "Cancelar", restaurar os valores originais de `teacher.horariosSemana` e sair do modo edição sem salvar.
- [ ] Remover dia vazio: se o usuário apagar entrada e saída de um dia, remover a chave desse dia do objeto `horariosSemana` (não gravar `{ entrada: '', saida: '' }`).
- [ ] Reagir a troca de professor selecionado: ao mudar o professor no dropdown, redefinir o estado local de `horariosSemana` com os dados do novo professor selecionado e sair de qualquer modo de edição ativo.

---

### PendingPage — `/` (role=pending)

**Descrição:** Fluxo de cadastro em 3 steps (`form` → `schedule` → `waiting`). No step `form`, o campo de horários de entrada/saída passa de opcional para **obrigatório**: o professor deve preencher pelo menos 1 dia completo (entrada E saída válidos, sem erro) para conseguir avançar.

**Componentes:**

- `HorarioDiaSemana` (já existente no arquivo): linha individual de horário por dia.
- Seção de horários no formulário: label, instrução, lista dos 5 dias.

**Behaviors:**

- [ ] Tornar horários obrigatórios: remover a marcação `(opcional)` do label "Seus horários na escola" e exibir `*` de campo obrigatório ao lado do título.
- [ ] Validar ao tentar avançar: ao clicar "Enviar cadastro", além das validações de telefone e matérias já existentes, verificar se `horariosSemana` possui ao menos 1 entrada com `entrada` E `saida` válidos (ambos preenchidos, sem erro de validação por dia).
- [ ] Exibir erro de horários ausentes: se nenhum dia estiver completo, exibir mensagem de erro abaixo da seção de horários, como "Preencha pelo menos um dia com horário de entrada e saída".
- [ ] Bloquear avanço com erros de formato: o botão "Enviar cadastro" permanece desabilitado enquanto `hasHorarioError` for `true` (comportamento já existente — manter).
- [ ] Bloquear avanço sem nenhum dia preenchido: o botão "Enviar cadastro" também deve ficar desabilitado se nenhum dia estiver completamente preenchido (nova condição: `!temAoMenosUmDiaCompleto`).
- [ ] Permitir avanço com ao menos 1 dia válido: uma vez que pelo menos 1 dia tenha entrada e saída preenchidos e sem erro de validação, o critério de horários está satisfeito — o botão pode ser habilitado (sujeito às demais validações de telefone e matérias).
- [ ] Salvar horários ao avançar: o comportamento de persistência ao chamar `updatePendingData` continua inalterado — `horariosSemana` já é enviado junto com os demais campos.

---

## Componentes Compartilhados

### Oportunidade de extração (recomendado, não obrigatório nesta versão)

Os três componentes `HorarioDiaSemana`, `HorariosSemanaForm` e `SecaoHorarios` estão duplicados em:
- `src/components/settings/tabs/TabTeachers.jsx`
- `src/components/settings/tabs/TabProfile.jsx`

E um subconjunto (`HorarioDiaSemana`) está replicado em `PendingPage.jsx`.

A extração para `src/components/ui/SecaoHorarios.jsx` (ou similar) eliminaria a triplicação. A interface pública mínima para reutilização seria:

```jsx
// SecaoHorarios — wrapper com estado e save
<SecaoHorarios
  teacher={selectedTeacher}
  isEditable={canEdit}
  onSaveAdmin={async (hs) => store.updateTeacher(teacher.id, { horariosSemana: hs })}
/>
// Se onSaveAdmin for undefined, usa store.updateTeacherProfile internamente

// HorariosSemanaForm — formulário puro
<HorariosSemanaForm
  value={horariosSemana}
  onChange={setHorariosSemana}
  onSave={handleSave}
  onCancel={handleCancel}
  saving={saving}
/>

// HorarioDiaSemana — linha individual
<HorarioDiaSemana
  day="Segunda"
  value={{ entrada: '07:00', saida: '17:00' }}
  onChange={handleChange}
/>
```

Se a extração não for feita nesta versão, os componentes necessários para `GradesPage` devem ser definidos no mesmo arquivo da página (acima do `export default`), seguindo a convenção do projeto para componentes de uso único.

---

## Modelos de Dados

### `teachers/{id}` — campo relevante

```js
{
  // ...demais campos existentes...
  horariosSemana: {
    "Segunda": { entrada: "07:00", saida: "17:00" },
    "Terça":   { entrada: "07:00", saida: "17:00" },
    "Quarta":  { entrada: "07:00", saida: "13:00" },
    // dias sem horário simplesmente não têm chave no objeto
    // "Quinta" e "Sexta" ausentes = não trabalha nesses dias
  }
}
```

- Dias sem trabalho não possuem chave no objeto (não gravar `{ entrada: '', saida: '' }`).
- Formato de horário: string `"HH:mm"` (padrão do `<input type="time">`).
- Campo é opcional no documento — professores antigos não têm a chave, o que deve ser tratado com `teacher?.horariosSemana ?? {}`.

### `pending_teachers/{uid}` — campo relevante

```js
{
  // ...demais campos...
  horariosSemana: {
    "Segunda": { entrada: "07:00", saida: "17:00" },
    // ...
  }
}
```

Já é persistido via `updatePendingData(uid, { ..., horariosSemana })` no `handleSubmit` da `PendingPage`. A mudança é apenas na validação que controla o avanço de step, não na persistência.

---

## Regras de Negócio

### Permissões de edição em GradesPage

| Usuário | Pode editar | Função de controle |
|---|---|---|
| `role=teacher` | Apenas o próprio perfil | `canEditTeacher(myTeacher, selectedTeacher, authState)` retorna `true` somente quando `myTeacher.id === selectedTeacher.id` |
| `role=teacher-coordinator` | O próprio + professores que coordena (conforme `canEditTeacher`) | `canEditTeacher` já lida com este caso |
| `role=coordinator` | Qualquer professor (sujeito a workflow de aprovação) | `store.updateTeacher` é interceptado e cria `pending_action` |
| `role=admin` | Qualquer professor (direto, sem aprovação) | `store.updateTeacher` executa diretamente |

O professor com `role=teacher` jamais vê o seletor de professor — vê apenas o próprio perfil fixo, então o botão "Editar horários" sempre aparece para ele (pois `canEditTeacher` retorna `true` para o próprio).

### Chamada de store por contexto

| Contexto | Action a chamar |
|---|---|
| Professor editando o próprio | `store.updateTeacherProfile(teacher.id, { horariosSemana })` — não interceptado por workflow de aprovação |
| Admin editando qualquer professor | `store.updateTeacher(teacher.id, { horariosSemana })` — executa diretamente |
| Coordenador editando professor | `store.updateTeacher(teacher.id, { horariosSemana })` — interceptado, cria `pending_action` |

### Validação de horário por dia

Para cada dia com ao menos um campo preenchido:
- Entrada preenchida, saída vazia → erro: "Preencha a saída também"
- Saída preenchida, entrada vazia → erro: "Preencha a entrada também"
- Saída <= entrada (comparação lexicográfica de strings `"HH:mm"`) → erro: "Saída deve ser após a entrada"

Dia completamente vazio (ambos os campos ausentes ou `''`) → sem erro, sem chave no objeto salvo.

### Critério de "ao menos 1 dia completo" (PendingPage)

Um dia é considerado **completo** quando:
1. `entrada` é uma string não vazia
2. `saida` é uma string não vazia
3. Não há erro de validação para esse par (ou seja, `saida > entrada`)

`temAoMenosUmDiaCompleto = DAYS.some(day => { const v = horariosSemana[day]; return v?.entrada && v?.saida && v.saida > v.entrada })`

---

## Fora do Escopo (v1)

- Extração formal de `HorarioDiaSemana`, `HorariosSemanaForm` e `SecaoHorarios` para `src/components/ui/` — recomendada mas não obrigatória nesta entrega; a co-localização no arquivo de página é aceitável.
- Validação de horários de entrada/saída contra os períodos de aula configurados (ex: alertar se o professor entra depois da 1ª aula) — pode ser considerada em versão futura.
- Exibição de horários de entrada/saída na aba "Por Turma" da GradesPage.
- Edição de horários no step `schedule` ou `waiting` da PendingPage.
- Histórico de alterações de horários.
- Notificações push/email ao admin quando um professor altera seus horários.
