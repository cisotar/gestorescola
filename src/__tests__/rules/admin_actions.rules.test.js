import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { createTestEnv, asAdmin, asTeacher, seedDefaultData } from './setup.js'

let env

beforeAll(async () => {
  env = await createTestEnv()
  await seedDefaultData(env)
})

afterAll(() => env.cleanup())

describe('admin_actions — comportamento correto', () => {
  it('admin grava em admin_actions', async () => {
    const db = asAdmin(env)
    await assertSucceeds(
      db.doc('admin_actions/new-doc').set({
        action: 'test-action',
        performedBy: 'test-admin@test.com',
        timestamp: new Date().toISOString(),
      })
    )
  })

  it('teacher tenta gravar em admin_actions — negado', async () => {
    const db = asTeacher(env)
    await assertFails(
      db.doc('admin_actions/new-doc').set({
        action: 'unauthorized-action',
        performedBy: 'test-teacher@test.com',
        timestamp: new Date().toISOString(),
      })
    )
  })
})
