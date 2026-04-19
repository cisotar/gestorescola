# Spec: KPI Cards em Todas as Homes + Correção de Layout

## Visão Geral

Os cards pessoais "Aulas Atribuídas" e "Aulas Dadas até o presente" existem apenas em partes isoladas das páginas `HomePage` e `DashboardPage`. Esta spec garante que esses dois cards apareçam de forma consistente para **todos os perfis** — `teacher` (via `/home`) e `admin`/`coordinator`/`teacher-coordinator` (via `/dashboard`) — e corrige o layout dessas páginas, que atualmente ficam encolhidas no lado esquerdo da tela sem preencher a largura disponível.

## Stack Tecnológica

- Frontend: React 18 + Vite + Tailwind CSS
- Estado global: Zustand (`useAuthStore`, `useAppStore`)
- Roteamento: React Router 6
- Banco de dados: Firestore (leitura via `useAppStore`)
- Utilitários: `businessDaysBetween`, `dateToDayLabel` de `src/lib/absences.js`

## Análise do Estado Atual

### Problema 1 — Cards pessoais ausentes em alguns perfis

| Perfil | Rota | "Aulas Atribuídas" | "Aulas Dadas" |
|---|---|:---:|:---:|
| `teacher` | `/home` | Presente (`AulasCards`) | Presente (`AulasCards`) |
| `admin` | `/dashboard` | Ausente | Ausente |
| `coordinator` | `/dashboard` | Presente (`AulasPersonaisCards`) | Presente (`AulasPersonaisCards`) |
| `teacher-coordinator` | `/dashboard` | Presente (`AulasPersonaisCards`) | Presente (`AulasPersonaisCards`) |

O admin não tem `teacher` associado (`myTeacher === null`), portanto os cards pessoais não fazem sentido com os dados do professor individual. Para admin, os cards devem exibir os **totais da escola** (total de aulas atribuídas na grade + total de aulas dadas no mês considerando todos os professores), diferenciando visualmente do que é exibido para os perfis que lecionam.

### Problema 2 — Layout encolhido à esquerda

Ambas as páginas usam `grid grid-cols-1 lg:grid-cols-3 gap-6` corretamente, mas o `Layout.jsx` aplica `max-w-screen-xl` no wrapper global. O problema é que os cards internos têm colunas desbalanceadas em relação ao conteúdo real — em telas médias o layout não aproveita bem o espaço disponível. Além disso, `DashboardPage` coloca os action cards em `lg:col-span-2` mas os cards KPI de escola (`StatPill`) ficam fora do grid principal em uma faixa `flex-wrap` estreita.

### Problema 3 — Duplicação de lógica de cálculo

O cálculo de `myAulas` e `aulasDadas` está duplicado em:
- `AulasCards` (em `HomePage.jsx`)
- `AulasPersonaisCards` (em `DashboardPage.jsx`)
- `TeacherStats` (em ambos os arquivos, também duplicado)

A lógica é idêntica. A extração para um componente compartilhado em `src/components/ui/` elimina essa duplicação.

## Páginas e Rotas

### HomePage — `/home`

**Descrição:** Painel do professor. Exibe saudação personalizada, cards KPI pessoais ("Aulas Atribuídas" e "Aulas Dadas"), estatísticas detalhadas do período e atalhos de ação rápida.

**Componentes:**
- `TeacherKPICards` (novo, compartilhado): exibe os dois cards pessoais do professor logado
- `TeacherStats` (existente, local): grid 4 colunas com faltas e substituições, filtrável por mês/ano
- `ActionCard` (existente, compartilhado): atalhos de navegação rápida
- `KPICards` (existente, compartilhado): visão geral da escola (professores, aulas/semana, faltas, sem substituto)

