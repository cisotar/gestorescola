import { db } from '../firebase'
import { doc, collection, onSnapshot } from 'firebase/firestore'

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
