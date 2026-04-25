# Spec: Refatoração da WorkloadPage — Tabela Consolidada de Carga Horária

## Visão Geral

Consolidar em `/workload` uma tabela única e completa de carga horária por professor, substituindo a visão fragmentada atual (dois cards separados na HomePage: "Aulas Atribuídas" e "Aulas dadas até o presente"). A nova tabela apresenta, em uma única tela, as colunas: Atribuídas, Formação, Dadas, Faltas, Substituições e Saldo, com alternância de período via toggle Mensal / Anual. Após validar o funcionamento na página dedicada, os dois cards são removidos da HomePage.

O cálculo é feito dia a dia sobre dados reais (sem médias ou projeções): para cada dia útil do período selecionado, contabilizam-se as aulas da grade que o professor deveria ter ministrado, as faltas registradas como slots de ausência e as substituições realizadas como `substituteId`.

---

## Stack Tecnológica

- **Frontend:** React 18 + React Router 6 (SPA)
- **Estado global:** Zustand (`useAppStore`, `useAuthStore`)
- **Estilização:** Tailwind CSS 3.4 com tokens customizados (`navy`, `accent`, `surf`, `bdr`, `t1`–`t3`, `ok`, `err`, `warn`)
- **Banco de dados:** Firebase Firestore (coleções `teachers/`, `schedules/`, `absences/`)
- **Utilitários de datas:** `businessDaysBetween`, `dateToDayLabel` em `src/lib/helpers/dates`
- **Utilitários de ausências:** `monthlyLoad` em `src/lib/absences`
- **Fonte numérica:** DM Mono (`font-mono`) para valores de células numéricas

---

## Páginas e Rotas

### WorkloadPage — `/workload`

**Descrição:** Exibe a tabela consolidada de carga horária de todos os professores (exceto coordenadores puros) para o período selecionado. O usuário pode alternar entre visão Mensal (do início do mês corrente até hoje) e Anual (do dia 1 de janeiro até hoje). A tabela é scrollável com cabeçalho fixo (sticky). Cada linha representa um professor, com colunas de Atribuídas, Formação, Dadas, Faltas, Subs e Saldo. Acessível apenas por admin e coordenadores (todos os perfis com acesso ao dashboard).

**Componentes internos (co-localizados em `WorkloadPage.jsx`):**

- `PeriodToggle`: Botões Mensal / Anual que controlam o `period` state local (`'month' | 'year'`). Visual idêntico ao toggle de `TeacherStats` na HomePage: pill arredondado, bg navy quando ativo, bg surf2 quando inativo.
- `WorkloadConsolidatedTable`: Tabela com sticky header, `overflow-y-auto`, `max-h-[400px]` e `scroll-thin`. Recebe as linhas já calculadas como prop.
- `WorkloadRow`: Linha individual da tabela. Sem export próprio — definido acima do `export default`.

**Behaviors:**

- [ ] Renderizar toggle de período: exibir dois botões ("Este mês" / "Este ano") no header da seção; ao clicar em um, atualizar o `period` state local e recalcular todas as linhas da tabela.
- [ ] Calcular `fromDate` conforme período: se `period === 'month'` usar `YYYY-MM-01`; se `period === 'year'` usar `YYYY-01-01`, onde `YYYY` é o ano corrente de `today`.
- [ ] Calcular coluna Atribuídas (grade regular líquida): contar `schedules` onde `teacherId === t.id`, excluindo slots cujo `turma` pertence a alguma entrada de `sharedSeries` com `type === 'formation'`. Esse valor é fixo (não depende do período).
- [ ] Calcular coluna Formação: contar `schedules` onde `teacherId === t.id` e `turma` pertence a `sharedSeries` com `type === 'formation'`. Valor exibido como informativo, sem participar da fórmula de Saldo.
- [ ] Calcular coluna Dadas: para cada dia útil em `businessDaysBetween(fromDate, today)`, mapear o `dateToDayLabel(date)` e somar `schedules` do professor naquele dia (somente aulas regulares, excluindo formação). Subtrair as faltas do professor nos mesmos slots/datas para obter as aulas efetivamente ministradas.
- [ ] Calcular coluna Faltas: somar `absences[].slots` onde `ab.teacherId === t.id` e `slot.date >= fromDate` e `slot.date <= today`, excluindo slots de formação (verificar `isFormationSlot(slot.timeSlot, store)`).
- [ ] Calcular coluna Subs: somar `absences[].slots` onde `slot.substituteId === t.id` e `slot.date >= fromDate` e `slot.date <= today`.
- [ ] Calcular coluna Saldo: aplicar `Saldo = Dadas - Faltas + Subs`. Exibir com `font-bold`; aplicar `text-err` quando `Saldo < 0`, `text-t1` quando `Saldo >= 0`.
- [ ] Exibir coluna Faltas com `text-err`; exibir `—` quando o valor for zero.
- [ ] Exibir coluna Subs com `text-ok`; exibir `—` quando o valor for zero.
- [ ] Renderizar sticky header: aplicar `sticky top-0 z-10 bg-surf2` nas células de `<thead>` para que o cabeçalho permaneça visível durante o scroll vertical da tabela.
- [ ] Limitar altura da tabela com `max-h-[400px] overflow-y-auto scroll-thin` no container da tabela.
- [ ] Ordenar linhas por nome do professor em ordem alfabética crescente.
- [ ] Filtrar coordenadores puros: excluir professores com `profile === 'coordinator'` da listagem.
- [ ] Exibir estado vazio: quando `rows.length === 0`, renderizar card centralizado com texto "Nenhum professor cadastrado." em `text-t3`.
- [ ] Exibir spinner de carregamento enquanto `!loaded` (aguardando `useAppStore`).
- [ ] Carregar absências sob demanda: chamar `loadAbsencesIfNeeded()` via `useEffect` ao montar a página, pois `absences` tem lazy loading conforme arquitetura do projeto.

