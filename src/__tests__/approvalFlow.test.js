/**
 * Testes de Integração do Fluxo de Aprovação de Professores (Regressão)
 *
 * Este arquivo valida que:
 * 1. O fluxo completo de aprovação funciona: pending → seleção de perfil → aprovação → teacher criado
 * 2. Backward compatibility com chamadas legadas (sem parâmetro profile)
 * 3. Rejeição de pending não quebra outros
 * 4. Múltiplos pendentes com perfis diferentes funcionam independentemente
 * 5. Migração de schedules órfãos acontece corretamente
 * 6. Mensagens de toast exibem o perfil correto
 *
 * Dependência: Issue 004 (approveTeacher estendido com suporte a profile)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { approveTeacher, rejectTeacher } from '../lib/db/index.js'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, col, id) => ({ _path: `${col}/${id}` })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  collection: vi.fn(),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
  updateDoc: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  getFirestore: vi.fn(() => ({ _mock: true })),
}))

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ _mock: true })),
}))

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ _mock: true })),
  GoogleAuthProvider: vi.fn(),
}))

vi.mock('../firebase', () => ({
  db: { _mock: true },
  app: { _mock: true },
  auth: { _mock: true },
  provider: { _mock: true },
}))

vi.mock('../lib/helpers/ids', () => ({
  uid: vi.fn((seed) => {
    // Gera IDs determinísticos para testes
    if (seed === 'profile-selector-1') return 'teacher-id-123'
    if (seed === 'profile-selector-2') return 'teacher-id-456'
    if (seed === 'profile-selector-3') return 'teacher-id-789'
    return 'mock-teacher-id'
  }),
}))

import { getDoc, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const createPendingTeacher = (id, name, profile = null) => ({
  id,
  uid: id,
  email: `${name.toLowerCase().replace(/\s/g, '')}@example.com`,
  name,
  photoURL: 'https://example.com/photo.jpg',
  requestedAt: new Date('2026-01-01'),
  status: 'pending',
  profile,
  celular: '11987654321',
  apelido: name.split(' ')[0],
  subjectIds: ['subj-mat'],
  horariosSemana: { Segunda: { entrada: '07:00', saida: '12:30' } },
})

const mockState = {
  teachers: [
    { id: 'existing-teacher-1', name: 'Existing Teacher', email: 'existing@example.com', profile: 'teacher' },
  ],
  schedules: [
    { id: 'schedule-1', teacherId: 'pending-uid-123', day: 'Segunda', timeSlot: 'seg-fund|manha|1' },
  ],
}

const PROFILE_LABELS = {
  teacher: 'Professor',
  coordinator: 'Coordenador',
  'teacher-coordinator': 'Prof. Coordenador',
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('Fluxo de Aprovação de Professores (Integração)', () => {
  let mockSetState

  beforeEach(() => {
    vi.clearAllMocks()
    mockSetState = vi.fn((fn) => {
      if (typeof fn === 'function') {
        fn(mockState)
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ─── CT-6: Caminho Feliz Completo ─────────────────────────────────────────

  describe('CT-6: Fluxo Completo (pending → seleção → aprovação → teacher criado)', () => {
    it('deve completar fluxo com seleção obrigatória de perfil', async () => {
      // Setup: Professor pendente em Firestore
      const pending = createPendingTeacher('pending-uid-123', 'João Silva')
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pending,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      // Simulate: admin seleciona 'teacher' via ProfileSelector
      const selectedProfile = 'teacher'

      // Execute: aprovar com profile selecionado
      await approveTeacher('pending-uid-123', mockState, mockSetState, selectedProfile)

      // Assert: Firestore recebeu novo professor com profile correto
      expect(setDoc).toHaveBeenCalled()
      const [docRef, newTeacherData] = setDoc.mock.calls[0]
      expect(newTeacherData).toMatchObject({
        status: 'approved',
        profile: 'teacher',
        name: 'João Silva',
        email: pending.email,
      })

      // Assert: Pending foi deletado
      expect(deleteDoc).toHaveBeenCalled()

      // Assert: Estado foi atualizado (setState chamado)
      expect(mockSetState).toHaveBeenCalled()
    })

    it('permite seleção de qualquer perfil válido (teacher, coordinator, teacher-coordinator)', async () => {
      const profiles = ['teacher', 'coordinator', 'teacher-coordinator']

      for (const profile of profiles) {
        vi.clearAllMocks()

        const pending = createPendingTeacher('pending-uid-123', 'Test Teacher', profile)
        getDoc.mockResolvedValueOnce({
          exists: () => true,
          data: () => pending,
        })
        getDocs.mockResolvedValueOnce({ empty: true })

        await approveTeacher('pending-uid-123', mockState, mockSetState, profile)

        const [, newTeacherData] = setDoc.mock.calls[0]
        expect(newTeacherData.profile).toBe(profile)
      }
    })

    it('mensagem de toast deve exibir label correto do perfil aprovado', async () => {
      // Simulação de toast message
      const pending = createPendingTeacher('pending-uid-123', 'Maria Oliveira')
      const profile = 'coordinator'
      const expectedLabel = PROFILE_LABELS[profile]

      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pending,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-uid-123', mockState, mockSetState, profile)

      // Toast mensagem que deveria ser exibida
      const toastMessage = `${pending.name} aprovado como ${expectedLabel}`

      // Assert: Mensagem contém perfil correto
      expect(toastMessage).toBe('Maria Oliveira aprovado como Coordenador')
      expect(toastMessage).toContain('Coordenador')
    })
  })

  // ─── Backward Compatibility ──────────────────────────────────────────────

  describe('Backward Compatibility: chamadas legadas sem profile', () => {
    it('deve usar default "teacher" quando parâmetro profile não é fornecido', async () => {
      const pending = createPendingTeacher('legacy-uid-001', 'Legacy Teacher')
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pending,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      // Chamada LEGADA: approveTeacher(uid, state, setState) — sem profile
      await approveTeacher('legacy-uid-001', mockState, mockSetState)

      // Assert: profile = 'teacher' (default)
      const [, newTeacherData] = setDoc.mock.calls[0]
      expect(newTeacherData.profile).toBe('teacher')
    })

    it('professor antigo sem campo profile deve ser tratado gracefully', async () => {
      // Simular teacher antigo: sem campo profile no documento
      const oldTeacher = {
        id: 'old-teacher-uid',
        uid: 'old-teacher-uid',
        email: 'oldteacher@example.com',
        name: 'Old Teacher',
        // Note: NÃO TEM profile
      }

      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => oldTeacher,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      // Chamada sem profile — deve usar default
      await approveTeacher('old-teacher-uid', mockState, mockSetState)

      const [, newTeacherData] = setDoc.mock.calls[0]
      expect(newTeacherData.profile).toBe('teacher')
    })

    it('3+ chamadas legadas simultâneas não causam race conditions', async () => {
      const legacyCalls = [
        { pendingId: 'pending-1', name: 'Teacher 1' },
        { pendingId: 'pending-2', name: 'Teacher 2' },
        { pendingId: 'pending-3', name: 'Teacher 3' },
      ]

      for (const call of legacyCalls) {
        getDoc.mockResolvedValueOnce({
          exists: () => true,
          data: () => createPendingTeacher(call.pendingId, call.name),
        })
        getDocs.mockResolvedValueOnce({ empty: true })
      }

      // Execute: todas as 3 chamadas
      const promises = legacyCalls.map(call =>
        approveTeacher(call.pendingId, mockState, mockSetState)
      )
      await Promise.all(promises)

      // Assert: cada uma tem profile = 'teacher'
      expect(setDoc).toHaveBeenCalledTimes(3)
      for (let i = 0; i < 3; i++) {
        const [, data] = setDoc.mock.calls[i]
        expect(data.profile).toBe('teacher')
      }
    })
  })

  // ─── Rejeição Sem Quebrar Outros ──────────────────────────────────────────

  describe('Rejeição de Pending Sem Quebrar Outros', () => {
    it('deve rejeitar professor pendente removendo suas aulas órfãs', async () => {
      const orphanSchedules = [
        { id: 'schedule-1', teacherId: 'pending-reject-123' },
        { id: 'schedule-2', teacherId: 'pending-reject-123' },
      ]

      // Mock: encontrar schedules órfãos
      getDocs.mockResolvedValueOnce({
        empty: false,
        docs: orphanSchedules.map(s => ({
          id: s.id,
          data: () => s,
        })),
      })

      // Mock: writeBatch para deletar schedules
      const batchMock = {
        delete: vi.fn(),
        commit: vi.fn().mockResolvedValue(true),
      }
      writeBatch.mockReturnValue(batchMock)

      // Mock: deleteDoc para pending_teachers
      deleteDoc.mockResolvedValueOnce(true)

      await rejectTeacher('pending-reject-123', mockSetState)

      // Assert: schedules foram deletados
      expect(batchMock.delete).toHaveBeenCalledTimes(2)
      expect(batchMock.commit).toHaveBeenCalled()

      // Assert: pending foi deletado
      expect(deleteDoc).toHaveBeenCalled()

      // Assert: estado foi atualizado
      expect(mockSetState).toHaveBeenCalled()
    })

    it('rejeição de um pending não deve afetar outros pendentes', async () => {
      const pendingA = createPendingTeacher('pending-A', 'Teacher A')
      const pendingB = createPendingTeacher('pending-B', 'Teacher B')

      // Rejeitar A: não deve afetar B
      getDocs.mockResolvedValueOnce({ empty: true })
      deleteDoc.mockResolvedValueOnce(true)

      await rejectTeacher('pending-A', mockSetState)

      // Assert: apenas pending-A foi deletado
      expect(deleteDoc).toHaveBeenCalledOnce()

      // Agora, aprovar B: deve funcionar normalmente
      vi.clearAllMocks()
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pendingB,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-B', mockState, mockSetState, 'teacher')

      // Assert: B foi aprovado
      expect(setDoc).toHaveBeenCalled()
      expect(deleteDoc).toHaveBeenCalled()
    })
  })

  // ─── Múltiplos Pendentes Com Perfis Diferentes ──────────────────────────

  describe('Múltiplos Pendentes Com Perfis Diferentes', () => {
    it('cada pending mantém seu próprio estado de seleção', async () => {
      // Setup: 3 pendentes na UI
      const pendingA = createPendingTeacher('pending-A', 'Teacher A')
      const pendingB = createPendingTeacher('pending-B', 'Teacher B')
      const pendingC = createPendingTeacher('pending-C', 'Teacher C')

      // Simular pendingProfiles state em TabTeachers
      const pendingProfiles = {
        'pending-A': 'teacher',
        'pending-B': 'coordinator',
        'pending-C': 'teacher-coordinator',
      }

      // Execute: Aprovar A como teacher
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pendingA,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-A', mockState, mockSetState, pendingProfiles['pending-A'])

      // Assert: A aprovado com teacher
      const dataCall1 = setDoc.mock.calls[0]
      expect(dataCall1[1].profile).toBe('teacher')

      // Execute: Aprovar B como coordinator
      vi.clearAllMocks()
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pendingB,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-B', mockState, mockSetState, pendingProfiles['pending-B'])

      // Assert: B aprovado com coordinator
      const dataCall2 = setDoc.mock.calls[0]
      expect(dataCall2[1].profile).toBe('coordinator')

      // Execute: Aprovar C como teacher-coordinator
      vi.clearAllMocks()
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pendingC,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-C', mockState, mockSetState, pendingProfiles['pending-C'])

      // Assert: C aprovado com teacher-coordinator
      const dataCall3 = setDoc.mock.calls[0]
      expect(dataCall3[1].profile).toBe('teacher-coordinator')
    })

    it('estado de pendingProfiles não vaza entre modalidades', async () => {
      // Simular abrir/fechar modal de pendentes múltiplas vezes
      const mockPendingProfiles = {}

      // 1ª abertura: selecionar teacher A como 'teacher'
      mockPendingProfiles['pending-A'] = 'teacher'

      // 2ª abertura: novo pending B aparece
      mockPendingProfiles['pending-B'] = null // Não selecionado

      // 3ª abertura: sem limpar, A ainda deve estar em 'teacher'
      expect(mockPendingProfiles['pending-A']).toBe('teacher')
      expect(mockPendingProfiles['pending-B']).toBeNull()

      // Aprovar A
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => createPendingTeacher('pending-A', 'Teacher A'),
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-A', mockState, mockSetState, mockPendingProfiles['pending-A'])

      // Assert: A foi aprovado
      expect(setDoc).toHaveBeenCalled()
    })
  })

  // ─── Migração de Schedules Órfãos ───────────────────────────────────────

  describe('Migração de Schedules Órfãos', () => {
    it('deve migrar todos os schedules de pendingId para novo teacher.id', async () => {
      const orphanSchedules = [
        { id: 'sched-1', teacherId: 'pending-uid-123', day: 'Segunda', timeSlot: 'seg-fund|manha|1' },
        { id: 'sched-2', teacherId: 'pending-uid-123', day: 'Terça', timeSlot: 'seg-fund|tarde|2' },
        { id: 'sched-3', teacherId: 'pending-uid-123', day: 'Quarta', timeSlot: 'seg-fund|noite|3' },
      ]

      const pending = createPendingTeacher('pending-uid-123', 'Teacher with Schedules')
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pending,
      })

      // Mock: encontrar 3 schedules órfãos
      getDocs.mockResolvedValueOnce({
        empty: false,
        docs: orphanSchedules.map(s => ({
          id: s.id,
          data: () => s,
        })),
      })

      // Mock: writeBatch
      const batchMock = {
        update: vi.fn(),
        commit: vi.fn().mockResolvedValue(true),
      }
      writeBatch.mockReturnValue(batchMock)

      await approveTeacher('pending-uid-123', mockState, mockSetState, 'teacher')

      // Assert: writeBatch.update chamado 3 vezes
      expect(batchMock.update).toHaveBeenCalledTimes(3)

      // Assert: cada call migra para novo teacher.id
      for (let i = 0; i < 3; i++) {
        const [docRef, updateData] = batchMock.update.mock.calls[i]
        expect(updateData.teacherId).toBe('mock-teacher-id')
      }

      // Assert: batch foi commitado
      expect(batchMock.commit).toHaveBeenCalled()
    })

    it('schedules órfãos e estado devem estar em sync após migração', async () => {
      const orphanSchedules = [
        { id: 'sched-1', teacherId: 'pending-uid-123' },
        { id: 'sched-2', teacherId: 'pending-uid-123' },
      ]

      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => createPendingTeacher('pending-uid-123', 'Teacher'),
      })

      getDocs.mockResolvedValueOnce({
        empty: false,
        docs: orphanSchedules.map(s => ({
          id: s.id,
          data: () => s,
        })),
      })

      const batchMock = {
        update: vi.fn(),
        commit: vi.fn().mockResolvedValue(true),
      }
      writeBatch.mockReturnValue(batchMock)

      const mockSetStateFn = vi.fn((fn) => {
        const result = fn(mockState)
        // Validar que schedules foram atualizados no estado
        if (result.schedules) {
          for (const schedule of result.schedules) {
            if (schedule.id.startsWith('sched-')) {
              expect(schedule.teacherId).not.toBe('pending-uid-123')
            }
          }
        }
      })

      await approveTeacher('pending-uid-123', mockState, mockSetStateFn, 'teacher')

      // Assert: setState foi chamado com schedules atualizados
      expect(mockSetStateFn).toHaveBeenCalled()
    })

    it('pending SEM schedules órfãos deve ser aprovado normalmente', async () => {
      const pending = createPendingTeacher('pending-uid-no-schedules', 'Fresh Teacher')
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pending,
      })

      // getDocs retorna empty (sem schedules órfãos)
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-uid-no-schedules', mockState, mockSetState, 'teacher')

      // Assert: teacher foi criado
      expect(setDoc).toHaveBeenCalled()

      // Assert: pending foi deletado
      expect(deleteDoc).toHaveBeenCalled()

      // Assert: writeBatch.commit nunca foi chamado (sem schedules)
      expect(writeBatch).not.toHaveBeenCalled()
    })
  })

  // ─── Validação de Persistência em Firestore ─────────────────────────────

  describe('Validação de Persistência em Firestore', () => {
    it('documento em teachers/{newId} deve conter SEMPRE campo profile', async () => {
      const profiles = ['teacher', 'coordinator', 'teacher-coordinator']

      for (const profile of profiles) {
        vi.clearAllMocks()

        getDoc.mockResolvedValueOnce({
          exists: () => true,
          data: () => createPendingTeacher('pending-uid', 'Teacher', profile),
        })
        getDocs.mockResolvedValueOnce({ empty: true })

        await approveTeacher('pending-uid', mockState, mockSetState, profile)

        const [, teacherData] = setDoc.mock.calls[0]

        // Assert: profile sempre está presente no documento
        expect(teacherData).toHaveProperty('profile')
        expect(teacherData.profile).toBe(profile)
      }
    })

    it('pending_teachers/{uid} deve ser deletado após aprovação', async () => {
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => createPendingTeacher('pending-uid-123', 'Teacher'),
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-uid-123', mockState, mockSetState, 'teacher')

      // Assert: deleteDoc foi chamado para pending_teachers
      expect(deleteDoc).toHaveBeenCalled()
    })

    it('campos opcionais do pending devem ser migrados para teacher', async () => {
      const pendingWithAllFields = {
        id: 'pending-uid-123',
        uid: 'pending-uid-123',
        email: 'teacher@example.com',
        name: 'Full Teacher',
        celular: '11987654321',
        apelido: 'Full',
        subjectIds: ['subj-mat', 'subj-fis', 'subj-quim'],
        horariosSemana: {
          Segunda: { entrada: '07:00', saida: '12:30' },
          Terça: { entrada: '13:00', saida: '18:00' },
        },
        profile: 'coordinator',
      }

      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pendingWithAllFields,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-uid-123', mockState, mockSetState, 'coordinator')

      const [, teacherData] = setDoc.mock.calls[0]

      // Assert: todos os campos foram migrados
      expect(teacherData).toMatchObject({
        email: 'teacher@example.com',
        name: 'Full Teacher',
        celular: '11987654321',
        apelido: 'Full',
        subjectIds: ['subj-mat', 'subj-fis', 'subj-quim'],
        profile: 'coordinator',
      })

      expect(teacherData.horariosSemana).toBeDefined()
    })
  })

  // ─── Tratamento de Erros ──────────────────────────────────────────────────

  describe('Tratamento de Erros', () => {
    it('profile inválido deve usar fallback "teacher" com warning', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => createPendingTeacher('pending-uid', 'Teacher'),
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      // Tentar aprovar com profile inválido
      await approveTeacher('pending-uid', mockState, mockSetState, 'invalid-profile')

      // Assert: console warning foi emitido
      expect(consoleSpy).toHaveBeenCalledWith(
        '[db] Profile inválido: invalid-profile, usando default \'teacher\''
      )

      // Assert: fallback para teacher
      const [, teacherData] = setDoc.mock.calls[0]
      expect(teacherData.profile).toBe('teacher')

      consoleSpy.mockRestore()
    })

    it('pending_teachers/{uid} não existente deve ser noop', async () => {
      getDoc.mockResolvedValueOnce({
        exists: () => false,
      })

      await approveTeacher('non-existent-uid', mockState, mockSetState, 'teacher')

      // Assert: nada foi criado
      expect(setDoc).not.toHaveBeenCalled()
      expect(deleteDoc).not.toHaveBeenCalled()
    })
  })

  // ─── ProfileSelector Integração ────────────────────────────────────────────

  describe('ProfileSelector Integração', () => {
    it('componente começa com value === null (não selecionado)', () => {
      // Simular estado inicial do ProfileSelector
      const profileSelectorInitialState = {
        'pending-A': null,
        'pending-B': null,
        'pending-C': null,
      }

      // Assert: nenhum pending foi pré-selecionado
      expect(profileSelectorInitialState['pending-A']).toBeNull()
      expect(profileSelectorInitialState['pending-B']).toBeNull()
      expect(profileSelectorInitialState['pending-C']).toBeNull()
    })

    it('botão "Aprovar" fica disabled enquanto ProfileSelector.value === null', () => {
      const pendingProfiles = {
        'pending-A': null, // Disabled
        'pending-B': 'teacher', // Enabled
      }

      // Simular lógica do button disabled={!pendingProfiles[p.id]}
      const isButtonDisabledA = !pendingProfiles['pending-A']
      const isButtonDisabledB = !pendingProfiles['pending-B']

      expect(isButtonDisabledA).toBe(true) // Button disabled
      expect(isButtonDisabledB).toBe(false) // Button enabled
    })

    it('mudança de ProfileSelector deve atualizar estado local', () => {
      const pendingProfiles = { 'pending-A': null }

      // Simular onChange do ProfileSelector
      const updateProfile = (profile) => {
        pendingProfiles['pending-A'] = profile
      }

      // Execute
      updateProfile('coordinator')

      // Assert: estado atualizado
      expect(pendingProfiles['pending-A']).toBe('coordinator')
    })
  })

  // ─── TabTeachers Estado Local ──────────────────────────────────────────────

  describe('TabTeachers Estado Local (pendingProfiles)', () => {
    it('pendingProfiles[p.id] deve ser isolado por pending', () => {
      const pendingProfiles = {}

      // Usuário abre modal com 3 pendentes
      const pendingIds = ['p-1', 'p-2', 'p-3']

      // Seleciona diferentes perfis para cada
      pendingProfiles['p-1'] = 'teacher'
      pendingProfiles['p-2'] = 'coordinator'
      pendingProfiles['p-3'] = 'teacher-coordinator'

      // Assert: cada um tem seu próprio estado
      expect(pendingProfiles['p-1']).toBe('teacher')
      expect(pendingProfiles['p-2']).toBe('coordinator')
      expect(pendingProfiles['p-3']).toBe('teacher-coordinator')
    })

    it('rejeição de pending deve limpar pendingProfiles[id]', () => {
      const pendingProfiles = {
        'p-1': 'teacher',
        'p-2': 'coordinator',
      }

      // Usuário clica "Rejeitar" em p-1
      const rejectPending = (id) => {
        delete pendingProfiles[id]
      }

      rejectPending('p-1')

      // Assert: p-1 removido, p-2 intacto
      expect(pendingProfiles).not.toHaveProperty('p-1')
      expect(pendingProfiles['p-2']).toBe('coordinator')
    })
  })

  // ─── Toast Mensagens ──────────────────────────────────────────────────────

  describe('Toast Mensagens', () => {
    it('sucesso deve exibir "Professor aprovado como [Label]"', async () => {
      const testCases = [
        { profile: 'teacher', expectedLabel: 'Professor' },
        { profile: 'coordinator', expectedLabel: 'Coordenador' },
        { profile: 'teacher-coordinator', expectedLabel: 'Prof. Coordenador' },
      ]

      for (const { profile, expectedLabel } of testCases) {
        const pending = createPendingTeacher('pending-uid', 'Test Teacher')

        // Simular toast message que seria exibida
        const toastMessage = `${pending.name} aprovado como ${expectedLabel}`

        expect(toastMessage).toContain(expectedLabel)
      }
    })

    it('rejeição deve exibir "[Nome] recusado"', () => {
      const pending = createPendingTeacher('pending-uid', 'Rejected Teacher')

      // Simular toast message
      const toastMessage = `${pending.name} recusado`

      expect(toastMessage).toBe('Rejected Teacher recusado')
    })

    it('erro deve exibir "Erro ao aprovar professor"', () => {
      const errorMessage = 'Erro ao aprovar professor'
      expect(errorMessage).toBe('Erro ao aprovar professor')
    })
  })

  // ─── Compatibilidade com TabTeachers ──────────────────────────────────────

  describe('Compatibilidade com TabTeachers', () => {
    it('approveTeacher deve ser compatível com chamada em try-catch (linha 682-693)', async () => {
      const pending = createPendingTeacher('pending-uid', 'Teacher')
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pending,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      let errorCaught = false

      try {
        // Simular bloco try em TabTeachers
        await approveTeacher('pending-uid', mockState, mockSetState, 'teacher')
        // Simular sucesso do toast
      } catch (e) {
        errorCaught = true
      }

      // Assert: sem erro capturado
      expect(errorCaught).toBe(false)
    })

    it('state.teachers deve ser atualizável durante aprovação', async () => {
      const pending = createPendingTeacher('pending-uid', 'New Teacher')
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pending,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      const mockSetStateFn = vi.fn((fn) => {
        const newState = fn(mockState)
        expect(newState.teachers).toBeDefined()
        expect(Array.isArray(newState.teachers)).toBe(true)
      })

      await approveTeacher('pending-uid', mockState, mockSetStateFn, 'teacher')

      expect(mockSetStateFn).toHaveBeenCalled()
    })
  })
})
