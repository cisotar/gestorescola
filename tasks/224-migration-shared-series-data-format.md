title:	[Data] Migração de sharedSeries — remover activities/tipo/order
state:	OPEN
author:	cisotar
labels:	chore, migration
comments:	0
assignees:	
projects:	
milestone:	
number:	224
url:	https://github.com/cisotar/gestorescola/issues/224
--
## Context
O campo `activities[]` de `sharedSeries` não é mais utilizado. O spec simplifica a estrutura removendo `activities`, `tipo` e `order`, substituindo por um único campo `type: "formation" | "elective"`.

Esta issue é a primeira: migração one-shot de dados antigos para novo formato, executada no boot de `db.js`.

## What to do
- Criar função `migrateSharedSeriesToNewFormat(config)` em `src/lib/migrations.js`
- Detectar dados antigos: se `sharedSeries[0].activities` existe, executar migração
- Remover campos: `activities`, `tipo`, `order` de cada turma compartilhada
- Adicionar campo `type`: `"formation"` para FORMAÇÃO (ou detectar por name), `"elective"` para demais
- Chamar função em `db.js` durante `loadFromFirestore()` — antes de persistir no store
- Testar com dados de teste: imporatar config antigo e validar transformação
- Documentar: adicionar comentário em `db.js` indicando quando remover esta função (após todos os usuários migrarem)

## Files affected
- `src/lib/migrations.js` (novo arquivo)
- `src/lib/db.js` — adicionar import de `migrateSharedSeriesToNewFormat`, chamar em `loadFromFirestore()`

## Acceptance criteria
- [x] Função migra `sharedSeries` com `activities[]` para novo formato sem erro
- [x] Detecta dados antigos automaticamente (sem flag manual)
- [x] Preserva `id` e `name` de cada turma compartilhada
- [x] Atribui `type: "formation"` a turmas antigas com nome FORMAÇÃO
- [x] Logs indicam quando migração foi executada
- [x] Dados já migrados não sofrem re-processamento

## Notes
Dependência: Issue anterior (setup initial) deve estar finalizada.
Próxima issue: migração de `schedules` para setar `subjectId = null` em turmas compartilhadas.

---

## Plano Técnico

### Análise do Codebase

**O que já existe e pode ser reutilizado:**

- `src/lib/db.js` — Fluxo de carregamento `loadFromFirestore()` que lê `meta/config` e chama `_loadConfig()` (linha 52-75). A função retorna objeto com campos-chave incluindo `sharedSeries`.
- `src/lib/helpers.js` — Utilitários como `uid()` (linha 3-4), `getSharedSeriesForTurma()` (linha 48-50) e `getSharedSeriesActivity()` (linha 52-58) que já acessam `sharedSeries` com `activities[]`.
- `src/store/useAppStore.js` — Store centraliza `sharedSeries` no estado (linha 48), com ação `hydrate()` que o popula a partir de dados carregados.
- `src/lib/db.js` `saveConfig()` (linha 208-217) — função atômica para persistir mudanças em `meta/config`.
- Valor seed padrão em `src/lib/db.js` `DEFAULT_SHARED_SERIES` (linha 9-21) — dados antigos com estrutura `activities[]`, `tipo`, `order`.

**LocalStorage:**
- Chave: `'gestao_v8_cache'` (linha 8 em db.js)
- Formato: `{ data: {...}, timestamp: ... }`
- Função `_saveToLS()` (line 160) salva estado junto com Firestore

---

### Cenários

**Caminho Feliz (Migração):**
1. App inicializa, chama `loadFromFirestore()` → `_loadConfig()`
2. Objeto retornado contém `sharedSeries` com estrutura antiga (tem `activities[]`)
3. Em `loadFromFirestore()` antes de retornar dados, chama `migrateSharedSeriesToNewFormat(config)`
4. Função detecta `activities[0]` existindo
5. Para cada `sharedSeries[i]`:
   - Remove campos `activities`, `tipo`, `order`
   - Adiciona `type: "formation"` se `name === "FORMAÇÃO"`, senão `type: "elective"`
   - Preserva `id` e `name`
