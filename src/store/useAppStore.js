import { create } from 'zustand'
import { uid } from '../lib/helpers'
import { saveToFirestore, saveDoc, deleteDocById, updateDocById, _saveToLS, patchTeacherSelf, _loadCol, registerAbsencesListener, registerHistoryListener, saveConfig, submitPendingAction } from '../lib/db'
import { defaultCfg } from '../lib/periods'
import { COLOR_PALETTE } from '../lib/constants'
import {
  createAbsence as _createAbsence,
  assignSubstitute as _assignSubstitute,
  deleteAbsenceSlot as _deleteAbsenceSlot,
  deleteAbsence as _deleteAbsence,
} from '../lib/absences'
import { toast } from '../hooks/useToast'
import useAuthStore from './useAuthStore'

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
  /**
   * Turmas compartilhadas (FORMAÇÃO, etc.)
   * @type {Array<{id: string, name: string, type: 'formation'|'elective'}>}
   *
   * - type: 'formation' — não demanda substituto (ex: ATPCG, ATPCA)
   * - type: 'elective' — demanda substituto como aulas regulares
   */
  sharedSeries:  [],
  teachers:      [],
  schedules:     [],
  absences:      [],
  history:       [],

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

  // ─── Approval helpers (coordenador workflow) ─────────────────────────────
  const _isCoordinator = () => {
    try { return useAuthStore.getState().isCoordinator() } catch { return false }
  }
  const _coordinatorCtx = () => {
    const auth = useAuthStore.getState()
    return { coordinatorId: auth.teacher?.id ?? '', coordinatorName: auth.teacher?.name ?? '' }
  }
  const _submitApproval = async (action, payload, summary) => {
    try {
      await submitPendingAction({ ..._coordinatorCtx(), action, payload, summary })
      toast('Solicitação enviada para aprovação do ADM', 'warn')
    } catch {
      toast('Erro ao enviar solicitação', 'error')
    }
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
  addSegment: async (name, turno = 'manha') => {
    if (_isCoordinator()) return _submitApproval('addSegment', { name, turno }, `Adicionar segmento ${name.trim()}`)
    const seg = { id: uid(), name: name.trim(), turno, grades: [] }
    set(s => ({
      segments: [...s.segments, seg],
      periodConfigs: { ...s.periodConfigs, [seg.id]: { [turno]: defaultCfg(turno) } },
    }))
    saveConfig(get())
  },
  removeSegment: async (id) => {
    const seg = get().segments.find(s => s.id === id)
    if (_isCoordinator()) return _submitApproval('removeSegment', { id }, `Remover segmento ${seg?.name ?? id}`)
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
  addGrade: async (segId, gradeName) => {
    if (_isCoordinator()) return _submitApproval('addGrade', { segId, gradeName }, `Adicionar série ${gradeName.trim()}`)
    set(s => ({
      segments: s.segments.map(seg =>
        seg.id !== segId || seg.grades.find(g => g.name === gradeName.trim())
          ? seg
          : { ...seg, grades: [...seg.grades, { name: gradeName.trim(), classes: [] }] }
      ),
    }))
    saveConfig(get())
  },
  removeGrade: async (segId, gradeName) => {
    if (_isCoordinator()) return _submitApproval('removeGrade', { segId, gradeName }, `Remover série ${gradeName}`)
    set(s => ({
      segments: s.segments.map(seg =>
        seg.id !== segId ? seg : { ...seg, grades: seg.grades.filter(g => g.name !== gradeName) }
      ),
    }))
    saveConfig(get())
  },
  addClassToGrade: async (segId, gradeName, letter) => {
    const up = letter.trim().toUpperCase()
    if (_isCoordinator()) return _submitApproval('addClassToGrade', { segId, gradeName, letter: up }, `Adicionar turma ${gradeName}${up}`)
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
  removeClassFromGrade: async (segId, gradeName, letter) => {
    if (_isCoordinator()) return _submitApproval('removeClassFromGrade', { segId, gradeName, letter }, `Remover turma ${gradeName}${letter}`)
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
  /**
   * Persiste a configuração de um período em `meta/config` via Firestore.
   * O objeto `cfg` substitui integralmente `periodConfigs[segId][turno]`.
   * Campos opcionais que o chamador pode incluir em `cfg`:
   *
   * @typedef {{ id: string, inicio: string, duracao: number }} HorarioEspecial
   *   - `id`      — uid() gerado na criação; chave para referência por intervalosEspeciais
   *   - `inicio`  — horário de início no formato "HH:mm"
   *   - `duracao` — duração em minutos (inteiro > 0)
   *
   * @typedef {{ id: string, aposEspecial: string|null, duracao: number }} IntervaloEspecial
   *   - `id`           — uid() gerado na criação
   *   - `aposEspecial` — FK → horariosEspeciais[].id, ou null para posicionamento absoluto
   *   - `duracao`      — duração em minutos (inteiro > 0)
   *
   * @param {string} segId  — ID do segmento (ex: "seg-fund")
   * @param {string} turno  — turno do segmento (ex: "manha" | "tarde" | "noite")
   * @param {{ inicio: string, duracao: number, qtd: number, intervalos: Array,
   *            horariosEspeciais?: HorarioEspecial[], intervalosEspeciais?: IntervaloEspecial[] }} cfg
   *   — configuração completa do período; campos ausentes não são merged (spread substituição total)
   */
  savePeriodCfg: async (segId, turno, cfg) => {
    if (_isCoordinator()) return _submitApproval('savePeriodCfg', { segId, turno, cfg }, 'Atualizar períodos do segmento')
    set(s => ({
      periodConfigs: {
        ...s.periodConfigs,
        [segId]: { ...(s.periodConfigs[segId] || {}), [turno]: cfg },
      },
    }))
    saveConfig(get())
  },

  // ─── Áreas ──────────────────────────────────────────────────────────────────
  addArea: async (name, colorIdx, segmentIds = [], shared = false) => {
    if (_isCoordinator()) return _submitApproval('addArea', { name, colorIdx, segmentIds, shared }, `Adicionar área ${name.trim()}`)
    set(s => ({
      areas: [...s.areas, { id: uid(), name: name.trim(), colorIdx, segmentIds, shared }],
    }))
    saveConfig(get())
  },
  updateArea: async (id, changes) => {
    const area = get().areas.find(a => a.id === id)
    if (_isCoordinator()) return _submitApproval('updateArea', { id, changes }, `Editar área ${area?.name ?? id}`)
    set(s => ({ areas: s.areas.map(a => a.id === id ? { ...a, ...changes } : a) }))
    saveConfig(get())
  },
  removeArea: async (id) => {
    const area = get().areas.find(a => a.id === id)
    if (_isCoordinator()) return _submitApproval('removeArea', { id }, `Remover área ${area?.name ?? id}`)
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
  addSubject: async (name, areaId) => {
    if (_isCoordinator()) return _submitApproval('addSubject', { name, areaId }, `Adicionar disciplina ${name.trim()}`)
    set(s => ({ subjects: [...s.subjects, { id: uid(), name: name.trim(), areaId }] }))
    saveConfig(get())
  },
  removeSubject: async (id) => {
    const subj = get().subjects.find(x => x.id === id)
    if (_isCoordinator()) return _submitApproval('removeSubject', { id }, `Remover disciplina ${subj?.name ?? id}`)
    set(s => ({
      subjects: s.subjects.filter(x => x.id !== id),
      teachers: s.teachers.map(t => ({ ...t, subjectIds: (t.subjectIds ?? []).filter(sid => sid !== id) })),
    }))
    saveConfig(get())
  },
  saveAreaWithSubjects: async (areaId, name, subjectNames) => {
    if (_isCoordinator()) return _submitApproval('saveAreaWithSubjects', { areaId, name, subjectNames }, `Atualizar área ${name} e disciplinas`)
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
  /**
   * Adiciona nova turma compartilhada com validação de type.
   * @param {Object} series - Turma a adicionar
   * @param {string} series.id - Identificador único
   * @param {string} series.name - Nome exibido
   * @param {'formation'|'elective'} series.type - Tipo obrigatório
   * @throws {Error} Se type não for 'formation' ou 'elective'
   */
  addSharedSeries: (series) => {
    if (!['formation', 'elective'].includes(series.type)) {
      throw new Error(`Tipo inválido: ${series.type}. Aceitos: 'formation', 'elective'`)
    }
    set(s => ({ sharedSeries: [...s.sharedSeries, series] }))
    saveConfig(get())
  },

  /**
   * Atualiza turma compartilhada existente com validação de type.
   * @param {string} id - ID da turma a atualizar
   * @param {Object} changes - Campos a atualizar
   * @param {'formation'|'elective'} [changes.type] - Tipo (opcional), validado se presente
   * @throws {Error} Se type for inválido
   */
  updateSharedSeries: (id, changes) => {
    if (changes.type && !['formation', 'elective'].includes(changes.type)) {
      throw new Error(`Tipo inválido: ${changes.type}. Aceitos: 'formation', 'elective'`)
    }
    set(s => ({ sharedSeries: s.sharedSeries.map(ss => ss.id === id ? { ...ss, ...changes } : ss) }))
    saveConfig(get())
  },
  removeSharedSeries: (id) => {
    set(s => ({ sharedSeries: s.sharedSeries.filter(ss => ss.id !== id) }))
    saveConfig(get())
  },

  /**
   * Conta quantas aulas (schedules) referenciam uma turma compartilhada específica.
   * Função pura — retorna contagem sem efeitos colaterais.
   * @param {string} name - Nome da turma compartilhada (ex: "FORMAÇÃO")
   * @returns {number} Quantidade de schedules com turma === name
   */
  countSchedulesForSharedSeries: (name) => {
    return get().schedules.filter(s => s.turma === name).length
  },

  // ─── Professores ─────────────────────────────────────────────────────────────
  setTeachers: (teachers) => set({ teachers }),
  setSchedules: (schedules) => set({ schedules }),
  setAbsences: (absences) => set({ absences }),
  setHistory: (history) => set({ history }),

  addTeacher: async (name, opts = {}) => {
    if (_isCoordinator()) return _submitApproval('addTeacher', { name, opts }, `Adicionar professor ${name.trim()}`)
    const teacher = { id: uid(), name: name.trim(), subjectIds: opts.subjectIds ?? [],
      email: opts.email ?? '', whatsapp: '', celular: opts.celular ?? '', status: 'approved',
      profile: opts.profile ?? 'teacher' }
    set(s => ({ teachers: [...s.teachers, teacher] }))
    saveDoc('teachers', teacher)
  },
  updateTeacher: async (id, changes) => {
    const teacher = get().teachers.find(t => t.id === id)
    if (_isCoordinator()) return _submitApproval('updateTeacher', { id, changes }, `Editar professor ${teacher?.name ?? id}`)
    const original = {}
    Object.keys(changes).forEach(k => { original[k] = teacher?.[k] })
    set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t) }))
    try {
      await updateDocById('teachers', id, changes)
    } catch (e) {
      // Reverter apenas os campos alterados para evitar sobrescrever mudanças concorrentes
      set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...original } : t) }))
      throw e
    }
  },
  updateTeacherProfile: async (id, changes) => {
    set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t) }))
    await patchTeacherSelf(id, changes)
  },
  removeTeacher: async (id) => {
    const teacher = get().teachers.find(t => t.id === id)
    if (_isCoordinator()) return _submitApproval('removeTeacher', { id }, `Remover professor ${teacher?.name ?? id}`)
    const schedulesToDelete = get().schedules.filter(x => x.teacherId === id)
    set(s => ({
      teachers:  s.teachers.filter(t => t.id !== id),
      schedules: s.schedules.filter(x => x.teacherId !== id),
    }))
    deleteDocById('teachers', id)
    schedulesToDelete.forEach(s => deleteDocById('schedules', s.id))
  },

  // ─── Horários ────────────────────────────────────────────────────────────────
  addSchedule: async (sched) => {
    const myTeacher = useAuthStore.getState().teacher
    const isOwnSchedule = sched.teacherId === myTeacher?.id
    if (_isCoordinator() && !isOwnSchedule) return _submitApproval('addSchedule', { sched }, `Adicionar aula ${sched.turma ?? ''}`)
    const item = { id: uid(), ...sched }
    set(s => ({ schedules: [...s.schedules, item] }))
    saveDoc('schedules', item)
    toast('Aula adicionada', 'success')
  },
  removeSchedule: async (id) => {
    const sched = get().schedules.find(x => x.id === id)
    const myTeacher = useAuthStore.getState().teacher
    const isOwnSchedule = sched?.teacherId === myTeacher?.id
    if (_isCoordinator() && !isOwnSchedule) return _submitApproval('removeSchedule', { id }, `Remover aula ${sched?.turma ?? id}`)
    set(s => ({ schedules: s.schedules.filter(x => x.id !== id) }))
    deleteDocById('schedules', id)
  },
  updateSchedule: async (id, changes) => {
    const sched = get().schedules.find(x => x.id === id)
    const myTeacher = useAuthStore.getState().teacher
    const isOwnSchedule = sched?.teacherId === myTeacher?.id
    if (_isCoordinator() && !isOwnSchedule) return _submitApproval('updateSchedule', { id, changes }, 'Atualizar horário')
    const original = {}
    Object.keys(changes).forEach(k => { original[k] = sched?.[k] })
    set(s => ({ schedules: s.schedules.map(x => x.id === id ? { ...x, ...changes } : x) }))
    try {
      await updateDocById('schedules', id, changes)
    } catch (e) {
      set(s => ({ schedules: s.schedules.map(x => x.id === id ? { ...x, ...original } : x) }))
      console.error('[updateSchedule]', e)
      throw e
    }
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
      updateDocById('absences', absenceId, { slots: updated.slots, status: updated.status }).catch(e => { console.error('[assignSubstitute]', e); toast('Erro ao salvar substituição', 'err') })
    }
  },
  deleteAbsenceSlot: (absenceId, slotId) => {
    set(s => ({ absences: _deleteAbsenceSlot(absenceId, slotId, s.absences) }))
    const updated = get().absences.find(a => a.id === absenceId)
    if (updated) {
      updateDocById('absences', absenceId, { slots: updated.slots, status: updated.status }).catch(e => { console.error('[deleteAbsenceSlot]', e); toast('Erro ao salvar', 'err') })
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
          if (updated) updateDocById('absences', ab.id, { slots: updated.slots, status: updated.status }).catch(e => { console.error('[clearDaySubstitutes]', e); toast('Erro ao salvar', 'err') })
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
      .forEach(ab => updateDocById('absences', ab.id, { slots: ab.slots, status: ab.status }).catch(e => { console.error('[clearDayAbsences]', e); toast('Erro ao salvar', 'err') }))
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
  setWorkload: async (warn, danger) => {
    if (_isCoordinator()) return _submitApproval('setWorkload', { warn, danger }, 'Atualizar limites de carga horária')
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

  cleanupLazyListeners: () => {
    absencesUnsubscribe?.()
    absencesUnsubscribe = null
    historyUnsubscribe?.()
    historyUnsubscribe = null
  },
  }
})

export default useAppStore
