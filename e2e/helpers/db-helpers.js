/**
 * Funções PURAS + utilitários de reset para testes E2E.
 *
 * As factories (createTeacher, createAbsence, ...) retornam objetos prontos
 * para persistir no Firestore; nenhuma faz I/O.
 *
 * As funções de reset (resetEmulatorState, reseedEmulator) usam a REST API
 * dos Firebase Emulators (Auth + Firestore) — não reiniciam o emulator,
 * apenas zeram dados em <100ms.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'saasgestaoescolar-test'
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080'
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099'

/**
 * Apaga TODO o estado dos emulators (Auth + Firestore) via REST.
 * Não restaura — combine com reseedEmulator() se quiser dados base.
 * @returns {Promise<void>}
 */
export async function resetEmulatorState() {
  const firestoreUrl = `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`
  const authUrl = `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`

  const [fsRes, authRes] = await Promise.all([
    fetch(firestoreUrl, { method: 'DELETE' }),
    fetch(authUrl, { method: 'DELETE' }),
  ])

  if (!fsRes.ok) throw new Error(`Falha ao resetar Firestore emulator: HTTP ${fsRes.status}`)
  if (!authRes.ok) throw new Error(`Falha ao resetar Auth emulator: HTTP ${authRes.status}`)
}

/**
 * Reseta + re-seeda. Use em test.beforeEach() de specs que mutam estado.
 * Importa dinamicamente o seed para evitar carregar firebase-admin em
 * testes que não precisam.
 * @returns {Promise<{schoolId: string, users: number, durationMs: number}>}
 */
export async function reseedEmulator() {
  const { seedAll } = await import('../../scripts/seed-emulator.js')
  return seedAll()
}

/**
 * Gera um ID único simples para testes
 * @returns {string} ID de 12 caracteres alfanuméricos
 */
function generateTestId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7)
}

/**
 * Cria estrutura de professor
 * @param {string} name — "Prof Teste A"
 * @param {string} email — "prof@test-escola.com"
 * @param {Array<string>} subjectIds — ["subj-bio", "subj-cien"] ou []
 * @param {string} profile — "teacher" | "coordinator" | "teacher-coordinator"
 * @returns {Object} — documento pronto para salvar em teachers/
 *
 * Retorna:
 * {
 *   id: uid(),
 *   name,
 *   email,
 *   profile,
 *   subjectIds,
 *   status: 'approved',
 *   celular: '',
 *   whatsapp: '',
 *   apelido: ''
 * }
 */
export function createTeacher(name, email, subjectIds, profile) {
  return {
    id: generateTestId(),
    name,
    email,
    profile,
    subjectIds: subjectIds || [],
    status: 'approved',
    celular: '',
    whatsapp: '',
    apelido: ''
  }
}

/**
 * Cria estrutura de ausência com múltiplos slots
 * @param {string} teacherId — uid do professor ausente
 * @param {Array<Object>} slots — [{ date, day, timeSlot, scheduleId, subjectId, turma }, ...]
 * @returns {Object} — documento pronto para salvar em absences/
 *
 * Retorna:
 * {
 *   id: uid(),
 *   teacherId,
 *   status: calcAbsenceStatus(slots),  ← 'open' pois substituteId=null em todos
 *   slots: [
 *     { id: uid(), date, day, timeSlot, scheduleId, subjectId, turma, substituteId: null },
 *     ...
 *   ],
 *   createdAt: formatISO(new Date())
 * }
 *
 * Validações:
 * - Todos slots devem ter { date (ISO), day (Segunda/Terça/...), timeSlot (seg-fund|manha|1) }
 * - scheduleId pode ser null (aula extra)
 * - subjectId é obrigatório (para ranking)
 */
export function createAbsence(teacherId, slots) {
  if (!slots || slots.length === 0) {
    throw new Error('createAbsence: slots não pode estar vazio')
  }

  const processedSlots = slots.map(slot => ({
    id: generateTestId(),
    date: slot.date,
    day: slot.day,
    timeSlot: slot.timeSlot,
    scheduleId: slot.scheduleId || null,
    subjectId: slot.subjectId,
    turma: slot.turma,
    substituteId: null
  }))

  return {
    id: generateTestId(),
    teacherId,
    status: calcAbsenceStatus(processedSlots),
    slots: processedSlots,
    createdAt: new Date().toISOString()
  }
}

/**
 * Cria estrutura de professor pendente (solicitação de acesso)
 * @param {string} email — "novo@test-escola.com"
 * @param {string} name — "Novo Prof"
 * @param {string} uid — Firebase UID (ex: "firebase-auth-abc123")
 * @returns {Object} — documento pronto para salvar em pending_teachers/
 *
 * Retorna:
 * {
 *   id: uid,
 *   uid,
 *   email,
 *   name,
 *   status: 'pending',
 *   requestedAt: timestamp,  ← ISO string
 *   photoURL: null,
 *   celular: '',
 *   apelido: '',
 *   subjectIds: []
 * }
 */
export function createPendingTeacher(email, name, uid) {
  return {
    id: uid,
    uid,
    email,
    name,
    status: 'pending',
    requestedAt: new Date().toISOString(),
    photoURL: null,
    celular: '',
    apelido: '',
    subjectIds: []
  }
}

/**
 * Calcula status de ausência baseado em slots
 * @param {Array<Object>} slots — [{ ..., substituteId }, ...]
 * @returns {string} — 'open' | 'partial' | 'covered'
 *
 * Lógica:
 * - covered: todos slots têm substituteId !== null
 * - open: nenhum slot tem substituteId !== null
 * - partial: alguns têm, outros não
 *
 * Casos extremos:
 * - slots vazio: retorna 'open'
 * - todos com substituteId=null: retorna 'open'
 */
export function calcAbsenceStatus(slots) {
  if (!slots || slots.length === 0) {
    return 'open'
  }

  const withSubstitute = slots.filter(s => s.substituteId !== null && s.substituteId !== undefined)
  const total = slots.length

  if (withSubstitute.length === 0) {
    return 'open'
  }

  if (withSubstitute.length === total) {
    return 'covered'
  }

  return 'partial'
}
