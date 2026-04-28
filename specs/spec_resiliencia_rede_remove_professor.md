# Spec: Resiliência de Rede em Operações Críticas (com foco em Remover Professor)

## Visão Geral

O SaaS Gestão Escolar é uma SPA React + Firestore multi-tenant. Em produção, foi observado um caso em que um SaaS admin tentou remover um professor pela tabela em `/settings?tab=teachers` e a operação ficou travada porque a conexão de internet do cliente caiu durante a tentativa. Os logs mostraram `ERR_HTTP2_PING_FAILED`, dezenas de `ERR_TIMED_OUT` contra `firestore.googleapis.com`, falhas em `WebChannelConnection RPC 'Listen'/'Write'`, `503` em assets básicos e timeouts até no `cleardot.gif` (sondador de conectividade do Google) — sinal claro de que o problema era da rede do cliente, não do backend.

O comportamento atual da aplicação nesse cenário é ruim:

- O click em "Remover" dispara `deleteDoc` direto e fica preso esperando resposta indefinidamente, sem timeout explícito.
- Não há detecção prévia de offline; a tentativa segue mesmo com `navigator.onLine === false`.
- Não há retry automático nem feedback claro para o usuário (sem toast, sem modal de erro).
- A lista de professores fica visualmente desatualizada — mudanças otimistas não são revertidas quando a operação falha.

Esta spec descreve o que vamos construir na v1 para tornar essas operações resilientes a falhas de rede do cliente: detecção de offline, timeout explícito, mensagens de erro tipadas por código do Firestore, banner global de status de conexão e aplicação consistente da mesma lógica nas demais escritas críticas (criar/aprovar/rejeitar professor, designar admin, suspender escola).

## Stack Tecnológica

- **Frontend:** React 18 + Vite + Zustand + React Router
- **Backend:** Firestore + Cloud Functions
- **Hosting:** Firebase Hosting
- **Outros:** API `navigator.onLine` + eventos `online` / `offline` do navegador para detecção de conectividade.

## Páginas e Rotas

### Tabela de Professores — `/settings?tab=teachers`

**Descrição:** Tela onde admin (SaaS ou local) gerencia professores da escola — listar, aprovar/rejeitar pendentes, promover, remover. Esta é a tela onde o problema foi reproduzido e o foco principal da v1.

**Componentes:**
- `TabTeachers.jsx`: tabela principal, lista de professores e botões de ação.
- `ConfirmRemoveTeacherModal`: modal de confirmação antes do delete.
- `OfflineBanner`: banner global persistente (renderizado em layout raiz, mas visível aqui também).
- `Toast` (já existente no design system): usado para feedback de erro/timeout.

**Behaviors:**
- [ ] Antes de disparar a action de remover, verificar `navigator.onLine`. Se `false`, exibir toast "Sem conexão — verifique sua internet" e abortar imediatamente (sem chamar `deleteDoc`).
- [ ] Aplicar timeout explícito de **15 segundos** envolvendo a chamada de `deleteDoc`. Se o timeout estourar, exibir toast "Operação demorou demais — tente novamente" e abortar.
- [ ] Tratar erro do Firestore por código:
  - `unavailable`, `deadline-exceeded`, ou erros classificados como network-related → toast "Conexão instável — tente novamente em alguns segundos".
  - `permission-denied` → toast "Sem permissão para remover este professor".
  - Outros códigos não mapeados → toast genérico "Não foi possível remover. Tente novamente.".
- [ ] Se a remoção foi aplicada otimisticamente na UI (lista local), reverter o estado em caso de falha (re-inserir o professor na lista).
- [ ] Desabilitar o botão "Remover" enquanto a operação está em andamento, para evitar duplo-click.
- [ ] Após sucesso, exibir toast de confirmação "Professor removido" e atualizar a lista a partir do snapshot.

---

## Componentes Compartilhados

