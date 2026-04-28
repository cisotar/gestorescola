# Pendências para Lançamento — Semana de 5 de maio de 2026

> Documento técnico para rastreamento de tarefas críticas antes da primeira escola (sch-default) usar o sistema.
> Decisões de produto finalizadas em 28 de abril de 2026.

---

## Decisões de Produto Finalizadas

| Item | Decisão |
|------|---------|
| **Billing** | Deixar pra v2.0 (não implementar agora) |
| **Criação de ausências** | Admin E Coordenadores criam direto. Professor isolado NÃO cria. Professor-coordenador SIM cria. |
| **Deletar dados antigos** | Manter indefinidamente (sem deletar coleções antigas do gestordesubstituicoes) |
| **Multi-escola por usuário** | Deixar como opção (infraestrutura pronta, não prioritário agora) |
| **Dados da escola teste** | Já migraram, mas vão ser resetados (professores, matérias, horários, turmas) |
| **Autenticação admin** | Google OAuth (já implementado, precisa só conferir) |
| **Email do admin** | contato.tarciso@gmail.com (super-admin também) |
| **Setup da escola** | Já tem config pronta (não precisa wizard) |
| **schoolId** | sch-default |
| **Funcionar offline** | SIM, offline é crítico |
| **Auditoria** | SIM, completa (tudo: config + operação) |
| **Prioridade features** | **Balanceado**: reconhecimento de perfis → cadastro (prof/mat/turmas/hor) → ausências/subs com regras → relatórios |
| **Testes** | Rules + Cloud Functions testadas. UI testada manualmente. |

---

## 🔴 P0 — BLOQUEADORES (Imprescindível semana que vem)

**Sem esses, a escola não consegue usar.**

### P0.1 — Autenticação & Reconhecimento de Perfis

- [ ] Conferir e validar autenticação Google OAuth para admin (é só conferência)
- [ ] Validar reconhecimento automático de perfis:
  - [ ] Admin (acesso total)
  - [ ] Coordinator (cria ausências, aprova ações)
  - [ ] Teacher-Coordinator (coordena turma/disciplina própria, cria ausências)
  - [ ] Teacher (vê grade própria, registra ausências pessoais)
  - [ ] Pending (aguardando aprovação)

### P0.2 — Reset de Dados

- [ ] Resetar dados de professores da escola teste
- [ ] Resetar matérias da escola teste
- [ ] Resetar turmas/classes da escola teste
- [ ] Resetar horários da escola teste
- [ ] Manter apenas config básica (segmentos, períodos, áreas) se houver

### P0.3 — Fluxo de Ausências (CRÍTICO)

**Validar que APENAS admin + coordenadores + teacher-coordinators conseguem criar:**

- [ ] Testar fluxo: Admin cria ausência
  - [ ] Validar que Cloud Function valida role = admin
  - [ ] Validar que grava em `schools/sch-default/absences/{id}`
  - [ ] Validar que bloqueia slots com subjectId 'formation-*'
- [ ] Testar fluxo: Coordenador cria ausência
  - [ ] Validar que Cloud Function valida role = coordinator
  - [ ] Validar que grava e bloqueia formação
- [ ] Testar fluxo: Professor-coordenador cria ausência
  - [ ] Validar que Cloud Function valida role = teacher-coordinator
  - [ ] Validar que graba e bloqueia formação
- [ ] Testar fluxo: Professor isolado NÃO consegue criar ausência
  - [ ] Validar que Firestore rules bloqueiam direto
  - [ ] Validar que Cloud Function rejeita

### P0.4 — Relatório de Ausências & Substitutos

- [ ] Testar geração de relatório: ausências com substitutos designados
- [ ] Validar que relatório mostra:
  - Professor
  - Data
  - Período (timeSlot)
  - Turma
  - Matéria
  - Substituto (se houver)
- [ ] Testar export PDF/print do relatório

### P0.5 — Testes Automatizados (Baseline)

- [ ] Rodar `npm run test:rules` — Firestore Security Rules
  - [ ] Todos os testes passam
  - [ ] Isolamento multi-tenant validado
  - [ ] Guard hasFormationSlot funciona
- [ ] Rodar testes de Cloud Functions (`functions/__tests__/`)
  - [ ] Todos os testes passam
  - [ ] Aprovação de professor funciona
  - [ ] Criação de ausência valida role

---

## 🟡 P1 — IMPORTANTE (Semana 1)

**Sem esses, a experiência é ruim ou insegura.**

### P1.1 — Segurança & Isolamento

- [ ] Validar que Cloud Functions bloqueiam ausências com slots de formação
- [ ] Validar que dados de sch-default NÃO vazam pra outras escolas (se houver múltiplas)
- [ ] Verificar isolamento de acesso: professor isolado NÃO vê ausências de outros professores
- [ ] Testar revogação de acesso em runtime:
  - [ ] Admin remove professor de `users/{uid}.schools[sch-default]`
  - [ ] User perde acesso imediatamente (membership listener)