**Behaviors:**
- [ ] Exibir os cards "Aulas Atribuídas" e "Aulas Dadas" imediatamente após a saudação, antes dos action cards, quando `myTeacher` está disponível
- [ ] Calcular "Aulas Atribuídas" filtrando `schedules` por `teacherId === myTeacher.id` e contando os registros
- [ ] Calcular "Aulas Dadas" somando, para cada dia útil de `fromDate` até hoje, as aulas do professor naquele `dateToDayLabel(d)`
- [ ] Usar `fromDate` como primeiro dia do mês corrente para o cálculo de "Aulas Dadas"
- [ ] Exibir subtexto "na grade semanal" sob "Aulas Atribuídas" e "até hoje este mês" sob "Aulas Dadas"
- [ ] Caso `myTeacher` seja `null` (estado transitório antes do carregamento), não renderizar os cards pessoais e não lançar erro
- [ ] O layout deve ocupar a largura total disponível dentro do `Layout.jsx`, sem max-width adicional interno
- [ ] Em desktop (`lg:`), usar grid de 3 colunas: col 1 para KPIs e stats pessoais, cols 2-3 para action cards
- [ ] Em mobile, empilhar tudo em coluna única com `space-y-6`
- [ ] `KPICards` (visão geral da escola) deve permanecer visível para professores na coluna esquerda
- [ ] Enquanto `!loaded`, exibir `<Spinner>` centralizado e não renderizar o conteúdo da página

---

### DashboardPage — `/dashboard`

**Descrição:** Painel central para admins, coordenadores e professores-coordenadores. Exibe KPIs globais da escola, atalhos de ação, tabelas de carga horária e — para perfis que lecionam — os cards pessoais do professor logado.

**Componentes:**
- `TeacherKPICards` (novo, compartilhado): cards pessoais usados quando `myTeacher` existe
- `AdminKPICards` (novo, local ou integrado ao `DashboardPage`): cards de totais da escola para admin puro
- `AulasAtribuidasCard` (existente, local): tabela de aulas atribuídas por professor
- `WorkloadTable` (existente, local): tabela de aulas dadas até o presente por professor
- `StatPill` (existente, local): pills de resumo global (professores, aulas/semana, faltas, sem substituto)
- `ActionCard` (existente, local): atalhos de navegação

**Behaviors:**

**Para o perfil `admin`:**
- [ ] Exibir dois cards KPI de totais da escola: "Total de Aulas Atribuídas" (count de todos os `schedules`) e "Total de Aulas Dadas no Mês" (soma das aulas dadas por todos os professores não-coordenadores no mês corrente)
- [ ] Posicionar esses dois cards logo após a linha de `StatPill`, antes do grid principal de duas colunas
- [ ] Calcular "Total de Aulas Dadas no Mês" iterando `teachers` com `profile !== 'coordinator'`, aplicando a mesma lógica de `businessDaysBetween` + `dateToDayLabel` para cada professor
- [ ] Exibir subtexto "na grade da escola" sob "Total Atribuídas" e "todos os professores este mês" sob "Total Dadas"

**Para os perfis `coordinator` e `teacher-coordinator`:**
- [ ] Exibir os dois cards pessoais ("Aulas Atribuídas" e "Aulas Dadas") usando `TeacherKPICards` quando `myTeacher` não é `null`
- [ ] Posicionar os cards pessoais logo após os `StatPill`, antes do grid principal
- [ ] Manter o bloco `TeacherStats` com filtro mensal/anual na coluna esquerda abaixo dos action cards (comportamento atual)
- [ ] Caso `myTeacher` seja `null` (coordenador puro sem registro de aulas), não exibir os cards pessoais sem lançar erro

**Para todos os perfis no `/dashboard`:**
- [ ] O layout de duas colunas (`lg:grid-cols-3`) deve preencher a largura total disponível
- [ ] A linha de `StatPill` deve usar `flex-wrap gap-3 w-full` e cada pill deve crescer (`flex-1`) para preencher o espaço
- [ ] As tabelas `AulasAtribuidasCard` e `WorkloadTable` devem permanecer na coluna direita (`lg:col-span-1`)
- [ ] Os action cards devem permanecer na coluna esquerda (`lg:col-span-2`) com grid `sm:grid-cols-2 xl:grid-cols-3`
- [ ] Enquanto os dados ainda não estão carregados (`!loaded`), exibir `<Spinner>` e não renderizar conteúdo

---

## Componentes Compartilhados

### `TeacherKPICards` — `src/components/ui/TeacherKPICards.jsx`

Card duplo (grid 2 colunas) exibindo as métricas pessoais do professor logado. Usado em `HomePage` e em `DashboardPage` para os perfis que lecionam.

**Props:**
```js
{ teacher, schedules, absences }
// teacher: objeto do professor logado (de useAuthStore)
// schedules: array de useAppStore
// absences: array de useAppStore (não usado no cálculo atual, mas passado por consistência)
```

