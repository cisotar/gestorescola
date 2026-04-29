/**
 * CLI: cria uma nova escola no Firestore via Admin SDK.
 *
 * Cria atomicamente (em transação):
 *   - schools/{schoolId}                 → metadados da escola
 *   - schools/{schoolId}/config/main     → documento de config vazio
 *   - school_slugs/{slug}                → índice reverso { schoolId }
 *
 * Uso recomendado (JSON inline via Secret Manager):
 *   export SERVICE_ACCOUNT_KEY_JSON=$(gcloud secrets versions access latest \
 *     --secret=FIREBASE_SERVICE_ACCOUNT_KEY --project=saasgestaoescolar)
 *   SERVICE_ACCOUNT_KEY_JSON="$SERVICE_ACCOUNT_KEY_JSON" node scripts/createSchool.js \
 *     --slug=colegio-x --admin=admin@colegio.com
 *
 * Uso alternativo (caminho para arquivo JSON em disco):
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/fora/do/projeto/sa.json \
 *     node scripts/createSchool.js --slug=colegio-x --admin=admin@colegio.com
 *
 * Uso com emulador local (sem credencial real):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/createSchool.js \
 *     --slug=teste --admin=t@t.com
 *
 * Precedência de credenciais:
 *   1. SERVICE_ACCOUNT_KEY_JSON (conteúdo JSON inline — mais seguro)
 *   2. GOOGLE_APPLICATION_CREDENTIALS (caminho para arquivo externo)
 *   3. serviceAccountKey.json na raiz do projeto (legado — não recomendado)
 *
 * Override do host do link de convite (default: https://saasgestaoescolar.web.app):
 *   JOIN_BASE_URL=https://staging.example.com node scripts/createSchool.js ...
 *
 * Flags:
 *   --slug=<slug>        identificador legível, regex ^[a-z0-9-]+$, único.
 *   --admin=<email>      email do futuro admin local (gravado em lowercase).
 *
 * Saída em sucesso (exit 0):
 *   OK  schoolId: sch-<slug>
 *   OK  Link de convite: <JOIN_BASE_URL>/join/<slug>
 *
 * Falhas (exit 1): slug/email inválidos, slug já em uso, schoolId colidindo,
 * credencial ausente, ou erro de rede/Firestore.
 *
 * Observação: o script NÃO é idempotente — re-execução com o mesmo slug falha
 * intencionalmente (a unicidade do slug é a invariante).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Parser de flags (--key=value e --key value) ──────────────────────────────

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const eq = arg.indexOf('=')
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1)
    } else {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        out[key] = next
        i++
      } else {
        out[key] = true
      }
    }
  }
  return out
}

function printUsageAndExit() {
  console.error(
    'Uso: node scripts/createSchool.js --slug=<slug> --admin=<email>\n' +
    '  --slug   identificador (regex ^[a-z0-9-]+$)\n' +
    '  --admin  email do admin local'
  )
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))

const slug = typeof args.slug === 'string' ? args.slug.trim() : ''
const adminEmail = typeof args.admin === 'string' ? args.admin.trim() : ''

if (!slug || !adminEmail) {
  console.error('ERRO: --slug e --admin são obrigatórios.')
  printUsageAndExit()
}

const SLUG_REGEX = /^[a-z0-9-]+$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

if (!SLUG_REGEX.test(slug)) {
  console.error(`ERRO: slug deve casar /^[a-z0-9-]+$/  (recebido: '${slug}')`)
  process.exit(1)
}

if (!EMAIL_REGEX.test(adminEmail)) {
  console.error(`ERRO: --admin deve ser um email válido (recebido: '${adminEmail}')`)
  process.exit(1)
}

// ─── Inicialização do Firebase Admin ──────────────────────────────────────────

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST

if (!getApps().length) {
  if (emulatorHost) {
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
        '  4. Para emulador local: FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/createSchool.js ...'
      )
      process.exit(1)
    }
  }
}

const db = getFirestore()

// ─── Criação atômica via runTransaction ───────────────────────────────────────

const schoolId = `sch-${slug}`
const adminEmailLower = adminEmail.toLowerCase()
const joinBaseUrl = process.env.JOIN_BASE_URL || 'https://saasgestaoescolar.web.app'

async function createSchool() {
  const slugRef = db.collection('school_slugs').doc(slug)
  const schoolRef = db.collection('schools').doc(schoolId)
  const configRef = schoolRef.collection('config').doc('main')

  await db.runTransaction(async (tx) => {
    const slugSnap = await tx.get(slugRef)
    if (slugSnap.exists) {
      const existing = slugSnap.data()?.schoolId ?? '<desconhecido>'
      throw new Error(`slug '${slug}' já está em uso pela escola ${existing}`)
    }

    const schoolSnap = await tx.get(schoolRef)
    if (schoolSnap.exists) {
      throw new Error(
        `schoolId '${schoolId}' já existe (inconsistência: slug livre mas escola já gravada). Aborte.`
      )
    }

    tx.set(schoolRef, {
      slug,
      adminEmail: adminEmailLower,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'cli',
      deletedAt: null,
    })

    tx.set(configRef, {})

    tx.set(slugRef, { schoolId })
  })

  console.log(`OK  schoolId: ${schoolId}`)
  console.log(`OK  Link de convite: ${joinBaseUrl}/join/${slug}`)
}

createSchool().catch((err) => {
  console.error(`ERRO: ${err.message}`)
  if (process.env.DEBUG) console.error(err.stack)
  process.exit(1)
})
