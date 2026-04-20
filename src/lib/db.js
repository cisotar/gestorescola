import { db } from './firebase'
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, writeBatch, serverTimestamp, query, where, onSnapshot, orderBy, limit,
} from 'firebase/firestore'
import { uid } from './helpers'

const LS_KEY = 'gestao_v8_cache'

/**
 * Seed padrão de turmas compartilhadas.
 *
 * @typedef {Object} SharedSeries
 * @property {string} id - Identificador único (ex: 'shared-formacao')
 * @property {string} name - Nome exibido (ex: 'FORMAÇÃO')
 * @property {'formation'|'elective'} type - Tipo de turma:
 *   - 'formation' — turmas de formação (ex: ATPCG, ATPCA) que NÃO demandam substituto
 *   - 'elective' — turmas eletivas que DEMANDAM substituto como aulas regulares
 *
 * @example
 * {
 *   id: 'shared-formacao',
 *   name: 'FORMAÇÃO',
 *   type: 'formation'  // não demanda substituto
 * }
 */
const DEFAULT_SHARED_SERIES = [
  {
    id: 'shared-formacao',
    name: 'FORMAÇÃO',
    type: 'formation',
  },
]

// ─── Carregamento inicial ─────────────────────────────────────────────────────

export async function loadFromFirestore() {
  const TTL_MS = 3600000 // 1 hora
  const cached = _loadFromLS()

  // Se cache é recente (< 1h), usar cache
  if (cached.data && cached.timestamp && Date.now() - cached.timestamp < TTL_MS) {
    const remainingMin = Math.round((TTL_MS - (Date.now() - cached.timestamp)) / 1000 / 60)
    console.log(`[db] Usando cache LS (válido por ${remainingMin}min)`)
    return cached.data
  }

  try {
    const [config, teachers, schedules, absences, history] = await Promise.all([
      _loadConfig(),
      _loadCol('teachers'),
      _loadCol('schedules'),
      _loadCol('absences'),
      _loadCol('history'),
    ])

    return { ...config, teachers, schedules, absences, history }
  } catch (e) {
    console.warn('[db] Firestore falhou, usando cache:', e)
    // Sempre tem fallback: cache antigo (mesmo que expirado) é melhor que vazio
    return cached.data || {}
  }
}

async function _loadConfig() {
  const snap = await getDoc(doc(db, 'meta', 'config'))
  if (!snap.exists()) {
    try {
      await setDoc(doc(db, 'meta', 'config'), { sharedSeries: DEFAULT_SHARED_SERIES }, { merge: true })
    } catch (e) {
      console.warn('[db] Falha ao persistir seed de sharedSeries:', e)
    }
    return { sharedSeries: DEFAULT_SHARED_SERIES }
  }
  const data = snap.data()
  const keys = ['segments','periodConfigs','areas','subjects','sharedSeries','workloadWarn','workloadDanger']
  const result = {}
  keys.forEach(k => { if (data[k] !== undefined) result[k] = data[k] })
  if (!data.sharedSeries?.length) {
    result.sharedSeries = DEFAULT_SHARED_SERIES
    try {
      await setDoc(doc(db, 'meta', 'config'), { sharedSeries: DEFAULT_SHARED_SERIES }, { merge: true })
    } catch (e) {
      console.warn('[db] Falha ao persistir seed de sharedSeries:', e)
    }
  }
  return result
}

export async function _loadCol(name) {
  const snap = await getDocs(collection(db, name))
  return snap.empty ? [] : snap.docs.map(d => d.data())
}

// ─── Listeners em tempo real ──────────────────────────────────────────────────

