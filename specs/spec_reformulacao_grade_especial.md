# Spec: Reformulação da Grade Especial e Preview de Horários

## Visão Geral

Simplifica o formulário de grade especial (de inserção manual de aulas para declaração por quantidade e duração), corrige os labels dos tempos especiais em todo o sistema para "Tempo N", substitui o preview horizontal por uma lista vertical unificada, e estende CalendarDayPage e AbsencesPage para exibir slots especiais junto com os regulares.

## Stack Tecnológica

- Frontend: React 18 + Tailwind CSS (utility-first com tokens customizados)
- Estado: Zustand (`useAppStore`, `useAuthStore`)
- Banco de dados: Firestore (`meta/config` — campo `periodConfigs`)
- Lógica pura: `src/lib/periods.js`, `src/lib/reports.js`
- Build: Vite 5

## Páginas e Rotas

### SettingsPage — Aba Períodos — `/settings?tab=periods`

**Descrição:** O admin configura a grade especial de cada segmento. Hoje é necessário adicionar aulas uma a uma. Após a mudança, o admin declara apenas `inicioEspecial`, `qtd` e `duracaoAula`; os itens do tipo `'aula'` deixam de existir no formulário. O admin pode continuar adicionando intervalos especiais individualmente, mas agora com o campo `apos` (após qual tempo) no lugar do campo `ordem`.

**Componentes:**
- `CamposGradeEspecial`: formulário de entrada da grade especial (refatorado)
- `CardPeriodo`: card por segmento que orquestra `CamposGradeEspecial` + `PreviewVertical`
- `PreviewVertical`: novo componente de preview (substitui `PreviewLinhaTempo`)
- `buildPreviewItems`: função auxiliar que combina períodos regulares e especiais

**Behaviors:**
- [ ] Remover botão "Adicionar aula" de `CamposGradeEspecial`: o formulário não permite mais inserir itens do tipo `'aula'` manualmente
- [ ] Exibir três campos de entrada para a grade especial: `inicioEspecial` (time), `qtd` (number, min 1), `duracaoAula` (number, min 1)
- [ ] Exibir seção de intervalos especiais dentro de `CamposGradeEspecial`: botão "+ Adicionar intervalo" mantido; cada intervalo tem `duracao` e `apos` (após qual tempo, number ≥ 0; valor 0 = antes do Tempo 1)
- [ ] Exibir label da coluna "Após o Tempo nº" no lugar de "Ordem" na lista de intervalos dentro de `CamposGradeEspecial`
- [ ] Manter botão "Remover" em cada intervalo
- [ ] Salvar a grade especial sem itens do tipo `'aula'` em `periodConfigs[segId][turno].gradeEspecial.itens` (apenas intervalos)
- [ ] Ao salvar, chamar `store.savePeriodCfg` com o objeto `gradeEspecial` atualizado (mesma lógica atual de `saveGradeEspecial`)
- [ ] Renderizar `PreviewVertical` no lugar de `PreviewLinhaTempo` dentro de `CardPeriodo`
- [ ] `PreviewVertical` exibe regulares e especiais mesclados em ordem cronológica (por `inicio`)
- [ ] `PreviewVertical` diferencia visualmente os tempos especiais: ícone ou borda colorida com `text-accent` / `border-accent`
- [ ] Cada linha do `PreviewVertical` exibe: ícone de tipo (aula ou intervalo), label, faixa horária início–fim, e duração em minutos para intervalos
- [ ] Validação de encaixe (`validarEncaixe`) e modal de alerta impeditivo (`AlertaImpeditivoModal`) mantidos sem alteração funcional

---

### SchedulePage — `/schedule`

**Descrição:** Grade horária individual do professor. As linhas de slots especiais (grade especial) exibem "Xª Aula Esp." no cabeçalho da linha. Esse label deve mudar para "Tempo N".

**Componentes:**
- `ScheduleGrid` (exportado de `SettingsPage.jsx`, reutilizado aqui)

**Behaviors:**
- [ ] Trocar o label `{aulaCount}ª Aula Esp.` por `Tempo {aulaCount}` nas linhas de grade especial dentro do `ScheduleGrid`
- [ ] Manter a borda `border-l-2 border-accent` nas células de tempo especial
- [ ] O restante do comportamento do `ScheduleGrid` permanece inalterado

---

### SchoolSchedulePage — `/school-schedule`

