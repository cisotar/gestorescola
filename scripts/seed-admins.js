/**
 * Seed script: grava os 3 admins iniciais na coleção `admins/` do Firestore.
 *
 * Uso em produção (requer serviceAccountKey.json ou GOOGLE_APPLICATION_CREDENTIALS):
 *   node scripts/seed-admins.js
 *
 * Uso com emulador local:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-admins.js
 *
 * Instalação da dependência (dev only):
 *   npm install --save-dev firebase-admin
 *
 * Nota: setDoc é idempotente — executar o script duas vezes sobrescreve o doc
 * existente sem duplicar. Seguro para re-execução.
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
    // Com emulador: não precisa de credencial real
    initializeApp({ projectId: 'gestorescola' })
    console.log(`Usando emulador Firestore em: ${emulatorHost}`)
  } else {
    // Produção: requer serviceAccountKey.json ou GOOGLE_APPLICATION_CREDENTIALS
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
        '  3. Para emulador local: FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-admins.js'
      )
      process.exit(1)
    }
  }
}

const db = getFirestore()

// ─── emailKey: mesma lógica de src/lib/db.js ──────────────────────────────────

function emailKey(email) {
  return email.toLowerCase().replace(/[.#$/[\]]/g, '_')
}

// ─── Admins a serem seedados ───────────────────────────────────────────────────

const ADMINS = [
  { email: 'contato.tarciso@gmail.com', name: 'Tarciso' },
  { email: 'tarciso@prof.educacao.sp.gov.br', name: 'Tarciso Prof' },
  { email: 'fernandamarquesi@prof.educacao.sp.gov.br', name: 'Fernanda Marquesi' },
]

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seedAdmins() {
  console.log(`\nSeedando ${ADMINS.length} admins na coleção 'admins/'...\n`)

  for (const admin of ADMINS) {
    const id = emailKey(admin.email)
    const ref = db.collection('admins').doc(id)
    await ref.set({
      email: admin.email.toLowerCase(),
      name: admin.name,
      addedAt: FieldValue.serverTimestamp(),
    })
    console.log(`  OK  ${id}  (${admin.email})`)
  }

  console.log('\nSeed concluido. Verifique os documentos no Firebase Console ou Emulator UI.')
}

seedAdmins().catch((err) => {
  console.error('Falha no seed:', err)
  process.exit(1)
})
