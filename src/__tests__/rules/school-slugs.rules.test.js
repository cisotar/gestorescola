/**
 * Testes de Firestore Security Rules para:
 *   1. Coleção raiz `school_slugs/{slug}` — leitura pública + escrita restrita
 *   2. `schools/{schoolId}/pending_teachers/{uid}` — extensão para coordenadores
 *
 * Cobre todos os critérios de aceitação da issue #379.
 */

import {
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  createTestEnv,
  asSaasAdmin,
  asMemberOf,
  asAnonymous,
  seedMultitenantData,
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

  // Seed: coordenador na escola A
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()

    await db.doc('users/coordinator-uid-school').set({
      uid: 'coordinator-uid-school',
      email: 'coordinator-school@test.com',
      name: 'School Coordinator',
      schools: {
        [SCHOOL_A]: { role: 'coordinator', status: 'approved' },
      },
    })

    await db.doc('users/teacher-coordinator-uid-school').set({
      uid: 'teacher-coordinator-uid-school',
      email: 'teacher-coordinator-school@test.com',
      name: 'School Teacher-Coordinator',
      schools: {
        [SCHOOL_A]: { role: 'teacher-coordinator', status: 'approved' },
      },
    })

    // Slug existente para testes de leitura
    await db.doc('school_slugs/minha-escola').set({
      slug: 'minha-escola',
      schoolId: SCHOOL_A,
      name: 'Escola A',
      createdAt: new Date().toISOString(),
    })

    // Documento de teacher pendente para testes de pending_teachers
    await db.doc(`schools/${SCHOOL_A}/pending_teachers/pending-teacher-uid`).set({
      uid: 'pending-teacher-uid',
      email: 'pending-teacher@test.com',
      name: 'Pending Teacher',
      status: 'pending',
    })
  })
})

afterAll(async () => {
  await env.cleanup()
})

// ── Helpers de contexto ──────────────────────────────────────────────────────

function asSchoolAdmin(school = SCHOOL_A) {
  return asMemberOf(env, school, 'admin-uid-school', 'admin-school@test.com', 'admin')
}

function asSchoolTeacher(school = SCHOOL_A) {
  return asMemberOf(env, school, 'teacher-uid-school', 'teacher-school@test.com', 'teacher')
}

function asCoordinator(school = SCHOOL_A) {
  return asMemberOf(env, school, 'coordinator-uid-school', 'coordinator-school@test.com', 'coordinator')
}

function asTeacherCoordinator(school = SCHOOL_A) {
  return asMemberOf(env, school, 'teacher-coordinator-uid-school', 'teacher-coordinator-school@test.com', 'teacher-coordinator')
}

// ── school_slugs — leitura pública ──────────────────────────────────────────

describe('school_slugs — leitura pública', () => {
  it('usuário não autenticado consegue ler um slug existente', async () => {
    // Critério de aceite: GET school_slugs/qualquer-slug retorna 200 sem autenticação
    const db = asAnonymous(env)
    await assertSucceeds(
      db.doc('school_slugs/minha-escola').get()
    )
  })

  it('usuário não autenticado consegue ler um slug inexistente (doc não encontrado, não negado)', async () => {
    const db = asAnonymous(env)
    await assertSucceeds(
      db.doc('school_slugs/slug-inexistente').get()
    )
  })

  it('teacher autenticado consegue ler um slug', async () => {
    const db = asSchoolTeacher()
    await assertSucceeds(
      db.doc('school_slugs/minha-escola').get()
    )
  })

  it('super-admin SaaS consegue ler um slug', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc('school_slugs/minha-escola').get()
    )
  })
})

// ── school_slugs — escrita restrita ──────────────────────────────────────────

