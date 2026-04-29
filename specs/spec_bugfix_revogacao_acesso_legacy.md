# Spec: Bugfix Crítico — Revogação de Acesso para Usuários Legados

## Visão Geral

Após o deploy do índice invertido `users/{uid}.removedFrom` (issue #472), usuários removidos **antes do deploy** (ex.: `redacaoanglobrag@gmail.com`) ainda conseguem logar e acessar a `PendingPage`. A causa raiz é tripla:

1. **Backfill ausente:** A CF `removeTeacherFromSchool` agora grava `removedFrom`, mas isso é prospectivo — usuários removidos antes do deploy não têm o campo populado, e `checkAccessRevoked` retorna `revoked: false`.
2. **Defesa em profundidade falha quando `schools={}`:** O helper itera `Object.keys(userSnap.data().schools)` para ler `removed_users/{uid}`. Se `schools` está vazio (estado pós-remoção), nenhum schoolId é iterado e o marcador canônico **nunca é consultado**.
3. **`bootSequence` cai em `pending` sem schoolId:** Quando `availableSchools=[]`, `savedSchoolId=null`, `userSnap.exists()` e `schools={}`, retorna `role: 'pending'` em vez de tratar como revogação total — usuário acessa `PendingPage`.

Esta correção é emergencial: sela os três buracos e fornece um backfill admin-only para reconciliar usuários legados.

## Stack Tecnológica

- Frontend: React 18 + Zustand + Vite (sem alteração de deps)
- Backend: Cloud Functions (Node 20, TypeScript) + Firestore
- Banco de dados: Firestore (multi-tenant `schools/{id}/...`)
- Outros: Firebase Auth (Google SSO)

## Arquivos a Modificar

- `src/lib/db/index.js` — endurecer `checkAccessRevoked` para usar fallback quando `schools={}`.
- `src/lib/boot.js` — heurística de revogação total quando `userSnap.exists()` + `schools={}` + não-saas-admin.
- `src/store/useAuthStore.js` — passar `availableSchools` para o helper (parâmetro adicional) e tratar `fullyRevoked` retornado pela nova heurística do bootSequence.
- `functions/src/index.ts` — nova CF callable `backfillRemovedFrom` (admin-only).
- `firestore.rules` — permitir `collectionGroup('removed_users')` filtrada pelo próprio uid (caso a Decisão A seja adotada). Verificar se há mudança necessária.
- `src/lib/__tests__/boot.test.js` e `src/lib/db/__tests__/checkAccessRevoked.test.js` — três cenários de teste obrigatórios.

## Páginas e Rotas

(Não há páginas novas — esta é correção de fluxo de boot.)

### LoginPage — `/login`
**Descrição:** Após a correção, usuário legado removido vê banner "Seu acesso foi revogado" mesmo sem `removedFrom` populado.

**Behaviors:**
- [ ] Exibir banner `loginError === 'access-revoked'` quando `bootSequence` ou `checkAccessRevoked` decretarem revogação total para usuário legado.
- [ ] Permitir nova tentativa de login (botão Entrar) — fluxo padrão da LoginPage.

### PendingPage — `/pending`
**Descrição:** Usuário removido NÃO deve mais conseguir acessar esta página por inércia (estado `schools={}`).

**Behaviors:**
- [ ] Bloquear entrada quando `bootSequence` retorna `fullyRevoked: true` por heurística de `schools={}` sem ser saas-admin.

---

## Componentes Compartilhados

Sem novos componentes. Mudanças concentradas em helpers (`db/index.js`, `boot.js`) e store (`useAuthStore`).

## Modelos de Dados

Sem alteração de schema. Reuso de campos existentes:

- `users/{uid}.schools: { [schoolId]: { role, status, ... } }` — pode estar `{}` para usuários removidos.
- `users/{uid}.removedFrom: string[]` — índice invertido escrito por `removeTeacherFromSchool`. Após backfill, conterá histórico de remoções legadas.
- `schools/{schoolId}/removed_users/{uid}` — marcador canônico (source of truth pós-remoção). Sempre presente para qualquer remoção (legada ou nova).

## Regras de Negócio

**RN-L1 — Revogação detectada por marcador canônico independente de `schools`:**
Quando `userSnap.data().schools={}`, `checkAccessRevoked` deve usar lista de fallback de schoolIds candidatos (ver Decisão Técnica abaixo) para iterar `removed_users/{uid}`. Encontrar o marcador em qualquer escola → `fullyRevoked: true`.

**RN-L2 — Heurística de revogação total no bootSequence:**
Quando `user != null`, `isSuperUser === false`, `userSnap.exists() === true`, `Object.keys(schools) === 0` e `availableSchools.length === 0` → retornar `{ role: null, schoolId: null, clearLocalStorage: true, fullyRevoked: true }`. Isso fecha o cenário "removido sem `removedFrom`" mesmo se `checkAccessRevoked` falhar.

**RN-L3 — Backfill é admin-only e idempotente:**
`backfillRemovedFrom` itera `collectionGroup('removed_users')` (Admin SDK) e popula `users/{uid}.removedFrom: arrayUnion(schoolId)`. Não remove dados — apenas adiciona. Pode rodar várias vezes sem efeito colateral. Apenas chamadores em `/admins/{email}` podem invocar.

**RN-L4 — Listener de membership não regride:**
A heurística do bootSequence aplica-se apenas no boot (read inicial). O `_startMembershipListener` continua observando `users/{uid}` para detectar remoções runtime e disparar `_handleMembershipRevoked`.

## Decisão Técnica — Fallback em `checkAccessRevoked`

Três opções foram consideradas. Decisão recomendada: **Opção B (parâmetro `knownSchoolIds`)**, com fallback para Opção C se a Opção B retornar conjunto vazio.

| Opção | Como obter schoolIds quando `schools={}` | Custo Firestore | Complexidade rules |
|-------|------------------------------------------|-----------------|--------------------|
| A | `collectionGroup('removed_users')` filtrado por `__name__ == uid` | 1 query indexada | Precisa rule de collectionGroup |
| **B (escolhida)** | Receber `knownSchoolIds` (vindo de `useSchoolStore.allSchools` se SaaS admin OU lista enxuta inferida) | 0 reads extras (já no store) | Sem mudança em rules |
| C | `getDocs(collection(db, 'schools'))` | 1 read por escola do tenant | Sem mudança |

Para usuário comum legado: `availableSchools=[]` significa que NÃO temos lista pré-carregada. **Decisão final**: usar Opção C como fallback explícito quando `knownSchoolIds.length === 0` — leitura de `schools/` é barata (escolas raramente passam de dezenas) e permitida pelas rules atuais (`allow read: if isAuthenticated()`).

A Opção C tem custo aceitável: roda uma vez no boot, apenas para usuários com `schools={}` (caso patológico).

## Fluxo de Correção — Passo a Passo

### Parte 1 — `checkAccessRevoked` com fallback

**Behaviors:**
- [ ] Aceitar terceiro parâmetro opcional `knownSchoolIds: string[]` (default `[]`).
- [ ] Quando `Object.keys(schoolsMap).length === 0` E `knownSchoolIds.length === 0` E `removedFrom.length === 0`, executar fallback: `getDocs(collection(db, 'schools'))` para popular candidatos.
- [ ] Iterar candidatos e ler `removed_users/{uid}` em paralelo (mesma lógica atual de `markerChecks`).
- [ ] Se algum marcador for encontrado, popular `revokedSchoolIds` e setar `fullyRevoked: true` (sem schools restantes, sempre é revogação total).
- [ ] Capturar erros de leitura individualmente — fail-soft por escola.

### Parte 2 — Heurística no `bootSequence`

**Behaviors:**
- [ ] Após o ramo `isSuperUser`, antes da Etapa 1, inserir guard: se `userSnap?.exists?.() === true` E `Object.keys(userSnap.data()?.schools ?? {}).length === 0` E `availableSchools.length === 0` E `savedSchoolId == null` → retornar `{ ...BASE, role: null, clearLocalStorage: true, fullyRevoked: true }`.
- [ ] Adicionar campo `fullyRevoked: boolean` ao retorno do bootSequence (default `false`).
- [ ] `useAuthStore._resolveRole` deve detectar `result.fullyRevoked === true` e replicar exatamente o fluxo de signOut + toast + `loginError: 'access-revoked'` já presente para `revokeInfo.fullyRevoked === true`.

### Parte 3 — CF `backfillRemovedFrom`

**Behaviors:**
- [ ] Criar HTTPS callable `backfillRemovedFrom` em `functions/src/index.ts`.
- [ ] Validar caller: ler `admins/{caller.email_lower}` — apenas SaaS admin executa.
- [ ] Iterar `db.collectionGroup('removed_users').get()`.
- [ ] Para cada doc, extrair `uid = doc.id` e `schoolId = doc.ref.parent.parent.id`.
- [ ] Em batches de 400, chamar `users/{uid}.update({ removedFrom: arrayUnion(schoolId) })` com fallback para `set({...}, { merge: true })` se o doc não existir.
- [ ] Retornar `{ processed: number, skipped: number }`.
- [ ] Não deletar nada — operação puramente aditiva.

### Parte 4 — Atualização de rules (se necessário)

**Behaviors:**
- [ ] Avaliar se a Opção C (fallback `getDocs(collection(db, 'schools'))`) já é permitida pelas rules atuais (`schools/{schoolId}: allow read: if isAuthenticated()`). **Sim — não há mudança necessária.**
- [ ] Caso futuramente migrar para Opção A, adicionar rule de collectionGroup query em `removed_users` filtrada por `request.auth.uid == resource.id`.

## Cenários de Teste Obrigatórios

### Cenário 1 — Usuário com `removedFrom: [A]` e `schools={}` (já cobre)
**Setup:** Mock `userSnap.exists() = true`, `data() = { schools: {}, removedFrom: ['A'] }`.
**Expectativa:** `checkAccessRevoked` retorna `{ revoked: true, fullyRevoked: true, revokedSchoolIds: ['A'] }`. `_resolveRole` chama signOut + toast.

### Cenário 2 — Usuário SEM `removedFrom`, com `schools={}`, `removed_users/{uid}` existe em escola A (NOVO)
**Setup:** Mock `userSnap.exists() = true`, `data() = { schools: {}, removedFrom: [] }`. Mock `getDocs(collection('schools'))` retornando `[{ id: 'A' }, { id: 'B' }]`. Mock `getDoc(removed_users/{uid})` retornando `exists: true` para A, `false` para B.
**Expectativa:** `checkAccessRevoked` retorna `{ revoked: true, fullyRevoked: true, revokedSchoolIds: ['A'] }`. `_resolveRole` força signOut.

### Cenário 3 — Usuário com `schools={}` SEM marcador em qualquer escola (NOVO)
**Setup:** `userSnap.exists() = true`, `schools={}`, `removedFrom=[]`. Nenhuma escola tem `removed_users/{uid}`. `availableSchools=[]`, `savedSchoolId=null`.
**Expectativa:** `bootSequence` retorna `{ role: null, fullyRevoked: true, clearLocalStorage: true }` por heurística. `_resolveRole` força signOut e exibe banner — usuário NÃO acessa PendingPage.

## Plano de Execução do Backfill

1. Deploy das mudanças de código (Partes 1, 2, 3).
2. Verificar via Firestore Console que CF `backfillRemovedFrom` está deployada.
3. Executar via Firebase CLI ou painel SaaS admin: `httpsCallable('backfillRemovedFrom')()`.
4. Verificar logs: `processed > 0` para usuários legados.
5. Validar manualmente com `redacaoanglobrag@gmail.com`: tentativa de login deve cair em LoginPage com banner.

## Fora do Escopo (v1)

- Migração automática de `users/{uid}.formerSchools` (campo não existe).
- UI de painel SaaS para visualizar/desfazer revogações em massa.
- Auditoria detalhada de quem foi backfilled (apenas log no Cloud Functions).
- Reescrever `removeTeacherFromSchool` — já está correta para casos novos.
- Cobertura de testes E2E (Playwright/Cypress) — apenas testes unitários nos três cenários.
