import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'
import useAppStore from '../store/useAppStore'
import { uid, colorOfTeacher, teacherSubjectNames } from '../lib/helpers'
import { getCfg, gerarPeriodos, defaultCfg } from '../lib/periods'
import { COLOR_PALETTE } from '../lib/constants'
import Modal from '../components/ui/Modal'
import { toast } from '../hooks/useToast'
import { listPendingTeachers, approveTeacher, rejectTeacher, addAdmin, listAdmins, removeAdmin, deleteDocById } from '../lib/db'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { role, teacher: myTeacher } = useAuthStore()
  const isAdmin = role === 'admin'
  const location = useLocation()

  const ADMIN_TABS = [
    { id: 'segments',    label: '🏫 Segmentos' },
    { id: 'disciplines', label: '📚 Disciplinas' },
    { id: 'teachers',    label: '👩‍🏫 Professores' },
    { id: 'periods',     label: '⏰ Períodos' },
    { id: 'schedules',   label: '🗓 Horários' },
    { id: 'admin',       label: '✅ Aprovação' },
  ]

  const initialTab = (() => {
    if (!isAdmin) return 'profile'
    const param = new URLSearchParams(location.search).get('tab')
    return ADMIN_TABS.some(t => t.id === param) ? param : 'segments'
  })()

  const [tab, setTab] = useState(initialTab)

  const tabClass = (id) =>
    `px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border whitespace-nowrap ` +
    (tab === id ? 'bg-navy text-white border-navy' : 'bg-surf text-t2 border-bdr hover:border-t3')

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">
          {isAdmin ? 'Configurações' : 'Meu Perfil'}
        </h1>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-6">
        {isAdmin
          ? ADMIN_TABS.map(t => <button key={t.id} className={tabClass(t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)
          : <button className={tabClass('profile')} onClick={() => setTab('profile')}>👤 Meu Perfil</button>}
      </div>

      {tab === 'segments'    && <TabSegments />}
      {tab === 'disciplines' && <TabDisciplines />}
      {tab === 'teachers'    && <TabTeachers />}
      {tab === 'periods'     && <TabPeriods />}
      {tab === 'schedules'   && <TabSchedules />}
      {tab === 'admin'       && <TabAdmin />}
      {tab === 'profile'     && <TabProfile teacher={myTeacher} />}
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
    setDeparaData({ removedSubjectsWithCount, availableSubjects, lines })
    setDeparaOpen(true)
  }

  const handleDeparaConfirm = (mapping) => {
    if (!deparaData) return
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
            if (confirm(`Remover área "${area.name}"?`)) store.removeArea(area.id)
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
          setTxt(subs.map(s => s.name).join('\n'))
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

// ─── Tab: Professores ──────────────────────────────────────────────────────────

function TabTeachers() {
  const store = useAppStore()
  const navigate = useNavigate()
  const [modal,        setModal]        = useState(false)
  const [schedModal,   setSchedModal]   = useState(false)
  const [schedTeacher, setSchedTeacher] = useState(null)
  const [editId,       setEditId]       = useState(null)
  const [form,         setForm]         = useState({ name: '', email: '', celular: '', apelido: '', subjectIds: [] })
  const [view,         setView]         = useState('cards') // 'cards' | 'table'
  const [subjectChangeCtx, setSubjectChangeCtx] = useState(null)
  const [pending,          setPending]          = useState([])
  const [pendLoaded,       setPendLoaded]       = useState(false)

  // Carrega lista de admins e professores pendentes ao montar
  const [admins, setAdmins] = useState([])
  useEffect(() => {
    listAdmins().then(list => setAdmins(list.map(a => a.email.toLowerCase())))
    listPendingTeachers().then(list => { setPending(list); setPendLoaded(true) })
  }, [])

  const isTeacherAdmin = (t) => admins.includes((t.email ?? '').toLowerCase())

  const handleApprove = async (p) => {
    await approveTeacher(p.id, store, store.hydrate)
    setPending(prev => prev.filter(x => x.id !== p.id))
    toast(`${p.name} aprovado`, 'ok')
  }

  const handleReject = async (p) => {
    if (!confirm(`Recusar acesso de ${p.name}?`)) return
    await rejectTeacher(p.id)
    setPending(prev => prev.filter(x => x.id !== p.id))
    toast(`${p.name} recusado`, 'warn')
  }

  const handleStatusChange = async (t, newRole) => {
    if (newRole === 'admin') {
      await addAdmin(t.email, t.name)
      setAdmins(a => [...a, t.email.toLowerCase()])
      toast(`${t.name} agora é Admin`, 'ok')
    } else {
      await removeAdmin(t.email)
      setAdmins(a => a.filter(x => x !== t.email.toLowerCase()))
      toast(`${t.name} agora é Professor`, 'ok')
    }
  }

  const StatusSelect = ({ t }) => (
    <select
      value={isTeacherAdmin(t) ? 'admin' : 'teacher'}
      onChange={e => handleStatusChange(t, e.target.value)}
      className="inp !py-0.5 !px-1.5 text-xs !w-auto"
    >
      <option value="teacher">Professor</option>
      <option value="admin">Admin</option>
    </select>
  )

  const teacherSegmentNames = (t) =>
    store.segments
      .filter(seg => teacherBelongsToSegment(t, seg.id, store.subjects, store.areas))
      .map(seg => seg.name)
      .join(', ') || '—'

  const approvedRows = [...store.teachers].sort((a, b) => a.name.localeCompare(b.name))
  const pendingRows  = [...pending].sort((a, b) => a.name.localeCompare(b.name))
    .map(p => ({ ...p, _isPending: true }))
  const allRows = [...approvedRows, ...pendingRows]

  const openAdd  = () => { setForm({ name: '', email: '', celular: '', subjectIds: [] }); setEditId(null); setModal(true) }
  const openEdit = (t) => { setForm({ name: t.name, email: t.email ?? '', celular: t.celular ?? '', apelido: t.apelido ?? '', subjectIds: t.subjectIds ?? [] }); setEditId(t.id); setModal(true) }

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

  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button className="btn btn-dark" onClick={openAdd}>+ Novo Professor</button>
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
                      : <StatusSelect t={t} />
                    }
                  </td>
                  <td className="px-3 py-2.5">
                    {t._isPending ? (
                      <div className="flex gap-1">
                        <button className="btn btn-dark btn-xs" onClick={() => handleApprove(t)}>Aprovar</button>
                        <button className="btn btn-ghost btn-xs text-err" onClick={() => handleReject(t)}>✕</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>✏️</button>
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
                          <div className="mt-1.5"><StatusSelect t={t} /></div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs text-t2">{ct} aulas</span>
                          <button className="btn btn-ghost btn-xs" title="Ver Grade" onClick={() => navigate(`/schedule?teacherId=${t.id}`)}>📅</button>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>✏️</button>
                          <button className="btn btn-ghost btn-xs text-err" onClick={() => {
                            if (confirm(`Remover ${t.name}?`)) { store.removeTeacher(t.id); toast('Professor removido', 'ok') }
                          }}>✕</button>
                        </div>
                      </div>
                    )
                  })}
                  {list.length === 0 && <p className="text-xs text-t3 py-2">Nenhum professor neste nível.</p>}
                </div>
              </div>
            )
          })}

          {/* Professores sem segmento + pendentes */}
          {(() => {
            const unassigned = store.teachers.filter(t =>
              teacherSegmentIds(t, store.subjects, store.areas).length === 0
            ).sort((a, b) => a.name.localeCompare(b.name))
            const hasPending    = pending.length > 0
            const hasUnassigned = unassigned.length > 0
            if (!hasPending && !hasUnassigned) return null
            const total = pending.length + unassigned.length
            return (
              <div className="card border-dashed border-warn/50 bg-amber-50/30">
                <div className="font-bold text-sm mb-3 pb-2 border-b border-bdr text-amber-700">
                  ⚠ Sem segmento definido <span className="text-xs font-normal text-t3 ml-1">{total} prof.</span>
                </div>
                <div className="space-y-2">
                  {/* Pendentes */}
                  {pending.map(p => (
                    <div key={p.id} className="flex items-start gap-2 p-2 rounded-xl border border-warn/30 bg-amber-50/60">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 bg-amber-100 text-amber-700">
                        {p.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{p.name}</div>
                        <span className="badge bg-warn/10 text-warn border border-warn/30 text-[10px] mb-1">Pendente</span>
                        <div className="text-xs text-t1 truncate">✉ {p.email}</div>
                        {p.celular && <div className="text-xs text-t1 truncate">📱 {p.celular}</div>}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <button className="btn btn-dark btn-xs" onClick={() => handleApprove(p)}>Aprovar</button>
                        <button className="btn btn-ghost btn-xs text-err" onClick={() => handleReject(p)}>Recusar</button>
                      </div>
                    </div>
                  ))}
                  {/* Aprovados sem segmento */}
                  {unassigned.map(t => {
                    const ct = store.schedules.filter(s => s.teacherId === t.id).length
                    return (
                      <div key={t.id} className="flex items-start gap-2 p-2 rounded-xl border border-bdr hover:border-t3 transition-colors bg-surf">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 bg-amber-100 text-amber-700">
                          {t.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{t.name}</div>
                          <div className="text-[11px] text-amber-600 truncate">Sem matéria associada — clique em ✏️ para configurar</div>
                          {t.email   && <div className="text-xs text-t1 truncate">✉ {t.email}</div>}
                          {t.apelido && <div className="text-xs text-t3 italic">"{t.apelido}"</div>}
                          {t.celular && <div className="text-xs text-t1 truncate">📱 {t.celular}</div>}
                          <div className="mt-1.5"><StatusSelect t={t} /></div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs text-t2">{ct} aulas</span>
                          <button className="btn btn-ghost btn-xs" title="Ver Grade" onClick={() => navigate(`/schedule?teacherId=${t.id}`)}>📅</button>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>✏️</button>
                          <button className="btn btn-ghost btn-xs text-err" onClick={() => {
                            if (confirm(`Remover ${t.name}?`)) { store.removeTeacher(t.id); toast('Professor removido', 'ok') }
                          }}>✕</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
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
      <SubjectChangeModal ctx={subjectChangeCtx} />
    </div>
  )
}

// ─── Tab: Períodos — item 1 (turno) e item 3 (intervalos editáveis) ──────────

function TabPeriods() {
  const store = useAppStore()

  return (
    <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
      {store.segments.map(seg => {
        const turno   = seg.turno ?? 'manha'
        const cfg     = getCfg(seg.id, turno, store.periodConfigs)
        const preview = gerarPeriodos(cfg)

        const update = (field, val) =>
          store.savePeriodCfg(seg.id, turno, { ...cfg, [field]: val })

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
          <div key={seg.id} className="card space-y-4">
            {/* Cabeçalho com turno editável — item 1 */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-bold text-base">{seg.name}</div>
              <TurnoSelector seg={seg} store={store} />
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

            {/* Preview */}
            <div className="bg-surf2 rounded-xl p-3">
              <div className="text-[11px] font-bold text-t2 uppercase tracking-wide mb-2">Preview</div>
              <div className="space-y-0.5">
                {preview.map((p, i) => p.isIntervalo ? (
                  <div key={i} className="text-xs text-amber-700 font-semibold py-0.5">
                    ☕ Intervalo {p.inicio}–{p.fim} ({p.duracao} min)
                  </div>
                ) : (
                  <div key={i} className="text-xs">
                    <span className="font-bold">{p.label}</span> {p.inicio}–{p.fim}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })}
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

// ─── ScheduleGridModal — abre grade em modal (reutilizável) ──────────────────

export function ScheduleGridModal({ open, onClose, teacher, store }) {
  if (!teacher) return null
  return (
    <Modal open={open} onClose={onClose} title={`Grade de Horários — ${teacher.name}`} size="xl">
      <ScheduleGrid teacher={teacher} store={store} />
    </Modal>
  )
}

export function ScheduleGrid({ teacher, store }) {
  const { addSchedule, removeSchedule } = useAppStore()
  const [modal, setModal] = useState(null)

  const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']

  // Segmentos do professor derivados das matérias — mesma lógica de TabTeachers e TabSchedules
  const teacherSegIds = teacherSegmentIds(teacher, store.subjects, store.areas)
  const relevantSegments = store.segments.filter(s => teacherSegIds.includes(s.id))

  return (
    <div>
      {relevantSegments.length === 0 && (
        <p className="text-sm text-t3 py-4">Este professor não tem matérias associadas a nenhum segmento.</p>
      )}

      {relevantSegments.map(seg => {
        const turno = seg.turno ?? 'manha'
        const aulas = gerarPeriodos(getCfg(seg.id, turno, store.periodConfigs)).filter(p => !p.isIntervalo)
        if (!aulas.length) return null

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
                  {aulas.map(p => (
                    <tr key={p.aulaIdx} className="border-b border-bdr/50">
                      <td className="px-3 py-1.5">
                        <div className="font-bold font-mono">{p.label}</div>
                        <div className="font-mono text-t3 text-[10px]">{p.inicio}–{p.fim}</div>
                      </td>
                      {DAYS.map(day => {
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
                          .filter(s => !isSharedSchedule(s, store))
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
                                    <button
                                      className="absolute top-0.5 right-0.5 text-t3 hover:text-err hidden group-hover:block"
                                      onClick={() => removeSchedule(s.id)}
                                    >✕</button>
                                  </div>
                                )
                              })}

                              {/* Indicadores de bloqueio — sem dados de terceiros */}
                              {teacherConflict ? (
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
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
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

  // Turmas bloqueadas: têm ao menos 1 ocupante de área não-compartilhada
  const hardBlockedTurmas = new Set(
    store.schedules
      .filter(s => s.timeSlot === slot && s.day === day && s.teacherId !== teacher.id)
      .filter(s => !isSharedSchedule(s, store))
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
    if (!grade || !turma) return
    if (store.schedules.find(s => s.teacherId === teacher.id && s.day === day && s.timeSlot === slot))
      { alert('Conflito: professor já tem aula neste horário.'); return }
    if (hardBlockedTurmas.has(turma))
      { alert('Conflito: esta turma já tem professor neste horário.'); return }
    // Turma com ocupante de área compartilhada: novo subject também deve ser compartilhado
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
            disabled={!grade || !turma}
          >
            Adicionar
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Tab: Administração ────────────────────────────────────────────────────────

function TabAdmin() {
  const [pendingModal, setPendingModal] = useState(false)
  const [adminsModal,  setAdminsModal]  = useState(false)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl">
      <div className="card">
        <div className="font-bold text-sm mb-2">👩‍🏫 Aprovar Professores</div>
        <p className="text-xs text-t2 mb-4 leading-relaxed">Professores que solicitaram acesso aguardando aprovação.</p>
        <button className="btn btn-dark" onClick={() => setPendingModal(true)}>Gerenciar solicitações</button>
      </div>
      <div className="card">
        <div className="font-bold text-sm mb-2">⚙️ Administradores</div>
        <p className="text-xs text-t2 mb-4 leading-relaxed">Adicione ou remova administradores do sistema.</p>
        <button className="btn btn-dark" onClick={() => setAdminsModal(true)}>Gerenciar administradores</button>
      </div>
      <PendingModal open={pendingModal} onClose={() => setPendingModal(false)} />
      <AdminsModal  open={adminsModal}  onClose={() => setAdminsModal(false)} />
    </div>
  )
}

function PendingModal({ open, onClose }) {
  const store = useAppStore()
  const [pending, setPending] = useState([])
  const [loaded,  setLoaded]  = useState(false)

  const load = async () => { setPending(await listPendingTeachers()); setLoaded(true) }

  return (
    <Modal open={open} onClose={onClose} title="Professores Pendentes">
      {!loaded ? (
        <div className="text-center py-8"><button className="btn btn-dark" onClick={load}>Carregar</button></div>
      ) : pending.length === 0 ? (
        <div className="text-center py-8 text-t3">✅ Nenhum professor aguardando aprovação.</div>
      ) : (
        <div className="space-y-3">
          {pending.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-bdr">
              <div className="flex-1">
                <div className="font-bold text-sm">{p.name}</div>
                <div className="text-xs text-t2">{p.email}</div>
              </div>
              <button className="btn btn-dark btn-sm" onClick={async () => {
                await approveTeacher(p.id, store, store.hydrate)
                setPending(prev => prev.filter(x => x.id !== p.id))
                toast(`${p.name} aprovado`, 'ok')
              }}>Aprovar</button>
              <button className="btn btn-ghost btn-sm text-err" onClick={async () => {
                if (!confirm('Recusar?')) return
                await rejectTeacher(p.id)
                setPending(prev => prev.filter(x => x.id !== p.id))
              }}>Recusar</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function AdminsModal({ open, onClose }) {
  const [admins, setAdmins] = useState([])
  const [email,  setEmail]  = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = async () => { setAdmins(await listAdmins()); setLoaded(true) }

  return (
    <Modal open={open} onClose={onClose} title="Administradores">
      {!loaded ? (
        <div className="text-center py-8"><button className="btn btn-dark" onClick={load}>Carregar</button></div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {admins.map(a => (
              <div key={a.email} className="flex items-center gap-3 p-2.5 rounded-xl border border-bdr">
                <div className="flex-1 text-sm font-semibold">{a.name || a.email}</div>
                <div className="text-xs text-t2">{a.email}</div>
                <button className="btn btn-ghost btn-xs text-err" onClick={async () => {
                  if (!confirm(`Remover ${a.email}?`)) return
                  await removeAdmin(a.email)
                  setAdmins(prev => prev.filter(x => x.email !== a.email))
                }}>✕</button>
              </div>
            ))}
            {admins.length === 0 && <p className="text-xs text-t3">Nenhum admin adicional.</p>}
          </div>
          <div>
            <label className="lbl">Adicionar por e-mail</label>
            <div className="flex gap-2">
              <input className="inp" type="email" placeholder="email@escola.com" value={email}
                onChange={e => setEmail(e.target.value)} />
              <button className="btn btn-dark" onClick={async () => {
                if (!email.trim()) return
                await addAdmin(email.trim())
                setAdmins(prev => [...prev, { email: email.trim(), name: '' }])
                setEmail('')
                toast('Administrador adicionado', 'ok')
              }}>Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Tab: Perfil do Professor ──────────────────────────────────────────────────

function TabProfile({ teacher }) {
  const store = useAppStore()
  const { teacher: authTeacher } = useAuthStore()
  const t = teacher ?? authTeacher
  const [celular,          setCelular]          = useState(t?.celular ?? '')
  const [apelido,          setApelido]          = useState(t?.apelido ?? '')
  const [selSubjs,         setSelSubjs]         = useState(t?.subjectIds ?? [])
  const [schedModal,       setSchedModal]       = useState(false)
  const [subjectChangeCtx, setSubjectChangeCtx] = useState(null)

  if (!t) return <p className="text-t3 text-sm">Perfil não disponível.</p>

  const save = () => {
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
        onMigrate: isSwap ? () => {
          store.migrateScheduleSubject(t.id, removedIds[0], addedIds[0])
          store.updateTeacherProfile(t.id, { celular, apelido: apelido.trim(), subjectIds: selSubjs })
          toast('Perfil salvo e horários migrados', 'ok')
          setSubjectChangeCtx(null)
        } : null,
        onRemove: () => {
          removedIds.forEach(sid => store.removeSchedulesBySubject(t.id, sid))
          store.updateTeacherProfile(t.id, { celular, apelido: apelido.trim(), subjectIds: selSubjs })
          toast('Perfil salvo e horários removidos', 'ok')
          setSubjectChangeCtx(null)
        },
        onCancel: () => setSubjectChangeCtx(null),
      })
      return
    }

    store.updateTeacherProfile(t.id, { celular, apelido: apelido.trim(), subjectIds: selSubjs })
    toast('Perfil salvo', 'ok')
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
