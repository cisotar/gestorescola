/**
 * Script de migração: copia dados do projeto antigo (gestordesubstituicoes)
 * para a estrutura multi-tenant do projeto novo (saasgestaoescolar).
 *
 * Uso:
 *   node scripts/migrate-to-multitenant.js
 *
 * Requer na raiz do projeto:
 *   serviceAccountKey-old.json  → chave do projeto gestordesubstituicoes (origem)
 *   serviceAccountKey.json      → chave do projeto saasgestaoescolar (destino)
 *
 * Script idempotente — documentos existentes no destino são pulados.
 * Coleções originais nunca são alteradas ou deletadas.
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Inicialização: duas conexões Firebase ────────────────────────────────────

const oldKeyPath = resolve(__dirname, '../serviceAccountKey-old.json')
const newKeyPath = resolve(__dirname, '../serviceAccountKey.json')

if (!existsSync(oldKeyPath)) {
  console.error('ERRO: serviceAccountKey-old.json não encontrado na raiz do projeto.')
  console.error('Baixe a chave do projeto gestordesubstituicoes e coloque como serviceAccountKey-old.json')
  process.exit(1)
}

if (!existsSync(newKeyPath)) {
  console.error('ERRO: serviceAccountKey.json não encontrado na raiz do projeto.')
  process.exit(1)
}

const oldApp = initializeApp({ credential: cert(JSON.parse(readFileSync(oldKeyPath, 'utf8'))) }, 'source')
const newApp = initializeApp({ credential: cert(JSON.parse(readFileSync(newKeyPath, 'utf8'))) }, 'destination')

const srcDb = getFirestore(oldApp)   // leitura: gestordesubstituicoes
const dstDb = getFirestore(newApp)   // escrita:  saasgestaoescolar

console.log('Origem:  gestordesubstituicoes')
console.log('Destino: saasgestaoescolar → schools/sch-default')

// ─── Configuração ─────────────────────────────────────────────────────────────

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

const summary = {
  collections: {},
  usersCreated: 0,
  usersUpdated: 0,
  readErrors: 0,
  writeErrors: 0,
}

// ─── Passo 1: criar /schools/sch-default no destino ───────────────────────────

async function migrateSchoolDoc() {
  console.log('\n[1/5] Verificando schools/sch-default no destino...')
  const ref = dstDb.collection('schools').doc(SCHOOL_ID)
  const snap = await ref.get()

  if (snap.exists) {
    console.log('  schools/sch-default já existe, pulando.')
    return
  }

  await ref.set({
    name: 'Escola Principal',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: 'migration-script',
    plan: 'free',
  })
  console.log('  schools/sch-default criado.')
}

// ─── Passo 2: copiar meta/config da origem → config/main no destino ───────────

async function migrateConfig() {
  console.log('\n[2/5] Migrando meta/config...')

  const destRef = dstDb.collection('schools').doc(SCHOOL_ID).collection('config').doc('main')
  const destSnap = await destRef.get()
  if (destSnap.exists) {
    console.log('  config/main já existe no destino, pulando.')
    return
  }

  const srcSnap = await srcDb.collection('meta').doc('config').get()
  if (!srcSnap.exists) {
    console.warn('  WARN: meta/config não encontrado na origem — config/main não migrado.')
    return
  }

  await destRef.set(srcSnap.data())
  console.log('  meta/config copiado para schools/sch-default/config/main.')
}

// ─── Passo 3: copiar coleções globais da origem para o destino ────────────────

async function migrateCollections() {
  console.log('\n[3/5] Migrando coleções globais...')

  const collectionData = {}

  for (const col of COLLECTIONS) {
    try {
      const snap = await srcDb.collection(col).get()
      collectionData[col] = snap.docs.map((d) => ({ id: d.id, data: d.data() }))
      console.log(`  Lidos ${collectionData[col].length} docs de ${col}`)
    } catch (err) {
      console.error(`  ERRO ao ler ${col}: ${err.message}`)
      summary.readErrors++
      collectionData[col] = []
    }
  }

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
      const destRef = dstDb.collection('schools').doc(SCHOOL_ID).collection(col).doc(id)

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEmailToUidMap(pendingTeachersDocs) {
  const map = {}
  for (const { id, data } of pendingTeachersDocs) {
    if (data.email) map[data.email.toLowerCase()] = id
  }
  return map
}

function deriveRole(profile) {
  if (profile === 'coordinator') return 'coordinator'
  if (profile === 'teacher-coordinator') return 'teacher-coordinator'
  return 'teacher'
}

// ─── Passo 4: popular /users/ no destino ──────────────────────────────────────

async function migrateUsers(collectionData) {
  console.log('\n[4/5] Populando /users/ no destino...')

  const teacherDocs = collectionData['teachers'] ?? []
  const pendingTeacherDocs = collectionData['pending_teachers'] ?? []
  const emailToUid = buildEmailToUidMap(pendingTeacherDocs)

  // Teachers aprovados
  console.log(`  Processando ${teacherDocs.length} teacher(s) aprovado(s)...`)
  for (const { id: docId, data: teacher } of teacherDocs) {
    if (teacher.status !== 'approved') continue
    if (!teacher.email) {
      console.warn(`  WARN: teacher ${docId} sem campo email — pulado.`)
      continue
    }

    const uid = emailToUid[teacher.email.toLowerCase()]
    if (!uid) {
      console.warn(`  WARN: teacher ${teacher.email} sem uid resolvível — pulado.`)
      continue
    }

    const role = deriveRole(teacher.profile)
    try {
      await dstDb.collection('users').doc(uid).set(
        { schools: { [SCHOOL_ID]: { role, status: 'approved' } } },
        { merge: true }
      )
      summary.usersUpdated++
    } catch (err) {
      console.error(`  ERRO ao atualizar /users/${uid}: ${err.message}`)
      summary.writeErrors++
    }
  }

  // Pending teachers
  console.log(`  Processando ${pendingTeacherDocs.length} pending_teacher(s)...`)
  for (const { id: uid, data: pt } of pendingTeacherDocs) {
    if (pt.status !== 'pending') continue
    try {
      await dstDb.collection('users').doc(uid).set(
        { schools: { [SCHOOL_ID]: { role: 'pending', status: 'pending' } } },
        { merge: true }
      )
      summary.usersUpdated++
    } catch (err) {
      console.error(`  ERRO ao atualizar /users/${uid}: ${err.message}`)
      summary.writeErrors++
    }
  }

  // Admins da origem
  let adminDocs = []
  try {
    const adminSnap = await srcDb.collection('admins').get()
    adminDocs = adminSnap.docs.map((d) => ({ id: d.id, data: d.data() }))
  } catch (err) {
    console.error(`  ERRO ao ler admins/: ${err.message}`)
    summary.readErrors++
  }

  console.log(`  Processando ${adminDocs.length} admin(s)...`)
  for (const { id: docId } of adminDocs) {
    console.warn(`  WARN: admins/${docId} — Document ID é email. Conciliar uid manualmente se necessário.`)
    try {
      await dstDb.collection('users').doc(docId).set(
        { schools: { [SCHOOL_ID]: { role: 'admin', status: 'active' } } },
        { merge: true }
      )
      summary.usersCreated++
    } catch (err) {
      console.error(`  ERRO ao atualizar /users/${docId}: ${err.message}`)
      summary.writeErrors++
    }
  }

  // Copiar admins para coleção global /admins/ no destino
  for (const { id: docId, data } of adminDocs) {
    try {
      const destRef = dstDb.collection('admins').doc(docId)
      const destSnap = await destRef.get()
      if (!destSnap.exists) {
        await destRef.set(data)
        console.log(`  Admin ${docId} copiado para /admins/ no destino.`)
      }
    } catch (err) {
      console.error(`  ERRO ao copiar admin ${docId}: ${err.message}`)
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
  console.log(`  /users/ criados:     ${summary.usersCreated}`)
  console.log(`  /users/ atualizados: ${summary.usersUpdated}`)
  console.log(`  Erros de leitura:    ${summary.readErrors}`)
  console.log(`  Erros de escrita:    ${summary.writeErrors}`)
  console.log('─'.repeat(52))

  if (summary.readErrors > 0 || summary.writeErrors > 0) {
    console.error(`\nMigração concluída com ${summary.readErrors + summary.writeErrors} erro(s).`)
    process.exit(1)
  } else {
    console.log('\nMigração concluída com sucesso.')
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Migração single-tenant → multi-tenant ===')

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
