# Spec: Phase 4 Deploy & Monitoring

## Visão Geral

Documento de especificação para o processo de deploy em produção da implementação de operações granulares no Firestore (Phase 4) e o monitoramento crítico de quotas para validar a redução de ~98% de writes.

**Problema resolvido:** Aplicação excedia quota Firestore Free Tier (100k writes/dia vs 50k limite)
**Solução:** Operações granulares reduzem para ~2k writes/dia (50× melhoria)
**Objetivo desta spec:** Garantir deploy seguro e monitoramento contínuo

---

## Stack Tecnológica

- **Frontend:** React 18 + Zustand (state management)
- **Backend:** Firebase Firestore (NoSQL)
- **Deploy:** Vercel (auto-deploy) / Firebase Hosting (manual)
- **CI/CD:** GitHub Actions (recomendado)
- **Monitoring:** Firebase Console (quotas) + Cloud Logging (custom)
- **Tools:** gh CLI (GitHub), firebase CLI

---

## Fluxo de Deploy

### 1. Pre-Deploy Checklist — Validar Código

#### 1.1 Verificar Status Git

```bash
git status  # deve estar limpo
git log -1 --oneline  # deve ser 0f5b78b feat(firestore): ...
```

**Behaviors:**
- [x] Working directory limpo
- [x] Último commit é a feature granular
- [x] Sem mudanças não commitadas

#### 1.2 Compilação sem Erros

```bash
npm run build  # build completo
npm run dev    # dev server testa
```

**Behaviors:**
- [x] Build completa em < 2min
- [x] Zero erros de compilação
- [x] Dev server inicia em 138-149ms
- [x] Sem warnings críticos

#### 1.3 Validar Imports & Code

```bash
# F12 → Console ao abrir dev server
# Procurar por erros tipo "updateDocById is not defined"
```

**Behaviors:**
- [x] Sem erros de importação
- [x] updateDocById, saveDoc, deleteDocById importados
- [x] Listeners registrados (logs [configListener], [teachersListener], etc)

---

### 2. Opção de Deploy

#### Opção A: Pull Request (Recomendado para Time)

**Fluxo:**
1. Criar PR para revisão
2. Code review (1-3 dias)
3. Merge após aprovação
4. Auto-deploy via CI/CD

**Quando usar:** Tem outras pessoas no projeto, quer validação antes

**Behaviors:**
- [ ] PR criado com título e descrição detalhada
- [ ] Recebeu code review de 1+ pessoas
- [ ] Todos os comentários foram resolvidos
- [ ] PR foi mergido (squash/rebase)
- [ ] GitHub Actions executou build e deploy

#### Opção B: Deploy Direto (Para Solo Dev)

**Fluxo:**
1. Push para main (já feito: commit 0f5b78b)
2. CI/CD dispara automaticamente (ou deploy manual)
3. Validar que app está up

**Quando usar:** Solo dev, confiança alta no código, testes já passaram

**Behaviors:**
- [x] Commit já está em origin/main
- [ ] Build passou em CI (se tiver)
- [ ] Deploy em produção completado
- [ ] App carrega sem 500 errors
- [ ] Health check OK (login funciona)

---

## Monitoramento (CRÍTICO - 24-48h após deploy)

### 1. Firebase Console — Dashboard

#### 1.1 Anotar Métrica ANTES do Deploy

**Ação:** Abrir Firebase Console

```
https://console.firebase.google.com/project/seu-projeto-id
→ Firestore → Database → Quotas & Usage
```

**Métricas a capturar:**

| Métrica | Valor | Status |
|---------|-------|--------|
| Reads (24h) | _____ / 50,000 | ____ |
| Writes (24h) | _____ / 50,000 | ____ |
| Deletes (24h) | _____ / 20,000 | ____ |
| Timestamp | ____:____ | ____ |

**Behaviors:**
- [ ] Anotar valores atuais em screenshot
- [ ] Timestamp registrado (para comparação posterior)
- [ ] Screenshot salvo (importante para documentação)