**Descrição:** Grade horária geral por segmento. Também exibe linhas de tempos especiais que devem ser relabeladas.

**Componentes:**
- Componente de grid interno de `SchoolSchedulePage.jsx` (não compartilhado via export)

**Behaviors:**
- [ ] Identificar e trocar o label de linhas especiais para "Tempo N" na grade geral (mesma convenção do `ScheduleGrid`)

---

### CalendarDayPage — `/calendar/day`

**Descrição:** Versão mobile da visualização de ausências por professor e dia. Atualmente lista apenas os períodos regulares do professor. Deve passar a incluir os tempos especiais quando a grade especial estiver configurada para o segmento.

**Componentes:**
- `segPeriodos`: estrutura de dados derivada que alimenta a lista de períodos exibida
- Listagem de períodos (componente inline sem nome explicitado)

**Behaviors:**
- [ ] Calcular `periodosEspeciais` via `gerarPeriodosEspeciais(cfg)` para cada segmento do professor no dia ativo
- [ ] Adicionar os tempos especiais (não intervalos) à lista de períodos, com slot no formato `makeEspecialSlot(segId, turno, idx)` (1-indexed)
- [ ] Mesclar regulares e especiais em ordem cronológica (`inicio`) dentro da lista de cada segmento
- [ ] Exibir o label "Tempo N" nas células de tempo especial (coerente com o restante do sistema)
- [ ] Diferenciar visualmente os períodos especiais com borda ou badge distinto (ex: `border-l-2 border-accent` na célula de horário)
- [ ] Suportar marcação de falta em slots especiais: `createAbsence` com `timeSlot = makeEspecialSlot(...)`, `scheduleId` e `subjectId` do `schedule` correspondente
- [ ] `SubPicker` já funciona com qualquer `slot` string — nenhuma mudança necessária no componente em si
- [ ] Slots especiais sem `schedule` correspondente para o professor no dia exibem estado "Hora de estudo" (inativos, mesma lógica dos regulares)

---

### AbsencesPage — `/absences`

**Descrição:** Relatório de ausências com múltiplas views. O componente `SlotRow` resolve o label da aula via `getAulas` + `Number(parts[2])`, o que retorna `undefined` para slots especiais (`'eN'`). Deve passar a resolver corretamente e exibir "Tempo N".

**Componentes:**
- `SlotRow`: linha de ausência individual

**Behaviors:**
- [ ] Detectar se `parts[2]` começa com `'e'` (slot especial) em `SlotRow`
- [ ] Se especial: extrair o índice N (`Number(parts[2].slice(1))`) e montar label "Tempo N" diretamente, sem chamar `getAulas`
- [ ] Se especial: buscar horário de início/fim via `gerarPeriodosEspeciais(cfg)` pelo índice N para exibir a faixa horária abaixo do label
- [ ] Se regular: comportamento atual inalterado
- [ ] Slots especiais devem exibir o mesmo horário formatado que os regulares (ex: "07:00–07:40")

---

## Componentes Compartilhados

- `ScheduleGrid` (exportado de `SettingsPage.jsx`): usado em `SchedulePage`, `AbsencesPage` e `PendingPage`. A mudança de label "Xª Aula Esp." → "Tempo N" propaga automaticamente para todos os consumidores.
- `PreviewVertical` (novo, local a `SettingsPage.jsx`): substitui `PreviewLinhaTempo`; não exportado; uso único em `CardPeriodo`.
- `buildPreviewItems` (função auxiliar local a `SettingsPage.jsx`): continua existindo; recebe `cfg` e retorna lista unificada de itens para o preview; deve ser atualizada para usar `apos` ao derivar a posição dos intervalos especiais.

## Modelos de Dados

### `gradeEspecial` — novo formato (campo dentro de `periodConfigs[segId][turno]`)

```js
gradeEspecial: {
  inicioEspecial: 'HH:mm',    // horário de início do Tempo 1
  qtd:            number,     // quantidade de tempos sem aluno (gerados automaticamente)
  duracaoAula:    number,     // duração de cada tempo em minutos
  itens: [                    // APENAS intervalos; tipo 'aula' não é mais gravado
    {
      id:      string,        // uid()
      apos:    number,        // após qual tempo ocorre; 0 = antes do Tempo 1
      duracao: number,        // duração do intervalo em minutos
    }
  ]
}
```

### `gradeEspecial` — formato legado (retrocompatibilidade)

