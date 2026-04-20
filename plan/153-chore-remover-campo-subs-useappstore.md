## Plano Técnico

### Análise do Codebase

Grep completo de `\bsubs\b` no projeto revelou:

- `src/store/useAppStore.js:53` — `subs: {}` no estado inicial → **remover**
- `src/lib/db.js:423` — `subs` na destructuring de `_saveToLS` → **remover**
- `src/lib/db.js:428` — `subs: subs ?? {}` no objeto JSON → **remover**
- `src/lib/db.js` (saveToFirestore) — **não contém `subs`** ✓
- Demais ocorrências de `subs` em pages são variáveis locais sem relação com `store.subs` ✓

**Conclusão:** exatamente 3 linhas a alterar, em 2 arquivos.

### Cenários

**Caminho Feliz:**
1. Dev remove as 3 linhas
2. App inicia normalmente — `useAppStore` não tem mais `subs`
3. `_saveToLS` salva localStorage sem o campo `subs`
4. Cache antigo com `subs` no localStorage do usuário é ignorado (hydrate só lê campos conhecidos)

**Casos de Borda:**
- Usuário com cache antigo: campo extra no JSON simplesmente não é lido → sem efeito colateral

### Arquivos a Criar
Nenhum.

### Arquivos a Modificar

**1. `src/store/useAppStore.js`** — linha 53: remover `subs: {},`

**2. `src/lib/db.js`** — `_saveToLS` (linhas 422-428):
- Remover `subs` da destructuring
- Remover `subs: subs ?? {}` do objeto serializado

### Arquivos que NÃO devem ser tocados
- `src/pages/*` — usos de `subs` são variáveis locais, sem relação
- `references/architecture.md` — coberto pela #154

### Dependências Externas
Nenhuma.

### Ordem de Implementação
1. `src/store/useAppStore.js` — remover linha 53
2. `src/lib/db.js` — atualizar `_saveToLS`
