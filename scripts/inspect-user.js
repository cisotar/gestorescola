/**
 * Inspeciona o estado de um usuário pelo email no Firestore.
 * Uso: node scripts/inspect-user.js <email>
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const email = process.argv[2]
if (!email) { console.error('Uso: node scripts/inspect-user.js <email>'); process.exit(1) }

if (!getApps().length) {
  const keyPath = resolve(__dirname, '..', 'serviceAccountKey.json')
  initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) })
}
const db = getFirestore()

async function run() {
  console.log(`Inspecionando: ${email}\n`)

  // 1. users/{uid} where email == EMAIL
  const usersSnap = await db.collection('users').where('email', '==', email).get()
  console.log(`users docs com email=${email}: ${usersSnap.size}`)
  for (const d of usersSnap.docs) {
    console.log(`  uid: ${d.id}`)
    console.log(`  data:`, JSON.stringify(d.data(), null, 2))
  }

  // 2. Iterar todas as escolas e procurar
  const schoolsSnap = await db.collection('schools').get()
  console.log(`\nEscolas no projeto: ${schoolsSnap.size}`)
  for (const school of schoolsSnap.docs) {
    const sid = school.id
    console.log(`\n--- ${sid} (${school.data().name || ''}) ---`)

    // teachers
    const tSnap = await db.collection(`schools/${sid}/teachers`).where('email', '==', email).get()
    console.log(`  teachers: ${tSnap.size}`)
    for (const t of tSnap.docs) console.log(`    id=${t.id}, name=${t.data().name}`)

    // pending_teachers — não é por email mas vamos procurar todos
    if (usersSnap.size > 0) {
      for (const u of usersSnap.docs) {
        const pSnap = await db.doc(`schools/${sid}/pending_teachers/${u.id}`).get()
        if (pSnap.exists) console.log(`  pending_teachers/${u.id}: EXISTE`, JSON.stringify(pSnap.data()))

        const rSnap = await db.doc(`schools/${sid}/removed_users/${u.id}`).get()
        if (rSnap.exists) console.log(`  removed_users/${u.id}: EXISTE`, JSON.stringify(rSnap.data()))

        // Email-key fallback marker
        const emailKey = `email_${email.replace(/[^a-z0-9._-]/g, '_')}`
        const rEmailSnap = await db.doc(`schools/${sid}/removed_users/${emailKey}`).get()
        if (rEmailSnap.exists) console.log(`  removed_users/${emailKey}: EXISTE`, JSON.stringify(rEmailSnap.data()))
      }
    }
  }
}

run().catch(e => { console.error(e); process.exit(1) })
