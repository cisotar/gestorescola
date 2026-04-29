/**
 * Seed script: grava os 3 admins iniciais na coleção `admins/` do Firestore.
 *
 * Uso recomendado (JSON inline via Secret Manager):
 *   export SERVICE_ACCOUNT_KEY_JSON=$(gcloud secrets versions access latest \
 *     --secret=FIREBASE_SERVICE_ACCOUNT_KEY --project=saasgestaoescolar)
 *   SERVICE_ACCOUNT_KEY_JSON="$SERVICE_ACCOUNT_KEY_JSON" node scripts/seed-admins.js
 *
 * Uso alternativo (caminho para arquivo JSON em disco):
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/fora/do/projeto/sa.json node scripts/seed-admins.js
 *
 * Uso com emulador local (sem credencial real):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-admins.js
 *
 * Precedência de credenciais:
 *   1. SERVICE_ACCOUNT_KEY_JSON (conteúdo JSON inline — mais seguro)
 *   2. GOOGLE_APPLICATION_CREDENTIALS (caminho para arquivo externo)
 *   3. serviceAccountKey.json na raiz do projeto (legado — não recomendado)
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
    // Produção: resolve credencial por ordem de precedência
    const inlineJson = process.env.SERVICE_ACCOUNT_KEY_JSON
    const envCredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    const keyPath = resolve(__dirname, '../serviceAccountKey.json')

    if (inlineJson) {
      let serviceAccount
      try {
        serviceAccount = JSON.parse(inlineJson)
      } catch (err) {
        console.error(`ERRO: SERVICE_ACCOUNT_KEY_JSON não contém um JSON válido: ${err.message}`)
        process.exit(1)
      }
      initializeApp({ credential: cert(serviceAccount) })
      console.log('Usando credencial de SERVICE_ACCOUNT_KEY_JSON')
    } else if (envCredPath) {
      if (!existsSync(envCredPath)) {
        console.error(`ERRO: arquivo apontado por GOOGLE_APPLICATION_CREDENTIALS não encontrado: ${envCredPath}`)
        process.exit(1)
      }
      initializeApp({ credential: cert(envCredPath) })
      console.log('Usando credencial de GOOGLE_APPLICATION_CREDENTIALS')
    } else if (existsSync(keyPath)) {
      const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))
      initializeApp({ credential: cert(serviceAccount) })
      console.warn('AVISO: usando serviceAccountKey.json em disco (legado). Prefira SERVICE_ACCOUNT_KEY_JSON.')
    } else {
      console.error(
        'ERRO: Credencial não encontrada.\n' +
        'Opções:\n' +
        '  1. Defina SERVICE_ACCOUNT_KEY_JSON com o conteúdo JSON da service account (recomendado).\n' +
        '  2. Defina GOOGLE_APPLICATION_CREDENTIALS com o caminho para o arquivo JSON.\n' +
        '  3. Coloque serviceAccountKey.json na raiz do projeto (legado).\n' +
        '  4. Para emulador local: FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-admins.js'
      )
      process.exit(1)
    }
  }
}

const db = getFirestore()

// ─── emailKey: mesma lógica de src/lib/db.js ──────────────────────────────────

function emailKey(email) {
  return email.toLowerCase()
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
