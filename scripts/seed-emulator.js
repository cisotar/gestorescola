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
 *     com subjectIds populados conforme fixture (necessário para rankCandidates)
 *   - schools/sch-test-001/schedules/{id}  grade horária da segunda (cenários 1, 4, 5)
 *   - schools/sch-test-001/absences/{id}   ausência pré-coberta (cenário 2)
 *   - schools/sch-test-001/pending_teachers/{uid-pending}
 *   - schools/sch-test-001/removed_users/{uid-removed}  marcador de remoção (cenário 7)
 *   - schools/sch-test-002                 segunda escola ativa (cenário 9)
 *   - admins/{sanitized-email} para o admin (e p/ saas admin global)
 *   - NÃO cria teachers/{uid-removed} (simula remoção; usa removed_users marker)
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
  const teacherSubjects = escola.teacherSubjects || {}
  for (const u of usuarios) {
    if (!approvedRoles.has(u.role)) continue
    const teacherRef = db.doc(`schools/${SCHOOL_ID}/teachers/${u.uid}`)
    batch.set(teacherRef, {
      id: u.uid,
      uid: u.uid,
      name: u.displayName,
      email: u.email,
      profile: u.profile || (u.role === 'admin' ? 'coordinator' : u.role),
      subjectIds: teacherSubjects[u.uid] || [],
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

  // 7) schedules/{id} — grade horária (cenários 1, 4, 5)
  //    Schema validado em src/store/useAppStore.js (addSchedule) e
  //    src/pages/CalendarDayPage.jsx (filtra por teacherId + day + timeSlot).
  //    timeSlot = `${segId}|${turno}|${aulaIdx}` (ver src/lib/periods/index.js).
  const schedules = escola.schedules || []
  for (const sc of schedules) {
    const scheduleRef = db.doc(`schools/${SCHOOL_ID}/schedules/${sc.id}`)
    batch.set(scheduleRef, {
      id: sc.id,
      teacherId: sc.teacherUidRef, // teacherId === uid (mesma estratégia do seed atual)
      day: sc.day,
      timeSlot: sc.timeSlot,
      subjectId: sc.subjectId,
      turma: sc.turma,
    })
  }

  // 8) absences/{id} — uma ausência pré-coberta (cenário 2: remover substituto)
  //    Schema: { teacherId, slots: [{ id, date, timeSlot, scheduleId, turma, subjectId, substituteId }] }
  //    Para cobrir cenário 2 sem depender da data corrente, criamos com data
  //    da segunda-feira da semana atual (calculada em runtime).
  const teacherUid = usuarios.find((u) => u.role === 'teacher')?.uid
  const subUid = usuarios.find((u) => u.role === 'teacher-coordinator')?.uid
  if (teacherUid && subUid && schedules.length > 0) {
    const monday = isoMondayOfCurrentWeek()
    const firstSched = schedules.find((s) => s.teacherUidRef === teacherUid && s.day === 'Segunda')
    if (firstSched) {
      const absRef = db.doc(`schools/${SCHOOL_ID}/absences/abs-seed-001`)
      batch.set(absRef, {
        id: 'abs-seed-001',
        teacherId: teacherUid,
        status: 'covered',
        slots: [
          {
            id: 'slot-seed-001',
            date: monday,
            timeSlot: firstSched.timeSlot,
            scheduleId: firstSched.id,
            turma: firstSched.turma,
            subjectId: firstSched.subjectId,
            substituteId: subUid,
          },
        ],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
  }

  // 9) removed_users/{uid-removed} — marcador de remoção (cenário 7).
  //    Schema validado em functions/src/index.ts (removeTeacherFromSchool ~linha 1023).
  const removedUser = usuarios.find((u) => u.role === 'removed')
  if (removedUser) {
    const removedRef = db.doc(`schools/${SCHOOL_ID}/removed_users/${removedUser.uid}`)
    batch.set(removedRef, {
      uid: removedUser.uid,
      email: removedUser.email,
      teacherId: removedUser.uid,
      removedAt: admin.firestore.FieldValue.serverTimestamp(),
      removedBy: 'uid-admin',
      removedByEmail: 'admin@test-escola.com',
    })
    // Também grava users/{uid-removed} com removedFrom contendo o schoolId,
    // para que o boot detecte a revogação no próximo login (RN-R1).
    const removedUserDocRef = db.doc(`users/${removedUser.uid}`)
    batch.set(removedUserDocRef, {
      uid: removedUser.uid,
      email: removedUser.email,
      displayName: removedUser.displayName,
      schools: {},
      removedFrom: [SCHOOL_ID],
    })
  }

  // 10) Segunda escola (sch-test-002) — cenário 9 (suspensão de escola).
  if (escola.secondSchool) {
    const s2 = escola.secondSchool
    const school2Ref = db.doc(`schools/${s2.id}`)
    batch.set(school2Ref, {
      id: s2.id,
      name: s2.name,
      slug: s2.slug,
      adminEmail: s2.adminEmail,
      status: s2.status || 'active',
      plan: s2.plan || 'trial',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    // Config mínima (mesma da escola 1 — reaproveita arrays para evitar
    // "Nenhum segmento configurado" em telas que dependem de meta/config).
    const config2Ref = db.doc(`schools/${s2.id}/meta/config`)
    batch.set(config2Ref, {
      segments: escola.config?.segments || [],
      periodConfigs: escola.config?.periodConfigs || {},
      areas: escola.config?.areas || [],
      subjects: escola.config?.subjects || [],
      sharedSeries: escola.config?.sharedSeries || [],
      workloadWarn: 20,
      workloadDanger: 26,
    })
    // teacher-coordinator também é membro da escola 2 (cenário 9 precisa de
    // pelo menos 1 membro para validar bloqueio de acesso após suspensão).
    if (subUid) {
      const memberRef = db.doc(`schools/${s2.id}/teachers/${subUid}`)
      batch.set(memberRef, {
        id: subUid,
        uid: subUid,
        name: 'Prof-Coord Teste',
        email: 'prof-coord@test-escola.com',
        profile: 'teacher',
        subjectIds: ['subj-port'],
        status: 'approved',
        celular: '',
        whatsapp: '',
        apelido: '',
      })
      // Atualizar users/{subUid}.schools para incluir a 2ª escola.
      // Como essa escrita pode colidir com a do bloco (6), usamos merge.
      const userRef = db.doc(`users/${subUid}`)
      batch.set(
        userRef,
        {
          schools: {
            [s2.id]: {
              role: 'teacher',
              status: 'approved',
              joinedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
        },
        { merge: true },
      )
    }
  }

  // 11) SaaS admin global — em /admins/, document ID = email lowercase.
  //     O admin@test-escola.com já está em /admins/ via bloco (5); aqui
  //     adicionamos um SaaS admin dedicado para cenários que precisam
  //     diferenciar SaaS admin de admin de escola (caso necessário).
  //     Por ora reutilizamos o admin principal — o doc do bloco (5) já
  //     atende isSaasAdmin() (rules: existe doc em /admins/{email lowercase}).
  //     Se um teste futuro precisar de um SaaS admin sem vínculo com escola,
  //     basta adicionar usuário 'saas-admin' em usuarios-teste.json.

  await batch.commit()
}

/**
 * Retorna a segunda-feira (ISO yyyy-mm-dd) da semana corrente.
 * Usado para criar absences cuja data cai no calendário ativo.
 */
function isoMondayOfCurrentWeek() {
  const d = new Date()
  const dow = d.getDay() // 0=dom, 1=seg, ...
  const diff = (dow === 0 ? -6 : 1 - dow)
  d.setDate(d.getDate() + diff)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
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
