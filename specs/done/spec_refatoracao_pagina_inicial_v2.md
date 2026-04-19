# Spec: Refatoração da Página Inicial — Layout v2

## Visão Geral

Reorganização visual e funcional do painel principal (`/dashboard`) para melhorar a hierarquia de informações. As mudanças reorganizam a sequência vertical do topo da página, introduzem um novo card "Aulas Atribuídas" com contagem total da grade (incluindo todas as categorias de horário), e ajustam a lógica e o rótulo do card "Histórico de Aulas Dadas" para refletir o acumulado real de aulas já ocorridas no mês corrente.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite 5 + Tailwind CSS 3
- **Estado Global:** Zustand (`useAppStore`, `useAuthStore`)
- **Backend/DB:** Firebase Firestore (sem alteração de schema)
- **Roteamento:** React Router DOM 6
- **Lógica de datas:** `src/lib/absences.js` — função `monthlyLoad` e `businessDaysBetween` já existentes

---

## Páginas e Rotas

### Dashboard — `/dashboard`

**Descrição:** Painel principal para coordenadores e admins. Recebe reorganização da ordem vertical dos elementos no topo e divisão em duas colunas abaixo dos botões de ação. A coluna esquerda passa a exibir o novo card "Aulas Atribuídas"; a coluna direita exibe o card "Histórico de Aulas Dadas" em sua proporção original (50% da largura).

**Componentes:**

- `SaudacaoUsuario`: Heading com o primeiro nome do usuário logado — permanece sem alterações internas, apenas reposicionado para o topo absoluto da página (abaixo da Navbar).
- `BarraInformacoes` (`StatPill` existente): Linha de pills com os totais globais — Professores, Aulas/semana, Faltas e Substitutos. Reposicionada para imediatamente abaixo da saudação.
- `BotoesAcao` (grid de `ActionCard` existente): Grade de cards de ação — "Marcar Substituições", "Ver Professores", "Grade da Escola". Reposicionada para imediatamente abaixo da `BarraInformacoes`.
- `AulasAtribuidasCard`: Novo card ocupando 50% da largura, lado esquerdo. Lista cada professor com o total de entradas na sua grade horária, contabilizando todas as categorias de `subjectId` sem exceção.
- `HistoricoAulasDadasCard` (`WorkloadTable` existente, adaptado): Retorna à proporção 50% da largura, lado direito. Recebe ajuste de rótulo e atualização da lógica de cálculo de aulas dadas.

**Behaviors:**

- [ ] Visualizar a saudação ao usuário como primeiro elemento abaixo da Navbar
- [ ] Visualizar a Barra de Informações (pills: Professores, Aulas/semana, Faltas, Substitutos) imediatamente abaixo da saudação
- [ ] Visualizar os botões de ação imediatamente abaixo da Barra de Informações
- [ ] Visualizar a seção abaixo dos botões dividida em duas colunas de igual largura (50% cada)
- [ ] Visualizar o card "Aulas Atribuídas" na coluna esquerda
- [ ] Ver no card "Aulas Atribuídas" a lista de professores com o total de entradas na grade horária de cada um
- [ ] Confirmar que o contador de "Aulas Atribuídas" inclui disciplinas regulares, aulas do Multiplica, ATPCG, ATPCA, PDA e Alinhamentos — toda entrada em `schedules` onde `teacherId` corresponde ao professor, sem filtro de `subjectId`
- [ ] Visualizar o card "Histórico de Aulas Dadas" na coluna direita ocupando 50% da largura
- [ ] Ver o título do card como "Aulas dadas até o presente" (rótulo formalizado)
- [ ] Ver o contador mensal de aulas dadas calculado como acumulado real: para cada entrada em `schedules` do professor, o sistema conta quantas ocorrências daquele dia da semana já aconteceram no mês corrente até a data de hoje e soma o resultado
- [ ] Confirmar que se um professor tem 2 aulas de uma mesma matéria às segundas-feiras e o mês teve 2 segundas decorridas, o total exibido para esse registro é 4
- [ ] Ver colunas do card "Histórico": Professor, Aulas Dadas (acumulado mensal), Faltas, Subs, Saldo
- [ ] Ver o Saldo calculado como: Aulas Dadas (acumulado mensal) − Faltas + Subs Realizadas

---

## Componentes Compartilhados

- `ActionCard` (`src/components/ui/ActionCard.jsx` ou inline em `DashboardPage.jsx`): Card clicável com ícone, título e descrição — sem alterações internas.
- `StatPill` (inline em `DashboardPage.jsx`): Pill de estatística rápida — sem alterações internas.
- `monthlyLoad` (`src/lib/absences.js`): Função existente que calcula o total acumulado de aulas de um professor do início do mês até uma `referenceDate`. Deve ser reutilizada no `HistoricoAulasDadasCard` para calcular "Aulas dadas até o presente". A `referenceDate` usada deve ser `today` (data atual em formato `YYYY-MM-DD`).
- `businessDaysBetween` (`src/lib/helpers.js`): Usada internamente por `monthlyLoad` para listar os dias úteis já decorridos no mês — nenhuma alteração necessária.

