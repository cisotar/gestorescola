import { create } from 'zustand'
import { uid } from '../lib/helpers'
import { saveToFirestore, saveDoc, deleteDocById, updateDocById, _saveToLS, patchTeacherSelf, _loadCol, registerAbsencesListener, registerHistoryListener, saveConfig } from '../lib/db'
import { defaultCfg } from '../lib/periods'
import { COLOR_PALETTE } from '../lib/constants'
import {
  createAbsence as _createAbsence,
  assignSubstitute as _assignSubstitute,
  deleteAbsenceSlot as _deleteAbsenceSlot,
  deleteAbsence as _deleteAbsence,
} from '../lib/absences'

// ─── Debounce Timer ─────────────────────────────────────────────────────────
let saveTimer = null

// ─── Lazy Listener Unsubscribes ──────────────────────────────────────────────
let absencesUnsubscribe = null
let historyUnsubscribe = null

const INITIAL_STATE = {
  segments: [
    {
      id: 'seg-fund', name: 'Ensino Fundamental', turno: 'manha',
      grades: [
        { name: '6º Ano', classes: [{ letter:'A', turno:'manha' },{ letter:'B', turno:'manha' },{ letter:'C', turno:'manha' }] },
        { name: '7º Ano', classes: [{ letter:'A', turno:'manha' },{ letter:'B', turno:'manha' },{ letter:'C', turno:'manha' }] },
        { name: '8º Ano', classes: [{ letter:'A', turno:'manha' },{ letter:'B', turno:'manha' },{ letter:'C', turno:'manha' }] },
        { name: '9º Ano', classes: [{ letter:'A', turno:'manha' },{ letter:'B', turno:'manha' },{ letter:'C', turno:'manha' }] },
      ],
    },
    {
      id: 'seg-med', name: 'Ensino Médio', turno: 'tarde',
      grades: [
        { name: '1ª Série', classes: [{ letter:'A', turno:'tarde' },{ letter:'B', turno:'tarde' },{ letter:'C', turno:'tarde' }] },
        { name: '2ª Série', classes: [{ letter:'A', turno:'tarde' },{ letter:'B', turno:'tarde' },{ letter:'C', turno:'tarde' }] },
        { name: '3ª Série', classes: [{ letter:'A', turno:'tarde' },{ letter:'B', turno:'tarde' },{ letter:'C', turno:'tarde' }] },
      ],
    },
  ],
  periodConfigs: {
    'seg-fund': { manha: { inicio:'07:00', duracao:50, qtd:7, intervalos:[{ apos:2, duracao:10 },{ apos:5, duracao:60 }] } },
    'seg-med':  { tarde: { inicio:'12:30', duracao:50, qtd:7, intervalos:[{ apos:2, duracao:10 },{ apos:5, duracao:60 }] } },
  },
  areas:         [],
  subjects:      [],
  sharedSeries:  [],
  teachers:      [],
  schedules:     [],
  absences:      [],
  history:       [],
  subs:          {},
  workloadWarn:  20,
  workloadDanger:26,
  loaded:        false,
  teachersLoaded: false,
  schedulesLoaded: false,
  absencesLoaded: false,
  historyLoaded: false,
}

