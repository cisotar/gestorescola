# Spec: Novos Action Cards na HomePage (Painel do Professor)

## Visão Geral

A `HomePage` é o painel exclusivo do professor (`role === 'teacher'`). Atualmente exibe uma saudação personalizada, o bloco de estatísticas (`TeacherStats`) e até 4 `ActionCards` de acesso rápido (Meu Perfil, Relatório de Faltas, Minhas Substituições e Minha Grade — este último condicional à existência de aulas na grade).

A refatoração acrescenta 5 novos `ActionCards` abaixo dos existentes, sem remover, reordenar ou alterar nenhum card atual. Os novos cards ampliam o alcance de navegação do professor para funcionalidades que hoje só são facilmente acessíveis via Navbar.

---

## Stack Tecnológica

- Frontend: React 18 + Vite + Tailwind CSS
- Estado global: Zustand (`useAuthStore`, `useAppStore`)
- Roteamento: React Router v6 (`ActionCard` usa `navigate(to)` internamente)
- Backend/DB: Firebase Firestore (sem alterações nesta refatoração)

---

## Páginas e Rotas

### HomePage — `/home`

**Descrição:** Painel de entrada exclusivo para professores (`role === 'teacher'`). Exibe saudação, bloco de estatísticas do mês/ano e cards de acesso rápido para as principais funcionalidades.

**Componentes:**

- `TeacherStats`: card com estatísticas (aulas atribuídas, aulas dadas, faltas, substituições) com toggle mês/ano — sem alterações
- `ActionCard` (importado de `src/components/ui/ActionCard.jsx`): card clicável com ícone, título, descrição e chevron; prop `primary` usa fundo `navy`

**Behaviors:**

- [ ] Exibir cards existentes: renderizar os 4 ActionCards atuais (Meu Perfil, Relatório de Faltas, Minhas Substituições, Minha Grade) exatamente como estão, preservando a lógica condicional do card "Minha Grade"
- [ ] Exibir novos cards abaixo dos existentes: renderizar os 5 novos ActionCards na sequência definida, na mesma grade responsiva (`grid grid-cols-1 md:grid-cols-3 gap-4`)
- [ ] Navegar para Marcar Substituições: card "Marcar Substituições" navega para `/substitutions`
- [ ] Navegar para Ver Professores: card "Ver Professores" navega para `/settings?tab=teachers`
- [ ] Navegar para Grade Escola: card "Grade Escola" navega para `/school-schedule`
- [ ] Navegar para Relatórios de Faltas: card "Relatórios de Faltas" navega para `/absences`
- [ ] Navegar para Relatórios de Substituições: card "Relatórios de Substituições" navega para `/substitutions`
- [ ] Restringir à role teacher: os novos cards só são renderizados quando `role === 'teacher'`; admin e coordenadores não acessam a `/home`, mas a guard garante que o bloco não aparece em estados inesperados

---

## Componentes Compartilhados

- `ActionCard` (`src/components/ui/ActionCard.jsx`): usado em `HomePage` e `DashboardPage`; aceita `icon`, `label`, `desc`, `to`, `primary`; navega via `useNavigate` ao ser clicado. Nenhuma alteração necessária neste componente.

---

## Modelos de Dados

Nenhuma entidade nova ou alteração de schema. A refatoração é puramente de UI/navegação.

Entidades lidas (somente leitura, já carregadas no store):

| Campo | Fonte | Uso |
|---|---|---|
| `role` | `useAuthStore` | Guard: só `teacher` vê os novos cards |
| `schedules` | `useAppStore` | Condicional do card "Minha Grade" (inalterado) |
| `absences` | `useAppStore` | Alimenta `TeacherStats` (inalterado) |

---

## Regras de Negócio

1. **Preservação total do estado atual:** nenhum card, stat ou comportamento existente deve ser removido, reordenado ou alterado.
2. **Ordem dos novos cards:** Marcar Substituições → Ver Professores → Grade Escola → Relatórios de Faltas → Relatórios de Substituições.
3. **Sem condicionais extras nos novos cards:** todos os 5 novos cards aparecem sempre que o usuário estiver na `/home` (role já garante isso via roteamento do `App.jsx`).
4. **Rota de "Ver Professores":** usa query param `?tab=teachers`, que a `SettingsPage` já consome via `new URLSearchParams(useLocation().search).get('tab')`.
5. **Sem duplicação do componente `ActionCard`:** importar o componente de `src/components/ui/ActionCard.jsx`; a `DashboardPage` tem cópia local — não tocar nela.

---

## Fora do Escopo (v1)

- Reordenar ou redesenhar os cards existentes
- Criar novo componente de card ou variante visual
- Adicionar cards condicionais (ex: só se o professor tiver substituições pendentes)
- Alterar a `SettingsPage`, `SubstitutionsPage`, `AbsencesPage` ou `SchoolSchedulePage`
- Adicionar badges de contagem ou notificações nos novos cards
- Qualquer alteração em regras de permissão ou RBAC
