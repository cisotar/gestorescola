import { create } from 'zustand'
import { uid } from '../lib/helpers'
import { saveToFirestore, saveDoc, deleteDocById, _saveToLS, saveConfig } from '../lib/db'
import { defaultCfg } from '../lib/periods'
import { COLOR_PALETTE } from '../lib/constants'
import {
  createAbsence as _createAbsence,
  assignSubstitute as _assignSubstitute,
  deleteAbsenceSlot as _deleteAbsenceSlot,
  deleteAbsence as _deleteAbsence,
} from '../lib/absences'

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
  teachers:      [],
  schedules:     [],
  absences:      [],
  history:       [],
  subs:          {},
  workloadWarn:  20,
  workloadDanger:26,
  loaded:        false,
}

const useAppStore = create((set, get) => ({
  ...INITIAL_STATE,

  // ─── Hidratação ─────────────────────────────────────────────────────────────
  hydrate: (data) => set({ ...data, loaded: true }),

  // ─── Persistência ──────────────────────────────────────────────────────────
  save: async () => {
    const s = get()
    _saveToLS(s)
  },

  // ─── Segmentos ──────────────────────────────────────────────────────────────
  addSegment: (name, turno = 'manha') => {
    const seg = { id: uid(), name: name.trim(), turno, grades: [] }
    set(s => ({
      segments: [...s.segments, seg],
      periodConfigs: { ...s.periodConfigs, [seg.id]: { [turno]: defaultCfg(turno) } },
    }))
    get().save()
  },
  removeSegment: (id) => {
    set(s => {
      const { [id]: _, ...rest } = s.periodConfigs
      return { segments: s.segments.filter(x => x.id !== id), periodConfigs: rest }
    })
    get().save()
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
    get().save()
  },
  addGrade: (segId, gradeName) => {
    set(s => ({
      segments: s.segments.map(seg =>
        seg.id !== segId || seg.grades.find(g => g.name === gradeName.trim())
          ? seg
          : { ...seg, grades: [...seg.grades, { name: gradeName.trim(), classes: [] }] }
      ),
    }))
    get().save()
  },
  removeGrade: (segId, gradeName) => {
    set(s => ({
      segments: s.segments.map(seg =>
        seg.id !== segId ? seg : { ...seg, grades: seg.grades.filter(g => g.name !== gradeName) }
      ),
    }))
    get().save()
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
    get().save()
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
    get().save()
  },

  // ─── Períodos ───────────────────────────────────────────────────────────────
  savePeriodCfg: (segId, turno, cfg) => {
    set(s => ({
      periodConfigs: {
        ...s.periodConfigs,
        [segId]: { ...(s.periodConfigs[segId] || {}), [turno]: cfg },
      },
    }))
    get().save()
  },

  // ─── Áreas ──────────────────────────────────────────────────────────────────
  addArea: (name, colorIdx, segmentIds = []) => {
    set(s => ({
      areas: [...s.areas, { id: uid(), name: name.trim(), colorIdx, segmentIds }],
    }))
    get().save()
  },
  updateArea: (id, changes) => {
    set(s => ({ areas: s.areas.map(a => a.id === id ? { ...a, ...changes } : a) }))
    get().save()
  },
  removeArea: (id) => {
    let modifiedTeachers = [];
    set(s => {
      const removedSubjIds = new Set(s.subjects.filter(x => x.areaId === id).map(x => x.id))
      const newTeachers = s.teachers.map(t => {
        const remaining = (t.subjectIds ?? []).filter(sid => !removedSubjIds.has(sid))
        if(remaining.length !== (t.subjectIds ?? []).length) {
          const nt = { ...t, subjectIds: remaining };
          modifiedTeachers.push(nt);
          return nt;
        }
        return t;
      })
      return {
        areas:    s.areas.filter(a => a.id !== id),
        subjects: s.subjects.filter(x => x.areaId !== id),
        teachers: newTeachers,
      }
    })
    modifiedTeachers.forEach(t => saveDoc('teachers', t))
    saveConfig(get())
    _saveToLS(get())
  },

  // ─── Matérias ────────────────────────────────────────────────────────────────
  addSubject: (name, areaId) => {
    set(s => ({ subjects: [...s.subjects, { id: uid(), name: name.trim(), areaId }] }))
    get().save()
  },
  removeSubject: (id) => {
    let modifiedTeachers = [];
    set(s => {
      const newTeachers = s.teachers.map(t => {
        const remaining = (t.subjectIds ?? []).filter(sid => sid !== id)
        if(remaining.length !== (t.subjectIds ?? []).length) {
           const nt = { ...t, subjectIds: remaining };
           modifiedTeachers.push(nt);
           return nt;
        }
        return t;
      })
      return {
        subjects: s.subjects.filter(x => x.id !== id),
        teachers: newTeachers,
      }
    })
    modifiedTeachers.forEach(t => saveDoc('teachers', t))
    saveConfig(get())
    _saveToLS(get())
  },
  saveAreaWithSubjects: (areaId, name, subjectNames) => {
    let modifiedTeachers = [];
    set(s => {
      const existing = s.subjects.filter(x => x.areaId === areaId)
      const toRemove = existing.filter(x => !subjectNames.includes(x.name)).map(x => x.id)
      const toAdd    = subjectNames
        .filter(n => !existing.find(x => x.name === n))
        .map(n => ({ id: uid(), name: n, areaId }))
      const removedSet = new Set(toRemove)
      const newTeachers = s.teachers.map(t => {
        const remaining = (t.subjectIds ?? []).filter(sid => !removedSet.has(sid))
        if(remaining.length !== (t.subjectIds ?? []).length) {
           const nt = { ...t, subjectIds: remaining };
           modifiedTeachers.push(nt);
           return nt;
        }
        return t;
      })
      return {
        areas:    s.areas.map(a => a.id === areaId ? { ...a, name } : a),
        subjects: [...s.subjects.filter(x => !removedSet.has(x.id)), ...toAdd],
        teachers: newTeachers,
      }
    })
    modifiedTeachers.forEach(t => saveDoc('teachers', t))
    saveConfig(get())
    _saveToLS(get())
  },

  // ─── Professores ─────────────────────────────────────────────────────────────
  addTeacher: (name, opts = {}) => {
    const teacher = { id: uid(), name: name.trim(), subjectIds: opts.subjectIds ?? [],
      email: opts.email ?? '', whatsapp: '', celular: opts.celular ?? '', status: 'approved' }
    set(s => ({ teachers: [...s.teachers, teacher] }))
    saveDoc('teachers', teacher)
    _saveToLS(get())
  },
  updateTeacher: (id, changes) => {
    set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t) }))
    const updated = get().teachers.find(t => t.id === id)
    if (updated) saveDoc('teachers', updated)
    _saveToLS(get())
  },
  removeTeacher: (id) => {
    const removedScheds = get().schedules.filter(x => x.teacherId === id)
    set(s => ({
      teachers:  s.teachers.filter(t => t.id !== id),
      schedules: s.schedules.filter(x => x.teacherId !== id),
    }))
    deleteDocById('teachers', id)
    removedScheds.forEach(s => deleteDocById('schedules', s.id))
    _saveToLS(get())
  },

  // ─── Horários ────────────────────────────────────────────────────────────────
  addSchedule: (sched) => {
    const item = { id: uid(), ...sched }
    set(s => ({ schedules: [...s.schedules, item] }))
    saveDoc('schedules', item)
    _saveToLS(get())
  },
  removeSchedule: (id) => {
    set(s => ({ schedules: s.schedules.filter(x => x.id !== id) }))
    deleteDocById('schedules', id)
    _saveToLS(get())
  },
  updateSchedule: (id, changes) => {
    set(s => ({ schedules: s.schedules.map(x => x.id === id ? { ...x, ...changes } : x) }))
    const updated = get().schedules.find(x => x.id === id)
    if (updated) saveDoc('schedules', updated)
    _saveToLS(get())
  },

  // ─── Ausências ───────────────────────────────────────────────────────────────
  createAbsence: (teacherId, rawSlots) => {
    set(s => ({ absences: _createAbsence(teacherId, rawSlots, s.absences) }))
    const arr = get().absences;
    if (arr.length > 0) saveDoc('absences', arr[arr.length - 1])
    _saveToLS(get())
  },
  assignSubstitute: (absenceId, slotId, substituteId) => {
    set(s => ({ absences: _assignSubstitute(absenceId, slotId, substituteId, s.absences) }))
    const updated = get().absences.find(a => a.id === absenceId)
    if (updated) saveDoc('absences', updated)
    _saveToLS(get())
  },
  deleteAbsenceSlot: (absenceId, slotId) => {
    set(s => ({ absences: _deleteAbsenceSlot(absenceId, slotId, s.absences) }))
    const updated = get().absences.find(a => a.id === absenceId)
    if (updated) saveDoc('absences', updated)
    else deleteDocById('absences', absenceId)
    _saveToLS(get())
  },
  deleteAbsence: (id) => {
    set(s => ({ absences: _deleteAbsence(id, s.absences) }))
    deleteDocById('absences', id)
    _saveToLS(get())
  },

  // Remove todos os substitutos de um professor em uma data (mantém as faltas)
  clearDaySubstitutes: (teacherId, date) => {
    const toUpdate = [];
    set(s => ({
      absences: s.absences.map(ab => {
        if (ab.teacherId !== teacherId) return ab
        const hasDate = ab.slots.some(sl => sl.date === date)
        if (!hasDate) return ab
        const slots = ab.slots.map(sl => sl.date === date ? { ...sl, substituteId: null } : sl)
        const covered = slots.filter(sl => sl.substituteId).length
        const status  = covered === 0 ? 'open' : covered < slots.length ? 'partial' : 'covered'
        const newAb = { ...ab, slots, status }
        toUpdate.push(newAb.id);
        return newAb;
      }),
    }))
    toUpdate.forEach(id => {
      const a = get().absences.find(x => x.id === id)
      if (a) saveDoc('absences', a)
    })
    _saveToLS(get())
  },

  // Remove todas as faltas (e substitutos) de um professor em uma data
  clearDayAbsences: (teacherId, date) => {
    const toUpdate = [];
    const toDelete = [];
    set(s => ({
      absences: s.absences
        .map(ab => {
          if (ab.teacherId !== teacherId) return ab
          const hasDate = ab.slots.some(sl => sl.date === date)
          if (!hasDate) return ab
          const slots = ab.slots.filter(sl => sl.date !== date)
          if (!slots.length) {
            toDelete.push(ab.id);
            return null
          }
          const covered = slots.filter(sl => sl.substituteId).length
          const status  = covered === 0 ? 'open' : covered < slots.length ? 'partial' : 'covered'
          const newAb = { ...ab, slots, status }
          toUpdate.push(newAb.id);
          return newAb
        })
        .filter(Boolean),
    }))
    toUpdate.forEach(id => {
      const a = get().absences.find(x => x.id === id)
      if (a) saveDoc('absences', a)
    })
    toDelete.forEach(id => deleteDocById('absences', id))
    _saveToLS(get())
  },

  // ─── Histórico ────────────────────────────────────────────────────────────────
  addHistory: (entry) => {
    const item = { id: uid(), ...entry, registeredAt: new Date().toISOString() }
    set(s => ({ history: [...s.history, item] }))
    saveDoc('history', item)
    _saveToLS(get())
  },
  deleteHistory: (id) => {
    set(s => ({ history: s.history.filter(h => h.id !== id) }))
    deleteDocById('history', id)
    _saveToLS(get())
  },

  // ─── Config ───────────────────────────────────────────────────────────────────
  setWorkload: (warn, danger) => {
    set({ workloadWarn: warn, workloadDanger: danger })
    saveConfig(get())
    _saveToLS(get())
  },
}))

export default useAppStore