const useAppStore = create((set, get) => {
  const debouncedSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      get().save()
      saveTimer = null
    }, 2000)
  }

  return {
    ...INITIAL_STATE,

    // ─── Hidratação ─────────────────────────────────────────────────────────────
    hydrate: (data) => set({
      ...data,
      loaded: true,
      teachersLoaded: !!data.teachers?.length,
      schedulesLoaded: !!data.schedules?.length,
      absencesLoaded: !!data.absences?.length,
      historyLoaded: !!data.history?.length,
    }),

    // ─── Persistência ──────────────────────────────────────────────────────────
    save: async () => {
      const s = get()
      _saveToLS(s)
      try {
        await saveToFirestore(s)
      } catch (e) {
        console.warn('Sync falhou, salvo localmente:', e)
      }
    },

  // ─── Segmentos ──────────────────────────────────────────────────────────────
  addSegment: (name, turno = 'manha') => {
    const seg = { id: uid(), name: name.trim(), turno, grades: [] }
    set(s => ({
      segments: [...s.segments, seg],
      periodConfigs: { ...s.periodConfigs, [seg.id]: { [turno]: defaultCfg(turno) } },
    }))
    saveConfig(get())
  },
  removeSegment: (id) => {
    set(s => {
      const { [id]: _, ...rest } = s.periodConfigs
      return { segments: s.segments.filter(x => x.id !== id), periodConfigs: rest }
    })
    saveConfig(get())
  },
  setSegmentTurno: (segId, turno) => {
    set(s => ({
      segments: s.segments.map(seg => {
        if (seg.id !== segId) return seg
        return { ...seg, turno, grades: seg.grades.map(g => ({ ...g, classes: g.classes.map(c => ({ ...c, turno })) })) }
      }),
      periodConfigs: {
        ...s.periodConfigs,
        [segId]: { ...(s.periodConfigs[segId] || {}), [turno]: s.periodConfigs[segId]?.[turno] ?? defaultCfg(turno) },
      },
    }))
    saveConfig(get())
  },
  addGrade: (segId, gradeName) => {
    set(s => ({
      segments: s.segments.map(seg =>
        seg.id !== segId || seg.grades.find(g => g.name === gradeName.trim())
          ? seg
          : { ...seg, grades: [...seg.grades, { name: gradeName.trim(), classes: [] }] }
      ),
    }))
    saveConfig(get())
  },
  removeGrade: (segId, gradeName) => {
    set(s => ({
      segments: s.segments.map(seg =>
        seg.id !== segId ? seg : { ...seg, grades: seg.grades.filter(g => g.name !== gradeName) }
      ),
    }))
    saveConfig(get())
  },
  addClassToGrade: (segId, gradeName, letter) => {
    const up = letter.trim().toUpperCase()
    set(s => ({
      segments: s.segments.map(seg => {
        if (seg.id !== segId) return seg
        return {
          ...seg,
          grades: seg.grades.map(g => {
            if (g.name !== gradeName || g.classes.find(c => c.letter === up)) return g
            const classes = [...g.classes, { letter: up, turno: seg.turno ?? 'manha' }]
              .sort((a,b) => a.letter.localeCompare(b.letter))
            return { ...g, classes }
          }),
        }
      }),
    }))
    saveConfig(get())
  },
  removeClassFromGrade: (segId, gradeName, letter) => {
    set(s => ({
      segments: s.segments.map(seg =>
        seg.id !== segId ? seg : {
          ...seg,
          grades: seg.grades.map(g =>
            g.name !== gradeName ? g : { ...g, classes: g.classes.filter(c => c.letter !== letter) }
          ),
        }
      ),
    }))
    saveConfig(get())
  },

  // ─── Períodos ───────────────────────────────────────────────────────────────
  savePeriodCfg: (segId, turno, cfg) => {
    set(s => ({
      periodConfigs: {
        ...s.periodConfigs,
        [segId]: { ...(s.periodConfigs[segId] || {}), [turno]: cfg },
      },
    }))
    saveConfig(get())
  },

  // ─── Áreas ──────────────────────────────────────────────────────────────────
  addArea: (name, colorIdx, segmentIds = [], shared = false) => {
    set(s => ({
      areas: [...s.areas, { id: uid(), name: name.trim(), colorIdx, segmentIds, shared }],
    }))
    saveConfig(get())
  },
  updateArea: (id, changes) => {
    set(s => ({ areas: s.areas.map(a => a.id === id ? { ...a, ...changes } : a) }))
    saveConfig(get())
  },
  removeArea: (id) => {
    set(s => {
      const removedSubjIds = new Set(s.subjects.filter(x => x.areaId === id).map(x => x.id))
      return {
        areas:    s.areas.filter(a => a.id !== id),
        subjects: s.subjects.filter(x => x.areaId !== id),
        teachers: s.teachers.map(t => ({ ...t, subjectIds: (t.subjectIds ?? []).filter(sid => !removedSubjIds.has(sid)) })),
      }
    })
    saveConfig(get())
  },

  // ─── Matérias ────────────────────────────────────────────────────────────────
  addSubject: (name, areaId) => {
    set(s => ({ subjects: [...s.subjects, { id: uid(), name: name.trim(), areaId }] }))
    saveConfig(get())
  },
  removeSubject: (id) => {
    set(s => ({
      subjects: s.subjects.filter(x => x.id !== id),
      teachers: s.teachers.map(t => ({ ...t, subjectIds: (t.subjectIds ?? []).filter(sid => sid !== id) })),
    }))
    saveConfig(get())
  },
  saveAreaWithSubjects: (areaId, name, subjectNames) => {
    set(s => {
      const existing = s.subjects.filter(x => x.areaId === areaId)
      const toRemove = existing.filter(x => !subjectNames.includes(x.name)).map(x => x.id)
      const toAdd    = subjectNames
        .filter(n => !existing.find(x => x.name === n))
        .map(n => ({ id: uid(), name: n, areaId }))
      const removedSet = new Set(toRemove)
      return {
        areas:    s.areas.map(a => a.id === areaId ? { ...a, name } : a),
        subjects: [...s.subjects.filter(x => !removedSet.has(x.id)), ...toAdd],
        teachers: s.teachers.map(t => ({ ...t, subjectIds: (t.subjectIds ?? []).filter(sid => !removedSet.has(sid)) })),
      }
    })
    saveConfig(get())
  },

  // ─── Turmas compartilhadas ──────────────────────────────────────────────────
  addSharedSeries: (series) => {
    set(s => ({ sharedSeries: [...s.sharedSeries, series] }))
    saveConfig(get())
  },
  updateSharedSeries: (id, changes) => {
    set(s => ({ sharedSeries: s.sharedSeries.map(ss => ss.id === id ? { ...ss, ...changes } : ss) }))
    saveConfig(get())
  },
  removeSharedSeries: (id) => {
    set(s => ({ sharedSeries: s.sharedSeries.filter(ss => ss.id !== id) }))
    saveConfig(get())
  },

  // ─── Professores ─────────────────────────────────────────────────────────────
  setTeachers: (teachers) => set({ teachers }),
  setSchedules: (schedules) => set({ schedules }),
  setAbsences: (absences) => set({ absences }),
  setHistory: (history) => set({ history }),

  addTeacher: (name, opts = {}) => {
    const teacher = { id: uid(), name: name.trim(), subjectIds: opts.subjectIds ?? [],
      email: opts.email ?? '', whatsapp: '', celular: opts.celular ?? '', status: 'approved' }
    set(s => ({ teachers: [...s.teachers, teacher] }))
    saveDoc('teachers', teacher)
  },
  updateTeacher: (id, changes) => {
    set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t) }))
    updateDocById('teachers', id, changes)
  },
  updateTeacherProfile: async (id, changes) => {
    set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t) }))
    await patchTeacherSelf(id, changes)
  },
  removeTeacher: (id) => {
    const schedulesToDelete = get().schedules.filter(x => x.teacherId === id)
    set(s => ({
      teachers:  s.teachers.filter(t => t.id !== id),
      schedules: s.schedules.filter(x => x.teacherId !== id),
    }))
    deleteDocById('teachers', id)
    schedulesToDelete.forEach(s => deleteDocById('schedules', s.id))
  },

  // ─── Horários ────────────────────────────────────────────────────────────────
  addSchedule: (sched) => {
    const item = { id: uid(), ...sched }
    set(s => ({ schedules: [...s.schedules, item] }))
    saveDoc('schedules', item)
  },
  removeSchedule: (id) => {
    set(s => ({ schedules: s.schedules.filter(x => x.id !== id) }))
    deleteDocById('schedules', id)
  },
  updateSchedule: (id, changes) => {
    set(s => ({ schedules: s.schedules.map(x => x.id === id ? { ...x, ...changes } : x) }))
    updateDocById('schedules', id, changes)
  },
  migrateMultipleSubjects: (fromId, toId) => {
    set(s => ({
      schedules: s.schedules.map(x =>
        x.subjectId === fromId ? { ...x, subjectId: toId } : x
      ),
      teachers: s.teachers.map(t => ({
        ...t,
        subjectIds: (t.subjectIds ?? []).map(sid => sid === fromId ? toId : sid),
      })),
    }))
    saveConfig(get())
  },
  migrateScheduleSubject: (teacherId, fromSubjectId, toSubjectId) => {
    set(s => ({
      schedules: s.schedules.map(x =>
        x.teacherId === teacherId && x.subjectId === fromSubjectId
          ? { ...x, subjectId: toSubjectId }
          : x
      ),
    }))
    saveConfig(get())
  },
  removeSchedulesBySubject: (teacherId, subjectId) => {
    set(s => ({
      schedules: s.schedules.filter(
        x => !(x.teacherId === teacherId && x.subjectId === subjectId)
      ),
    }))
    saveConfig(get())
  },

  // ─── Ausências ───────────────────────────────────────────────────────────────
  createAbsence: (teacherId, rawSlots) => {
    set(s => ({ absences: _createAbsence(teacherId, rawSlots, s.absences) }))
    const newAbsence = get().absences[get().absences.length - 1]
    saveDoc('absences', newAbsence)
  },

  assignSubstitute: (absenceId, slotId, substituteId) => {
    set(s => ({ absences: _assignSubstitute(absenceId, slotId, substituteId, s.absences) }))
    const updated = get().absences.find(a => a.id === absenceId)
    if (updated) {
      updateDocById('absences', absenceId, { slots: updated.slots, status: updated.status })
    }
  },
  deleteAbsenceSlot: (absenceId, slotId) => {
    set(s => ({ absences: _deleteAbsenceSlot(absenceId, slotId, s.absences) }))
    const updated = get().absences.find(a => a.id === absenceId)
    if (updated) {
      updateDocById('absences', absenceId, { slots: updated.slots, status: updated.status })
    }
  },
  deleteAbsence: (id) => {
    set(s => ({ absences: _deleteAbsence(id, s.absences) }))
    deleteDocById('absences', id)
  },

  deleteManySlots: (slotIds) => {
    const ids = new Set(slotIds)
    let emptyAbsenceIds = []
    set(s => {
      const updated = s.absences.map(ab => ({
        ...ab,
        slots: ab.slots.filter(sl => !ids.has(sl.id)),
      }))
      emptyAbsenceIds = updated.filter(ab => ab.slots.length === 0).map(ab => ab.id)
      return { absences: updated.filter(ab => ab.slots.length > 0) }
    })
    emptyAbsenceIds.forEach(id => deleteDocById('absences', id))
  },
  restoreAbsences: (absencesSnapshot) => {
    set({ absences: absencesSnapshot })
  },

  // Remove todos os substitutos de um professor em uma data (mantém as faltas)
  clearDaySubstitutes: (teacherId, date) => {
    set(s => ({
      absences: s.absences.map(ab => {
        if (ab.teacherId !== teacherId) return ab
        const slots = ab.slots.map(sl =>
          sl.date === date ? { ...sl, substituteId: null } : sl
        )
        const covered = slots.filter(sl => sl.substituteId).length
        const status  = covered === 0 ? 'open' : covered < slots.length ? 'partial' : 'covered'
        return { ...ab, slots, status }
      }),
    }))
    get().absences.forEach(ab => {
      if (ab.teacherId === teacherId) {
        const slots = ab.slots.filter(sl => sl.date === date)
        if (slots.length > 0) {
          const updated = get().absences.find(a => a.id === ab.id)
          if (updated) updateDocById('absences', ab.id, { slots: updated.slots, status: updated.status })
        }
      }
    })
  },

  // Remove todas as faltas (e substitutos) de um professor em uma data
  clearDayAbsences: (teacherId, date) => {
    const beforeAbsences = get().absences
    set(s => ({
      absences: s.absences
        .map(ab => {
          if (ab.teacherId !== teacherId) return ab
          const slots = ab.slots.filter(sl => sl.date !== date)
          if (!slots.length) return null
          const covered = slots.filter(sl => sl.substituteId).length
          const status  = covered === 0 ? 'open' : covered < slots.length ? 'partial' : 'covered'
          return { ...ab, slots, status }
        })
        .filter(Boolean),
    }))
    const afterAbsences = get().absences
    const deletedIds = beforeAbsences
      .filter(ab => ab.teacherId === teacherId && ab.slots.some(sl => sl.date === date))
      .filter(ab => !afterAbsences.find(a => a.id === ab.id))
      .map(ab => ab.id)
    deletedIds.forEach(id => deleteDocById('absences', id))
    afterAbsences
      .filter(ab => ab.teacherId === teacherId && ab.slots.some(sl => sl.date === date))
      .forEach(ab => updateDocById('absences', ab.id, { slots: ab.slots, status: ab.status }))
  },

  // ─── Histórico ────────────────────────────────────────────────────────────────
  addHistory: (entry) => {
    set(s => ({ history: [...s.history, { id: uid(), ...entry, registeredAt: new Date().toISOString() }] }))
    const newEntry = get().history[get().history.length - 1]
    saveDoc('history', newEntry)
  },

  deleteHistory: (id) => {
    set(s => ({ history: s.history.filter(h => h.id !== id) }))
    deleteDocById('history', id)
  },


  // ─── Config ───────────────────────────────────────────────────────────────────
  setWorkload: (warn, danger) => {
    set({ workloadWarn: warn, workloadDanger: danger })
    saveConfig(get())
  },

  // ─── Lazy loading ──────────────────────────────────────────────────────────────
  markTeachersLoaded: () => set({ teachersLoaded: true }),
  markSchedulesLoaded: () => set({ schedulesLoaded: true }),
  markAbsencesLoaded: () => set({ absencesLoaded: true }),
  markHistoryLoaded: () => set({ historyLoaded: true }),

  loadAbsencesIfNeeded: async () => {
    const { absencesLoaded, absences } = get()
    if (absencesLoaded || absences.length > 0) return
    try {
      const loaded = await _loadCol('absences')
      set({ absences: loaded, absencesLoaded: true })
      // Register listener after loading
      if (!absencesUnsubscribe) {
        absencesUnsubscribe = registerAbsencesListener(get())
      }
    } catch (e) {
      console.warn('[store] Falha ao carregar absences:', e)
    }
  },

  loadHistoryIfNeeded: async () => {
    const { historyLoaded, history } = get()
    if (historyLoaded || history.length > 0) return
    try {
      const loaded = await _loadCol('history')
      set({ history: loaded, historyLoaded: true })
      // Register listener after loading
      if (!historyUnsubscribe) {
        historyUnsubscribe = registerHistoryListener(get())
      }
    } catch (e) {
      console.warn('[store] Falha ao carregar history:', e)
    }
  },

  clearSaveTimer: () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  },
  }
})

export default useAppStore
