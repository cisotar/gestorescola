# Spec: Renomeação de Rota e Ordenação de Colunas na Tabela de Carga Horária

## Visão Geral

Este spec cobre duas mudanças relacionadas à página de Carga Horária:

1. **Renomeação de rota**: a URL `/workload` passa a ser `/cargahoraria`, com redirect permanente para não quebrar bookmarks ou links externos.
2. **Ordenação interativa de colunas**: a tabela `WorkloadConsolidatedTable` (usada tanto na página `/cargahoraria` quanto no card da `HomePage`) passa a suportar ordenação crescente/decrescente por qualquer coluna, com indicador visual na coluna ativa.

## Stack Tecnológica

- Frontend: React 18 + Vite
- Roteamento: React Router v6
- Estilo: Tailwind CSS (design tokens do projeto)
- Estado: estado local via `useState` (sem necessidade de store global)
- Sem mudanças de backend ou Firestore

## Páginas e Rotas

### Carga Horária — `/cargahoraria`

**Descrição:** Página dedicada à tabela consolidada de carga horária de todos os professores. Exibe atribuídas, formação, dadas, faltas, substituições e saldo por professor, filtrável por período (mês/ano).

**Componentes:**
- `WorkloadPage`: página container; gerencia estado de período (`month`/`year`) e carrega dados via store
- `PeriodToggle`: toggle de período (sem alteração)
- `WorkloadConsolidatedTable`: tabela principal — recebe novos props de ordenação (ver abaixo)

**Behaviors:**
- [ ] Registrar rota `/cargahoraria` em `App.jsx` apontando para `WorkloadPage`
- [ ] Registrar redirect de `/workload` para `/cargahoraria` em `App.jsx` usando `<Navigate to="/cargahoraria" replace />`
- [ ] Atualizar o link `to="/workload"` em `HomePage.jsx` (componente `WorkloadCard`, botão "Ver tabela completa") para `to="/cargahoraria"`
- [ ] Atualizar o `navigate('/workload')` em `WorkloadCards.jsx` (componente `WorkloadTable`, botão de título clicável) para `navigate('/cargahoraria')`
- [ ] Atualizar o `to: '/workload'` em `DashboardPage.jsx` (action card "Carga Horária") para `to: '/cargahoraria'`

---

### Home — `/home`

**Descrição:** Página de boas-vindas com card de Carga Horária embutido (`WorkloadCard`). O card usa `WorkloadConsolidatedTable` com `variant="card"`. A ordenação de colunas deve funcionar normalmente nesse contexto.

**Componentes:**
- `WorkloadCard`: wrapper local do card; passa `variant="card"` para a tabela
- `WorkloadConsolidatedTable`: mesma instância do componente compartilhado

**Behaviors:**
- [ ] Atualizar link "Ver tabela completa" de `/workload` para `/cargahoraria`
- [ ] A tabela no card deve exibir o indicador de ordenação e responder a cliques de cabeçalho, igual à página completa

---

## Componentes Compartilhados

### `WorkloadConsolidatedTable` — `src/components/ui/WorkloadShared.jsx`

Componente de tabela usado em dois contextos: página `/cargahoraria` (sem `variant`) e card da `HomePage` (`variant="card"`). Atualmente ordena sempre por nome (A→Z) de forma fixa via `[...teachers].sort(...)` no corpo do componente.

**Mudanças necessárias:**

- Introduzir estado local `sortKey` (string, coluna ativa) e `sortDir` (`'asc'` | `'desc'`)
- Valor inicial: `sortKey = 'name'`, `sortDir = 'asc'`
- O mapeamento de `sortKey` para valor numérico/string deve ocorrer **depois** do cálculo das linhas — ou seja, os dados de cada linha precisam ser calculados antes de ordenar

**Colunas e suas chaves de ordenação:**

| Cabeçalho   | `sortKey`    | Tipo do valor  |
|-------------|--------------|----------------|
| Professor   | `name`       | string         |
| Atribuídas  | `atribuidas` | número         |
| Formação    | `formacao`   | número         |
| Dadas       | `dadas`      | número         |
| Faltas      | `faltas`     | número         |
| Subs        | `subs`       | número         |
| Saldo       | `saldo`      | número         |

**Behaviors:**
- [ ] Calcular os valores de cada linha (atribuidas, formacao, dadas, faltas, subs, saldo) em um array de objetos antes de renderizar, para que a ordenação possa acessar qualquer campo
- [ ] Ao clicar no cabeçalho de uma coluna já ativa, inverter `sortDir` entre `'asc'` e `'desc'`
- [ ] Ao clicar em um cabeçalho diferente do ativo, definir `sortKey` para o novo campo e resetar `sortDir` para `'asc'`
- [ ] Ordenar strings (coluna "Professor") com `localeCompare('pt-BR')`, insensível a maiúsculas
- [ ] Ordenar números com subtração simples; empates em colunas numéricas devem ser desempatados por nome (A→Z) como critério secundário
- [ ] Exibir seta `↑` no cabeçalho quando `sortDir === 'asc'` e `↓` quando `sortDir === 'desc'`, apenas na coluna ativa (`sortKey`)
- [ ] Colunas inativas não exibem seta; o cursor do cabeçalho deve ser `cursor-pointer` em todas as colunas
- [ ] O indicador visual (seta) deve usar a cor `text-t1` para coluna ativa e `text-t3` para inativas (hover state opcional)
- [ ] O estado de ordenação é local ao componente — não persiste entre navegações nem é compartilhado com a página pai
- [ ] O comportamento de ordenação deve ser idêntico em `variant="card"` e sem variant

---

## Modelos de Dados

Sem alterações no Firestore. A ordenação opera inteiramente sobre dados já presentes na store (`teachers`, `schedules`, `absences`, `sharedSeries`).

Estrutura do objeto de linha calculado internamente no componente (tipo intermediário, não persistido):

```js
{
  teacher:    { id, name, profile, ... },  // objeto original do professor
  atribuidas: Number,
  formacao:   Number,
  dadas:      Number,
  faltas:     Number,
  subs:       Number,
  saldo:      Number,   // dadas - faltas + subs
}
```

## Regras de Negócio

- A rota `/workload` deve continuar funcionando via redirect (`<Navigate replace />`) para não quebrar bookmarks e links externos existentes
- O redirect deve ser `replace: true` para não poluir o histórico de navegação
- `workloadWarn` e `workloadDanger` são campos do Firestore/store sem relação com a URL — não devem ser renomeados
- A coluna "Saldo" com valor negativo continua com `text-err font-bold`; a coloração de células não é afetada pela ordenação
- Ordenação padrão ao montar o componente: "Professor" crescente (A→Z) — mantém o comportamento atual

## Fora do Escopo (v1)

- Persistência do estado de ordenação (localStorage, URL query param)
- Ordenação no componente legado `WorkloadTable` de `WorkloadCards.jsx` (componente distinto do `WorkloadConsolidatedTable`)
- Ordenação no componente `AulasAtribuidasCard` de `WorkloadCards.jsx`
- Paginação da tabela
- Filtro de busca por professor
- Adição de `/cargahoraria` como link direto na Navbar (a navbar atual só expõe Início e Configurações)
- Renomear o arquivo `WorkloadPage.jsx` ou o componente em si