---

## Modelos de Dados

Nenhuma alteração no schema do Firestore. Todos os cálculos são derivados em tempo de renderização a partir dos dados já disponíveis no `useAppStore`.

### Entidades usadas

| Entidade | Campo no store | Finalidade no novo layout |
|---|---|---|
| `teachers` | `useAppStore.teachers` | Lista de professores para os dois cards |
| `schedules` | `useAppStore.schedules` | Base de contagem para "Aulas Atribuídas" e para `monthlyLoad` |
| `absences` | `useAppStore.absences` | Contagem de faltas e subs para `HistoricoAulasDadasCard` |

### Estrutura de um documento `schedules`

Campos relevantes para os cálculos:

| Campo | Tipo | Descrição |
|---|---|---|
| `teacherId` | string | ID do professor dono da entrada |
| `day` | string | Dia da semana em português (`"Segunda"`, `"Terça"`, etc.) |
| `subjectId` | string | ID da disciplina — inclui regulares e IDs de formação (`formation-atpcg`, `formation-atpca`, `formation-multiplica`, `formation-pda`, `formation-alinhamento`) |
| `timeSlot` | string | Horário do período |

### Cálculo — Aulas Atribuídas (por professor)

```
AulasAtribuidas(teacherId) = schedules.filter(s => s.teacherId === teacherId).length
```

Toda entrada em `schedules` é contabilizada, sem filtragem por `subjectId`.

### Cálculo — Aulas Dadas até o Presente (por professor)

Reutiliza `monthlyLoad(teacherId, today, schedules, absences)` já existente em `src/lib/absences.js`.

Internamente, a função:
1. Determina o primeiro dia do mês corrente.
2. Lista todos os dias úteis entre o início do mês e `today` via `businessDaysBetween`.
3. Para cada dia útil decorrido, soma as entradas de `schedules` do professor cujo `day` corresponde ao dia da semana daquele dia.
4. Acrescenta o número de substituições realizadas pelo professor no mesmo período.

O comportamento esperado: 2 entradas de segunda-feira + 2 segundas decorridas no mês = 4 aulas dadas.

### Cálculo — Saldo (frontend only)

```
Saldo = AulasDadas(acumulado mensal) − Faltas + SubstituicoesRealizadas
```

---

## Regras de Negócio

1. **Ordem vertical obrigatória no topo:** Saudação → Barra de Informações → Botões de Ação. Nenhum elemento pode quebrar essa sequência.
2. **Divisão em duas colunas:** O grid abaixo dos botões deve usar proporção exata de 50%/50% (`grid-cols-2`). Em telas menores que `sm` (< 640 px), as colunas empilham verticalmente com o card "Aulas Atribuídas" acima do "Histórico de Aulas Dadas".
3. **Contagem de Aulas Atribuídas é exaustiva:** Nenhuma categoria de `subjectId` é excluída. IDs de formação (`formation-*`) contam da mesma forma que disciplinas regulares.
4. **Aulas Dadas = acumulado do mês até hoje:** O cálculo utiliza `today` como `referenceDate` para `monthlyLoad`. Nunca usa a contagem estática de `schedules.length` direto.
5. **Rótulo do card:** O título deve ser exatamente `"Aulas dadas até o presente"` — sem variações de capitalização ou abreviação.
6. **Saldo usa o acumulado mensal:** O cálculo de Saldo no `HistoricoAulasDadasCard` deve usar `monthlyLoad` (aulas já ocorridas) e não a carga horária semanal bruta.
7. **Permissões inalteradas:** As seções `WorkloadTable` (admin) e `TeacherStats` (professor) seguem as mesmas guards de role já existentes. Nenhuma alteração de RBAC.
8. **Sem alterações em outras páginas:** `/substitutions`, `/school-schedule`, `/calendar` e `/settings` permanecem intactos.

---

## Fora do Escopo (v1)

- Persistir contagem de aulas atribuídas ou acumulado mensal no Firestore
- Criar novos campos ou coleções no modelo de dados
- Alterar a lógica de `monthlyLoad` ou `businessDaysBetween`
- Criar filtros de período ou mês no card "Aulas Atribuídas"
- Criar filtros de período ou mês no card "Histórico de Aulas Dadas"
- Permitir clique em linhas para ver detalhe por professor
- Exportação ou geração de PDF a partir dos cards da home
- Alterações na versão mobile ou PWA
- Modificar o comportamento ou visual dos `ActionCard` de ação rápida
- Modificar a página `/workload` (rota de detalhe de carga horária)
