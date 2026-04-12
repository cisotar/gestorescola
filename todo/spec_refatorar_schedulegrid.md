# Spec: Refatorar ScheduleGrid para suportar visualização por dia e escola inteira

## Visão Geral

A `ScheduleGrid` atual (`src/pages/SettingsPage.jsx`) foi projetada para exibir a grade horária **de um único professor** ao longo dos 5 dias da semana. Essa limitação forçou a criação de um componente paralelo (`DayGridBySegment`) na SubstitutionsPage para mostrar a escola inteira num único dia.

O objetivo desta refatoração é tornar a `ScheduleGrid` flexível o suficiente para servir aos dois casos de uso — eliminando a duplicação e unificando a visualização de grades no sistema.

## Problema Atual

### Como a ScheduleGrid funciona hoje

```jsx
export function ScheduleGrid({ teacher, store, readOnly = false, substitutionMap }) { ... }
```

- Recebe um `teacher` obrigatório
- Filtra `store.schedules` por `teacherId === teacher.id`
- Renderiza uma tabela por segmento do professor, com 5 colunas (Seg–Sex) × N linhas (aulas)
- A prop `substitutionMap` (adicionada no #84) indexa por `timeSlot` (`segId|turno|aulaIdx`) — sem distinção de dia, o destaque vaza para todos os dias

### Consequências

1. **SubstitutionsPage — Aba Dia:** não pode usar a `ScheduleGrid` para mostrar "escola inteira num dia". Foi criado `DayGridBySegment` (grade invertida: linhas = aulas, colunas = turmas, filtrada por 1 dia) como workaround.

2. **AbsencesPage — Aba Por Professor:** tinha um bloco com `<ScheduleGrid teacher={teacher} store={store} />` para professores com múltiplos segmentos, que foi removido intencionalmente (desenhava a grade onde não devia).

3. **Prop `substitutionMap`:** adicionada no #84 para a aba Dia, mas acabou sem consumidor — a aba Dia usa `DayGridBySegment` em vez da `ScheduleGrid`.

### Consumidores atuais da ScheduleGrid (5)

| Consumidor | Arquivo | Uso |
|---|---|---|
| TabProfile | `SettingsPage.jsx` | Grade do professor logado |
| ScheduleGridModal | `SettingsPage.jsx` | Modal de grade de qualquer professor |
| SchedulePage | `SchedulePage.jsx` | Grade editável do professor selecionado |
| PendingPage | `PendingPage.jsx` | Grade do professor pendente (com teacher sintético) |
| AbsencesPage | `AbsencesPage.jsx` | Apenas import (sem render atual) |

## O Que Precisa Mudar

### Novo modo: "escola inteira por dia"

A `ScheduleGrid` precisa suportar um segundo modo de operação onde:
- Não recebe `teacher` — recebe `schedules` diretamente (array filtrado pelo chamador)
- Mostra **1 coluna por turma** (não 1 coluna por dia)
- Mostra **1 linha por aula** do período
- Cada célula exibe o **nome do professor titular** (ou substituto em destaque)
- Filtragem por dia fica na responsabilidade do chamador (não da grade)

### Prop `substitutionMap` corrigida

A chave precisa incluir o dia para não vazar entre colunas:
- Formato atual: `{ [timeSlot]: displayName }` — `timeSlot` = `segId|turno|aulaIdx`
- Formato necessário para o modo por dia: `{ [timeSlot]: displayName }` funciona porque o filtro por dia já foi feito externamente — **não precisa mudar a prop** se o chamador já filtra os schedules de um dia só

### Nova assinatura proposta

```jsx
export function ScheduleGrid({
  teacher,            // modo atual: grade de 1 professor × 5 dias
  schedules,          // modo novo: schedules já filtrados pelo chamador
  store,
  readOnly = false,
  substitutionMap,
  mode = 'teacher',   // 'teacher' (padrão) | 'day'
  columns,            // no modo 'day': array de { id, label } para as colunas (turmas)
}) { ... }
```

Quando `mode === 'teacher'`: comportamento idêntico ao atual. `teacher` é obrigatório, `schedules` é ignorado.

Quando `mode === 'day'`: `schedules` é obrigatório (array pré-filtrado), `teacher` é ignorado. `columns` define as colunas (turmas). A grade renderiza linhas = aulas, colunas = turmas, com o nome do professor em cada célula.

### Impacto nos consumidores existentes

**Zero breaking changes.** O modo padrão é `'teacher'`, que funciona exatamente como hoje. Os 5 consumidores atuais não passam `mode` nem `schedules` e continuam idênticos.

## Behaviors

- [ ] `ScheduleGrid` no modo `teacher` (padrão) funciona identicamente ao comportamento atual em todas as 5 telas
- [ ] `ScheduleGrid` no modo `day` renderiza uma tabela por segmento com colunas = turmas e linhas = aulas
- [ ] No modo `day`, cada célula mostra o nome do professor titular ou, se houver substituição, o nome do substituto em `text-ok`
- [ ] `substitutionMap` funciona em ambos os modos
- [ ] A aba Dia da `SubstitutionsPage` passa a usar `ScheduleGrid` em modo `day` em vez de `DayGridBySegment`
- [ ] `DayGridBySegment` é removido após a migração (redução de código duplicado)

## Regras Técnicas

- A refatoração da `ScheduleGrid` deve ser feita em uma issue separada da migração da `SubstitutionsPage`
- Testar visualmente todas as 5 telas que usam `ScheduleGrid` após a refatoração para garantir zero regressão
- Manter `readOnly` funcionando em ambos os modos (no modo `day`, é sempre somente leitura)

## Fora do Escopo

- Refatorar a `ScheduleGrid` para componente compartilhado (`src/components/ui/`) — ela pode continuar em `SettingsPage.jsx` exportada, como já é hoje
- Adicionar interatividade ao modo `day` (clique para marcar falta, etc.) — isso seria uma feature futura
- Suporte a múltiplos dias no modo `day` — sempre 1 dia por vez
- Migrar relatórios PDF para usar a mesma grade visual — os PDFs usam `_scheduleGrid()` (HTML puro em reports.js), que é separado
