/**
 * Testes de Firestore Security Rules para SaaS admin e estado da escola — issue #410.
 *
 * Cobre:
 *  1. SaaS admin cria schools/{id}, school_slugs/{slug}, schools/{id}/config/main (allow)
 *  2. Member comum lê escola status: 'active' (allow); status: 'suspended' (deny)
 *  3. SaaS admin lê escola suspensa em todas as subcoleções (allow)
 *  4. Member comum atualiza status/adminEmail/deletedAt em schools/{id} (deny)
 *     mesmo sendo school-admin local
 *  5. SaaS admin atualiza status/adminEmail/deletedAt em schools/{id} (allow)
 *  6. Escola sem campo status (legado) continua acessível para members
 */

import {
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  createTestEnv,
  asSaasAdmin,
  asMemberOf,
  seedMultitenantData,
  seedSuspendedSchool,
} from './setup.js'

const SCHOOL_A = 'sch-a'
const SCHOOL_B = 'sch-b'

let env

beforeAll(async () => {
  env = await createTestEnv()
})

beforeEach(async () => {
  await env.clearFirestore()
  await seedMultitenantData(env, SCHOOL_A, SCHOOL_B)
})

afterAll(async () => {
  await env.cleanup()
})

function asSchoolAdmin(school = SCHOOL_A) {
  return asMemberOf(env, school, 'admin-uid-school', 'admin-school@test.com', 'admin')
}

function asSchoolTeacher(school = SCHOOL_A) {
  return asMemberOf(env, school, 'teacher-uid-school', 'teacher-school@test.com', 'teacher')
}

// ── 1. SaaS admin: criação completa de escola ───────────────────────────────

describe('SaaS admin — criação de escola, slug e config', () => {
  it('SaaS admin cria schools/{id}', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc('schools/nova-escola').set({
        id: 'nova-escola',
        name: 'Nova Escola',
        plan: 'trial',
        status: 'active',
        adminEmail: 'admin@nova.com',
        deletedAt: null,
        createdBy: 'saas-admin-uid',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('SaaS admin cria school_slugs/{slug}', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc('school_slugs/nova-escola').set({
        slug: 'nova-escola',
        schoolId: 'nova-escola',
        name: 'Nova Escola',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('SaaS admin cria schools/{id}/config/main (mesmo sem ser createdBy)', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/config/foo`).set({
        schoolName: 'Config nova',
      })
    )
  })

  it('usuário comum (não SaaS admin) NÃO cria schools/{id}', async () => {
    const db = asSchoolAdmin()
    await assertFails(
      db.doc('schools/forbidden').set({
        id: 'forbidden',
        name: 'Forbidden',
        plan: 'trial',
        status: 'active',
        createdBy: 'admin-uid-school',
        createdAt: new Date().toISOString(),
      })
    )
  })
})

// ── 2. Escola suspensa — bloqueia members, libera SaaS admin ────────────────

describe('Escola suspensa — bloqueio de membros comuns', () => {
  beforeEach(async () => {
    await seedSuspendedSchool(env, SCHOOL_A)
  })

  it('teacher membro NÃO lê schools/{id}/config quando escola suspensa', async () => {
    const db = asSchoolTeacher()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/config/main`).get()
    )
  })

  it('teacher membro NÃO lê schools/{id}/teachers quando escola suspensa', async () => {
    const db = asSchoolTeacher()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/teachers/teacher-uid-school`).get()
    )
  })

  it('teacher membro NÃO lê schools/{id}/schedules quando escola suspensa', async () => {
    const db = asSchoolTeacher()
    await assertFails(
      db.collection(`schools/${SCHOOL_A}/schedules`).get()
    )
  })

  it('teacher membro NÃO lê schools/{id}/absences quando escola suspensa', async () => {
    const db = asSchoolTeacher()
    await assertFails(
      db.collection(`schools/${SCHOOL_A}/absences`).get()
    )
  })

  it('SaaS admin LÊ schools/{id} suspensa', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}`).get()
    )
  })

  it('SaaS admin LÊ schools/{id}/config/main mesmo suspensa', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/config/main`).get()
    )
  })

  it('SaaS admin LÊ schools/{id}/teachers mesmo suspensa', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.collection(`schools/${SCHOOL_A}/teachers`).get()
    )
  })
})

// ── 3. Update segmentado de status/adminEmail/deletedAt ─────────────────────

describe('schools/{id} — update segmentado por campo administrativo', () => {
  it('school admin local NÃO atualiza status', async () => {
    const db = asSchoolAdmin()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}`).update({ status: 'suspended' })
    )
  })

  it('school admin local NÃO atualiza adminEmail', async () => {
    const db = asSchoolAdmin()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}`).update({ adminEmail: 'novo@admin.com' })
    )
  })

  it('school admin local NÃO atualiza deletedAt', async () => {
    const db = asSchoolAdmin()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}`).update({ deletedAt: new Date().toISOString() })
    )
  })

  it('school admin local atualiza campos comuns (ex: name)', async () => {
    const db = asSchoolAdmin()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}`).update({ name: 'Escola A Renomeada' })
    )
  })

  it('teacher comum NÃO atualiza status', async () => {
    const db = asSchoolTeacher()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}`).update({ status: 'suspended' })
    )
  })

  it('SaaS admin atualiza status para suspended', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}`).update({ status: 'suspended' })
    )
  })

  it('SaaS admin atualiza adminEmail', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}`).update({ adminEmail: 'novo@admin.com' })
    )
  })

  it('SaaS admin marca deletedAt (soft delete)', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}`).update({ deletedAt: new Date().toISOString() })
    )
  })
})

// ── 4. Compatibilidade com escolas legadas (sem campo status) ───────────────

describe('Escola legada sem campo status — acesso preservado', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await db.doc('schools/legacy-school').set({
        id: 'legacy-school',
        name: 'Escola Legada',
        plan: 'trial',
        createdAt: new Date().toISOString(),
        // status, adminEmail, deletedAt ausentes (doc pré-migração)
      })
      await db.doc('schools/legacy-school/config/main').set({
        schoolName: 'Escola Legada',
      })
      await db.doc('users/legacy-teacher-uid').set({
        uid: 'legacy-teacher-uid',
        email: 'legacy@test.com',
        schools: {
          'legacy-school': { role: 'teacher', status: 'approved' },
        },
      })
    })
  })

  it('teacher membro de escola legada (sem status) lê config normalmente', async () => {
    const db = asMemberOf(env, 'legacy-school', 'legacy-teacher-uid', 'legacy@test.com', 'teacher')
    await assertSucceeds(
      db.doc('schools/legacy-school/config/main').get()
    )
  })
})
