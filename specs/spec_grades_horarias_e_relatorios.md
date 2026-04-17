# Spec: Gestão de Grades Horárias e Relatórios

## Visão Geral

Esta spec unifica dois domínios intimamente conectados: (1) a remodelagem do modelo de configuração de períodos para suportar janelas de tempo de turno completo, grade especial (sem alunos) estruturada e validação de encaixe temporal; e (2) a atualização do sistema de geração de PDF para refletir fielmente a nova estrutura, incluindo suporte a professores com turno duplo.

O problema que resolve: atualmente o sistema não distingue o tempo total do turno escolar do tempo letivo (com alunos), e a grade especial (períodos sem alunos) é armazenada como horários absolutos avulsos sem relação com o limite do turno. Isso impede validação automática de sobreposição, impossibilita a renderização de uma linha do tempo unificada e torna o PDF incompleto para professores que lecionam em dois turnos.

---

## Stack Tecnológica

- **Frontend:** React 18 + React Router 6 + Tailwind CSS 3
- **Estado global:** Zustand (`useAppStore`, `useAuthStore`)
- **Backend/Banco de dados:** Firebase Firestore (documento `meta/config`, campo `periodConfigs`)
- **Relatórios PDF:** `src/lib/reports.js` via `window.print()` com HTML gerado em string
- **Lógica de períodos:** `src/lib/periods.js` (funções puras de derivação de horários)
- **Persistência de config:** `saveConfig(get())` — `setDoc` atômico em `meta/config`

---

## Páginas e Rotas

### Configurações — Aba Períodos — `/settings?tab=periods`

**Descrição:** O Administrador configura os parâmetros de tempo de cada segmento escolar. Esta aba é expandida para incluir os novos campos de limites do turno (`inicioPeriodo`, `fimPeriodo`) e a nova estrutura de grade especial (`gradeEspecial`). A visualização de prévia já existente é atualizada para exibir a linha do tempo unificada.

**Componentes:**
- `TabPeriods`: componente raiz da aba, itera por segmento e renderiza um `CardPeriodo` por segmento
- `CardPeriodo`: card por segmento com todos os controles de configuração do turno
- `CamposLimiteTurno`: sub-seção com inputs `inicioPeriodo` (time) e `fimPeriodo` (time)
- `CamposGradeRegular`: sub-seção existente — início da 1ª aula, duração, quantidade de aulas, intervalos regulares
- `CamposGradeEspecial`: nova sub-seção que substitui `HorariosEspeciaisSection` e `IntervalosEspeciaisSection`, configurando `gradeEspecial` de forma estruturada
- `SaldoTempo`: componente de feedback visual inline que exibe o cálculo de saldo em tempo real (Tempo Total − Tempo Letivo = Tempo Residual)
- `AlertaImpeditivoModal`: modal disparado quando a configuração da grade especial excede o tempo residual, exibindo o conflito e uma sugestão de ajuste proporcional
- `PreviewLinhaTempo`: prévia vertical/horizontal da grade completa do dia, mesclando blocos regulares e especiais com diferenciação visual por cor/estilo

