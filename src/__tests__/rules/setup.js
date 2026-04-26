import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Inicializa o ambiente de testes contra o emulador Firestore.
 * Retorna o TestEnvironment limpo (sem seed).
 * Os testes individuais devem chamar seedDefaultData(env) conforme necessário.
 */
export async function createTestEnv() {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')
  const env = await initializeTestEnvironment({
    projectId: 'gestordesubstituicoes-test',
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  })
  return env
}

/**
 * Retorna contexto Firestore autenticado com claims de admin.
 * O documento admins/{email} deve existir no emulador para isAdmin() retornar true.
 */
export function asAdmin(env) {
  const email = process.env.TEST_ADMIN_EMAIL ?? 'test-admin@test.com'
  const ctx = env.authenticatedContext('admin-uid', {
    email,
    email_verified: true,
  })
  return ctx.firestore()
}

/**
 * Retorna contexto Firestore autenticado como teacher aprovado.
 */
export function asTeacher(env, uid = 'teacher-uid-123', email = 'test-teacher@test.com') {
  const ctx = env.authenticatedContext(uid, {
    email,
    email_verified: true,
  })
  return ctx.firestore()
}

/**
 * Retorna contexto Firestore autenticado como usuário pendente (sem documento em teachers/).
 */
export function asPending(env, uid = 'pending-uid') {
  const ctx = env.authenticatedContext(uid, {
    email: 'pending@test.com',
    email_verified: true,
  })
  return ctx.firestore()
}

/**
 * Retorna contexto Firestore não autenticado.
 */
export function asAnonymous(env) {
  const ctx = env.unauthenticatedContext()
  return ctx.firestore()
}

/**
 * Faz seed dos documentos padrão necessários para os helpers asAdmin e asTeacher.
 * Deve ser chamado dentro de beforeAll/beforeEach pelos testes que precisam de dados.
 */
export async function seedDefaultData(env) {
  const adminEmail = process.env.TEST_ADMIN_EMAIL ?? 'test-admin@test.com'
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await db.doc(`admins/${adminEmail}`).set({
      email: adminEmail,
      name: 'Test Admin',
    })
    await db.doc('teachers/teacher-uid-123').set({
      id: 'teacher-uid-123',
      email: 'test-teacher@test.com',
      name: 'Test Teacher',
      status: 'approved',
      profile: 'teacher',
    })
  })
}

// ── Helpers multi-tenant ─────────────────────────────────────────────────────

/**
 * Retorna contexto Firestore autenticado como super-admin SaaS.
 * O documento admins/{email} é criado pelo seedMultitenantData ou seedDefaultData.
 */
export function asSaasAdmin(env) {
  const email = 'saas-admin@test.com'
  const ctx = env.authenticatedContext('saas-admin-uid', {
    email,
    email_verified: true,
  })
  return ctx.firestore()
}

/**
 * Retorna contexto Firestore autenticado como membro aprovado de uma escola.
 *
 * @param {object} env - TestEnvironment
 * @param {string} schoolId - ID da escola (ex: 'sch-a')
 * @param {string} uid - UID do usuário
 * @param {string} email - Email do usuário
 * @param {'admin'|'coordinator'|'teacher-coordinator'|'teacher'} role - Role na escola
 */
export function asMemberOf(
  env,
  schoolId,
  uid = 'member-uid',
  email = 'member@test.com',
  role = 'teacher',
) {
  const ctx = env.authenticatedContext(uid, {
    email,
    email_verified: true,
  })
  return ctx.firestore()
}

/**
 * Faz seed dos documentos necessários para os testes multi-tenant.
 * Cria:
 *   - admins/saas-admin@test.com (super-admin SaaS)
 *   - users/admin-uid-school (admin da escola schoolId, status approved)
 *   - users/teacher-uid-school (teacher da escola schoolId, status approved)
 *   - users/teacher-uid-other (teacher da escola otherSchoolId, status approved)
 *   - users/pending-uid-school (usuário pendente da escola schoolId)
 *   - schools/{schoolId}/teachers/teacher-uid-school (perfil do teacher)
 *   - schools/{schoolId}/config/main (configuração básica)
 *
 * @param {object} env - TestEnvironment
 * @param {string} schoolId - ID da escola principal (ex: 'sch-a')
 * @param {string} otherSchoolId - ID de outra escola para testes de isolamento (ex: 'sch-b')
 */
export async function seedMultitenantData(env, schoolId = 'sch-a', otherSchoolId = 'sch-b') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()

    // Super-admin SaaS
    await db.doc('admins/saas-admin@test.com').set({
      email: 'saas-admin@test.com',
      name: 'SaaS Admin',
    })

    // Admin da escola principal
    await db.doc('users/admin-uid-school').set({
      uid: 'admin-uid-school',
      email: 'admin-school@test.com',
      name: 'School Admin',
      schools: {
        [schoolId]: { role: 'admin', status: 'approved' },
      },
    })

    // Teacher aprovado na escola principal
    await db.doc('users/teacher-uid-school').set({
      uid: 'teacher-uid-school',
      email: 'teacher-school@test.com',
      name: 'School Teacher',
      schools: {
        [schoolId]: { role: 'teacher', status: 'approved' },
      },
    })

    // Teacher aprovado na OUTRA escola (para teste de isolamento cross-tenant)
    await db.doc('users/teacher-uid-other').set({
      uid: 'teacher-uid-other',
      email: 'teacher-other@test.com',
      name: 'Other School Teacher',
      schools: {
        [otherSchoolId]: { role: 'teacher', status: 'approved' },
      },
    })

    // Usuário pendente na escola principal
    await db.doc('users/pending-uid-school').set({
      uid: 'pending-uid-school',
      email: 'pending-school@test.com',
      name: 'Pending User',
      schools: {
        [schoolId]: { role: 'teacher', status: 'pending' },
      },
    })

    // Documento raiz da escola principal
    await db.doc(`schools/${schoolId}`).set({
      id: schoolId,
      name: 'Escola A',
      plan: 'trial',
      createdAt: new Date().toISOString(),
    })

    // Documento raiz da outra escola
    await db.doc(`schools/${otherSchoolId}`).set({
      id: otherSchoolId,
      name: 'Escola B',
      plan: 'trial',
      createdAt: new Date().toISOString(),
    })

    // Perfil do teacher na escola principal (subcoleção teachers)
    await db.doc(`schools/${schoolId}/teachers/teacher-uid-school`).set({
      id: 'teacher-uid-school',
      email: 'teacher-school@test.com',
      name: 'School Teacher',
      status: 'approved',
      profile: 'teacher',
    })

    // Config da escola principal
    await db.doc(`schools/${schoolId}/config/main`).set({
      schoolName: 'Escola A',
      turmas: [],
      subjects: [],
    })
  })
}