6. Logs emitem `[migrations] Migrou X sharedSeries de formato antigo para novo`
7. Retorna config transformado, persiste via `saveConfig()` no Firestore
8. Próximas inicializações não detectam `activities[]` (já removido), função não roda mais

**Dados Já Migrados:**
- Se `sharedSeries[0].activities` não existe, função retorna config inalterado sem fazer nada
- Nenhum log desnecessário
- Próximas chamadas também não executam migração (idempotente)

**Casos de Borda:**

| Cenário | Comportamento esperado |
|---------|------------------------|
| `sharedSeries` vazio | Não executa migração, retorna array vazio |
| `sharedSeries` tem `type` mas ainda tem `activities` | Executa migração, remove `activities` mesmo que `type` já exista (assume dados parcialmente migrados) |
| `name === "FORMAÇÃO"` | Recebe `type: "formation"` |
| `name === "Eletivas"` ou qualquer outro | Recebe `type: "elective"` |
| Elemento sem `id` ou `name` | Preserva como está (não altera campos faltantes) — esses casos são defeitos de dados, não responsibility da migração de format |
| LocalStorage tem cache com dados antigos | Após migração no Firestore, cache LS será invalidado no próximo save porque `updatedAt` mudou |

**Tratamento de Erros:**

| Erro | Estratégia |
|------|-----------|
| Falha ao persistir em Firestore após migração | `saveConfig()` já trata com `console.error()` — se falhar, dados em memória estão corretos, próxima tentativa (reload) migrará novamente |
| `config` é `null` ou undefined | Função retorna `config` inalterado (sem fazer nada) |
| `config.sharedSeries` é `null` | Retorna inalterado (não há o que migrar) |
| `config.sharedSeries` não é array | Retorna inalterado |

---

### Schema de Transformação

**ANTES (estrutura antiga):**
```js
{
  id: "shared-formacao",
  name: "FORMAÇÃO",
  activities: [
    { id: "formation-atpcg", name: "ATPCG", tipo: "fixo", order: 0 },
    { id: "formation-atpca", name: "ATPCA", tipo: "fixo", order: 1 },
    // ...mais activities
  ]
}
```

**DEPOIS (estrutura nova):**
```js
{
  id: "shared-formacao",
  name: "FORMAÇÃO",
  type: "formation"  // ou "elective" para demais
}
```

---

### Arquivos a Criar

- **`src/lib/migrations.js`** — arquivo novo, exporta `migrateSharedSeriesToNewFormat(config)`:
  - Detecta `config.sharedSeries[0]?.activities` existindo (criério de ativação)
  - Se não existir, retorna config inalterado
  - Se existir:
    - Clona array `sharedSeries`
    - Para cada item:
      - Remove `activities`, `tipo`, `order` via operador spread (não mutação)
      - Adiciona `type` baseado em `name === "FORMAÇÃO"` ? `"formation"` : `"elective"`
    - Log: `console.log(`[migrations] Migrou ${sharedSeries.length} sharedSeries para novo formato`)`
    - Retorna config mutado apenas na chave `sharedSeries`
  - **Documentação (comentário):** "TODO: Remover esta função após 2026-06-01, quando todos os usuários tiverem migrado"

---

### Arquivos a Modificar

- **`src/lib/db.js`**:
  
  **Linha 1 — Adicionar import:**
  ```js
  import { migrateSharedSeriesToNewFormat } from './migrations'
  ```

  **Linha 44 — Modificar `loadFromFirestore()` return:**
  ```js
  // ANTES:
  return { ...config, teachers, schedules, absences, history }
  
  // DEPOIS:
  const migratedConfig = migrateSharedSeriesToNewFormat(config)
  return { ...migratedConfig, teachers, schedules, absences, history }
  ```

  **Linhas 74-75 — Modificar retorno de `_loadConfig()` quando sharedSeries é seed:**
  ```js
  // ANTES:
  return result
  
  // DEPOIS:
  const migratedResult = migrateSharedSeriesToNewFormat(result)
  return migratedResult
  ```

