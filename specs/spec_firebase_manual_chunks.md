# Spec: Firebase manualChunks — Isolamento do SDK no Bundle

## Visão Geral

O main bundle do GestãoEscolar mede 676 KB (178 KB gzip), acima do alvo de 500 KB.
A causa raiz é o Firebase SDK (~200 KB comprimido) importado estaticamente via
`src/lib/firebase/index.js → src/App.jsx`, o que garante sua presença no bundle
principal independentemente de qualquer modularização ou lazy-load de páginas.

A solução é configurar `manualChunks` no `vite.config.js` para que o Rollup mova
o Firebase para um chunk separado, reduzindo o main bundle para ~450–500 KB e
mantendo o Firebase como dependência paralela que o browser baixa simultaneamente.

O `vite.config.js` já tem a configuração adicionada. Esta spec cobre a validação,
medição do resultado e verificação do alvo atingido.

## Stack Tecnológica

- Frontend: React 18 + Vite 5.4 (bundler)
- Bundler config: `vite.config.js` / Rollup `manualChunks`
- Firebase: v10 (API modular — `firebase/app`, `firebase/auth`, `firebase/firestore`)
- CI/tooling: `npm run build` + análise de output em `dist/assets/`

## Páginas e Rotas

Este projeto não introduz novas páginas. A entrega é inteiramente de infraestrutura
de build.

---

## Fluxos de Validação

### Fluxo 1 — Verificação do vite.config.js

**Descrição:** Confirmar que o `vite.config.js` contém a configuração `manualChunks`
correta, listando apenas os módulos Firebase efetivamente importados no projeto.

**Behaviors:**
- [ ] Verificar que `manualChunks` está definido dentro de `build.rollupOptions.output`
- [ ] Confirmar que o chunk `firebase` inclui `'firebase/app'`, `'firebase/auth'` e `'firebase/firestore'`
- [ ] Identificar se `'firebase/storage'` está listado no chunk mas NÃO é importado em nenhum arquivo de `src/` — se confirmado, remover do `manualChunks` para evitar chunk vazio/supérfluo
- [ ] Confirmar que arquivos `.bak` (`src/lib/firebase.js.bak`, `src/lib/db.js.bak`) não são incluídos no bundle (Vite ignora por padrão, mas verificar se há imports acidentais)
- [ ] Registrar o estado final do `manualChunks` após eventuais ajustes

### Fluxo 2 — Auditoria de imports Firebase no projeto

**Descrição:** Mapear todos os arquivos que importam de `firebase/*` para confirmar
quais submódulos do SDK são realmente usados e devem aparecer no chunk.

**Módulos Firebase confirmados em uso (por arquivo):**

| Arquivo | Módulos Firebase importados |
|---|---|
| `src/lib/firebase/index.js` | `firebase/app`, `firebase/firestore`, `firebase/auth` |
| `src/lib/db/index.js` | `firebase/firestore` |
| `src/lib/db/config.js` | `firebase/firestore` |
| `src/lib/db/listeners.js` | `firebase/firestore` |
| `src/store/useAuthStore.js` | `firebase/auth`, `firebase/firestore` |
| `src/pages/PendingPage.jsx` | `firebase/firestore` |

**Behaviors:**
- [ ] Confirmar que `firebase/storage` não possui nenhum import em `src/` (grep em todos os `.js` e `.jsx` de `src/`)
- [ ] Se `firebase/storage` não é usado, remover do array `manualChunks` antes de rodar o build
- [ ] Confirmar que nenhum arquivo em `src/` importa do compat layer (`firebase/compat/*`) — caso exista, adicionar ao chunk

### Fluxo 3 — Build de produção e medição do resultado

**Descrição:** Executar `npm run build`, capturar os tamanhos dos chunks gerados e
comparar com o baseline de 676 KB.

**Behaviors:**
- [ ] Rodar `npm run build` e observar a saída do Vite sem erros
- [ ] Localizar em `dist/assets/` o arquivo `index-*.js` (main bundle) e o novo `firebase-*.js`
- [ ] Medir tamanho raw e gzip do main bundle: alvo é `< 500 KB raw` / `< 140 KB gzip`
- [ ] Medir tamanho raw e gzip do chunk Firebase: esperado ~200 KB raw / ~55 KB gzip
- [ ] Confirmar que a soma `main + firebase` é próxima ao baseline de 676 KB (validação de que não houve perda de código)
- [ ] Verificar que o build não gerou warnings de "chunk too large" no main bundle após a separação
- [ ] Registrar números na tabela de referência do `references/architecture.md` (seção 15)

### Fluxo 4 — Verificação de carregamento no browser

**Descrição:** Executar `npm run preview` e verificar no DevTools que o chunk Firebase
é baixado corretamente na inicialização.

**Behaviors:**
- [ ] Abrir `http://localhost:4173` com DevTools → aba Network
- [ ] Confirmar que `firebase-*.js` aparece no carregamento inicial (é uma dependência estática do main)
- [ ] Confirmar que o app inicializa normalmente: login Google funciona, dados carregam do Firestore
- [ ] Confirmar que não há erros de console relacionados a Firebase não inicializado ou módulo ausente
- [ ] Testar navegação para pelo menos 3 páginas para validar que os chunks lazy de páginas continuam funcionando

---

## Componentes Compartilhados

Não há novos componentes de UI nesta entrega.

## Modelos de Dados

Não há alterações no modelo de dados Firestore.

## Regras de Negócio

### Como manualChunks funciona com imports estáticos

O Firebase é importado estaticamente (`import { db } from '../lib/firebase'`) e
portanto carrega junto com o main bundle na inicialização. `manualChunks` não
transforma isso em lazy-load — o browser ainda baixa ambos os chunks ao abrir o app,
mas em paralelo. O ganho real é:

1. O main bundle fica menor (melhor Time-to-Interactive, pois o parser JS processa
   um arquivo menor).
2. O chunk Firebase pode ser cacheado separadamente pelo browser. Em deploys futuros
   que não alteram o Firebase SDK, o browser reutiliza o chunk cacheado.

### Módulos Firebase x chunk

O Rollup aplica tree-shaking dentro de cada módulo Firebase antes de movê-los ao
chunk. A API modular v10 (usada no projeto) é compatível com tree-shaking. O uso
de `firebase/storage` no `manualChunks` sem imports correspondentes pode gerar um
chunk com código morto — remover se não há imports.

### Impacto zero em comportamento de runtime

`manualChunks` é uma diretiva de empacotamento. Não altera o grafo de dependências,
os exports, o comportamento de autenticação, os listeners Firestore ou qualquer
lógica de negócio.

## Fora do Escopo (v1)

- Separar React/React-DOM/React-Router em chunk `vendor` separado (pode ser feito
  em iteração futura se o main bundle ainda estiver acima de 400 KB após Firebase)
- Lazy-load do Firebase (transformar imports estáticos em dinâmicos requer refatoração
  do fluxo de inicialização em `App.jsx` — risco alto, ganho marginal)
- Análise com `rollup-plugin-visualizer` ou similar (útil, mas fora do escopo desta
  entrega pontual)
- Alterações em regras do Firestore, segurança ou qualquer lógica de negócio
- Testes automatizados de bundle size (CI check de tamanho de chunk)
