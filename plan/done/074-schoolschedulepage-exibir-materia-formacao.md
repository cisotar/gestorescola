## Plano Técnico

### Análise do Codebase

- [src/pages/SchoolSchedulePage.jsx](src/pages/SchoolSchedulePage.jsx) — único arquivo afetado. Estrutura relevante:

  - **Linhas 1–7**: imports atuais — `constants` não está importado; será necessário adicionar
  - **Componente `SchoolGrid` (linhas 10–83)**: renderiza a tabela. A lógica de célula está no `matches.map` a partir da linha 53
  - **Linhas 54–55**: variáveis declaradas por schedule `s`:
    ```js
    const teacher = store.teachers.find(t => t.id === s.teacherId)
    const subject = store.subjects?.find(sub => sub.id === s.subjectId)
    ```
    Para schedules de FORMAÇÃO, `store.subjects.find(sub => sub.id === 'formation-atpcg')` retorna `undefined` (IDs de formação não estão em `store.subjects`). A linha `subject?.name ?? '—'` exibirá `'—'` — comportamento aceitável pois o nome da atividade já aparecerá em `displayLabel`
  - **Modo `showTeacher = false` (linhas 64–67)**: exibe `s.turma` na linha principal (linha 65) — **este é o ponto exato a corrigir**
  - **Modo `showTeacher = true` (linhas 59–62)**: exibe nome do professor + `subject?.name` — não exibe `s.turma`, portanto **não precisa de mudança** para o requisito desta issue

### Cenários

**Caminho Feliz — célula FORMAÇÃO (modo turma, `showTeacher = false`):**
1. `s.turma = 'FORMAÇÃO'`, `s.subjectId = 'formation-atpca'`
2. `isFormation = true`, `formSubj = { id: 'formation-atpca', name: 'ATPCA', tipo: 'fixo' }`
3. `displayLabel = 'Formação · ATPCA'`
4. Célula renderiza: linha 1 = `"Formação · ATPCA"`, linha 2 = `"—"` (subjectId não encontrado em `store.subjects`)

**Caminho Feliz — célula regular (modo turma):**
1. `s.turma = '7º Ano B'`, `s.subjectId = 'some-regular-id'`
2. `isFormation = false`, `formSubj = null`
3. `displayLabel = '7º Ano B'`
4. Célula renderiza: sem mudança de comportamento

**Caminho Feliz — modo professor (`showTeacher = true`):**
- `s.turma` não é exibido neste modo; `displayLabel` não é usado. Bloco não precisa de mudança.

**Casos de Borda:**
- FORMAÇÃO sem `subjectId` (doc legado pré-migração): `formSubj = undefined` → `displayLabel = 'Formação · ?'` — AC #3 coberto
- `subjectId` de formação inválido: `getFormationSubject` retorna `undefined` → mesmo fallback `'?'`
- `s.turma = null` em schedule regular: `displayLabel = null` → `{null}` no React renderiza vazio — comportamento idêntico ao `{s.turma ?? '—'}` atual; se necessário, usar `displayLabel ?? '—'`

**Tratamento de Erros:**
- Nenhum I/O nesta renderização. Todos os dados vêm do `store` em memória.

### Schema de Banco de Dados
*(Não aplicável — esta issue é somente de leitura/exibição.)*

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar
- [src/pages/SchoolSchedulePage.jsx](src/pages/SchoolSchedulePage.jsx):
  - **Linha 6** (após os imports existentes) — adicionar:
    ```js
    import { isFormationTurma, getFormationSubject } from '../lib/constants'
    ```
  - **Linha 53** (início do `matches.map`, antes das declarações `teacher`/`subject`) — adicionar as três variáveis `isFormation`, `formSubj`, `displayLabel`
  - **Linha 65** — substituir `{s.turma ?? '—'}` por `{displayLabel ?? '—'}`

### Arquivos que NÃO devem ser tocados
- Linhas 59–62 (`showTeacher = true` block) — não exibe `s.turma`; fora do escopo desta issue
- Filtro `allTurmas` (linhas 110–118) — usa `s.turma` bruto para o select de filtro. Após migração, aparecerá uma única opção `'FORMAÇÃO'` que filtra todos os schedules de formação. Comportamento aceitável; não alterar aqui
- [src/lib/db.js](src/lib/db.js), [src/lib/constants.js](src/lib/constants.js) — sem mudanças nesta issue

### Dependências Externas
Nenhuma.

### Ordem de Implementação
1. **Pré-requisito**: #070 implementada (exports `isFormationTurma`, `getFormationSubject`)
2. Adicionar import de `isFormationTurma` e `getFormationSubject` (linha 6)
3. Declarar `isFormation`, `formSubj`, `displayLabel` dentro do `matches.map` (linha 53, antes de `teacher`)
4. Substituir `s.turma` por `displayLabel` na linha 65 (modo `showTeacher = false`)

> **Nota sobre #073**: a migração Firestore (#073) não é pré-requisito para *implementar* esta issue — o código funciona com ambos os formatos (docs legados exibem `'Formação · ?'`, docs migrados exibem `'Formação · ATPCG'`). O pré-requisito de #073 mencionado nas Notes é apenas para que a exibição seja correta na produção.
