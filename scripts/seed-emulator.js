#!/usr/bin/env node
/**
 * scripts/seed-emulator.js
 *
 * Popula os Firebase Emulators (Auth + Firestore) com dados base para os
 * testes E2E. Idempotente: limpa tudo antes de re-popular.
 *
 * Pré-requisito: emulators rodando em localhost (auth:9099, firestore:8080).
 * Variáveis de ambiente:
 *   FIREBASE_PROJECT_ID            (default: saasgestaoescolar-test)
 *   FIREBASE_AUTH_EMULATOR_HOST    (default: localhost:9099)
 *   FIRESTORE_EMULATOR_HOST        (default: localhost:8080)
 *
 * Uso:
 *   node scripts/seed-emulator.js
 *
 * O que cria:
 *   - 6 usuários no Auth Emulator (admin, coord, teacher, teacher-coord, pending, removed)
 *   - schools/sch-test-001 + meta/config (segments, areas, subjects, sharedSeries)
 *   - schools/sch-test-001/teachers/{uid}  para admin/coord/teacher/teacher-coord
 *   - schools/sch-test-001/pending_teachers/{uid-pending}
 *   - admins/{sanitized-email} para o admin
 *   - NÃO cria nada para uid-removed (simula remoção)
 */

import admin from 'firebase-admin'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// === Defaults para conexão com o emulator ===
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'saasgestaoescolar-test'
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099'
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080'
process.env.GCLOUD_PROJECT = PROJECT_ID

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST

// Inicializa Admin SDK uma única vez (re-execuções no mesmo processo são no-op).
if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID })
}
const auth = admin.auth()
const db = admin.firestore()

// === Carrega fixtures ===
const usuariosFixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'e2e', 'fixtures', 'usuarios-teste.json'), 'utf8'),
)
const escolaFixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'e2e', 'fixtures', 'escola-seed.json'), 'utf8'),
)

const SCHOOL_ID = usuariosFixture.schoolId || 'sch-test-001'

