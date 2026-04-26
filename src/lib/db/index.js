import { db } from '../firebase'
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, writeBatch, serverTimestamp, query, where, onSnapshot, orderBy, limit,
} from 'firebase/firestore'
import { uid } from '../helpers/ids'
import { _loadConfig, saveConfig } from './config'
import { _saveToLS, _loadFromLS } from './cache'
import { setupRealtimeListeners, registerAbsencesListener, registerHistoryListener } from './listeners'
import { getSchoolCollectionRef, getSchoolDocRef, getSchoolConfigRef } from '../firebase/multi-tenant'

// ─── Carregamento inicial ─────────────────────────────────────────────────────

export async function loadFromFirestore(schoolId) {
  const TTL_MS = 3600000 // 1 hora
  const cached = _loadFromLS(schoolId)

  // Se cache é recente (< 1h), usar cache
  if (cached.data && cached.timestamp && Date.now() - cached.timestamp < TTL_MS) {
    const remainingMin = Math.round((TTL_MS - (Date.now() - cached.timestamp)) / 1000 / 60)
    console.log(`[db] Usando cache LS (válido por ${remainingMin}min)`)
    return cached.data
  }

  try {
    const [config, teachers, schedules, absences, history] = await Promise.all([
      _loadConfig(schoolId),
      _loadCol(schoolId, 'teachers'),
      _loadCol(schoolId, 'schedules'),
      _loadCol(schoolId, 'absences'),
      _loadCol(schoolId, 'history'),
    ])

    return { ...config, teachers, schedules, absences, history }
  } catch (e) {
    console.warn('[db] Firestore falhou, usando cache:', e)
    // Sempre tem fallback: cache antigo (mesmo que expirado) é melhor que vazio
    return cached.data || {}
  }
}

export async function _loadCol(schoolId, name) {
  const snap = await getDocs(getSchoolCollectionRef(schoolId, name))
  return snap.empty ? [] : snap.docs.map(d => d.data())
}

// ─── Listeners em tempo real ──────────────────────────────────────────────────

export { setupRealtimeListeners, registerAbsencesListener, registerHistoryListener, teardownListeners } from './listeners'

// ─── Exports internos necessários ─────────────────────────────────────────────
// Funções privadas que ainda são usadas internamente pelo store
export { _saveToLS, _loadFromLS } from './cache'

// ─── Persistência ─────────────────────────────────────────────────────────────

export async function saveToFirestore(schoolId, state) {
  _saveToLS(schoolId, state)
  try {
    const batch = writeBatch(db)
    batch.set(getSchoolConfigRef(schoolId), {
      segments: state.segments, periodConfigs: state.periodConfigs,
      areas: state.areas, subjects: state.subjects, sharedSeries: state.sharedSeries ?? [],
      workloadWarn: state.workloadWarn, workloadDanger: state.workloadDanger,
      updatedAt: serverTimestamp(),
    })
    await batch.commit()
    await Promise.all([
      _syncCol(schoolId, 'teachers',  state.teachers),
      _syncCol(schoolId, 'schedules', state.schedules),
      _syncCol(schoolId, 'absences',  state.absences ?? []),
      _syncCol(schoolId, 'history',   state.history  ?? []),
    ])
  } catch (e) {
    console.error('[db] Falha ao salvar:', e)
    throw e
  }
}

async function _syncCol(schoolId, name, items) {
  if (!items?.length) return
  const CHUNK = 400
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = writeBatch(db)
    items.slice(i, i + CHUNK).forEach(item => batch.set(getSchoolDocRef(schoolId, name, item.id), item))
    await batch.commit()
  }
}

export async function saveDoc(schoolId, colName, item) {
  try { await setDoc(getSchoolDocRef(schoolId, colName, item.id), item) } catch (e) { console.error(e) }
}

export async function deleteDocById(schoolId, colName, id) {
  try { await deleteDoc(getSchoolDocRef(schoolId, colName, id)) } catch (e) { console.error(e) }
}

// ─── Atualização Granular ──────────────────────────────────────────────────
// Atualiza apenas campos específicos de um documento (não sobrescreve o inteiro)
// Usar em ações de UI: editar professor, horário, ausência, etc.
// Nota: updateDoc() é mais eficiente que setDoc() para edições parciais
export async function updateDocById(schoolId, colName, id, changes) {
  await updateDoc(getSchoolDocRef(schoolId, colName, id), changes)
}

export { saveConfig } from './config'

// ─── Admins ───────────────────────────────────────────────────────────────────

const emailKey = (email) => email.toLowerCase()

