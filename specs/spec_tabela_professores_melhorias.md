# Spec: Melhorias na Tabela de Professores

## Visão Geral

Refatoração da view em tabela da aba Professores (`/settings?tab=teachers`) para adicionar links de comunicação direta (WhatsApp e e-mail), ordenação interativa por colunas e botão de exclusão de professor com confirmação — tudo restrito à view `table` do `TabTeachers`.

## Stack Tecnológica

- Frontend: React 18 (JSX), Tailwind CSS 3.4, tokens de design do projeto
- Backend: Firebase Firestore (via `store.removeTeacher`)
- Estado global: Zustand (`useAppStore`, `useAuthStore`)
- Utilitários: `toast` de `hooks/useToast`
- Arquivo principal: `src/components/settings/tabs/TabTeachers.jsx`

---

## Páginas e Rotas

### Aba Professores — `/settings?tab=teachers`

**Descrição:** Página de configurações acessível somente pelo admin. Exibe professores aprovados (e pendentes) em dois modos: Cards e Tabela. Este spec trata exclusivamente da view `table`.

**Componentes afetados:**
- `TabTeachers` (componente principal — `src/components/settings/tabs/TabTeachers.jsx`): contém toda a lógica de state e renderização da tabela
- `ProfilePillDropdown` (shared): não é afetado, permanece na coluna Status

**Behaviors:**

- [ ] **Behavior 1 — Renderizar telefone como link WhatsApp:** na coluna "Telefone" da tabela, quando `t.celular` estiver preenchido, renderizar um elemento `<a>` com `href="https://api.whatsapp.com/send?phone=55NUMERO"` onde `NUMERO` é `t.celular` com todos os caracteres não numéricos removidos (parênteses, espaços, hífens). O link deve abrir em nova aba (`target="_blank" rel="noreferrer"`). Exibir ícone de WhatsApp (SVG inline ou emoji "📲") ao lado do número formatado. Quando `t.celular` estiver vazio, exibir `—`.

- [ ] **Behavior 2 — Renderizar e-mail como link mailto:** na coluna "E-mail" da tabela, quando `t.email` estiver preenchido, renderizar um elemento `<a>` com `href="mailto:t.email"`. Exibir o endereço de e-mail como texto do link. Quando `t.email` estiver vazio, exibir `—`.

- [ ] **Behavior 3 — Estilizar links de comunicação:** links de WhatsApp e e-mail devem ter cor `text-accent` (laranja do projeto), `underline` e `hover:text-accent/80` para consistência visual com o design system. Garantir alinhamento vertical correto do ícone com o texto.

- [ ] **Behavior 4 — Adicionar estado de ordenação:** criar state local `sortConfig` com shape `{ key: string | null, dir: 'asc' | 'desc' }` inicializado em `{ key: 'name', dir: 'asc' }` (ordenação padrão por nome A-Z, que já existe na linha `approvedRows`).

- [ ] **Behavior 5 — Tornar cabeçalho "Nome" clicável para ordenar:** ao clicar no `<th>` de Nome, alternar entre `asc` (A-Z) e `desc` (Z-A). Exibir indicador visual de direção (seta ▲ quando asc, ▼ quando desc) ao lado do label quando esta coluna estiver ativa.

- [ ] **Behavior 6 — Tornar cabeçalho "Segmento" clicável para ordenar:** ao clicar no `<th>` de Segmento, ordenar as linhas pelo resultado de `teacherSegmentNames(t)` em ordem alfabética (asc/desc). Exibir indicador visual de direção quando esta coluna estiver ativa.

- [ ] **Behavior 7 — Tornar cabeçalho "Status" clicável para ordenar:** ao clicar no `<th>` de Status, ordenar pelo valor de `currentProfile(t)`. Ordem definida: `admin` → `coordinator` → `teacher-coordinator` → `teacher` → `pending`. Exibir indicador visual de direção quando ativo.

- [ ] **Behavior 8 — Aplicar ordenação sobre `allRows`:** derivar `sortedRows` a partir de `allRows` aplicando a lógica de `sortConfig`. Professores pendentes (`_isPending: true`) devem ser mantidos sempre ao final da lista, independente da coluna de ordenação ativa. Usar `.localeCompare` para strings com `{ sensitivity: 'base' }`.

- [ ] **Behavior 9 — Adicionar coluna "Ações" na tabela:** adicionar um `<th>` com label "Ações" e largura fixa de `w-[80px]` à direita da coluna atual de edição (que já existe sem label). Esta nova coluna substitui ou agrupa a célula de edição existente.

- [ ] **Behavior 10 — Adicionar botão de exclusão (lixeira) na tabela:** para cada linha de professor aprovado, renderizar na célula de Ações um botão ícone de lixeira (`🗑` ou SVG `Trash`). O botão deve ter classe `btn btn-ghost btn-xs text-err` e exibir tooltip `title="Remover professor"`. Visível apenas quando `isAdminUser === true`.

