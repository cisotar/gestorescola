# Spec: Gestão de Perfis de Professores

## Visão Geral

Melhora a experiência de atribuição de perfis (professor, coordenador geral, professor coordenador, admin) e a gestão de professores pendentes de aprovação. Consolida num único lugar (aba Professores) toda a administração de perfis, elimina duplicações na página de configurações e melhora a descoberta de professores que aguardam aprovação ou que ainda não têm segmento definido.

---

## Stack Tecnológica

- **Frontend:** React 18 + Tailwind CSS
- **Estado:** Zustand (`useAuthStore`, `useAppStore`)
- **Backend:** Firebase Firestore
- **Roteamento:** React Router v6
- **Página principal afetada:** `src/pages/SettingsPage.jsx`

---

## Perfis de Usuário (domínio)

| Valor interno | Label exibida | Descrição |
|---|---|---|
| `'admin'` | Admin | Administrador com acesso total |
| `'teacher'` | Professor | Professor regular |
| `'coordinator'` | Coordenador Geral | Coordenador sem carga horária |
| `'teacher-coordinator'` | Prof. Coordenador | Professor que também coordena |

> Esses perfis vivem em dois lugares: `role` em `useAuthStore` e `profile` na coleção `teachers` do Firestore. A mudança de perfil pelo admin deve atualizar ambos.

---

## Páginas e Rotas

### Página de Configurações — `/settings`

**Descrição:** Página principal de administração da escola. Contém abas para Segmentos, Disciplinas, Turmas, Professores, Períodos e Horários. A aba Professores concentra toda a gestão de perfis.

---

#### Aba Professores — `TabTeachers` (card view)

**Descrição:** Exibe professores agrupados por segmento em cards. É a visão principal de gestão de professores.

**Componentes:**

- `TeacherToolbar`: Barra de ações acima dos cards. Contém os botões de filtro e ação.
- `PendingTeachersPanel`: Painel deslizável (ou modal) que exibe os cards dos professores aguardando aprovação.
- `NoSegmentPanel`: Painel deslizável (ou modal) que exibe professores aprovados sem segmento definido.
- `TeacherCard`: Card individual do professor com avatar, nome, info e dropdown de perfil.
- `ProfilePillDropdown`: Dropdown estilo pill para selecionar o perfil do professor.

**Behaviors:**

- [ ] **Exibir botão "Aguardando Aprovação":** Quando houver professores na coleção `pending_teachers` com `status: 'pending'`, exibir botão ao lado do `+ Novo Professor` com label `Aguardando Aprovação` e badge com contagem. Quando não houver pendentes, o botão não aparece.
- [ ] **Abrir painel de pendentes:** Ao clicar em "Aguardando Aprovação", exibir os cards dos professores pendentes (atualmente mostrados na seção "Prof sem segmento definido → Pendentes"). Cada card deve ter botões Aprovar e Rejeitar.
- [ ] **Aprovar professor pendente:** Ao aprovar, selecionar o perfil desejado (professor, coordenador geral, prof. coordenador) antes de confirmar. O professor é movido para `teachers` com `status: 'approved'` e o perfil escolhido.
- [ ] **Rejeitar professor pendente:** Ao rejeitar, abrir modal de motivo (comportamento atual mantido).
- [ ] **Exibir botão "Sem Segmento":** Quando houver professores aprovados sem segmento definido, exibir botão ao lado dos demais com label `Sem Segmento` e badge com contagem. Esse botão substitui a seção "Prof sem segmento definido" exibida atualmente no rodapé dos cards.
- [ ] **Abrir painel sem segmento:** Ao clicar em "Sem Segmento", exibir os cards dos professores aprovados sem segmento. Cada card deve ter botões de editar e excluir (comportamento atual mantido).
- [ ] **Alterar perfil via ProfilePillDropdown:** Em cada card de professor aprovado, o dropdown deve listar as 4 opções: `Admin`, `Professor`, `Coordenador Geral`, `Prof. Coordenador`. Selecionar uma opção atualiza `profile` no Firestore e o `role` do usuário autenticado (se aplicável). Exibir toast de confirmação.
- [ ] **Confirmação antes de promover a Admin:** Ao selecionar "Admin" no dropdown, exibir modal de confirmação antes de salvar, pois é uma promoção de alto impacto.

---

#### Aba Professores — `TabTeachers` (table view)

**Descrição:** Exibe professores em tabela com colunas: Nome, E-mail, Telefone, Segmento, Matérias, Perfil, Ações.

**Componentes:**

- `TeacherToolbar`: Mesma barra da visão card (botões compartilhados).
- `ProfilePillDropdown`: Mesmo componente usado nos cards, agora na coluna Perfil da tabela.

**Behaviors:**

- [ ] **Exibir botão "Aguardando Aprovação" na tabela:** Mesmo botão da visão card, abrindo o mesmo painel/modal de pendentes.
- [ ] **Exibir professores pendentes na tabela:** Quando o painel de pendentes estiver aberto, exibir linhas de professores pendentes com badge `Pendente` e ações de Aprovar/Rejeitar (comportamento atual do badge mantido, mas com acesso pelo botão do toolbar em vez de seção separada).
- [ ] **Alterar perfil via ProfilePillDropdown na tabela:** Coluna "Perfil" (atualmente "Status") deve usar o mesmo `ProfilePillDropdown` expandido com as 4 opções. Substituir o dropdown atual que só oferece Admin/Professor.
- [ ] **Confirmação antes de promover a Admin (tabela):** Mesmo comportamento da visão card.

---

