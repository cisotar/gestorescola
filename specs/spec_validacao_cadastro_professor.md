# Spec: Validação do Formulário de Cadastro de Professores (PendingPage)

## Visão Geral

Correção e endurecimento das validações do formulário de onboarding de novos professores (`PendingPage`). O professor recém-registrado preenche dados pessoais, seleciona matérias e informa seus horários antes de ser aprovado pelo administrador. O objetivo é garantir que nenhum cadastro incompleto chegue ao admin — especialmente sem horários preenchidos.

## Stack Tecnológica

- Frontend: React 18 + TypeScript (JSX), Tailwind CSS
- Estado: componente local (useState) — sem Zustand neste formulário
- Backend: Firebase Firestore (`pending_teachers/{uid}`) via `updatePendingData()`
- Arquivo principal: `src/pages/PendingPage.jsx`

---

## Diagnóstico do Estado Atual

### O que já está implementado corretamente

| Requisito | Status | Onde |
|---|---|---|
| Ao menos uma matéria selecionada | Implementado | `handleSubmit` — verifica `selectedSubjs.length === 0`, seta `subjError` |
| Celular obrigatório e com formato válido | Implementado | `validatePhone()` chamado em `handleSubmit` |
| Ao menos um dia com horário completo | Implementado na validação | `!temAoMenosUmDiaCompleto` bloqueia o `handleSubmit` |
| Erros de par entrada/saída inválido | Implementado | `hasHorarioError` derivado de `horarioErrors` — bloqueia o botão |

### O que está quebrado — Requisito 4

**Problema:** o botão "Enviar cadastro" **não é desabilitado** enquanto os horários estão vazios — apenas após a primeira tentativa de envio.

Código atual do `disabled`:
```js
disabled={saving || hasHorarioError || (tentouEnviar && !temAoMenosUmDiaCompleto)}
```

A condição `tentouEnviar && !temAoMenosUmDiaCompleto` depende de `tentouEnviar === true`, que só vira `true` quando o usuário clica em "Enviar cadastro" pela primeira vez. Resultado: um professor pode abrir o formulário, não preencher nenhum horário, e o botão aparece ativo e clicável — a proteção real só ocorre no `handleSubmit`, mas a UX comunica que o formulário está pronto para envio.

**Comportamento esperado:** o botão deve estar desabilitado enquanto `!temAoMenosUmDiaCompleto`, independente de `tentouEnviar`.

### Problema secundário de UX

A mensagem de erro de horário (`"Preencha pelo menos um dia com horário de entrada e saída"`) só é exibida quando `tentouEnviar && !temAoMenosUmDiaCompleto`. Isso é aceitável como feedback tardio (mostrar o erro só quando o usuário tentou enviar), mas o botão em si não deve aguardar `tentouEnviar` para ser desabilitado.

---

## Páginas e Rotas

### PendingPage — renderizada diretamente por `App.jsx` quando `role === 'pending'`

**Descrição:** Tela de onboarding do professor recém-cadastrado. Dividida em três steps: `form` (dados + matérias + horários de presença), `schedule` (grade horária de aulas) e `waiting` (confirmação de envio). Esta spec trata exclusivamente do step `form`.

**Componentes internos (co-localizados no mesmo arquivo):**
- `HorarioDiaSemana`: exibe um par de inputs (entrada/saída) para um dia da semana; valida o par e exibe erro inline
- `validatePhone`: função pura — retorna string de erro ou `null`

**Derivados calculados:**
- `horarioErrors`: objeto `{ [day]: string | null }` — erros de par incompleto ou ordem inválida por dia
- `hasHorarioError`: `true` se qualquer `horarioErrors[day]` for não-nulo
- `temAoMenosUmDiaCompleto`: `true` se ao menos um dia tem `entrada` e `saida` válidos e em ordem

**Behaviors:**

