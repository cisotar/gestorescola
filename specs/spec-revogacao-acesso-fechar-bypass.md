---
name: Fechar bypass de revogação de acesso (validação no backend)
created: 2026-04-28
status: ready
---

# Spec — Fechar bypass de revogação de acesso

## Contexto

Usuário relatou que `paodociso@gmail.com` foi removido pelo SaaS admin (sumiu da lista de professores), mas continua conseguindo logar mesmo após hard reload. Auditoria do código revelou que a remoção via Cloud Function `removeTeacherFromSchool` está correta, mas existem múltiplos caminhos que **recriam** o vínculo `users/{uid}.schools[schoolId]` no client, anulando a revogação.

## Bugs identificados

### B1 — CRÍTICO — Auto-reconciliação client-side recria membership

[`src/store/useAuthStore.js`](src/store/useAuthStore.js) step 3.5 do `_resolveRole`: se `users/{uid}` não tem entrada para a escola, o cliente busca um teacher pelo email e, se encontrar com `status: 'approved'`, faz `setDoc users/{uid}.schools[schoolId]` com role/status reconciliados.

**Problema:** funciona como backdoor — qualquer professor removido que ainda tenha doc residual em `teachers/` (ex.: remoção feita por via não-cloud-function, ou em janela de race) é re-readmitido ao logar.

**Pior ainda:** a auto-reconciliação confia em dados do client (lê teacher, escreve users/{uid}). O backend não valida.

### B2 — CRÍTICO — Rules permitem write irrestrito em users/{uid}

[`firestore.rules`](firestore.rules#L14):
```
match /users/{uid} {
  allow write: if request.auth != null && request.auth.uid == uid || isSaasAdmin();
}
```

Qualquer cliente autenticado pode escrever **qualquer estrutura** em `users/{uid}`, inclusive `schools.{anySchoolId} = { role: 'admin', status: 'approved' }` — privilege escalation completa. A única defesa hoje é que `isMemberOf` na rules e `isSchoolAdmin` checam o role do users/{uid}, mas o cliente que controla esse doc controla o role.

### B3 — CRÍTICO — JoinPage faz auto-promoção a admin no client

[`src/pages/JoinPage.jsx:130-148`](src/pages/JoinPage.jsx#L130-L148): se `currentUser.email === schoolData.adminEmail`, o cliente faz `setDoc users/{uid}` com `role: 'admin'`. Validação de identidade depende exclusivamente do client — se rules forem revisitadas e o write for permitido por outro caminho, a validação some.

### B4 — ALTO — approveTeacher não grava uid no doc teacher

[`functions/src/index.ts`](functions/src/index.ts) `approveTeacher`: cria `teachers/{newId}` mas não grava o campo `uid` (Firebase Auth UID do professor). A `removeTeacherFromSchool` precisa fazer query reversa em `users where email == teacherEmail` — frágil se houver case mismatch, conflito de email, ou se `users/{uid}` ainda não foi criado quando a remoção acontece.

### B5 — MÉDIO — requestTeacherAccess recria pending_teachers ao logar

[`src/store/useAuthStore.js:350`](src/store/useAuthStore.js#L350): se step 3.5 (auto-reconciliação) for desabilitado e o usuário removido logar, cai em step 4 que chama `requestTeacherAccess`, recriando `pending_teachers/{uid}`. Não dá acesso direto, mas reapresenta solicitação.

## Princípios da correção

1. **Validações no backend.** Cliente NÃO escreve em `users/{uid}.schools[schoolId]` — sempre via Cloud Function que valida autorização.
2. **Rules restritivas.** `users/{uid}` permite escrita de campos não-críticos (ex.: nome, preferências), mas o map `schools` é write-protected exceto via Cloud Function.
3. **Sem fallback "auto-cura"** que recria membership baseada em outros dados. Se o vínculo foi removido, foi removido.
4. **Idempotência e atomicidade na Cloud Function.** Resolução de UID por múltiplos caminhos (campo `uid` no teacher, query por email).

## Acceptance criteria global

- [ ] Após `removeTeacherFromSchool`, professor removido NÃO consegue:
  - Recriar `users/{uid}.schools[schoolId]` ao logar
  - Acessar dados da escola
  - Aparecer em PendingPage da escola removida
- [ ] `users/{uid}.schools[schoolId]` é write-only via Cloud Function (rule bloqueia escrita direta do client)
- [ ] Admin local não pode promover a si mesmo via cliente — JoinPage usa Cloud Function
- [ ] `approveTeacher` grava `uid` no doc teacher para resolução robusta
- [ ] Build passa sem erros e deploy de rules + functions é executado

## Issues

- **456** — fix: remover auto-reconciliação client-side em _resolveRole (B1)
- **457** — fix: rules — proteger users/{uid}.schools de write client-side (B2)
- **458** — fix: Cloud Function joinSchoolAsAdmin — substituir setDoc no JoinPage (B3)
- **459** — fix: approveTeacher grava uid no teacher doc + migration (B4)
- **460** — fix: removeTeacherFromSchool resolve uid por múltiplos caminhos (B4)
- **461** — fix: bloquear recriação de pending_teachers para usuários removidos (B5)
- **462** — test: regressão e2e fluxo remoção → tentativa de re-login

## Diagrama de dependências

```
457 (rules)  ──┐
458 (joinAsAdmin CF) ──┤
459 (approveTeacher uid) ──┤
                         ├──→ 456 (remove auto-reconciliação)
460 (removeTeacher robust) ──┤
461 (block pending recreate) ──┘
                                └──→ 462 (e2e regression)
```

Ordem prática: 457 → 459 → 460 → 458 → 461 → 456 → 462.
