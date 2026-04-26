/**
 * Testes de isolamento cross-tenant e das funções auxiliares multi-tenant.
 *
 * Cobre:
 *  1. Teacher de sch-a NÃO consegue ler dados de sch-b (isolamento cross-tenant)
 *  2. Super-admin SaaS consegue ler e escrever em qualquer escola
 *  3. School admin escreve em config/main; teacher comum recebe PERMISSION_DENIED
 *  4. Usuário com status 'pending' não consegue ler subcoleções da escola
 *  5. Create de absence com subjectId 'formation-atpcg' é rejeitado pelo guard hasFormationSlot
 *  6. Update em admin_actions é rejeitado (log imutável)
 *  7. Teacher sem documento users/{uid} não consegue acessar nada da escola
 *  8. Teacher atualiza apenas campos permitidos no próprio perfil
 *  9. School-admin de sch-a não escreve em sch-b
 * 10. Usuário pendente lê/escreve apenas o próprio pending_teachers/{uid}
 */

import {
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  createTestEnv,
  asSaasAdmin,
  asMemberOf,
  asPending,
  asAnonymous,
  seedMultitenantData,
} from './setup.js'

const SCHOOL_A = 'sch-a'
const SCHOOL_B = 'sch-b'

let env

beforeAll(async () => {
  env = await createTestEnv()
})

beforeEach(async () => {
  await env.clearFirestore()
  await seedMultitenantData(env, SCHOOL_A, SCHOOL_B)
})

afterAll(async () => {
  await env.cleanup()
})

// ── Helpers de contexto ──────────────────────────────────────────────────────

function asSchoolAdmin(school = SCHOOL_A) {
  return asMemberOf(env, school, 'admin-uid-school', 'admin-school@test.com', 'admin')
}

function asSchoolTeacher(school = SCHOOL_A) {
  return asMemberOf(env, school, 'teacher-uid-school', 'teacher-school@test.com', 'teacher')
}

function asOtherSchoolTeacher() {
  return asMemberOf(env, SCHOOL_B, 'teacher-uid-other', 'teacher-other@test.com', 'teacher')
}

function asPendingUser() {
  const ctx = env.authenticatedContext('pending-uid-school', {
    email: 'pending-school@test.com',
    email_verified: true,
  })
  return ctx.firestore()
}

// ── 1. Isolamento cross-tenant ───────────────────────────────────────────────

describe('isolamento cross-tenant', () => {
  it('teacher de sch-b NÃO consegue ler teachers de sch-a', async () => {
    const db = asOtherSchoolTeacher()
    await assertFails(
      db.collection(`schools/${SCHOOL_A}/teachers`).get()
    )
  })

  it('teacher de sch-b NÃO consegue ler schedules de sch-a', async () => {
    const db = asOtherSchoolTeacher()
    await assertFails(
      db.collection(`schools/${SCHOOL_A}/schedules`).get()
    )
  })

  it('teacher de sch-b NÃO consegue ler config de sch-a', async () => {
    const db = asOtherSchoolTeacher()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/config/main`).get()
    )
  })

  it('school-admin de sch-a NÃO consegue escrever em sch-b', async () => {
    const db = asSchoolAdmin(SCHOOL_A)
    await assertFails(
      db.collection(`schools/${SCHOOL_B}/teachers`).add({
        id: 'new-teacher',
        email: 'new@test.com',
        name: 'New Teacher',
      })
    )
  })

  it('teacher membro de sch-a consegue ler teachers de sch-a', async () => {
    const db = asSchoolTeacher()
    await assertSucceeds(
      db.collection(`schools/${SCHOOL_A}/teachers`).get()
    )
  })
})

// ── 2. Super-admin SaaS tem acesso global ────────────────────────────────────

describe('super-admin SaaS', () => {
  it('consegue ler teachers de qualquer escola', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.collection(`schools/${SCHOOL_A}/teachers`).get()
    )
    await assertSucceeds(
      db.collection(`schools/${SCHOOL_B}/teachers`).get()
    )
  })

  it('consegue escrever em config/main de qualquer escola', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/config/main`).set({ schoolName: 'Updated A' })
    )
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_B}/config/main`).set({ schoolName: 'Updated B' })
    )
  })

  it('consegue criar e ler admin_actions em qualquer escola', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.collection(`schools/${SCHOOL_A}/admin_actions`).add({
        actionType: 'test',
        actorId: 'saas-admin-uid',
      })
    )
  })

  it('consegue ler documento em /admins/', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc('admins/saas-admin@test.com').get()
    )
  })
})

// ── 3. School admin escreve em config/main; teacher recebe PERMISSION_DENIED ─

describe('config/main — controle de acesso por role', () => {
  it('school admin consegue escrever em config/main', async () => {
    const db = asSchoolAdmin()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/config/main`).set({ schoolName: 'Updated' })
    )
  })

  it('teacher comum recebe PERMISSION_DENIED ao escrever em config/main', async () => {
    const db = asSchoolTeacher()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/config/main`).set({ schoolName: 'Hack' })
    )
  })

  it('teacher consegue LEER config/main', async () => {
    const db = asSchoolTeacher()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/config/main`).get()
    )
  })
})

