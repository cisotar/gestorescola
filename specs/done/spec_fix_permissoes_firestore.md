# Spec: Fix de Permissões Firestore — Professores Pendentes e Salvamento de Horários

## Visão Geral

Dois erros relacionados a permissões Firestore estão afetando usuários reais:

1. **`Missing or insufficient permissions`** — professores recém-chegados não conseguem se registrar como pendentes (`requestTeacherAccess` falha silenciosamente)
2. **Horários não salvam** — `saveToFirestore()` é chamada por professores aprovados mas tenta escrever em coleções que as regras Firestore bloqueiam (`meta/config`, `absences`, `history`)

**Causa raiz:** O projeto não tem `firestore.rules` no repositório — as regras estão configuradas diretamente no console Firebase e aparentemente bloqueiam escrita em certas coleções para não-admins. O código cliente não respeita essas restrições ao chamar `saveToFirestore()` indiscriminadamente para qualquer role.

**Log do erro:**
```
FirebaseError: Missing or insufficient permissions.
```

---

## Stack Tecnológica

- Frontend: React 18 + Zustand
- Backend: Firebase Firestore 10.14.1
- Auth: Firebase Google Auth
- Hosting: Firebase Hosting

---

## Diagnóstico Detalhado

### Problema 1 — `requestTeacherAccess` falhando

**Fluxo atual:**
```
login Google
  → _resolveRole()
    → não é admin, não é teacher aprovado
    → set({ role: 'pending' })
    → requestTeacherAccess(user)   ← FALHA: "Missing or insufficient permissions"
```

**Por quê falha:** `requestTeacherAccess` chama `setDoc(doc(db, 'pending_teachers', user.uid), ...)`. Se a regra Firestore para `pending_teachers` não permitir escrita pelo próprio usuário autenticado, o `setDoc` rejeita.

**Consequência:** O professor novo nunca aparece na fila de aprovação do admin. Fica preso na `PendingPage` para sempre.

**Localização:** `src/lib/db.js:268-277` e `src/store/useAuthStore.js:48`

---

### Problema 2 — `saveToFirestore()` sendo chamada por professores

**Fluxo atual:**
```
professor edita própria grade (addSchedule / updateSchedule)
  → useAppStore.action()
  → get().save()
  → saveToFirestore(state)   ← tenta escrever meta/config, absences, history
    → FALHA: "Missing or insufficient permissions"
    → schedules NÃO salva (o erro aborta antes ou junto)
```

**Por quê falha:** `saveToFirestore()` executa:
1. `batch.set(doc(db, 'meta/config'), ...)` — professor não pode escrever config global
2. `_syncCol('absences', ...)` — professor não pode escrever ausências de outros
3. `_syncCol('history', ...)` — professor não pode escrever histórico

O erro em qualquer um desses bloqueia o salvamento completo ou produz o log de permissão.

**Localização:** `src/lib/db.js:158-179` e `src/store/useAppStore.js` (toda action que chama `get().save()`)

---

## Solução

### Fix 1 — Regras Firestore (firestore.rules)