**Behaviors:**
- [ ] Renderizar campos de limite de turno: exibir dois inputs `type="time"` — `inicioPeriodo` e `fimPeriodo` — acima dos campos da grade regular existentes. O campo `inicio` existente (início da 1ª aula) permanece editável e independente de `inicioPeriodo`.
- [ ] Calcular saldo em tempo real: a cada alteração em qualquer campo da configuração (`inicioPeriodo`, `fimPeriodo`, `inicio`, `duracao`, `qtd`, `intervalos`, `gradeEspecial`), recalcular e exibir: Tempo Total do Turno = `fimPeriodo − inicioPeriodo`; Tempo Letivo = soma de todas as aulas regulares + intervalos regulares; Tempo Residual = Tempo Total − Tempo Letivo. Exibir os três valores no componente `SaldoTempo` com cor verde (residual positivo) ou vermelho (residual negativo).
- [ ] Configurar grade especial: o ADM define dentro de `gradeEspecial`: `inicioEspecial` (time — hora de início da 1ª aula especial), `duracaoAula` (number — minutos por aula especial), `qtd` (number — quantidade de aulas especiais), e uma lista `itens` onde cada item tem `tipo: 'aula' | 'intervalo'`, `ordem` (number — posição na sequência, `0` indica antes da 1ª aula especial) e `duracao` (number — minutos, relevante para itens de tipo `intervalo`).
- [ ] Adicionar item à grade especial: ao clicar em "Adicionar aula" ou "Adicionar intervalo", inserir um novo item na lista `gradeEspecial.itens` com o próximo `ordem` disponível. Recalcular saldo imediatamente.
- [ ] Reordenar itens da grade especial: o ADM pode editar o campo `ordem` de qualquer item para repositicioná-lo na sequência. O sistema re-renderiza `PreviewLinhaTempo` refletindo a nova ordem.
- [ ] Remover item da grade especial: ao clicar em "Remover" em um item, eliminá-lo de `gradeEspecial.itens`, reindexar `ordem` dos itens restantes e recalcular o saldo.
- [ ] Validar encaixe ao salvar: antes de persistir via `store.savePeriodCfg`, verificar se Σ(aulas especiais + intervalos especiais) ≤ Tempo Residual. Se a verificação falhar, exibir o `AlertaImpeditivoModal` e bloquear o salvamento.
- [ ] Sugerir ajuste proporcional: dentro do `AlertaImpeditivoModal`, calcular automaticamente a duração reduzida que faria a grade especial caber exatamente no tempo residual (redução proporcional nas aulas especiais), exibir o valor sugerido e oferecer botão "Aplicar sugestão" que preenche o campo `duracaoAula` com o valor calculado e fecha o modal sem salvar — o ADM confirma manualmente.
- [ ] Salvar configuração: ao confirmar, chamar `store.savePeriodCfg(segId, turno, cfgAtualizada)` que persiste via `saveConfig(get())` no Firestore. Exibir toast "Configuração salva" (`ok`).
- [ ] Exibir prévia unificada: o componente `PreviewLinhaTempo` exibe blocos sequenciais do dia completo — blocos de aula regular (cor padrão), blocos de intervalo regular (cor neutra), blocos de aula especial (cor diferenciada, ex: `surf2` com borda `accent`), blocos de intervalo especial (cor neutra com marcação diferente). A prévia é atualizada a cada mudança de campo sem aguardar salvamento.
- [ ] Controle de acesso: apenas `role === 'admin'` acessa a aba Períodos. Coordenadores que tentam modificar via `store.savePeriodCfg` passam pelo fluxo de aprovação pendente existente.

---

### Grade Horária Individual — `/schedule`

**Descrição:** Página existente que exibe a grade horária de um professor específico. Passa a renderizar a grade completa incluindo os blocos de aula especial derivados do novo modelo `gradeEspecial`. Para professores com aulas em dois turnos diferentes, exibe duas grades independentes verticalmente empilhadas.

**Componentes:**
- `ScheduleGrid` (existente, em `SettingsPage.jsx`): atualizado para consumir a nova estrutura `gradeEspecial` ao derivar os períodos do segmento
- `GradeTurnoCard`: wrapper que envolve uma `ScheduleGrid` com cabeçalho de turno — reutilizado duas vezes para professores com turno duplo
- Botão "Exportar PDF" (existente): chama `generateTeacherScheduleHTML` atualizado

**Behaviors:**
- [ ] Detectar turno duplo: ao montar a página, verificar se o professor possui aulas (`schedules`) em `timeSlots` que pertencem a dois turnos distintos (ex: `manha` e `tarde`). Considerado turno duplo quando existem `segmentId|turno` únicos com turnos diferentes.
- [ ] Renderizar grade de turno simples: se o professor tem aulas em um único turno, exibir uma única `ScheduleGrid` com o comportamento existente, agora incluindo linhas de aulas especiais quando `gradeEspecial` estiver configurado para o segmento/turno.
- [ ] Renderizar grade de turno duplo: se o professor tem aulas em dois turnos, exibir dois `GradeTurnoCard` empilhados verticalmente, cada um com seu cabeçalho de turno (ex: "Manhã — Ensino Fundamental" / "Tarde — Ensino Médio") e sua grade independente.
- [ ] Renderizar aulas especiais na grade: dentro de `ScheduleGrid`, após as linhas de aulas regulares, incluir linhas para os slots derivados de `gradeEspecial` onde o professor tenha aulas cadastradas. Diferenciar visualmente com background `surf2` e borda lateral colorida com `accent`, mantendo a mesma estrutura de colunas de dias.
- [ ] Exportar PDF de turno simples: ao clicar "Exportar PDF", chamar `openPDF(generateTeacherScheduleHTML(teacher, store, useApelido))` — o HTML gerado inclui as aulas especiais na tabela, diferenciadas por estilo inline.
- [ ] Exportar PDF de turno duplo: para professores com turno duplo, o PDF gerado por `generateTeacherScheduleHTML` contém duas tabelas em seções separadas, cada uma com seu cabeçalho de segmento/turno. Separadas por `page-break-inside: avoid` e estilo de seção visual claro (linha divisória ou `page-break-after: always` entre as duas grades).

---

### Grade Horária da Escola — `/school-schedule`

**Descrição:** Página existente que exibe a grade consolidada da escola. Atualizada para incluir os slots de aulas especiais no layout de grade, com diferenciação visual consistente com a `SchedulePage`.

