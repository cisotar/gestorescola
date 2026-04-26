import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { createTestEnv, asAdmin, asTeacher, asAnonymous, seedDefaultData } from './setup.js'

let env

beforeAll(async () => {
  env = await createTestEnv()
  await seedDefaultData(env)
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await db.doc('schedules/own-schedule-123').set({
      teacherId: 'teacher-uid-123',
      day: 'Segunda',
      timeSlot: 'seg-fund|manha|1',
      turma: '9A',
      subjectId: 'subj-bio',
    })
    await db.doc('schedules/other-schedule-456').set({
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
  it('admin cria schedule', async () => {
    const db = asAdmin(env)
    await assertSucceeds(
      db.collection('schedules').add({
        teacherId: 'teacher-uid-123',
        day: 'Quarta',
        timeSlot: 'seg-fund|manha|3',
        turma: '7C',
        subjectId: 'subj-port',
      })
    )
  })

  it('teacher cria schedule com teacherId == auth.uid', async () => {
    const db = asTeacher(env)
    await assertSucceeds(
      db.collection('schedules').add({
        teacherId: 'teacher-uid-123',
        day: 'Quinta',
        timeSlot: 'seg-fund|tarde|1',
        turma: '6A',
        subjectId: 'subj-cien',
      })
    )
  })

  it('teacher deleta próprio schedule', async () => {
    const db = asTeacher(env)
    await assertSucceeds(
      db.doc('schedules/own-schedule-123').delete()
    )
  })

  it('teacher tenta deletar schedule de outro teacher — negado', async () => {
    const db = asTeacher(env)
    await assertFails(
      db.doc('schedules/other-schedule-456').delete()
    )
  })

  it('teacher tenta atualizar teacherId de um schedule para outro uid — negado', async () => {
    // Recria own-schedule para poder testar o update (pode ter sido deletado no teste anterior)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('schedules/own-schedule-update').set({
        teacherId: 'teacher-uid-123',
        day: 'Segunda',
        timeSlot: 'seg-fund|manha|1',
        turma: '9A',
        subjectId: 'subj-bio',
      })
    })
    const db = asTeacher(env)
    await assertFails(
      db.doc('schedules/own-schedule-update').update({
        teacherId: 'other-teacher-uid',
      })
    )
  })

  it('usuário anônimo tenta ler schedule — negado', async () => {
    const db = asAnonymous(env)
    await assertFails(
      db.doc('schedules/other-schedule-456').get()
    )
  })
})
