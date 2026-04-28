// src/__tests__/boot.integration.test.js
import { describe, it, expect } from 'vitest'
import { bootSequence } from '../lib/boot.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Constrói um objeto que implementa a interface DocumentSnapshot fake.
 * @param {boolean} exists
 * @param {object|null} data
 */
function makeSnap(exists, data = null) {
  return {
    exists: () => exists,
    data:   () => data,
  }
}

/** FirebaseUser mínimo — bootSequence só verifica se é null/undefined. */
const FAKE_USER = { uid: 'uid-abc', email: 'user@escola.com' }

// ─── Cenário 1 ────────────────────────────────────────────────────────────────

describe('Cenário 1 — SaaS admin sem escola no localStorage', () => {
  it('retorna role admin, schoolId null e clearLocalStorage false', () => {
    const result = bootSequence(
      FAKE_USER,
      null,
      [],         // availableSchools vazia
      null,       // savedSchoolId ausente
      true,       // isSuperUser
    )

    expect(result.role).toBe('admin')
    expect(result.schoolId).toBeNull()
    expect(result.clearLocalStorage).toBe(false)
    expect(result.startPendingListener).toBe(false)
    expect(result.startApprovalListener).toBe(false)
  })
})

// ─── Cenário 2 ────────────────────────────────────────────────────────────────

describe('Cenário 2 — SaaS admin com escola stale no localStorage', () => {
  it('retorna role admin, schoolId null e clearLocalStorage true', () => {
    const result = bootSequence(
      FAKE_USER,
      null,
      [],              // availableSchools vazia — savedId stale
      'sch-stale',     // savedSchoolId presente mas sem escola disponível
      true,            // isSuperUser
    )

    expect(result.role).toBe('admin')
    expect(result.schoolId).toBeNull()
    expect(result.clearLocalStorage).toBe(true)
    expect(result.startPendingListener).toBe(false)
    expect(result.startApprovalListener).toBe(false)
  })
})

// ─── Cenário 3 ────────────────────────────────────────────────────────────────

describe('Cenário 3 — SaaS admin com escola válida (membership real)', () => {
  it('retorna role admin, schoolId setado e startPendingListener true', () => {
    const result = bootSequence(
      FAKE_USER,
      null,
      [{ schoolId: 'sch-1', name: 'Escola Exemplo' }],
      'sch-1',    // savedSchoolId válido e presente em availableSchools
      true,       // isSuperUser
    )

    expect(result.role).toBe('admin')
    expect(result.schoolId).toBe('sch-1')
    expect(result.clearLocalStorage).toBe(false)
    expect(result.startPendingListener).toBe(true)
    expect(result.startApprovalListener).toBe(false)
  })

  it('savedSchoolId ausente com escola disponível → seleciona primeira da lista', () => {
    const result = bootSequence(
      FAKE_USER,
      null,
      [{ schoolId: 'sch-1', name: 'Escola Exemplo' }],
      null,       // sem savedSchoolId — deve selecionar availableSchools[0]
      true,
    )

    expect(result.role).toBe('admin')
    expect(result.schoolId).toBe('sch-1')
    expect(result.startPendingListener).toBe(true)
  })
})

// ─── Cenário 4 ────────────────────────────────────────────────────────────────

describe('Cenário 4 — Professor aprovado com escola salva', () => {
  it('retorna role teacher, schoolId restaurado e sem listeners de aprovação', () => {
    const userSnap = makeSnap(true, {
      schools: {
        'sch-1': { role: 'teacher' },
      },
    })

    const result = bootSequence(
      FAKE_USER,
      userSnap,
      [{ schoolId: 'sch-1', name: 'Escola Exemplo' }],
      'sch-1',    // savedSchoolId válido e presente em availableSchools
      false,      // não é superUser
    )

    expect(result.role).toBe('teacher')
    expect(result.schoolId).toBe('sch-1')
    expect(result.clearLocalStorage).toBe(false)
    expect(result.startApprovalListener).toBe(false)
    expect(result.startPendingListener).toBe(false)
  })
})

// ─── Cenário 5 ────────────────────────────────────────────────────────────────

describe('Cenário 5 — Professor pendente (sem entry em schools[schoolId])', () => {
  it('retorna role pending, schoolId preservado e startApprovalListener true', () => {
    const userSnap = makeSnap(true, {
      schools: {},   // sem entrada para 'sch-1'
    })

    const result = bootSequence(
      FAKE_USER,
      userSnap,
      [],          // availableSchools vazia — usuário ainda sem membership
      'sch-1',     // savedSchoolId presente (RN-2: preservar para pendentes)
      false,
    )

    expect(result.role).toBe('pending')
    expect(result.schoolId).toBe('sch-1')
    expect(result.clearLocalStorage).toBe(false)
    expect(result.startApprovalListener).toBe(true)
  })
})