**Lógica interna:**
- `myAulas`: `schedules.filter(s => s.teacherId === teacher.id).length`
- `fromDate`: primeiro dia do mês corrente (`today.slice(0, 7) + '-01'`)
- `aulasDadas`: para cada dia em `businessDaysBetween(fromDate, today)`, soma as aulas do professor com `dateToDayLabel(d)` como `day`
- Renderiza dois `card` side-by-side com valor numérico grande em `text-navy` e subtexto em `text-t2`

**Onde é usado:**
- `HomePage` — perfil `teacher`, na coluna esquerda acima de `TeacherStats`
- `DashboardPage` — perfis `coordinator` e `teacher-coordinator`, logo após os `StatPill`

**Nota sobre duplicação:** Substitui e remove `AulasCards` (em `HomePage.jsx`) e `AulasPersonaisCards` (em `DashboardPage.jsx`), que têm lógica idêntica. Após criação deste componente, os dois componentes locais devem ser excluídos dos respectivos arquivos.

---

## Modelos de Dados

Os modelos não mudam. Os dados consumidos são os já existentes no `useAppStore`:

**`schedules[]`**
```js
{ id, teacherId, day, timeSlot, turma, subjectId }
```
- Usado para contar `myAulas` (filtrando por `teacherId`)
- Usado para somar `aulasDadas` (filtrando por `teacherId` + `day === dateToDayLabel(d)`)

**`teachers[]`**
```js
{ id, name, profile, ... }
```
- Usado no cálculo de admin para excluir `profile === 'coordinator'` do total de aulas dadas

**`absences[]`**
```js
{ id, teacherId, slots: [{ date, day, timeSlot, substituteId, ... }] }
```
- Passado como prop por consistência com outros componentes de stats, mas não usado diretamente no cálculo dos dois KPI cards

**`useAuthStore`**
```js
{ role, teacher: myTeacher }
// myTeacher: null para 'admin', objeto Teacher para demais roles
```

---

## Regras de Negócio

- **"Aulas Atribuídas"** é sempre o total de slots na grade semanal (`schedules`) filtrado por professor. É uma contagem simples e não depende de data.
- **"Aulas Dadas"** é calculado contando, para cada dia útil do mês corrente até hoje, as aulas que o professor tinha na grade naquele `day`. A lógica assume que o professor deu aula todo dia útil em que tinha aula na grade (não considera faltas — é uma estimativa de presença esperada).
- Para o perfil `admin`, "Total de Aulas Dadas no Mês" aplica a mesma lógica acima mas agrega todos os professores com `profile !== 'coordinator'`.
- Coordenadores puros (`profile === 'coordinator'`) não lecionam aulas regulares na grade, portanto são excluídos do cálculo agregado de admin e não recebem os cards pessoais (pois `myTeacher` existirá mas sem aulas na grade — o valor "0" pode ser exibido normalmente se `myTeacher` existir).
- O componente `TeacherKPICards` não deve ser renderizado se `teacher` for `null` ou `undefined` — o componente pai é responsável por guardar com `myTeacher &&`.
- O layout deve usar os tokens de design já estabelecidos: `card`, `text-navy`, `text-t2`, `text-t3`, `bg-surf2`. Nenhum valor arbitrário de cor deve ser introduzido.
- A lógica de cálculo de `businessDaysBetween` e `dateToDayLabel` é importada de `src/lib/absences.js` — não reimplementar.

---

## Fora do Escopo (v1)

- Alterações em qualquer outra página além de `HomePage.jsx` e `DashboardPage.jsx`
- Criação de novos modelos de dados ou coleções no Firestore
- Persistência dos valores calculados (os KPIs são sempre derivados em tempo de execução)
- Exibição de histórico de aulas dadas por dia ou semana (isso pertence a `TeacherStats` e `WorkloadPage`)
- Gráficos ou visualizações além dos dois cards numéricos
- Filtro por período (mês/ano) nos dois KPI cards — esse recurso existe apenas no `TeacherStats`
- Alterações no `Layout.jsx` ou `Navbar.jsx`
- Alterações nas demais páginas (`CalendarPage`, `AbsencesPage`, etc.)
- Modo offline ou cache específico para os valores dos KPI cards
- Testes automatizados
