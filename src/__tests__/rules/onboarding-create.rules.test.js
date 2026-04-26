/**
 * Testes de Firestore Security Rules para o fluxo de onboarding — issue #400.
 *
 * Cobre os três novos `allow create` adicionados para permitir a criação de escola:
 *   1. `schools/{schoolId}` — qualquer autenticado pode criar
 *   2. `schools/{schoolId}/config/main` — apenas o criador (createdBy) pode criar
 *   3. `school_slugs/{slug}` — qualquer autenticado pode criar
 *
 * Todos os casos de negação para usuário não autenticado também são cobertos.
 */

import {
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  createTestEnv,
  asAnonymous,
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

// ── 1. schools/{schoolId} — create ──────────────────────────────────────────

describe('schools/{schoolId} — create durante onboarding', () => {
  it('usuário autenticado consegue criar schools/{schoolId}', async () => {
    const db = asCreator()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_ID}`).set({
        id: SCHOOL_ID,
        name: 'Escola de Onboarding',
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

  it('outro usuário autenticado também consegue criar uma escola diferente', async () => {
    const db = asOtherUser()
    await assertSucceeds(
      db.doc('schools/outra-escola-999').set({
        id: 'outra-escola-999',
        name: 'Outra Escola',
        createdBy: OTHER_UID,
        plan: 'trial',
        createdAt: new Date().toISOString(),
      })
    )
  })

  it('update de schools/{schoolId} permanece restrito — autenticado comum NÃO pode atualizar', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`schools/${SCHOOL_ID}`).set({
        id: SCHOOL_ID,
        name: 'Escola',
        createdBy: CREATOR_UID,
        plan: 'trial',
        createdAt: new Date().toISOString(),
      })
    })
    // Criador NÃO é schoolAdmin (users/{uid}.schools ainda não foi populado)
    const db = asCreator()
    await assertFails(
      db.doc(`schools/${SCHOOL_ID}`).update({ name: 'Nome Alterado' })
    )
  })
})

// ── 2. schools/{schoolId}/config/{doc} — create restrito ao createdBy ────────

describe('schools/{schoolId}/config/main — create restrito ao createdBy', () => {
  beforeEach(async () => {
    // Cria o documento schools/{schoolId} com campo createdBy
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`schools/${SCHOOL_ID}`).set({
        id: SCHOOL_ID,
        name: 'Escola de Onboarding',
        createdBy: CREATOR_UID,
        plan: 'trial',
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

  it('create de config/main sem documento schools/{schoolId} existente é negado', async () => {
    // schools/{schoolId} não existe — get() retorna documento inexistente,
    // acesso a .data.createdBy resulta em PERMISSION_DENIED.
    const db = asCreator()
    await assertFails(
      db.doc('schools/escola-inexistente/config/main').set({
        schoolName: 'Escola sem pai',
        turmas: [],
        subjects: [],
      })
    )
  })

  it('create de config/main quando campo createdBy está ausente é negado', async () => {
    // Cria a escola SEM o campo createdBy
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('schools/escola-sem-createdBy').set({
        id: 'escola-sem-createdBy',
        name: 'Escola Sem createdBy',
        plan: 'trial',
        createdAt: new Date().toISOString(),
        // createdBy ausente intencionalmente
      })
    })
    const db = asCreator()
    await assertFails(
      db.doc('schools/escola-sem-createdBy/config/main').set({
        schoolName: 'Config sem createdBy',
        turmas: [],
        subjects: [],
      })
    )
  })
})

// ── 3. school_slugs/{slug} — create ──────────────────────────────────────────

describe('school_slugs/{slug} — create durante onboarding', () => {
  it('usuário autenticado consegue criar school_slugs/{slug}', async () => {
    const db = asCreator()
    await assertSucceeds(
      db.doc('school_slugs/minha-nova-escola').set({
        slug: 'minha-nova-escola',
        schoolId: SCHOOL_ID,
        name: 'Escola de Onboarding',
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

  it('outro usuário autenticado também consegue criar um slug diferente', async () => {
    const db = asOtherUser()
    await assertSucceeds(
      db.doc('school_slugs/outro-slug').set({
        slug: 'outro-slug',
        schoolId: 'outra-escola-999',
        name: 'Outra Escola',
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
