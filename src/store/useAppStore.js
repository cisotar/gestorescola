import { create } from 'zustand'
import { uid, isFormationSlot, runResilientWrite } from '../lib/helpers'
import { saveToFirestore, saveDoc, deleteDocById, updateDocById, _saveToLS, patchTeacherSelf, _loadCol, registerAbsencesListener, registerHistoryListener, saveConfig, submitPendingAction } from '../lib/db'
import { defaultCfg } from '../lib/periods'
import { COLOR_PALETTE } from '../lib/constants'
import { formatISO } from '../lib/helpers/dates'
import { db, functions } from '../lib/firebase'
import { writeBatch, serverTimestamp, doc as firestoreDoc, collection as firestoreCollection } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import {
  createAbsence as _createAbsence,
  assignSubstitute as _assignSubstitute,
  deleteAbsenceSlot as _deleteAbsenceSlot,
  deleteAbsence as _deleteAbsence,
} from '../lib/absences'
import { toast } from '../hooks/useToast'
import { captureException } from '../lib/sentry'
import useAuthStore from './useAuthStore'
import useSchoolStore from './useSchoolStore'
import { getSchoolDocRef } from '../lib/firebase/multi-tenant'

// ─── Helper: obtém schoolId corrente de forma síncrona ───────────────────────
const _schoolId = () => useSchoolStore.getState().currentSchoolId

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
   * @type {Array<{id: string, name: string, type: 'formation'|'elective'|'rest', subjects?: string[]}>}
   *
   * - type: 'formation' — não demanda substituto (ex: ATPCG, ATPCA)
   * - type: 'elective' — demanda substituto como aulas regulares
   * - type: 'rest'     — período de descanso/almoço; não demanda substituto
   * - subjects — lista opcional de matérias da turma; ausente em registros antigos (ler com `?? []`)
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
      await submitPendingAction(_schoolId(), { ..._coordinatorCtx(), action, payload, summary })
      toast('Solicitação enviada para aprovação do ADM', 'warn')
    } catch {
      toast('Erro ao enviar solicitação', 'error')
    }
  }

  return {
    ...INITIAL_STATE,

    // ─── Hidratação ─────────────────────────────────────────────────────────────
    // Se `data.loaded` for explicitamente `false`, respeita (ex: switchSchool usa
    // isso para sinalizar que o store foi limpo e ainda não foi recarregado).
    // Em todos os outros casos (undefined ou true) assume loaded=true.
    hydrate: (data) => set({
      ...data,
      loaded: data.loaded !== false,
      teachersLoaded: data.loaded === false ? false : !!data.teachers?.length,
      schedulesLoaded: data.loaded === false ? false : !!data.schedules?.length,
      absencesLoaded: data.loaded === false ? false : !!data.absences?.length,
      historyLoaded: data.loaded === false ? false : !!data.history?.length,
    }),

    // ─── Persistência ──────────────────────────────────────────────────────────
    save: async (schoolId) => {
      const sid = schoolId ?? _schoolId()
      const s = get()
      _saveToLS(sid, s)
      try {
        await saveToFirestore(sid, s)
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
    saveConfig(_schoolId(), get())
  },
  removeSegment: async (id) => {
    const seg = get().segments.find(s => s.id === id)
    if (_isCoordinator()) return _submitApproval('removeSegment', { id }, `Remover segmento ${seg?.name ?? id}`)
    set(s => {
      const { [id]: _, ...rest } = s.periodConfigs
      return { segments: s.segments.filter(x => x.id !== id), periodConfigs: rest }
    })
    saveConfig(_schoolId(), get())
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
    saveConfig(_schoolId(), get())
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
    saveConfig(_schoolId(), get())
  },
  removeGrade: async (segId, gradeName) => {
    if (_isCoordinator()) return _submitApproval('removeGrade', { segId, gradeName }, `Remover série ${gradeName}`)
    set(s => ({
      segments: s.segments.map(seg =>
        seg.id !== segId ? seg : { ...seg, grades: seg.grades.filter(g => g.name !== gradeName) }
      ),
    }))
    saveConfig(_schoolId(), get())
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
    saveConfig(_schoolId(), get())
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
    saveConfig(_schoolId(), get())
  },

  removeClassFromGradeCascade: async (segId, gradeName, letter) => {
    const fullLabel = `${gradeName} ${letter}`

    // ── Caminho coordenador: submete para aprovação sem executar ──────────────
    if (_isCoordinator()) {
      const s = get()
      const schedulesCount = s.schedules.filter(sc => sc.turma === fullLabel).length
      const today = formatISO(new Date())
      const futureAbsCount = s.absences.filter(ab =>
        ab.slots.some(sl => sl.turma === fullLabel && sl.date >= today)
      ).length
      const summary = `Remover turma ${fullLabel} (cascade: ${schedulesCount} aulas, ${futureAbsCount} faltas futuras)`
      return _submitApproval('removeClassFromGradeCascade', { segId, gradeName, letter }, summary)
    }

    const today = formatISO(new Date())
    const s = get()

    // ── Coletar schedules a deletar ───────────────────────────────────────────
    const schedulesToDelete = s.schedules.filter(sc => sc.turma === fullLabel)

    // ── Coletar absences afetadas (com ao menos um slot futuro da turma) ──────
    const absencesAffected = s.absences
      .map(ab => {
        const futureSlots = ab.slots.filter(sl => sl.turma === fullLabel && sl.date >= today)
        if (futureSlots.length === 0) return null
        const slotsToKeep = ab.slots.filter(sl => !(sl.turma === fullLabel && sl.date >= today))
        return { absence: ab, slotsToKeep, futureSlots }
      })
      .filter(Boolean)

    const absencesToDelete = absencesAffected.filter(x => x.slotsToKeep.length === 0)
    const absencesToUpdate = absencesAffected.filter(x => x.slotsToKeep.length > 0)

    // ── Contadores para retorno e auditoria ───────────────────────────────────
    const schedulesDeleted = schedulesToDelete.length
    const futureSlotsDeleted = absencesAffected.reduce((acc, x) => acc + x.futureSlots.length, 0)
    const absencesAffectedCount = absencesAffected.length
    const pastSlotsKept = absencesAffected.reduce((acc, x) => acc + x.slotsToKeep.length, 0)

    // ── Montar operações de batch ─────────────────────────────────────────────
    const ops = [] // array de funções (batch) => void

    const sid = _schoolId()
    for (const sc of schedulesToDelete) {
      ops.push(batch => batch.delete(getSchoolDocRef(sid, 'schedules', sc.id)))
    }
    for (const { absence, slotsToKeep } of absencesToUpdate) {
      ops.push(batch => batch.update(getSchoolDocRef(sid, 'absences', absence.id), { slots: slotsToKeep }))
    }
    for (const { absence } of absencesToDelete) {
      ops.push(batch => batch.delete(getSchoolDocRef(sid, 'absences', absence.id)))
    }

    // ── Executar batches em chunks de 499 (limite Firestore = 500) ────────────
    const CHUNK = 499
    for (let i = 0; i < ops.length; i += CHUNK) {
      const chunk = ops.slice(i, i + CHUNK)
      const batch = writeBatch(db)
      for (const apply of chunk) apply(batch)
      await batch.commit()
    }

    // ── Remover turma de meta/config ──────────────────────────────────────────
    await get().removeClassFromGrade(segId, gradeName, letter)

    // ── Gravar documento de auditoria em admin_actions/ ───────────────────────
    const executedBy = useAuthStore.getState().user?.email ?? ''
    const actionId = uid()
    try {
      await saveDoc(sid, 'admin_actions', {
        id: actionId,
        type: 'removeClassFromGrade',
        removedClass: fullLabel,
        segId,
        gradeName,
        letter,
        removedAt: today,
        executedBy,
        schedulesDeletedCount: schedulesDeleted,
        absencesAffectedCount,
        futureSlotsDeleted,
        pastSlotsKept,
        createdAt: serverTimestamp(),
      })
    } catch (e) {
      console.error('[removeClassFromGradeCascade] Falha ao gravar admin_actions:', e)
    }

    // ── Atualizar estado Zustand de forma imutável ────────────────────────────
    const deletedScheduleIds = new Set(schedulesToDelete.map(sc => sc.id))
    const deletedAbsenceIds = new Set(absencesToDelete.map(x => x.absence.id))
    const updatedAbsenceMap = new Map(absencesToUpdate.map(x => [x.absence.id, x.slotsToKeep]))

    set(s2 => ({
      schedules: s2.schedules.filter(sc => !deletedScheduleIds.has(sc.id)),
      absences: s2.absences
        .filter(ab => !deletedAbsenceIds.has(ab.id))
        .map(ab => updatedAbsenceMap.has(ab.id)
          ? { ...ab, slots: updatedAbsenceMap.get(ab.id) }
          : ab
        ),
    }))

    return { schedulesDeleted, futureSlotsDeleted, absencesAffected: absencesAffectedCount, pastSlotsKept }
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
    saveConfig(_schoolId(), get())
  },

  // ─── Áreas ──────────────────────────────────────────────────────────────────
  addArea: async (name, colorIdx, segmentIds = [], shared = false) => {
    if (_isCoordinator()) return _submitApproval('addArea', { name, colorIdx, segmentIds, shared }, `Adicionar área ${name.trim()}`)
    set(s => ({
      areas: [...s.areas, { id: uid(), name: name.trim(), colorIdx, segmentIds, shared }],
    }))
    saveConfig(_schoolId(), get())
  },
  updateArea: async (id, changes) => {
    const area = get().areas.find(a => a.id === id)
    if (_isCoordinator()) return _submitApproval('updateArea', { id, changes }, `Editar área ${area?.name ?? id}`)
    set(s => ({ areas: s.areas.map(a => a.id === id ? { ...a, ...changes } : a) }))
    saveConfig(_schoolId(), get())
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
    saveConfig(_schoolId(), get())
  },

  // ─── Matérias ────────────────────────────────────────────────────────────────
  addSubject: async (name, areaId) => {
    if (_isCoordinator()) return _submitApproval('addSubject', { name, areaId }, `Adicionar disciplina ${name.trim()}`)
    set(s => ({ subjects: [...s.subjects, { id: uid(), name: name.trim(), areaId }] }))
    saveConfig(_schoolId(), get())
  },
  removeSubject: async (id) => {
    const subj = get().subjects.find(x => x.id === id)
    if (_isCoordinator()) return _submitApproval('removeSubject', { id }, `Remover disciplina ${subj?.name ?? id}`)
    set(s => ({
      subjects: s.subjects.filter(x => x.id !== id),
      teachers: s.teachers.map(t => ({ ...t, subjectIds: (t.subjectIds ?? []).filter(sid => sid !== id) })),
    }))
    saveConfig(_schoolId(), get())
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
    saveConfig(_schoolId(), get())
  },

  // ─── Turmas compartilhadas ──────────────────────────────────────────────────
  /**
   * Adiciona nova turma compartilhada com validação de type.
   * @param {Object} series - Turma a adicionar
   * @param {string} series.id - Identificador único
   * @param {string} series.name - Nome exibido
   * @param {'formation'|'elective'|'rest'} series.type - Tipo obrigatório
   * @throws {Error} Se type não for 'formation', 'elective' ou 'rest'
   */
  addSharedSeries: (series) => {
    if (!['formation', 'elective', 'rest'].includes(series.type)) {
      throw new Error(`Tipo inválido: ${series.type}. Aceitos: 'formation', 'elective', 'rest'`)
    }
    set(s => ({ sharedSeries: [...s.sharedSeries, series] }))
    saveConfig(_schoolId(), get())
  },

  /**
   * Atualiza turma compartilhada existente com validação de type.
   * @param {string} id - ID da turma a atualizar
   * @param {Object} changes - Campos a atualizar
   * @param {'formation'|'elective'|'rest'} [changes.type] - Tipo (opcional), validado se presente
   * @param {string[]} [changes.subjects] - Lista de matérias da turma (opcional); leituras downstream devem usar `series.subjects ?? []`
   * @throws {Error} Se type for inválido
   */
  updateSharedSeries: (id, changes) => {
    if (changes.type && !['formation', 'elective', 'rest'].includes(changes.type)) {
      throw new Error(`Tipo inválido: ${changes.type}. Aceitos: 'formation', 'elective', 'rest'`)
    }
    set(s => ({ sharedSeries: s.sharedSeries.map(ss => ss.id === id ? { ...ss, ...changes } : ss) }))
    saveConfig(_schoolId(), get())
  },
  removeSharedSeries: (id) => {
    set(s => ({ sharedSeries: s.sharedSeries.filter(ss => ss.id !== id) }))
    saveConfig(_schoolId(), get())
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
    saveDoc(_schoolId(), 'teachers', teacher)
  },
  updateTeacher: async (id, changes) => {
    const teacher = get().teachers.find(t => t.id === id)
    if (_isCoordinator()) return _submitApproval('updateTeacher', { id, changes }, `Editar professor ${teacher?.name ?? id}`)
    const original = {}
    Object.keys(changes).forEach(k => { original[k] = teacher?.[k] })
    set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t) }))
    try {
      await updateDocById(_schoolId(), 'teachers', id, changes)
    } catch (e) {
      // Reverter apenas os campos alterados para evitar sobrescrever mudanças concorrentes
      set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...original } : t) }))
      throw e
    }
  },
  updateTeacherProfile: async (id, changes) => {
    set(s => ({ teachers: s.teachers.map(t => t.id === id ? { ...t, ...changes } : t) }))
    await patchTeacherSelf(_schoolId(), id, changes)
  },
  removeTeacher: async (id) => {
    const teacher = get().teachers.find(t => t.id === id)
    if (_isCoordinator()) return _submitApproval('removeTeacher', { id }, `Remover professor ${teacher?.name ?? id}`)

    const prevTeachers  = get().teachers
    const prevSchedules = get().schedules

    // Update otimista
    set(s => ({
      teachers:  s.teachers.filter(t => t.id !== id),
      schedules: s.schedules.filter(x => x.teacherId !== id),
    }))

    const sid = _schoolId()
    const result = await runResilientWrite(async () => {
      await httpsCallable(functions, 'removeTeacherFromSchool')({ schoolId: sid, teacherId: id })
    })

    if (!result.ok) {
      set({ teachers: prevTeachers, schedules: prevSchedules })
      let msg
      if (result.code === 'permission-denied') {
        msg = 'Sem permissão para remover este professor'
      } else if (result.code === 'failed-precondition') {
        msg = 'Você não pode remover a si mesmo'
      } else {
        msg = result.message ?? 'Não foi possível remover. Tente novamente.'
      }
      toast(msg, 'err')
      console.error('[removeTeacher]', result.code, result.message)
      captureException(new Error(result.message ?? result.code), {
        function: 'removeTeacherFromSchool',
        schoolId: sid,
        teacherId: id,
        code: result.code,
      })
      return { ok: false, code: result.code }
    }

    toast('Professor removido', 'ok')
    return { ok: true }
  },

  // ─── Horários ────────────────────────────────────────────────────────────────
  addSchedule: async (sched) => {
    const myTeacher = useAuthStore.getState().teacher
    const isOwnSchedule = sched.teacherId === myTeacher?.id
    if (_isCoordinator() && !isOwnSchedule) return _submitApproval('addSchedule', { sched }, `Adicionar aula ${sched.turma ?? ''}`)
    const item = { id: uid(), ...sched }
    set(s => ({ schedules: [...s.schedules, item] }))
    saveDoc(_schoolId(), 'schedules', item)
    toast('Aula adicionada', 'success')
  },
  removeSchedule: async (id) => {
    const sched = get().schedules.find(x => x.id === id)
    const myTeacher = useAuthStore.getState().teacher
    const isOwnSchedule = sched?.teacherId === myTeacher?.id
    if (_isCoordinator() && !isOwnSchedule) return _submitApproval('removeSchedule', { id }, `Remover aula ${sched?.turma ?? id}`)
    set(s => ({ schedules: s.schedules.filter(x => x.id !== id) }))
    deleteDocById(_schoolId(), 'schedules', id).catch(e => console.warn('removeSchedule:', e))
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
      await updateDocById(_schoolId(), 'schedules', id, changes)
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
    saveConfig(_schoolId(), get())
  },
  migrateScheduleSubject: (teacherId, fromSubjectId, toSubjectId) => {
    set(s => ({
      schedules: s.schedules.map(x =>
        x.teacherId === teacherId && x.subjectId === fromSubjectId
          ? { ...x, subjectId: toSubjectId }
          : x
      ),
    }))
    saveConfig(_schoolId(), get())
  },
  removeSchedulesBySubject: (teacherId, subjectId) => {
    set(s => ({
      schedules: s.schedules.filter(
        x => !(x.teacherId === teacherId && x.subjectId === subjectId)
      ),
    }))
    saveConfig(_schoolId(), get())
  },

  // ─── Ausências ───────────────────────────────────────────────────────────────
  createAbsence: (teacherId, rawSlots) => {
    const sharedSeries = get().sharedSeries
    const regularSlots = rawSlots.filter(s => !isFormationSlot(s.turma, s.subjectId, sharedSeries))
    if (regularSlots.length === 0) {
      toast('Slots de formação não permitem marcação de falta', 'warn')
      return
    }
    set(s => ({ absences: _createAbsence(teacherId, regularSlots, s.absences) }))
    const newAbsence = get().absences[get().absences.length - 1]
    httpsCallable(functions, 'createAbsence')({ schoolId: _schoolId(), teacherId, slots: regularSlots })
      .then(result => {
        // Substituir ID otimista local pelo ID real retornado pelo servidor
        const serverId = result?.data?.id
        if (serverId && serverId !== newAbsence.id) {
          set(s => ({
            absences: s.absences.map(ab =>
              ab.id === newAbsence.id ? { ...ab, id: serverId } : ab
            )
          }))
        }
      })
      .catch(err => {
        set(s => ({ absences: _deleteAbsence(newAbsence.id, s.absences) }))
        captureException(err, { function: 'createAbsence', schoolId: _schoolId(), teacherId })
        toast(err.message || 'Erro ao criar falta', 'err')
      })
  },

  assignSubstitute: (absenceId, slotId, substituteId) => {
    set(s => ({ absences: _assignSubstitute(absenceId, slotId, substituteId, s.absences) }))
    const updated = get().absences.find(a => a.id === absenceId)
    if (updated) {
      httpsCallable(functions, 'updateAbsence')({ schoolId: _schoolId(), absenceId, slots: updated.slots, substituteId })
        .catch(e => { console.error('[assignSubstitute]', e); captureException(e, { function: 'updateAbsence', schoolId: _schoolId(), absenceId }); toast('Erro ao salvar substituição', 'err') })
    }
  },
  deleteAbsenceSlot: (absenceId, slotId) => {
    set(s => ({ absences: _deleteAbsenceSlot(absenceId, slotId, s.absences) }))
    const updated = get().absences.find(a => a.id === absenceId)
    if (updated) {
      httpsCallable(functions, 'updateAbsence')({ schoolId: _schoolId(), absenceId, slots: updated.slots, substituteId: null })
        .catch(e => { console.error('[deleteAbsenceSlot]', e); captureException(e, { function: 'updateAbsence', schoolId: _schoolId(), absenceId }); toast('Erro ao salvar', 'err') })
    }
  },
  deleteAbsence: (id) => {
    set(s => ({ absences: _deleteAbsence(id, s.absences) }))
    httpsCallable(functions, 'deleteAbsence')({ schoolId: _schoolId(), absenceId: id })
      .catch(err => { captureException(err, { function: 'deleteAbsence', schoolId: _schoolId() }); toast(err.message || 'Erro ao deletar falta', 'err') })
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
    const sid = _schoolId()
    emptyAbsenceIds.forEach(id =>
      httpsCallable(functions, 'deleteAbsence')({ schoolId: sid, absenceId: id })
        .catch(err => { captureException(err, { function: 'deleteAbsence', schoolId: sid }); toast(err.message || 'Erro ao deletar falta', 'err') })
    )
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
          if (updated) httpsCallable(functions, 'updateAbsence')({ schoolId: _schoolId(), absenceId: ab.id, slots: updated.slots, substituteId: null }).catch(e => { console.error('[clearDaySubstitutes]', e); captureException(e, { function: 'updateAbsence', schoolId: _schoolId(), absenceId: ab.id }); toast('Erro ao salvar', 'err') })
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
    const sid = _schoolId()
    deletedIds.forEach(id =>
      httpsCallable(functions, 'deleteAbsence')({ schoolId: sid, absenceId: id })
        .catch(err => { captureException(err, { function: 'deleteAbsence', schoolId: sid }); toast(err.message || 'Erro ao deletar falta', 'err') })
    )
    afterAbsences
      .filter(ab => ab.teacherId === teacherId && ab.slots.some(sl => sl.date === date))
      .forEach(ab =>
        httpsCallable(functions, 'updateAbsence')({ schoolId: sid, absenceId: ab.id, slots: ab.slots, substituteId: null })
          .catch(e => { console.error('[clearDayAbsences]', e); captureException(e, { function: 'updateAbsence', schoolId: sid }); toast('Erro ao salvar', 'err') })
      )
  },

  // ─── Histórico ────────────────────────────────────────────────────────────────
  addHistory: (entry) => {
    set(s => ({ history: [...s.history, { id: uid(), ...entry, registeredAt: new Date().toISOString() }] }))
    const newEntry = get().history[get().history.length - 1]
    saveDoc(_schoolId(), 'history', newEntry)
  },

  deleteHistory: (id) => {
    set(s => ({ history: s.history.filter(h => h.id !== id) }))
    deleteDocById(_schoolId(), 'history', id).catch(e => console.warn('deleteHistory:', e))
  },


  // ─── Config ───────────────────────────────────────────────────────────────────
  setWorkload: async (warn, danger) => {
    if (_isCoordinator()) return _submitApproval('setWorkload', { warn, danger }, 'Atualizar limites de carga horária')
    set({ workloadWarn: warn, workloadDanger: danger })
    saveConfig(_schoolId(), get())
  },

  // ─── Lazy loading ──────────────────────────────────────────────────────────────
  markTeachersLoaded: () => set({ teachersLoaded: true }),
  markSchedulesLoaded: () => set({ schedulesLoaded: true }),
  markAbsencesLoaded: () => set({ absencesLoaded: true }),
  markHistoryLoaded: () => set({ historyLoaded: true }),

  loadAbsencesIfNeeded: async (schoolId) => {
    const { absencesLoaded, absences } = get()
    if (absencesLoaded || absences.length > 0) return
    // Resolver schoolId via useSchoolStore quando não passado pelo caller
    if (!schoolId) {
      try {
        const { default: useSchoolStore } = await import('./useSchoolStore')
        schoolId = useSchoolStore.getState().currentSchoolId
      } catch {}
    }
    if (!schoolId) return
    try {
      const loaded = await _loadCol(schoolId, 'absences')
      set({ absences: loaded, absencesLoaded: true })
      if (!absencesUnsubscribe) {
        absencesUnsubscribe = registerAbsencesListener(schoolId, get())
      }
    } catch (e) {
      console.warn('[store] Falha ao carregar absences:', e)
    }
  },

  loadHistoryIfNeeded: async (schoolId) => {
    const { historyLoaded, history } = get()
    if (historyLoaded || history.length > 0) return
    if (!schoolId) {
      try {
        const { default: useSchoolStore } = await import('./useSchoolStore')
        schoolId = useSchoolStore.getState().currentSchoolId
      } catch {}
    }
    if (!schoolId) return
    try {
      const loaded = await _loadCol(schoolId, 'history')
      set({ history: loaded, historyLoaded: true })
      if (!historyUnsubscribe) {
        historyUnsubscribe = registerHistoryListener(schoolId, get())
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