---

### Arquivos que NÃO devem ser tocados

- `src/store/useAppStore.js` — Store não muda, continua recebendo e salvando `sharedSeries`. Apenas o schema do objeto dentro do array muda (internamente, sem consequências para o store).
- `src/lib/helpers.js` — Funções como `getSharedSeriesActivity()` que acessam `ss.activities` **PRECISAM SER VERIFICADAS** depois da migração, mas **nesta issue não tocamos**: a próxima issue (task 225) vai remover referências a `activities` do código.
- `src/lib/constants.js` — Não afetado
- Firestore Regras — Não afetadas (schema Firestore é flexível)
- `src/lib/periods.js` — Não afetado nesta issue

---

### Dependências Externas

Nenhuma. Função é pure (sem imports de Firebase, apenas manipulação de objetos JavaScript).

---

### Ordem de Implementação

1. **Criar `src/lib/migrations.js`** — implementar `migrateSharedSeriesToNewFormat()`
   - Usar apenas operador spread e map (sem mutations)
   - Testar com objeto mock de `sharedSeries` antiga
   - Verificar logs emitidos

2. **Modificar `src/lib/db.js`** — importar função e integrar em `loadFromFirestore()` e `_loadConfig()`
   - Garantir que migração rodará no boot
   - Que dados migrados serão persistidos via `saveConfig()` (chamar **manualmente** após migração, ou a função retorna e deixar o store responsável?)
   
   **Decisão técnica importante:** Quem chama `saveConfig()`?
   - **Opção A:** `db.js` chama `saveConfig()` imediatamente após detectar migração (garante persistência no boot)
   - **Opção B:** Função retorna apenas o objeto migrado, deixa store/hydrate chamar `saveConfig()` mais tarde
   
   **Recomendação: Opção B (menos invasivo)**
   - `loadFromFirestore()` retorna config migrado
   - `App.jsx` chama `store.hydrate(data)`, que popula estado
   - Store já tem action para salvar quando necessário
   - Mas: dados não serão persistidos imediatamente se ninguém chamar `saveConfig()` após `hydrate()` com dados migrados
   
   **Decisão final: Opção A com flag**
   - Função retorna `{ config, wasMigrated: boolean }`
   - Se `wasMigrated === true`, `loadFromFirestore()` chama `saveConfig()` após hidratação
   - Garante persistência sem duplicar lógica no store

3. **Testes:**
   - Dados antigos em LS com `activities[]` → rodar função → verificar remoção de campos e adição de `type`
   - Dados já migrados → função retorna inalterado
   - Integração: `loadFromFirestore()` retorna config migrado
   - Verificar que dados migrados aparecem em `meta/config` no Firestore
   - Logs aparecem no console no primeiro boot após migração

---

### Checklist de Validação

Após implementação:

- [ ] Função `migrateSharedSeriesToNewFormat` existe e exporta
- [ ] Detecta automaticamente dados antigos (sem flag)
- [ ] Remove `activities`, `tipo`, `order` de cada turma
- [ ] Adiciona `type: "formation"` para "FORMAÇÃO"
- [ ] Adiciona `type: "elective"` para demais
- [ ] Preserva `id` e `name`
- [ ] Logs aparecem quando migração executa
- [ ] Dados já migrados não são processados novamente
- [ ] Config migrado é persistido em Firestore
- [ ] App funciona normalmente após migração (sem erros de `activities` undefined)
- [ ] LocalStorage é atualizado com dados migrados
- [ ] Comentário TODO indicando quando remover função
