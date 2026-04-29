import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const uid = process.argv[2]
if (!uid) { console.error('Uso: node scripts/inspect-uid.js <uid>'); process.exit(1) }

if (!getApps().length) {
  const keyPath = resolve(__dirname, '..', 'serviceAccountKey.json')
  initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) })
}
const db = getFirestore()

async function run() {
  console.log(`UID: ${uid}\n`)
  const userSnap = await db.doc(`users/${uid}`).get()
  console.log('users/{uid} exists?', userSnap.exists)
  if (userSnap.exists) console.log('data:', JSON.stringify(userSnap.data(), null, 2))

  const schoolsSnap = await db.collection('schools').get()
  for (const s of schoolsSnap.docs) {
    const r = await db.doc(`schools/${s.id}/removed_users/${uid}`).get()
    if (r.exists) console.log(`removed_users in ${s.id}:`, JSON.stringify(r.data()))
    const p = await db.doc(`schools/${s.id}/pending_teachers/${uid}`).get()
    if (p.exists) console.log(`pending_teachers in ${s.id}:`, JSON.stringify(p.data()))
  }
}
run().catch(e => { console.error(e); process.exit(1) })
