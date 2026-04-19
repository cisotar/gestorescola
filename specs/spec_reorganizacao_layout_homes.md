# Spec: Reorganização de Layout das Homes

## Visão Geral

Refatoração puramente visual de `HomePage.jsx` e `DashboardPage.jsx` para adotar um layout vertical (coluna única) em ambas as páginas. O objetivo é eliminar o grid de duas colunas (`lg:grid-cols-3`) que atualmente divide os action cards e os KPI cards em lados opostos da tela, substituindo-o por uma sequência vertical clara: visão geral da escola → action cards → KPI cards pessoais → estatísticas individuais → tabelas (Dashboard). Nenhuma lógica de negócio, condicional de perfil ou componente será removido — apenas reposicionados no JSX e seus estilos Tailwind ajustados.

---

## Stack Tecnológica

- Frontend: React 18 + Tailwind CSS 3
- Arquivos alterados: `src/pages/HomePage.jsx`, `src/pages/DashboardPage.jsx`
- Componentes movidos (sem alteração interna): `KPICards`, `TeacherKPICards`, `AdminKPICards`, `TeacherStats`, `AulasAtribuidasCard`, `WorkloadTable`
- Build: Vite 5 — sem alterações de configuração

---

## Páginas e Rotas

### HomePage — `/home`

**Descrição:** Página inicial exclusiva para o perfil `teacher`. Apresenta saudação, visão geral da escola, atalhos de ação e dados pessoais do professor logado.

**Layout atual (a ser substituído):**
- `grid grid-cols-1 lg:grid-cols-3` dividindo coluna esquerda (KPICards + TeacherKPICards + TeacherStats) e coluna direita (`lg:col-span-2`) com os action cards.

**Layout alvo (sequência vertical, `space-y-6`):**

```
[ Saudação ]
[ KPICards — Visão Geral da Escola — largura total ]
[ ActionCards — grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ]
[ TeacherKPICards — grid-cols-2 — condicional: myTeacher ]
[ TeacherStats — condicional: myTeacher ]
```

**Componentes:**

- `KPICards`: card "Visão Geral da Escola" com 4 métricas globais (Professores, Aulas/Semana, Faltas, Sem Substituto). Deve ocupar `w-full` sem wrapper de coluna restritiva.
- `ActionCard` (importado de `src/components/ui/ActionCard`): cards de ação rápida. Atualmente 6 cards (Marcar Substituições, Minha Grade condicional, Ver Professores, Grade da Escola, Relatórios de Faltas, Relatórios de Substituições).
- `TeacherKPICards`: dois cards lado a lado (Aulas Atribuídas + Aulas Dadas). Já renderiza `grid grid-cols-2 gap-4` internamente — manter sem alteração interna; apenas reposicionar no JSX para aparecer após os action cards.
- `TeacherStats`: card "Suas estatísticas" com 4 métricas e toggle Este mês / Este ano. Sem alteração interna.

**Behaviors:**

- [ ] Reorganizar o JSX de `HomePage` removendo o `div` com `grid grid-cols-1 lg:grid-cols-3` e suas colunas filhas (`lg:col-span-1` e `lg:col-span-2`).
- [ ] Posicionar `KPICards` diretamente no fluxo principal (`space-y-6`), sem wrapper de coluna, para que ocupe a largura total disponível.
- [ ] Posicionar o grid de `ActionCard`s após `KPICards`, com classes `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`.
- [ ] Posicionar `TeacherKPICards` após o grid de action cards, mantendo a condicional `{myTeacher && ...}`.
- [ ] Posicionar `TeacherStats` após `TeacherKPICards`, mantendo a condicional `{myTeacher && ...}`.
- [ ] Preservar a condicional do card "Minha Grade" (`schedules.some(s => s.teacherId === myTeacher?.id)`).
- [ ] Garantir que o build não apresente erros de lint ou compilação.

---

### DashboardPage — `/dashboard`

**Descrição:** Painel principal para `admin`, `coordinator` e `teacher-coordinator`. Apresenta saudação, stats rápidas (StatPills), visão geral da escola, atalhos de ação, KPI cards do perfil logado, estatísticas pessoais (quando aplicável) e tabelas de aulas/carga horária.

**Layout atual (a ser substituído):**
- StatPills e KPI cards (`AdminKPICards` ou `TeacherKPICards`) acima do grid.
- `grid grid-cols-1 lg:grid-cols-3` dividindo action cards + `TeacherStats` (`lg:col-span-2`) e tabelas `AulasAtribuidasCard` + `WorkloadTable` (`lg:col-span-1`).

**Layout alvo (sequência vertical, `space-y-6`):**

```
[ Saudação ]
[ StatPills — flex flex-wrap gap-3 — mantido como está ]
[ KPICards — Visão Geral da Escola — largura total ]
[ ActionCards — grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ]
[ AdminKPICards — grid-cols-2 — condicional: isAdmin ]
[ TeacherKPICards — grid-cols-2 — condicional: !isAdmin && myTeacher ]
[ TeacherStats — condicional: !isAdmin && myTeacher ]
[ AulasAtribuidasCard + WorkloadTable — grid-cols-1 lg:grid-cols-2 — largura total ]
```

**Componentes:**

