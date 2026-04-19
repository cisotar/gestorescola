# Spec: Reformulação do Painel de Gestão de Aulas e Substituições

## Visão Geral

Refatoração visual e funcional do painel principal (`/dashboard`) e da página de substituições (`/substitutions`) do GestãoEscolar. O objetivo é simplificar o layout, ampliar o card de histórico de aulas com a coluna de Saldo, eliminar elementos redundantes (card de substituições lateral, lista de sobrecarregados, ranking embutido) e criar uma página dedicada de Ranking de Assiduidade acessível a partir da visão mensal de substituições.

---

## Stack Tecnológica

- **Frontend:** React 18 + Vite 5 + Tailwind CSS 3
- **Estado Global:** Zustand (`useAppStore`, `useAuthStore`)
- **Backend/DB:** Firebase Firestore (sem back-end próprio — nenhuma alteração de schema)
- **Roteamento:** React Router DOM 6
- **Relatórios/PDF:** `src/lib/reports.js` — funções `openPDF()` e `generateSubstitutionRankingHTML()` já existentes

---

## Páginas e Rotas

### Dashboard — `/dashboard`

**Descrição:** Painel principal para coordenadores e admins. Após a refatoração, concentra-se no histórico de aulas dadas com tabela expandida e simplifica a seção de relatórios.

**Componentes:**

- `HistoricoAulasDadasCard`: Tabela principal expandida (substitui o antigo "Carga Horária"). Ocupa o espaço que antes era dividido com o card lateral de substituições. Colunas: Professor, Aulas Dadas, Faltas, Subs, Saldo.
- `ActionCard` (existente, sem mudanças): Botão "Marcar Substituições" — permanece idêntico.
- Título estático "Relatório de Ausências": Substituição do antigo botão "Histórico de Ausências" por um heading não-clicável.
- `RelatorioSubstituicoesCard`: Novo card de atalho ao lado do título "Relatório de Ausências" que direciona para `/substitutions`.

**Behaviors:**

- [ ] Visualizar tabela "Histórico de Aulas Dadas" expandida com colunas: Professor, Aulas Dadas, Faltas, Subs, Saldo
- [ ] Ver o Saldo calculado automaticamente por professor (Aulas Dadas − Faltas + Subs)
- [ ] Clicar em "Marcar Substituições" (`ActionCard` existente) e ser direcionado para `/calendar`
- [ ] Ver o título estático "Relatório de Ausências" (sem ação de clique)
- [ ] Clicar no card "Relatório de Substituições" e ser direcionado para `/substitutions`
- [ ] Não ver o card lateral de substituições (removido)
- [ ] Não ver a lista de professores sobrecarregados (removida)
- [ ] Não ver o Ranking de Substituições no dashboard (movido para página própria)

---

### Substituições — `/substitutions`

**Descrição:** Página de gerenciamento de substituições existente. Recebe um único acréscimo: quando o filtro de visualização "Mês" está ativo, exibe um botão de acesso ao Ranking de Assiduidade.

**Componentes:**

- Tabela e filtros existentes (sem alterações)
- `BotaoRanking`: Botão visível apenas quando o período ativo é "Mês" — navega para `/substitutions/ranking`

**Behaviors:**

- [ ] Selecionar filtro "Mês" e ver o botão "Ranking" aparecer na interface
- [ ] Clicar em "Ranking" e ser navegado para `/substitutions/ranking`
- [ ] Com qualquer filtro diferente de "Mês" ativo, o botão "Ranking" não é exibido

---

### Ranking de Assiduidade — `/substitutions/ranking`

**Descrição:** Nova página dedicada ao ranking mensal de assiduidade dos professores. Segue o padrão visual das demais páginas do sistema (mesmo Layout, Navbar, tipografia). Permite gerar relatório em PDF usando o template já existente.

**Componentes:**

- Filtro de mês/ano: Seletor para escolher o período do ranking
- `RankingTable`: Tabela com as colunas: Posição, Professor, Aulas Próprias, Ausências, Substituições Realizadas, Saldo, % Assiduidade
- `BotaoGerarRelatorio`: Aciona `openPDF(generateSubstitutionRankingHTML(...))` com os dados do período selecionado
- Link/botão de retorno para `/substitutions`

