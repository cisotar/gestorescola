import { describe, it, expect, vi } from 'vitest'

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
  uid: vi.fn(() => 'mock-teacher-id-123'),
}))

vi.mock('../lib/firebase/multi-tenant', () => ({
  getSchoolCollectionRef: vi.fn((schoolId, sub) => ({ _path: `schools/${schoolId}/${sub}` })),
  getSchoolDocRef: vi.fn((schoolId, sub, id) => ({ _path: `schools/${schoolId}/${sub}/${id}` })),
  getSchoolConfigRef: vi.fn((schoolId) => ({ _path: `schools/${schoolId}/config/main` })),
  getSchoolRef: vi.fn((schoolId) => ({ _path: `schools/${schoolId}` })),
}))

import { getDoc, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore'
import { approveTeacher } from '../lib/db/index.js'

const SCHOOL_ID = 'sch-default'

const pendingData = {
  id: 'pending-uid', uid: 'pending-uid',
  email: 'teacher@example.com', name: 'João Silva',
  photoURL: '', requestedAt: new Date(), status: 'pending', profile: null,
  subjectIds: [],
}

const mockState = { teachers: [] }

function setupMocks() {
  getDoc.mockResolvedValue({ exists: () => true, data: () => pendingData })
  getDocs.mockResolvedValue({ docs: [] })
  const batch = { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) }
  writeBatch.mockReturnValue(batch)
  setDoc.mockResolvedValue(undefined)
  deleteDoc.mockResolvedValue(undefined)
  return batch
}

describe('approveTeacher — validação de profile', () => {
  it('aceita "teacher"', async () => {
    setupMocks()
    await expect(approveTeacher(SCHOOL_ID, 'pending-uid', mockState, vi.fn(), 'teacher')).resolves.not.toThrow()
  })

  it('aceita "coordinator"', async () => {
    setupMocks()
    await expect(approveTeacher(SCHOOL_ID, 'pending-uid', mockState, vi.fn(), 'coordinator')).resolves.not.toThrow()
  })

  it('aceita "teacher-coordinator"', async () => {
    setupMocks()
    await expect(approveTeacher(SCHOOL_ID, 'pending-uid', mockState, vi.fn(), 'teacher-coordinator')).resolves.not.toThrow()
  })

  it('usa "teacher" como default sem emitir warning', async () => {
    setupMocks()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await approveTeacher(SCHOOL_ID, 'pending-uid', mockState, vi.fn())
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('faz fallback para "teacher" e emite console.warn para valor inválido', async () => {
    setupMocks()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await approveTeacher(SCHOOL_ID, 'pending-uid', mockState, vi.fn(), 'admin')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('admin'))
    warnSpy.mockRestore()
  })

  it('faz fallback para "teacher" para string vazia', async () => {
    setupMocks()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await approveTeacher(SCHOOL_ID, 'pending-uid', mockState, vi.fn(), '')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('é noop quando pending_teachers não existe', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    const batch = { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() }
    writeBatch.mockReturnValue(batch)
    await approveTeacher(SCHOOL_ID, 'nao-existe', mockState, vi.fn(), 'teacher')
    expect(batch.commit).not.toHaveBeenCalled()
  })
})
