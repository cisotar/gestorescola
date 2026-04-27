/**
 * Testes de Firestore Security Rules para criação de escola — atualizado pela
 * issue #410 (painel SaaS admin).
 *
 * Comportamento atual (após #410):
 *   1. `schools/{schoolId}` — apenas SaaS admin pode criar
 *   2. `schools/{schoolId}/config/main` — SaaS admin OU criador (createdBy)
 *      podem criar (createdBy permanece como fallback de compatibilidade)
 *   3. `school_slugs/{slug}` — apenas SaaS admin pode criar
 *
 * Os testes que antes verificavam que "qualquer autenticado podia criar"
 * (#400, fluxo de onboarding via cliente) agora verificam o comportamento
 * inverso (deny para não-SaaS-admin) — a criação de escola passa a ser
 * privilégio do painel SaaS admin / Cloud Functions.
 */

import {
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  createTestEnv,
  asAnonymous,
  asSaasAdmin,
  seedDefaultData,
} from './setup.js'

const SCHOOL_ID = 'onboarding-school-001'
const CREATOR_UID = 'creator-uid-001'
const OTHER_UID = 'other-uid-001'

let env

beforeAll(async () => {
  env = await createTestEnv()
})

beforeEach(async () => {
  await env.clearFirestore()
  // Garante existência de admins/saas-admin@test.com para asSaasAdmin()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('admins/saas-admin@test.com').set({
      email: 'saas-admin@test.com',
      name: 'SaaS Admin',
    })
  })
})

afterAll(async () => {
  await env.cleanup()
})

// ── Helpers de contexto ──────────────────────────────────────────────────────

function asCreator() {
  const ctx = env.authenticatedContext(CREATOR_UID, {
    email: 'creator@test.com',
    email_verified: true,
  })
  return ctx.firestore()
}

function asOtherUser() {
  const ctx = env.authenticatedContext(OTHER_UID, {
    email: 'other@test.com',
    email_verified: true,
  })
  return ctx.firestore()
}

// ── 1. schools/{schoolId} — create restrito a SaaS admin ────────────────────

describe('schools/{schoolId} — create restrito a SaaS admin', () => {
  it('SaaS admin consegue criar schools/{schoolId}', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_ID}`).set({
        id: SCHOOL_ID,
        name: 'Escola SaaS',
        createdBy: 'saas-admin-uid',
        plan: 'trial',
        status: 'active',
        adminEmail: 'admin@escola.com',
        deletedAt: null,
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('usuário autenticado comum NÃO consegue criar schools/{schoolId}', async () => {
    const db = asCreator()
    await assertFails(
      db.doc(`schools/${SCHOOL_ID}`).set({
        id: SCHOOL_ID,
        name: 'Escola comum',
        createdBy: CREATOR_UID,
        plan: 'trial',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('usuário NÃO autenticado NÃO consegue criar schools/{schoolId}', async () => {
    const db = asAnonymous(env)
    await assertFails(
      db.doc(`schools/${SCHOOL_ID}`).set({
        id: SCHOOL_ID,
        name: 'Escola Anon',
        createdBy: null,
        plan: 'trial',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('outro usuário autenticado também NÃO consegue criar (deny consistente)', async () => {
    const db = asOtherUser()
    await assertFails(
      db.doc('schools/outra-escola-999').set({
        id: 'outra-escola-999',
        name: 'Outra Escola',
        createdBy: OTHER_UID,
        plan: 'trial',
        createdAt: new Date().toISOString(),
      })
    )
  })
})

// ── 2. schools/{schoolId}/config/{doc} — create por SaaS admin ou createdBy ──

describe('schools/{schoolId}/config/main — create restrito ao createdBy ou SaaS admin', () => {
  beforeEach(async () => {
    // Cria o documento schools/{schoolId} com campo createdBy
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`schools/${SCHOOL_ID}`).set({
        id: SCHOOL_ID,
        name: 'Escola de Onboarding',
        createdBy: CREATOR_UID,
        plan: 'trial',
        status: 'active',
        createdAt: new Date().toISOString(),
      })
    })
  })

  it('criador (createdBy) consegue criar config/main', async () => {
    const db = asCreator()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_ID}/config/main`).set({
        schoolName: 'Escola de Onboarding',
        turmas: [],
        subjects: [],
      })
    )
  })

  it('SaaS admin consegue criar config/main mesmo não sendo createdBy', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_ID}/config/main`).set({
        schoolName: 'Config via SaaS admin',
        turmas: [],
        subjects: [],
      })
    )
  })

  it('outro usuário autenticado NÃO consegue criar config/main (createdBy diferente)', async () => {
    const db = asOtherUser()
    await assertFails(
      db.doc(`schools/${SCHOOL_ID}/config/main`).set({
        schoolName: 'Hackeada',
        turmas: [],
        subjects: [],
      })
    )
  })

  it('usuário NÃO autenticado NÃO consegue criar config/main', async () => {
    const db = asAnonymous(env)
    await assertFails(
      db.doc(`schools/${SCHOOL_ID}/config/main`).set({
        schoolName: 'Escola Anon',
        turmas: [],
        subjects: [],
      })
    )
  })
})

// ── 3. school_slugs/{slug} — create restrito a SaaS admin ───────────────────

describe('school_slugs/{slug} — create restrito a SaaS admin', () => {
  it('SaaS admin consegue criar school_slugs/{slug}', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc('school_slugs/minha-nova-escola').set({
        slug: 'minha-nova-escola',
        schoolId: SCHOOL_ID,
        name: 'Escola SaaS',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('usuário autenticado comum NÃO consegue criar school_slugs/{slug}', async () => {
    const db = asCreator()
    await assertFails(
      db.doc('school_slugs/slug-comum').set({
        slug: 'slug-comum',
        schoolId: SCHOOL_ID,
        name: 'Escola',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('usuário NÃO autenticado NÃO consegue criar school_slugs/{slug}', async () => {
    const db = asAnonymous(env)
    await assertFails(
      db.doc('school_slugs/slug-anon').set({
        slug: 'slug-anon',
        schoolId: SCHOOL_ID,
        name: 'Anon Escola',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('leitura de school_slugs permanece pública (não autenticado consegue ler)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('school_slugs/slug-existente').set({
        slug: 'slug-existente',
        schoolId: SCHOOL_ID,
        name: 'Escola',
        createdAt: new Date().toISOString(),
      })
    })
    const db = asAnonymous(env)
    await assertSucceeds(
      db.doc('school_slugs/slug-existente').get()
    )
  })
})
