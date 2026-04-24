import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { approveTeacher } from '../lib/db/index.js'

// ─── Mocks de Firestore ───────────────────────────────────────────────────────

// Mock do módulo firebase/firestore
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

// Mock do módulo firebase/app
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ _mock: true })),
}))

// Mock do módulo firebase/auth
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ _mock: true })),
  GoogleAuthProvider: vi.fn(),
}))

// Mock do módulo firebase principal
vi.mock('../firebase', () => ({
  db: { _mock: true },
  app: { _mock: true },
  auth: { _mock: true },
  provider: { _mock: true },
}))

// Mock do módulo helpers/ids
vi.mock('../lib/helpers/ids', () => ({
  uid: vi.fn(() => 'mock-teacher-id-123'),
}))

// Imports após mocks
import { getDoc, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore'

// ─── Fixtures compartilhadas ──────────────────────────────────────────────────

const pendingTeacherData = {
  id: 'pending-uid-123',
  uid: 'pending-uid-123',
  email: 'teacher@example.com',
  name: 'João da Silva',
  photoURL: 'https://example.com/photo.jpg',
  requestedAt: new Date('2026-01-01'),
  status: 'pending',
  profile: null,
  celular: '11987654321',
  apelido: 'João',
  subjectIds: ['subj-mat', 'subj-fis'],
  horariosSemana: {
    Segunda: { entrada: '07:00', saida: '12:30' },
  },
}

const mockState = {
  teachers: [
    { id: 'existing-teacher-1', name: 'Existing Teacher', email: 'existing@example.com' },
  ],
  schedules: [],
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('approveTeacher', () => {
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

  // ─── Caminho Feliz ────────────────────────────────────────────────────────

  describe('Caminho Feliz', () => {
    it('aprova professor com profile válido (teacher)', async () => {
      // Setup: pending_teachers/{uid} existe com dados válidos
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ ...pendingTeacherData, profile: 'teacher' }),
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      // Execute
      await approveTeacher('pending-uid-123', mockState, mockSetState, 'teacher')

      // Assert: setDoc foi chamado com profile correto
      expect(setDoc).toHaveBeenCalled()
      const setDocCall = setDoc.mock.calls[0]
      expect(setDocCall[1]).toMatchObject({
        status: 'approved',
        profile: 'teacher',
      })

      // Assert: pending_teachers/{uid} foi deletado
      expect(deleteDoc).toHaveBeenCalled()
    })

    it('aprova professor com profile válido (coordinator)', async () => {
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ ...pendingTeacherData, profile: 'coordinator' }),
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-uid-123', mockState, mockSetState, 'coordinator')

      const setDocCall = setDoc.mock.calls[0]
      expect(setDocCall[1]).toMatchObject({
        status: 'approved',
        profile: 'coordinator',
      })
      expect(deleteDoc).toHaveBeenCalled()
    })

    it('aprova professor com profile válido (teacher-coordinator)', async () => {
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ ...pendingTeacherData, profile: 'teacher-coordinator' }),
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-uid-123', mockState, mockSetState, 'teacher-coordinator')

      const setDocCall = setDoc.mock.calls[0]
      expect(setDocCall[1]).toMatchObject({
        status: 'approved',
        profile: 'teacher-coordinator',
      })
      expect(deleteDoc).toHaveBeenCalled()
    })
  })

  // ─── Profile Inválido — Fallback ──────────────────────────────────────────

  describe('Profile Inválido — Fallback', () => {
    it('usa default "teacher" quando profile é inválido', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ ...pendingTeacherData, profile: 'invalid-profile' }),
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      // Execute com profile inválido
      await approveTeacher('pending-uid-123', mockState, mockSetState, 'invalid-profile')

      // Assert: console.warn foi chamado
      expect(consoleSpy).toHaveBeenCalledWith(
        '[db] Profile inválido: invalid-profile, usando default \'teacher\''
      )

      // Assert: setDoc foi chamado com profile = 'teacher'
      const setDocCall = setDoc.mock.calls[0]
      expect(setDocCall[1]).toMatchObject({
        status: 'approved',
        profile: 'teacher',
      })

      consoleSpy.mockRestore()
    })

    it('usa default "teacher" para valor null ou undefined', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pendingTeacherData,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      // Execute com profile = null
      await approveTeacher('pending-uid-123', mockState, mockSetState, null)

      // Assert: profile inválido, usa default
      const setDocCall = setDoc.mock.calls[0]
      expect(setDocCall[1]).toMatchObject({
        status: 'approved',
        profile: 'teacher',
      })

      consoleSpy.mockRestore()
    })
  })

  // ─── Backward Compatibility ───────────────────────────────────────────────

  describe('Backward Compatibility', () => {
    it('usa profile default "teacher" quando parâmetro não é fornecido', async () => {
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pendingTeacherData,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      // Execute sem parâmetro profile
      await approveTeacher('pending-uid-123', mockState, mockSetState)

      // Assert: setDoc foi chamado com profile = 'teacher' (default)
      const setDocCall = setDoc.mock.calls[0]
      expect(setDocCall[1]).toMatchObject({
        status: 'approved',
        profile: 'teacher',
      })
      expect(deleteDoc).toHaveBeenCalled()
    })

    it('compatibilidade com chamadas legadas sem profile', async () => {
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: 'legacy-uid',
          uid: 'legacy-uid',
          email: 'legacy@example.com',
          name: 'Legacy Teacher',
          // Note: profile é null ou ausente em dados legacy
        }),
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      // Simular chamada legacy (3 parâmetros, sem profile)
      const mockSetStateLegacy = vi.fn((fn) => {
        if (typeof fn === 'function') {
          fn(mockState)
        }
      })

      await approveTeacher('legacy-uid', mockState, mockSetStateLegacy)

      // Assert: professor é aprovado com default profile
      expect(setDoc).toHaveBeenCalled()
      const setDocCall = setDoc.mock.calls[0]
      expect(setDocCall[1]).toMatchObject({
        status: 'approved',
        profile: 'teacher',
      })
    })
  })

  // ─── Casos de Borda ───────────────────────────────────────────────────────

  describe('Casos de Borda', () => {
    it('não faz nada quando pending_teachers/{uid} não existe', async () => {
      getDoc.mockResolvedValueOnce({
        exists: () => false,
      })

      await approveTeacher('non-existent-uid', mockState, mockSetState, 'coordinator')

      // Assert: nenhuma operação foi feita
      expect(setDoc).not.toHaveBeenCalled()
      expect(deleteDoc).not.toHaveBeenCalled()
    })

    it('migra schedules órfãos do pendingId para novo teacher.id', async () => {
      const orphanSchedules = [
        { id: 'schedule-1', teacherId: 'pending-uid-123' },
        { id: 'schedule-2', teacherId: 'pending-uid-123' },
      ]

      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pendingTeacherData,
      })

      // Mock de getDocs para retornar schedules órfãos
      getDocs.mockResolvedValueOnce({
        empty: false,
        docs: orphanSchedules.map((s) => ({
          id: s.id,
          data: () => s,
        })),
      })

      // Mock de writeBatch para migrar schedules
      const batchMock = {
        update: vi.fn(),
        commit: vi.fn(),
      }
      writeBatch.mockReturnValue(batchMock)

      await approveTeacher('pending-uid-123', mockState, mockSetState, 'teacher')

      // Assert: writeBatch.update foi chamado para cada schedule
      expect(batchMock.update).toHaveBeenCalledTimes(2)
      expect(batchMock.commit).toHaveBeenCalled()
    })

    it('persiste campos do pending_teachers em novo teacher', async () => {
      const dataWithFields = {
        ...pendingTeacherData,
        celular: '11987654321',
        apelido: 'João',
        subjectIds: ['subj-mat', 'subj-fis'],
        horariosSemana: {
          Segunda: { entrada: '07:00', saida: '12:30' },
        },
      }

      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => dataWithFields,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-uid-123', mockState, mockSetState, 'coordinator')

      // Assert: todos os campos do pending_teachers foram persistidos
      const setDocCall = setDoc.mock.calls[0]
      expect(setDocCall[1]).toMatchObject({
        email: 'teacher@example.com',
        name: 'João da Silva',
        celular: '11987654321',
        apelido: 'João',
        subjectIds: ['subj-mat', 'subj-fis'],
        horariosSemana: { Segunda: { entrada: '07:00', saida: '12:30' } },
        status: 'approved',
        profile: 'coordinator',
      })
    })

    it('atualiza store com novo teacher em estado', async () => {
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pendingTeacherData,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      const mockSetStateFn = vi.fn((fn) => {
        const newState = fn(mockState)
        // Verificar que teachers foram atualizados
        expect(newState.teachers).toBeDefined()
      })

      await approveTeacher('pending-uid-123', mockState, mockSetStateFn, 'teacher')

      // Assert: setState foi chamado ao menos uma vez para atualizar teachers
      expect(mockSetStateFn).toHaveBeenCalled()
    })
  })

  // ─── Validação de Valores Inválidos ────────────────────────────────────────

  describe('Validação de Valores Inválidos', () => {
    it('rejeita valores case-sensitive (e.g., "Teacher" vs "teacher")', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pendingTeacherData,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      // Execute com profile em uppercase
      await approveTeacher('pending-uid-123', mockState, mockSetState, 'TEACHER')

      // Assert: usa default porque 'TEACHER' !== 'teacher'
      expect(consoleSpy).toHaveBeenCalledWith(
        '[db] Profile inválido: TEACHER, usando default \'teacher\''
      )

      const setDocCall = setDoc.mock.calls[0]
      expect(setDocCall[1].profile).toBe('teacher')

      consoleSpy.mockRestore()
    })

    it('rejeita string vazia', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pendingTeacherData,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-uid-123', mockState, mockSetState, '')

      expect(consoleSpy).toHaveBeenCalledWith(
        '[db] Profile inválido: , usando default \'teacher\''
      )

      const setDocCall = setDoc.mock.calls[0]
      expect(setDocCall[1].profile).toBe('teacher')

      consoleSpy.mockRestore()
    })

    it('rejeita typos comuns (e.g., "coordenador" em português)', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => pendingTeacherData,
      })
      getDocs.mockResolvedValueOnce({ empty: true })

      await approveTeacher('pending-uid-123', mockState, mockSetState, 'coordenador')

      expect(consoleSpy).toHaveBeenCalledWith(
        '[db] Profile inválido: coordenador, usando default \'teacher\''
      )

      consoleSpy.mockRestore()
    })
  })
})
