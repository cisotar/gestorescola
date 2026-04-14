# Spec: Perfis de Coordenador

## Visão Geral

Adicionar dois novos perfis de usuário ao sistema — **Coordenador Geral** e **Professor Coordenador** — que possuem visão completa do sistema e privilégios administrativos parciais, mas cujas ações de edição precisam de aprovação do ADM (exceto marcação de faltas). A seleção do perfil ocorre no momento em que o ADM aprova um professor pendente, seguindo o fluxo atual de aprovação.

---

## Stack Tecnológica

- **Frontend:** React 18 + Zustand + Tailwind CSS
- **Backend:** Firebase Firestore (regras de segurança)
- **Auth:** Firebase Auth via Google (fluxo existente)
- **Roteamento:** React Router 6

---

## Papéis (Roles)

| Role | Descrição |
|---|---|
| `admin` | Administrador — acesso total, sem restrições |
| `teacher` | Professor — acesso próprio, sem privilégios admin |
| `coordinator` | Coordenador Geral — visão total, ações admin com aprovação ADM, sem aulas regulares, fora do cômputo de substituições |
| `teacher-coordinator` | Professor Coordenador — visão total, ações admin com aprovação ADM, com aulas atribuídas, dentro do cômputo de substituições |
| `pending` | Usuário aguardando aprovação (fluxo existente) |

---

## Páginas e Rotas

### Modal de Aprovação — `SettingsPage → aba "Professores Pendentes"`

**Descrição:** O ADM aprova um professor pendente e define o perfil do usuário. Atualmente o modal só aprova como `teacher`. Será adicionado um seletor de perfil antes de confirmar.

**Componentes:**
- `ProfileSelector`: radio group com 3 opções — Professor, Coordenador Geral, Professor Coordenador
- Descrição inline de cada perfil ao selecionar

**Behaviors:**
- [ ] Selecionar perfil: ADM escolhe entre "Professor", "Coordenador Geral" ou "Professor Coordenador" antes de aprovar
- [ ] Confirmar aprovação: salva o campo `profile` no documento do professor com o valor escolhido (`'teacher'` | `'coordinator'` | `'teacher-coordinator'`)
- [ ] Valor padrão: "Professor" pré-selecionado para não quebrar o fluxo atual

---

### Nova Aba "Aprovações Pendentes" — `SettingsPage`

**Descrição:** Visível somente ao ADM. Lista as ações submetidas por coordenadores que aguardam aprovação. Cada item mostra o coordenador, a ação solicitada, os dados afetados e botões de aprovar/rejeitar.

**Componentes:**
- `PendingActionsList`: lista de cards de ações pendentes
- `PendingActionCard`: card com coordenador, tipo de ação, dados resumidos, timestamp, botões aprovar/rejeitar
- `RejectModal`: modal para o ADM informar motivo da rejeição (opcional)
- Badge de contagem na aba (similar ao badge de professores pendentes na Navbar)

**Behaviors:**
- [ ] Visualizar fila: ADM vê todas as ações com status `'pending'` ordenadas por `createdAt` (mais antigas primeiro)
- [ ] Aprovar ação: ADM clica "Aprovar" → a ação é executada imediatamente no Firestore → status muda para `'approved'` → coordenador vê confirmação na próxima interação
- [ ] Rejeitar ação: ADM clica "Rejeitar" → informa motivo (opcional) → status muda para `'rejected'` → ação não é executada
- [ ] Visualizar detalhes: ADM pode expandir um card para ver os dados completos da ação (ex: quais campos foram alterados)
- [ ] Badge de contagem: aba exibe badge com número de ações pendentes, atualizado em tempo real via `onSnapshot`

---

### Todas as páginas admin — acesso para coordenadores

**Descrição:** As páginas atualmente restritas ao ADM passam a ser acessíveis também para `coordinator` e `teacher-coordinator`. O conteúdo exibido é idêntico ao do ADM, mas as ações de escrita disparam o fluxo de aprovação em vez de serem executadas diretamente.

**Páginas afetadas:**
- `CalendarPage` / `CalendarDayPage`
- `AbsencesPage`
- `SubstitutionsPage`
- `WorkloadPage`
- `DashboardPage`
- `SettingsPage` (abas administrativas)