function sanitizeEmail(email) {
  // Mesma estratégia usada no resto do projeto: substituir caracteres não-doc-id-safe.
  return email.replace(/[.#$/\[\]]/g, '_')
}

/**
 * Reseta totalmente o emulator (Auth + Firestore) via REST.
 * Funciona em qualquer estado (vazio ou populado).
 */
export async function resetEmulator() {
  const firestoreUrl = `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`
  const authUrl = `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`

  const [firestoreRes, authRes] = await Promise.all([
    fetch(firestoreUrl, { method: 'DELETE' }),
    fetch(authUrl, { method: 'DELETE' }),
  ])

  if (!firestoreRes.ok && firestoreRes.status !== 200) {
    throw new Error(`Falha ao resetar Firestore emulator: HTTP ${firestoreRes.status}`)
  }
  if (!authRes.ok && authRes.status !== 200) {
    throw new Error(`Falha ao resetar Auth emulator: HTTP ${authRes.status}`)
  }
}

/**
 * Cria usuários no Auth Emulator. Idempotente:
 * se o uid já existir, faz update; caso contrário, cria.
 */
async function seedAuthUsers(usuarios) {
  for (const u of usuarios) {
    const userRecord = {
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      emailVerified: true,
    }
    try {
      await auth.createUser(userRecord)
    } catch (err) {
      if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
        await auth.updateUser(u.uid, {
          email: u.email,
          displayName: u.displayName,
          emailVerified: true,
        })
      } else {
        throw err
      }
    }
  }
}

/**
 * Cria docs Firestore: school + meta/config + teachers + pending_teachers + admins.
 * Usa WriteBatch (até 500 ops) para performance.
 */
async function seedFirestore(usuarios, escola) {
  const batch = db.batch()

  // 1) schools/sch-test-001
  const schoolRef = db.doc(`schools/${SCHOOL_ID}`)
  batch.set(schoolRef, {
    id: SCHOOL_ID,
    name: escola.school?.name || 'Escola Teste',
    slug: escola.school?.slug || 'escola-teste',
    adminEmail: escola.school?.adminEmail || 'admin@test-escola.com',
    status: escola.school?.status || 'active',
    plan: escola.school?.plan || 'trial',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  // 2) schools/{id}/meta/config — config completa (segments/periods/areas/subjects/sharedSeries)
  const configRef = db.doc(`schools/${SCHOOL_ID}/meta/config`)
  batch.set(configRef, {
    segments: escola.config?.segments || [],
    periodConfigs: escola.config?.periodConfigs || {},
    areas: escola.config?.areas || [],
    subjects: escola.config?.subjects || [],
    sharedSeries: escola.config?.sharedSeries || [],
    workloadWarn: escola.config?.workloadWarn ?? 20,
    workloadDanger: escola.config?.workloadDanger ?? 26,
  })

  // 3) teachers/{uid} para admin, coord, teacher, teacher-coord (status approved)
  const approvedRoles = new Set(['admin', 'coordinator', 'teacher', 'teacher-coordinator'])
  for (const u of usuarios) {
    if (!approvedRoles.has(u.role)) continue
    const teacherRef = db.doc(`schools/${SCHOOL_ID}/teachers/${u.uid}`)
    batch.set(teacherRef, {
      id: u.uid,
      uid: u.uid,
      name: u.displayName,
      email: u.email,
      profile: u.profile || (u.role === 'admin' ? 'coordinator' : u.role),
      subjectIds: [],
      status: 'approved',
      celular: '',
      whatsapp: '',
      apelido: '',
    })
  }

  // 4) pending_teachers/{uid-pending}
  const pending = usuarios.find((u) => u.role === 'pending')
  if (pending) {
    const pendingRef = db.doc(`schools/${SCHOOL_ID}/pending_teachers/${pending.uid}`)
    batch.set(pendingRef, {
      id: pending.uid,
      uid: pending.uid,
      email: pending.email,
      name: pending.displayName,
      status: 'pending',
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      photoURL: null,
      celular: '',
      apelido: '',
      subjectIds: [],
    })
  }

  // 5) admins/{sanitized-email} para o admin (índice global de admins)
  const adminUser = usuarios.find((u) => u.role === 'admin')
  if (adminUser) {
    const adminRef = db.doc(`admins/${sanitizeEmail(adminUser.email)}`)
    batch.set(adminRef, {
      email: adminUser.email,
      uid: adminUser.uid,
      schoolId: SCHOOL_ID,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }

  // 6) users/{uid} — índice reverso necessário para useSchoolStore.fetchAvailableSchools
  //    e para useAuthStore._resolveRole (lê schools[schoolId].role).
  for (const u of usuarios) {
    if (!approvedRoles.has(u.role)) continue
    const userRef = db.doc(`users/${u.uid}`)
    batch.set(userRef, {
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      schools: {
        [SCHOOL_ID]: {
          role: u.role,
          status: 'approved',
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
    })
  }

  // 7) NADA é criado para uid-removed (intencional — simula usuário removido)

  await batch.commit()
}

/**
 * Função pública: idempotente, faz reset + seed.
 */
export async function seedAll() {
  const t0 = Date.now()
  await resetEmulator()
  await seedAuthUsers(usuariosFixture.usuarios)
  await seedFirestore(usuariosFixture.usuarios, escolaFixture)
  const dt = Date.now() - t0
  return { schoolId: SCHOOL_ID, users: usuariosFixture.usuarios.length, durationMs: dt }
}

/**
 * Gera custom tokens (Admin SDK) para todos os usuários do seed.
 * Retornado como mapa { email -> token }.
 */
export async function generateCustomTokens() {
  const tokens = {}
  for (const u of usuariosFixture.usuarios) {
    tokens[u.email] = await auth.createCustomToken(u.uid, {
      schoolId: SCHOOL_ID,
      role: u.role,
    })
  }
  return tokens
}

// Execução direta via CLI
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  seedAll()
    .then((result) => {
      console.log('[seed-emulator] OK:', result)
      process.exit(0)
    })
    .catch((err) => {
      console.error('[seed-emulator] FALHA:', err)
      process.exit(1)
    })
}