**Componentes:**
- `ScheduleGrid` (compartilhado): mesma atualização descrita em `/schedule`
- Botão "Exportar PDF" (existente): chama `generateSchoolScheduleHTML` atualizado

**Behaviors:**
- [ ] Renderizar aulas especiais na grade da escola: incluir linhas de períodos especiais ao final da grade de cada segmento/turno quando `gradeEspecial` estiver configurado, mesmo que nenhum professor tenha aula alocada naquele slot (células vazias são renderizadas com o estilo especial).
- [ ] Exportar PDF com aulas especiais: `generateSchoolScheduleHTML` inclui as linhas de aulas especiais no HTML gerado com diferenciação de estilo inline coerente com a visualização em tela.

---

## Componentes Compartilhados

- `ScheduleGrid` (em `SettingsPage.jsx`, exportado): recebe `teacher`, `store` e passa a consumir `gradeEspecial` via `getCfg(segId, turno, periodConfigs)` para derivar os slots especiais. Renderiza linhas adicionais para cada aula especial com estilo diferenciado. Usado em `SchedulePage`, `SettingsPage` (aba Schedules) e `SchoolSchedulePage`.
- `PreviewLinhaTempo` (novo, em `SettingsPage.jsx`): componente de uso único dentro de `TabPeriods`/`CardPeriodo` que renderiza a linha do tempo visual do dia a partir do resultado de `buildPreviewItems(cfg)` atualizado.
- `AlertaImpeditivoModal` (novo, em `SettingsPage.jsx`): modal de uso único dentro de `TabPeriods` que exibe o conflito de tempo e a sugestão de ajuste proporcional.
- `SaldoTempo` (novo, em `SettingsPage.jsx`): badge/indicador inline de uso único dentro de `CardPeriodo` que exibe Tempo Total, Tempo Letivo e Tempo Residual calculados.

---

## Modelos de Dados

### `periodConfigs` — campo de `meta/config` (estrutura expandida)

```js
periodConfigs: {
  "[segmentId]": {
    "[turno]": {
      // Campos existentes (mantidos)
      inicio:     "07:00",   // início da 1ª AULA (não necessariamente o início do turno)
      duracao:    50,        // minutos por aula regular
      qtd:        7,         // total de aulas regulares por dia
      intervalos: [
        { apos: 3, duracao: 20 }   // intervalo regular após a N-ésima aula
      ],

      // Campos novos — limites do turno escolar
      inicioPeriodo: "07:00",   // início real do turno (ex: chegada dos professores)
      fimPeriodo:    "16:00",   // fim real do turno (âncora do tempo residual)

      // Campo novo — grade especial (substitui horariosEspeciais + intervalosEspeciais)
      gradeEspecial: {
        inicioEspecial: "14:00",   // hora de início da 1ª aula especial
        duracaoAula:    40,        // minutos por aula especial
        qtd:            3,         // total de aulas especiais
        itens: [
          // tipo 'intervalo' com ordem 0 = antes da 1ª aula especial
          { tipo: "intervalo", ordem: 0, duracao: 15 },
          { tipo: "aula",      ordem: 1, duracao: 40 },  // derivado de duracaoAula
          { tipo: "intervalo", ordem: 1, duracao: 10 },  // após a 1ª aula especial
          { tipo: "aula",      ordem: 2, duracao: 40 },
          { tipo: "aula",      ordem: 3, duracao: 40 },
        ]
      }
    }
  }
}
```

**Observação sobre migração:** Os campos `horariosEspeciais` e `intervalosEspeciais` existentes no Firestore são lidos durante a transição mas não gravados pela nova UI. A função `buildPreviewItems` em `SettingsPage.jsx` e `gerarPeriodos` em `periods.js` devem continuar suportando a leitura do formato antigo como fallback enquanto os dados não forem migrados.

### Slots derivados de `gradeEspecial` (em memória, não armazenados)

A função `gerarPeriodosEspeciais(cfg)` em `periods.js` (nova) retorna:

```js
[
  { label: "Intervalo inicial", inicio: "14:00", fim: "14:15", isEspecial: true, isIntervalo: true },
  { label: "1ª Aula especial", inicio: "14:15", fim: "14:55", isEspecial: true, isIntervalo: false },
  { label: "Intervalo especial", inicio: "14:55", fim: "15:05", isEspecial: true, isIntervalo: true },
  { label: "2ª Aula especial", inicio: "15:05", fim: "15:45", isEspecial: true, isIntervalo: false },
  ...
]
```

### `schedules/` — sem alteração de schema