**Behaviors por página:**

#### CalendarPage / CalendarDayPage
- [ ] Visualizar calendário: coordenadores veem o calendário semanal completo (igual ao ADM)
- [ ] Marcar falta: coordenadores podem registrar ausências diretamente, **sem aprovação ADM** — a ação é executada imediatamente
- [ ] Atribuir substituto: coordenadores podem atribuir substitutos diretamente, **sem aprovação ADM** — a ação é executada imediatamente
- [ ] Limpar substitutos do dia: coordenadores podem limpar substitutos, **sem aprovação ADM**

#### WorkloadPage
- [ ] Visualizar carga horária: coordenadores veem a tabela completa de carga de todos os professores
- [ ] Excluir Coordenador Geral do cômputo: professores com `profile: 'coordinator'` **não aparecem** como candidatos a substitutos e sua carga não é considerada no ranking de substituições
- [ ] Incluir Professor Coordenador no cômputo: professores com `profile: 'teacher-coordinator'` participam normalmente do ranking de substituições

#### SettingsPage (abas de configuração)
- [ ] Visualizar todas as abas: coordenadores veem todas as abas administrativas (configurações, professores, grades, admins, etc.)
- [ ] Editar configurações (submeter para aprovação): ao tentar salvar qualquer configuração (segmentos, períodos, áreas, disciplinas, limites de carga), a ação é colocada na fila de aprovação e um toast informa "Solicitação enviada para aprovação do ADM"
- [ ] Adicionar/editar professor (submeter para aprovação): ao adicionar ou editar dados de um professor, a ação vai para a fila de aprovação
- [ ] Editar grade horária (submeter para aprovação): ao adicionar ou remover aulas de um professor, a ação vai para a fila de aprovação
- [ ] Ações de marcação de falta dentro de Settings: executadas diretamente sem aprovação

#### AbsencesPage / SubstitutionsPage / DashboardPage
- [ ] Visualizar relatórios: coordenadores têm acesso de leitura completo, igual ao ADM
- [ ] Exportar PDF: coordenadores podem exportar relatórios normalmente

---

### HomePage — substituída para coordenadores

**Descrição:** Coordenadores não veem a `HomePage` de professor (stats pessoais). São redirecionados direto para `DashboardPage`, assim como o ADM.

**Behaviors:**
- [ ] Redirecionar ao login: ao fazer login, coordenadores são redirecionados para `/dashboard`

---

### SettingsPage — aba Perfil (para coordenadores)

**Descrição:** Coordenadores podem editar seus próprios dados de perfil (celular, whatsapp, apelido, disciplinas) diretamente, **sem aprovação ADM**, seguindo a regra atual dos professores.

**Behaviors:**
- [ ] Editar perfil próprio: coordenadores editam celular, WhatsApp, apelido e disciplinas sem aprovação — salvo diretamente no Firestore

---

## Modelos de Dados

### `teachers` (campo novo)

```
{
  id:        string,
  name:      string,
  email:     string,
  celular:   string,
  whatsapp:  string,
  apelido:   string,
  subjectIds: string[],
  status:    'approved',
  profile:   'teacher' | 'coordinator' | 'teacher-coordinator',  // NOVO — padrão: 'teacher'
}
```

> Professores existentes sem o campo `profile` são tratados como `'teacher'` (compatibilidade retroativa).

---

### `pending_actions` (coleção nova)

Armazena as ações submetidas por coordenadores aguardando aprovação do ADM.

```
{
  id:              string,          // uid()
  coordinatorId:   string,          // teacher.id do coordenador
  coordinatorName: string,          // para exibição
  action:          string,          // nome da action do store (ex: 'addTeacher', 'updateSchedule')
  payload:         object,          // dados completos da ação para executar ao aprovar
  summary:         string,          // descrição legível (ex: "Adicionar professor João Silva")
  createdAt:       timestamp,
  status:          'pending' | 'approved' | 'rejected',
  reviewedBy:      string | null,   // email do ADM que revisou
  reviewedAt:      timestamp | null,
  rejectionReason: string | null,
}
```

---

## Regras de Negócio

### Perfil e aulas