#### 1.2 Acompanhar Métrica DEPOIS do Deploy

**Timing:** 24-48 horas após deploy

**Checklist:**
- [ ] Observar Writes (deve estar em ~2.000 writes/dia, não 100k)
- [ ] Observar Reads (devem estar ~iguais, são listeners)
- [ ] Nenhum erro 429 (Quota Exceeded) no console
- [ ] Histórico mostra curva descendente (não spike)

**Exemplo esperado:**

```
ANTES:   Writes: 95,000 / 50,000  ❌ EXCEDIDO
DEPOIS:  Writes: 2,000 / 50,000   ✅ DENTRO DO LIMITE

Redução: (95,000 - 2,000) / 95,000 = 97.9% ✅
```

**Behaviors:**
- [ ] Writes em ~2k/dia (não 100k)
- [ ] Quota está DENTRO do limite (não excedido)
- [ ] Trend mostra redução consistente
- [ ] Nenhum spike anormal

---

### 2. Setup de Alertas

**Ação:** Configurar alertas automáticos no Firebase

```
Firebase Console → Monitoring → Quotas
→ Setup Alerts → Create Alert
```

**Configuração:**

| Campo | Valor |
|-------|-------|
| Métrica | Firestore: Document Writes |
| Threshold | 40,000 writes (80% do limite) |
| Condition | Per Day |
| Notification | Email |
| Recipients | seu-email@example.com |

**Behaviors:**
- [ ] Alert criado para Writes >= 40,000
- [ ] Email de confirmação recebido
- [ ] Testar alert (disparar manualmente, se possível)
- [ ] Alert resolve automaticamente quando quota cai

**Resultado:** Se quota voltar a subir acima de 80%, você recebe notificação.

---

### 3. Custom Logging (Opcional - Para Validação Rápida)

#### 3.1 Adicionar Logs Temporários

**Arquivo:** `src/lib/db.js`

```javascript
// ADD NO INÍCIO DO ARQUIVO:
let writeCount = 0
let lastLogTime = Date.now()

// MODIFY saveDoc:
export async function saveDoc(colName, item) {
  writeCount++
  if (Date.now() - lastLogTime > 10000) {
    console.log(`[MONITOR] Writes in last 10s: ${writeCount}`)
    writeCount = 0
    lastLogTime = Date.now()
  }
  try { await setDoc(doc(db, colName, item.id), item) } catch (e) { console.error(e) }
}

// MODIFY updateDocById:
export async function updateDocById(colName, id, changes) {
  writeCount++
  if (Date.now() - lastLogTime > 10000) {
    console.log(`[MONITOR] Writes in last 10s: ${writeCount}`)
    writeCount = 0
    lastLogTime = Date.now()
  }
  try { await updateDoc(doc(db, colName, id), changes) } catch (e) { console.error(e) }
}
```

#### 3.2 Verificar em Produção

**Ação:** Abrir app em produção, F12 → Console

```
Realizar operações normais (adicionar professor, editar horário, etc)
Observar console output:

[MONITOR] Writes in last 10s: 3   ✅ (era ~50-100 antes)
[MONITOR] Writes in last 10s: 2   ✅
[MONITOR] Writes in last 10s: 5   ✅
```

**Behaviors:**
- [ ] Log aparece a cada 10 segundos
- [ ] Contador mostra 1-10 writes (não 50+)
- [ ] Padrão é consistente ao longo do tempo

#### 3.3 Remover Logs (Limpeza)

**Após validação, remover:**

```bash
# Reverter mudanças em src/lib/db.js
git checkout src/lib/db.js

# Ou remover manualmente os logs
# Commit final: "chore: remove temporary monitoring logs"
git add src/lib/db.js
git commit -m "chore: remove temporary monitoring logs"
git push origin main
```

**Behaviors:**
- [ ] Logs removidos de db.js
- [ ] Commit feito e pusheado
- [ ] Produção atualizada sem logs

---

## Monitoramento Avançado (Google Cloud)

### 1. Cloud Logging Dashboard