---

### HomePage — `/home` (remoção dos cards)

**Descrição:** Após confirmar o funcionamento da tabela consolidada em `/workload`, remover os dois cards `AulasAtribuidasCard` e `WorkloadTable` da `div.grid.grid-cols-1.lg:grid-cols-2.gap-6`. Se a grid ficar vazia após a remoção, remover também o elemento `div` container.

**Behaviors:**

- [ ] Remover import de `AulasAtribuidasCard` e `WorkloadTable` do topo de `HomePage.jsx`.
- [ ] Remover import de `WorkloadCards` se não houver mais nenhum uso no arquivo.
- [ ] Remover o bloco `<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">` e seus dois filhos `<AulasAtribuidasCard />` e `<WorkloadTable />`.
- [ ] Verificar que nenhum outro componente na HomePage referencia `WorkloadCards.jsx` antes de removê-lo da pasta `components/ui/` (tarefa opcional: arquivar ou deletar o arquivo fonte).

---

## Componentes Compartilhados

Nenhum componente novo compartilhado é criado nesta refatoração. O `WorkloadConsolidatedTable` e seus subcomponentes ficam co-localizados em `WorkloadPage.jsx`, seguindo a convenção do projeto para componentes de uso único.

`WorkloadCards.jsx` (`src/components/ui/WorkloadCards.jsx`) pode ser removido após a migração, pois `AulasAtribuidasCard` e `WorkloadTable` só eram usados na HomePage.

---

## Modelos de Dados

Não há alterações no modelo de dados do Firestore. A refatoração é exclusivamente de UI e lógica de apresentação. As coleções utilizadas são:

**`teachers/`**
- `id` — identificador do professor
- `name` — nome exibido na coluna Professor
- `profile` — filtro de exclusão: `'coordinator'` não aparece na tabela

**`schedules/`**
- `teacherId` — FK para filtrar aulas do professor
- `day` — dia da semana ("Segunda"…"Sexta"), usado no cálculo dia a dia
- `turma` — usado para identificar se é aula regular ou de formação (comparar com `sharedSeries[].name`)
- `timeSlot` — slot no formato `segmentId|turno|aulaIdx`

**`absences/`**
- `teacherId` — identifica o professor ausente (coluna Faltas)
- `slots[].substituteId` — identifica o substituto (coluna Subs)
- `slots[].date` — data ISO para filtrar pelo período selecionado
- `slots[].timeSlot` — usado em `isFormationSlot()` para excluir formação do cômputo

**`meta/config`** (via store)
- `sharedSeries[]` — lista de séries compartilhadas com `type: 'formation' | 'elective'`

---

## Regras de Negócio

1. **Cálculo dia a dia, sem projeção:** O sistema percorre cada dia útil de `fromDate` até `today` (inclusive). Para cada dia, determina quantas aulas o professor tinha na grade regular (`schedules` com o `day` correspondente). Esse acúmulo resulta na coluna Dadas (antes de subtrair faltas).

2. **Faltas reduzem as Dadas:** A coluna Dadas representa aulas efetivamente ministradas. Portanto: `Dadas = (aulas esperadas no período) - Faltas`. Alternativamente, pode-se calcular Dadas diretamente como `(aulas esperadas) - Faltas`, mas o valor exibido na coluna Dadas já deve ser o resultado líquido real.

3. **Fórmula do Saldo:** `Saldo = Dadas - Faltas + Subs`. O Saldo pode ser negativo. Exemplo: professor com 30 aulas na grade, 6 faltas (1 dia), 2 substituições feitas → Dadas = 24, Faltas = 6, Subs = 2, Saldo = 24 - 6 + 2 = 20.

4. **Formação fora do cálculo de Saldo:** Aulas de turmas com `type === 'formation'` em `sharedSeries` são exibidas na coluna Formação apenas como informação. Não são contabilizadas em Atribuídas, Dadas, Faltas nem Saldo.

5. **Período Mensal:** `fromDate = YYYY-MM-01`, `toDate = today`. Acumula apenas o mês corrente.

6. **Período Anual:** `fromDate = YYYY-01-01`, `toDate = today`. Acumula todo o ano corrente até hoje.

7. **Coordenadores puros excluídos:** Professores com `profile === 'coordinator'` não aparecem na tabela. Professores com `profile === 'teacher-coordinator'` aparecem normalmente.

8. **Zeros exibidos como traço:** Valores zero nas colunas Faltas e Subs são renderizados como `—` para leitura mais limpa.

9. **Saldo negativo em vermelho:** Quando `Saldo < 0`, aplicar `text-err` à célula. Quando `>= 0`, usar `text-t1`.

10. **Lazy loading de absências:** A página deve chamar `loadAbsencesIfNeeded()` no `useEffect` de montagem, pois as ausências não são carregadas no boot da aplicação.

---

## Fora do Escopo (v1)

- Filtro por professor individual (busca/pesquisa na tabela).
- Filtro por segmento ou turno.
- Seleção de mês/ano arbitrário (apenas mês corrente e ano corrente são suportados).
- Export PDF da tabela de carga consolidada.
- Comparativo entre professores (rankings, gráficos).
- Edição ou correção de registros de faltas a partir desta página.
- Paginação da tabela (scroll é suficiente para o volume esperado em escola única).
- Notificação ou alerta quando o Saldo de um professor atinge limites de `workloadWarn` / `workloadDanger` (já tratado no DashboardPage).
