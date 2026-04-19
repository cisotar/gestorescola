# Spec: Reconstrução das Grades Horárias dos Professores

## Visão Geral

As grades horárias dos professores atualmente exibem apenas as aulas cadastradas, sem contextualizar o horário de trabalho do professor dentro do turno. Esta spec define a reconstrução visual dessas grades para que expressem fielmente a presença do professor: horários fora do expediente recebem uma diagonal indicando ausência; horários de intervalo (regulares e especiais) aparecem em ordem cronológica; e os relatórios PDF passam a incluir uma tabela de entrada e saída por dia da semana.

O problema resolvido: hoje não é possível, ao olhar a grade de um professor, entender quais horários ele está fisicamente disponível, quais são intervalos do turno e quais ficam fora do seu expediente. A nova grade integra esses três planos em uma visualização única e coerente.

---

## Stack Tecnológica

- **Frontend:** React 18.3.1 + Vite 5 + Tailwind CSS 3.4.10
- **Estado global:** Zustand (`useAppStore`, `useAuthStore`)
- **Backend/Banco de dados:** Firebase Firestore (`teachers/`, `meta/config`)
- **Relatórios PDF:** `src/lib/reports.js` via `window.print()` com HTML gerado em string
- **Lógica de períodos:** `src/lib/periods.js` (funções puras de derivação de horários)
- **Lógica de disponibilidade:** `src/lib/absences.js` (`isAvailableBySchedule`)

---

## Páginas e Rotas

### Grade Horária Individual — `/schedule`

**Descrição:** Página que exibe a grade semanal de um professor. A grade passa a ser construída por período (turno), integrando em uma única tabela as linhas de aulas, os intervalos regulares, os intervalos especiais e as aulas especiais em ordem cronológica. Linhas que caem fora do horário de entrada/saída do professor naquele dia são marcadas com uma diagonal visual.

**Componentes:**
- `GradeTurnoCard` (existente, a ser atualizado): wrapper de grade por turno; passa `horariosSemana` do professor para `ScheduleGrid`
- `ScheduleGrid` (exportado de `SettingsPage.jsx`, a ser atualizado): recebe `horariosSemana` e `periodCfg` e aplica o cálculo de diagonal por célula
- `CelulaFora` (componente local, uso único em `ScheduleGrid`): renderiza a célula com diagonal (linha SVG ou `background: linear-gradient` em diagonal de canto a canto) para slots fora do expediente do professor naquele dia
- Botão "Exportar PDF" (existente): chama `generateTeacherScheduleHTML` atualizado

**Behaviors:**
- [ ] Construir a grade por período: para cada turno em que o professor leciona, gerar a sequência completa de linhas a partir de `gerarPeriodos(cfg)` (aulas regulares e intervalos regulares) e `gerarPeriodosEspeciais(cfg)` (aulas especiais e intervalos especiais), mesclar os dois arrays e ordenar por `toMin(inicio)` antes de renderizar
- [ ] Exibir linhas de intervalo na grade: incluir as linhas de intervalo regular e especial como linhas não clicáveis, com fundo diferenciado (`surf2`, texto `t3`), sem as células de aulas — apenas a coluna de label com horário
- [ ] Detectar ausência de `horariosSemana`: se o professor não tem horários cadastrados (`teacher.horariosSemana` ausente ou vazio), renderizar a grade sem diagonais (comportamento atual), exibindo um aviso abaixo do título: "Horários de entrada e saída não cadastrados — grade exibida sem marcação de disponibilidade"
- [ ] Calcular diagonal por célula: para cada célula de aula (não intervalo) no cruzamento de linha-slot e coluna-dia, verificar se o slot está coberto pelo horário do professor naquele dia usando a condição `entrada_professor <= inicio_slot` e `fim_slot <= saida_professor`; se não coberto, renderizar `CelulaFora` em vez da célula normal
- [ ] Renderizar célula com diagonal: `CelulaFora` exibe a célula com uma linha diagonal do canto superior esquerdo ao canto inferior direito (implementar via `background: linear-gradient(to bottom right, transparent calc(50% - 0.5px), #D1CEC8 calc(50%), transparent calc(50% + 0.5px))`) e fundo `surf2`, sem conteúdo editável
- [ ] Turno duplo — duas grades independentes: para professores com aulas em dois turnos distintos (lógica existente de `isDupleTurno`), renderizar dois `GradeTurnoCard` empilhados, cada um com sua própria checagem de `horariosSemana` para o turno correspondente; professores com apenas um turno continuam renderizando uma única `ScheduleGrid`
- [ ] Turno duplo — período de referência por turno: ao verificar os limites de `inicioPeriodo`/`fimPeriodo` de cada turno, usar o `periodConfig` do segmento correspondente àquele turno; nunca misturar os limites de turno para checar disponibilidade
- [ ] Exportar PDF com diagonais: o HTML gerado por `generateTeacherScheduleHTML` deve incluir nas células fora do expediente uma linha diagonal em CSS inline (`background: linear-gradient(...)`) e fundo `#F4F2EE`; as linhas de intervalo devem aparecer no PDF como linhas de separação visual com cor neutra e label de horário

