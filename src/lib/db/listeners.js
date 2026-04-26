import { onSnapshot } from 'firebase/firestore'
import { getSchoolCollectionRef, getSchoolConfigRef } from '../firebase/multi-tenant'

// ─── Variáveis de módulo para os unsubscribes ativos ─────────────────────────
let _unsubConfig    = null
let _unsubTeachers  = null
let _unsubSchedules = null
let _unsubAbsences  = null
let _unsubHistory   = null

export function setupRealtimeListeners(schoolId, store) {
  if (!schoolId) {
    console.warn('[listeners] schoolId ausente — listeners não registrados')
    return
  }

  // Config listener (schools/{schoolId}/config/main)
  _unsubConfig = onSnapshot(
    getSchoolConfigRef(schoolId),
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

  // Teachers listener (schools/{schoolId}/teachers)
  _unsubTeachers = onSnapshot(
    getSchoolCollectionRef(schoolId, 'teachers'),
    snap => {
      store.setTeachers(snap.docs.map(d => d.data()))
      store.markTeachersLoaded()
    },
    err => console.warn('[teachersListener]', err)
  )

  // Schedules listener (schools/{schoolId}/schedules)
  _unsubSchedules = onSnapshot(
    getSchoolCollectionRef(schoolId, 'schedules'),
    snap => {
      store.setSchedules(snap.docs.map(d => d.data()))
      store.markSchedulesLoaded()
    },
    err => console.warn('[schedulesListener]', err)
  )
}

export function registerAbsencesListener(schoolId, store) {
  _unsubAbsences = onSnapshot(
    getSchoolCollectionRef(schoolId, 'absences'),
    snap => {
      store.setAbsences(snap.docs.map(d => d.data()))
      store.markAbsencesLoaded()
    },
    err => console.warn('[absencesListener]', err)
  )
  return _unsubAbsences
}

export function registerHistoryListener(schoolId, store) {
  _unsubHistory = onSnapshot(
    getSchoolCollectionRef(schoolId, 'history'),
    snap => {
      store.setHistory(snap.docs.map(d => d.data()))
      store.markHistoryLoaded()
    },
    err => console.warn('[historyListener]', err)
  )
  return _unsubHistory
}

export function teardownListeners() {
  _unsubConfig?.()
  _unsubConfig = null

  _unsubTeachers?.()
  _unsubTeachers = null

  _unsubSchedules?.()
  _unsubSchedules = null

  _unsubAbsences?.()
  _unsubAbsences = null

  _unsubHistory?.()
  _unsubHistory = null
}