Configs existentes podem conter `itens[].tipo === 'aula'`. `gerarPeriodosEspeciais` deve ignorar esses itens silenciosamente (filtrá-los antes de processar). Os campos `ordem` dos itens legados também podem estar presentes e devem ser desconsiderados.

### Saída de `gerarPeriodosEspeciais(cfg)` — novo contrato

```js
// Cada item retornado:
{
  label:       string,   // "Tempo 1", "Tempo 2" ... para aulas; "Intervalo" para intervalos
  inicio:      'HH:mm',
  fim:         'HH:mm',
  isEspecial:  true,
  isIntervalo: boolean,
  aulaIdx:     'eN' | null  // 'e1', 'e2'... para aulas; null para intervalos
}
```

### `absences[].slots[].timeSlot` — slots especiais

Formato inalterado: `"segmentId|turno|eN"` onde N é 1-indexed entre os tempos da grade especial. Nenhuma migração de dados necessária.

## Regras de Negócio

1. **Geração automática de tempos**: `gerarPeriodosEspeciais` não lê mais itens do tipo `'aula'`. Gera `qtd` tempos automaticamente com duração `duracaoAula` cada, a partir de `inicioEspecial`. Intervalos são intercalados conforme `apos`.

2. **Posicionamento de intervalos por `apos`**: um intervalo com `apos: 0` é inserido antes do Tempo 1; `apos: 1` é inserido após o Tempo 1; `apos: N` após o Tempo N. Dois intervalos com o mesmo `apos` são ordenados por `id` (ordem de inserção). Intervalos com `apos > qtd` são ignorados.

3. **Label padrão dos tempos**: "Tempo 1", "Tempo 2", etc. (1-indexed, sem ordinal feminino). Essa convenção aplica-se a: `gerarPeriodosEspeciais`, `ScheduleGrid`, `_scheduleGrid` em `reports.js`, `generateTeacherScheduleHTML`, `CalendarDayPage` e `AbsencesPage`.

4. **Retrocompatibilidade no carregamento**: configs com `itens[].tipo === 'aula'` são tratadas silenciosamente — esses itens são filtrados e ignorados. Nenhuma migração Firestore é necessária.

5. **`calcSaldo` — ajuste para novo modelo**: `tempoEspecial` hoje soma `item.duracao` de todos os itens (incluindo os do tipo `'aula'`). Com o novo modelo, deve computar: `qtd * duracaoAula + somaIntervalosEspeciais`. A função `calcSaldo` deve ser atualizada para ler `gradeEspecial.qtd` e `gradeEspecial.duracaoAula` quando `itens` não contiver itens do tipo `'aula'`.

6. **`validarEncaixe` — ajuste para novo modelo**: a lógica de `duracaoSugerida` atualmente conta `qtdAulas = itens.filter(i => i.tipo === 'aula').length`. Com o novo modelo, `qtdAulas = gradeEspecial.qtd`. Deve ler `gradeEspecial.qtd` diretamente.

7. **Slots especiais em CalendarDayPage**: o array de períodos exibido deve ser construído mesclando `getPeriodos` (regulares, filtrados por `!isIntervalo`) e `gerarPeriodosEspeciais` (especiais, filtrados por `!isIntervalo`), ordenados por `toMin(p.inicio)`. Cada entrada especial recebe `slot = makeEspecialSlot(segId, turno, idx)` onde `idx` é a posição 1-indexed da aula especial (aulaIdx = `'eN'` → N).

8. **SlotRow em AbsencesPage**: a resolução do label não pode mais depender de `getAulas` para slots especiais. A lógica de fallback atual (`slotLabel(sl.timeSlot, ...)`) retorna o próprio `timeSlot` para slots especiais — deve ser substituída por resolução explícita de "Tempo N".

## Fora do Escopo (v1)

- Suporte a múltiplos grupos de grades especiais por turno (ex: turno A e turno B com grades diferentes).
- Edição inline de duração individual de tempos especiais (todos têm `duracaoAula` uniforme).
- Marcação de faltas em slots especiais via `CalendarPage` (desktop) — apenas `CalendarDayPage` é contemplada.
- Migração automática de dados legados no Firestore — retrocompatibilidade é feita em tempo de leitura.
- Exibição de tempos especiais em `SubstitutionsPage` ou `WorkloadPage`.
- Exportação PDF de dias com slots especiais via `generateDayHTML` (melhoria futura).