**Para visualizar writes em tempo real:**

```bash
gcloud logging read "resource.type=cloud_firestore AND metric.type=firestore.googleapis.com/document_writes" \
  --limit=10 \
  --format=json
```

**Behaviors:**
- [ ] Cloud Logging acesso configurado
- [ ] Query retorna writes recentes
- [ ] Dashboard customizado criado (se desejado)

### 2. Cloud Monitoring Alerts

**Criar alerta via Monitoring:**

```
Google Cloud Console → Monitoring → Alerting → Create Policy
Condition: firestore.googleapis.com/document_writes > 40000
```

**Behaviors:**
- [ ] Alert policy criado
- [ ] Notificação dispara se quota > 40k
- [ ] Escalation para slack/email (se configurado)

---

## Checklist Completo: Deploy → Monitor → Validate

### ✅ PRÉ-DEPLOY (Dia 0)

- [ ] `git status` mostra working directory limpo
- [ ] Último commit é `0f5b78b` feat(firestore): ...
- [ ] `npm run build` compila sem erros
- [ ] `npm run dev` inicia em < 150ms
- [ ] F12 Console sem erros de "undefined"
- [ ] Spec está documentada em `specs/`
- [ ] Testes manuais em dev passaram (F12 Network)

### ✅ DEPLOY (Dia 0, 30 min após checklist)

- [ ] **Opção A (PR):** PR criado, reviewers designados
- [ ] **Opção B (Direct):** Commit já em origin/main
- [ ] Build passou em CI (GitHub Actions, Vercel, etc)
- [ ] Deploy em produção completado
- [ ] App carrega sem erros (health check)

### ✅ MONITORAMENTO (Dias 1-2)

- [ ] Firebase Console aberto em segunda aba
- [ ] Métricas ANTES capturadas em screenshot
- [ ] 24h passou, métricas DEPOIS capturadas
- [ ] Writes reduzidos de ~100k para ~2k
- [ ] Nenhum erro 429 (quota exceeded) em app
- [ ] Alertas configurados (Firebase + Cloud)
- [ ] Logs customizados adicionados (se desejado)
- [ ] Logs customizados removidos (após validação)

### ✅ PÓS-DEPLOY (Dia 3+)

- [ ] Documentar resultados em comentário/wiki
- [ ] Calcular redução percentual: (antes - depois) / antes × 100
- [ ] Fechar PR (se usou PR workflow)
- [ ] Considerar próxima otimização (Phase 4b: batch operations)
- [ ] Celebrar! 🎉

---

## Possíveis Problemas & Soluções

### Problema 1: Quota Ainda Alta (> 20k) Após Deploy

**Possível causa:** Batch operations ainda usam debounce

**Diagnóstico:**
```javascript
// Em src/store/useAppStore.js, procurar:
deleteManySlots: (...) => {
  // ...
  debouncedSave()  // ← ISTO AINDA ESTÁ AQUI?
}
```

**Solução:**
- Converter batch operations também (Phase 4b)
- Ou aceitar ~3-5% de quota para operações batch

**Ação:**
- [ ] Verificar se batch operations estão granulares
- [ ] Se não, criar issue para Phase 4b
- [ ] Documentar em PR comments

### Problema 2: Múltiplas Abas Desincronizadas

**Possível causa:** Listener não ativado corretamente

**Diagnóstico:**
1. Abrir app em 2 abas
2. Adicionar professor em aba 1
3. Verificar em aba 2 (deve aparecer)

**Solução:**
```javascript
// Em src/lib/db.js, verificar setupRealtimeListeners:
const unsubTeachers = onSnapshot(
  collection(db, 'teachers'),
  snap => {
    store.setTeachers(snap.docs.map(d => d.data()))  // ← DEVE ESTAR AQUI
  }
)
```

**Ação:**
- [ ] Testar sync entre abas
- [ ] Se falhar, debugar listeners em console
- [ ] Criar issue para investigação

### Problema 3: Offline Mode Não Funciona

**Possível causa:** localStorage vazio ou expirado

