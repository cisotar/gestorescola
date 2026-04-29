/**
 * Remove uma entry específica de users/{uid}.schools[schoolId] quando ela está
 * com status rejected — útil para limpar registro de cliente legítimo que
 * acabou rejeitado por engano.
 *
 * Uso: node scripts/remove-rejected-entry.js <uid> <schoolId>
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const [uid, schoolId] = process.argv.slice(2)
if (!uid || !schoolId) {
  console.error('Uso: node scripts/remove-rejected-entry.js <uid> <schoolId>')
  process.exit(1)
}

if (!getApps().length) {
  const keyPath = resolve(__dirname, '..', 'serviceAccountKey.json')
  initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) })
}
const db = getFirestore()

async function run() {
  const ref = db.doc(`users/${uid}`)
  const snap = await ref.get()
  if (!snap.exists) { console.log('users/{uid} não existe.'); return }
  const data = snap.data() ?? {}
  const entry = data.schools?.[schoolId]
  if (!entry) { console.log(`Entry ${schoolId} não existe em users/${uid}.schools.`); return }

  console.log('Entry atual:', JSON.stringify(entry))
  if (entry.status !== 'rejected' && entry.role !== 'rejected') {
    console.log('Entry NÃO está com status rejected. Abortando para segurança.')
    return
  }

  await ref.update({ [`schools.${schoolId}`]: FieldValue.delete() })
  console.log(`Entry schools.${schoolId} removida.`)
}
run().catch(e => { console.error(e); process.exit(1) })