// ── 4. Usuário pendente não acessa subcoleções ───────────────────────────────

describe('usuário com status pending', () => {
  it('NÃO consegue ler teachers da escola', async () => {
    const db = asPendingUser()
    await assertFails(
      db.collection(`schools/${SCHOOL_A}/teachers`).get()
    )
  })

  it('NÃO consegue ler schedules da escola', async () => {
    const db = asPendingUser()
    await assertFails(
      db.collection(`schools/${SCHOOL_A}/schedules`).get()
    )
  })

  it('NÃO consegue ler config/main da escola', async () => {
    const db = asPendingUser()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/config/main`).get()
    )
  })

  it('consegue ler o próprio pending_teachers/{uid}', async () => {
    // seed: criar o próprio documento em pending_teachers
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore()
        .doc(`schools/${SCHOOL_A}/pending_teachers/pending-uid-school`)
        .set({ name: 'Pending', email: 'pending-school@test.com' })
    })
    const db = asPendingUser()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/pending-uid-school`).get()
    )
  })

  it('NÃO consegue ler pending_teachers de outro usuário', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore()
        .doc(`schools/${SCHOOL_A}/pending_teachers/another-uid`)
        .set({ name: 'Another', email: 'another@test.com' })
    })
    const db = asPendingUser()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/pending_teachers/another-uid`).get()
    )
  })
})

// ── 5. hasFormationSlot bloqueia criação de absence com slot de formação ─────

describe('absences — guard hasFormationSlot', () => {
  it('school admin NÃO consegue criar absence com slot formation-atpcg', async () => {
    const db = asSchoolAdmin()
    await assertFails(
      db.collection(`schools/${SCHOOL_A}/absences`).add({
        teacherId: 'teacher-uid-school',
        status: 'open',
        slots: [
          { subjectId: 'formation-atpcg', date: '2026-05-01', timeSlot: '1' },
        ],
      })
    )
  })

  it('school admin NÃO consegue criar absence com slot formation-qualquer', async () => {
    const db = asSchoolAdmin()
    await assertFails(
      db.collection(`schools/${SCHOOL_A}/absences`).add({
        teacherId: 'teacher-uid-school',
        status: 'open',
        slots: [
          { subjectId: 'formation-outra', date: '2026-05-01', timeSlot: '1' },
        ],
      })
    )
  })

  it('school admin consegue criar absence com slot de matéria normal', async () => {
    const db = asSchoolAdmin()
    await assertSucceeds(
      db.collection(`schools/${SCHOOL_A}/absences`).add({
        teacherId: 'teacher-uid-school',
        status: 'open',
        slots: [
          { subjectId: 'matematica', date: '2026-05-01', timeSlot: '1' },
        ],
      })
    )
  })

  it('teacher comum NÃO consegue criar absence (bypass de Cloud Function bloqueado)', async () => {
    const db = asSchoolTeacher()
    await assertFails(
      db.collection(`schools/${SCHOOL_A}/absences`).add({
        teacherId: 'teacher-uid-school',
        status: 'open',
        slots: [{ subjectId: 'matematica', date: '2026-05-01', timeSlot: '1' }],
      })
    )
  })
})

// ── 6. admin_actions é imutável — update/delete sempre rejeitados ────────────

describe('admin_actions — log imutável', () => {
  let adminActionId

  beforeEach(async () => {
    adminActionId = 'audit-log-001'
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore()
        .doc(`schools/${SCHOOL_A}/admin_actions/${adminActionId}`)
        .set({
          id: adminActionId,
          actionType: 'test_action',
          actorId: 'admin-uid-school',
          timestamp: new Date().toISOString(),
        })
    })
  })

  it('school admin NÃO consegue atualizar admin_actions (imutável)', async () => {
    const db = asSchoolAdmin()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/admin_actions/${adminActionId}`)
        .update({ actionType: 'tampered' })
    )
  })

  it('super-admin SaaS NÃO consegue atualizar admin_actions (imutável)', async () => {
    const db = asSaasAdmin(env)
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/admin_actions/${adminActionId}`)
        .update({ actionType: 'tampered' })
    )
  })

  it('school admin NÃO consegue deletar admin_actions (imutável)', async () => {
    const db = asSchoolAdmin()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/admin_actions/${adminActionId}`).delete()
    )
  })

  it('school admin consegue CRIAR admin_actions', async () => {
    const db = asSchoolAdmin()
    await assertSucceeds(
      db.collection(`schools/${SCHOOL_A}/admin_actions`).add({
        actionType: 'new_action',
        actorId: 'admin-uid-school',
      })
    )
  })

  it('school admin consegue LER admin_actions', async () => {
    const db = asSchoolAdmin()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/admin_actions/${adminActionId}`).get()
    )
  })
})

// ── 7. Usuário sem documento users/{uid} não acessa escola ───────────────────

describe('usuário sem documento users/{uid}', () => {
  it('NÃO consegue ler teachers da escola', async () => {
    const ctx = env.authenticatedContext('no-user-doc-uid', {
      email: 'ghost@test.com',
      email_verified: true,
    })
    const db = ctx.firestore()
    await assertFails(
      db.collection(`schools/${SCHOOL_A}/teachers`).get()
    )
  })
})

// ── 8. Teacher edita apenas campos permitidos no próprio perfil ──────────────

describe('teachers — atualização parcial de perfil', () => {
  it('teacher atualiza campos permitidos (celular, whatsapp) no próprio perfil', async () => {
    const db = asSchoolTeacher()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/teachers/teacher-uid-school`).update({
        celular: '11999999999',
        whatsapp: '11999999999',
      })
    )
  })

  it('teacher NÃO consegue atualizar campo profile do próprio perfil', async () => {
    const db = asSchoolTeacher()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/teachers/teacher-uid-school`).update({
        profile: 'admin',
      })
    )
  })

  it('teacher NÃO consegue atualizar campo status do próprio perfil', async () => {
    const db = asSchoolTeacher()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/teachers/teacher-uid-school`).update({
        status: 'coordinator',
      })
    )
  })

  it('teacher NÃO consegue atualizar perfil de outro teacher', async () => {
    // seed: outro teacher na escola A
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore()
        .doc(`schools/${SCHOOL_A}/teachers/other-teacher-in-a`)
        .set({ id: 'other-teacher-in-a', email: 'other@test.com', name: 'Other' })
    })
    const db = asSchoolTeacher()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/teachers/other-teacher-in-a`).update({
        celular: '11000000000',
      })
    )
  })
})

// ── 9. pending_actions — criação por membros, aprovação só por admin ─────────

describe('pending_actions', () => {
  it('teacher consegue criar pending_action', async () => {
    const db = asSchoolTeacher()
    await assertSucceeds(
      db.collection(`schools/${SCHOOL_A}/pending_actions`).add({
        action: 'request_substitution',
        createdBy: 'teacher-uid-school',
      })
    )
  })

  it('teacher NÃO consegue ler pending_actions', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore()
        .doc(`schools/${SCHOOL_A}/pending_actions/pa-001`)
        .set({ action: 'test', status: 'pending' })
    })
    const db = asSchoolTeacher()
    await assertFails(
      db.doc(`schools/${SCHOOL_A}/pending_actions/pa-001`).get()
    )
  })

  it('school admin consegue ler e atualizar pending_actions', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore()
        .doc(`schools/${SCHOOL_A}/pending_actions/pa-001`)
        .set({ action: 'test', status: 'pending' })
    })
    const db = asSchoolAdmin()
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/pending_actions/pa-001`).get()
    )
    await assertSucceeds(
      db.doc(`schools/${SCHOOL_A}/pending_actions/pa-001`)
        .update({ status: 'approved' })
    )
  })
})

// ── 10. users/{uid} — acesso apenas ao próprio documento ────────────────────

describe('users — acesso ao próprio documento', () => {
  it('teacher consegue ler o próprio users/{uid}', async () => {
    const db = asSchoolTeacher()
    await assertSucceeds(
      db.doc('users/teacher-uid-school').get()
    )
  })

  it('teacher NÃO consegue ler users/{uid} de outro usuário', async () => {
    const db = asSchoolTeacher()
    await assertFails(
      db.doc('users/admin-uid-school').get()
    )
  })

  it('super-admin SaaS consegue ler qualquer users/{uid}', async () => {
    const db = asSaasAdmin(env)
    await assertSucceeds(
      db.doc('users/teacher-uid-school').get()
    )
    await assertSucceeds(
      db.doc('users/admin-uid-school').get()
    )
  })
})
