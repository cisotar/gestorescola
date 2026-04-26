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
