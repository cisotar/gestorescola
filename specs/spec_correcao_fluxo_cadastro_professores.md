# Spec: Correção de Fluxo de Cadastro de Novos Professores

## Visão Geral

Refinamento do fluxo de onboarding de novos professores na `PendingPage`. O professor recém-registrado passa por 3 steps (`form` → `schedule` → `waiting`) antes de ser aprovado. Esta spec corrige 4 problemas críticos:

1. **Envio sem aulas** — o professor pode submeter cadastro sem cadastrar aulas
2. **Matérias não carregam** — primeira carga de matérias não exibe, requer reload
3. **Sem sugestão de cópia de horário** — após primeira entrada/saída, não oferece copiar para outros dias
4. **Sem feedback claro de erro** — validações de erro não usam modal, deixam usuário confuso

## Stack Tecnológica

- **Frontend:** React 18 + TypeScript (JSX), Tailwind CSS
- **Estado:** componente local (useState) — sem Zustand neste formulário
- **Backend:** Firebase Firestore (`pending_teachers/{uid}`) via `updatePendingData()`
- **Arquivo principal:** `src/pages/PendingPage.jsx`
- **Componentes:** `ScheduleGrid` (importado), `HorarioDiaSemana` (co-localizado)

---

## Páginas e Rotas

### PendingPage — `/` (role=pending)

**Descrição:** Fluxo de cadastro em 3 steps obrigatórios. Professor não pode avançar sem completar cada step.

**Componentes internos:**
- `HorarioDiaSemana`: linha de par entrada/saída por dia
- `ScheduleGrid`: grade de cadastro de aulas (importado)
- `ModalErroValidacao`: modal que lista erros de validação (novo)
- `ModalCopiaHorario`: modal que oferece copiar horário para outros dias (novo)

**Behaviors:**

- [ ] **Fix #1 — Bloquear envio sem aulas:** o botão "Enviar cadastro" no step `form` fica desabilitado enquanto não há aulas cadastradas na `ScheduleGrid`. Critério: `myScheduleCount === 0` bloqueia.
  - Adicionar validação: se usuário clica "Enviar cadastro" com 0 aulas, exibir modal de erro específico.
  - Remover botão "Pular por agora" do step `schedule` — grade é **obrigatória**.

- [ ] **Fix #2 — Carregar matérias corretamente na primeira renderização:** na primeira abertura da `PendingPage`, as matérias devem estar visíveis sem precisar reload.
  - Investigar por que `subjects` não são carregadas do store na renderização inicial.
  - Garantir que `useAppStore().subjects` está preenchido antes de renderizar a seção de matérias.
  - Se necessário, adicionar loading state enquanto `subjects` carrega.

- [ ] **Fix #3 — Sugerir cópia de horário:** após o usuário preencher entrada+saída no primeiro dia com valor completo e válido, exibir modal oferecendo copiar esse horário para os demais dias.
  - Modal deve ter: texto explicativo + botão "Copiar para toda semana" + botão "Não, obrigado".
  - Ao clicar "Copiar", replicar `{ entrada, saida }` para todos os 5 dias úteis (Segunda–Sexta).
  - Modal aparece apenas uma vez por sessão (flag `horarioCopiaOfertado`).

- [ ] **Fix #4 — Modal de validação de erros:** quando validação falha (matérias vazias, celular inválido, horários incompletos), exibir modal listando **todos** os erros em vez de inline messages.
  - Modal mostra:
    - ❌ Erro 1: "Selecione ao menos uma matéria"
    - ❌ Erro 2: "Celular inválido (use formato: 11987654321)"
    - ❌ Erro 3: "Preencha horários de entrada e saída"
  - Usuário fecha modal e corrige os campos.

---

## Componentes Compartilhados

**Nenhum novo componente compartilhado.** Todos os novos componentes (modais) ficam co-localizados em `PendingPage.jsx`, acima do `export default`.

---

## Modelos de Dados

**Nenhuma mudança no modelo de dados.** Estrutura de `pending_teachers/{uid}` permanece:

```js
{
  horariosSemana: {
    "Segunda": { entrada: "07:30", saida: "12:30" },
    // ...
  },
  subjectIds: ["subj-bio"],
  celular: "11987654321"
}
```

---

## Regras de Negócio

1. **Aulas são obrigatórias para envio:** Professor não pode submeter cadastro (`step: 'form' → 'waiting'`) sem cadastrar ao menos 1 aula em `ScheduleGrid`.

2. **Horários de entrada/saída são obrigatórios:** Manter validação existente — ao menos 1 dia com par entrada+saída completo.

3. **Sugestão de cópia é UX, não validação:** Aparecer após primeiro par válido preenchido, sem bloquear o fluxo.

4. **Matérias devem carregar na primeira abertura:** Não forçar reload — carregar do store inicializado.

5. **Modal de erro lista todos os problemas de uma vez:** Não exibir erros inline ou em sequência — tudo no modal.

---

## Alterações Cirúrgicas Necessárias

### Alteração 1: Validar se há aulas antes de avançar para waiting

**Antes (linha ~X — step form submit):**
```jsx
// Apenas validava matérias e celular
if (selectedSubjs.length === 0) { ... }
if (!validatePhone(celular)) { ... }
// Permitia avançar direto para waiting sem verificar aulas
```

**Depois:**
```jsx
// Validar aulas também
if (myScheduleCount === 0) {
  setModalErro({
    aberto: true,
    erros: ["Cadastre ao menos uma aula na grade ao lado para concluir"]
  })
  return
}
```

### Alteração 2: Carregar subjects corretamente no primeiro render

**Antes:**
```jsx
// subjects não era passado ao componente ou era undefined na primeira abertura
const subjects = ... // undefined ou vazio
```

**Depois:**
```jsx
// Importar subjects direto do store
const { subjects } = useAppStore()

// Aguardar subjects carregar se ainda não estiverem
if (!subjects || subjects.length === 0) {
  return <div>Carregando matérias...</div>
}
```

### Alteração 3: Oferecer modal de cópia de horário

**Novo componente co-localizado:**
```jsx
function ModalCopiaHorario({ open, onClose, onConfirm }) {
  return (
    <Modal open={open} onClose={onClose}>
      <h2>Copiar horário para toda semana?</h2>
      <p>Deseja aplicar esse horário de entrada e saída para todos os dias da semana?</p>
      <button onClick={onConfirm}>Copiar para toda semana</button>
      <button onClick={onClose}>Não, obrigado</button>
    </Modal>
  )
}
```

**Trigger em handleChangeHorario (após preenchimento do primeiro par válido):**
```jsx
if (!horarioCopiaOfertado && novoHorario.entrada && novoHorario.saida) {
  setHorarioCopiaOfertado(true)
  setModalCopiaAberto(true)
}
```

### Alteração 4: Modal de erros de validação

**Novo componente co-localizado:**
```jsx
function ModalErroValidacao({ open, erros, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Dados Incompletos">
      <div className="space-y-2">
        {erros.map((erro, idx) => (
          <div key={idx} className="flex gap-2">
            <span>❌</span>
            <span>{erro}</span>
          </div>
        ))}
      </div>
      <button onClick={onClose}>Corrigir</button>
    </Modal>
  )
}
```

**Chamada em handleSubmit (step form):**
```jsx
const erros = []
if (selectedSubjs.length === 0) erros.push("Selecione ao menos uma matéria")
if (!validatePhone(celular)) erros.push("Celular inválido")
if (!temAoMenosUmDiaCompleto) erros.push("Preencha horários de entrada e saída")
if (myScheduleCount === 0) erros.push("Cadastre ao menos uma aula na grade")

if (erros.length > 0) {
  setModalErroAberto(true)
  setErrosValidacao(erros)
  return
}
```

---

## Fora do Escopo (v1)

- Validação em tempo real de horário (atual: só valida ao clicar em enviar)
- Sugestão de cópia automática sem modal (apenas com confirmação)
- Persistência parcial do formulário em rascunho
- Validações no Firestore Security Rules
- Alterações no step `schedule` além de remover botão "Pular por agora"
- Alterações no step `waiting`