---

### Grade Horária da Escola — `/school-schedule`

**Descrição:** Grade consolidada de toda a escola, filtrada por segmento/turno/turma. Não exibe diagonais (a diagonal é um conceito do professor individual), mas passa a exibir as linhas de intervalo em ordem cronológica junto com as aulas.

**Componentes:**
- `ScheduleGrid` (existente, atualizado): quando usado sem `teacher` (modo escola), omite o cálculo de diagonal e renderiza apenas as linhas de intervalo no fluxo cronológico correto

**Behaviors:**
- [ ] Exibir intervalos na grade da escola: incluir linhas de intervalo regular e especial, ordenadas cronologicamente com as aulas, com o mesmo estilo visual diferenciado da grade individual
- [ ] Omitir diagonais: a grade da escola não verifica `horariosSemana` de nenhum professor; nenhuma célula diagonal é renderizada neste modo
- [ ] Exportar PDF com intervalos: `generateSchoolScheduleHTML` inclui as linhas de intervalo no HTML gerado

---

### Relatórios PDF — Geração de HTML

**Descrição:** A função `generateTeacherScheduleHTML` em `reports.js` passa a incluir, além da(s) grade(s) horária(s), uma tabela de horários de entrada e saída do professor por dia da semana. A tabela é inserida logo abaixo do cabeçalho, antes da(s) grade(s).

**Componentes:** nenhum componente React — geração de HTML puro em `src/lib/reports.js`

**Behaviors:**
- [ ] Renderizar tabela de horários no PDF: gerar uma tabela HTML de 6 colunas (dias: Segunda, Terça, Quarta, Quinta, Sexta) com duas linhas — "Entrada" e "Saída"; preencher cada célula com o horário correspondente de `teacher.horariosSemana[dia]`; se o dia estiver ausente ou os campos forem vazios, exibir "—" na célula
- [ ] Exibir aviso quando sem horários: se `teacher.horariosSemana` for ausente ou vazio, renderizar no lugar da tabela um bloco de aviso com texto: "Horários de entrada e saída não informados"
- [ ] Posicionar a tabela no layout do PDF: a tabela de horários fica entre o bloco `metaHTML` (cabeçalho com nome e total de aulas) e o `bodyHTML` (grades); usar o mesmo estilo CSS interno do relatório (`font-family: Figtree`, cores `#1A1814` / `#6B6760` / `#E5E2D9`)
- [ ] Preservar diagonais no PDF: células fora do expediente devem aparecer com diagonal em CSS inline nas tabelas de grade dentro do PDF

---

## Componentes Compartilhados

- `ScheduleGrid` (`src/pages/SettingsPage.jsx`, exportado): recebe nova prop `horariosSemana` (opcional, default `null`). Quando presente, aplica checagem de diagonal por célula usando `resolveSlot(timeSlot, periodConfigs)` para obter `inicio`/`fim` do slot e comparando com `horariosSemana[day]`. Continua sendo usado em `SchedulePage`, `SettingsPage` (aba Schedules) e `SchoolSchedulePage` — o modo escola não passa `horariosSemana`, desativando as diagonais.
- `CelulaFora`: componente local definido dentro de `ScheduleGrid` (mesmo arquivo). Não exportado. Renderiza o `<td>` com diagonal e fundo neutro.

---

## Modelos de Dados

### `teachers/` — sem alteração de schema

O campo `horariosSemana` já está definido na spec `spec_horarios_entrada_saida_professores.md`:

```js
horariosSemana: {
  "Segunda": { entrada: "07:50", saida: "16:50" },
  "Terca":   { entrada: "07:50", saida: "12:30" },
  "Quarta":  { entrada: "07:50", saida: "16:50" },
  "Quinta":  { entrada: "07:50", saida: "12:30" },
  "Sexta":   { entrada: "07:50", saida: "12:30" }
}
```

### `meta/config.periodConfigs` — sem alteração de schema

Os campos `inicioPeriodo` e `fimPeriodo` (já existentes) definem os limites do turno escolar. São usados como referência para:
- Determinar o início absoluto do período da manhã/tarde (quando o professor não tem `horariosSemana`): se o professor não tem horários cadastrados, assume-se `entrada = inicioPeriodo` e `saida = fimPeriodo` do turno — **não** o início da primeira aula
- Professores sem `horariosSemana`: a grade é renderizada sem diagonais (sem assumir `inicioPeriodo` como default na UI — o aviso é exibido)

### Dados em memória — linhas da grade reconstruída

A grade reconstruída por período é um array de itens gerado combinando os resultados de `gerarPeriodos` e `gerarPeriodosEspeciais`, cada item com a forma:

