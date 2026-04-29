# Runbook — Alertas de Cloud Functions (saasgestaoescolar)

Este runbook descreve como diagnosticar e responder a cada alerta configurado
no Google Cloud Monitoring para o projeto `saasgestaoescolar`.

---

## Indice

1. [createAbsence-errors](#1-createabsence-errors)
2. [approveTeacher-errors](#2-approveteacher-errors)
3. [removeTeacherFromSchool-errors](#3-removeteacherfromschool-errors)
4. [backfillRemovedFrom-errors](#4-backfillremovedfrom-errors)
5. [global-function-errors](#5-global-function-errors)
6. [Limitacoes conhecidas](#6-limitacoes-conhecidas)
7. [Escalacao](#7-escalacao)

---

## 1. createAbsence-errors

**Descricao:** Disparado quando `severity=ERROR` e ocorre na funcao `createAbsence`.

**Filtro Cloud Logging:**

```
resource.type="cloud_function"
resource.labels.function_name="createAbsence"
severity=ERROR
```

Link direto:
`https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_function%22%20AND%20resource.labels.function_name%3D%22createAbsence%22%20AND%20severity%3DERROR?project=saasgestaoescolar`

**Passos de diagnostico:**

1. Abrir o link acima e identificar o log de erro mais recente.
2. No payload JSON do log, localizar os campos de contexto:
   - `schoolId` — identifica a escola afetada
   - `absenceId` — ID do registro de falta (se criado antes do erro)
   - `teacherId` — professor que acionou a funcao
   - `requestedBy` — UID do coordinador/admin que fez a chamada
3. Verificar no Firestore (`schools/{schoolId}/absences`) se o documento foi
   criado parcialmente ou nao foi criado (estado inconsistente).
4. Se o campo `absenceId` estiver ausente no log, a falha ocorreu antes da
   escrita — nenhum dado foi persistido.
5. Verificar se o erro e recorrente (mesmo `schoolId`) ou isolado.
6. Confirmar se o horario do erro coincide com manutencao ou deploy recente.

**Acoes possiveis:**

- Erro de permissao Firestore: verificar regras em `firestore.rules`.
- Erro de payload invalido: verificar se o cliente esta enviando os campos
  obrigatorios (`schoolId`, `classId`, `slots`).
- Timeout de escrita: verificar quotas do Firestore no console GCP.

---

## 2. approveTeacher-errors

**Descricao:** Disparado quando `severity=ERROR` ocorre na funcao `approveTeacher`.

**Filtro Cloud Logging:**

```
resource.type="cloud_function"
resource.labels.function_name="approveTeacher"
severity=ERROR
```

Link direto:
`https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_function%22%20AND%20resource.labels.function_name%3D%22approveTeacher%22%20AND%20severity%3DERROR?project=saasgestaoescolar`

**Passos de diagnostico:**

1. Abrir o link acima e identificar o log de erro.
2. No payload JSON, localizar:
   - `schoolId` — escola onde a aprovacao foi tentada
   - `teacherUid` / `teacherId` — UID do professor que deveria ser aprovado
   - `requestedBy` — UID do admin/coordinator que aprovou
3. Verificar no Firestore (`schools/{schoolId}/users/{teacherUid}`) se o
   documento do professor existe e qual e o estado do campo `status`.
4. Verificar se o documento de join (`joinRequests/{schoolId}_{teacherUid}`)
   ainda existe ou foi removido antes da aprovacao.
5. Confirmar se o Custom Claim foi atualizado no Firebase Auth
   (`admin.auth().getUser(teacherUid)` e checar `customClaims`).

**Acoes possiveis:**

- Join nao encontrado: recriar o vinculo manualmente via script
  `scripts/seed-admins.js` ou corrigir o documento no Firestore.
- Falha ao setar Custom Claim: tentar novamente via Firebase Admin SDK
  no console ou script avulso.
- Erro de permissao IAM: verificar se a service account tem
  `roles/firebaseauth.admin`.

---

## 3. removeTeacherFromSchool-errors

**Descricao:** Disparado quando `severity=ERROR` ocorre na funcao
`removeTeacherFromSchool`.

**Filtro Cloud Logging:**

```
resource.type="cloud_function"
resource.labels.function_name="removeTeacherFromSchool"
severity=ERROR
```

Link direto:
`https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_function%22%20AND%20resource.labels.function_name%3D%22removeTeacherFromSchool%22%20AND%20severity%3DERROR?project=saasgestaoescolar`

**Passos de diagnostico:**

1. Abrir o link acima e identificar o log de erro.
2. No payload JSON, localizar:
   - `schoolId` — escola de onde o professor seria removido
   - `teacherUid` — UID do professor
   - `requestedBy` — quem acionou a remocao
3. Verificar no Firestore se o documento `schools/{schoolId}/users/{teacherUid}`
   ainda existe (remocao incompleta) ou ja foi removido (erro apos a remocao).
4. Verificar o campo `removedFrom` no documento do usuario em
   `users/{teacherUid}` — deve conter o `schoolId` apos remocao bem-sucedida.
5. Confirmar se os Custom Claims foram revogados no Firebase Auth.
6. Verificar se o log `removeTeacher.uidUnresolved` aparece antes do erro —
   indica que o UID nao foi resolvido pelo nome de display (fluxo alternativo).

**Acoes possiveis:**

- Remocao parcial: executar `scripts/cleanup-removed-user.js` para limpar
  residuos do usuario.
- UID nao resolvido: verificar se o `displayName` do usuario no Firebase Auth
  corresponde ao nome armazenado no Firestore.
- Claim nao revogado: revogar manualmente via Firebase Admin SDK.

---

## 4. backfillRemovedFrom-errors

**Descricao:** Disparado quando `severity=ERROR` ocorre na funcao
`backfillRemovedFrom` (funcao de migracao/backfill).

**Filtro Cloud Logging:**

```
resource.type="cloud_function"
resource.labels.function_name="backfillRemovedFrom"
severity=ERROR
```

Link direto:
`https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_function%22%20AND%20resource.labels.function_name%3D%22backfillRemovedFrom%22%20AND%20severity%3DERROR?project=saasgestaoescolar`

**Passos de diagnostico:**

1. Abrir o link acima — o log `backfillRemovedFrom.batchCommitError` indica
   falha no commit de um batch do Firestore.
2. No payload JSON, localizar:
   - `batchSize` — quantos documentos estavam no batch
   - `error` — mensagem de erro do Firestore
3. Verificar se o erro e transiente (timeout, indisponibilidade temporaria)
   ou estrutural (permissao, documento nao encontrado).
4. A funcao de backfill e idempotente — pode ser reexecutada com seguranca
   apos corrigir a causa raiz.
5. Verificar o progresso do backfill nos logs anteriores ao erro para estimar
   quantos documentos foram processados antes da falha.

**Acoes possiveis:**

- Timeout do Firestore: aguardar e reexecutar a funcao.
- Falha de permissao: verificar `firestore.rules` para operacoes de escrita
  em `users/{uid}`.
- Batch muito grande: ajustar o tamanho do batch no codigo da funcao.

---

## 5. global-function-errors

**Descricao:** Disparado quando qualquer Cloud Function do projeto acumula
mais de 5 execucoes com `status != "ok"` em uma janela de 10 minutos. Cobre
funcoes sem alerta individual.

**Metrica:** `cloudfunctions.googleapis.com/function/execution_count`
com `metric.labels.status != "ok"`.

**Filtro Cloud Logging para investigacao geral:**

```
resource.type="cloud_function"
severity=ERROR
```

Link direto:
`https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_function%22%20AND%20severity%3DERROR?project=saasgestaoescolar`

**Passos de diagnostico:**

1. Acessar Cloud Monitoring > Metrics Explorer e filtrar pela metrica
   `cloudfunctions.googleapis.com/function/execution_count` agrupando por
   `function_name` e `status` para identificar qual funcao esta falhando.
2. Usar o filtro de log acima para inspecionar os erros recentes.
3. Identificar se o pico de erros coincide com um deploy, migracao de dados
   ou aumento de carga.
4. Verificar se as funcoes com alerta individual (`createAbsence`,
   `approveTeacher`, `removeTeacherFromSchool`, `backfillRemovedFrom`)
   ja dispararam seus alertas proprios — nesse caso, seguir o runbook da
   funcao especifica.

**Acoes possiveis:**

- Investigar a funcao especifica com mais erros e seguir o runbook
  correspondente.
- Se o erro for em uma funcao sem runbook dedicado, verificar os logs
  diretamente e avaliar se um alerta individual deve ser adicionado.

---

## 6. Limitacoes conhecidas

### HttpsError nao gera severity=ERROR automaticamente

As funcoes usam `functions.https.HttpsError` (ex: `invalid-argument`,
`not-found`, `permission-denied`) para retornar erros ao cliente. Esses erros
sao retornados via HTTP mas **nao** emitem um log com `severity=ERROR` de
forma automatica pelo Firebase Functions runtime.

Consequencia: erros de validacao de input ou de autorizacao que usam
`HttpsError` nao disparam os alertas individuais definidos neste runbook.

Para capturar esses erros nos alertas, seria necessario adicionar chamadas
explicitas a `logger.error(...)` nos blocos `catch` antes de relançar o
`HttpsError`.

### Emulador local nao alimenta o Cloud Logging

Testes locais com Firebase Emulator Suite nao enviam logs para o Cloud
Logging. Os alertas so disparam para erros em producao.

### Atraso de notificacao

O SLA de entrega de email do Cloud Monitoring e de 2 a 5 minutos apos o
disparo do alerta em condicoes normais. O criterio de aceite define 10 minutos
como limite superior.

### Estado "No data" nas policies

Se nenhuma execucao com erro ocorrer na janela de avaliacao, a policy fica em
estado `No incident` sem disparar. Isso e comportamento correto — nao indica
problema na configuracao.

---

## 7. Escalacao

| Nivel | Condicao | Acao |
|-------|----------|------|
| 1 | Alerta individual disparou 1 vez | Investigar logs, verificar Firestore, resolver dentro de 1h |
| 2 | Alerta individual disparou 3+ vezes em 1h | Envolver desenvolvedor responsavel, avaliar rollback |
| 3 | global-function-errors disparou | Avaliar impacto em todos os usuarios, verificar todas as funcoes |
| 4 | Indisponibilidade de Firestore ou Auth | Acionar suporte GCP (console.cloud.google.com/support) |

**Contato principal:** contato.tarciso@gmail.com

**Console GCP:**
- Alertas: https://console.cloud.google.com/monitoring/alerting?project=saasgestaoescolar
- Logs: https://console.cloud.google.com/logs/query?project=saasgestaoescolar
- Firestore: https://console.cloud.google.com/firestore?project=saasgestaoescolar
