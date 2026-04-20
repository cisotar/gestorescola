## Plano Técnico

### Análise do Codebase

- [src/lib/db.js](src/lib/db.js) — arquivo alvo. Padrões existentes reutilizáveis:
  - **Linha 1–5**: imports já incluem `getDocs`, `collection`, `writeBatch`, `doc` — **nenhum import novo necessário**
  - **Linhas 67–75**: `_syncCol` usa o mesmo padrão `CHUNK = 400` + `writeBatch` — a função de migração replica esta estrutura fielmente
  - **Linhas 190–204**: `approveTeacher` usa `batch.update` para migrar `teacherId` em schedules — mesmo padrão de update parcial que usaremos aqui

- [src/pages/SettingsPage.jsx](src/pages/SettingsPage.jsx) — afetado apenas se a opção "botão temporário em TabAdmin" for escolhida:
  - **Linhas 1560–1581**: `TabAdmin` é um grid de cards simples, com botões que abrem modais. Um card de migração pode ser adicionado ao lado dos existentes.
  - A alternativa (chamar via console do browser) não toca este arquivo.

### Cenários

**Caminho Feliz — primeira execução com docs legados:**
1. Função lê todos os docs da coleção `schedules`
2. Filtra os que têm `turma` em `MIGRATION_MAP` (ex: `"FORMAÇÃO - ATPCG"`)
3. Processa em batches de 400: `batch.update` define `{ turma: 'FORMAÇÃO', subjectId: 'formation-atpcg' }`
4. Retorna `n > 0`; log exibe `"[migration] N schedules migrados."`

**Caminho Feliz — segunda execução (idempotência):**
1. Nenhum doc tem `turma` nos valores do `MIGRATION_MAP` (já foram atualizados para `'FORMAÇÃO'`)
2. `toMigrate.length === 0` → log `"Nenhum schedule de formação para migrar."`, retorna `0`

**Casos de Borda:**
- Schedules regulares (`turma = '6º Ano A'`): `MIGRATION_MAP[turma]` é `undefined` → filtrados fora, **não tocados**
- Schedules de FORMAÇÃO já migrados (`turma = 'FORMAÇÃO'`): `MIGRATION_MAP['FORMAÇÃO']` é `undefined` → filtrados fora, **não tocados**
- `'FORMAÇÃO - ALINHAMENTO'`: nunca existiu como valor antigo → não está no `MIGRATION_MAP`, nenhum doc afetado (Alinhamento é novo em #070)
- Coleção `schedules` vazia: `toMigrate.length === 0`, retorna `0` imediatamente
- Mais de 400 schedules de formação: loop de chunks processa em múltiplos batches sequenciais, Firestore não limita

**Tratamento de Erros:**
- Falha de rede/Firestore durante `batch.commit()`: exceção propagada naturalmente para o chamador (console ou botão UI). Docs do chunk que falhou não são atualizados; chunks anteriores já commitados permanecem migrados. Uma nova execução prossegue do estado atual (idempotente por design).
- A função não faz rollback — se interrompida no meio, re-executar completa os docs restantes.

### Schema de Banco de Dados

**Coleção: `schedules`** — apenas campos afetados:

| Campo | Valor antes | Valor depois |
|-------|-------------|--------------|
| `turma` | `'FORMAÇÃO - ATPCG'` / `'FORMAÇÃO - ATPCA'` / etc. | `'FORMAÇÃO'` (fixo) |
| `subjectId` | `null` | `'formation-atpcg'` / `'formation-atpca'` / `'formation-multiplica'` / `'formation-pda'` |

Todos os outros campos (`id`, `teacherId`, `day`, `timeSlot`, etc.) são preservados — `batch.update` faz merge parcial.

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar
- [src/lib/db.js](src/lib/db.js) — adicionar `migrateFormationSchedules` ao final do arquivo, antes do bloco `// ─── LocalStorage fallback`. Nenhum import novo necessário.

### Arquivos que NÃO devem ser tocados
- [src/pages/SettingsPage.jsx](src/pages/SettingsPage.jsx) — preferir acionamento via console do browser; evitar poluir a UI com código temporário de migração
- [src/lib/constants.js](src/lib/constants.js) — o `MIGRATION_MAP` é definido inline na função propositalmente: evita importar `constants.js` em `db.js` e as strings antigas não são exportadas pelos novos constants

### Dependências Externas
Nenhuma — usa apenas Firebase Firestore SDK já presente no projeto.

### Ordem de Implementação
1. **Pré-requisito**: #070, #071 e #072 em produção e funcionando
2. Adicionar `migrateFormationSchedules` ao final de [src/lib/db.js](src/lib/db.js) (antes do bloco de LocalStorage)
3. Fazer deploy da função para produção
4. Executar via console do browser logado como admin:
   ```js
   const { migrateFormationSchedules } = await import('/src/lib/db.js')
   migrateFormationSchedules().then(n => console.log(n, 'migrados'))
   ```
5. Verificar no console do Firestore que os docs foram atualizados
6. Criar follow-up issue (ou PR) para remover a função após confirmação

> **Risco:** `batch.update` escreve apenas os campos especificados (merge parcial) — correto. Caso fosse `batch.set`, sobrescreveria o documento inteiro, perdendo `teacherId`, `day`, `timeSlot`, etc. Verificar que o código usa `update`, não `set`.
>
> **Risco:** Executar a migração antes de #071/#072 estarem em produção deixa o Firestore com dados novos que o código antigo não sabe exibir (`subjectId = 'formation-atpcg'` vs. exibição baseada em `s.turma`). A ordem de deploy é crítica.
