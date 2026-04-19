import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'
import useAppStore from '../store/useAppStore'
import { uid, colorOfTeacher, teacherSubjectNames, isSharedSeries } from '../lib/helpers'
import { getCfg, gerarPeriodos, gerarPeriodosEspeciais, makeEspecialSlot, defaultCfg, toMin, fromMin, calcSaldo, validarEncaixe, mergeAndSortPeriodos } from '../lib/periods'
import { COLOR_PALETTE, DAYS } from '../lib/constants'
import Modal from '../components/ui/Modal'
import { toast } from '../hooks/useToast'
import { listPendingTeachers, approveTeacher, rejectTeacher, addAdmin, listAdmins, removeAdmin, deleteDocById, subscribePendingActionsCount, getPendingActions, approvePendingAction, rejectPendingAction, getMyPendingActions } from '../lib/db'

// ─── HorarioDiaSemana ─────────────────────────────────────────────────────────

function HorarioDiaSemana({ day, value, onChange }) {
  const entrada = value?.entrada ?? ''
  const saida   = value?.saida   ?? ''
  let error = null
  if (entrada && !saida) error = 'Preencha a saída também'
  else if (!entrada && saida) error = 'Preencha a entrada também'
  else if (entrada && saida && saida <= entrada) error = 'Saída deve ser após a entrada'
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="w-20 text-sm font-medium text-t1 shrink-0">{day}</span>
        <div className="flex items-center gap-2 flex-1">
          <input type="time" className="inp flex-1" value={entrada} onChange={e => onChange(day, 'entrada', e.target.value)} />
          <span className="text-t3 text-sm shrink-0">até</span>
          <input type="time" className="inp flex-1" value={saida} onChange={e => onChange(day, 'saida', e.target.value)} />
        </div>
      </div>
      {error && <p className="text-xs text-err mt-1 ml-23">{error}</p>}
    </div>
  )
}

// ─── HorariosSemanaForm ───────────────────────────────────────────────────────

