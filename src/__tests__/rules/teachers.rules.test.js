import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { createTestEnv, asAdmin, asTeacher, asAnonymous, seedDefaultData } from './setup.js'

let env

beforeAll(async () => {
  env = await createTestEnv()
  await seedDefaultData(env)
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('teachers/other-teacher-456').set({
      id: 'other-teacher-456',
      email: 'other@test.com',
      name: 'Other Teacher',
      status: 'approved',
      profile: 'teacher',
    })
  })
})

afterAll(() => env.cleanup())

describe('teachers — comportamento correto', () => {
  it('admin atualiza qualquer campo de teacher', async () => {
    const db = asAdmin(env)
    await assertSucceeds(
      db.doc('teachers/teacher-uid-123').update({
        name: 'Test Teacher Updated',
        status: 'approved',
        profile: 'coordinator',
      })
    )
  })

  it('teacher atualiza próprios campos permitidos', async () => {
    const db = asTeacher(env)
    await assertSucceeds(
      db.doc('teachers/teacher-uid-123').update({
        celular: '11999990000',
        whatsapp: '11999990000',
        apelido: 'Tester',
        name: 'Test Teacher',
        subjectIds: ['subj-mat'],
        horariosSemana: { segunda: true },
      })
    )
  })

  it('teacher tenta atualizar próprio profile — negado', async () => {
    const db = asTeacher(env)
    await assertFails(
      db.doc('teachers/teacher-uid-123').update({
        profile: 'coordinator',
      })
    )
  })

  it('teacher tenta atualizar próprio status — negado', async () => {
    const db = asTeacher(env)
    await assertFails(
      db.doc('teachers/teacher-uid-123').update({
        status: 'coordinator',
      })
    )
  })

  it('teacher tenta atualizar documento de outro teacher — negado', async () => {
    const db = asTeacher(env)
    await assertFails(
      db.doc('teachers/other-teacher-456').update({
        name: 'Hacked Name',
      })
    )
  })

  it('usuário anônimo tenta ler coleção teachers — negado', async () => {
    const db = asAnonymous(env)
    await assertFails(
      db.collection('teachers').get()
    )
  })
})