// ─── Cenário 6 ────────────────────────────────────────────────────────────────

describe('Cenário 6 — Usuário sem escola disponível (teacher sem vínculo)', () => {
  it('userSnap inexistente + sem savedSchoolId → role pending, schoolId null e startApprovalListener true', () => {
    const userSnap = makeSnap(false)  // doc não existe no Firestore

    const result = bootSequence(
      FAKE_USER,
      userSnap,
      [],    // nenhuma escola disponível
      null,  // nenhum savedSchoolId
      false,
    )

    expect(result.role).toBe('pending')
    expect(result.schoolId).toBeNull()
    expect(result.startApprovalListener).toBe(true)
  })
})

// ─── Cenário 7 (extra) ────────────────────────────────────────────────────────

describe('Cenário 7 — Regressão: escola stale no LS para professor não-admin', () => {
  it('quando savedSchoolId stale e há escola real disponível → seleciona escola real e limpa LS', () => {
    const userSnap = makeSnap(true, {
      schools: {
        'sch-real': { role: 'teacher' },
      },
    })

    const result = bootSequence(
      FAKE_USER,
      userSnap,
      [{ schoolId: 'sch-real', name: 'Escola Real' }],
      'sch-stale',   // savedSchoolId stale — não existe em availableSchools
      false,
    )

    expect(result.schoolId).toBe('sch-real')
    expect(result.clearLocalStorage).toBe(true)
    expect(result.role).toBe('teacher')
    expect(result.startApprovalListener).toBe(false)
  })
})

// ─── Casos de borda adicionais ────────────────────────────────────────────────

describe('bootSequence — casos de borda', () => {
  it('user null → retorna BASE sem role e sem listeners', () => {
    const result = bootSequence(null, null, [], null, false)

    expect(result.role).toBeNull()
    expect(result.schoolId).toBeNull()
    expect(result.clearLocalStorage).toBe(false)
    expect(result.startPendingListener).toBe(false)
    expect(result.startApprovalListener).toBe(false)
  })

  it('user undefined → mesmo comportamento que user null', () => {
    const result = bootSequence(undefined, null, [], null, false)

    expect(result.role).toBeNull()
    expect(result.schoolId).toBeNull()
  })

  it('role rejected no userSnap → role null, schoolId null, sem listeners', () => {
    const userSnap = makeSnap(true, {
      schools: { 'sch-1': { role: 'rejected' } },
    })

    const result = bootSequence(
      FAKE_USER,
      userSnap,
      [{ schoolId: 'sch-1' }],
      'sch-1',
      false,
    )

    expect(result.role).toBeNull()
    expect(result.schoolId).toBeNull()
    expect(result.startApprovalListener).toBe(false)
    expect(result.startPendingListener).toBe(false)
  })

  it('role coordinator no userSnap → normalizado para coordinator (sem startPendingListener)', () => {
    const userSnap = makeSnap(true, {
      schools: { 'sch-1': { role: 'coordinator' } },
    })

    const result = bootSequence(
      FAKE_USER,
      userSnap,
      [{ schoolId: 'sch-1' }],
      'sch-1',
      false,
    )

    expect(result.role).toBe('coordinator')
    expect(result.schoolId).toBe('sch-1')
    // startPendingListener só é true para role 'admin' (local ou superUser com escola)
    expect(result.startPendingListener).toBe(false)
    expect(result.startApprovalListener).toBe(false)
  })

  it('role teacher-coordinator no userSnap → normalizado para teacher-coordinator', () => {
    const userSnap = makeSnap(true, {
      schools: { 'sch-1': { role: 'teacher-coordinator' } },
    })

    const result = bootSequence(
      FAKE_USER,
      userSnap,
      [{ schoolId: 'sch-1' }],
      'sch-1',
      false,
    )

    expect(result.role).toBe('teacher-coordinator')
    expect(result.schoolId).toBe('sch-1')
    expect(result.startPendingListener).toBe(false)
  })

  it('availableSchools com exatamente uma escola e sem savedId → auto-seleciona (RN-6)', () => {
    const userSnap = makeSnap(true, {
      schools: { 'sch-unica': { role: 'teacher' } },
    })

    const result = bootSequence(
      FAKE_USER,
      userSnap,
      [{ schoolId: 'sch-unica' }],
      null,   // sem savedSchoolId
      false,
    )

    expect(result.schoolId).toBe('sch-unica')
    expect(result.role).toBe('teacher')
    expect(result.clearLocalStorage).toBe(false)
  })
})