- [ ] **Behavior 11 — Confirmar exclusão antes de deletar:** ao clicar no botão de lixeira de um professor aprovado, exibir `window.confirm("Tem certeza que deseja remover [nome]? Esta ação não pode ser desfeita.")`. Se confirmado, chamar `store.removeTeacher(t.id)` e exibir `toast('Professor removido', 'ok')`. Se cancelado, não executar nenhuma ação.

- [ ] **Behavior 12 — Manter botão de edição na coluna Ações:** o botão de edição (`✏️`) já existente deve permanecer na célula de Ações junto ao botão de lixeira, alinhados horizontalmente com `flex gap-1`.

- [ ] **Behavior 13 — Exibir Ações para professores pendentes na tabela:** para linhas com `_isPending: true`, a célula de Ações deve continuar exibindo os botões "Aprovar" e "✕ Rejeitar" existentes — sem o botão de lixeira (exclusão é apenas para professores aprovados).

- [ ] **Behavior 14 — Indicador visual de coluna ordenável:** cabeçalhos clicáveis devem ter cursor pointer e `hover:bg-surf2` para indicar interatividade. Exibir ícone de ordenação neutro (⇅) quando a coluna não está ativa, e ▲ / ▼ quando está ativa.

---

## Componentes Compartilhados

- `ProfilePillDropdown` (`src/components/settings/shared/ProfilePillDropdown.jsx`): não alterado; permanece na coluna Status exibindo o papel atual do professor.
- `toast` (`src/hooks/useToast.js`): usado para confirmação de exclusão com sucesso.
- `Modal` (`src/components/ui/Modal.jsx`): não alterado neste spec.

## Modelos de Dados

### Teacher (coleção `teachers/`)

```js
{
  id:         string,   // uid() — Document ID
  name:       string,   // exibido na coluna Nome; usado na ordenação asc/desc
  email:      string,   // transformado em link mailto:
  celular:    string,   // transformado em link wa.me após sanitização
  whatsapp:   string,   // campo alternativo; se presente, usa em vez de celular no link WA
  apelido:    string,
  subjectIds: string[],
  profile:    'teacher' | 'coordinator' | 'teacher-coordinator',
  status:     'approved'
}
```

Campos relevantes para este spec: `name`, `email`, `celular`, `whatsapp`, `profile`.

### sortConfig (estado local)

```js
{
  key: 'name' | 'segment' | 'status' | null,
  dir: 'asc' | 'desc'
}
```

## Regras de Negócio

1. **Sanitização do número de telefone para WhatsApp:** remover todo caractere não numérico de `t.celular` com `replace(/\D/g, '')` antes de montar o URL. Prefixar com `55` (código do Brasil). Se o número já começar com `55` e tiver 12+ dígitos, não duplicar o prefixo.

2. **Campo `whatsapp` tem prioridade sobre `celular`:** se `t.whatsapp` estiver preenchido, usar `t.whatsapp` para o link de WhatsApp em vez de `t.celular`. Exibir o valor de `t.celular` como texto mas montar o `href` com `t.whatsapp`.

3. **Exclusão restrita a admin:** o botão de lixeira e o handler de exclusão só são renderizados e executados quando `isAdminUser === true`. Coordenadores visualizam a tabela mas não veem os botões de exclusão.

4. **Professores pendentes não são excluídos pela lixeira:** a ação de exclusão (lixeira) se aplica somente a professores aprovados. Professores pendentes têm seus próprios controles de aprovação/rejeição já existentes.

5. **Ordenação de pendentes:** linhas com `_isPending: true` permanecem sempre ao final da tabela, após todos os aprovados, independente da coluna e direção de ordenação ativa.

6. **Ordem de prioridade para coluna Status:** `admin` (0) → `coordinator` (1) → `teacher-coordinator` (2) → `teacher` (3) → `pending` (4). Em `desc`, inverter a sequência.

7. **Confirmação obrigatória antes de excluir:** nunca chamar `store.removeTeacher` sem antes exibir confirmação via `window.confirm`. A mensagem deve incluir o nome do professor para evitar exclusões acidentais.

## Fora do Escopo (v1)

- Adição de links/ações na view em Cards — este spec trata exclusivamente da view Tabela.
- Filtros de pesquisa por texto (busca por nome ou e-mail).
- Paginação ou virtualização da tabela.
- Exportação da tabela para CSV ou PDF.
- Alteração do fluxo de exclusão de professores pendentes (aprovação/rejeição permanece intacto).
- Alteração de qualquer modal existente (edição, grade horária, painel de pendentes).
- Suporte a múltiplos critérios de ordenação simultâneos (multi-sort).
- Alterações na view Cards ou em outras abas de Settings.
