import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import {
  createTestEnv,
  asSaasAdmin,
  asMemberOf,
  seedMultitenantData,
} from './setup.js'

const SCHOOL_ID = 'sch-a'

let env

beforeAll(async () => {
  env = await createTestEnv()
  await seedMultitenantData(env, SCHOOL_ID)
})

afterAll(() => env.cleanup())

describe('admin_actions — comportamento correto', () => {
  it('school admin grava em admin_actions da própria escola', async () => {
    const db = asMemberOf(env, SCHOOL_ID, 'admin-uid-school', 'admin-school@test.com', 'admin')
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_ID}/admin_actions/new-doc`).set({
        action: 'test-action',
        performedBy: 'admin-school@test.com',
        timestamp: new Date().toISOString(),
      })
    )
  })

  it('saas admin grava em admin_actions de qualquer escola', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_ID}/admin_actions/saas-doc`).set({
        action: 'saas-action',
        performedBy: 'saas-admin@test.com',
        timestamp: new Date().toISOString(),
      })
    )
  })

  it('teacher tenta gravar em admin_actions — negado', async () => {
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertFails(
      db.doc(`schools/${SCHOOL_ID}/admin_actions/unauthorized-doc`).set({
        action: 'unauthorized-action',
        performedBy: 'teacher-school@test.com',
        timestamp: new Date().toISOString(),
      })
    )
  })

  it('admin não consegue atualizar ou deletar registro existente — imutável', async () => {
    // Cria via bypass para garantir que o doc existe
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc(`schools/${SCHOOL_ID}/admin_actions/immutable-doc`)
        .set({ action: 'original', timestamp: new Date().toISOString() })
    })
    const db = asMemberOf(env, SCHOOL_ID, 'admin-uid-school', 'admin-school@test.com', 'admin')
    await assertFails(
      db.doc(`schools/${SCHOOL_ID}/admin_actions/immutable-doc`).update({
        action: 'tampered',
      })
    )
    await assertFails(
      db.doc(`schools/${SCHOOL_ID}/admin_actions/immutable-doc`).delete()
    )
  })
})