Criar o arquivo `firestore.rules` no repositório e fazer deploy. Regras mínimas necessárias:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helpers
    function isAuth() { return request.auth != null; }
    function isAdmin() {
      return isAuth() && exists(/databases/$(database)/documents/admins/$(request.auth.token.email.replace('.','_').replace('@','_')));
    }

    // Config global — só admin escreve, qualquer autenticado lê
    match /meta/{doc} {
      allow read: if isAuth();
      allow write: if isAdmin();
    }

    // Professores — qualquer autenticado lê; admin cria/deleta; professor atualiza só seus campos
    match /teachers/{docId} {
      allow read: if isAuth();
      allow create, delete: if isAdmin();
      allow update: if isAdmin()
        || (isAuth() && request.auth.token.email.lower() == resource.data.email
            && request.resource.data.diff(resource.data).affectedKeys()
               .hasOnly(['celular', 'whatsapp', 'subjectIds']));
    }

    // Horários — qualquer autenticado lê; admin escreve qualquer; professor só os seus
    match /schedules/{docId} {
      allow read: if isAuth();
      allow create, update, delete: if isAdmin()
        || (isAuth() && (
              request.resource.data.teacherId == request.auth.uid
              || resource.data.teacherId == request.auth.uid
            ));
    }

    // Ausências — só admin
    match /absences/{docId} {
      allow read, write: if isAdmin();
    }

    // Histórico — só admin
    match /history/{docId} {
      allow read, write: if isAdmin();
    }

    // Pendentes — usuário autenticado cria/lê/atualiza o próprio doc; admin lê e deleta todos
    match /pending_teachers/{uid} {
      allow create: if isAuth() && request.auth.uid == uid;
      allow read, update: if isAuth() && (request.auth.uid == uid || isAdmin());
      allow delete: if isAdmin();
    }

    // Admins — só admin escreve; qualquer autenticado lê (para verificar se é admin)
    match /admins/{docId} {
      allow read: if isAuth();
      allow write: if isAdmin();
    }
  }
}
```

**Deploy:** `firebase deploy --only firestore:rules`

---

### Fix 2 — `saveToFirestore()` respeitar role

Criar função `saveSchedulesOnly(schedules)` para professores, em vez de chamar `saveToFirestore()` completo.

**Em `src/lib/db.js`:** adicionar:
```js
export async function saveSchedulesOnly(schedules) {
  await _syncCol('schedules', schedules)
}
```

**Em `src/store/useAppStore.js`:** as actions `addSchedule`, `updateSchedule`, `removeSchedule` já chamam `saveDoc` / `updateDocById` / `deleteDocById` individualmente — **não chamam `get().save()`**. Verificar se há outro caminho que aciona `saveToFirestore()` para professores.

O `get().save()` no store chama `saveToFirestore()` — precisa ser protegido por role antes de tentar escrever `meta/config` e coleções restritas.

**Em `src/store/useAppStore.js`:** na função `save()`:
```js
save: async () => {
  const { role } = useAuthStore.getState()
  if (role === 'admin') {
    await saveToFirestore(get())
  }
  // teachers: escrita granular já feita nas próprias actions (saveDoc/updateDocById)
}
```

---

## Modelos de Dados

### `pending_teachers/{uid}`
```js
{
  id: string,         // = uid do Firebase Auth
  uid: string,
  email: string,      // lowercase
  name: string,
  photoURL: string,
  requestedAt: Timestamp,
  status: 'pending',
  celular?: string,
  apelido?: string,
  subjectIds?: string[]
}
```

### `schedules/{id}`
```js
{
  id: string,
  teacherId: string,  // teacher.id (não uid do auth — exceto para pendentes)
  day: string,        // 'seg' | 'ter' | ...
  timeSlot: string,   // 'segId|turno|aulaIdx'
  turma: string,
  subjectId: string
}
```

---

## Regras de Negócio

- Professor pendente deve conseguir criar seu próprio doc em `pending_teachers` no momento do primeiro login
- Professor aprovado pode ler e editar apenas seus próprios horários (`schedules` onde `teacherId == teacher.id`)
- Professor aprovado não pode escrever em `meta/config`, `absences`, `history`
- Admin pode ler e escrever em todas as coleções
- A verificação de admin no Firestore deve usar o email do token (não campo do doc) para evitar escalada de privilégio

---

## Behaviors

### Fluxo professor novo (pendente)
- [ ] Primeiro login com Google → `requestTeacherAccess()` cria doc em `pending_teachers/{uid}` com sucesso
- [ ] Se doc já existe, não sobrescreve (idempotente)
- [ ] Professor fica na `PendingPage` aguardando aprovação
- [ ] Quando admin aprova, listener `onSnapshot` detecta deleção do doc e atualiza role para `teacher`

### Fluxo professor aprovado editando horários
- [ ] Professor abre `SettingsPage` → tab de grade horária
- [ ] Adiciona/edita/remove aula → `addSchedule` / `updateSchedule` / `removeSchedule`
- [ ] Escrita vai direto para `schedules/{id}` via `saveDoc` / `updateDocById` / `deleteDocById`
- [ ] `saveToFirestore()` completo **não é chamado** para role `teacher`
- [ ] Toast de confirmação aparece após salvar

### Admin gerenciando dados
- [ ] Admin chama `save()` → `saveToFirestore()` completo funciona (tem permissão em todas coleções)
- [ ] Admin aprova professor → `approveTeacher()` escreve em `teachers`, migra `schedules`, deleta de `pending_teachers`

---

## Fora do Escopo

- Migração de dados existentes no Firestore
- Implementar regras de campo-level security além do mínimo necessário
- Alterar UI de qualquer página
- Mudar o fluxo de aprovação de professores