1. **Coordenador Geral** não pode ter aulas regulares atribuídas (turmas exclusivas). Apenas turmas de formação compartilhadas (exceto eletivas) podem ser atribuídas a ele. Ao tentar atribuir turma regular a um `coordinator` na grade horária, o sistema recusa com mensagem de erro.
2. **Professor Coordenador** pode ter qualquer aula atribuída, como um professor comum.

### Cômputo de substituições

3. **Coordenador Geral** (`profile: 'coordinator'`) é **excluído** de:
   - `rankCandidates()` — não aparece como candidato a substituto
   - `monthlyLoad()` — carga horária não conta para desempate
   - `WorkloadPage` — linha não exibida na tabela de cômputo de substituições (ou exibida com marcador visual de "fora do cômputo")
4. **Professor Coordenador** (`profile: 'teacher-coordinator'`) **participa normalmente** de todos os cálculos acima.

### Aprovação de ações

5. Coordenadores (`coordinator` e `teacher-coordinator`) executam ações admin diretamente **apenas** para:
   - Marcar falta (`createAbsence`)
   - Atribuir substituto (`assignSubstitute`)
   - Limpar substitutos (`clearDaySubstitutes`)
   - Editar o próprio perfil (celular, whatsapp, apelido, subjectIds)
6. Todas as outras ações admin submetidas por coordenadores **não são executadas imediatamente** — são gravadas em `pending_actions` com `status: 'pending'` e aguardam revisão do ADM.
7. Ao aprovar uma `pending_action`, o ADM executa a action do store correspondente com o payload salvo.
8. Ao rejeitar, a action não é executada e o documento recebe `status: 'rejected'` com motivo opcional.
9. O coordenador não recebe notificação em tempo real da aprovação/rejeição nesta versão — verá o resultado na próxima vez que acessar a área afetada.

### Visibilidade

10. Coordenadores têm acesso de **leitura completa** a todas as páginas e dados do sistema (igual ao ADM).
11. O roteamento de coordenadores segue o mesmo caminho do ADM: redirecionamento para `/dashboard` ao fazer login.
12. A Navbar exibe as mesmas abas do ADM para coordenadores.

### Resolução de role

13. A função `_resolveRole` em `useAuthStore.js` é extendida:
    - Email na lista hardcoded ou `admins` collection → `role: 'admin'`
    - Email em `teachers` com `status: 'approved'` e `profile: 'coordinator'` → `role: 'coordinator'`
    - Email em `teachers` com `status: 'approved'` e `profile: 'teacher-coordinator'` → `role: 'teacher-coordinator'`
    - Email em `teachers` com `status: 'approved'` (sem `profile` ou `profile: 'teacher'`) → `role: 'teacher'`
    - Caso contrário → `role: 'pending'`

### Firestore Rules

14. Coordenadores devem ter permissão de escrita em `absences` (marcar faltas diretamente).
15. Coordenadores não devem ter permissão de escrita direta em `teachers`, `schedules`, `meta/config` — essas ações passam pela fila `pending_actions`.
16. `pending_actions`: coordenadores podem criar documentos; somente ADM pode atualizar (aprovar/rejeitar).

---

## Componentes Compartilhados Afetados

- **`Navbar`**: adicionar `isCoordinator()` helper no `useAuthStore`; usar junto com `isAdmin()` para exibir abas admin
- **`useAuthStore`**: adicionar roles `coordinator` e `teacher-coordinator`; adicionar helpers `isCoordinator()` e `isTeacherCoordinator()`
- **`absences.js` → `rankCandidates()`**: filtrar professores com `profile: 'coordinator'` da lista de candidatos
- **`absences.js` → `monthlyLoad()`**: verificar se deve excluir `coordinator` do cálculo (depende do contexto de chamada)
- **`useAppStore`**: actions admin disparadas por coordenadores devem redirecionar para `submitForApproval(action, payload, summary)` em vez de executar diretamente

---

## Fora do Escopo (v1)

- Notificação em tempo real para o coordenador quando sua ação for aprovada/rejeitada
- Histórico de ações aprovadas/rejeitadas visível para o coordenador
- Coordenador poder cancelar uma ação pendente que ainda não foi revisada
- Delegação parcial de aprovação (um coordenador aprovar ação de outro)
- Perfis de coordenador com permissões configuráveis granularmente
- Transferência automática de fila de aprovação se o ADM estiver ausente
