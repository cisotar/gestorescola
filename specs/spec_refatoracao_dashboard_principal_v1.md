# Spec: Refatoração da Dashboard Principal (v1)

**Versão:** v1 | **Criado:** 2026-04-18

## Visão Geral

Refatorar a `HomePage.jsx` (rota `/home`, acessível por professores) para unificar seu layout com o padrão visual da `DashboardPage.jsx` (usada por admin, coordenador e teacher-coordinator). O objetivo é que todos os perfis vejam uma hierarquia visual consistente: saudação → KPIs globais da escola → estatísticas pessoais → grid de ações. Para isso, um novo componente reutilizável `KPICards` será extraído para `src/components/ui/KPICards.jsx`, exibindo os quatro indicadores globais da escola (professores, aulas/semana, faltas registradas, sem substituto) no formato card estilizado.

---

## Stack Tecnológica

- **Frontend:** React 18 + React Router 6 (SPA)
- **Estado global:** Zustand — `useAppStore` (dados da escola) e `useAuthStore` (sessão/role)
- **Estilização:** Tailwind CSS com tokens customizados definidos em `tailwind.config.js`
- **Ícones:** `lucide-react`
- **Persistência:** Firebase Firestore (via `useAppStore`)

---

## Páginas e Rotas

### HomePage — `/home`

**Descrição:** Página inicial exclusiva do perfil `teacher`. Após a refatoração, o professor verá a mesma estrutura hierárquica do DashboardPage: saudação personalizada, seguida dos KPIs globais da escola (leitura), depois as suas estatísticas pessoais e, por último, o grid de ações de acesso rápido.

**Componentes:**

- `KPICards`: novo componente compartilhado que exibe os 4 indicadores globais da escola em grid 2×2 (mobile) / 4×1 (desktop)
- `TeacherStats` (existente, sem alterações na lógica): card "Suas estatísticas" com toggle mês/ano, exibido logo abaixo do `KPICards`
- `ActionCard` (existente, `src/components/ui/ActionCard.jsx`): cards de navegação rápida no grid de ações

**Behaviors:**

- [ ] Exibir saudação com o primeiro nome do usuário logado (`user.displayName`) e subtítulo "Bem-vindo(a) ao seu painel de controle."
- [ ] Renderizar o componente `KPICards` como segunda seção, passando `teachers`, `schedules` e `absences` vindos do `useAppStore`
- [ ] Exibir o card "Suas estatísticas" (`TeacherStats`) como terceira seção, somente quando `myTeacher` estiver disponível no `useAuthStore`
- [ ] Mostrar um `Spinner` ou skeleton de carregamento (`animate-pulse`) enquanto `useAppStore().loaded === false`, impedindo renderização de dados indefinidos
- [ ] Renderizar o grid de ActionCards com os mesmos cards que o DashboardPage exibe para admin/coordenador, garantindo interface coesa entre perfis:
  - "Marcar Substituições" → `/calendar` (primary)
  - "Minha Grade" → `/schedule` (condicional: só exibir se `schedules.some(s => s.teacherId === myTeacher?.id)`)
  - "Ver Professores" → `/settings?tab=teachers`
  - "Grade da Escola" → `/school-schedule`
  - "Relatórios de Faltas" → `/absences`
  - "Relatórios de Substituições" → `/substitutions`
- [ ] Remover os ActionCards duplicados ou inconsistentes presentes na versão atual ("🔁 Marcar Substituições", "📋 Relatório de Faltas", "🔄 Minhas Substituições" e "📁 Relatórios de Substituições" duplicados)
- [ ] Garantir que o layout respeite `max-w-4xl` com `space-y-6` entre seções (padrão atual mantido)

---

## Componentes Compartilhados

### `KPICards` — `src/components/ui/KPICards.jsx`

**Descrição:** Componente reutilizável que exibe os 4 indicadores globais da escola em um card estilizado com grid interno. Extraído do bloco `StatPill` + `flex flex-wrap` existente na `DashboardPage.jsx`. Será usado na `HomePage.jsx` (professores) e pode ser reutilizado na `DashboardPage.jsx` futuramente.

**Interface de props:**

```jsx
<KPICards
  teachers={teachers}   // array de teachers do useAppStore
  schedules={schedules} // array de schedules do useAppStore
  absences={absences}   // array de absences do useAppStore
/>
```

**Behaviors:**

- [ ] Calcular e exibir os 4 indicadores:
  1. **Professores** — `teachers.length` — ícone `Users` (lucide-react)
  2. **Aulas/semana** — `schedules.length` — ícone `BookOpen` (lucide-react)
  3. **Faltas registradas** — soma de todos os `ab.slots.length` para todos os absences — ícone `ClipboardList` (lucide-react)
  4. **Sem substituto** — contagem de slots onde `substituteId === null` — ícone `AlertTriangle` (lucide-react)
- [ ] Aplicar estado semântico no indicador "Sem substituto": se `uncovered > 0`, usar `bg-err-l text-err`; se `uncovered === 0`, usar `bg-ok-l text-ok`; caso contrário, usar `bg-surf2 text-t1`
- [ ] Usar layout `grid grid-cols-2 sm:grid-cols-4 gap-3` para exibir os 4 indicadores de forma equilibrada
- [ ] Cada indicador deve ter:
  - Ícone lucide-react (tamanho 18–20px) com cor correspondente ao estado
  - Valor numérico em `text-2xl font-extrabold` com `font-mono`
  - Label em `text-[11px] font-bold uppercase tracking-wide text-t2`
