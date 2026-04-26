/**
 * Script de migração: copia dados single-tenant para estrutura multi-tenant.
 *
 * O que faz:
 *   1. Cria /schools/sch-default (se não existir)
 *   2. Copia /meta/config → /schools/sch-default/config/main
 *   3. Copia cada coleção global para schools/sch-default/{colecao}/{docId}
 *   4. Popula /users/{uid} com schools["sch-default"] para teachers e admins
 *
 * Uso com serviceAccountKey.json na raiz:
 *   node scripts/migrate-to-multitenant.js
 *
 * Uso com emulador local:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/migrate-to-multitenant.js
 *
 * Uso com variável de ambiente:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/migrate-to-multitenant.js
 *
 * Nota: script idempotente — documentos existentes no destino são pulados.
 * Coleções originais nunca são alteradas ou deletadas.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Inicialização do Firebase Admin ──────────────────────────────────────────

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST

if (!getApps().length) {
  if (emulatorHost) {
    initializeApp({ projectId: 'gestorescola' })
    console.log(`Usando emulador Firestore em: ${emulatorHost}`)
  } else {
    const keyPath = resolve(__dirname, '../serviceAccountKey.json')
    const envCred = process.env.GOOGLE_APPLICATION_CREDENTIALS

    if (envCred) {
      initializeApp({ credential: cert(envCred) })
      console.log('Usando credencial de GOOGLE_APPLICATION_CREDENTIALS')
    } else if (existsSync(keyPath)) {
      const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))
      initializeApp({ credential: cert(serviceAccount) })
      console.log('Usando serviceAccountKey.json')
    } else {
      console.error(
        'ERRO: Credencial não encontrada.\n' +
        'Opções:\n' +
        '  1. Defina GOOGLE_APPLICATION_CREDENTIALS com o caminho para o JSON de credencial.\n' +
        '  2. Coloque serviceAccountKey.json na raiz do projeto.\n' +
        '  3. Para emulador local: FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/migrate-to-multitenant.js'
      )
      process.exit(1)
    }
  }
}

const db = getFirestore()

const SCHOOL_ID = 'sch-default'
const COLLECTIONS = [
  'teachers',
  'schedules',
  'absences',
  'history',
  'pending_teachers',
  'pending_actions',
  'admin_actions',
]

// ─── Resumo global ─────────────────────────────────────────────────────────────

const summary = {
  collections: {},
  usersCreated: 0,
  usersUpdated: 0,
  readErrors: 0,
  writeErrors: 0,
}

// ─── Passo 1: criar /schools/sch-default ──────────────────────────────────────

async function migrateSchoolDoc() {
  console.log('\n[1/5] Verificando schools/sch-default...')
  const ref = db.collection('schools').doc(SCHOOL_ID)
  const snap = await ref.get()

  if (snap.exists) {
    console.log('  schools/sch-default já existe, pulando.')
    return false
  }

  await ref.set({
    name: 'Escola Principal',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: 'migration-script',
    plan: 'free',
  })
  console.log('  schools/sch-default criado.')
  return true
}

// ─── Passo 2: copiar meta/config → schools/sch-default/config/main ───────────

async function migrateConfig() {
  console.log('\n[2/5] Migrando meta/config...')
  const destRef = db
    .collection('schools')
    .doc(SCHOOL_ID)
    .collection('config')
    .doc('main')

  const destSnap = await destRef.get()
  if (destSnap.exists) {
    console.log('  config/main já existe, pulando.')
    return
  }

  const srcSnap = await db.collection('meta').doc('config').get()
  if (!srcSnap.exists) {
    console.warn('  WARN: meta/config não encontrado — config/main não migrado.')
    return
  }

  await destRef.set(srcSnap.data())
  console.log('  meta/config copiado para schools/sch-default/config/main.')
}

// ─── Passo 3: copiar coleções globais ─────────────────────────────────────────

async function migrateCollections() {
  console.log('\n[3/5] Migrando coleções globais...')

  // Lemos todos os dados em memória antes de qualquer gravação, conforme
  // orientação do plano técnico: evitar intercalar leituras e escritas.
  const collectionData = {}

  for (const col of COLLECTIONS) {
    try {
      const snap = await db.collection(col).get()
      collectionData[col] = snap.docs.map((d) => ({ id: d.id, data: d.data() }))
      console.log(`  Lidos ${collectionData[col].length} docs de ${col}`)
    } catch (err) {
      console.error(`  ERRO ao ler ${col}: ${err.message}`)
      summary.readErrors++
      collectionData[col] = []
    }
  }

  // Gravações
  for (const col of COLLECTIONS) {
    const docs = collectionData[col]
    if (docs.length === 0) {
      console.log(`  ${col}: 0 docs, pulado.`)
      summary.collections[col] = { migrated: 0, skipped: 0 }
      continue
    }

    let migrated = 0
    let skipped = 0

    for (const { id, data } of docs) {
      const destRef = db
        .collection('schools')
        .doc(SCHOOL_ID)
        .collection(col)
        .doc(id)

      try {
        const destSnap = await destRef.get()
        if (destSnap.exists) {
          skipped++
          continue
        }
        await destRef.set(data)
        migrated++
      } catch (err) {
        console.error(`  ERRO ao gravar ${col}/${id}: ${err.message}`)
        summary.writeErrors++
      }
    }

    summary.collections[col] = { migrated, skipped }
    console.log(`  ${col}: ${migrated} migrados, ${skipped} pulados.`)
  }

  return collectionData
}

// ─── Helpers para resolução de uid ────────────────────────────────────────────

/**
 * Constrói mapa de email → uid a partir dos docs de pending_teachers.
 * O Document ID de pending_teachers é o uid do Firebase Auth.
 */