- `StatPill` (componente local): pills de stats rápidas (professores, aulas/semana, faltas, sem substituto). Posição e estrutura inalteradas.
- `KPICards` (importado): visão geral da escola. Inserir no fluxo principal em largura total, antes dos action cards. Atualmente ausente no `DashboardPage` — deve ser importado e adicionado.
- `ActionCard` (componente local em `DashboardPage`): 6 cards de ação (Marcar Substituições, Ver Professores, Grade da Escola, Relatórios de Faltas, Relatórios de Substituições, Carga Horária).
- `AdminKPICards` (componente local): dois cards (Total de Aulas Atribuídas + Total de Aulas Dadas no Mês). Renderiza `grid grid-cols-2 gap-4` internamente. Reposicionar para após os action cards; manter condicional `{isAdmin && ...}`.
- `TeacherKPICards` (importado): dois cards pessoais do coordenador logado. Reposicionar para após os action cards; manter condicional `{!isAdmin && myTeacher && ...}`.
- `TeacherStats` (componente local em `DashboardPage`): card "Suas estatísticas". Reposicionar para após `TeacherKPICards`; manter condicional `{!isAdmin && myTeacher && ...}`.
- `AulasAtribuidasCard` (componente local): tabela de aulas atribuídas por professor. Mover para fora do grid de duas colunas; posicionar em seção inferior de largura total.
- `WorkloadTable` (componente local): tabela de aulas dadas, faltas, substituições e saldo. Mover para fora do grid de duas colunas; posicionar ao lado de `AulasAtribuidasCard` em `grid grid-cols-1 lg:grid-cols-2 gap-6`.

**Behaviors:**

- [ ] Importar `KPICards` de `../components/ui/KPICards` em `DashboardPage` (atualmente não importado).
- [ ] Inserir `<KPICards teachers={teachers} schedules={schedules} absences={absences} />` no fluxo principal, após StatPills e antes dos action cards.
- [ ] Remover o `div` com `grid grid-cols-1 lg:grid-cols-3` e suas colunas filhas (`lg:col-span-2` e `lg:col-span-1`).
- [ ] Posicionar o grid de `ActionCard`s diretamente no fluxo principal com classes `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`.
- [ ] Mover `AdminKPICards` para após o grid de action cards, mantendo condicional `{isAdmin && ...}`.
- [ ] Mover `TeacherKPICards` para após o grid de action cards, mantendo condicional `{!isAdmin && myTeacher && ...}`.
- [ ] Mover `TeacherStats` para após os KPI cards pessoais, mantendo condicional `{!isAdmin && myTeacher && ...}`.
- [ ] Criar seção inferior com `<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">` contendo `AulasAtribuidasCard` e `WorkloadTable`, posicionada abaixo de tudo.
- [ ] Garantir que o build não apresente erros de lint ou compilação.

---

## Componentes Compartilhados

| Componente | Localização | Alteração neste spec |
|---|---|---|
| `KPICards` | `src/components/ui/KPICards.jsx` | Nenhuma alteração interna. Adicionado ao `DashboardPage` (importação nova). Reposicionado no `HomePage`. |
| `TeacherKPICards` | `src/components/ui/TeacherKPICards.jsx` | Nenhuma alteração. Reposicionado em ambas as páginas para após os action cards. |
| `ActionCard` | `src/components/ui/ActionCard.jsx` | Nenhuma alteração. Reposicionado no `HomePage`. |

---

## Modelos de Dados

Nenhuma entidade nova. Os componentes continuam consumindo as mesmas props derivadas do store:

| Campo | Origem | Usado em |
|---|---|---|
| `teachers` | `useAppStore().teachers` | KPICards, AdminKPICards, AulasAtribuidasCard, WorkloadTable |
| `schedules` | `useAppStore().schedules` | KPICards, TeacherKPICards, AdminKPICards, TeacherStats, AulasAtribuidasCard, WorkloadTable |
| `absences` | `useAppStore().absences` | KPICards, TeacherKPICards, TeacherStats, WorkloadTable |
| `myTeacher` | `useAuthStore().teacher` | TeacherKPICards, TeacherStats (condicionais) |
| `role` | `useAuthStore().role` | Condicional `isAdmin` em DashboardPage |

---

## Regras de Negócio

As seguintes regras existentes devem ser preservadas sem alteração:

1. **Condicional de perfil em `HomePage`**: `TeacherKPICards` e `TeacherStats` só renderizam quando `myTeacher` existe (professor logado tem documento aprovado no Firestore).
2. **Condicional "Minha Grade" em `HomePage`**: o `ActionCard` de grade pessoal só aparece quando `schedules.some(s => s.teacherId === myTeacher?.id)` é verdadeiro.
3. **Condicional `isAdmin` em `DashboardPage`**: `AdminKPICards` renderiza apenas para `role === 'admin'`; `TeacherKPICards` e `TeacherStats` renderizam apenas para `!isAdmin && myTeacher` (coordenadores com perfil de professor).
4. **Acesso por role**: `HomePage` é exclusiva para `teacher`; `DashboardPage` atende `admin`, `coordinator` e `teacher-coordinator` — as rotas e guards em `App.jsx` não são alterados.
5. **Spinner de carregamento**: ambas as páginas mantêm o retorno antecipado com `<Spinner>` quando `!loaded`.

---

## Fora do Escopo (v1)

- Alterações na lógica de cálculo de qualquer KPI (aulas dadas, faltas, substituições, carga mensal).
- Alterações nos componentes internos de `KPICards`, `TeacherKPICards`, `AdminKPICards`, `TeacherStats`, `AulasAtribuidasCard` ou `WorkloadTable`.
- Adição ou remoção de action cards em qualquer página.
- Alterações no `Navbar`, `Layout`, `ActionCard` (componente compartilhado) ou qualquer outra página além de `HomePage` e `DashboardPage`.
- Alterações nas regras do Firestore, stores Zustand ou lógica de autenticação.
- Responsividade abaixo de `sm:` (mobile < 640px) além do que o layout de coluna única já provê por padrão.
- Dark mode ou alteração de tokens de design.
- Testes automatizados.
