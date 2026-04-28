import { db, functions } from '../firebase'
import { httpsCallable } from 'firebase/functions'
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, writeBatch, serverTimestamp, query, where, onSnapshot, orderBy, limit,
  runTransaction,
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
    // Carrega apenas config + teachers + schedules na inicialização.
    // Absences e history são carregados de forma lazy (loadAbsencesIfNeeded /
    // loadHistoryIfNeeded) para acelerar o primeiro render.
    const [config, teachers, schedules] = await Promise.all([
      _loadConfig(schoolId),
      _loadCol(schoolId, 'teachers'),
      _loadCol(schoolId, 'schedules'),
    ])

    return { ...config, teachers, schedules, absences: [], history: [] }
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
  await deleteDoc(getSchoolDocRef(schoolId, colName, id))
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

// ─── Busca de documento de professor ─────────────────────────────────────────

/**
 * Busca o documento de professor para um usuário já aprovado.
 * Estratégia: tenta por teacherDocId primeiro; fallback por e-mail se necessário.
 * Retorna o objeto de dados do professor, ou null se não encontrado ou em erro.
 */
export async function getTeacherDoc(schoolId, teacherDocId, email) {
  try {
    if (teacherDocId) {
      const tSnap = await getDoc(doc(db, 'schools', schoolId, 'teachers', teacherDocId))
      if (tSnap.exists()) return tSnap.data()
    }
    if (email) {
      const tQuery = query(
        collection(db, 'schools', schoolId, 'teachers'),
        where('email', '==', email.toLowerCase())
      )
      const tSnap = await getDocs(tQuery)
      if (!tSnap.empty) return tSnap.docs[0].data()
    }
  } catch (e) {
    console.warn('[db] getTeacherDoc:', e)
  }
  return null
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

export class AccessRevokedError extends Error {
  constructor(message = 'Acesso revogado pelo administrador') {
    super(message)
    this.name = 'AccessRevokedError'
    this.code = 'access-revoked'
  }
}

export async function requestTeacherAccess(schoolId, user) {
  // Verificação backend-driven: se existe marcação em removed_users/{uid},
  // o admin removeu este usuário e não queremos recriar pending automaticamente.
  // A rule de removed_users permite leitura ao próprio uid; se a leitura falhar
  // por permissão (usuário sem registro), prosseguimos normalmente.
  try {
    const removedRef = getSchoolDocRef(schoolId, 'removed_users', user.uid)
    const removedSnap = await getDoc(removedRef)
    if (removedSnap.exists()) {
      throw new AccessRevokedError()
    }
  } catch (e) {
    if (e instanceof AccessRevokedError) throw e
    // Erros de permissão/leitura não devem bloquear o fluxo (ex.: usuário novo
    // sem doc removed_users — rule pode negar leitura, e isso é OK)
  }

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

export async function updatePendingData(schoolId, uid, { celular, apelido, subjectIds, horariosSemana, profile }) {
  const payload = {
    celular: celular ?? '',
    apelido: apelido ?? '',
    subjectIds: subjectIds ?? [],
    horariosSemana: horariosSemana ?? {},
    ...(profile && { profile }),
  }
  console.log('[db.updatePendingData] write', { schoolId, uid, keys: Object.keys(payload) })
  try {
    await setDoc(getSchoolDocRef(schoolId, 'pending_teachers', uid), payload, { merge: true })
    console.log('[db.updatePendingData] OK', { schoolId, uid })
  } catch (e) {
    console.error('[db.updatePendingData] FAIL', { schoolId, uid, code: e.code, message: e.message })
    throw e
  }
}

export async function listPendingTeachers(schoolId) {
  const snap = await getDocs(getSchoolCollectionRef(schoolId, 'pending_teachers'))
  return snap.docs.map(d => d.data()).filter(d => d.status === 'pending')
}

export async function patchTeacherSelf(schoolId, id, changes) {
  await updateDoc(getSchoolDocRef(schoolId, 'teachers', id), changes)
}

// approveTeacher e rejectTeacher rodam em Cloud Function (privilégios de admin
// SDK). O frontend apenas dispara — toda gravação no Firestore é server-side.
// Mantêm a assinatura legada (state, setState) para compatibilidade com o
// componente, mas o state local é apenas atualizado otimisticamente; os
// listeners realtime do Firestore vão reconciliar.

export async function approveTeacher(schoolId, pendingUid, state, setState, profile = 'teacher') {
  const fn = httpsCallable(functions, 'approveTeacher')
  await fn({ schoolId, pendingUid, profile })
  // Listeners realtime atualizam teachers/schedules no store automaticamente.
}

export async function rejectTeacher(schoolId, pendingUid, _setState) {
  const fn = httpsCallable(functions, 'rejectTeacher')
  await fn({ schoolId, pendingUid })
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

// ─── Criação de Escola ────────────────────────────────────────────────────────

/**
 * Cria escola pelo SaaS admin: schools/{schoolId}, schools/{schoolId}/config/main e
 * school_slugs/{slug} de forma atômica via runTransaction.
 *
 * NÃO grava nada em users/{currentUserUid}.schools: o SaaS admin não vira membro
 * da escola criada. O admin local entra via /join/{slug}.
 *
 * @param {{ slug: string, adminEmail: string, currentUserUid: string }} params
 * @returns {Promise<{ schoolId: string }>}
 * @throws {Error} com `code === 'slug-taken'` se o slug já existir.
 */
export async function createSchoolFromAdmin({ slug, adminEmail, currentUserUid }) {
  if (!slug || !adminEmail || !currentUserUid) {
    throw new Error('createSchoolFromAdmin: slug, adminEmail e currentUserUid são obrigatórios')
  }

  const normalizedEmail = adminEmail.trim().toLowerCase()

  // Verificação prévia (otimização — race ainda é coberta dentro da transação)
  const slugRef = doc(db, 'school_slugs', slug)
  const preCheck = await getDoc(slugRef)
  if (preCheck.exists()) {
    const err = new Error('Slug já está em uso')
    err.code = 'slug-taken'
    throw err
  }

  const schoolId = uid()
  const schoolRef = doc(db, 'schools', schoolId)
  const configRef = doc(db, 'schools', schoolId, 'config', 'main')

  await runTransaction(db, async (tx) => {
    const slugSnap = await tx.get(slugRef)
    if (slugSnap.exists()) {
      const err = new Error('Slug já está em uso')
      err.code = 'slug-taken'
      throw err
    }

    tx.set(schoolRef, {
      slug,
      adminEmail: normalizedEmail,
      status: 'active',
      createdAt: serverTimestamp(),
      createdBy: currentUserUid,
      deletedAt: null,
    })
    tx.set(configRef, {})
    tx.set(slugRef, { schoolId })
  })

  return { schoolId }
}

// designateLocalAdmin e syncTeacherRoleInUserDoc foram migrados para Cloud
// Functions (designateSchoolAdmin, setTeacherRoleInSchool) — issue 458/461.
// Cliente NUNCA escreve em users/{uid}.schools[schoolId]; toda mutação de
// membership é exclusivamente backend (Admin SDK bypassa rules).

// ─── Status da Escola (suspender/reativar) ───────────────────────────────────

/**
 * Atualiza o `status` de uma escola entre 'active' e 'suspended'.
 * SaaS admin only — Rules (issue 410) impedem outros perfis.
 *
 * @param {string} schoolId
 * @param {'active' | 'suspended'} status
 */
export async function setSchoolStatus(schoolId, status) {
  if (!schoolId) throw new Error('setSchoolStatus: schoolId obrigatório')
  if (status !== 'active' && status !== 'suspended') {
    throw new Error(`setSchoolStatus: status inválido (${status})`)
  }
  await updateDoc(doc(db, 'schools', schoolId), {
    status,
    statusUpdatedAt: serverTimestamp(),
  })
}

// ─── Soft delete da Escola ────────────────────────────────────────────────────
/**
 * Marca uma escola como excluída via soft delete (`deletedAt = serverTimestamp()`).
 * SaaS admin only — Rules (issue 410) impedem outros perfis.
 * NÃO cascateia: subcoleções permanecem; limpeza física é script manual.
 *
 * @param {string} schoolId
 */
export async function softDeleteSchool(schoolId) {
  if (!schoolId) throw new Error('softDeleteSchool: schoolId obrigatório')
  await updateDoc(doc(db, 'schools', schoolId), {
    deletedAt: serverTimestamp(),
  })
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
