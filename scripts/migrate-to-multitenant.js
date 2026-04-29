/**
 * Script de migração: copia dados do projeto antigo (gestordesubstituicoes)
 * para a estrutura multi-tenant do projeto novo (saasgestaoescolar).
 *
 * Uso (com arquivos em disco — legado):
 *   node scripts/migrate-to-multitenant.js
 *
 * Uso (recomendado — via variáveis de ambiente, sem arquivos em disco):
 *   SA_KEY_OLD_JSON='<conteúdo JSON>' SA_KEY_NEW_JSON='<conteúdo JSON>' \
 *     node scripts/migrate-to-multitenant.js
 *
 *   Alternativamente, via caminhos em variáveis de ambiente:
 *   SA_KEY_OLD_PATH=/caminho/sa-old.json SA_KEY_NEW_PATH=/caminho/sa-new.json \
 *     node scripts/migrate-to-multitenant.js
 *
 * Fallback (arquivos em disco):
 *   serviceAccountKey-old.json  → chave do projeto gestordesubstituicoes (origem)
 *   serviceAccountKey.json      → chave do projeto saasgestaoescolar (destino)
 *
 * Precedência de credenciais (do maior para o menor):
 *   1. SA_KEY_OLD_JSON / SA_KEY_NEW_JSON  (conteúdo JSON direto)
 *   2. SA_KEY_OLD_PATH / SA_KEY_NEW_PATH  (caminho para arquivo externo ao projeto)
 *   3. serviceAccountKey-old.json / serviceAccountKey.json na raiz do projeto (legado)
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

// ─── Helpers de credencial ────────────────────────────────────────────────────

/**
 * Resolve uma service account a partir de variáveis de ambiente ou arquivo em disco.
 * @param {string} envJson  - nome da variável que contém o JSON diretamente
 * @param {string} envPath  - nome da variável que contém o caminho para o arquivo
 * @param {string} fallbackFile - caminho relativo ao projeto usado como último recurso
 * @param {string} label    - rótulo para mensagens de erro
 * @returns {object} credencial parseada como objeto JS
 */
function resolveCredential(envJson, envPath, fallbackFile, label) {
  // 1. Conteúdo JSON direto na variável de ambiente
  if (process.env[envJson]) {
    console.log(`  ${label}: usando ${envJson} (variável de ambiente com JSON)`)
    try {
      return JSON.parse(process.env[envJson])
    } catch (err) {
      console.error(`ERRO: ${envJson} não contém um JSON válido: ${err.message}`)
      process.exit(1)
    }
  }

  // 2. Caminho para arquivo externo na variável de ambiente
  if (process.env[envPath]) {
    const p = process.env[envPath]
    if (!existsSync(p)) {
      console.error(`ERRO: arquivo apontado por ${envPath} não encontrado: ${p}`)
      process.exit(1)
    }
    console.log(`  ${label}: usando ${envPath}=${p}`)
    return JSON.parse(readFileSync(p, 'utf8'))
  }

  // 3. Arquivo em disco na raiz do projeto (legado — não recomendado)
  const fallbackPath = resolve(__dirname, '..', fallbackFile)
  if (!existsSync(fallbackPath)) {
    console.error(`ERRO: credencial para "${label}" não encontrada.`)
    console.error(`  Defina ${envJson} ou ${envPath}, ou coloque o arquivo em: ${fallbackPath}`)
    process.exit(1)
  }
  console.warn(`  AVISO: ${label}: usando arquivo em disco ${fallbackFile} (legado).`)
  console.warn(`  Prefira usar ${envJson} ou ${envPath} para evitar credenciais no diretório do projeto.`)
  return JSON.parse(readFileSync(fallbackPath, 'utf8'))
}

// ─── Inicialização: duas conexões Firebase ────────────────────────────────────

console.log('Resolvendo credenciais...')
const oldCredential = resolveCredential(
  'SA_KEY_OLD_JSON',
  'SA_KEY_OLD_PATH',
  'serviceAccountKey-old.json',
  'origem (gestordesubstituicoes)'
)
const newCredential = resolveCredential(
  'SA_KEY_NEW_JSON',
  'SA_KEY_NEW_PATH',
  'serviceAccountKey.json',
  'destino (saasgestaoescolar)'
)

const oldApp = initializeApp({ credential: cert(oldCredential) }, 'source')
const newApp = initializeApp({ credential: cert(newCredential) }, 'destination')

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
