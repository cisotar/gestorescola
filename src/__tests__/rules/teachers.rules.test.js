import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import {
  createTestEnv,
  asSaasAdmin,
  asMemberOf,
  seedMultitenantData,
} from './setup.js'

const SCHOOL_ID = 'sch-a'
const TEACHERS_PATH = `schools/${SCHOOL_ID}/teachers`

let env

beforeAll(async () => {
  env = await createTestEnv()
  await seedMultitenantData(env, SCHOOL_ID)
  // Seed de um segundo teacher na escola para testes de cross-teacher
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`${TEACHERS_PATH}/other-teacher-456`).set({
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
  it('school admin atualiza qualquer campo de teacher', async () => {
    const db = asMemberOf(env, SCHOOL_ID, 'admin-uid-school', 'admin-school@test.com', 'admin')
    await assertSucceeds(
      db.doc(`${TEACHERS_PATH}/teacher-uid-school`).update({
        name: 'School Teacher Updated',
        status: 'approved',
        profile: 'coordinator',
      })
    )
  })

  it('saas admin atualiza qualquer campo de teacher', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc(`${TEACHERS_PATH}/teacher-uid-school`).update({
        name: 'School Teacher SaaS Updated',
      })
    )
  })

  it('teacher atualiza próprios campos permitidos', async () => {
    // teacher-uid-school tem email 'teacher-school@test.com' — bate com o doc seed
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertSucceeds(
      db.doc(`${TEACHERS_PATH}/teacher-uid-school`).update({
        celular: '11999990000',
        whatsapp: '11999990000',
        apelido: 'Tester',
        name: 'School Teacher',
        subjectIds: ['subj-mat'],
        horariosSemana: { segunda: true },
      })
    )
  })

  it('teacher tenta atualizar próprio profile — negado', async () => {
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertFails(
      db.doc(`${TEACHERS_PATH}/teacher-uid-school`).update({
        profile: 'coordinator',
      })
    )
  })

  it('teacher tenta atualizar próprio status — negado', async () => {
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertFails(
      db.doc(`${TEACHERS_PATH}/teacher-uid-school`).update({
        status: 'coordinator',
      })
    )
  })

  it('teacher tenta atualizar documento de outro teacher — negado', async () => {
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertFails(
      db.doc(`${TEACHERS_PATH}/other-teacher-456`).update({
        name: 'Hacked Name',
      })
    )
  })

  it('usuário não autenticado tenta ler coleção teachers — negado', async () => {
    const ctx = env.unauthenticatedContext()
    const db = ctx.firestore()
    await assertFails(db.collection(TEACHERS_PATH).get())
  })

  it('membro de outra escola não consegue ler teachers', async () => {
    const db = asMemberOf(
      env,
      'sch-b',
      'teacher-uid-other',
      'teacher-other@test.com',
      'teacher',
    )
    await assertFails(db.collection(TEACHERS_PATH).get())
  })
})