### P1.2 — Performance & Real-time

- [ ] Conferir cache localStorage isolado por schoolId
  - [ ] Chave: `gestao_active_school` (check)
  - [ ] Chave de dados: `gestao_v*_cache_sch-default`
- [ ] Testar listeners em tempo real:
  - [ ] Mudança em ausência reflete na UI em <2s
  - [ ] Mudança em teacher reflete em <2s
  - [ ] Mudança em schedule reflete em <2s

### P1.3 — Auditoria

- [ ] Implementar/validar logging completo em `schools/sch-default/admin_actions/`:
  - [ ] Criação de professor
  - [ ] Edição de professor
  - [ ] Deleção de professor
  - [ ] Criação de ausência
  - [ ] Edição de ausência
  - [ ] Deleção de ausência
  - [ ] Aprovação de professor
  - [ ] Rejeição de professor
- [ ] Validar que cada log tem: `createdAt`, `createdBy`, `action`, `resourceId`, `changes`

---

## 🟢 P2 — SUPORTE (Se tempo permitir)

**Nice-to-have, não bloqueia lançamento.**

- [ ] Testar funcionalidade offline:
  - [ ] Cache local de ausências, schedules, teachers
  - [ ] Sincronização ao voltar online
  - [ ] Conflitos de sincronização (ex: duas edições offline)
- [ ] Testar seletor de escola na UI
  - [ ] Navbar mostra badge "Você está em: sch-default"
  - [ ] Dropdown está pronto (mesmo que só uma escola)
- [ ] Documentar matriz de acessos (RACI por role)
  - [ ] Quem lê o quê
  - [ ] Quem cria o quê
  - [ ] Quem edita o quê
  - [ ] Quem deleta o quê

---

## ❌ O que NÃO vai ser feito antes do lançamento

- Billing (v2.0)
- Onboarding wizard de 5 passos (já tem config pronta)
- Convite de professores por email (v2.0)
- Dashboard SaaS para admin de sistema (v2.0)
- Features de múltiplas escolas na UI (infraestrutura pronta, UI depois)

---

## ⏰ Cronograma Sugerido

### **Segunda–Terça (3–4 de maio)**
- P0.1: Autenticação & perfis
- P0.2: Reset de dados
- P0.3: Fluxo de ausências (testes manuais)

### **Quarta–Quinta (5–6 de maio)**
- P0.4: Relatório de ausências
- P0.5: Rodar testes automatizados
- P1.1: Validações de segurança

### **Sexta (7 de maio)**
- P1.2: Performance & real-time
- P1.3: Auditoria (validação)
- Validação final + go-live

### **Próximas semanas (feedback da escola)**
- P2 (offline, UI refinements)
- Bugs encontrados pela escola
- v2.0 planning (billing, convites, multi-escola)

---

## 📝 Notas de Implementação

### Sobre ausências com formação
- Firestore rules bloqueiam criação se `hasFormationSlot(request.resource.data.slots) == true`
- Cloud Function `createAbsence` também valida (defesa em profundidade)
- `hasFormationSlot()` em rules verifica slots[0..4] pra cobrir maioria dos casos

### Sobre Cloud Functions
- Localização: `/home/ozzie/github/saasgestaoescolar/functions/src/index.ts`
- Testes: `/home/ozzie/github/saasgestaoescolar/functions/src/__tests__/`
- Deploy: `firebase deploy --only functions`

### Sobre Firestore Rules
- Localização: `/home/ozzie/github/saasgestaoescolar/firestore.rules`
- Testes: `npm run test:rules` (roda no emulador)
- Deploy: `firebase deploy --only firestore:rules`

### Sobre offline
- Cache em localStorage: `src/lib/db/cache.js`
- Listeners em: `src/lib/db/listeners.js`
- Sincronização: `saveToFirestore()` reconecta e sincroniza

### Sobre auditoria
- Coleção: `schools/sch-default/admin_actions/{id}`
- Rules: apenas admin cria/lê (update/delete = false, imutável)
- Admin SDK grava automaticamente em operações via Cloud Functions

---

## Checklist Final (Dia do go-live)

- [ ] Escola confirmou que dados estão corretos
- [ ] Admin consegue fazer login (Google OAuth)
- [ ] Admin consegue criar ausência
- [ ] Coordenador consegue criar ausência
- [ ] Professor-coordenador consegue criar ausência
- [ ] Professor isolado NÃO consegue criar ausência
- [ ] Relatório de ausências gera corretamente
- [ ] Todos os testes (`npm run test:rules` + Cloud Functions) passam
- [ ] Offline funciona (testado com conexão desligada)
- [ ] Dados não vazam entre escolas (se múltiplas)
- [ ] Auditoria está gravando

---

**Documento criado:** 28 de abril de 2026  
**Última atualização:** 28 de abril de 2026  
**Status:** Pronto para execução
