# Spec: Card de Carga Horária na HomePage e Ajustes na WorkloadPage

## Visão Geral

Substituir os dois cards removidos da HomePage ("Aulas Atribuídas" e "Aulas dadas até o presente") por um único card que exibe a tabela consolidada de carga horária — o mesmo conteúdo da `/workload` — com um botão "Ver mais" apontando para a página completa. Simultaneamente, aplicar dois ajustes estéticos na WorkloadPage: remover o limite de altura `max-h-[400px]` da tabela e corrigir a cor das fontes do cabeçalho de `text-t3` para `text-t1`.

Para viabilizar o reuso sem duplicação de código, os três componentes hoje co-localizados em `WorkloadPage.jsx` (`PeriodToggle`, `WorkloadConsolidatedTable` e `WorkloadRow`) são extraídos para `src/components/ui/WorkloadShared.jsx`, tornando-se componentes compartilhados entre as duas páginas.

---

## Stack Tecnológica

- **Frontend:** React 18 + React Router 6 (`useNavigate`, `Link`)
- **Estado global:** Zustand (`useAppStore`, `useAuthStore`)
- **Estilização:** Tailwind CSS 3.4 com tokens do projeto (`navy`, `surf`, `surf2`, `bdr`, `t1`–`t3`, `ok`, `err`)
- **Banco de dados:** Firebase Firestore (coleções `teachers/`, `schedules/`, `absences/`)
- **Utilitários:** `businessDaysBetween`, `dateToDayLabel`, `formatISO` em `src/lib/helpers/dates`; `isFormationSlot` em `src/lib/helpers/turmas`
- **Fonte numérica:** DM Mono (`font-mono`) para células numéricas da tabela

---

## Páginas e Rotas

### HomePage — `/home`

**Descrição:** Página inicial do professor. Após a remoção dos dois cards anteriores (já executada em spec anterior), o espaço vago recebe um novo card de carga horária consolidada. O card exibe a tabela com toggle Mensal/Anual e, no rodapé, um botão "Ver mais" que navega para `/workload`. O card é visível apenas quando `loaded === true` e absências estão disponíveis.

**Componentes:**

- `WorkloadCard`: Componente interno da HomePage (co-localizado, sem export). Wrapper de card que combina o título "Carga Horária", o `PeriodToggle` e o `WorkloadConsolidatedTable` importados de `WorkloadShared.jsx`, mais o link "Ver mais" no rodapé.
- `PeriodToggle` (importado de `src/components/ui/WorkloadShared.jsx`): Toggle Mensal/Anual.
- `WorkloadConsolidatedTable` (importado de `src/components/ui/WorkloadShared.jsx`): Tabela consolidada.

**Behaviors:**

- [ ] Importar `loadAbsencesIfNeeded` via `useAppStore` e chamar em `useEffect` na montagem do componente, garantindo que as absências estejam disponíveis para o card (o lazy loading de absências não é feito automaticamente no boot).
- [ ] Renderizar o `WorkloadCard` abaixo do bloco de `TeacherStats` e acima do grid de `ActionCards`, respeitando o `space-y-6` existente.
- [ ] Calcular `lecturers` filtrando professores com `profile !== 'coordinator'` antes de passar para `WorkloadConsolidatedTable`.
- [ ] Exibir `PeriodToggle` no canto direito do header do card, ao lado do título "Carga Horária", usando `flex items-center justify-between`.
- [ ] Renderizar `WorkloadConsolidatedTable` com a prop `variant="card"` para que a tabela aplique `max-h-[320px] overflow-y-auto` (altura menor que na página completa, adequada ao contexto de card).
- [ ] Renderizar no rodapé do card um botão ou link "Ver mais" usando `btn btn-ghost btn-sm` apontando para `/workload`, alinhado à direita com `flex justify-end mt-3`.
- [ ] Não renderizar o `WorkloadCard` enquanto `!loaded` (o spinner global da HomePage já cobre esse estado).
- [ ] Quando `lecturers.length === 0`, omitir o `WorkloadCard` completamente (sem estado vazio: a HomePage não exibe mensagem de erro para ausência de professores).

---

### WorkloadPage — `/workload`

**Descrição:** Página completa de carga horária. Recebe dois ajustes estéticos: a tabela passa a crescer livremente (sem teto de altura) e o cabeçalho ganha fontes pretas. Os componentes internos são extraídos para `WorkloadShared.jsx`; a página passa a importá-los de lá em vez de defini-los localmente.

**Componentes (após extração):**

- `PeriodToggle` (importado de `src/components/ui/WorkloadShared.jsx`)
- `WorkloadConsolidatedTable` (importado de `src/components/ui/WorkloadShared.jsx`, chamado sem prop `variant` — usa comportamento padrão sem limite de altura)
- `WorkloadRow` (interno a `WorkloadShared.jsx`, não exportado diretamente)

**Behaviors:**

- [ ] Remover as definições locais de `PeriodToggle`, `WorkloadConsolidatedTable` e `WorkloadRow` de `WorkloadPage.jsx` após a criação de `WorkloadShared.jsx`.
- [ ] Importar `PeriodToggle` e `WorkloadConsolidatedTable` de `../components/ui/WorkloadShared`.
- [ ] Passar `WorkloadConsolidatedTable` sem a prop `variant` (ou com `variant="page"`) para ativar o comportamento sem limite de altura: remover `max-h-[400px]` do container de scroll da tabela quando em modo página.
- [ ] Alterar a cor das fontes do cabeçalho da tabela de `text-t3` para `text-t1`, mantendo `uppercase tracking-wide font-bold text-[10px]`.