describe('school_slugs — escrita restrita', () => {
  it('usuário não autenticado NÃO consegue criar um slug', async () => {
    // Critério de aceite: POST school_slugs/novo-slug falha para usuário não autenticado
    const db = asAnonymous(env)
    await assertFails(
      db.doc('school_slugs/novo-slug').set({
        slug: 'novo-slug',
        schoolId: SCHOOL_A,
        name: 'Escola A',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('teacher comum NÃO consegue criar um slug', async () => {
    const db = asSchoolTeacher()
    await assertFails(
      db.doc('school_slugs/novo-slug').set({
        slug: 'novo-slug',
        schoolId: SCHOOL_A,
        name: 'Escola A',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('admin da escola consegue criar um slug com seu schoolId', async () => {
    // Critério de aceite: POST school_slugs/novo-slug passa para admin da escola
    const db = asSchoolAdmin()
    await assertSucceeds(
      db.doc('school_slugs/novo-slug').set({
        slug: 'novo-slug',
        schoolId: SCHOOL_A,
        name: 'Escola A',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('super-admin SaaS consegue criar um slug', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc('school_slugs/saas-slug').set({
        slug: 'saas-slug',
        schoolId: SCHOOL_A,
        name: 'Escola A via SaaS',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('admin de sch-a NÃO consegue criar slug com schoolId de sch-b', async () => {
    const db = asSchoolAdmin(SCHOOL_A)
    await assertFails(
      db.doc('school_slugs/escola-b-slug').set({
        slug: 'escola-b-slug',
        schoolId: SCHOOL_B,
        name: 'Escola B',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('escrita sem campo schoolId no payload é negada', async () => {
    const db = asSchoolAdmin()
    await assertFails(
      db.doc('school_slugs/sem-school-id').set({
        slug: 'sem-school-id',
        name: 'Sem schoolId',
      })
    )
  })
})

// ── pending_teachers — coordenador pode aprovar/rejeitar ─────────────────────

describe('pending_teachers — acesso de coordenador', () => {
  it('coordenador (role coordinator) consegue ler pending_teachers da própria escola', async () => {
    // Critério de aceite: PATCH schools/{schoolId}/pending_teachers/{uid} passa para coordenador
    const db = asCoordinator()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/pending-teacher-uid`).get()
    )
  })

  it('coordenador (role coordinator) consegue atualizar pending_teachers da própria escola', async () => {
    const db = asCoordinator()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/pending-teacher-uid`)
        .update({ status: 'approved' })
    )
  })

  it('teacher-coordinator consegue ler pending_teachers da própria escola', async () => {
    const db = asTeacherCoordinator()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/pending-teacher-uid`).get()
    )
  })

  it('teacher-coordinator consegue atualizar pending_teachers da própria escola', async () => {
    const db = asTeacherCoordinator()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/pending-teacher-uid`)
        .update({ status: 'approved' })
    )
  })

  it('teacher comum NÃO consegue atualizar pending_teachers de outro usuário', async () => {
    const db = asSchoolTeacher()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/pending-teacher-uid`)
        .update({ status: 'approved' })
    )
  })

  it('coordenador de sch-a NÃO consegue atualizar pending_teachers de sch-b (isolamento multi-tenant)', async () => {
    // seed: pending_teacher em sch-b
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore()
        .doc(`schools/${SCHOOL_B}/pending_teachers/pending-in-b`)
        .set({ uid: 'pending-in-b', email: 'pending-b@test.com', status: 'pending' })
    })
    const db = asCoordinator(SCHOOL_A)
    await assertFails(
      db.doc(`schools/${SCHOOL_B}/pending_teachers/pending-in-b`)
        .update({ status: 'approved' })
    )
  })

  it('o próprio usuário pendente ainda consegue ler/escrever o próprio doc', async () => {
    const ctx = env.authenticatedContext('pending-teacher-uid', {
      email: 'pending-teacher@test.com',
      email_verified: true,
    })
    const db = ctx.firestore()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/pending-teacher-uid`).get()
    )
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/pending-teacher-uid`)
        .update({ celular: '11999999999' })
    )
  })
})