function buildEmailToUidMap(pendingTeachersDocs) {
  const map = {}
  for (const { id, data } of pendingTeachersDocs) {
    if (data.email) {
      map[data.email.toLowerCase()] = id
    }
  }
  return map
}

/**
 * Deriva role a partir de teacher.profile conforme tabela do plano técnico.
 */
function deriveRole(profile) {
  if (profile === 'coordinator') return 'coordinator'
  if (profile === 'teacher-coordinator') return 'teacher-coordinator'
  return 'teacher'
}

// ─── Passo 4: popular /users/ ─────────────────────────────────────────────────

async function migrateUsers(collectionData) {
  console.log('\n[4/5] Populando /users/ com schools["sch-default"]...')

  const teacherDocs = collectionData['teachers'] ?? []
  const pendingTeacherDocs = collectionData['pending_teachers'] ?? []
  const emailToUid = buildEmailToUidMap(pendingTeacherDocs)

  // 4a. Teachers aprovados
  console.log(`  Processando ${teacherDocs.length} teacher(s) aprovado(s)...`)
  for (const { id: docId, data: teacher } of teacherDocs) {
    if (teacher.status !== 'approved') continue

    if (!teacher.email) {
      console.warn(`  WARN: teacher ${docId} sem campo email — uid não pode ser resolvido.`)
      continue
    }

    const uid = emailToUid[teacher.email.toLowerCase()]
    if (!uid) {
      console.warn(
        `  WARN: teacher ${teacher.email} sem uid resolvível — /users/ não populado.`
      )
      continue
    }

    const role = deriveRole(teacher.profile)
    const userRef = db.collection('users').doc(uid)

    try {
      await userRef.set(
        {
          schools: {
            [SCHOOL_ID]: { role, status: 'approved' },
          },
        },
        { merge: true }
      )
      summary.usersUpdated++
    } catch (err) {
      console.error(`  ERRO ao atualizar /users/${uid}: ${err.message}`)
      summary.writeErrors++
    }
  }

  // 4b. Pending teachers (status === 'pending')
  console.log(`  Processando ${pendingTeacherDocs.length} pending_teacher(s)...`)
  for (const { id: uid, data: pt } of pendingTeacherDocs) {
    if (pt.status !== 'pending') continue

    const userRef = db.collection('users').doc(uid)
    try {
      await userRef.set(
        {
          schools: {
            [SCHOOL_ID]: { role: 'pending', status: 'pending' },
          },
        },
        { merge: true }
      )
      summary.usersUpdated++
    } catch (err) {
      console.error(`  ERRO ao atualizar /users/${uid}: ${err.message}`)
      summary.writeErrors++
    }
  }

  // 4c. Admins — Document ID é email sanitizado, não uid Firebase Auth
  let adminDocs = []
  try {
    const adminSnap = await db.collection('admins').get()
    adminDocs = adminSnap.docs.map((d) => ({ id: d.id, data: d.data() }))
  } catch (err) {
    console.error(`  ERRO ao ler admins/: ${err.message}`)
    summary.readErrors++
  }

  console.log(`  Processando ${adminDocs.length} admin(s)...`)
  for (const { id: docId } of adminDocs) {
    console.warn(
      `  WARN: admins/${docId} — Document ID é email, não uid Firebase Auth. ` +
        `Entrada /users/${docId} criada com email como chave. ` +
        `Conciliar manualmente se necessário.`
    )
    const userRef = db.collection('users').doc(docId)
    try {
      await userRef.set(
        {
          schools: {
            [SCHOOL_ID]: { role: 'admin', status: 'active' },
          },
        },
        { merge: true }
      )
      summary.usersCreated++
    } catch (err) {
      console.error(`  ERRO ao atualizar /users/${docId}: ${err.message}`)
      summary.writeErrors++
    }
  }
}

// ─── Passo 5: resumo final ────────────────────────────────────────────────────

function printSummary() {
  console.log('\n[5/5] Resumo da migração')
  console.log('─'.repeat(52))

  for (const [col, stats] of Object.entries(summary.collections)) {
    console.log(
      `  ${col.padEnd(20)} migrados: ${String(stats.migrated).padStart(4)}   pulados: ${String(stats.skipped).padStart(4)}`
    )
  }

  console.log('─'.repeat(52))
  console.log(`  /users/ criados :  ${summary.usersCreated}`)
  console.log(`  /users/ atualizados: ${summary.usersUpdated}`)
  console.log(`  Erros de leitura:    ${summary.readErrors}`)
  console.log(`  Erros de escrita:    ${summary.writeErrors}`)
  console.log('─'.repeat(52))

  if (summary.readErrors > 0 || summary.writeErrors > 0) {
    console.error(
      `\nMigração concluída com ${summary.readErrors + summary.writeErrors} erro(s). Verifique as mensagens acima.`
    )
    process.exit(1)
  } else {
    console.log('\nMigração concluída com sucesso.')
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Migração single-tenant → multi-tenant ===')
  console.log(`Destino: schools/${SCHOOL_ID}`)

  await migrateSchoolDoc()
  await migrateConfig()
  const collectionData = await migrateCollections()
  await migrateUsers(collectionData)
  printSummary()
}

main().catch((err) => {
  console.error('Falha fatal na migração:', err)
  process.exit(1)
})