---

## Componentes Compartilhados

### `WorkloadShared.jsx` — `src/components/ui/WorkloadShared.jsx`

Arquivo novo que extrai os três componentes hoje co-localizados em `WorkloadPage.jsx`. Exporta apenas `PeriodToggle` e `WorkloadConsolidatedTable`; `WorkloadRow` permanece como componente interno (sem export), co-localizado no mesmo arquivo.

**`PeriodToggle`**

Props: `period: 'month' | 'year'`, `onChange: (val) => void`

Renderiza dois botões pill ("Este mês" / "Este ano"). Ativo: `bg-navy text-white border-navy`. Inativo: `bg-surf2 text-t2 border-bdr hover:border-t3`. Idêntico ao toggle já existente em `TeacherStats` da HomePage — após a extração, considerar se `TeacherStats` pode também reutilizá-lo (fora do escopo desta spec, mas desejável).

**`WorkloadConsolidatedTable`**

Props: `teachers`, `schedules`, `absences`, `sharedSeries`, `period`, `variant?: 'card' | 'page'`

Quando `variant === 'card'`: aplicar `max-h-[320px] overflow-y-auto scroll-thin` no container de scroll interno.
Quando `variant === 'page'` ou ausente: sem limite de altura (`overflow-y-auto scroll-thin` sem `max-h-*`).

Em ambos os casos: cabeçalho com `text-t1` (preto), `sticky top-0 z-10 bg-surf2`.

**`WorkloadRow`**

Sem alterações na lógica de cálculo em relação ao código atual em `WorkloadPage.jsx`. Calcula Atribuídas, Formação, Dadas, Faltas, Subs e Saldo para um único professor a partir das props recebidas.

---

## Modelos de Dados

Nenhuma alteração no Firestore. As coleções consumidas são:

**`teachers/`**
- `id`, `name`, `profile` — filtro de exclusão para `profile === 'coordinator'`

**`schedules/`**
- `teacherId`, `day`, `turma`, `timeSlot` — base do cálculo de aulas atribuídas e dadas

**`absences/`**
- `teacherId`, `slots[].substituteId`, `slots[].date`, `slots[].turma`, `slots[].timeSlot` — base do cálculo de faltas e substituições

**`meta/config`** (via store)
- `sharedSeries[]` com `type: 'formation' | 'elective'` — usado por `isFormationSlot()` para excluir turmas de formação dos cálculos principais

---

## Regras de Negócio

1. **Reutilização sem duplicação:** `PeriodToggle`, `WorkloadConsolidatedTable` e `WorkloadRow` existem em um único lugar (`WorkloadShared.jsx`). Nenhuma cópia da lógica de cálculo deve existir em `HomePage.jsx` ou `WorkloadPage.jsx`.

2. **Prop `variant` controla o limite de altura:** A tabela tem comportamento diferente nos dois contextos. No card da HomePage (`variant="card"`), `max-h-[320px]` evita que a página fique excessivamente longa. Na WorkloadPage (sem `variant` ou `variant="page"`), a tabela cresce livremente com o conteúdo.

3. **Cor do cabeçalho sempre `text-t1`:** A correção de `text-t3` → `text-t1` se aplica a ambos os contextos (card e página), pois compartilham o mesmo componente. Não há variação de cor do header por variant.

4. **Lazy loading de absências na HomePage:** A HomePage não chama `loadAbsencesIfNeeded()` atualmente. Esta spec adiciona essa chamada para que o card tenha dados de faltas e substituições. A chamada é idempotente — se as absências já estiverem carregadas (ex.: o usuário veio de `/absences`), não há re-fetch.

5. **Filtro de coordenadores puros:** Professores com `profile === 'coordinator'` são excluídos antes de passar para `WorkloadConsolidatedTable`, tanto na HomePage quanto na WorkloadPage.

6. **Fórmulas de cálculo inalteradas:** `Saldo = Dadas - Faltas + Subs`. Dadas é calculado dia a dia sobre `businessDaysBetween(fromDate, today)`. Formação não entra no Saldo.

7. **Zeros exibidos como traço:** Colunas Formação, Faltas e Subs exibem `—` quando o valor é zero, para leitura mais limpa.

8. **Saldo negativo em vermelho:** `text-err font-bold` quando `Saldo < 0`; `text-t1 font-bold` quando `Saldo >= 0`.

---

## Fora do Escopo (v1)

- Refatorar o toggle de `TeacherStats` na HomePage para usar o `PeriodToggle` extraído (desejável, mas separado).
- Remover `WorkloadCards.jsx` de `src/components/ui/` (pode ser feito junto, mas é limpeza independente — verificar se ainda tem usos antes de deletar).
- Filtro por professor, segmento ou turno na tabela.
- Seleção de mês/ano arbitrário (apenas mês corrente e ano corrente).
- Export PDF a partir do card da HomePage.
- Paginação da tabela.
- Badges de alerta `workloadWarn`/`workloadDanger` no card da HomePage (já tratados no DashboardPage).
- Animação ou skeleton de loading específico para o card de carga horária na HomePage.
