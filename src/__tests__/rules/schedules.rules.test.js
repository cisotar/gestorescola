import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import {
  createTestEnv,
  asSaasAdmin,
  asMemberOf,
  seedMultitenantData,
} from './setup.js'

const SCHOOL_ID = 'sch-a'
const SCHEDULES_PATH = `schools/${SCHOOL_ID}/schedules`

let env

beforeAll(async () => {
  env = await createTestEnv()
  await seedMultitenantData(env, SCHOOL_ID)
  // Seed de schedules usados nos testes de delete/update/leitura
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await db.doc(`${SCHEDULES_PATH}/own-schedule-123`).set({
      teacherId: 'teacher-uid-school',
      day: 'Segunda',
      timeSlot: 'seg-fund|manha|1',
      turma: '9A',
      subjectId: 'subj-bio',
    })
    await db.doc(`${SCHEDULES_PATH}/other-schedule-456`).set({
      teacherId: 'other-teacher-uid',
      day: 'Terça',
      timeSlot: 'seg-fund|manha|2',
      turma: '8B',
      subjectId: 'subj-quim',
    })
  })
})

afterAll(() => env.cleanup())

describe('schedules — comportamento correto', () => {
  it('school admin cria schedule', async () => {
    const db = asMemberOf(env, SCHOOL_ID, 'admin-uid-school', 'admin-school@test.com', 'admin')
    await assertSucceeds(
      db.collection(SCHEDULES_PATH).add({
        teacherId: 'teacher-uid-school',
        day: 'Quarta',
        timeSlot: 'seg-fund|manha|3',
        turma: '7C',
        subjectId: 'subj-port',
      })
    )
  })

  it('teacher cria schedule com teacherId == auth.uid', async () => {
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertSucceeds(
      db.collection(SCHEDULES_PATH).add({
        teacherId: 'teacher-uid-school',
        day: 'Quinta',
        timeSlot: 'seg-fund|tarde|1',
        turma: '6A',
        subjectId: 'subj-cien',
      })
    )
  })

  it('teacher deleta próprio schedule', async () => {
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertSucceeds(db.doc(`${SCHEDULES_PATH}/own-schedule-123`).delete())
  })

  it('teacher tenta deletar schedule de outro teacher — negado', async () => {
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertFails(db.doc(`${SCHEDULES_PATH}/other-schedule-456`).delete())
  })

  it('usuário não autenticado tenta ler schedule — negado', async () => {
    const ctx = env.unauthenticatedContext()
    const db = ctx.firestore()
    await assertFails(db.doc(`${SCHEDULES_PATH}/other-schedule-456`).get())
  })

  it('membro de outra escola não consegue ler schedule', async () => {
    const db = asMemberOf(
      env,
      'sch-b',
      'teacher-uid-other',
      'teacher-other@test.com',
      'teacher',
    )
    await assertFails(db.doc(`${SCHEDULES_PATH}/other-schedule-456`).get())
  })

  it('saas admin lê schedule de qualquer escola', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(db.doc(`${SCHEDULES_PATH}/other-schedule-456`).get())
  })
})

describe('schedules — brecha corrigida (#366)', () => {
  beforeAll(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${SCHEDULES_PATH}/own-schedule-update`).set({
        teacherId: 'teacher-uid-school',
        day: 'Segunda',
        timeSlot: 'seg-fund|manha|1',
        turma: '9A',
        subjectId: 'subj-bio',
      })
    })
  })

  it('teacher reatribui schedule para outro teacherId — negado', async () => {
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertFails(
      db.doc(`${SCHEDULES_PATH}/own-schedule-update`).update({
        teacherId: 'other-teacher-uid',
      })
    )
  })

  it('teacher atualiza campos próprios sem alterar teacherId — permitido', async () => {
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertSucceeds(
      db.doc(`${SCHEDULES_PATH}/own-schedule-update`).update({
        turma: '9B',
      })
    )
  })
})
