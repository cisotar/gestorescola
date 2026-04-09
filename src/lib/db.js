import { db } from './firebase'
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, writeBatch, serverTimestamp, query, where,
} from 'firebase/firestore'

const LS_KEY = 'gestao_v7_cache'

// ─── Carregamento inicial ─────────────────────────────────────────────────────

export async function loadFromFirestore() {
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
    return _loadFromLS()
  }
}

async function _loadConfig() {
  const snap = await getDoc(doc(db, 'meta', 'config'))
  if (!snap.exists()) return {}
  const data = snap.data()
  const keys = ['segments','periodConfigs','areas','subjects','workloadWarn','workloadDanger']
  const result = {}
  keys.forEach(k => { if (data[k] !== undefined) result[k] = data[k] })
  return result
}

async function _loadCol(name) {
  const snap = await getDocs(collection(db, name))
  return snap.empty ? [] : snap.docs.map(d => d.data())
}

// ─── Persistência ─────────────────────────────────────────────────────────────

export async function saveToFirestore(state) {
  _saveToLS(state)
  try {
    const batch = writeBatch(db)
    batch.set(doc(db, 'meta', 'config'), {
      segments: state.segments, periodConfigs: state.periodConfigs,
      areas: state.areas, subjects: state.subjects,
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

export async function saveConfig(state) {
  try {
    await setDoc(doc(db, 'meta', 'config'), {
      segments: state.segments, periodConfigs: state.periodConfigs,
      areas: state.areas, subjects: state.subjects,
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

export async function updatePendingPhone(uid, celular) {
  await updateDoc(doc(db, 'pending_teachers', uid), { celular })
}

export async function listPendingTeachers() {
  const snap = await getDocs(collection(db, 'pending_teachers'))
  return snap.docs.map(d => d.data()).filter(d => d.status === 'pending')
}

export async function patchTeacherSelf(id, changes) {
  await updateDoc(doc(db, 'teachers', id), changes)
}

export async function approveTeacher(pendingId, state, setState) {
  const ref  = doc(db, 'pending_teachers', pendingId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data()
  let teacher = state.teachers.find(t => t.email?.toLowerCase() === data.email)
  if (!teacher) {
    const { uid } = await import('./helpers')
    teacher = { id: uid(), name: data.name, email: data.email, whatsapp: '',
      celular: data.celular ?? '', subjectIds: data.subjectIds ?? [], status: 'approved' }
    setState(s => ({ teachers: [...s.teachers, teacher] }))
  } else {
    setState(s => ({
      teachers: s.teachers.map(t => t.id === teacher.id
        ? { ...t, status: 'approved' } : t)
    }))
  }
  await setDoc(doc(db, 'teachers', teacher.id), { ...teacher, status: 'approved' })
  await deleteDoc(ref)
}

export async function rejectTeacher(pendingId) {
  await deleteDoc(doc(db, 'pending_teachers', pendingId))
}

// ─── LocalStorage fallback ────────────────────────────────────────────────────

export function _saveToLS(state) {
  try {
    const { segments, periodConfigs, areas, subjects, teachers,
            schedules, subs, absences, history, workloadWarn, workloadDanger } = state
    localStorage.setItem(LS_KEY, JSON.stringify({
      segments, periodConfigs, areas, subjects, teachers,
      schedules, subs: subs ?? {}, absences: absences ?? [],
      history: history ?? [], workloadWarn, workloadDanger,
    }))
  } catch {}
}

function _loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch { return {} }
}