```js
{
  aulaIdx: "3" | "e1" | null,   // null para intervalos
  label:   "3ª Aula" | "Intervalo" | "Tempo 1",
  inicio:  "08:40",
  fim:     "09:30",
  isIntervalo: false,
  isEspecial:  false,
  _tipo:  "regular" | "especial" | "intervalo-regular" | "intervalo-especial"
}
```

O array é ordenado por `toMin(inicio)` antes da renderização. Linhas com `isIntervalo: true` são renderizadas sem célula de conteúdo de aulas (apenas a coluna de label).

---

## Regras de Negócio

### RN-01 — Diagonal por slot fora do expediente

Para cada célula no cruzamento `(slot, dia)` em uma linha de aula (não intervalo), a célula recebe diagonal se:

```
horariosSemana[dia] existe
E (
  toMin(inicio_slot) < toMin(entrada_professor[dia])
  OU toMin(fim_slot) > toMin(saida_professor[dia])
)
```

Se `horariosSemana[dia]` não existir (professor não trabalha naquele dia segundo seu cadastro), a célula também recebe diagonal, pois a ausência do par indica dia não trabalhado.

Se `horariosSemana` for completamente ausente ou vazio (`{}`), nenhuma diagonal é aplicada em nenhuma célula — o campo não preenchido é tratado como "informação desconhecida", não como "professor ausente o tempo todo".

### RN-02 — Grade por período, não por turno

A grade é construída separadamente para cada par `segmentId|turno` que o professor possui aulas. Professores com dois turnos distintos geram duas grades independentes. Cada grade usa exclusivamente o `periodConfig` do seu próprio `segmentId|turno` para calcular `gerarPeriodos` e `gerarPeriodosEspeciais`. O `horariosSemana` do professor é o mesmo para os dois turnos — a verificação de diagonal é feita comparando cada slot com `horariosSemana[dia]` independentemente de qual turno está sendo renderizado.

### RN-03 — Horários especiais e intervalos em ordem cronológica

Dentro de cada grade (por `segmentId|turno`), o array de linhas é formado pela união de:
1. Resultados de `gerarPeriodos(cfg)` — aulas regulares e intervalos regulares
2. Resultados de `gerarPeriodosEspeciais(cfg)` — aulas especiais e intervalos especiais

A união é ordenada por `toMin(inicio)` antes da renderização. Não existe separação visual entre "seção regular" e "seção especial" — todos os itens fluem em sequência cronológica na mesma tabela.

### RN-04 — Linhas de intervalo são não-interativas

Linhas com `isIntervalo: true` não permitem adicionar, editar ou remover aulas. As células de dia dessas linhas são renderizadas como células vazias com fundo `surf2` e sem interação. A coluna de label exibe o horário (`inicio – fim`) com estilo `t3`.

### RN-05 — Tabela de horários no PDF por professor

O relatório PDF de grade individual (`generateTeacherScheduleHTML`) inclui obrigatoriamente a tabela de entrada/saída. A tabela é sempre renderizada — se o professor não tem `horariosSemana`, exibe uma linha de aviso no lugar. A tabela não aparece no PDF de grade da escola (`generateSchoolScheduleHTML`).

### RN-06 — Diagonal no PDF consistente com a tela

O estilo de diagonal aplicado no PDF (CSS inline) deve ser visualmente equivalente ao estilo de tela. A técnica recomendada para ambos é `background: linear-gradient(to bottom right, transparent calc(50% - 0.5px), #D1CEC8 50%, transparent calc(50% + 0.5px))` com fundo `#F4F2EE`. Não usar imagens externas ou canvas.

### RN-07 — Compatibilidade retroativa

`ScheduleGrid` deve continuar funcionando sem a prop `horariosSemana` (uso em `SettingsPage` aba Schedules e `SchoolSchedulePage`). Quando `horariosSemana` não é passada ou é `null`, o comportamento é idêntico ao atual — sem diagonais, sem aviso.

---

## Fora do Escopo (v1)

- Edição de horários de entrada/saída diretamente pela grade (o cadastro permanece na aba Perfil da `SettingsPage`)
- Coloração diferenciada por intensidade de disponibilidade (ex: professor presente mas sem aula alocada)
- Grade de disponibilidade de professores substitutos (grade cruzada de disponibilidade por slot, não por professor individual)
- Exportação da tabela de horários de entrada/saída separadamente do PDF de grade
- Impressão coletiva: gerar PDF com grades de todos os professores em sequência (um por página)
- Diagonais na grade da escola (`/school-schedule`) — a diagonal é exclusiva da visão por professor
- Animação ou destaque piscante para alertar sobre horários de entrada/saída não cadastrados na grade
- Validação de que os horários de entrada/saída do professor cobrem todos os slots em que ele tem aulas (aviso, não bloqueio)
- Suporte a horários de entrada/saída distintos por semana par/ímpar ou por quinzena
