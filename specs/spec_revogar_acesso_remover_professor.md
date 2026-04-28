# Spec: Revogar Acesso ao Remover Professor

## Visão Geral

Hoje, no SaaS Gestão Escolar (multi-tenant), quando um admin (SaaS ou local) remove um professor da escola pela tabela em `/settings?tab=teachers`, o usuário desaparece da lista mas **continua conseguindo logar e acessar o sistema** porque a entrada `users/{uid}.schools[schoolId]` não é apagada.

Caso real observado em produção: `paodociso@gmail.com` foi removido pelo SaaS admin, sumiu da lista, mas continuou entrando normalmente. Pior: a auto-reconciliação em `_resolveRole` (step 3.5 do `useAuthStore`) pode **recriar** o teacher document a partir do email aprovado, gerando um loop indefinido entre admin removendo e usuário voltando.

Esta spec define a operação "remover professor" como uma **revogação completa de acesso àquela escola**, executada de forma privilegiada via Cloud Function callable, eliminando todos os artefatos de membership e impedindo a auto-recriação no próximo login.

## Stack Tecnológica

- Frontend: React + Zustand + React Router
- Backend: Cloud Functions Firebase (callable) + Firestore
- Auth: Firebase Auth + Google OAuth
- Admin SDK: usado dentro da Cloud Function para escrever em `users/{uid}` de outro usuário

## Páginas e Rotas

### Tabela de Professores — `/settings?tab=teachers`

**Descrição:** Página onde admin SaaS ou admin local visualiza a lista de professores da escola e pode remover qualquer um deles (exceto a si mesmo, no caso do admin local).

**Componentes:**
- TeachersTable: tabela com lista de professores, ações por linha (editar, remover)
- ConfirmRemoveTeacherModal: modal de confirmação antes da remoção
- Toast/Snackbar: feedback de sucesso ou erro da operação

**Behaviors:**
- [ ] Listar professores da escola atual lendo `schools/{schoolId}/teachers/*`
- [ ] Ao clicar em "Remover" em uma linha, abrir modal de confirmação com nome/email do professor
- [ ] Bloquear remoção de si mesmo se o caller for admin local (regra existente — manter)
- [ ] Ao confirmar remoção, chamar a Cloud Function `removeTeacherFromSchool({ schoolId, teacherId })`
- [ ] Enquanto a function executa, desabilitar o botão de remover daquela linha e exibir spinner
- [ ] Em caso de sucesso: remover a linha localmente, fechar modal, exibir toast "Professor removido"
- [ ] Em caso de erro (permission, network, etc.): manter a linha, fechar modal, exibir toast com mensagem de erro
- [ ] Operação deve ser idempotente do ponto de vista da UI: clicar duas vezes seguidas não deve gerar estado inconsistente

---

## Cloud Functions

### `removeTeacherFromSchool(schoolId, teacherId)` (NOVA)

**Descrição:** Callable executada via Admin SDK. Centraliza toda a revogação de acesso de um professor a uma escola.

**Validações de entrada:**
- [ ] Caller autenticado (request.auth.uid presente)
- [ ] Caller é SaaS admin **OU** admin local (`role === 'admin'`) da `schoolId` informada
- [ ] `teacherId` ≠ caller.uid quando caller é admin local (proibir self-removal)
- [ ] `schoolId` e `teacherId` presentes e bem-formados

**Operações (ordem):**
- [ ] Ler `schools/{schoolId}/teachers/{teacherId}` para obter o `uid` associado (pode ser igual ao teacherId, ou estar em campo `uid`/`userId`) e o `email`
- [ ] Deletar `schools/{schoolId}/teachers/{teacherId}`
- [ ] Deletar todos os documentos de `schools/{schoolId}/schedules/*` onde `teacherId === <id>`
- [ ] **Remover `schools[schoolId]` do mapa em `users/{uid}`** usando `FieldValue.delete()` (NOVO)
- [ ] Se houver email associado, deletar `schools/{schoolId}/pending_teachers/{uid}` se existir (limpa órfão que faria a auto-reconciliação recriar o teacher)
- [ ] Retornar `{ ok: true, removed: { teacherId, uid, email } }`

**Idempotência:**
- [ ] Se `teachers/{teacherId}` não existir, ainda assim tentar limpar `users/{uid}.schools[schoolId]` e `pending_teachers/{uid}` se um `uid` puder ser inferido (ex.: client passa `uid` no payload, ou function aceita os dois `teacherId === uid` no padrão atual). Retornar `{ ok: true }` mesmo sem nada para deletar.
- [ ] Cada deleção individual deve usar try/catch interno para não falhar a operação inteira por um doc já apagado

## Componentes Compartilhados

- ConfirmRemoveTeacherModal: já existe em `src/components/`, será reutilizado sem mudanças visuais
- Toast/Snackbar do app (provider global)

## Modelos de Dados

### `users/{uid}`
Campo relevante: `schools` — mapa `{ [schoolId]: { role, joinedAt, ... } }`.
Operação: remover a chave `[schoolId]` via `FieldValue.delete()`.

### `schools/{schoolId}/teachers/{teacherId}`
Documento do professor dentro da escola. Deletado integralmente.

### `schools/{schoolId}/schedules/{scheduleId}`
Aulas alocadas. Todos os documentos com `teacherId === <id>` são deletados.

### `schools/{schoolId}/pending_teachers/{uid}`
Email pré-aprovado aguardando primeiro login. Deletado para evitar que a auto-reconciliação em `_resolveRole` (step 3.5) recrie o teacher no próximo login do usuário removido.

### `schools/{schoolId}/banned_emails/{emailKey}` (v2 — fora do escopo v1)
Bloqueio definitivo por email para impedir qualquer reentrada. Não será gravado em v1.

## Regras de Negócio

- Operação privilegiada: cliente **não** tem permissão de Firestore para escrever em `users/{uid}` de outro usuário. A Cloud Function é o único caminho válido.
- Apenas SaaS admin **OU** admin local da escola (`users/{caller.uid}.schools[schoolId].role === 'admin'`) pode remover professor.
- Self-removal: admin local não pode remover a si próprio. Regra existente — manter e validar também na Cloud Function (não confiar só no front).
- Idempotência: chamar `removeTeacherFromSchool` duas vezes seguidas para o mesmo `teacherId` não deve gerar erro nem estado inconsistente.
- Auto-reconciliação não pode ressuscitar o usuário: ao limpar `pending_teachers/{uid}`, removemos o gatilho que `_resolveRole` (step 3.5) usa para recriar o teacher. Se o usuário for re-aprovado depois (admin recadastra email), o fluxo normal de cadastro reabre o acesso — esse é o comportamento desejado.
- Sessão ativa do usuário removido (v1): ao fazer reload ou nova sessão, `useAuthStore` lê `users/{uid}.schools` vazio para a `schoolId` e o app já redireciona para `/no-school`. v1 aceita esse comportamento; logout forçado em runtime fica para v2.

## Fora do Escopo (v1)

- **Banimento permanente** via `schools/{schoolId}/banned_emails/{emailKey}` — fica para v2
- **Logout forçado em sessão ativa** — v1 só revoga acesso no próximo reload/login
- **Auditoria detalhada** (log de quem removeu quem, quando, com qual motivo) — v2
- **Notificação ao professor removido** (email avisando que perdeu acesso) — v2
- **UI para reverter remoção** (undo) — não previsto
