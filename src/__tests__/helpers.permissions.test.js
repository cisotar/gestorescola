import { describe, it, expect } from 'vitest'
import { canEditTeacher } from '../lib/helpers/permissions.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROF_A = { id: 'prof-abc', name: 'Ana Beatriz' }
const PROF_B = { id: 'prof-xyz', name: 'Bruno Xavier' }
const PROF_C = { id: 'prof-coo', name: 'Coordenadora Clara' }

const makeAuthStore = (role, teacherId = null) => ({
  role,
  teacher: teacherId ? { id: teacherId, name: 'Usuário Logado' } : null,
  user: { uid: teacherId ?? 'uid-qualquer' },
})

// ─── role admin ───────────────────────────────────────────────────────────────

describe('canEditTeacher — role admin', () => {
  it('retorna true para qualquer professor alvo', () => {
    const store = makeAuthStore('admin')
    expect(canEditTeacher(null, PROF_A, store)).toBe(true)
  })

  it('retorna true mesmo quando o alvo é um professor diferente do usuário', () => {
    const store = makeAuthStore('admin', 'outro-id')
    expect(canEditTeacher({ id: 'outro-id' }, PROF_B, store)).toBe(true)
  })
})

// ─── role coordinator ─────────────────────────────────────────────────────────

describe('canEditTeacher — role coordinator', () => {
  it('coordenador puro retorna true para professor qualquer', () => {
    const store = makeAuthStore('coordinator', PROF_C.id)
    expect(canEditTeacher(PROF_C, PROF_A, store)).toBe(true)
  })

  it('coordenador puro retorna true para professor diferente do usuário logado', () => {
    const store = makeAuthStore('coordinator', PROF_C.id)
    expect(canEditTeacher(PROF_C, PROF_B, store)).toBe(true)
  })
})

// ─── role teacher-coordinator ─────────────────────────────────────────────────

describe('canEditTeacher — role teacher-coordinator', () => {
  it('teacher-coordinator retorna true para professor qualquer', () => {
    const store = makeAuthStore('teacher-coordinator', PROF_C.id)
    expect(canEditTeacher(PROF_C, PROF_A, store)).toBe(true)
  })

  it('teacher-coordinator retorna true mesmo editando professor diferente', () => {
    const store = makeAuthStore('teacher-coordinator', PROF_C.id)
    expect(canEditTeacher(PROF_C, PROF_B, store)).toBe(true)
  })
})

// ─── role teacher ─────────────────────────────────────────────────────────────

describe('canEditTeacher — role teacher', () => {
  it('professor retorna true ao editar a si mesmo (ids iguais)', () => {
    const store = makeAuthStore('teacher', PROF_A.id)
    expect(canEditTeacher(PROF_A, PROF_A, store)).toBe(true)
  })

  it('professor retorna false ao tentar editar outro professor', () => {
    const store = makeAuthStore('teacher', PROF_A.id)
    expect(canEditTeacher(PROF_A, PROF_B, store)).toBe(false)
  })

  it('professor sem id (anomalia) retorna false mesmo que alvo exista', () => {
    const store = makeAuthStore('teacher')
    const usuarioSemId = { name: 'Sem ID' } // id ausente
    expect(canEditTeacher(usuarioSemId, PROF_A, store)).toBe(false)
  })

  it('professor com id null retorna false', () => {
    const store = makeAuthStore('teacher')
    expect(canEditTeacher({ id: null }, PROF_A, store)).toBe(false)
  })
})

// ─── authStore inválido ───────────────────────────────────────────────────────

describe('canEditTeacher — authStore inválido', () => {
  it('authStore null retorna false', () => {
    expect(canEditTeacher(PROF_A, PROF_B, null)).toBe(false)
  })

  it('authStore sem role retorna false', () => {
    const store = { teacher: PROF_A, user: { uid: PROF_A.id } } // sem campo role
    expect(canEditTeacher(PROF_A, PROF_B, store)).toBe(false)
  })
})

// ─── professorAlvo inválido ───────────────────────────────────────────────────

describe('canEditTeacher — professorAlvo inválido', () => {
  it('professorAlvo null retorna false mesmo para admin', () => {
    const store = makeAuthStore('admin')
    expect(canEditTeacher(null, null, store)).toBe(false)
  })

  it('professorAlvo null retorna false para teacher', () => {
    const store = makeAuthStore('teacher', PROF_A.id)
    expect(canEditTeacher(PROF_A, null, store)).toBe(false)
  })
})

// ─── roles não autorizados ────────────────────────────────────────────────────

describe('canEditTeacher — roles sem acesso', () => {
  it('role pending retorna false', () => {
    const store = makeAuthStore('pending', PROF_A.id)
    expect(canEditTeacher(PROF_A, PROF_A, store)).toBe(false)
  })

  it('role arbitrário desconhecido retorna false', () => {
    const store = makeAuthStore('superuser', PROF_A.id)
    expect(canEditTeacher(PROF_A, PROF_A, store)).toBe(false)
  })
})
