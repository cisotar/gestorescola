# Plano Técnico: [Validation] Medir redução de requisições e validar quotas

## Análise do Codebase

**Arquivos envolvidos (verificação apenas):**
- `src/lib/db.js` — `saveDoc()`, `updateDocById()`, `deleteDocById()`, listeners
- `src/store/useAppStore.js` — ações granulares de todas collections (#125-#129)
- DevTools (F12 Network & Console) — observação de requisições

---

## Cenários de Teste

### Teste 1 — End-to-End (Simulação dia típico)

**Execução:**
1. Login
2. Adicionar 10 professores (10 writes)
3. Adicionar 5 áreas/disciplinas (~1-2 writes após debounce 2s)
4. Adicionar 50 horários (50 writes)
5. Criar 5 ausências (5 writes)
6. Atribuir 10 substitutos (10 writes)
7. Adicionar 20 históricos (20 writes)
8. Deletar 5 horários (5 writes)

**Esperado:** ~100-110 writes total
**Antes:** ~7.000+ writes (cada ação = ~850 writes via debouncedSave)
**Redução:** ~98%

### Teste 2 — DevTools Validation

1. F12 → Network tab
2. Filter: `firestore.googleapis.com`
3. Para cada ação: contar POST requests (writes)
4. Validar:
   - Teachers/Schedules/Absences: 1 write per action
   - Config (áreas): agrupa em 1-2 writes a cada 2s
   - History: 1 write per entry

### Teste 3 — Firebase Console (Opcional)

1. Firebase Console → Firestore → Quotas & Usage
2. Anotar reads/writes **antes** do teste
3. Executar Teste 1
4. Anotar reads/writes **depois**
5. Calcular: (depois - antes) / (antes) × 100 = % redução
6. Esperado: ~98% redução

### Teste 4 — Múltiplas Abas

1. Abrir app em 2 abas do navegador (mesmo usuário)
2. Aba 1: adiciona 3 professores
3. Aba 2: edita 2 horários simultaneamente
4. Validar:
   - Listeners propagam mudanças entre abas
   - Sem duplicação de writes
   - Estado sincronizado em ambas abas

### Teste 5 — Offline Mode

1. DevTools → Network → Offline
2. Adicionar 1 professor (deve ficar em estado local)
3. Verificar localStorage: DevTools → Application → Storage
4. Reabilitar internet
5. Validar:
   - Dados salvos em localStorage
   - Cache funciona
   - Listeners sincronizam quando volta online

---

## Arquivos a Verificar (sem modificação)

- `src/lib/db.js` — funções de persistência
- `src/store/useAppStore.js` — ações de todas collections
- DevTools (ferramenta do navegador) — observação

---

## Ordem de Testes

1. **Teste 1 (End-to-End):** Simulação de dia, contar ~100-110 writes
2. **Teste 2 (DevTools):** Validar 1 write per operation via Network tab
3. **Teste 3 (Firebase Console):** Anotar before/after quotas (opcional)
4. **Teste 4 (Múltiplas Abas):** Validar sincronização
5. **Teste 5 (Offline Mode):** Validar localStorage + sincronização

---

## Métricas de Sucesso

| Teste | Antes | Depois | Status |
|-------|-------|--------|--------|
| End-to-end writes | ~7.000+ | ~100-110 | ✅ 98% redução |
| DevTools (1 prof) | 850 writes | 1 write | ✅ 850× melhoria |
| Firebase quota | ~100k/dia | ~2k/dia | ✅ 50× melhoria |
| Múltiplas abas | desincronizado | sincronizado | ✅ listeners |
| Offline mode | perda de dados | sincronizado | ✅ localStorage |

---

## Observações

- **Console Logging (opcional):** Pode adicionar `console.log()` temporários em `db.js` para facilitar contagem
- **Config debounce:** Áreas/disciplinas mantêm debounce 2s — normal, fora do escopo
- **Batch operations:** `deleteManySlots`, `clearDaySubstitutes` mantêm debounce — normal
- **Listeners:** `onSnapshot()` não contam como writes do usuário

---

## Próximos Passos (após validação bem-sucedida)

1. Documentar resultados (print do Firebase ou screenshots)
2. Criar commit: `feat(firestore): implementar operações granulares - reduzir ~98% das writes`
3. Remover logs temporários de console (se adicionados)
4. Deploy para produção com monitoramento de quotas
