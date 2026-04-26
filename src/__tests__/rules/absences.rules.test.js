import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import {
  createTestEnv,
  asSaasAdmin,
  asMemberOf,
  seedMultitenantData,
} from './setup.js'

const SCHOOL_ID = 'sch-a'
const ABSENCE_PATH = `schools/${SCHOOL_ID}/absences`
const SEEDED_ABSENCE_ID = 'absence-seed-123'
const SEEDED_ABSENCE_PATH = `${ABSENCE_PATH}/${SEEDED_ABSENCE_ID}`

let env

beforeAll(async () => {
  env = await createTestEnv()
  await seedMultitenantData(env, SCHOOL_ID)
  // Cria ausência seed para testes de leitura/update/delete
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(SEEDED_ABSENCE_PATH).set({
      teacherId: 'teacher-uid-school',
      slots: [{ id: 'sl-1', subjectId: 'subj-bio', date: '2026-04-14' }],
    })
  })
})

afterAll(() => env.cleanup())

describe('absences — comportamento correto', () => {
  it('school admin cria ausência com slots normais', async () => {
    const db = asMemberOf(env, SCHOOL_ID, 'admin-uid-school', 'admin-school@test.com', 'admin')
    await assertSucceeds(
      db.collection(ABSENCE_PATH).add({
        teacherId: 'teacher-uid-school',
        slots: [{ id: 'sl-2', subjectId: 'subj-mat', date: '2026-04-15' }],
      })
    )
  })

  it('membro aprovado da escola lê ausência', async () => {
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertSucceeds(db.doc(SEEDED_ABSENCE_PATH).get())
  })

  it('saas admin lê ausência', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(db.doc(SEEDED_ABSENCE_PATH).get())
  })

  it('admin tenta criar ausência com slots[0].subjectId = "formation-atpcg" — bloqueado', async () => {
    const db = asMemberOf(env, SCHOOL_ID, 'admin-uid-school', 'admin-school@test.com', 'admin')
    await assertFails(
      db.collection(ABSENCE_PATH).add({
        teacherId: 'teacher-uid-school',
        slots: [{ id: 'sl-3', subjectId: 'formation-atpcg', date: '2026-04-16' }],
      })
    )
  })

  it('admin tenta atualizar ausência com slots[0].subjectId = "formation-atpcg" — bloqueado', async () => {
    const db = asMemberOf(env, SCHOOL_ID, 'admin-uid-school', 'admin-school@test.com', 'admin')
    await assertFails(
      db.doc(SEEDED_ABSENCE_PATH).update({
        slots: [{ id: 'sl-1', subjectId: 'formation-atpcg', date: '2026-04-14' }],
      })
    )
  })

  it('slot com formation- em slots[1] bloqueia criação', async () => {
    // hasFormationSlot agora verifica slots[0..4] — slot em posição 1+ também bloqueia
    const db = asMemberOf(env, SCHOOL_ID, 'admin-uid-school', 'admin-school@test.com', 'admin')
    await assertFails(
      db.collection(ABSENCE_PATH).add({
        teacherId: 'teacher-uid-school',
        slots: [
          { id: 'sl-6', subjectId: 'subj-mat', date: '2026-04-19' },
          { id: 'sl-7', subjectId: 'formation-atpcg', date: '2026-04-19' },
        ],
      })
    )
  })

  it('membro de outra escola não consegue ler ausência', async () => {
    const db = asMemberOf(
      env,
      'sch-b',
      'teacher-uid-other',
      'teacher-other@test.com',
      'teacher',
    )
    await assertFails(db.doc(SEEDED_ABSENCE_PATH).get())
  })
})

describe('absences — brechas corrigidas', () => {
  it('teacher (não admin) tenta criar ausência — negado', async () => {
    // brecha corrigida: apenas school admin pode criar ausências no cliente.
    // Cloud Function usa Admin SDK e bypassa rules.
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertFails(
      db.collection(ABSENCE_PATH).add({
        teacherId: 'teacher-uid-school',
        slots: [{ id: 'sl-4', subjectId: 'subj-hist', date: '2026-04-17' }],
      })
    )
  })

  it('teacher tenta deletar ausência — negado', async () => {
    // brecha corrigida: delete restrito a school admin
    const db = asMemberOf(
      env,
      SCHOOL_ID,
      'teacher-uid-school',
      'teacher-school@test.com',
      'teacher',
    )
    await assertFails(db.doc(SEEDED_ABSENCE_PATH).delete())
  })
})