export function setupRealtimeListeners(store) {
  const unsubscribes = []

  // Config listener (meta/config)
  const unsubConfig = onSnapshot(
    doc(db, 'meta', 'config'),
    snap => {
      if (snap.exists()) {
        const data = snap.data()
        store.hydrate({
          segments: data.segments,
          periodConfigs: data.periodConfigs,
          areas: data.areas,
          subjects: data.subjects,
          sharedSeries: data.sharedSeries ?? [],
          workloadWarn: data.workloadWarn,
          workloadDanger: data.workloadDanger,
        })
      }
    },
    err => console.warn('[configListener]', err)
  )
  unsubscribes.push(unsubConfig)

  // Teachers listener
  const unsubTeachers = onSnapshot(
    collection(db, 'teachers'),
    snap => {
      store.setTeachers(snap.docs.map(d => d.data()))
      store.markTeachersLoaded()
    },
    err => console.warn('[teachersListener]', err)
  )
  unsubscribes.push(unsubTeachers)

  // Schedules listener
  const unsubSchedules = onSnapshot(
    collection(db, 'schedules'),
    snap => {
      store.setSchedules(snap.docs.map(d => d.data()))
      store.markSchedulesLoaded()
    },
    err => console.warn('[schedulesListener]', err)
  )
  unsubscribes.push(unsubSchedules)

  return unsubscribes
}

// ─── Lazy listener registration ────────────────────────────────────────────────

export function registerAbsencesListener(store) {
  return onSnapshot(
    collection(db, 'absences'),
    snap => {
      store.setAbsences(snap.docs.map(d => d.data()))
      store.markAbsencesLoaded()
    },
    err => console.warn('[absencesListener]', err)
  )
}

export function registerHistoryListener(store) {
  return onSnapshot(
    collection(db, 'history'),
    snap => {
      store.setHistory(snap.docs.map(d => d.data()))
      store.markHistoryLoaded()
    },
    err => console.warn('[historyListener]', err)
  )
}

// ─── Persistência ─────────────────────────────────────────────────────────────

export async function saveToFirestore(state) {
  _saveToLS(state)
  try {
    const batch = writeBatch(db)
    batch.set(doc(db, 'meta', 'config'), {
      segments: state.segments, periodConfigs: state.periodConfigs,
      areas: state.areas, subjects: state.subjects, sharedSeries: state.sharedSeries ?? [],
      workloadWarn: state.workloadWarn, workloadDanger: state.workloadDanger,
      updatedAt: serverTimestamp(),
    })
    await batch.commit()
    await Promise.all([
      _syncCol('teachers',  state.teachers),
      _syncCol('schedules', state.schedules),
      _syncCol('absences',  state.absences ?? []),
      _syncCol('history',   state.history  ?? []),
    ])
  } catch (e) {
    console.error('[db] Falha ao salvar:', e)
    throw e
  }
}

async function _syncCol(name, items) {
  if (!items?.length) return
  const CHUNK = 400
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = writeBatch(db)
    items.slice(i, i + CHUNK).forEach(item => batch.set(doc(db, name, item.id), item))
    await batch.commit()
  }
}

export async function saveDoc(colName, item) {
  try { await setDoc(doc(db, colName, item.id), item) } catch (e) { console.error(e) }
}

export async function deleteDocById(colName, id) {
  try { await deleteDoc(doc(db, colName, id)) } catch (e) { console.error(e) }
}

// ─── Atualização Granular ──────────────────────────────────────────────────
// Atualiza apenas campos específicos de um documento (não sobrescreve o inteiro)
// Usar em ações de UI: editar professor, horário, ausência, etc.
// Nota: updateDoc() é mais eficiente que setDoc() para edições parciais
export async function updateDocById(colName, id, changes) {
  await updateDoc(doc(db, colName, id), changes)
}

export async function saveConfig(state) {
  try {
    await setDoc(doc(db, 'meta', 'config'), {
      segments: state.segments, periodConfigs: state.periodConfigs,
      areas: state.areas, subjects: state.subjects, sharedSeries: state.sharedSeries ?? [],
      workloadWarn: state.workloadWarn, workloadDanger: state.workloadDanger,
      updatedAt: serverTimestamp(),
    })
  } catch (e) { console.error(e) }
}

