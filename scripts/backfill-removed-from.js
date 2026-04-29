/**
 * Backfill do índice users/{uid}.removedFrom para usuários removidos antes
 * do deploy do índice invertido (issue #483/#484).
 *
 * Uso:
 *   node scripts/backfill-removed-from.js [--dry-run]
 *
 * O que faz:
 *  - Itera collectionGroup('removed_users') em todas as escolas
 *  - Para cada doc cujo id é um uid (não começa com "email_"):
 *    - users/{uid}.removedFrom: arrayUnion(schoolId)  via merge
 *  - Idempotente: arrayUnion não duplica
 *
 * Bypassa rules via Admin SDK.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')
const BATCH_SIZE = 400

if (!getApps().length) {
  const keyPath = resolve(__dirname, '..', 'serviceAccountKey.json')
  if (!existsSync(keyPath)) {
    console.error('serviceAccountKey.json não encontrado em', keyPath)
    process.exit(1)
  }
  initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) })
}

const db = getFirestore()

async function run() {
  console.log(DRY_RUN ? '[DRY-RUN] ' : '', 'Iniciando backfill de removedFrom…')

  const snap = await db.collectionGroup('removed_users').get()
  console.log(`Total de documentos em removed_users: ${snap.size}`)

  let processed = 0
  let skipped = 0
  let errors = 0
  const samples = []
  let batch = db.batch()
  let opsInBatch = 0

  for (const doc of snap.docs) {
    const uid = doc.id
    const parent = doc.ref.parent.parent
    if (!parent) { skipped++; continue }
    if (uid.startsWith('email_')) { skipped++; continue }
    const schoolId = parent.id

    if (samples.length < 5) samples.push({ uid, schoolId })

    if (!DRY_RUN) {
      batch.set(
        db.doc(`users/${uid}`),
        { removedFrom: FieldValue.arrayUnion(schoolId) },
        { merge: true }
      )
      opsInBatch++
      if (opsInBatch >= BATCH_SIZE) {
        try {
          await batch.commit()
        } catch (e) {
          console.error('Erro no commit do batch:', e.message)
          errors += opsInBatch
        }
        batch = db.batch()
        opsInBatch = 0
      }
    }
    processed++
  }

  if (!DRY_RUN && opsInBatch > 0) {
    try {
      await batch.commit()
    } catch (e) {
      console.error('Erro no commit final:', e.message)
      errors += opsInBatch
    }
  }

  console.log('\n--- Resultado ---')
  console.log('Processados:', processed)
  console.log('Pulados (email_ ou sem parent):', skipped)
  console.log('Erros:', errors)
  console.log('Amostra:', samples)
  console.log(DRY_RUN ? '\n(DRY-RUN: nada foi gravado)' : '\nBackfill concluído.')
}

run().catch(e => {
  console.error('FALHA:', e)
  process.exit(1)
})