- **`OfflineBanner`** — banner persistente no topo da aplicação. Renderizado quando `isOnline === false` no estado global. Texto: "Você está offline — algumas ações ficarão indisponíveis". Usado em todas as páginas autenticadas.
- **`useNetworkStatus`** (hook) — registra listeners `online` / `offline` no `window`, sincroniza com `useAppStore.isOnline`. Inicializado uma vez no boot da aplicação.
- **`withTimeout(promise, ms)`** (helper em `src/lib/helpers/`) — utilitário que envolve uma `Promise` em `Promise.race` com um timer de `ms` milissegundos, rejeitando com erro tipado `TimeoutError` se exceder.
- **`mapFirestoreError(err)`** (helper em `src/lib/helpers/`) — recebe um erro do Firestore e retorna `{ kind: 'network' | 'permission' | 'timeout' | 'unknown', message: string }` para alimentar o toast.
- **`runResilientWrite(fn, opts)`** (wrapper em `useAppStore` ou `src/lib/db/`) — encapsula o padrão completo: checa `isOnline` → aplica `withTimeout(15s)` → roda `fn` → traduz erros via `mapFirestoreError` → dispara toast apropriado. Reusado em todas as ações críticas listadas em "Regras de Negócio".

## Modelos de Dados

Esta feature **não cria entidades novas no Firestore**. Apenas adiciona estado de UI no store global:

### `useAppStore` — campos novos

| Campo | Tipo | Descrição |
|---|---|---|
| `isOnline` | `boolean` | Espelho de `navigator.onLine`, atualizado por listeners `online`/`offline`. Default: `true`. |
| `pendingWrites` | `Set<string>` (opcional) | IDs de operações em andamento, usado para desabilitar botões. Pode ser implementado como flag local por componente em vez de global. |

### Tipos auxiliares (TypeScript-like, projeto usa JSX)

```
type ResilientWriteError = {
  kind: 'offline' | 'timeout' | 'network' | 'permission' | 'unknown',
  message: string,
  originalError?: Error,
}
```

## Regras de Negócio

1. **Detecção de offline é pré-condição obrigatória.** Toda escrita crítica no Firestore deve checar `useAppStore.getState().isOnline` antes de chamar a API. Se offline, abortar com toast — não tentar.
2. **Timeout fixo de 15 segundos** para todas as operações cobertas. Não configurável na v1.
3. **Mapeamento de erro centralizado.** Nenhum componente lê `err.code` diretamente — tudo passa por `mapFirestoreError`.
4. **Reversão otimista.** Se a UI aplicou mudança antes da confirmação do servidor, ela deve reverter no erro. Se não houve update otimista, basta exibir o toast.
5. **Banner de offline é global e único.** Não duplicar por página. Renderizado no layout raiz da aplicação autenticada.
6. **Lista de operações cobertas pela mesma lógica resiliente (v1):**
   - Remover professor (foco do bug — `TabTeachers.jsx`)
   - Criar professor
   - Aprovar professor pendente
   - Rejeitar professor pendente
   - Designar admin (promover usuário a admin local da escola)
   - Suspender escola
7. **Não bloquear leituras.** A lógica de timeout/offline aplica-se apenas a **escritas**. Leituras continuam usando o cache normal do Firestore + Local Storage descrito em `references/architecture.md`.
8. **Listener global single-instance.** Os listeners `online` / `offline` são registrados uma única vez no boot e nunca duplicados, mesmo após troca de escola ou logout/login.

## Fora do Escopo (v1)

- **Fila de operações offline com retry automático quando voltar online.** Persistir intenção do usuário entre sessões e reexecutar fica para uma versão futura.
- **Indicar para outros usuários que um admin está offline.** Status de presença multi-usuário não faz parte desta v1.
- **Reconnect customizado com backoff exponencial.** O Firebase SDK já implementa reconexão automática; não vamos sobrescrever.
- **Configuração do timeout via UI ou settings.** Valor fica fixo em 15s no código.
- **Cobertura de operações não-críticas** (ex.: editar nome de uma turma, atualizar foto de perfil). A v1 cobre apenas a lista da seção "Regras de Negócio".
- **Telemetria/analytics dos erros de rede.** Apenas console + toast, sem envio para serviço externo.