**Diagnóstico:**
1. DevTools → Offline mode
2. Adicionar professor
3. DevTools → Application → Storage → localStorage
4. Procurar por `gestao_v7_cache`

**Verificação:**
```javascript
// Deve ter:
{
  "data": { teachers: [...], schedules: [...], ... },
  "timestamp": 1711234567890
}
```

**Ação:**
- [ ] Verificar localStorage tem dados
- [ ] Verificar timestamp é recente (< 1 hora)
- [ ] Se vazio, investigar `_saveToLS()` em db.js

### Problema 4: App Lento Após Deploy

**Possível causa:** Listeners duplicados ou muitos updates

**Diagnóstico:**
- F12 → Network → observar requisições
- F12 → Console → procurar por logs duplicados

**Solução:**
- Verificar que listeners são unsubscribed corretamente
- Limpar cache do navegador

**Ação:**
- [ ] Hard refresh (Ctrl+Shift+R)
- [ ] Verificar Network para duplicatas
- [ ] Se persistir, investigar listeners

---

## Regras de Negócio

1. **Quota deve estar DENTRO do limite free tier (50k writes/dia)**
   - Monitor contínuamente
   - Alert se > 40k (80%)
   - Ação se > 50k (100%)

2. **Redução MÍNIMA esperada: 90% (10k writes/dia)**
   - Antes: ~100k writes/dia
   - Depois: ~10k máximo (realista: ~2k)

3. **Sem perda de funcionalidade**
   - Todas operações funcionam igual
   - UI sincroniza em tempo real
   - Offline mode continua funcionando

4. **Listeners devem estar ativos**
   - onSnapshot() propaga mudanças
   - Múltiplas abas sincronizam
   - Zero writes duplicadas

---

## Fora do Escopo (Phase 4)

- ❌ Batch operations granulares (Phase 4b)
- ❌ Conflict resolution para writes simultâneos
- ❌ Offline queue com retry automático
- ❌ Performance profiling completo
- ❌ LoadTesting com múltiplos usuários
- ❌ Migration de dados históricos
- ❌ Custom billing alerts (Google Cloud Enterprise)

---

## Próximas Fases

### Phase 4b: Batch Operations Granulares (Opção)
- Converter `deleteManySlots()`, `clearDaySubstitutes()`, etc
- Ganho esperado: +5-10% adicional
- Tempo: 4-6 horas

### Phase 5: Real-time Profiling
- Dashboard customizado no Cloud Monitoring
- Alertas por tipo de operação
- Tempo: 8 horas

### Phase 6: Offline Robustness
- Fila de operações offline
- Conflict resolution
- Tempo: 16 horas

---

## Métricas de Sucesso

| Métrica | Antes | Target | Status |
|---------|-------|--------|--------|
| Writes/dia | 100k | < 10k | ✅ Esperado: ~2k |
| Writes/ação | 850 | < 10 | ✅ Esperado: 1 |
| Quota Usage | 200% | < 20% | ✅ Esperado: 4% |
| App Performance | N/A | < 100ms | ✅ Não impactado |
| User Experience | Errors | Zero errors | ✅ Zero 429 errors |

---

## Documentação Relacionada

- `specs/spec_operacoes_granulares_firestore.md` — Spec técnica da Phase 4
- `plan/006-validation-reducao-requisicoes.md` — Plano de validação
- `tasks/130-validation-reducao-requisicoes.md` — Validação executada
- GitHub Commit: `0f5b78b` — Implementação

---

## Timeline Estimado

| Passo | Tempo | Responsável |
|-------|-------|------------|
| Pre-Deploy Checklist | 15 min | Dev |
| Deploy (A ou B) | 30 min | Dev / CI/CD |
| Initial Monitoring | 1 hora | Dev |
| 24h Monitoring | Contínuo | Dev |
| Analysis & Documentation | 2 horas | Dev |
| **TOTAL** | **~48 horas** | Dev |

---

**Status:** Pronto para execução com `/executar specs/spec_phase4_deploy_monitoring.md`