Os slots de aulas especiais seguem o mesmo formato `timeSlot: "segmentId|turno|aulaIdx"`. O `aulaIdx` para aulas especiais usa índices negativos ou um prefixo distinto (ex: `"seg-fund|manha|e1"`, `"seg-fund|manha|e2"`) para diferenciar de aulas regulares sem quebrar `parseSlot`. Definição exata do formato do `timeSlot` especial deve ser tomada no momento da implementação de `gerarPeriodosEspeciais`.

---

## Regras de Negócio

1. **Hierarquia temporal:** `inicioPeriodo ≤ inicio` (início da 1ª aula regular) e `fimPeriodo ≥ fim da última aula regular + intervalos`. O sistema não impede configurações onde `inicio < inicioPeriodo`, mas deve alertar com um aviso não-impeditivivo.

2. **Cálculo de tempo residual:**
   - Tempo Total = `toMin(fimPeriodo) − toMin(inicioPeriodo)`
   - Tempo Letivo = `qtd × duracao + Σ(intervalos[].duracao)`
   - Tempo Residual = Tempo Total − Tempo Letivo
   - Se Tempo Residual < 0, a própria grade regular já excede o turno — exibir alerta de consistência independente da grade especial.

3. **Regra de encaixe da grade especial:** `Σ(gradeEspecial.itens[tipo=aula].duracao) + Σ(gradeEspecial.itens[tipo=intervalo].duracao) ≤ Tempo Residual`. O total é calculado usando `duracaoAula × qtd` para os itens de aula e a `duracao` individual de cada intervalo.

4. **Alerta impeditivivo:** quando a grade especial excede o tempo residual, o salvamento via `store.savePeriodCfg` é bloqueado (a função retorna sem chamar `saveConfig`). O `AlertaImpeditivoModal` é exibido com: (a) excedente em minutos, (b) duração calculada que faria caber: `Math.floor(Tempo Residual - Σ intervalos especiais) / qtdAulasEspeciais`.

5. **Sugestão de ajuste proporcional:** a duração sugerida para `duracaoAula` é calculada como `floor((TempoResidual − ΣIntervalosEspeciais) / qtdAulasEspeciais)`. O sistema jamais sugere duração menor que 15 minutos — se o cálculo resultar em valor menor, exibe apenas o aviso sem sugestão de aplicação automática.

6. **Turno duplo:** um professor é considerado com turno duplo quando possui `schedules` com `timeSlot` apontando para dois turnos distintos (comparando `segmentId|turno` únicos). A detecção não leva em conta o horário real — dois segmentos distintos com o mesmo turno não configuram turno duplo para efeitos de PDF.

7. **Diferenciação visual:** aulas especiais são renderizadas com fundo `surf2` e borda esquerda `accent`. Intervalos especiais com fundo `surf2` e estilo tracejado. Essa distinção é aplicada consistentemente em `ScheduleGrid` (tela) e no HTML gerado para PDF (usando estilos inline equivalentes).

8. **PDF de turno duplo:** as duas grades de um professor com turno duplo são sempre renderizadas em seções independentes. Em `@media print`, a classe `.grade-section` recebe `page-break-after: auto` e `.grade-section + .grade-section` recebe `page-break-before: always` para garantir que cada grade comece em nova página quando o PDF for longo.

9. **Backward compatibility:** `getCfg` e `gerarPeriodos` em `periods.js` não são modificados em suas assinaturas. A nova função `gerarPeriodosEspeciais(cfg)` é adicionada separadamente. `buildPreviewItems` em `SettingsPage.jsx` é atualizada para priorizar `gradeEspecial` quando presente, e usar `horariosEspeciais`/`intervalosEspeciais` como fallback.

10. **Ação de coordenador:** `savePeriodCfg` já está na lista de actions guardadas para coordenadores — qualquer alteração de período feita por coordenador passa pelo fluxo de `pending_actions` existente sem necessidade de mudança.

---

## Fora do Escopo (v1)

- Migração automática dos documentos Firestore existentes de `horariosEspeciais`/`intervalosEspeciais` para o novo campo `gradeEspecial` — a migração é feita manualmente pelo ADM reconfigurando cada segmento na UI.
- Slots de aulas especiais como origem para registro de ausências — os slots especiais são apenas informativos nesta versão e não participam do fluxo de `absences`.
- Substituição de professores em aulas especiais — fora de escopo por não integrar com `absences`.
- Grade especial diferente por dia da semana — a `gradeEspecial` se aplica uniformemente a todos os dias úteis do segmento/turno.
- Relatórios de ausências/substituições segmentados por aulas especiais — `reports.js` para ausências não é alterado nesta versão.
- Drag-and-drop para reordenar itens da grade especial — a reordenação é feita via edição manual do campo `ordem`.
- Suporte a mais de dois turnos por professor no PDF — a spec cobre turno duplo; três ou mais turnos são tratados pelo mesmo mecanismo de múltiplos `GradeTurnoCard` mas não são um caso de uso esperado.