**Behaviors:**

- [ ] Acessar a página e ver a tabela de ranking carregada com o mês atual por padrão
- [ ] Selecionar mês/ano no filtro e ver a tabela atualizar com os dados do período escolhido
- [ ] Ver a posição (colocação) de cada professor na tabela
- [ ] Ver a porcentagem de assiduidade calculada por professor
- [ ] Clicar em "Gerar Relatório" e abrir/baixar PDF com a tabela no padrão visual do sistema
- [ ] Navegar de volta para `/substitutions` via botão/link de retorno
- [ ] Ver a página com o mesmo layout visual (Navbar, fundo, tipografia) das outras páginas

---

### Realidade da Escola — `/school-schedule` *(sem alterações)*

**Descrição:** Permanece exatamente como está. Nenhuma modificação nesta seção.

**Behaviors:**

- [ ] Acessar a página e visualizar as duas grades horárias (Ensino Fundamental e Ensino Médio) — sem mudanças

---

## Componentes Compartilhados

- `ActionCard` (`src/components/ui/ActionCard.jsx`): Card clicável com ícone e título — reutilizado para o novo card "Relatório de Substituições" no dashboard
- `openPDF` + `generateSubstitutionRankingHTML` (`src/lib/reports.js`): Funções existentes para geração de PDF — reutilizadas na nova página de Ranking sem modificação

---

## Modelos de Dados

Nenhuma alteração no schema do Firestore. Os cálculos de Saldo e % Assiduidade são derivados em tempo de renderização a partir dos dados já disponíveis no `useAppStore`.

### Cálculo de Saldo (frontend only)

```
Saldo = AulasDadas − Faltas + SubstituicoesRealizadas
```

### Cálculo de % Assiduidade (frontend only)

```
% Assiduidade = ((AulasDadas − Faltas) / AulasDadas) × 100
```

- Se `AulasDadas === 0`: exibir `—`
- Se resultado < 0: exibir `0%`
- Se resultado > 100: exibir `100%`

### Entidades existentes usadas

| Entidade | Store campo | Finalidade |
|----------|-------------|------------|
| `teachers` | `useAppStore.teachers` | Nome e ID do professor |
| `absences` | `useAppStore.absences` | Contagem de faltas por professor/período |
| `history` | `useAppStore.history` | Contagem de aulas dadas e subs realizadas |
| `schedules` | `useAppStore.schedules` | Base para aulas próprias (carga horária) |

---

## Regras de Negócio

1. **Saldo** = (total de aulas dadas no período) − (total de faltas) + (total de substituições realizadas como substituto). Calculado apenas no frontend, nunca persistido.
2. **Botão Ranking** em `/substitutions` só aparece quando o filtro de período ativo for exatamente "Mês". Em modo semanal, diário ou por professor, fica oculto.
3. **Ranking** é sempre filtrado por um mês/ano específico. Não existe ranking de período aberto.
4. **% Assiduidade** é limitada ao intervalo `[0%, 100%]`.
5. **Relatório PDF do Ranking** usa o template `generateSubstitutionRankingHTML` já existente em `src/lib/reports.js` — não criar novo template.
6. **Remoção de elementos** no Dashboard é puramente visual: nenhum dado é excluído do Firestore ou do store.
7. **Permissões:** Alterações afetam apenas as views de `admin` e `coordinator`. Professores não acessam `/dashboard` nem `/substitutions/ranking`.
8. **Nova rota `/substitutions/ranking`** deve ser protegida pelas mesmas guards de autenticação e role que `/substitutions`.

---

## Fora do Escopo (v1)

- Persistir Saldo ou % Assiduidade no Firestore
- Criar novos campos no modelo de dados
- Alterar a lógica de negócio de substituições, ausências ou carga horária
- Modificar a página `/school-schedule`
- Modificar a página `/calendar` (Marcar Substituições)
- Criar novo template de relatório PDF diferente do existente
- Notificações ou alertas sobre o ranking
- Comparação de ranking entre meses
- Exportação em formato diferente de PDF (CSV, Excel, etc.)
- Alterações na versão mobile ou PWA
