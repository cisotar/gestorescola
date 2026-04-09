import { create } from 'zustand'
import { uid } from '../lib/helpers'
import { saveToFirestore, saveDoc, deleteDocById, _saveToLS } from '../lib/db'
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
    set(s => {
      const removedSubjIds = new Set(s.subjects.filter(x => x.areaId === id).map(x => x.id))
      return {
        areas:    s.areas.filter(a => a.id !== id),
        subjects: s.subjects.filter(x => x.areaId !== id),
        teachers: s.teachers.map(t => ({ ...t, subjectIds: (t.subjectIds ?? []).filter(sid => !removedSubjIds.has(sid)) })),
      }
    })
    get().save()
  },

  // ─── Matérias ────────────────────────────────────────────────────────────────
  addSubject: (name, areaId) => {
    set(s => ({ subjects: [...s.subjects, { id: uid(), name: name.trim(), areaId }] }))
    get().save()
  },
  removeSubject: (id) => {
    set(s => ({
      subjects: s.subjects.filter(x => x.id !== id),
      teachers: s.teachers.map(t => ({ ...t, subjectIds: (t.subjectIds ?? []).filter(sid => sid !== id) })),
    }))
    get().save()
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
    get().save()
  },

  // ─── Professores ─────────────────────────────────────────────────────────────
  addTeacher: (name, opts = {}) => {
    const teacher = { id: uid(), name: name.trim(), subjectIds: opts.subjectIds ?? [],
      email: opts.email ?? '', whatsapp: '', celular: opts.celular ?? '', status: 'approved' }
    set(s => ({ teachers: [...s.teachers, teacher] }))
    saveDoc('teachers', teacher)
    get().save()
  },
  updateTeacher: (id, changes) => {
    set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t) }))
    get().save()
  },
  removeTeacher: (id) => {
    set(s => ({
      teachers:  s.teachers.filter(t => t.id !== id),
      schedules: s.schedules.filter(x => x.teacherId !== id),
    }))
    deleteDocById('teachers', id)
    get().save()
  },

  // ─── Horários ────────────────────────────────────────────────────────────────
  addSchedule: (sched) => {
    const item = { id: uid(), ...sched }
    set(s => ({ schedules: [...s.schedules, item] }))
    saveDoc('schedules', item)
    get().save()
  },
  removeSchedule: (id) => {
    set(s => ({ schedules: s.schedules.filter(x => x.id !== id) }))
    deleteDocById('schedules', id)
    get().save()
  },
  updateSchedule: (id, changes) => {
    set(s => ({ schedules: s.schedules.map(x => x.id === id ? { ...x, ...changes } : x) }))
    get().save()
  },
  migrateScheduleSubject: (teacherId, fromSubjectId, toSubjectId) => {
    set(s => ({
      schedules: s.schedules.map(x =>
        x.teacherId === teacherId && x.subjectId === fromSubjectId
          ? { ...x, subjectId: toSubjectId }
          : x
      ),
    }))
    get().save()
  },
  removeSchedulesBySubject: (teacherId, subjectId) => {
    set(s => ({
      schedules: s.schedules.filter(
        x => !(x.teacherId === teacherId && x.subjectId === subjectId)
      ),
    }))
    get().save()
  },

  // ─── Ausências ───────────────────────────────────────────────────────────────
  createAbsence: (teacherId, rawSlots) => {
    set(s => ({ absences: _createAbsence(teacherId, rawSlots, s.absences) }))
    get().save()
  },
  assignSubstitute: (absenceId, slotId, substituteId) => {
    set(s => ({ absences: _assignSubstitute(absenceId, slotId, substituteId, s.absences) }))
    get().save()
  },
  deleteAbsenceSlot: (absenceId, slotId) => {
    set(s => ({ absences: _deleteAbsenceSlot(absenceId, slotId, s.absences) }))
    get().save()
  },
  deleteAbsence: (id) => {
    set(s => ({ absences: _deleteAbsence(id, s.absences) }))
    deleteDocById('absences', id)
    get().save()
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
    get().save()
  },

  // Remove todas as faltas (e substitutos) de um professor em uma data
  clearDayAbsences: (teacherId, date) => {
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
    get().save()
  },

  // ─── Histórico ────────────────────────────────────────────────────────────────
  addHistory: (entry) => {
    set(s => ({ history: [...s.history, { id: uid(), ...entry, registeredAt: new Date().toISOString() }] }))
    get().save()
  },
  deleteHistory: (id) => {
    set(s => ({ history: s.history.filter(h => h.id !== id) }))
    get().save()
  },

  // ─── Config ───────────────────────────────────────────────────────────────────
  setWorkload: (warn, danger) => {
    set({ workloadWarn: warn, workloadDanger: danger })
    get().save()
  },
}))

export default useAppStore