function HorariosSemanaForm({ value, onChange, onSave, onCancel, saving }) {
  const horarioErrors = Object.fromEntries(
    DAYS.map(day => {
      const v = value[day]
      const entrada = v?.entrada ?? ''
      const saida   = v?.saida   ?? ''
      let error = null
      if (entrada && !saida) error = 'Preencha a saída também'
      else if (!entrada && saida) error = 'Preencha a entrada também'
      else if (entrada && saida && saida <= entrada) error = 'Saída deve ser após a entrada'
      return [day, error]
    })
  )
  const hasHorarioError = Object.values(horarioErrors).some(Boolean)
  const handleChange = (day, field, val) => {
    onChange(prev => {
      const current = prev[day] ?? { entrada: '', saida: '' }
      const updated = { ...current, [field]: val }
      if (!updated.entrada && !updated.saida) {
        const { [day]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [day]: updated }
    })
  }
  return (
    <div className="space-y-3">
      {DAYS.map(day => (
        <HorarioDiaSemana key={day} day={day} value={value[day]} onChange={handleChange} />
      ))}
      <div className="flex gap-2 pt-1">
        <button className="btn btn-dark btn-sm" disabled={hasHorarioError || saving} onClick={onSave}>
          {saving ? 'Salvando…' : 'Salvar horários'}
        </button>
        {onCancel && <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancelar</button>}
      </div>
    </div>
  )
}

// ─── SecaoHorarios ────────────────────────────────────────────────────────────

function SecaoHorarios({ teacher, isEditable, onSaveAdmin }) {
  const store = useAppStore()
  const [editando, setEditando] = useState(false)
  const [horariosSemana, setHorariosSemana] = useState(teacher?.horariosSemana ?? {})
  const [saving, setSaving] = useState(false)
  const teacherHorarios = teacher?.horariosSemana ?? {}

  const handleSave = async () => {
    setSaving(true)
    try {
      if (onSaveAdmin) {
        await onSaveAdmin(horariosSemana)
      } else {
        await store.updateTeacherProfile(teacher.id, { horariosSemana })
        toast('Horários salvos com sucesso', 'ok')
      }
      setEditando(false)
    } catch (e) {
      console.error(e)
      toast('Erro ao salvar horários', 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="lbl !mb-0">Horários na escola</label>
        {isEditable && !editando && (
          <button className="btn btn-ghost btn-xs" onClick={() => { setHorariosSemana(teacherHorarios); setEditando(true) }}>
            Editar horários
          </button>
        )}
      </div>
      {editando ? (
        <HorariosSemanaForm
          value={horariosSemana}
          onChange={setHorariosSemana}
          onSave={handleSave}
          onCancel={() => { setHorariosSemana(teacherHorarios); setEditando(false) }}
          saving={saving}
        />
      ) : (
        <div className="space-y-1">
          {DAYS.map(day => {
            const v = teacherHorarios[day]
            return (
              <div key={day} className="flex items-center gap-3 text-sm">
                <span className="w-20 font-medium text-t1 shrink-0">{day}</span>
                <span className="text-t2">{v?.entrada && v?.saida ? `${v.entrada} – ${v.saida}` : '—'}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { role, user, teacher: myTeacher, isCoordinator } = useAuthStore()
  const isAdmin = role === 'admin'
  const location = useLocation()

  const [pendingActionsCt, setPendingActionsCt] = useState(0)
  useEffect(() => {
    if (!isAdmin) return
    return subscribePendingActionsCount(setPendingActionsCt)
  }, [isAdmin])

  const ADMIN_TABS = [
    { id: 'segments',    label: '🏫 Segmentos' },
    { id: 'disciplines', label: '📚 Disciplinas' },
    { id: 'sharedseries', label: '🧩 Turmas Compartilhadas' },
    { id: 'teachers',    label: '👩‍🏫 Professores' },
    { id: 'periods',     label: '⏰ Períodos' },
    { id: 'schedules',   label: '🗓 Horários' },
    { id: 'approvals',   label: '🔔 Aprovações', badge: true },
  ]

  const COORDINATOR_TABS = [
    { id: 'teachers',     label: '👩‍🏫 Professores' },
    { id: 'profile',      label: '👤 Meu Perfil' },
    { id: 'my-schedules', label: '🗓 Minhas Aulas' },
  ]

  const initialTab = (() => {
    if (isAdmin) {
      const param = new URLSearchParams(location.search).get('tab')
      return ADMIN_TABS.some(t => t.id === param) ? param : 'segments'
    }
    const param = new URLSearchParams(location.search).get('tab')
    const coordTabs = ['teachers', 'profile', 'my-schedules']
    return coordTabs.includes(param) ? param : 'profile'
  })()

  const [tab, setTab] = useState(initialTab)

  const tabClass = (id) =>
    `px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border whitespace-nowrap ` +
    (tab === id ? 'bg-navy text-white border-navy' : 'bg-surf text-t2 border-bdr hover:border-t3')

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">
          {isAdmin ? 'Configurações' : tab === 'teachers' ? 'Professores' : 'Meu Perfil'}
        </h1>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-6">
        {isAdmin
          ? ADMIN_TABS.map(t => (
              <button key={t.id} className={`relative ${tabClass(t.id)}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.badge && pendingActionsCt > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {pendingActionsCt > 9 ? '9+' : pendingActionsCt}
                  </span>
                )}
              </button>
            ))
          : COORDINATOR_TABS.map(t => (
              <button key={t.id} className={tabClass(t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
      </div>

      {tab === 'segments'     && <TabSegments />}
      {tab === 'disciplines'  && <TabDisciplines />}
      {tab === 'sharedseries' && <TabSharedSeries />}
      {tab === 'teachers'     && <TabTeachers />}
      {tab === 'periods'      && <TabPeriods />}
      {tab === 'schedules'    && <TabSchedules />}
      {tab === 'approvals'    && <TabApprovals adminEmail={user?.email} />}
      {tab === 'profile'      && <TabProfile teacher={myTeacher} />}
      {tab === 'my-schedules' && <TabMySchedules />}
    </div>
  )
}

// ─── TurnoSelector — reutilizável em múltiplas abas ───────────────────────────

function TurnoSelector({ seg, store }) {
  return (
    <div className="flex items-center gap-2">
      <label className="lbl !mb-0 shrink-0">Turno:</label>
      <select
        className="inp !w-auto py-1 text-sm"
        value={seg.turno ?? 'manha'}
        onChange={e => store.setSegmentTurno(seg.id, e.target.value)}
      >
        <option value="manha">🌅 Manhã</option>
        <option value="tarde">🌇 Tarde</option>
      </select>
    </div>
  )
}

// ─── Helper: detectar mudança de matérias e horários afetados ────────────────

function calcSubjectChange(teacher, newSubjectIds, schedules) {
  const oldIds = teacher.subjectIds ?? []
  const removedIds = oldIds.filter(id => !newSubjectIds.includes(id))
  const addedIds   = newSubjectIds.filter(id => !oldIds.includes(id))
  const affectedSchedules = schedules.filter(
    s => s.teacherId === teacher.id && removedIds.includes(s.subjectId)
  )
  return { removedIds, addedIds, affectedSchedules }
}

function calcAreaSubjectRemovalImpact(removedSubjectIds, schedules, teachers) {
  const affectedSchedules = schedules.filter(s => removedSubjectIds.includes(s.subjectId))
  const affectedTeacherIds = [...new Set(affectedSchedules.map(s => s.teacherId))]
  const affectedTeachers = teachers.filter(t => affectedTeacherIds.includes(t.id))
  return { affectedSchedules, affectedTeachers }
}

// ─── Modal: troca/remoção de matérias com horários afetados ──────────────────

function SubjectChangeModal({ ctx }) {
  if (!ctx) return null
  const isSwap   = ctx.removedSubjects.length === 1 && ctx.addedSubjects.length === 1
  const fromName = ctx.removedSubjects.map(s => s.name).join(', ')
  const toName   = ctx.addedSubjects.map(s => s.name).join(', ')
  const n        = ctx.affectedCount

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-surf rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-3xl text-center">📅</div>
        <h3 className="text-base font-bold text-center">
          {isSwap ? 'O que fazer com os horários?' : 'Horários serão removidos'}
        </h3>
        <p className="text-sm text-t2 leading-relaxed text-center">
          {isSwap ? (
            <><strong>{ctx.teacher.name}</strong> tinha <strong>{n} horário{n !== 1 ? 's' : ''}</strong> de <strong>{fromName}</strong>. Esses horários podem ser migrados para <strong>{toName}</strong> ou removidos.</>
          ) : (
            <><strong>{ctx.teacher.name}</strong> tinha <strong>{n} horário{n !== 1 ? 's' : ''}</strong> de <strong>{fromName}</strong>. Eles serão removidos ao confirmar.</>
          )}
        </p>
        <div className="flex flex-col gap-2 pt-1">
          {isSwap && (
            <button className="btn btn-dark w-full" onClick={ctx.onMigrate}>
              Migrar para {toName}
            </button>
          )}
          <button
            className={`btn w-full ${isSwap ? 'btn-ghost text-err' : 'btn-dark'}`}
            onClick={ctx.onRemove}
          >
            {isSwap ? 'Remover horários' : 'Confirmar remoção'}
          </button>
          <button className="btn btn-ghost w-full" onClick={ctx.onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: De-Para — mapeamento N:M de matérias sendo removidas ─────────────

function DeparaModal({ open, removedSubjects, availableSubjects, onConfirm, onCancel }) {
  const store = useAppStore()
  const [mapping, setMapping] = useState({})

  useEffect(() => {
    if (open) {
      setMapping(Object.fromEntries((removedSubjects ?? []).map(s => [s.id, null])))
    }
  }, [open, removedSubjects])

  if (!open) return null

  // B6: calcular impacto das substituições selecionadas
  const fromIdsWithSub = new Set(
    Object.entries(mapping).filter(([, toId]) => toId).map(([fromId]) => fromId)
  )
  const affectedSchedules = store.schedules.filter(s => fromIdsWithSub.has(s.subjectId))
  const affectedTeachersCount = new Set(affectedSchedules.map(s => s.teacherId)).size
  const totalSchedules = affectedSchedules.length

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-surf rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-t1">Matérias sendo removidas</h3>
          <p className="text-sm text-t2">Defina o que acontece com os horários de cada uma</p>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 text-[10px] font-bold uppercase tracking-wider text-t3 pb-1 border-b border-bdr">
          <span>Saindo</span>
          <span />
          <span>Entrando</span>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {(removedSubjects ?? []).map(subj => (
            <div key={subj.id} className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
              <div>
                <div className="text-sm font-semibold text-t1 truncate">{subj.name}</div>
                {subj.scheduleCount > 0 && (
                  <div className="text-[10px] text-t3">{subj.scheduleCount} horário{subj.scheduleCount !== 1 ? 's' : ''}</div>
                )}
              </div>
              <span className="text-t3 text-sm">⮕</span>
              <select
                className="inp text-sm"
                value={mapping[subj.id] ?? ''}
                onChange={e => setMapping(m => ({ ...m, [subj.id]: e.target.value || null }))}
              >
                <option value="">— Remover sem substituir</option>
                {(availableSubjects ?? []).map(s => (
                  <option key={s.id ?? s.name} value={s.id ?? s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="text-sm text-t2 py-2 border-t border-bdr">
          {totalSchedules > 0 ? (
            <>Impacto: <strong className="text-t1">{totalSchedules} horário{totalSchedules !== 1 ? 's' : ''}</strong> em <strong className="text-t1">{affectedTeachersCount} professor{affectedTeachersCount !== 1 ? 'es' : ''}</strong> serão atualizados</>
          ) : (
            <span className="text-t3">Nenhum horário será migrado</span>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-dark" onClick={() => onConfirm(mapping)}>
            Confirmar substituição
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helper compartilhado: segmentos de um professor ─────────────────────────
// Fonte única de verdade usada em TabTeachers, TabSchedules e ScheduleGrid.

function teacherSegmentIds(teacher, subjects, areas) {
  return [...new Set(
    (teacher.subjectIds ?? []).flatMap(sid => {
      const subj = subjects.find(s => s.id === sid)
      const area = subj ? areas.find(a => a.id === subj.areaId) : null
      return area?.segmentIds ?? []
    })
  )]
}

function teacherBelongsToSegment(teacher, segId, subjects, areas) {
  return teacherSegmentIds(teacher, subjects, areas).includes(segId)
}

// ─── Tab: Segmentos ────────────────────────────────────────────────────────────

function TabSegments() {
  const store = useAppStore()
  const [name, setName] = useState('')

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="font-bold text-sm mb-3">Novo Segmento</div>
        <div className="flex gap-2">
          <input
            className="inp"
            placeholder="Ex: Educação Infantil"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && name.trim()) {
                store.addSegment(name.trim()); setName(''); toast('Segmento criado', 'ok')
              }
            }}
          />
          <button className="btn btn-dark" onClick={() => {
            if (!name.trim()) return
            store.addSegment(name.trim()); setName(''); toast('Segmento criado', 'ok')
          }}>
            Adicionar
          </button>
        </div>
      </div>

      {/* Segmentos lado a lado no desktop — item 4 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {store.segments.map(seg => (
          <div key={seg.id} className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-base">{seg.name}</div>
                <div className="text-xs text-t3">{seg.grades.length} série{seg.grades.length !== 1 ? 's' : ''}</div>
              </div>
              <button
                className="btn btn-ghost btn-xs text-err"
                onClick={() => { if (confirm('Remover segmento?')) store.removeSegment(seg.id) }}
              >
                ✕ Remover
              </button>
            </div>

            {/* Turno — item 1 */}
            <TurnoSelector seg={seg} store={store} />

            <GradeList seg={seg} store={store} />
          </div>
        ))}
      </div>
    </div>
  )
}

function GradeList({ seg, store }) {
  const [gradeInput, setGradeInput] = useState('')

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          className="inp"
          placeholder="Ex: 5º Ano, 4ª Série…"
          value={gradeInput}
          onChange={e => setGradeInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && gradeInput.trim()) {
              store.addGrade(seg.id, gradeInput.trim()); setGradeInput('')
            }
          }}
        />
        <button className="btn btn-dark" onClick={() => {
          if (!gradeInput.trim()) return
          store.addGrade(seg.id, gradeInput.trim()); setGradeInput('')
        }}>+ Série</button>
      </div>
      <div className="space-y-3">
        {seg.grades.map(grade => <GradeRow key={grade.name} seg={seg} grade={grade} store={store} />)}
      </div>
    </div>
  )
}

function GradeRow({ seg, grade, store }) {
  const [letter, setLetter] = useState('')
  return (
    <div className="bg-surf2 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-bold text-sm flex-1">{grade.name}</span>
        <input
          className="inp !w-24 py-1 text-xs"
          placeholder="Letra (A,B…)"
          value={letter}
          onChange={e => setLetter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && letter.trim()) {
              store.addClassToGrade(seg.id, grade.name, letter.trim()); setLetter('')
            }
          }}
        />
        <button className="btn btn-dark btn-xs" onClick={() => {
          if (!letter.trim()) return
          store.addClassToGrade(seg.id, grade.name, letter.trim()); setLetter('')
        }}>+</button>
        <button className="btn btn-ghost btn-xs text-err" onClick={() => store.removeGrade(seg.id, grade.name)}>✕</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {grade.classes.map(cls => (
          <span key={cls.letter} className="inline-flex items-center gap-1 px-2 py-0.5 bg-surf border border-bdr rounded-full text-xs font-semibold">
            {grade.name} {cls.letter}
            <button className="text-t3 hover:text-err" onClick={() => store.removeClassFromGrade(seg.id, grade.name, cls.letter)}>×</button>
          </span>
        ))}
        {grade.classes.length === 0 && <span className="text-xs text-t3">Nenhuma turma.</span>}
      </div>
    </div>
  )
}

// ─── Tab: Disciplinas ──────────────────────────────────────────────────────────

function TabDisciplines() {
  const store = useAppStore()

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${store.segments.length || 1}, 1fr)` }}>
      {store.segments.map(seg => {
        const segAreas = store.areas.filter(a => (a.segmentIds ?? []).includes(seg.id))
        return (
          <div key={seg.id}>
            <div className="font-bold text-sm mb-3 pb-2 border-b border-bdr">{seg.name}</div>
            <div className="space-y-3">
              {segAreas.map(area => <AreaBlock key={area.id} area={area} store={store} />)}
            </div>
            <AddAreaRow segId={seg.id} store={store} />
          </div>
        )
      })}
    </div>
  )
}

function isSharedSchedule(schedule, store) {
  const subj = store.subjects.find(s => s.id === schedule.subjectId)
  const area = store.areas.find(a => a.id === subj?.areaId)
  return area?.shared === true
}

function AreaBlock({ area, store }) {
  const cv   = COLOR_PALETTE[area.colorIdx % COLOR_PALETTE.length]
  const subs = store.subjects.filter(s => s.areaId === area.id)
  const [name,       setName]       = useState(area.name)
  const [txt,        setTxt]        = useState(subs.map(s => s.name).join('\n'))
  const [deparaOpen, setDeparaOpen] = useState(false)
  const [deparaData, setDeparaData] = useState(null)

  const doSave = (lines) => {
    store.saveAreaWithSubjects(area.id, name.trim() || area.name, lines)
    toast('Disciplinas salvas', 'ok')
  }

  const save = () => {
    const lines      = txt.split('\n').map(l => l.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
    const prevNames  = subs.map(s => s.name)
    const removedNames = prevNames.filter(n => !lines.includes(n))
    const addedNames   = lines.filter(n => !prevNames.includes(n))

    if (removedNames.length === 0) { doSave(lines); return }

    const removedSubjectIds = subs.filter(s => removedNames.includes(s.name)).map(s => s.id)
    const { affectedSchedules, affectedTeachers } =
      calcAreaSubjectRemovalImpact(removedSubjectIds, store.schedules, store.teachers)

    if (affectedSchedules.length === 0) { doSave(lines); return }

    const removedSubjSet = new Set(removedSubjectIds)
    const removedSubjectsWithCount = removedSubjectIds.map(id => {
      const subj = store.subjects.find(s => s.id === id) ?? { id, name: id }
      const count = store.schedules.filter(s => s.subjectId === id).length
      return { id, name: subj.name, scheduleCount: count }
    })
    const newSubjects = addedNames.map(n => ({ id: n, name: n }))
    const availableSubjects = [
      ...store.subjects.filter(s => !removedSubjSet.has(s.id)),
      ...newSubjects,
    ]
    setDeparaData({ removedSubjectsWithCount, availableSubjects, lines, mode: 'save' })
    setDeparaOpen(true)
  }

  const handleDeparaConfirm = (mapping) => {
    if (!deparaData) return

    if (deparaData.mode === 'remove') {
      Object.entries(mapping).forEach(([fromId, toId]) => {
        if (!toId) {
          store.schedules
            .filter(s => s.subjectId === fromId)
            .forEach(s => store.removeSchedule(s.id))
        } else {
          store.migrateMultipleSubjects(fromId, toId)
        }
      })
      store.removeArea(area.id)
      setDeparaOpen(false)
      return
    }

    // modo 'save'
    let savedAlready = false
    const doSaveOnce = () => {
      if (!savedAlready) { doSave(deparaData.lines); savedAlready = true }
    }

    Object.entries(mapping).forEach(([fromId, toId]) => {
      if (!toId) {
        store.schedules
          .filter(s => s.subjectId === fromId)
          .forEach(s => store.removeSchedule(s.id))
      } else {
        const isNewSubject = !store.subjects.find(s => s.id === toId)
        if (isNewSubject) {
          doSaveOnce()
          const newId = useAppStore.getState().subjects.find(
            s => s.areaId === area.id && s.name === toId
          )?.id
          if (newId) store.migrateMultipleSubjects(fromId, newId)
        } else {
          store.migrateMultipleSubjects(fromId, toId)
        }
      }
    })

    doSaveOnce()
    setDeparaOpen(false)
  }

  return (
    <>
      <div className="rounded-xl border-l-4 p-3 bg-surf border border-bdr" style={{ borderLeftColor: cv.dt }}>
        <div className="flex items-center gap-2 mb-2">
          <input
            className="font-bold text-sm flex-1 bg-transparent outline-none border-b border-transparent hover:border-bdr focus:border-navy px-1 py-0.5 transition-colors"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <span className="text-xs text-t3">{subs.length} disc.</span>
          <button className="btn btn-dark btn-xs" onClick={save}>Salvar</button>
          <button className="btn btn-ghost btn-xs text-err" onClick={() => {
            const areaSubjIds = subs.map(s => s.id)
            const { affectedSchedules } = calcAreaSubjectRemovalImpact(areaSubjIds, store.schedules, store.teachers)
            if (affectedSchedules.length === 0) {
              if (confirm(`Remover área "${area.name}"?`)) store.removeArea(area.id)
              return
            }
            const removedSubjectsWithCount = subs.map(subj => ({
              id: subj.id,
              name: subj.name,
              scheduleCount: store.schedules.filter(s => s.subjectId === subj.id).length,
            }))
            const removedSubjSet = new Set(areaSubjIds)
            const availableSubjects = store.subjects.filter(s => !removedSubjSet.has(s.id))
            setDeparaData({ removedSubjectsWithCount, availableSubjects, lines: null, mode: 'remove' })
            setDeparaOpen(true)
          }}>✕</button>
        </div>
        <label className="flex items-center gap-2 text-xs text-t2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={area.shared ?? false}
            onChange={e => store.updateArea(area.id, { shared: e.target.checked })}
            className="accent-accent"
          />
          Área compartilhada
        </label>
        <textarea
          className="inp text-xs font-mono resize-y min-h-[80px] w-full"
          placeholder="Uma disciplina por linha…"
          value={txt}
          onChange={e => setTxt(e.target.value)}
          onBlur={save}
        />
      </div>
      <DeparaModal
        open={deparaOpen}
        removedSubjects={deparaData?.removedSubjectsWithCount ?? []}
        availableSubjects={deparaData?.availableSubjects ?? []}
        onConfirm={handleDeparaConfirm}
        onCancel={() => {
          if (deparaData?.mode !== 'remove') setTxt(subs.map(s => s.name).join('\n'))
          setDeparaOpen(false)
        }}
      />
    </>
  )
}

function AddAreaRow({ segId, store }) {
  const [name, setName] = useState('')
  const add = () => {
    if (!name.trim()) return
    store.addArea(name.trim(), store.areas.length % 9, [segId])
    setName('')
    toast('Área criada', 'ok')
  }
  return (
    <div className="flex gap-2 mt-3">
      <input className="inp" placeholder="Nova área…" value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && add()} />
      <button className="btn btn-dark" onClick={add}>＋</button>
    </div>
  )
}


function TabSharedSeries() {
  const store = useAppStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSeries, setEditingSeries] = useState(null)

  const openCreate = () => {
    setEditingSeries(null)
    setModalOpen(true)
  }

  const openEdit = (series) => {
    setEditingSeries(series)
    setModalOpen(true)
  }

  const handleDeleteSeries = (series) => {
    const affected = store.schedules.filter(s => s.turma === series.name).length
    if (affected > 0) {
      alert(`Não é possível excluir: ${affected} horário(s) usam esta turma.`)
      return
    }
    if (!confirm(`Remover a turma compartilhada "${series.name}"?`)) return
    store.removeSharedSeries(series.id)
    toast('Turma compartilhada removida', 'ok')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-t1">Turmas Compartilhadas</h2>
          <p className="text-sm text-t2 mt-1">
            Gerencie turmas especiais que aceitam múltiplos professores no mesmo horário.
          </p>
        </div>
        <button className="btn btn-dark" onClick={openCreate}>+ Nova turma compartilhada</button>
      </div>

      {store.sharedSeries.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-4xl mb-2">🧩</div>
          <div className="font-bold text-sm text-t1">Nenhuma turma compartilhada cadastrada</div>
          <p className="text-sm text-t2 mt-1 mb-4">
            Crie turmas de Formação ou Eletiva para uso em múltiplos professores simultâneos.
          </p>
          <button className="btn btn-dark" onClick={openCreate}>Criar primeira turma</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {store.sharedSeries.map(series => {
            const affected = store.schedules.filter(s => s.turma === series.name).length
            const typeBadgeClass = series.type === 'formation'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-amber-100 text-amber-700'
            const typeLabel = series.type === 'formation' ? 'Formação' : 'Eletiva'
            return (
              <div key={series.id} className="card">
                <div className="flex items-start gap-3 justify-between mb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 gap-y-1 flex-wrap">
                      <div className="font-bold text-base text-t1">{series.name}</div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${typeBadgeClass}`}>
                        {typeLabel}
                      </span>
                    </div>
                    <div className="text-xs text-t3 mt-2">
                      {affected > 0 ? `${affected} horário${affected !== 1 ? 's' : ''} vinculado${affected !== 1 ? 's' : ''}` : 'Sem horários vinculados'}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button className="btn btn-ghost btn-xs" onClick={() => openEdit(series)}>Editar</button>
                    <button className="btn btn-ghost btn-xs text-err" onClick={() => handleDeleteSeries(series)}>Excluir</button>
                  </div>
                </div>
                <p className="text-xs text-t3">
                  {series.type === 'formation'
                    ? 'Ausência não requer substituto. Professores escolhem matérias da lista.'
                    : 'Ausência requer substituto. Professores escolhem matérias da lista.'}
                </p>
              </div>
            )
          })}
        </div>
      )}

      <SharedSeriesModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        store={store}
        editingSeries={editingSeries}
      />
    </div>
  )
}

function SharedSeriesModal({ open, onClose, store, editingSeries }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('formation')

  useEffect(() => {
    if (!open) return
    setName(editingSeries?.name ?? '')
    setType(editingSeries?.type ?? 'formation')
  }, [open, editingSeries])

  const save = () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      alert('Informe o nome da turma compartilhada.')
      return
    }

    const duplicatedSeries = store.sharedSeries.some(
      ss => ss.name.toLowerCase() === trimmedName.toLowerCase() && ss.id !== editingSeries?.id
    )
    if (duplicatedSeries) {
      alert('Já existe uma turma compartilhada com este nome.')
      return
    }

    const payload = {
      name: trimmedName,
      type: type,
    }

    if (editingSeries) {
      store.updateSharedSeries(editingSeries.id, payload)
      toast('Turma compartilhada atualizada', 'ok')
    } else {
      store.addSharedSeries({ id: uid(), ...payload })
      toast('Turma compartilhada criada', 'ok')
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingSeries ? 'Editar turma compartilhada' : 'Nova turma compartilhada'}
      size="sm"
    >
      <div className="space-y-5">
        <div>
          <label className="lbl">Nome da turma *</label>
          <input
            className="inp"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: FORMAÇÃO"
          />
        </div>

        <div>
          <label className="lbl">Tipo *</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="formation"
                checked={type === 'formation'}
                onChange={e => setType(e.target.value)}
              />
              <span className="text-sm">Formação (não requer substituto)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="elective"
                checked={type === 'elective'}
                onChange={e => setType(e.target.value)}
              />
              <span className="text-sm">Eletiva (requer substituto)</span>
            </label>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button className="btn btn-dark flex-1" onClick={save}>Salvar</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── SubjectSelector — reutilizável ───────────────────────────────────────────

function SubjectSelector({ store, selectedIds, onChange }) {
  const [activeSeg, setActiveSeg] = useState(store.segments[0]?.id ?? null)

  const toggle = (subjectId) => {
    const next = selectedIds.includes(subjectId)
      ? selectedIds.filter(x => x !== subjectId)
      : [...selectedIds, subjectId]
    onChange(next)
  }

  const segAreas = activeSeg
    ? store.areas.filter(a => (a.segmentIds ?? []).includes(activeSeg))
    : []

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {store.segments.map(seg => {
          const countSelected = store.subjects.filter(s => {
            const area = store.areas.find(a => a.id === s.areaId)
            return (area?.segmentIds ?? []).includes(seg.id) && selectedIds.includes(s.id)
          }).length
          return (
            <button
              key={seg.id}
              onClick={() => setActiveSeg(seg.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors flex items-center gap-1.5
                ${activeSeg === seg.id ? 'bg-navy text-white border-navy' : 'bg-surf text-t2 border-bdr hover:border-t3'}`}
            >
              {seg.name}
              {countSelected > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${activeSeg === seg.id ? 'bg-white/20 text-white' : 'bg-navy text-white'}`}>
                  {countSelected}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {activeSeg && (
        <div className="border border-bdr rounded-xl overflow-hidden">
          {segAreas.length === 0 ? (
            <p className="text-xs text-t3 p-4">Nenhuma área cadastrada para este segmento.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto scroll-thin">
              {segAreas.map(area => {
                const cv   = COLOR_PALETTE[area.colorIdx % COLOR_PALETTE.length]
                const subs = store.subjects.filter(s => s.areaId === area.id)
                if (!subs.length) return null
                return (
                  <div key={area.id}>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider sticky top-0"
                      style={{ background: cv.tg, color: cv.tx }}>
                      {area.name}
                    </div>
                    {subs.map(s => (
                      <label key={s.id}
                        className="flex items-center gap-2 px-4 py-2 text-sm cursor-pointer hover:bg-surf2 border-b border-bdr/40 last:border-0">
                        <input
                          type="checkbox"
                          className="accent-navy"
                          checked={selectedIds.includes(s.id)}
                          onChange={() => toggle(s.id)}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Perfis de professor ──────────────────────────────────────────────────────

const PROFILE_OPTIONS = [
  { value: 'teacher',             label: 'Professor',    pill: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'coordinator',         label: 'Coord. Geral', pill: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'teacher-coordinator', label: 'Prof. Coord.', pill: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'admin',               label: 'Admin',        pill: 'bg-red-100 text-red-700 border-red-200' },
]
const PROFILE_OPTIONS_NO_ADMIN = PROFILE_OPTIONS.filter(o => o.value !== 'admin')

function ProfilePillDropdown({ value, onChange, options = PROFILE_OPTIONS, disabled, placeholder = 'Selecionar perfil ▾' }) {
  const [open, setOpen] = useState(false)
  const opt = options.find(o => o.value === value)

  if (disabled) return opt
    ? <span className={`badge border text-[10px] ${opt.pill}`}>{opt.label}</span>
    : <span className="badge border text-[10px] bg-gray-100 text-gray-400 border-gray-200">{placeholder}</span>

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className={opt
          ? `badge border text-[10px] cursor-pointer hover:opacity-80 ${opt.pill}`
          : 'badge border text-[10px] cursor-pointer bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
        }
      >{opt ? `${opt.label} ▾` : placeholder}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-bg border border-bdr rounded-lg shadow-lg py-1 min-w-[140px]">
            {options.map(o => (
              <button key={o.value}
                onClick={() => { setOpen(false); onChange(o.value) }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surf2 flex items-center gap-2 ${o.value === value ? 'font-bold' : ''}`}
              >
                <span className={`badge border text-[10px] ${o.pill}`}>{o.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab: Professores ──────────────────────────────────────────────────────────

function TabTeachers() {
  const store = useAppStore()
  const { role } = useAuthStore()
  const isAdminUser = role === 'admin'
  const navigate = useNavigate()
  const [modal,        setModal]        = useState(false)
  const [schedModal,      setSchedModal]      = useState(false)
  const [schedTeacher,    setSchedTeacher]    = useState(null)
  const [viewingSchedule, setViewingSchedule] = useState(null)
  const [editId,          setEditId]          = useState(null)
  const [editingTeacher,  setEditingTeacher]  = useState(null)
  const [form,         setForm]         = useState({ name: '', email: '', celular: '', apelido: '', subjectIds: [] })
  const [view,         setView]         = useState('cards') // 'cards' | 'table'
  const [subjectChangeCtx, setSubjectChangeCtx] = useState(null)
  const [pending,          setPending]          = useState([])
  const [pendLoaded,       setPendLoaded]       = useState(false)
  const [showPendingPanel,   setShowPendingPanel]   = useState(false)
  const [showNoSegmentPanel, setShowNoSegmentPanel] = useState(false)
  const [pendingProfiles,    setPendingProfiles]    = useState({}) // { [teacherId]: profile }

  // Carrega lista de admins e professores pendentes ao montar
  const [admins, setAdmins] = useState([])
  useEffect(() => {
    listAdmins().then(list => setAdmins(list.map(a => a.email.toLowerCase())))
    listPendingTeachers().then(list => { setPending(list); setPendLoaded(true) })
  }, [])

  const isTeacherAdmin = (t) => admins.includes((t.email ?? '').toLowerCase())

  const handleApprove = async (p) => {
    await approveTeacher(p.id, store, useAppStore.setState)
    setPending(prev => prev.filter(x => x.id !== p.id))
    toast(`${p.name} aprovado`, 'ok')
  }

  const handleReject = async (p) => {
    if (!confirm(`Recusar acesso de ${p.name}?`)) return
    await rejectTeacher(p.id, useAppStore.setState)
    setPending(prev => prev.filter(x => x.id !== p.id))
    toast(`${p.name} recusado`, 'warn')
  }

  const handleProfileChange = async (t, newProfile) => {
    const oldProfile = currentProfile(t)
    if (newProfile === oldProfile) return

    if (newProfile === 'admin') {
      if (!confirm(`Promover ${t.name} a Admin dará acesso total ao sistema. Confirmar?`)) return
    } else if (oldProfile === 'admin') {
      if (!confirm(`Remover privilégios de Admin de ${t.name}? Confirmar?`)) return
    }

    try {
      if (newProfile === 'admin') {
        await addAdmin(t.email, t.name)
        setAdmins(a => [...a, (t.email ?? '').toLowerCase()])
        // Se era coordinator/teacher-coordinator, limpar o profile no documento teachers/
        const currentProfInTeachers = t.profile ?? 'teacher'
        if (currentProfInTeachers !== 'teacher') {
          await store.updateTeacher(t.id, { profile: 'teacher' })
        }
      } else {
        if (oldProfile === 'admin') {
          await removeAdmin(t.email)
          setAdmins(a => a.filter(x => x !== (t.email ?? '').toLowerCase()))
        }
        await store.updateTeacher(t.id, { profile: newProfile })
      }
      const LABELS = { teacher: 'Professor', coordinator: 'Coord. Geral', 'teacher-coordinator': 'Prof. Coord.', admin: 'Admin' }
      toast(`${t.name} agora é ${LABELS[newProfile] ?? newProfile}`, 'ok')
    } catch (e) {
      console.error(e)
      toast('Erro ao atualizar perfil', 'err')
    }
  }

  const currentProfile = (t) => {
    if (isTeacherAdmin(t)) return 'admin'
    return t.profile ?? 'teacher'
  }

  const teacherSegmentNames = (t) =>
    store.segments
      .filter(seg => teacherBelongsToSegment(t, seg.id, store.subjects, store.areas))
      .map(seg => seg.name)
      .join(', ') || '—'

  const approvedRows = [...store.teachers].sort((a, b) => a.name.localeCompare(b.name))
  const pendingRows  = [...pending].sort((a, b) => a.name.localeCompare(b.name))
    .map(p => ({ ...p, _isPending: true }))
  const allRows = [...approvedRows, ...pendingRows]

  const openAdd  = () => { setForm({ name: '', email: '', celular: '', subjectIds: [] }); setEditId(null); setEditingTeacher(null); setModal(true) }
  const openEdit = (t) => { setForm({ name: t.name, email: t.email ?? '', celular: t.celular ?? '', apelido: t.apelido ?? '', subjectIds: t.subjectIds ?? [] }); setEditId(t.id); setEditingTeacher(t); setModal(true) }

  const save = () => {
    if (!form.name.trim()) return
    if (editId) {
      const original = store.teachers.find(t => t.id === editId)
      const { removedIds, addedIds, affectedSchedules } =
        calcSubjectChange(original, form.subjectIds ?? [], store.schedules)

      if (affectedSchedules.length > 0) {
        setModal(false)
        const isSwap = removedIds.length === 1 && addedIds.length === 1
        const subjectsById = Object.fromEntries(store.subjects.map(s => [s.id, s]))
        setSubjectChangeCtx({
          teacher: original,
          removedSubjects: removedIds.map(id => subjectsById[id] ?? { id, name: id }),
          addedSubjects:   addedIds.map(id => subjectsById[id] ?? { id, name: id }),
          affectedCount:   affectedSchedules.length,
          onMigrate: isSwap ? () => {
            store.migrateScheduleSubject(original.id, removedIds[0], addedIds[0])
            store.updateTeacher(editId, { ...form, apelido: form.apelido.trim() })
            toast('Professor atualizado e horários migrados', 'ok')
            setSubjectChangeCtx(null)
          } : null,
          onRemove: () => {
            removedIds.forEach(sid => store.removeSchedulesBySubject(original.id, sid))
            store.updateTeacher(editId, { ...form, apelido: form.apelido.trim() })
            toast('Professor atualizado e horários removidos', 'ok')
            setSubjectChangeCtx(null)
          },
          onCancel: () => setSubjectChangeCtx(null),
        })
        return
      }

      store.updateTeacher(editId, { ...form, apelido: form.apelido.trim() })
      toast('Professor atualizado', 'ok')
    } else {
      store.addTeacher(form.name.trim(), { ...form, apelido: form.apelido.trim() })
      toast('Professor adicionado', 'ok')
    }
    setModal(false)
  }

  const unassigned = store.teachers.filter(t =>
    teacherSegmentIds(t, store.subjects, store.areas).length === 0
  ).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        {isAdminUser && <button className="btn btn-dark" onClick={openAdd}>+ Novo Professor</button>}

        {isAdminUser && pendLoaded && pending.length > 0 && (
          <button
            className="btn btn-ghost btn-sm border border-amber-400 text-amber-700 hover:bg-amber-50"
            onClick={() => setShowPendingPanel(true)}
          >
            Aguardando Aprovação ({pending.length})
          </button>
        )}

        {unassigned.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowNoSegmentPanel(true)}
          >
            Sem Segmento ({unassigned.length})
          </button>
        )}

        <div className="flex rounded-lg border border-bdr overflow-hidden ml-auto">
          <button onClick={() => setView('cards')} className={view === 'cards' ? 'btn btn-dark btn-sm rounded-none' : 'btn btn-ghost btn-sm rounded-none'}>⊞ Cards</button>
          <button onClick={() => setView('table')} className={view === 'table' ? 'btn btn-dark btn-sm rounded-none' : 'btn btn-ghost btn-sm rounded-none'}>☰ Tabela</button>
        </div>
      </div>

      {/* Visualização em tabela */}
      {view === 'table' && (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surf2 border-b border-bdr">
                <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">Nome</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">E-mail</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">Telefone</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">Segmento</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">Matérias</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">Status</th>
                <th className="px-3 py-2.5 w-[50px]"></th>
              </tr>
            </thead>
            <tbody>
              {allRows.map(t => (
                <tr key={t.id} className={`border-b border-bdr/50 hover:bg-surf2/50 ${t._isPending ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-3 py-2.5 font-semibold text-sm">{t.name}</td>
                  <td className="px-3 py-2.5 text-xs text-t1">{t.email || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-t1">{t.celular || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-t1">
                    {t._isPending ? <span className="text-warn">—</span> : (teacherSegmentNames(t) || '—')}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-t1 max-w-[160px] truncate">
                    {t._isPending ? <span className="text-warn">—</span> : (teacherSubjectNames(t, store.subjects) || '—')}
                  </td>
                  <td className="px-3 py-2.5">
                    {t._isPending
                      ? <span className="badge bg-warn/10 text-warn border border-warn/30">Pendente</span>
                      : <ProfilePillDropdown value={currentProfile(t)} onChange={p => handleProfileChange(t, p)} disabled={!isAdminUser} />
                    }
                  </td>
                  <td className="px-3 py-2.5">
                    {t._isPending ? (
                      isAdminUser && <div className="flex gap-1">
                        <button className="btn btn-dark btn-xs" onClick={() => handleApprove(t)}>Aprovar</button>
                        <button className="btn btn-ghost btn-xs text-err" onClick={() => handleReject(t)}>✕</button>
                      </div>
                    ) : (
                      isAdminUser && <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>✏️</button>
                    )}
                  </td>
                </tr>
              ))}
              {allRows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-t3">Nenhum professor cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Visualização em cards */}
      {view === 'cards' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {store.segments.map(seg => {
            const list = store.teachers.filter(t =>
              teacherBelongsToSegment(t, seg.id, store.subjects, store.areas)
            ).sort((a, b) => a.name.localeCompare(b.name))

            return (
              <div key={seg.id} className="card">
                <div className="font-bold text-sm mb-3 pb-2 border-b border-bdr">
                  {seg.name} <span className="text-xs font-normal text-t3 ml-1">{list.length} prof.</span>
                </div>
                <div className="space-y-2">
                  {list.map(t => {
                    const cv = colorOfTeacher(t, store)
                    const ct = store.schedules.filter(s => s.teacherId === t.id).length
                    return (
                      <div key={t.id} className="flex items-start gap-2 p-2 rounded-xl border border-bdr hover:border-t3 transition-colors">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                          style={{ background: cv.tg, color: cv.tx }}>{t.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{t.name}</div>
                          <div className="text-xs text-t1 truncate">{teacherSubjectNames(t, store.subjects) || '—'}</div>
                          {t.email   && <div className="text-xs text-t1 truncate">✉ {t.email}</div>}
                          {t.apelido && <div className="text-xs text-t3 italic">"{t.apelido}"</div>}
                          {t.celular && <div className="text-xs text-t1 truncate">📱 {t.celular}</div>}
                          <div className="mt-1.5"><ProfilePillDropdown value={currentProfile(t)} onChange={p => handleProfileChange(t, p)} disabled={!isAdminUser} /></div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs text-t2">{ct} aulas</span>
                          <button className="btn btn-ghost btn-xs" title="Ver Grade" onClick={() => navigate(`/schedule?teacherId=${t.id}`)}>📅</button>
                          {isAdminUser && <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>✏️</button>}
                          {isAdminUser && <button className="btn btn-ghost btn-xs text-err" onClick={() => {
                            if (confirm(`Remover ${t.name}?`)) { store.removeTeacher(t.id); toast('Professor removido', 'ok') }
                          }}>✕</button>}
                        </div>
                      </div>
                    )
                  })}
                  {list.length === 0 && <p className="text-xs text-t3 py-2">Nenhum professor neste nível.</p>}
                </div>
              </div>
            )
          })}

        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar Professor' : 'Novo Professor'}>
        <div className="space-y-4">
          <div>
            <label className="lbl">Nome *</label>
            <input className="inp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="lbl">E-mail</label>
            <input className="inp" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="lbl">Celular</label>
            <input className="inp" type="tel" value={form.celular} onChange={e => setForm(f => ({ ...f, celular: e.target.value }))} />
          </div>
          <div>
            <label className="lbl">Apelido <span className="text-t3 font-normal">(opcional)</span></label>
            <input className="inp" value={form.apelido} maxLength={30} onChange={e => setForm(f => ({ ...f, apelido: e.target.value }))} />
          </div>
          <div>
            <label className="lbl">Matérias</label>
            {store.subjects.length === 0 ? (
              <p className="text-xs text-t3">Cadastre disciplinas primeiro.</p>
            ) : (
              <SubjectSelector
                store={store}
                selectedIds={form.subjectIds ?? []}
                onChange={(ids) => setForm(f => ({ ...f, subjectIds: ids }))}
              />
            )}
          </div>
          {editingTeacher && (
            <div className="border-t border-bdr pt-4">
              <SecaoHorarios
                teacher={editingTeacher}
                isEditable={true}
                onSaveAdmin={async (hs) => {
                  await store.updateTeacher(editId, { horariosSemana: hs })
                  toast(`Horários de ${editingTeacher.name} atualizados`, 'ok')
                }}
              />
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button className="btn btn-dark flex-1" onClick={save}>Salvar</button>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
          </div>
          {editId && (
            <button
              className="btn btn-ghost w-full mt-1"
              onClick={() => {
                const t = store.teachers.find(x => x.id === editId)
                setSchedTeacher(t)
                setSchedModal(true)
              }}
            >
              🗓 Ver/Editar Grade Horária
            </button>
          )}
        </div>
      </Modal>

      <ScheduleGridModal
        open={schedModal}
        onClose={() => setSchedModal(false)}
        teacher={schedTeacher}
        store={store}
      />
      <ScheduleGridModal
        open={!!viewingSchedule}
        onClose={() => setViewingSchedule(null)}
        teacher={viewingSchedule?.teacher}
        store={store}
        readOnly={viewingSchedule?.readOnly ?? false}
      />
      <SubjectChangeModal ctx={subjectChangeCtx} />

      {/* Painel: Aguardando Aprovação */}
      <Modal open={showPendingPanel} onClose={() => setShowPendingPanel(false)} title={`Aguardando Aprovação (${pending.length})`} size="lg">
        {pending.length === 0 ? (
          <div className="text-center py-8 text-t3">✅ Nenhum professor aguardando aprovação.</div>
        ) : (
          <div className="space-y-3">
            {pending.map(p => (
              <div key={p.id} className="flex flex-col gap-3 p-3 rounded-xl border border-bdr">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold shrink-0">
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    <div className="text-xs text-t2 truncate">{p.email}</div>
                    {p.celular && <div className="text-xs text-t1">📱 {p.celular}</div>}
                    {p.apelido && <div className="text-xs text-t3 italic">"{p.apelido}"</div>}
                    {(p.subjectIds ?? []).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {(p.subjectIds ?? []).map(sid => {
                          const subj = store.subjects.find(s => s.id === sid)
                          if (!subj) return null
                          const area = store.areas.find(a => a.id === subj.areaId)
                          const segNames = (area?.segmentIds ?? [])
                            .map(sgId => store.segments.find(sg => sg.id === sgId)?.name)
                            .filter(Boolean)
                            .join(', ')
                          return (
                            <span key={sid} className="text-[11px] px-1.5 py-0.5 rounded-full bg-surf2 border border-bdr text-t2 whitespace-nowrap">
                              {subj.name}{segNames ? <span className="text-t3"> · {segNames}</span> : null}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-bdr">
                  <ProfilePillDropdown
                    value={pendingProfiles[p.id]}
                    options={PROFILE_OPTIONS_NO_ADMIN}
                    onChange={profile => setPendingProfiles(prev => ({ ...prev, [p.id]: profile }))}
                    placeholder="Selecionar perfil ▾"
                  />
                  <div className="flex gap-2">
                    <button
                      className="btn btn-dark btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={!pendingProfiles[p.id]}
                      onClick={async () => {
                        const profile = pendingProfiles[p.id]
                        try {
                          await approveTeacher(p.id, store, useAppStore.setState, profile)
                          setPending(prev => prev.filter(x => x.id !== p.id))
                          setPendingProfiles(prev => { const n = { ...prev }; delete n[p.id]; return n })
                          const label = PROFILE_OPTIONS_NO_ADMIN.find(o => o.value === profile)?.label ?? profile
                          toast(`${p.name} aprovado como ${label}`, 'ok')
                        } catch (e) {
                          console.error(e)
                          toast('Erro ao aprovar professor', 'err')
                        }
                      }}
                    >Aprovar</button>
                    <button
                      className="btn btn-ghost btn-sm text-err"
                      onClick={() => handleReject(p)}
                    >Rejeitar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Painel: Sem Segmento */}
      <Modal open={showNoSegmentPanel} onClose={() => setShowNoSegmentPanel(false)} title={`Sem Segmento (${unassigned.length})`} size="lg">
        {unassigned.length === 0 ? (
          <div className="text-center py-8 text-t3">Todos os professores têm segmento definido.</div>
        ) : (
          <div className="space-y-2">
            {unassigned.map(t => {
              const cv = colorOfTeacher(t, store)
              return (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border border-bdr">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ background: cv.tg, color: cv.tx }}>{t.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{t.name}</div>
                    {t.email && <div className="text-xs text-t2 truncate">{t.email}</div>}
                  </div>
                  <ProfilePillDropdown
                    value={currentProfile(t)}
                    onChange={p => handleProfileChange(t, p)}
                    disabled={!isAdminUser}
                  />
                  <button className="btn btn-ghost btn-xs" onClick={() => { openEdit(t); setShowNoSegmentPanel(false) }}>✏️</button>
                  <button className="btn btn-ghost btn-xs text-err" onClick={() => {
                    if (confirm(`Remover ${t.name}?`)) { store.removeTeacher(t.id); toast('Professor removido', 'ok') }
                  }}>✕</button>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

    </div>
  )
}

// ─── CamposGradeEspecial — seção de grade especial dentro de CardPeriodo ────────

function CamposGradeEspecial({ gradeEspecial, onChange }) {
  const itens = gradeEspecial.itens ?? []

  const handleCampoGlobal = (campo, valor) => {
    onChange({ ...gradeEspecial, [campo]: valor })
  }

  const handleAdicionarIntervalo = () => {
    const novoItem = { id: uid(), apos: 0, duracao: 15 }
    onChange({ ...gradeEspecial, itens: [...itens, novoItem] })
  }

  const handleRemoverItem = (id) => {
    onChange({ ...gradeEspecial, itens: itens.filter(i => i.id !== id) })
  }

  const handleEditarItem = (id, campo, valor) => {
    onChange({
      ...gradeEspecial,
      itens: itens.map(i => i.id === id ? { ...i, [campo]: valor } : i),
    })
  }

  return (
    <div className="space-y-3">
      <label className="lbl !mb-0">Grade Especial</label>

      {/* Campos globais */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="lbl">Início especial</label>
          <input
            className="inp"
            type="time"
            value={gradeEspecial.inicioEspecial ?? ''}
            onChange={e => handleCampoGlobal('inicioEspecial', e.target.value)}
          />
        </div>
        <div>
          <label className="lbl">Duração aula (min)</label>
          <input
            className="inp"
            type="number"
            min="1"
            value={gradeEspecial.duracaoAula ?? 40}
            onChange={e => handleCampoGlobal('duracaoAula', Number(e.target.value) || 40)}
          />
        </div>
        <div>
          <label className="lbl">Qtd. aulas</label>
          <input
            className="inp"
            type="number"
            min="1"
            value={gradeEspecial.qtd ?? 1}
            onChange={e => handleCampoGlobal('qtd', Number(e.target.value) || 1)}
          />
        </div>
      </div>

      {/* Lista de intervalos */}
      {itens.length === 0 && (
        <p className="text-t3 text-sm py-1">Nenhum intervalo na grade especial.</p>
      )}
      <div className="space-y-2">
        {itens.map(item => (
          <div key={item.id} className="flex items-center gap-2 bg-surf2 rounded-xl px-3 py-2 flex-wrap">
            <span className="text-xs text-t2 shrink-0">Após o Tempo nº</span>
            <input
              className="inp !w-16 py-1 text-xs text-center"
              type="number"
              min="0"
              value={item.apos ?? 0}
              onChange={e => handleEditarItem(item.id, 'apos', Number(e.target.value))}
            />
            <span className="text-xs text-t2 shrink-0">Duração (min)</span>
            <input
              className="inp !w-20 py-1 text-xs text-center"
              type="number"
              min="1"
              value={item.duracao}
              onChange={e => handleEditarItem(item.id, 'duracao', Number(e.target.value))}
            />
            <button
              className="ml-auto btn btn-danger btn-xs"
              title="Remover intervalo"
              onClick={() => handleRemoverItem(item.id)}
            >Remover</button>
          </div>
        ))}
      </div>

      {/* Botão de adição */}
      <div className="flex gap-2 flex-wrap">
        <button className="btn btn-ghost btn-xs" onClick={handleAdicionarIntervalo}>+ Adicionar intervalo</button>
      </div>
    </div>
  )
}

// ─── buildPreviewItems — combina períodos regulares + especiais para o preview ─

function buildPreviewItems(cfg) {
  const itensRegulares = gerarPeriodos(cfg).map(p => ({
    isEspecial: false,
    isIntervalo: p.isIntervalo,
    inicio: p.inicio,
    fim: p.fim,
    label: p.label,
  }))

  // Fonte primária: gradeEspecial via gerarPeriodosEspeciais
  const periodosEspeciais = gerarPeriodosEspeciais(cfg)
  if (periodosEspeciais.length > 0) {
    const itensEspeciais = periodosEspeciais.map(p => ({
      isEspecial: true,
      isIntervalo: p.isIntervalo,
      inicio: p.inicio,
      fim: p.fim,
      label: p.label,
    }))
    return [...itensRegulares, ...itensEspeciais].sort((a, b) => toMin(a.inicio) - toMin(b.inicio))
  }

  // Fallback legacy: horariosEspeciais / intervalosEspeciais
  const horariosEspeciais = cfg.horariosEspeciais ?? []
  const intervalosEspeciais = cfg.intervalosEspeciais ?? []

  if (horariosEspeciais.length === 0) return itensRegulares

  // Ordena por inicio (comparação lexicográfica de HH:mm é suficiente para toMin)
  const ordenados = [...horariosEspeciais].sort((a, b) => toMin(a.inicio) - toMin(b.inicio))

  const itensEspeciais = []
  for (const h of ordenados) {
    const fim = fromMin(toMin(h.inicio) + (h.duracao || 0))
    const N = horariosEspeciais.findIndex(orig => orig.id === h.id) + 1
    itensEspeciais.push({ isEspecial: true, isIntervalo: false, label: `Horário especial ${N}`, inicio: h.inicio, fim })

    intervalosEspeciais
      .filter(iv => iv.aposEspecial === h.id)
      .forEach(iv => {
        const ivFim = fromMin(toMin(fim) + (iv.duracao || 0))
        itensEspeciais.push({ isEspecial: true, isIntervalo: true, label: 'Intervalo especial', inicio: fim, fim: ivFim })
      })
  }

  return [...itensRegulares, ...itensEspeciais].sort((a, b) => toMin(a.inicio) - toMin(b.inicio))
}

// ─── PreviewVertical — lista vertical unificada de períodos regulares e especiais

function PreviewVertical({ items }) {
  if (!items || items.length === 0) return null

  return (
    <div className="bg-surf2 rounded-xl p-3">
      <div className="text-[11px] font-bold text-t2 uppercase tracking-wide mb-2">Preview</div>
      <div className="flex flex-col gap-0.5">
        {items.map((b, i) => {
          const dur = Math.max(0, toMin(b.fim) - toMin(b.inicio))
          const isAulaEspecial = b.isEspecial && !b.isIntervalo
          const isIntervaloEspecial = b.isEspecial && b.isIntervalo
          const rowCls = [
            'flex items-center gap-2 px-2 py-1 rounded text-[11px]',
            isAulaEspecial
              ? 'border-l-2 border-accent text-accent'
              : isIntervaloEspecial
                ? 'border-l-2 border-dashed border-accent text-t2'
                : b.isIntervalo
                  ? 'text-t3'
                  : 'text-t2',
          ].join(' ')
          const icone = b.isIntervalo ? '⏸' : '▶'
          return (
            <div key={i} className={rowCls}>
              <span className="shrink-0 opacity-70">{icone}</span>
              <span className="font-medium">{b.label}</span>
              <span className="ml-auto shrink-0 font-mono opacity-80">{b.inicio}–{b.fim}</span>
              {b.isIntervalo && (
                <span className="shrink-0 text-[10px] opacity-60">({dur} min)</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── SaldoTempo — indicador visual de saldo de tempo do turno ─────────────────

function SaldoTempo({ tempoTotal, tempoLetivo, tempoResidual, tempoEspecial = 0 }) {
  const fmtMin = (m) => {
    const total = Math.abs(m)
    const h = Math.floor(total / 60)
    const min = total % 60
    return `${h}h ${min}min`
  }

  const corResidual = tempoResidual >= 0 ? 'text-ok' : 'text-err'

  return (
    <div className="flex flex-wrap gap-2">
      <span className="badge bg-surf2 text-t2 text-xs">
        Total: <span className="font-mono ml-1">{fmtMin(tempoTotal)}</span>
      </span>
      <span className="badge bg-surf2 text-t2 text-xs">
        Letivo: <span className="font-mono ml-1">{fmtMin(tempoLetivo)}</span>
      </span>
      {tempoEspecial > 0 && (
        <span className="badge bg-surf2 text-t2 text-xs">
          Especial: <span className="font-mono ml-1">{fmtMin(tempoEspecial)}</span>
        </span>
      )}
      <span className={`badge bg-surf2 text-xs ${corResidual}`}>
        Residual: <span className="font-mono ml-1">{tempoResidual < 0 ? '-' : ''}{fmtMin(tempoResidual)}</span>
      </span>
    </div>
  )
}

// ─── AlertaImpeditivoModal ────────────────────────────────────────────────────

function AlertaImpeditivoModal({ open, excedente, duracaoSugerida, onAplicar, onFechar }) {
  return (
    <Modal open={open} onClose={onFechar} title="Grade especial excede o tempo disponível" size="sm">
      <div className="space-y-3">
        <p className="text-sm text-t1">
          Excedente: <span className="font-mono font-semibold">{excedente} minuto{excedente !== 1 ? 's' : ''}</span>.
        </p>
        {duracaoSugerida !== null ? (
          <>
            <p className="text-sm text-t2">
              Duração sugerida por aula: <span className="font-mono font-semibold">{duracaoSugerida} min</span>.
            </p>
            <button className="btn btn-dark btn-sm w-full" onClick={onAplicar}>
              Aplicar sugestão
            </button>
          </>
        ) : (
          <p className="text-sm text-warn font-medium">
            Ajuste manual necessário — não há duração viável para as aulas.
          </p>
        )}
        <div className="flex justify-end pt-1">
          <button className="btn btn-ghost btn-sm" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── CardPeriodo — card por segmento dentro de TabPeriods ────────────────────

function CardPeriodo({ seg, store }) {
  const turno   = seg.turno ?? 'manha'
  const cfg     = getCfg(seg.id, turno, store.periodConfigs)

  const [localInicio, setLocalInicio] = useState(cfg.inicioPeriodo ?? '')
  const [localFim, setLocalFim]       = useState(cfg.fimPeriodo ?? '')
  const [localGradeEspecial, setLocalGradeEspecial] = useState(
    cfg.gradeEspecial ?? { inicioEspecial: '', duracaoAula: 40, qtd: 1, itens: [] }
  )
  const [alertaAberto, setAlertaAberto] = useState(false)
  const [alertaDados, setAlertaDados]   = useState({ excedente: 0, duracaoSugerida: null })

  const cfgLocal = { ...cfg, inicioPeriodo: localInicio, fimPeriodo: localFim, gradeEspecial: localGradeEspecial }
  const saldo    = calcSaldo(cfgLocal)
  const preview  = buildPreviewItems(cfgLocal)

  const update = (field, val) =>
    store.savePeriodCfg(seg.id, turno, { ...cfg, [field]: val })

  const saveLimiteTurno = () =>
    store.savePeriodCfg(seg.id, turno, { ...cfg, inicioPeriodo: localInicio, fimPeriodo: localFim })

  const saveGradeEspecial = () => {
    const v = validarEncaixe(cfgLocal, saldo)
    if (!v.valido) {
      setAlertaDados({ excedente: v.excedente, duracaoSugerida: v.duracaoSugerida })
      setAlertaAberto(true)
      return
    }
    const cfgParaSalvar = {
      ...cfgLocal,
      gradeEspecial: {
        ...localGradeEspecial,
        itens: (localGradeEspecial.itens ?? []).filter(i => i.tipo !== 'aula'),
      },
    }
    store.savePeriodCfg(seg.id, turno, cfgParaSalvar)
    toast('Configuração salva', 'ok')
  }

  const addIntervalo = () => {
    const novos = [...(cfg.intervalos ?? []), { apos: 1, duracao: 20 }]
    store.savePeriodCfg(seg.id, turno, { ...cfg, intervalos: novos })
  }

  const removeIntervalo = (idx) => {
    const novos = (cfg.intervalos ?? []).filter((_, i) => i !== idx)
    store.savePeriodCfg(seg.id, turno, { ...cfg, intervalos: novos })
  }

  const updateIntervalo = (idx, field, val) => {
    const novos = (cfg.intervalos ?? []).map((iv, i) =>
      i === idx ? { ...iv, [field]: val } : iv
    )
    store.savePeriodCfg(seg.id, turno, { ...cfg, intervalos: novos })
  }

  return (
    <div className="card space-y-4">
      {/* Cabeçalho com turno editável — item 1 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-bold text-base">{seg.name}</div>
        <TurnoSelector seg={seg} store={store} />
      </div>

      {/* Campos de limite de turno */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Início do turno</label>
            <input
              className="inp"
              type="time"
              value={localInicio}
              onChange={e => setLocalInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="lbl">Fim do turno</label>
            <input
              className="inp"
              type="time"
              value={localFim}
              onChange={e => setLocalFim(e.target.value)}
            />
          </div>
        </div>
        {localInicio !== '' && cfg.inicio && toMin(cfg.inicio) < toMin(localInicio) && (
          <p className="text-xs text-warn">Início da 1ª aula é anterior ao início do turno</p>
        )}
        <div className="flex justify-end">
          <button className="btn btn-dark btn-sm" onClick={saveLimiteTurno}>Salvar</button>
        </div>
      </div>

      {/* Configurações básicas */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="lbl">Início</label>
          <input className="inp" type="time" value={cfg.inicio}
            onChange={e => update('inicio', e.target.value)} />
        </div>
        <div>
          <label className="lbl">Duração (min)</label>
          <input className="inp" type="number" min="30" max="120" value={cfg.duracao}
            onChange={e => update('duracao', Number(e.target.value))} />
        </div>
        <div>
          <label className="lbl">Qtd. aulas</label>
          <input className="inp" type="number" min="1" max="12" value={cfg.qtd}
            onChange={e => update('qtd', Number(e.target.value))} />
        </div>
      </div>

      {/* Intervalos editáveis — item 3 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="lbl !mb-0">Intervalos</label>
          <button className="btn btn-ghost btn-xs" onClick={addIntervalo}>+ Adicionar intervalo</button>
        </div>
        {(cfg.intervalos ?? []).length === 0 && (
          <p className="text-xs text-t3 py-1">Nenhum intervalo configurado.</p>
        )}
        <div className="space-y-2">
          {(cfg.intervalos ?? []).map((iv, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-surf2 rounded-xl px-3 py-2 flex-wrap">
              <span className="text-xs text-t2 shrink-0">Após a aula nº</span>
              <input
                className="inp !w-16 py-1 text-xs text-center"
                type="number"
                min="1"
                max={cfg.qtd}
                value={iv.apos}
                onChange={e => updateIntervalo(idx, 'apos', Number(e.target.value))}
              />
              <span className="text-xs text-t2 shrink-0">Duração:</span>
              <input
                className="inp !w-20 py-1 text-xs text-center"
                type="number"
                min="5"
                max="120"
                value={iv.duracao}
                onChange={e => updateIntervalo(idx, 'duracao', Number(e.target.value))}
              />
              <span className="text-xs text-t2 shrink-0">min</span>
              <button
                className="ml-auto text-t3 hover:text-err text-sm transition-colors"
                onClick={() => removeIntervalo(idx)}
                title="Remover intervalo"
              >✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Saldo de tempo */}
      <SaldoTempo
        tempoTotal={saldo.tempoTotal}
        tempoLetivo={saldo.tempoLetivo}
        tempoResidual={saldo.tempoResidual}
        tempoEspecial={saldo.tempoEspecial}
      />

      {/* Grade Especial */}
      <CamposGradeEspecial gradeEspecial={localGradeEspecial} onChange={setLocalGradeEspecial} />
      <div className="flex justify-end">
        <button className="btn btn-dark btn-sm" onClick={saveGradeEspecial}>Salvar grade especial</button>
      </div>

      {/* Preview */}
      <PreviewVertical items={preview} />

      <AlertaImpeditivoModal
        open={alertaAberto}
        excedente={alertaDados.excedente}
        duracaoSugerida={alertaDados.duracaoSugerida}
        onFechar={() => setAlertaAberto(false)}
        onAplicar={() => {
          setLocalGradeEspecial({ ...localGradeEspecial, duracaoAula: alertaDados.duracaoSugerida })
          setAlertaAberto(false)
        }}
      />
    </div>
  )
}

// ─── Tab: Períodos — item 1 (turno) e item 3 (intervalos editáveis) ──────────

function TabPeriods() {
  const store = useAppStore()

  return (
    <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
      {store.segments.map(seg => (
        <CardPeriodo key={seg.id} seg={seg} store={store} />
      ))}
    </div>
  )
}

// ─── Tab: Horários — item 1 (turno editável) e item 2 (matérias do segmento) ─

function TabSchedules() {
  const store = useAppStore()
  const [selTeacher, setSelTeacher] = useState(null)
  const teacher = selTeacher ? store.teachers.find(t => t.id === selTeacher) : null

  // Professores sem segmento definido
  const unassigned = store.teachers.filter(t =>
    teacherSegmentIds(t, store.subjects, store.areas).length === 0
  ).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {store.segments.map(seg => {
          // Usa o mesmo helper que TabTeachers — critério idêntico
          const list = store.teachers.filter(t =>
            teacherBelongsToSegment(t, seg.id, store.subjects, store.areas)
          ).sort((a, b) => a.name.localeCompare(b.name))

          return (
            <div key={seg.id} className="card">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="font-bold text-sm">{seg.name}</div>
                <TurnoSelector seg={seg} store={store} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {list.length === 0 && (
                  <p className="text-xs text-t3 py-2">Nenhum professor com matéria neste nível.</p>
                )}
                {list.map(t => {
                  const cv     = colorOfTeacher(t, store)
                  const prefix = seg.id + '|'
                  const nAulas = store.schedules.filter(s => s.teacherId === t.id && s.timeSlot?.startsWith(prefix)).length
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelTeacher(t.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all
                        ${selTeacher === t.id ? 'border-navy bg-surf' : 'border-bdr hover:border-t3'}`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cv.dt }} />
                      {t.name}
                      <span className="font-mono text-t3">{nAulas}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Professores sem segmento — visíveis para auditoria do ADM */}
        {unassigned.length > 0 && (
          <div className="card border-dashed border-amber-300 bg-amber-50/30 lg:col-span-2">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="font-bold text-sm text-amber-700">
                ⚠ Sem segmento definido
                <span className="text-xs font-normal text-t3 ml-2">{unassigned.length} professor{unassigned.length !== 1 ? 'es' : ''} — clique para ver a grade</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {unassigned.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelTeacher(t.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all
                    bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-400
                    ${selTeacher === t.id ? 'border-amber-500 bg-amber-100' : ''}`}
                >
                  ⚠ {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {teacher && <ScheduleGrid teacher={teacher} store={store} />}
    </div>
  )
}

// ─── Tab: Minhas Aulas (coordenador) ─────────────────────────────────────────

function TabMySchedules() {
  const store = useAppStore()
  const { teacher: myTeacher } = useAuthStore()
  if (!myTeacher) return <p className="text-sm text-t3">Perfil de professor não encontrado.</p>
  return (
    <div>
      <p className="text-sm text-t2 mb-4">
        Clique em <strong>＋</strong> para solicitar inclusão de aula. Clique em <strong>✕</strong> para solicitar remoção.
        As solicitações são enviadas para aprovação do administrador.
      </p>
      <ScheduleGrid teacher={myTeacher} store={store} />
    </div>
  )
}

// ─── ScheduleGridModal — abre grade em modal (reutilizável) ──────────────────

export function ScheduleGridModal({ open, onClose, teacher, store, readOnly = false }) {
  if (!teacher) return null
  return (
    <Modal open={open} onClose={onClose} title={`Grade de Horários — ${teacher.name}`} size="xl">
      <ScheduleGrid teacher={teacher} store={store} readOnly={readOnly} />
    </Modal>
  )
}

function CelulaFora({ day }) {
  return (
    <td
      key={day}
      className="border border-bdr"
      style={{
        backgroundColor: '#F4F2EE',
        background: 'linear-gradient(to bottom right, transparent calc(50% - 0.5px), #D1CEC8 50%, transparent calc(50% + 0.5px))',
      }}
    />
  )
}

export function ScheduleGrid({ teacher, store, readOnly = false, substitutionMap, segmentFilter = null, horariosSemana = null }) {
  const { addSchedule, removeSchedule } = useAppStore()
  const [modal, setModal] = useState(null)

  const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']

  // Segmentos do professor derivados das matérias — mesma lógica de TabTeachers e TabSchedules
  const teacherSegIds = teacherSegmentIds(teacher, store.subjects, store.areas)
  const relevantSegments = segmentFilter
    ? store.segments.filter(s => s.id === segmentFilter.segmentId)
    : store.segments.filter(s => teacherSegIds.includes(s.id))

  return (
    <div>
      {relevantSegments.length === 0 && (
        <p className="text-sm text-t3 py-4">Este professor não tem matérias associadas a nenhum segmento.</p>
      )}

      {relevantSegments.map(seg => {
        const turno = segmentFilter?.turno ?? seg.turno ?? 'manha'
        const cfg = getCfg(seg.id, turno, store.periodConfigs)
        const periodos = mergeAndSortPeriodos(cfg)
        if (!periodos.some(p => !p.isIntervalo)) return null

        // Build _espIdx for especial aulas (1-based counter among non-interval especial items)
        let espCount = 0
        const periodosComIdx = periodos.map(p => {
          if (p._tipo === 'especial') { espCount += 1; return { ...p, _espIdx: espCount } }
          return p
        })

        return (
          <div key={seg.id} className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-xs font-bold text-t2 uppercase tracking-wide">{seg.name}</div>
              <div className="text-xs text-t3 px-2 py-0.5 rounded-full bg-surf2 border border-bdr">
                {turno === 'tarde' ? '🌇 Tarde' : '🌅 Manhã'}
              </div>
            </div>
            <div className="card p-0 overflow-hidden overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-surf2 border-b border-bdr">
                    <th className="px-3 py-2 text-left font-bold text-t2 w-[90px]">Aula</th>
                    {DAYS.map(d => (
                      <th key={d} className="px-2 py-2 text-center font-bold text-t2 min-w-[100px]">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodosComIdx.map((p, i) => {
                    if (p.isIntervalo) {
                      return (
                        <tr key={`intervalo-${i}`} className="bg-surf2 border-b border-bdr/50">
                          <td className="px-3 py-1">
                            <div className="font-mono text-[10px] text-t3">{p.inicio}–{p.fim}</div>
                            <div className="text-xs font-semibold text-t2">{p.label}</div>
                          </td>
                          {DAYS.map(day => (
                            <td key={day} className="bg-surf2" />
                          ))}
                        </tr>
                      )
                    }

                    if (p._tipo === 'regular') {
                      return (
                        <tr key={p.aulaIdx} className="border-b border-bdr/50">
                          <td className="px-3 py-1.5">
                            <div className="font-bold font-mono">{p.label}</div>
                            <div className="font-mono text-t3 text-[10px]">{p.inicio}–{p.fim}</div>
                          </td>
                          {DAYS.map(day => {
                            if (horariosSemana !== null) {
                              const horarioDia = horariosSemana[day]
                              if (!horarioDia) return <CelulaFora key={day} />
                              if (horarioDia.entrada && horarioDia.saida) {
                                if (!p.inicio || !p.fim) { /* período malformado — cai no normal */ }
                                else if (toMin(p.inicio) < toMin(horarioDia.entrada) || toMin(p.fim) > toMin(horarioDia.saida)) {
                                  return <CelulaFora key={day} />
                                }
                              }
                            }
                            const slot = `${seg.id}|${turno}|${p.aulaIdx}`
                            const mine = store.schedules.filter(s =>
                              s.teacherId === teacher.id && s.timeSlot === slot && s.day === day
                            )
                            // Conflito de professor: já tem aula neste slot/dia
                            const teacherConflict = mine.length > 0
                            // Turmas ocupadas por outros professores neste slot/dia
                            const occupiedSchedules = store.schedules
                              .filter(s => s.timeSlot === slot && s.day === day && s.teacherId !== teacher.id)
                            const hardBlockedTurmas = occupiedSchedules
                              .filter(s => !isSharedSchedule(s, store) && !isSharedSeries(s.turma, store.sharedSeries))
                              .map(s => s.turma)
                            const allTurmas = seg.grades.flatMap(g =>
                              g.classes.map(c => `${g.name} ${c.letter}`)
                            )
                            // freeTurmas: turmas sem ocupante de área não-compartilhada (inclui turmas de área compartilhada)
                            const freeTurmas = allTurmas.filter(t => !hardBlockedTurmas.includes(t))

                            return (
                              <td key={day} className={`px-1.5 py-1.5 align-top ${teacherConflict ? 'bg-amber-50/40' : ''}`}>
                                <div className="space-y-1">
                                  {mine.map(s => {
                                    const subj = store.subjects.find(x => x.id === s.subjectId)
                                    return (
                                      <div key={s.id} className="relative bg-surf2 border border-bdr rounded-lg p-1.5 text-[11px] group">
                                        <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide truncate">{s.turma}</div>
                                        <div className="text-[#4a4740] text-[10px] truncate">{subj?.name ?? '—'}</div>
                                        {!readOnly && (
                                          <button
                                            className="absolute top-0.5 right-0.5 text-t3 hover:text-err hidden group-hover:block"
                                            onClick={() => removeSchedule(s.id)}
                                          >✕</button>
                                        )}
                                      </div>
                                    )
                                  })}

                                  {substitutionMap?.[slot] && (
                                    <div className="text-[10px] font-bold text-ok truncate">
                                      ✓ {substitutionMap[slot]}
                                    </div>
                                  )}

                                  {/* Indicadores de bloqueio — sem dados de terceiros */}
                                  {!readOnly && (teacherConflict ? (
                                    <div className="w-full text-center text-[10px] text-amber-600 py-1 rounded-lg bg-amber-50 border border-amber-200"
                                      title="Professor já tem aula neste horário">
                                      🔒
                                    </div>
                                  ) : freeTurmas.length === 0 ? (
                                    <div className="w-full text-center text-[10px] text-t3 py-1 rounded-lg bg-surf2 border border-dashed border-bdr"
                                      title="Todas as turmas já têm professor neste horário">
                                      —
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setModal({ segId: seg.id, turno, aulaIdx: p.aulaIdx, day })}
                                      className="w-full text-center text-[10px] text-t3 hover:text-navy py-1 rounded-lg hover:bg-surf2 transition-colors border border-dashed border-bdr hover:border-bdr"
                                    >＋</button>
                                  ))}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    }

                    // _tipo === 'especial'
                    const aulaCount = p._espIdx
                    return (
                      <tr key={`esp-${aulaCount}`} className="border-b border-bdr/50 bg-surf2">
                        <td className="px-3 py-1.5 border-l-2 border-accent">
                          <div className="font-bold font-mono">{p.label}</div>
                          <div className="font-mono text-t3 text-[10px]">{p.inicio}–{p.fim}</div>
                        </td>
                        {DAYS.map(day => {
                          if (horariosSemana !== null) {
                            const horarioDia = horariosSemana[day]
                            if (!horarioDia) return <CelulaFora key={day} />
                            if (horarioDia.entrada && horarioDia.saida) {
                              if (!p.inicio || !p.fim) { /* período malformado — cai no normal */ }
                              else if (toMin(p.inicio) < toMin(horarioDia.entrada) || toMin(p.fim) > toMin(horarioDia.saida)) {
                                return <CelulaFora key={day} />
                              }
                            }
                          }
                          const slot = makeEspecialSlot(seg.id, turno, aulaCount)
                          const mine = store.schedules.filter(s =>
                            s.teacherId === teacher.id && s.timeSlot === slot && s.day === day
                          )
                          const teacherConflict = mine.length > 0
                          const occupiedSchedules = store.schedules
                            .filter(s => s.timeSlot === slot && s.day === day && s.teacherId !== teacher.id)
                          const hardBlockedTurmas = occupiedSchedules
                            .filter(s => !isSharedSchedule(s, store) && !isSharedSeries(s.turma, store.sharedSeries))
                            .map(s => s.turma)
                          const allTurmas = seg.grades.flatMap(g =>
                            g.classes.map(c => `${g.name} ${c.letter}`)
                          )
                          const freeTurmas = allTurmas.filter(t => !hardBlockedTurmas.includes(t))

                          return (
                            <td key={day} className={`px-1.5 py-1.5 align-top bg-surf2 ${teacherConflict ? 'bg-amber-50/40' : ''}`}>
                              <div className="space-y-1">
                                {mine.map(s => {
                                  const subj = store.subjects.find(x => x.id === s.subjectId)
                                  return (
                                    <div key={s.id} className="relative bg-white border border-bdr rounded-lg p-1.5 text-[11px] group">
                                      <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide truncate">{s.turma}</div>
                                      <div className="text-[#4a4740] text-[10px] truncate">{subj?.name ?? '—'}</div>
                                      {!readOnly && (
                                        <button
                                          className="absolute top-0.5 right-0.5 text-t3 hover:text-err hidden group-hover:block"
                                          onClick={() => removeSchedule(s.id)}
                                        >✕</button>
                                      )}
                                    </div>
                                  )
                                })}

                                {substitutionMap?.[slot] && (
                                  <div className="text-[10px] font-bold text-ok truncate">
                                    ✓ {substitutionMap[slot]}
                                  </div>
                                )}

                                {!readOnly && (teacherConflict ? (
                                  <div className="w-full text-center text-[10px] text-amber-600 py-1 rounded-lg bg-amber-50 border border-amber-200"
                                    title="Professor já tem aula neste horário">
                                    🔒
                                  </div>
                                ) : freeTurmas.length === 0 ? (
                                  <div className="w-full text-center text-[10px] text-t3 py-1 rounded-lg border border-dashed border-bdr"
                                    title="Todas as turmas já têm professor neste horário">
                                    —
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setModal({ segId: seg.id, turno, aulaIdx: `e${aulaCount}`, day })}
                                    className="w-full text-center text-[10px] text-t3 hover:text-navy py-1 rounded-lg hover:bg-white transition-colors border border-dashed border-bdr hover:border-bdr"
                                  >＋</button>
                                ))}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {modal && (
        <AddScheduleModal
          open={!!modal}
          onClose={() => setModal(null)}
          teacher={teacher}
          segId={modal.segId}
          turno={modal.turno}
          aulaIdx={modal.aulaIdx}
          day={modal.day}
          store={store}
          onSave={(sched) => { addSchedule(sched); setModal(null); toast('Aula adicionada', 'ok') }}
        />
      )}
    </div>
  )
}

export function AddScheduleModal({ open, onClose, teacher, segId, turno, aulaIdx, day, store, onSave }) {
  const seg = store.segments.find(s => s.id === segId)
  const slot = `${segId}|${turno}|${aulaIdx}`

  // Apenas matérias do professor que pertencem a este segmento
  const mySubjs = (teacher.subjectIds ?? [])
    .map(sid => store.subjects.find(s => s.id === sid))
    .filter(Boolean)
    .filter(s => {
      const area = store.areas.find(a => a.id === s.areaId)
      return (area?.segmentIds ?? []).includes(segId)
    })

  const [subjId, setSubjId] = useState(mySubjs[0]?.id ?? '')
  const [grade,  setGrade]  = useState('')
  const [turma,  setTurma]  = useState('')

  const grades = seg?.grades ?? []
  const allTurmasForGrade = grade
    ? (grades.find(g => g.name === grade)?.classes ?? []).map(c => `${grade} ${c.letter}`)
    : []
  const selectedSharedSeries = store.sharedSeries.find(ss => ss.name === turma) ?? null

  // Turmas bloqueadas: têm ao menos 1 ocupante de área não-compartilhada
  const hardBlockedTurmas = new Set(
    store.schedules
      .filter(s => s.timeSlot === slot && s.day === day && s.teacherId !== teacher.id)
      .filter(s => !isSharedSchedule(s, store) && !isSharedSeries(s.turma, store.sharedSeries))
      .map(s => s.turma)
  )
  // Mapa turma → primeiro nome do professor que a ocupa (para exibição)
  const occupiedByTeacher = {}
  store.schedules
    .filter(s => s.timeSlot === slot && s.day === day && s.teacherId !== teacher.id)
    .forEach(s => {
      const prof = store.teachers.find(t => t.id === s.teacherId)
      occupiedByTeacher[s.turma] = prof?.name.split(' ')[0] ?? '?'
    })

  const save = () => {
    if (!turma) return
    const isShared = isSharedSeries(turma, store.sharedSeries)
    if (store.schedules.find(s => s.teacherId === teacher.id && s.day === day && s.timeSlot === slot))
      { alert('Conflito: professor já tem aula neste horário.'); return }
    if (!isShared && hardBlockedTurmas.has(turma))
      { alert('Conflito: esta turma já tem professor neste horário.'); return }
    if (!isShared) {
      const turmaHasSharedOccupant = store.schedules.some(
        s => s.timeSlot === slot && s.day === day && s.turma === turma
          && s.teacherId !== teacher.id && isSharedSchedule(s, store)
      )
      if (turmaHasSharedOccupant) {
        const newSubj = store.subjects.find(s => s.id === subjId)
        const newArea = store.areas.find(a => a.id === newSubj?.areaId)
        if (!newArea?.shared)
          { alert('Esta turma está reservada para área compartilhada.'); return }
      }
    }
    if (isShared && !subjId)
      { alert('Selecione a matéria.'); return }
    onSave({ teacherId: teacher.id, subjectId: subjId || null, turma, day, timeSlot: slot })
  }

  const pillBase = 'px-3 py-1 rounded-full text-sm border transition-colors cursor-pointer'
  const pillOff  = `${pillBase} bg-surf2 border-bdr text-t2 hover:border-t3`
  const pillOn   = `${pillBase} bg-navy border-transparent text-white font-semibold shadow-sm`
  const pillLock = `${pillBase} bg-surf2 border-bdr text-t3 opacity-50 cursor-not-allowed`

  return (
    <Modal open={open} onClose={onClose} title="Adicionar Aula">
      <div className="space-y-5">

        {/* Ano / Série */}
        <div>
          <label className="lbl">Ano / Série</label>
          {grades.length === 0
            ? <p className="text-xs text-t3">Nenhuma série cadastrada neste segmento.</p>
            : <div className="flex flex-wrap gap-2 mt-1">
                {grades.map(g => (
                  <button
                    key={g.name}
                    type="button"
                    className={grade === g.name ? pillOn : pillOff}
                    onClick={() => { setGrade(g.name); setTurma('') }}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
          }
        </div>

        {/* Turma */}
        <div>
          <label className="lbl">Turma</label>
          {!grade
            ? <p className="text-xs text-t3 mt-1">Selecione o Ano/Série primeiro.</p>
            : allTurmasForGrade.length === 0
              ? <p className="text-xs text-t3 mt-1">Nenhuma turma cadastrada para {grade}.</p>
              : <div className="flex flex-wrap gap-2 mt-1">
                  {allTurmasForGrade.map(t => {
                    const locked = hardBlockedTurmas.has(t)
                    return (
                      <button
                        key={t}
                        type="button"
                        className={locked ? pillLock : turma === t ? pillOn : pillOff}
                        disabled={locked}
                        onClick={() => !locked && setTurma(t)}
                        title={locked ? `Ocupado por ${occupiedByTeacher[t] ?? '?'}` : undefined}
                      >
                        {locked ? `🔒 ${t} · ${occupiedByTeacher[t] ?? '?'}` : t}
                      </button>
                    )
                  })}
                </div>
          }
        </div>

        {/* Turmas Compartilhadas */}
        {store.sharedSeries.length > 0 && (
          <div className="pt-3 border-t border-bdr">
            <div className="text-[10px] font-bold text-t3 uppercase tracking-wider mb-2">Turmas Compartilhadas</div>
            <div className="flex flex-wrap gap-2">
              {store.sharedSeries.map(ss => (
                <button
                  key={ss.id}
                  type="button"
                  className={turma === ss.name ? pillOn : pillOff}
                  onClick={() => { setGrade(''); setTurma(ss.name); setSubjId('') }}
                >
                  {ss.name}
                </button>
              ))}
            </div>

            {selectedSharedSeries && (
              <div className="mt-3">
                <div className="text-[10px] font-bold text-t3 uppercase tracking-wider mb-2">Matéria</div>
                <div className="flex flex-wrap gap-2">
                  {mySubjs.map(subj => (
                      <button
                        key={subj.id}
                        type="button"
                        className={subjId === subj.id ? pillOn : pillOff}
                        onClick={() => setSubjId(subj.id)}
                      >
                        {subj.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Matéria */}
        <div>
          <label className="lbl">Matéria <span className="font-normal text-t3">(opcional)</span></label>
          {mySubjs.length === 0
            ? <p className="text-xs text-t3 mt-1">Nenhuma matéria vinculada a este segmento.</p>
            : <div className="flex flex-wrap gap-2 mt-1">
                <button
                  type="button"
                  className={subjId === '' ? pillOn : pillOff}
                  onClick={() => setSubjId('')}
                >
                  — sem matéria —
                </button>
                {mySubjs.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className={subjId === s.id ? pillOn : pillOff}
                    onClick={() => setSubjId(s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
          }
        </div>

        <div className="flex gap-2 pt-1">
          <button
            className="btn btn-dark flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={save}
            disabled={!turma}
          >
            Adicionar
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Tab: Perfil do Professor ──────────────────────────────────────────────────

function TabProfile({ teacher }) {
  const store = useAppStore()
  const { teacher: authTeacher, isCoordinator } = useAuthStore()
  const t = teacher ?? authTeacher
  const [nome,             setNome]             = useState(t?.name ?? '')
  const [celular,          setCelular]          = useState(t?.celular ?? '')
  const [apelido,          setApelido]          = useState(t?.apelido ?? '')
  const [selSubjs,         setSelSubjs]         = useState(t?.subjectIds ?? [])
  const [schedModal,       setSchedModal]       = useState(false)
  const [subjectChangeCtx, setSubjectChangeCtx] = useState(null)
  const [myActions,        setMyActions]        = useState([])
  const [loadingActions,   setLoadingActions]   = useState(false)
  const [actionsError,     setActionsError]     = useState(false)

  const loadActions = async () => {
    if (!t?.id) return
    setLoadingActions(true)
    setActionsError(false)
    try {
      const actions = await getMyPendingActions(t.id)
      setMyActions(actions)
    } catch {
      setActionsError(true)
    } finally {
      setLoadingActions(false)
    }
  }

  useEffect(() => {
    if (isCoordinator()) loadActions()
  }, [t?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!t) return <p className="text-t3 text-sm">Perfil não disponível.</p>

  const save = async () => {
    if (!nome.trim()) { toast('Nome não pode ficar vazio', 'err'); return }

    const { removedIds, addedIds, affectedSchedules } =
      calcSubjectChange(t, selSubjs, store.schedules)

    if (affectedSchedules.length > 0) {
      const isSwap = removedIds.length === 1 && addedIds.length === 1
      const subjectsById = Object.fromEntries(store.subjects.map(s => [s.id, s]))
      setSubjectChangeCtx({
        teacher: t,
        removedSubjects: removedIds.map(id => subjectsById[id] ?? { id, name: id }),
        addedSubjects:   addedIds.map(id => subjectsById[id] ?? { id, name: id }),
        affectedCount:   affectedSchedules.length,
        onMigrate: isSwap ? async () => {
          try {
            store.migrateScheduleSubject(t.id, removedIds[0], addedIds[0])
            await store.updateTeacherProfile(t.id, { name: nome.trim(), celular, apelido: apelido.trim(), subjectIds: selSubjs })
            toast('Perfil salvo e horários migrados', 'ok')
          } catch (e) {
            console.error(e)
            toast('Erro ao salvar perfil', 'err')
          }
          setSubjectChangeCtx(null)
        } : null,
        onRemove: async () => {
          try {
            removedIds.forEach(sid => store.removeSchedulesBySubject(t.id, sid))
            await store.updateTeacherProfile(t.id, { name: nome.trim(), celular, apelido: apelido.trim(), subjectIds: selSubjs })
            toast('Perfil salvo e horários removidos', 'ok')
          } catch (e) {
            console.error(e)
            toast('Erro ao salvar perfil', 'err')
          }
          setSubjectChangeCtx(null)
        },
        onCancel: () => setSubjectChangeCtx(null),
      })
      return
    }

    try {
      await store.updateTeacherProfile(t.id, { name: nome.trim(), celular, apelido: apelido.trim(), subjectIds: selSubjs })
      toast('Perfil salvo', 'ok')
    } catch (e) {
      console.error(e)
      toast('Erro ao salvar perfil', 'err')
    }
  }

  return (
    <div className="max-w-md space-y-5">
      <div className="card flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-navy text-white flex items-center justify-center text-xl font-extrabold shrink-0">
          {t.name.charAt(0)}
        </div>
        <div className="flex-1">
          <div className="font-extrabold text-lg">{t.name}</div>
          <div className="text-sm text-t2">{t.email ?? ''}</div>
          <div className="text-xs text-t3 mt-0.5">{store.schedules.filter(s => s.teacherId === t.id).length} aulas cadastradas</div>
        </div>
        <button className="btn btn-ghost btn-sm shrink-0" onClick={() => setSchedModal(true)}>
          🗓 Minha Grade
        </button>
      </div>

      <div>
        <label className="lbl">E-mail <span className="text-t3 normal-case font-normal">(não editável)</span></label>
        <div className="inp bg-surf2 text-t2">{t.email ?? '—'}</div>
      </div>

      <div>
        <label className="lbl">Nome (como você prefere ser identificado)</label>
        <input className="inp" type="text" value={nome} onChange={e => setNome(e.target.value)} />
      </div>

      <div>
        <label className="lbl">Celular / WhatsApp</label>
        <input className="inp" type="tel" placeholder="(11) 99999-9999" value={celular}
          onChange={e => setCelular(e.target.value)} />
      </div>

      <div>
        <label className="lbl">Como prefere ser chamado? <span className="text-t3 normal-case font-normal">(opcional)</span></label>
        <input className="inp" type="text" placeholder="Ex: Prof. João, Joãozinho..."
          maxLength={30} value={apelido} onChange={e => setApelido(e.target.value)} />
        <p className="text-xs text-t3 mt-1">Apelido exibido nas grades horárias quando o toggle "Apelido" estiver ativo.</p>
      </div>

      <div>
        <label className="lbl">Matérias que leciono</label>
        {store.subjects.length === 0 ? (
          <p className="text-xs text-t3">Nenhuma matéria cadastrada.</p>
        ) : (
          <SubjectSelector
            store={store}
            selectedIds={selSubjs}
            onChange={setSelSubjs}
          />
        )}
      </div>

      <button className="btn btn-dark" onClick={save}>Salvar alterações</button>

      {isCoordinator() && (
        <MyRequestsSection
          actions={myActions}
          loading={loadingActions}
          error={actionsError}
          onRefresh={loadActions}
        />
      )}

      <ScheduleGridModal
        open={schedModal}
        onClose={() => setSchedModal(false)}
        teacher={store.teachers.find(x => x.id === t.id) ?? t}
        store={store}
      />
      <SubjectChangeModal ctx={subjectChangeCtx} />
    </div>
  )
}

// ─── Minhas Solicitações (coordenador) ───────────────────────────────────────

const STATUS_BADGE = {
  pending:  { label: 'Pendente',  cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  approved: { label: 'Aprovada',  cls: 'bg-green-100 text-green-800 border-green-300' },
  rejected: { label: 'Rejeitada', cls: 'bg-red-100 text-red-800 border-red-300' },
}

function myTimeAgo(ts) {
  if (!ts) return '—'
  const ms = Date.now() - (ts?.toDate?.() ?? new Date(ts)).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'agora mesmo'
  if (mins < 60) return `há ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `há ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `há ${days} dia${days !== 1 ? 's' : ''}`
}

function MyRequestsSection({ actions, loading, error, onRefresh }) {
  const badge = (status) => STATUS_BADGE[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700 border-gray-300' }
  return (
    <div className="pt-4 border-t border-bdr space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">Minhas Solicitações</h3>
        <button className="btn btn-sm btn-ghost text-xs" onClick={onRefresh} disabled={loading}>
          {loading ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600">Erro ao carregar solicitações.</p>
      )}

      {!loading && !error && actions.length === 0 && (
        <p className="text-sm text-t3">Nenhuma solicitação enviada ainda.</p>
      )}

      {actions.map(a => {
        const b = badge(a.status)
        return (
          <div key={a.id} className="rounded-xl border border-bdr p-3 space-y-1 bg-surf">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{a.summary}</p>
              <span className={`shrink-0 text-xs border rounded-full px-2 py-0.5 font-semibold ${b.cls}`}>
                {b.label}
              </span>
            </div>
            <p className="text-xs text-t3">{myTimeAgo(a.createdAt)}</p>
            {a.status === 'rejected' && a.rejectionReason && (
              <p className="text-xs text-red-600 mt-1">Motivo: {a.rejectionReason}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Aprovações Pendentes ─────────────────────────────────────────────────────

function timeAgo(ts) {
  const ms = Date.now() - (ts?.toDate?.() ?? new Date(ts)).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'agora mesmo'
  if (mins < 60) return `há ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `há ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `há ${days} dia${days !== 1 ? 's' : ''}`
}

function RejectModal({ open, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const handleConfirm = () => { onConfirm(reason.trim() || null); setReason('') }
  const handleClose   = () => { setReason(''); onClose() }
  return (
    <Modal open={open} onClose={handleClose} title="Rejeitar Ação" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-t2">Informe um motivo para a rejeição (opcional):</p>
        <textarea
          className="inp w-full text-sm resize-none"
          rows={3}
          placeholder="Motivo da rejeição…"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button className="btn" onClick={handleClose}>Cancelar</button>
          <button className="btn bg-red-600 text-white hover:bg-red-700 border-red-600" onClick={handleConfirm}>
            Confirmar Rejeição
          </button>
        </div>
      </div>
    </Modal>
  )
}

function PendingActionCard({ action, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [approving, setApproving]   = useState(false)

  const handleApprove = async () => {
    setApproving(true)
    await onApprove(action)
    setApproving(false)
  }

  return (
    <div className="rounded-xl border border-bdr p-4 space-y-3 bg-surf">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-t1 truncate">{action.summary}</div>
          <div className="text-xs text-t2 mt-0.5">
            <span className="font-semibold">{action.coordinatorName}</span>
            {' · '}
            <span>{timeAgo(action.createdAt)}</span>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-warn/10 text-warn border border-warn/20 uppercase tracking-wide">
          Pendente
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="btn btn-dark text-xs py-1 px-3"
          onClick={handleApprove}
          disabled={approving}
        >
          {approving ? '…' : '✅ Aprovar'}
        </button>
        <button
          className="btn text-xs py-1 px-3 bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
          onClick={() => setRejectOpen(true)}
        >
          ❌ Rejeitar
        </button>
        <button
          className="btn text-xs py-1 px-3"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? '▲ Ocultar' : '▼ Ver detalhes'}
        </button>
      </div>

      {expanded && (
        <pre className="text-[11px] bg-surf2 rounded-lg p-3 overflow-x-auto text-t2 leading-relaxed border border-bdr">
          {JSON.stringify(action.payload, null, 2)}
        </pre>
      )}

      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => { setRejectOpen(false); onReject(action, reason) }}
      />
    </div>
  )
}

function TabApprovals({ adminEmail }) {
  const store = useAppStore()
  const [actions, setActions] = useState([])
  const [loaded,  setLoaded]  = useState(false)
  const [error,   setError]   = useState(false)

  const ACTION_MAP = {
    addTeacher:           (p) => store.addTeacher(p.name, p.opts),
    updateTeacher:        (p) => store.updateTeacher(p.id, p.changes),
    removeTeacher:        (p) => store.removeTeacher(p.id),
    addSchedule:          (p) => store.addSchedule(p.sched),
    removeSchedule:       (p) => store.removeSchedule(p.id),
    updateSchedule:       (p) => store.updateSchedule(p.id, p.changes),
    addSegment:           (p) => store.addSegment(p.name, p.turno),
    removeSegment:        (p) => store.removeSegment(p.id),
    addGrade:             (p) => store.addGrade(p.segId, p.gradeName),
    removeGrade:          (p) => store.removeGrade(p.segId, p.gradeName),
    addClassToGrade:      (p) => store.addClassToGrade(p.segId, p.gradeName, p.letter),
    removeClassFromGrade: (p) => store.removeClassFromGrade(p.segId, p.gradeName, p.letter),
    savePeriodCfg:        (p) => store.savePeriodCfg(p.segId, p.turno, p.cfg),
    addArea:              (p) => store.addArea(p.name, p.colorIdx, p.segmentIds, p.shared),
    updateArea:           (p) => store.updateArea(p.id, p.changes),
    removeArea:           (p) => store.removeArea(p.id),
    addSubject:           (p) => store.addSubject(p.name, p.areaId),
    removeSubject:        (p) => store.removeSubject(p.id),
    saveAreaWithSubjects: (p) => store.saveAreaWithSubjects(p.areaId, p.name, p.subjectNames),
    setWorkload:          (p) => store.setWorkload(p.warn, p.danger),
  }

  const load = async () => {
    setError(false)
    try { setActions(await getPendingActions()); setLoaded(true) }
    catch (e) { console.error('[TabApprovals] Erro ao carregar aprovações pendentes:', e); setError(true); setLoaded(true) }
  }
  useEffect(() => { load() }, [])

  const handleApprove = async (action) => {
    const executor = ACTION_MAP[action.action]
    if (!executor) {
      toast(`Ação desconhecida: ${action.action}`, 'error')
      return
    }
    try {
      await executor(action.payload)
    } catch (e) {
      console.error('[approve] store action failed:', e)
      toast('Erro ao executar ação', 'error')
      return
    }
    try {
      await approvePendingAction(action.id, adminEmail)
    } catch (e) {
      console.error('[approve] failed to mark as approved:', e)
      toast('Erro ao registrar aprovação', 'error')
      return
    }
    setActions(prev => prev.filter(a => a.id !== action.id))
    toast('Ação aprovada e executada', 'ok')
  }

  const handleReject = async (action, reason) => {
    try {
      await rejectPendingAction(action.id, adminEmail, reason)
      setActions(prev => prev.filter(a => a.id !== action.id))
      toast('Ação rejeitada', 'warn')
    } catch (e) { console.error('[TabApprovals] Erro ao rejeitar ação:', e); toast('Erro ao rejeitar', 'error') }
  }

  if (!loaded) return <div className="text-center py-12 text-t3 text-sm">Carregando…</div>

  if (error) return (
    <div className="text-center py-12 space-y-3">
      <div className="text-t3 text-sm">Erro ao carregar aprovações pendentes.</div>
      <button className="btn btn-dark" onClick={load}>Tentar novamente</button>
    </div>
  )

  if (actions.length === 0) return (
    <div className="text-center py-12 text-t3 text-sm">✅ Nenhuma aprovação pendente.</div>
  )

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="text-xs text-t3 mb-1">{actions.length} ação{actions.length !== 1 ? 'ões' : ''} aguardando aprovação</div>
      {actions.map(a => (
        <PendingActionCard
          key={a.id}
          action={a}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ))}
    </div>
  )
}
