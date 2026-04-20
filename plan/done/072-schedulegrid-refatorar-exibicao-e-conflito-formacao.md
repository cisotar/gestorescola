## Plano Técnico

### Análise do Codebase

- [src/lib/constants.js](src/lib/constants.js) — atualmente tem `FORMATION_SERIES`/`isFormationSeries`. Os novos `isFormationTurma` e `getFormationSubject` são adicionados em #070. **Pré-requisito obrigatório.**

- [src/pages/SettingsPage.jsx](src/pages/SettingsPage.jsx) — único arquivo afetado. Pontos relevantes no `ScheduleGrid`:
  - **Linha 7**: `import { COLOR_PALETTE, FORMATION_SERIES, isFormationSeries }` — compartilhado com `AddScheduleModal`; `isFormationSeries` é removida aqui (esta é a última referência após #071 já ter migrado `AddScheduleModal`)
  - **Linha 1289–1291**: `hardBlockedTurmas` — filtro usa `!isFormationSeries(s.turma)`, trocar para `!isFormationTurma(s.turma)` 
  - **Linha 1302**: `const subj = store.subjects.find(x => x.id === s.subjectId)` — substituir pela lógica que separa formação de matéria regular
  - **Linha 1303**: `const isFormation = isFormationSeries(s.turma)` — trocar para `isFormationTurma(s.turma)`
  - **Linha 1304**: `const isFixed = s.turma === 'FORMAÇÃO - ATPCG' || s.turma === 'FORMAÇÃO - ATPCA'` — substituir por `formSubj?.tipo === 'fixo'`
  - **Linhas 1308–1312**: badge `{isFormation && ...}` — condicionar também a `formSubj` para não renderizar quando `subjectId` é nulo (docs legados)

### Cenários

**Caminho Feliz — célula FORMAÇÃO com subjectId:**
1. `s.turma === 'FORMAÇÃO'`, `s.subjectId === 'formation-atpcg'`
2. `isFormation = true`, `formSubj = { id: 'formation-atpcg', name: 'ATPCG', tipo: 'fixo' }`
3. `subj = formSubj`, `isFixed = true`
4. Renderiza: `"FORMAÇÃO"` + badge azul "Fixo" + `"ATPCG"`

**Caminho Feliz — célula regular:**
1. `s.turma === '6º Ano A'`, `s.subjectId = 'subj-math-id'`
2. `isFormation = false`, `formSubj = null`
3. `subj = store.subjects.find(...)` → objeto da matéria
4. Renderiza: `"6º Ano A"` + sem badge + nome da matéria

**Casos de Borda:**
- FORMAÇÃO sem `subjectId` (doc legado): `formSubj = null`; badge não renderiza (`isFormation && formSubj` é falso); linha 2 mostra `'—'`
- `subjectId` de formação inválido (id não existe em `FORMATION_SUBJECTS`): `getFormationSubject` retorna `undefined`; comportamento idêntico ao caso acima
- Célula regular sem matéria (`subjectId = null`): `subj = undefined`; linha 2 mostra `'—'` — comportamento inalterado
- Dois professores com FORMAÇÃO no mesmo slot: nenhum entra em `hardBlockedTurmas` (filtrado por `!isFormationTurma`); botão `＋` continua aparecendo corretamente para outros slots

**Tratamento de Erros:**
- Nenhum I/O; todos os dados vêm do `store` em memória. Não há casos de erro de rede.

### Schema de Banco de Dados
*(Não aplicável — sem escrita em Firestore nesta issue.)*

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar
- [src/pages/SettingsPage.jsx](src/pages/SettingsPage.jsx):
  - **Linha 7** — import: remover `FORMATION_SERIES` e `isFormationSeries` (que #071 já não usa mais); adicionar `isFormationTurma` e `getFormationSubject`; manter `COLOR_PALETTE`
  - **Linhas 1289–1291** — `hardBlockedTurmas`: `.filter(s => !isSharedSchedule(s, store) && !isFormationTurma(s.turma))`
  - **Linhas 1302–1304** — declarações de `subj`, `isFormation`, `isFixed`: substituir pelo bloco de 4 linhas do novo modelo
  - **Linha 1308** — condição do badge: `{isFormation && formSubj && (...)}`

### Arquivos que NÃO devem ser tocados
- `src/lib/constants.js` — modificado em #070
- Lógica do `AddScheduleModal` — escopo de #071
- Restante do JSX do `ScheduleGrid` (linhas 1324–1352: indicadores de bloqueio, botão `＋`) — sem mudanças

### Dependências Externas
Nenhuma.

### Ordem de Implementação
1. **Pré-requisito**: #070 e #071 já implementadas (ou fazendo tudo no mesmo PR/branch)
2. **Linha 7** — atualizar import: trocar `FORMATION_SERIES, isFormationSeries` por `isFormationTurma, getFormationSubject`
3. **Linhas 1289–1291** — atualizar `hardBlockedTurmas`
4. **Linhas 1302–1304** — atualizar as três declarações de variáveis no `mine.map`
5. **Linha 1308** — adicionar `&& formSubj` na condição do badge

> **Risco:** Se esta issue for executada sem #071 já feita, `isFormationSeries` ainda estará no import (linha 7) e não pode ser removida. Recomendado fazer #070 → #071 → #072 em sequência no mesmo branch, removendo `FORMATION_SERIES`/`isFormationSeries` do import **somente nesta etapa final**.