// ─── Admins ───────────────────────────────────────────────────────────────────

const HARDCODED_ADMINS = [
  'contato.tarciso@gmail.com',
  'tarciso@prof.educacao.sp.gov.br',
  'fernandamarquesi@prof.educacao.sp.gov.br',
]

const emailKey = (email) => email.toLowerCase().replace(/[.#$/[\]]/g, '_')

export async function isAdmin(email) {
  if (!email) return false
  if (HARDCODED_ADMINS.includes(email.toLowerCase())) return true
  try {
    const snap = await getDoc(doc(db, 'admins', emailKey(email)))
    return snap.exists()
  } catch { return false }
}

export async function addAdmin(email, name = '') {
  await setDoc(doc(db, 'admins', emailKey(email)), { email, name, addedAt: serverTimestamp() })
}

export async function listAdmins() {
  const snap = await getDocs(collection(db, 'admins'))
  return snap.docs.map(d => d.data())
}

export async function removeAdmin(email) {
  await deleteDoc(doc(db, 'admins', emailKey(email)))
}

// ─── Professores por e-mail ───────────────────────────────────────────────────

export async function getTeacherByEmail(email, teachers) {
  if (!email) return null
  const local = teachers?.find(t => t.email?.toLowerCase() === email.toLowerCase())
  if (local) return local
  try {
    const snap = await getDocs(query(collection(db, 'teachers'), where('email', '==', email.toLowerCase())))
    return snap.empty ? null : snap.docs[0].data()
  } catch { return null }
}

// ─── Professores pendentes ────────────────────────────────────────────────────

export async function requestTeacherAccess(user) {
  const ref  = doc(db, 'pending_teachers', user.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return
  await setDoc(ref, {
    id: user.uid, uid: user.uid, email: user.email.toLowerCase(),
    name: user.displayName ?? '', photoURL: user.photoURL ?? '',
    requestedAt: serverTimestamp(), status: 'pending',
  })
}

export async function updatePendingData(uid, { celular, apelido, subjectIds, horariosSemana }) {
  await updateDoc(doc(db, 'pending_teachers', uid), { celular, apelido, subjectIds, horariosSemana })
}

export async function listPendingTeachers() {
  const snap = await getDocs(collection(db, 'pending_teachers'))
  return snap.docs.map(d => d.data()).filter(d => d.status === 'pending')
}

/**
 * Atualiza campos do próprio perfil de um professor aprovado.
 * O Firestore permite que o professor grave apenas os campos listados em
 * `hasOnly` na regra `allow update` de `teachers/{docId}`:
 * celular, whatsapp, apelido, name, subjectIds, horariosSemana.
 *
 * O campo `horariosSemana` descreve os horários de presença do professor
 * na escola por dia da semana. Formato esperado:
 *
 * @example
 * // Professor que trabalha de segunda a quarta (manhã) e quarta a sexta (tarde):
 * {
 *   "Segunda": { entrada: "07:00", saida: "12:30" },
 *   "Terça":   { entrada: "07:00", saida: "12:30" },
 *   "Quarta":  { entrada: "07:00", saida: "17:20" },
 *   "Quinta":  { entrada: "13:00", saida: "17:20" },
 *   "Sexta":   { entrada: "13:00", saida: "17:20" }
 * }
 *
 * Semântica:
 * - Dia ausente do objeto  → professor NÃO trabalha naquele dia
 * - Campo `horariosSemana` ausente ou `null` → sem restrição de horário
 *   (professor aparece no ranking de substitutos normalmente)
 * - Objeto vazio `{}` → tratado como ausente pelas funções de ranking
 *
 * Chaves de dia válidas: "Segunda", "Terça", "Quarta", "Quinta", "Sexta"
 * (alinhadas com `schedules[].day` e `DAYS` em `src/lib/constants.js`).
 *
 * @param {string} id - Document ID do professor em `teachers/`
 * @param {object} changes - Campos a atualizar (parcial)
 */
export async function patchTeacherSelf(id, changes) {
  await updateDoc(doc(db, 'teachers', id), changes)
}

export async function approveTeacher(pendingId, state, setState, profile = 'teacher') {
  const ref  = doc(db, 'pending_teachers', pendingId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data()

  let teacher = state.teachers.find(t => t.email?.toLowerCase() === data.email)
  if (!teacher) {
    const { uid } = await import('./helpers')
    teacher = {
      id: uid(), name: data.name, email: data.email, whatsapp: '',
      celular: data.celular ?? '', apelido: data.apelido ?? '',
      subjectIds: data.subjectIds ?? [], status: 'approved', profile,
      horariosSemana: data.horariosSemana ?? null,
    }
    setState(s => ({ teachers: [...s.teachers, teacher] }))
  } else {
    setState(s => ({
      teachers: s.teachers.map(t => t.id === teacher.id ? { ...t, status: 'approved', profile } : t),
    }))
  }

  await setDoc(doc(db, 'teachers', teacher.id), {
    ...teacher, status: 'approved', profile,
    horariosSemana: data.horariosSemana ?? teacher.horariosSemana ?? null,
  })

  // Migrar schedules do UID pendente para o novo teacher.id
  const orphanSnap = await getDocs(
    query(collection(db, 'schedules'), where('teacherId', '==', pendingId))
  )
  if (!orphanSnap.empty) {
    const batch = writeBatch(db)
    orphanSnap.docs.forEach(d => {
      batch.update(doc(db, 'schedules', d.id), { teacherId: teacher.id })
    })
    await batch.commit()
    setState(s => ({
      schedules: s.schedules.map(sc =>
        sc.teacherId === pendingId ? { ...sc, teacherId: teacher.id } : sc
      ),
    }))
  }

  await deleteDoc(ref)
}

export async function rejectTeacher(pendingId, setState) {
  const orphanSnap = await getDocs(
    query(collection(db, 'schedules'), where('teacherId', '==', pendingId))
  )
  if (!orphanSnap.empty) {
    const batch = writeBatch(db)
    orphanSnap.docs.forEach(d => batch.delete(doc(db, 'schedules', d.id)))
    await batch.commit()
    if (setState) {
      setState(s => ({
        schedules: s.schedules.filter(sc => sc.teacherId !== pendingId),
      }))
    }
  }
  await deleteDoc(doc(db, 'pending_teachers', pendingId))
}

// ─── Migrações ────────────────────────────────────────────────────────────────

export async function migrateFormationSchedules() {
  const MIGRATION_MAP = {
    'FORMAÇÃO - ATPCG':      { turma: 'FORMAÇÃO', subjectId: 'formation-atpcg'      },
    'FORMAÇÃO - ATPCA':      { turma: 'FORMAÇÃO', subjectId: 'formation-atpca'      },
    'FORMAÇÃO - MULTIPLICA': { turma: 'FORMAÇÃO', subjectId: 'formation-multiplica' },
    'FORMAÇÃO - PDA':        { turma: 'FORMAÇÃO', subjectId: 'formation-pda'        },
  }

  const snap = await getDocs(collection(db, 'schedules'))
  const toMigrate = snap.docs.filter(d => MIGRATION_MAP[d.data().turma])

  if (toMigrate.length === 0) {
    console.log('[migration] Nenhum schedule de formação para migrar.')
    return 0
  }

  const CHUNK = 400
  let migrated = 0
  for (let i = 0; i < toMigrate.length; i += CHUNK) {
    const batch = writeBatch(db)
    toMigrate.slice(i, i + CHUNK).forEach(d => {
      const mapped = MIGRATION_MAP[d.data().turma]
      batch.update(doc(db, 'schedules', d.id), mapped)
    })
    await batch.commit()
    migrated += toMigrate.slice(i, i + CHUNK).length
  }

  console.log(`[migration] ${migrated} schedules migrados.`)
  return migrated
}

export async function migrateSharedSeriesActivities(idMap = {}) {
  const entries = Object.entries(idMap).filter(([fromId, toId]) => fromId && toId && fromId !== toId)
  if (entries.length === 0) {
    console.log('[migration] Nada a migrar.')
    return 0
  }

  const map = Object.fromEntries(entries)
  const snap = await getDocs(collection(db, 'schedules'))
  const toMigrate = snap.docs.filter(d => map[d.data().subjectId])

  if (toMigrate.length === 0) {
    console.log('[migration] Nada a migrar.')
    return 0
  }

  const CHUNK = 400
  let migrated = 0
  for (let i = 0; i < toMigrate.length; i += CHUNK) {
    const batch = writeBatch(db)
    toMigrate.slice(i, i + CHUNK).forEach(d => {
      batch.update(doc(db, 'schedules', d.id), { subjectId: map[d.data().subjectId] })
    })
    await batch.commit()
    migrated += toMigrate.slice(i, i + CHUNK).length
  }

  console.log(`[migration] ${migrated} schedules migrados.`)
  return migrated
}

// ─── LocalStorage fallback ────────────────────────────────────────────────────

export function _saveToLS(state) {
  try {
    const { segments, periodConfigs, areas, subjects, teachers,
            schedules, absences, history, sharedSeries, workloadWarn, workloadDanger } = state
    localStorage.setItem(LS_KEY, JSON.stringify({
      data: {
        segments, periodConfigs, areas, subjects, teachers,
        sharedSeries: sharedSeries ?? [],
        schedules, absences: absences ?? [],
        history: history ?? [], workloadWarn, workloadDanger,
      },
      timestamp: Date.now()
    }))
  } catch {}
}

function _loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { data: {}, timestamp: null }
    const cached = JSON.parse(raw)
    // Backward compat: se é objeto plano sem 'data' key, significa era old format
    if (!cached.data && !cached.timestamp) {
      return { data: cached, timestamp: null }
    }
    return cached
  } catch { return { data: {}, timestamp: null } }
}

// ─── Pending Actions (coordenador approval workflow) ───────────────────────────

export async function submitPendingAction({ coordinatorId, coordinatorName, action, payload, summary }) {
  const id = uid()
  await setDoc(doc(db, 'pending_actions', id), {
    id,
    coordinatorId,
    coordinatorName,
    action,
    payload,
    summary,
    createdAt: serverTimestamp(),
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
  })
  return id
}

export async function getPendingActions() {
  const snap = await getDocs(
    query(collection(db, 'pending_actions'), where('status', '==', 'pending'), orderBy('createdAt', 'asc'))
  )
  return snap.docs.map(d => d.data())
}

export async function getMyPendingActions(coordinatorId) {
  const snap = await getDocs(
    query(
      collection(db, 'pending_actions'),
      where('coordinatorId', '==', coordinatorId),
      orderBy('createdAt', 'desc'),
      limit(20)
    )
  )
  return snap.docs.map(d => d.data())
}

export async function approvePendingAction(id, adminEmail) {
  await updateDoc(doc(db, 'pending_actions', id), {
    status: 'approved',
    reviewedBy: adminEmail,
    reviewedAt: serverTimestamp(),
  })
}

export async function rejectPendingAction(id, adminEmail, reason = null) {
  await updateDoc(doc(db, 'pending_actions', id), {
    status: 'rejected',
    reviewedBy: adminEmail,
    reviewedAt: serverTimestamp(),
    rejectionReason: reason,
  })
}

export function subscribePendingActionsCount(callback) {
  return onSnapshot(
    query(collection(db, 'pending_actions'), where('status', '==', 'pending')),
    snap => callback(snap.size),
    err => console.warn('[pending_actions]', err)
  )
}
