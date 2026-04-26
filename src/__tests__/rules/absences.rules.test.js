import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { createTestEnv, asAdmin, asTeacher, asPending, seedDefaultData } from './setup.js'

let env

beforeAll(async () => {
  env = await createTestEnv()
  await seedDefaultData(env)
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('absences/absence-seed-123').set({
      teacherId: 'outro-teacher-uid',
      slots: [{ id: 'sl-1', subjectId: 'subj-bio', date: '2026-04-14' }],
    })
  })
})

afterAll(() => env.cleanup())

describe('absences — comportamento correto', () => {
  it('admin cria ausência com slots normais', async () => {
    const db = asAdmin(env)
    await assertSucceeds(
      db.collection('absences').add({
        teacherId: 'teacher-uid-123',
        slots: [{ id: 'sl-2', subjectId: 'subj-mat', date: '2026-04-15' }],
      })
    )
  })

  it('usuário autenticado lê ausência', async () => {
    const db = asTeacher(env)
    await assertSucceeds(
      db.doc('absences/absence-seed-123').get()
    )
  })

  it('admin tenta criar ausência com slots[0].subjectId = "formation-atpcg" — bloqueado', async () => {
    const db = asAdmin(env)
    await assertFails(
      db.collection('absences').add({
        teacherId: 'teacher-uid-123',
        slots: [{ id: 'sl-3', subjectId: 'formation-atpcg', date: '2026-04-16' }],
      })
    )
  })

  it('admin tenta atualizar ausência com slots[0].subjectId = "formation-atpcg" — bloqueado', async () => {
    const db = asAdmin(env)
    await assertFails(
      db.doc('absences/absence-seed-123').update({
        slots: [{ id: 'sl-1', subjectId: 'formation-atpcg', date: '2026-04-14' }],
      })
    )
  })
})

describe('absences — brechas corrigidas', () => {
  it('usuário pending cria ausência com slots normais', async () => {
    // brecha corrigida: pending não consegue criar ausência (ownership exigido)
    const db = asPending(env, 'pending-uid')
    await assertFails(
      db.collection('absences').add({
        teacherId: 'outro-teacher-uid',
        slots: [{ id: 'sl-4', subjectId: 'subj-hist', date: '2026-04-17' }],
      })
    )
  })

  it('teacher cria ausência com teacherId diferente do próprio uid', async () => {
    // brecha corrigida: teacher não consegue criar ausência de outro teacher
    const db = asTeacher(env)
    await assertFails(
      db.collection('absences').add({
        teacherId: 'outro-teacher-uid',
        slots: [{ id: 'sl-5', subjectId: 'subj-geo', date: '2026-04-18' }],
      })
    )
  })

  it('teacher deleta ausência de outro teacher', async () => {
    // brecha corrigida: delete restrito a admin ou dono do perfil
    const db = asTeacher(env)
    await assertFails(
      db.doc('absences/absence-seed-123').delete()
    )
  })

  it('slot com formation- em slots[1] bloqueia criação', async () => {
    // brecha corrigida: hasFormationSlot agora verifica slots[0..4]
    const db = asAdmin(env)
    await assertFails(
      db.collection('absences').add({
        teacherId: 'teacher-uid-123',
        slots: [
          { id: 'sl-6', subjectId: 'subj-mat', date: '2026-04-19' },
          { id: 'sl-7', subjectId: 'formation-atpcg', date: '2026-04-19' },
        ],
      })
    )
  })
})