- [ ] Envolver o conjunto em um `.card` com título "Visão geral da escola" em `text-sm font-bold text-t1 mb-4`
- [ ] Não ter lógica de negócio interna: receber os dados prontos via props e apenas computar os agregados inline (sem acesso direto ao store)

---

## Modelos de Dados

Os dados já existem no `useAppStore`. Nenhuma nova entidade precisa ser criada. Os campos consumidos são:

**`useAppStore`:**

| Campo | Tipo | Uso no componente |
|---|---|---|
| `teachers` | `Teacher[]` | Contagem total para KPI "Professores" |
| `schedules` | `Schedule[]` | Contagem total para KPI "Aulas/semana" |
| `absences` | `Absence[]` | Soma de slots para KPI "Faltas"; filtragem de `substituteId === null` para KPI "Sem substituto" |
| `loaded` | `boolean` | Guard de carregamento em `HomePage` |

**`useAuthStore`:**

| Campo | Tipo | Uso no componente |
|---|---|---|
| `user` | `FirebaseUser` | `user.displayName` para saudação |
| `teacher` | `Teacher\|null` | Exibição condicional de `TeacherStats` |

---

## Regras de Negócio

1. **Visibilidade condicional do `TeacherStats`:** o card "Suas estatísticas" só é renderizado quando `myTeacher !== null`. Coordenadores puros (`profile === 'coordinator'`) não chegam à rota `/home` (são redirecionados para `/dashboard` pelo `App.jsx`), portanto essa guarda é suficiente.

2. **Visibilidade condicional do card "Minha Grade":** só exibir o ActionCard de grade pessoal se `schedules.some(s => s.teacherId === myTeacher?.id)` for verdadeiro. Professores sem aulas atribuídas não devem ver esse card.

3. **Estado do indicador "Sem substituto":** segue a mesma lógica do `StatPill` em `DashboardPage`: `warn (err)` quando `uncovered > 0`, `ok` quando `uncovered === 0`. A transição de cor deve ser exclusivamente semântica — não usar valores hex avulsos.

4. **Guard de carregamento:** a `HomePage` deve verificar `useAppStore().loaded` antes de renderizar `KPICards` e `TeacherStats`. Enquanto `loaded === false`, exibir placeholder de carregamento (skeleton ou spinner centralizado).

5. **Sem duplicação de ActionCards:** cada destino de rota deve aparecer uma única vez no grid. A versão atual da `HomePage.jsx` contém duplicatas (`/absences` aparece 2 vezes, `/substitutions` aparece 3 vezes) que devem ser eliminadas.

6. **Ícones:** usar exclusivamente `lucide-react` no novo componente `KPICards`, mantendo consistência com os padrões definidos no `design-system.md`. Os ActionCards mantêm seus emojis atuais (padrão já estabelecido em `ActionCard.jsx`).

7. **Sem acesso direto ao store em `KPICards`:** o componente recebe dados via props. Isso permite futura reutilização em relatórios ou em `DashboardPage` sem acoplamento ao contexto de autenticação.

---

## Hierarquia Visual Final da HomePage (v1)

```
┌─────────────────────────────────────────────┐
│  Olá, [Nome] 👋                             │  ← Saudação (h1)
│  Bem-vindo(a) ao seu painel de controle.   │  ← Subtítulo (text-t2)
└─────────────────────────────────────────────┘
               ↓ space-y-6
┌─────────────────────────────────────────────┐
│  Visão geral da escola           (.card)    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │  42  │ │ 210  │ │  8   │ │  2   │       │
│  │Prof. │ │Aulas │ │Faltas│ │SemSub│       │  ← KPICards
│  └──────┘ └──────┘ └──────┘ └──────┘       │
└─────────────────────────────────────────────┘
               ↓ space-y-6
┌─────────────────────────────────────────────┐
│  Suas estatísticas    [Este mês] [Este ano] │  ← TeacherStats (existente)
│  ┌────┐ ┌────┐ ┌─────┐ ┌──────────────┐   │
│  │ 12 │ │ 48 │ │  1  │ │      3       │   │
│  │atrib│ │dads│ │falt.│ │    subs      │   │
│  └────┘ └────┘ └─────┘ └──────────────┘   │
└─────────────────────────────────────────────┘
               ↓ space-y-6
┌─────────────────────────────────────────────┐
│  [Marcar Sub.]  [Minha Grade*]              │  ← ActionCards (grid)
│  [Professores]  [Grade Escola]              │    *condicional
│  [Rel. Faltas]  [Rel. Subs.]               │
└─────────────────────────────────────────────┘
```

---

## Arquivos Afetados

| Arquivo | Ação |
|---|---|
| `src/pages/HomePage.jsx` | Refatorar: adicionar `KPICards`, reordenar seções, limpar ActionCards duplicados |
| `src/components/ui/KPICards.jsx` | Criar: novo componente compartilhado |
| `references/architecture.md` | Atualizar seção 12 (Componentes Compartilhados) com entrada para `KPICards` |

---

## Fora do Escopo (v1)

- Refatoração da `DashboardPage.jsx` para consumir o novo `KPICards` (pode ser feito em v2, após validação na `HomePage`)
- Adição de novos KPIs além dos 4 já existentes no `StatPill` da `DashboardPage`
- Qualquer alteração no `useAppStore.js` — os dados necessários já estão disponíveis
- Criação de novos campos no Firestore ou no modelo de dados
- Testes automatizados
- Animações de entrada nos cards (framer-motion ou equivalente)
- Internacionalização ou suporte a múltiplos idiomas
- Skeleton loading elaborado — um `Spinner` centralizado é suficiente para v1
