/**
 * Testes de regras Firestore para os campos protegidos `removedFrom` em
 * users/{uid} e o bloqueio de create em pending_teachers quando existe
 * marcador em removed_users (auditoria de segurança).
 *
 * Cobre:
 *   1. users/{uid}.create com removedFrom no payload é negado para o próprio uid
 *      (apenas SaaS admin via Admin SDK pode escrever esse campo).
 *   2. users/{uid}.update tocando removedFrom é negado para o próprio uid.
 *   3. pending_teachers/{uid}.create é negado quando existe
 *      removed_users/{uid} na mesma escola.
 *   4. Sanity: pending_teachers/{uid}.create funciona quando NÃO existe
 *      marcador em removed_users (caminho feliz preservado).
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import {
  createTestEnv,
  seedMultitenantData,
} from './setup.js'

const SCHOOL_A = 'sch-a'

let env

beforeAll(async () => {
  env = await createTestEnv()
})

beforeEach(async () => {
  await env.clearFirestore()
  await seedMultitenantData(env, SCHOOL_A)
})

afterAll(async () => {
  await env.cleanup()
})

// ── Helpers de contexto ──────────────────────────────────────────────────────

function asUser(uid, email = `${uid}@test.com`) {
  const ctx = env.authenticatedContext(uid, {
    email,
    email_verified: true,
  })
  return ctx.firestore()
}

// ── 1. users/{uid} — campo removedFrom protegido no create ───────────────────

describe('users/{uid} — removedFrom protegido (MÉDIA #3)', () => {
  it('próprio uid NÃO consegue criar users/{uid} com campo removedFrom no payload', async () => {
    const db = asUser('new-user-uid-1', 'new1@test.com')
    await assertFails(
      db.doc('users/new-user-uid-1').set({
        email: 'new1@test.com',
        name: 'New User',
        removedFrom: ['sch-a'],
      })
    )
  })

  it('próprio uid CONSEGUE criar users/{uid} sem schools nem removedFrom', async () => {
    const db = asUser('new-user-uid-2', 'new2@test.com')
    await assertSucceeds(
      db.doc('users/new-user-uid-2').set({
        email: 'new2@test.com',
        name: 'New User',
      })
    )
  })

  it('próprio uid NÃO consegue alterar removedFrom em update', async () => {
    // Seed: criar o doc users/{uid} com campos seguros via rules disabled
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/own-uid').set({
        email: 'own@test.com',
        name: 'Own User',
        removedFrom: [SCHOOL_A],
      })
    })

    const db = asUser('own-uid', 'own@test.com')
    await assertFails(
      db.doc('users/own-uid').update({
        removedFrom: [],
      })
    )
  })

  it('próprio uid NÃO consegue adicionar removedFrom via update mesmo se ainda não existia', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/own-uid-2').set({
        email: 'own2@test.com',
        name: 'Own User 2',
      })
    })

    const db = asUser('own-uid-2', 'own2@test.com')
    await assertFails(
      db.doc('users/own-uid-2').update({
        removedFrom: [SCHOOL_A],
      })
    )
  })

  it('próprio uid CONSEGUE atualizar campos pessoais (name) sem tocar removedFrom', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/own-uid-3').set({
        email: 'own3@test.com',
        name: 'Own User 3',
      })
    })

    const db = asUser('own-uid-3', 'own3@test.com')
    await assertSucceeds(
      db.doc('users/own-uid-3').update({
        name: 'Own User 3 Updated',
      })
    )
  })
})

// ── 2. pending_teachers — bloqueio quando removed_users existe ───────────────

describe('pending_teachers create — bloqueio por removed_users (MÉDIA #4)', () => {
  it('NÃO consegue criar pending_teachers/{uid} quando existe removed_users/{uid}', async () => {
    // Seed: criar o marcador removed_users (apenas via rules disabled, pois
    // a rule é write:false do cliente)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore()
        .doc(`schools/${SCHOOL_A}/removed_users/blocked-uid`)
        .set({
          uid: 'blocked-uid',
          email: 'blocked@test.com',
          removedAt: new Date().toISOString(),
        })
    })

    const db = asUser('blocked-uid', 'blocked@test.com')
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/blocked-uid`).set({
        name: 'Blocked',
        email: 'blocked@test.com',
        subjectIds: ['subj-mat'],
      })
    )
  })

  it('CONSEGUE criar pending_teachers/{uid} quando NÃO há removed_users (caminho feliz)', async () => {
    const db = asUser('fresh-uid', 'fresh@test.com')
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/fresh-uid`).set({
        name: 'Fresh',
        email: 'fresh@test.com',
        subjectIds: ['subj-mat'],
      })
    )
  })

  it('quando reinstateRemovedUser apaga o marcador, create de pending_teachers volta a funcionar', async () => {
    // Seed marcador
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore()
        .doc(`schools/${SCHOOL_A}/removed_users/recycle-uid`)
        .set({
          uid: 'recycle-uid',
          email: 'recycle@test.com',
        })
    })

    const db = asUser('recycle-uid', 'recycle@test.com')
    // Antes da reativação: bloqueado
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/recycle-uid`).set({
        name: 'Recycle',
        email: 'recycle@test.com',
      })
    )

    // Apaga marcador (simulando reinstateRemovedUser)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore()
        .doc(`schools/${SCHOOL_A}/removed_users/recycle-uid`)
        .delete()
    })

    // Após reativação: permitido
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/recycle-uid`).set({
        name: 'Recycle',
        email: 'recycle@test.com',
      })
    )
  })
})