export async function isAdmin(email) {
  if (!email) return false
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

export async function getTeacherByEmail(schoolId, email, teachers) {
  if (!email) return null
  const local = teachers?.find(t => t.email?.toLowerCase() === email.toLowerCase())
  if (local) return local
  try {
    const snap = await getDocs(query(getSchoolCollectionRef(schoolId, 'teachers'), where('email', '==', email.toLowerCase())))
    return snap.empty ? null : snap.docs[0].data()
  } catch { return null }
}

// ─── Professores pendentes ────────────────────────────────────────────────────

export async function requestTeacherAccess(schoolId, user) {
  const ref  = getSchoolDocRef(schoolId, 'pending_teachers', user.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return
  await setDoc(ref, {
    id: user.uid, uid: user.uid, email: user.email.toLowerCase(),
    name: user.displayName ?? '', photoURL: user.photoURL ?? '',
    requestedAt: serverTimestamp(), status: 'pending',
    profile: null,
  })
}

export async function updatePendingData(schoolId, uid, { celular, apelido, subjectIds, horariosSemana }) {
  await updateDoc(getSchoolDocRef(schoolId, 'pending_teachers', uid), { celular, apelido, subjectIds, horariosSemana })
}

export async function listPendingTeachers(schoolId) {
  const snap = await getDocs(getSchoolCollectionRef(schoolId, 'pending_teachers'))
  return snap.docs.map(d => d.data()).filter(d => d.status === 'pending')
}

export async function patchTeacherSelf(schoolId, id, changes) {
  await updateDoc(getSchoolDocRef(schoolId, 'teachers', id), changes)
}

export async function approveTeacher(schoolId, pendingId, state, setState, profile = 'teacher') {
  const VALID_PROFILES = ['teacher', 'coordinator', 'teacher-coordinator']
  if (!VALID_PROFILES.includes(profile)) {
    console.warn(`[db] Profile inválido: ${profile}, usando default 'teacher'`)
    profile = 'teacher'
  }

  const ref  = getSchoolDocRef(schoolId, 'pending_teachers', pendingId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data()

  let teacher = state.teachers.find(t => t.email?.toLowerCase() === data.email)
  if (!teacher) {
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

  await setDoc(getSchoolDocRef(schoolId, 'teachers', teacher.id), {
    ...teacher, status: 'approved', profile,
    horariosSemana: data.horariosSemana ?? teacher.horariosSemana ?? null,
  })

  // Migrar schedules do UID pendente para o novo teacher.id
  const orphanSnap = await getDocs(
    query(getSchoolCollectionRef(schoolId, 'schedules'), where('teacherId', '==', pendingId))
  )
  if (!orphanSnap.empty) {
    const batch = writeBatch(db)
    orphanSnap.docs.forEach(d => {
      batch.update(getSchoolDocRef(schoolId, 'schedules', d.id), { teacherId: teacher.id })
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

export async function rejectTeacher(schoolId, pendingId, setState) {
  const orphanSnap = await getDocs(
    query(getSchoolCollectionRef(schoolId, 'schedules'), where('teacherId', '==', pendingId))
  )
  if (!orphanSnap.empty) {
    const batch = writeBatch(db)
    orphanSnap.docs.forEach(d => batch.delete(getSchoolDocRef(schoolId, 'schedules', d.id)))
    await batch.commit()
    if (setState) {
      setState(s => ({
        schedules: s.schedules.filter(sc => sc.teacherId !== pendingId),
      }))
    }
  }
  await deleteDoc(getSchoolDocRef(schoolId, 'pending_teachers', pendingId))
}

// ─── Migrações ────────────────────────────────────────────────────────────────
// TODO: wiring de schoolId para as funções de migração deve ser feito quando
// os scripts de migração avulsos forem adaptados ao contexto multi-tenant.

export async function migrateFormationSchedules(schoolId) {
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

export async function migrateSharedSeriesActivities(schoolId, idMap = {}) {
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

// ─── School Slugs ─────────────────────────────────────────────────────────────

/**
 * Busca o documento de slug na coleção raiz `school_slugs`.
 * Retorna { schoolId, ... } se encontrado, ou null se não existir.
 * Nunca lança exceção — erros de rede retornam null.
 */
export async function getSchoolSlug(slug) {
  if (!slug) return null
  try {
    const snap = await getDoc(doc(db, 'school_slugs', slug))
    return snap.exists() ? snap.data() : null
  } catch {
    return null
  }
}

/**
 * Salva o slug de convite de uma escola:
 * 1. Se oldSlug existe e é diferente de newSlug, apaga school_slugs/{oldSlug}.
 * 2. Em paralelo: atualiza o campo `slug` em schools/{schoolId} e cria school_slugs/{newSlug}.
 */
export async function saveSchoolSlug(schoolId, newSlug, oldSlug) {
  if (oldSlug && oldSlug !== newSlug) {
    await deleteDoc(doc(db, 'school_slugs', oldSlug))
  }
  await Promise.all([
    updateDoc(doc(db, 'schools', schoolId), { slug: newSlug }),
    setDoc(doc(db, 'school_slugs', newSlug), { schoolId }),
  ])
}

// ─── Pending Actions (coordenador approval workflow) ───────────────────────────

export async function submitPendingAction(schoolId, { coordinatorId, coordinatorName, action, payload, summary }) {
  const id = uid()
  await setDoc(getSchoolDocRef(schoolId, 'pending_actions', id), {
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

export async function getPendingActions(schoolId) {
  const snap = await getDocs(
    query(getSchoolCollectionRef(schoolId, 'pending_actions'), where('status', '==', 'pending'), orderBy('createdAt', 'asc'))
  )
  return snap.docs.map(d => d.data())
}

export async function getMyPendingActions(schoolId, coordinatorId) {
  const snap = await getDocs(
    query(
      getSchoolCollectionRef(schoolId, 'pending_actions'),
      where('coordinatorId', '==', coordinatorId),
      orderBy('createdAt', 'desc'),
      limit(20)
    )
  )
  return snap.docs.map(d => d.data())
}

export async function approvePendingAction(schoolId, id, adminEmail) {
  await updateDoc(getSchoolDocRef(schoolId, 'pending_actions', id), {
    status: 'approved',
    reviewedBy: adminEmail,
    reviewedAt: serverTimestamp(),
  })
}

export async function rejectPendingAction(schoolId, id, adminEmail, reason = null) {
  await updateDoc(getSchoolDocRef(schoolId, 'pending_actions', id), {
    status: 'rejected',
    reviewedBy: adminEmail,
    reviewedAt: serverTimestamp(),
    rejectionReason: reason,
  })
}

export function subscribePendingActionsCount(schoolId, callback) {
  return onSnapshot(
    query(getSchoolCollectionRef(schoolId, 'pending_actions'), where('status', '==', 'pending')),
    snap => callback(snap.size),
    err => console.warn('[pending_actions]', err)
  )
}