- [ ] Bloquear botão enquanto horários ausentes: o botão "Enviar cadastro" deve estar `disabled` quando `!temAoMenosUmDiaCompleto`, sem aguardar `tentouEnviar`. A condição correta é `disabled={saving || hasHorarioError || !temAoMenosUmDiaCompleto}`.

- [ ] Remover dependência de `tentouEnviar` do `disabled`: a variável `tentouEnviar` pode continuar existindo para controlar **somente a exibição** das mensagens de erro de matéria e celular (que só devem aparecer após o primeiro clique), mas não deve mais participar da expressão `disabled` do botão.

- [ ] Manter exibição condicional da mensagem de erro de horário: a mensagem `"Preencha pelo menos um dia com horário de entrada e saída"` deve continuar sendo exibida apenas quando `tentouEnviar && !temAoMenosUmDiaCompleto` — o comportamento de mostrar o erro só após tentativa é correto e não deve ser alterado.

- [ ] Validar ao menos uma matéria (existente, manter): `handleSubmit` deve continuar verificando `selectedSubjs.length === 0` e exibindo `subjError`.

- [ ] Validar celular obrigatório (existente, manter): `handleSubmit` deve continuar chamando `validatePhone(celular)` e exibindo `phoneError`.

- [ ] Não enviar se `hasHorarioError` (existente, manter): pares de horário com entrada sem saída, saída sem entrada ou saída antes da entrada continuam bloqueando o envio.

---

## Componentes Compartilhados

Nenhum componente externo de `src/components/` é afetado por esta spec. Toda a mudança está em `PendingPage.jsx`.

---

## Modelos de Dados

Nenhuma mudança no modelo de dados. O campo `horariosSemana` já é salvo via `updatePendingData()` e depois transferido para `teachers/` na aprovação.

```js
// pending_teachers/{uid} — campo relevante
horariosSemana: {
  "Segunda": { entrada: "07:30", saida: "12:30" },
  "Terça":   { entrada: "07:30", saida: "12:30" },
  // ... dias opcionais; dias em branco não aparecem
}
```

---

## Regras de Negócio

1. **Botão bloqueado sem horários:** o professor não pode submeter o formulário (`step: 'form'`) enquanto não informar ao menos um dia completo (entrada + saída válidos). O botão deve estar visivelmente desabilitado desde o carregamento da página.

2. **Par entrada/saída é atômico:** um dia com entrada preenchida mas saída vazia (ou vice-versa) é inválido. Esse erro (`hasHorarioError`) também bloqueia o botão — já implementado, manter.

3. **Saída deve ser após entrada:** `saida <= entrada` é inválido. Também bloqueia o botão — já implementado, manter.

4. **Matérias e celular são obrigatórios:** validados no `handleSubmit`. Erros só são exibidos após tentativa de envio — comportamento correto, manter.

5. **`tentouEnviar` controla apenas visibilidade de mensagens:** a variável não deve mais influenciar se o botão está habilitado ou não.

---

## Alteração Cirúrgica Necessária

Apenas uma linha precisa ser alterada em `PendingPage.jsx`:

**Antes (linha 270):**
```jsx
disabled={saving || hasHorarioError || (tentouEnviar && !temAoMenosUmDiaCompleto)}
```

**Depois:**
```jsx
disabled={saving || hasHorarioError || !temAoMenosUmDiaCompleto}
```

Nenhuma outra alteração é necessária. A lógica de `handleSubmit`, as mensagens de erro e os demais comportamentos já estão corretos.

---

## Fora do Escopo (v1)

- Validação em tempo real de celular enquanto o usuário digita (atual: só valida ao clicar em enviar)
- Highlight visual dos campos de matéria ou celular antes de `tentouEnviar`
- Persistência parcial do formulário em rascunho (re-entry já funciona apenas para celular preenchido)
- Alterações no step `schedule` ou no step `waiting`
- Validações no lado do Firestore (Security Rules)