### Remoção: Abas "Aprovação" e "Aprovações" — `TabAdmin` e `TabApprovals`

**Descrição:** As abas `✅ Aprovação` (id: `'admin'`) e `🔔 Aprovações` (id: `'approvals'`) devem ser removidas da lista de abas do admin.

**Contexto atual:**
- `TabAdmin` (id: `'admin'`): Exibe botão "Gerenciar solicitações" que abre `PendingModal` para aprovar professores pendentes. **Essa funcionalidade será absorvida pelo botão "Aguardando Aprovação" na aba Professores.**
- `TabApprovals` (id: `'approvals'`): Exibe ações de coordenadores aguardando aprovação do admin (`pending_actions`). **Essa funcionalidade deve ser movida para dentro da aba Professores ou para um local mais adequado antes da remoção.**

> ⚠️ **Atenção:** `TabApprovals` gerencia aprovações de *ações de coordenadores* (não de professores). Antes de remover, garantir que essa funcionalidade seja preservada — sugestão: mover para uma seção colapsável dentro da aba Professores ou criar nova aba "Coordenadores".

**Behaviors:**

- [ ] **Remover aba "Aprovação":** Remover o tab de id `'admin'` e o componente `TabAdmin` da lista de abas do admin. A aprovação de professores pendentes passa a ser feita exclusivamente pelo botão "Aguardando Aprovação" na aba Professores.
- [ ] **Remover aba "Aprovações":** Remover o tab de id `'approvals'` e o componente `TabApprovals`. Mover o conteúdo (aprovação de ações de coordenadores) para local adequado antes da remoção (fora do escopo desta spec — ver Fora do Escopo).
- [ ] **Remover badge de pendentes da aba Aprovações:** O badge de contagem (`subscribePendingActionsCount`) atualmente aparece na aba "Aprovações". Com a remoção, garantir que a informação de ações pendentes ainda seja comunicada ao admin (ex: toast, notificação no topo da página ou no navbar).

---

## Componentes Compartilhados

- **`ProfilePillDropdown`** (novo ou refatorado de `StatusSelect`): Dropdown estilo pill que lista as 4 opções de perfil. Usado nos cards e na tabela de professores. Recebe `value`, `onChange`, `disabled`. Exibe confirmação antes de selecionar Admin.
- **`PendingTeachersPanel`** (novo): Modal ou drawer com lista de professores pendentes. Reutiliza a lógica atual de `PendingModal`.
- **`TeacherToolbar`** (novo ou extraído): Barra de ações da aba Professores. Contém botões `+ Novo Professor`, `Aguardando Aprovação` (condicional) e `Sem Segmento` (condicional), além do toggle card/tabela.

---

## Modelos de Dados

### `pending_teachers` (Firestore)

| Campo | Tipo | Descrição |
|---|---|---|
| `uid` | string | UID Firebase Auth |
| `email` | string | E-mail do usuário |
| `name` | string | Nome completo |
| `photoURL` | string | URL da foto Google |
| `requestedAt` | timestamp | Data da solicitação |
| `status` | `'pending'` | Status fixo nesta coleção |
| `celular` | string? | Opcional |
| `apelido` | string? | Opcional |
| `subjectIds` | string[] | Matérias selecionadas |

### `teachers` (Firestore)

| Campo | Tipo | Descrição |
|---|---|---|
| `uid` | string | UID Firebase Auth |
| `email` | string | E-mail |
| `name` | string | Nome completo |
| `status` | `'approved'` | Status após aprovação |
| `profile` | `'teacher' \| 'coordinator' \| 'teacher-coordinator'` | Perfil do professor |
| `segmentId` | string? | Segmento atribuído |
| `subjectIds` | string[] | Matérias |

> **Obs:** O perfil `'admin'` não é armazenado no campo `profile` da coleção `teachers`. Admins são gerenciados pela coleção `admins`. A promoção a admin via dropdown deve adicionar o usuário à coleção `admins` e atualizar o `role` no auth.

---

## Regras de Negócio

1. **Somente admins podem alterar perfis.** O `ProfilePillDropdown` deve ser desabilitado para não-admins.
2. **Promoção a Admin requer confirmação.** Seleção de "Admin" no dropdown abre modal de confirmação antes de salvar.
3. **Rebaixamento de Admin:** Se um admin for rebaixado para professor/coordenador pelo dropdown, deve ser removido da coleção `admins`. Também requer confirmação.
4. **Aprovação de professor pendente inclui seleção de perfil.** Não é possível aprovar sem escolher um dos 3 perfis: Professor, Coordenador Geral, Prof. Coordenador.
5. **Botão "Aguardando Aprovação" só aparece quando há pendentes.** Se `pending_teachers` estiver vazia, o botão não é renderizado.
6. **Botão "Sem Segmento" só aparece quando há professores aprovados sem segmento.** Se todos tiverem segmento, o botão não é renderizado.
7. **A mudança de perfil `coordinator` ↔ `teacher-coordinator` afeta a carga horária.** Coordenadores Gerais são excluídos do cálculo de carga; Prof. Coordenadores são incluídos.

---

## Fora do Escopo (v1)

- Migração ou novo destino para as **aprovações de ações de coordenadores** (`TabApprovals` / `pending_actions`): a remoção da aba "Aprovações" requer um spec separado para realocar essa funcionalidade.
- Notificações por e-mail ou push ao professor quando seu perfil é alterado.
- Histórico de alterações de perfil (audit log).
- Auto-promoção de coordenador (coordenador solicitando mudança de próprio perfil).
- Fluxo de professor solicitar acesso (já implementado, sem mudanças).
