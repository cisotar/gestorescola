import { useState } from 'react'
import useAuthStore from '../store/useAuthStore'
import useAppStore from '../store/useAppStore'
import { uid, colorOfTeacher, teacherSubjectNames } from '../lib/helpers'
import { getCfg, gerarPeriodos, defaultCfg } from '../lib/periods'
import { COLOR_PALETTE } from '../lib/constants'
import Modal from '../components/ui/Modal'
import { toast } from '../hooks/useToast'
import { listPendingTeachers, approveTeacher, rejectTeacher, addAdmin, listAdmins, removeAdmin } from '../lib/db'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { role, teacher: myTeacher } = useAuthStore()
  const isAdmin = role === 'admin'

  const ADMIN_TABS = [
    { id: 'segments',    label: '🏫 Segmentos' },
    { id: 'disciplines', label: '📚 Disciplinas' },
    { id: 'teachers',    label: '👩‍🏫 Professores' },
    { id: 'periods',     label: '⏰ Períodos' },
    { id: 'schedules',   label: '🗓 Horários' },
    { id: 'admin',       label: '🔐 Administração' },
  ]

  const [tab, setTab] = useState(isAdmin ? 'segments' : 'profile')

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

function AreaBlock({ area, store }) {
  const cv   = COLOR_PALETTE[area.colorIdx % COLOR_PALETTE.length]
  const subs = store.subjects.filter(s => s.areaId === area.id)
  const [name, setName] = useState(area.name)
  const [txt,  setTxt]  = useState(subs.map(s => s.name).join('\n'))

  const save = () => {
    const lines = txt.split('\n').map(l => l.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
    store.saveAreaWithSubjects(area.id, name.trim() || area.name, lines)
    toast('Disciplinas salvas', 'ok')
  }

  return (
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
      <textarea
        className="inp text-xs font-mono resize-y min-h-[80px] w-full"
        placeholder="Uma disciplina por linha…"
        value={txt}
        onChange={e => setTxt(e.target.value)}
        onBlur={save}
      />
    </div>
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
  const [modal,       setModal]       = useState(false)
  const [schedModal,  setSchedModal]  = useState(false)
  const [schedTeacher, setSchedTeacher] = useState(null)
  const [editId, setEditId] = useState(null)
  const [form,   setForm]   = useState({ name: '', email: '', celular: '', subjectIds: [] })

  const openAdd  = () => { setForm({ name: '', email: '', celular: '', subjectIds: [] }); setEditId(null); setModal(true) }
  const openEdit = (t) => { setForm({ name: t.name, email: t.email ?? '', celular: t.celular ?? '', subjectIds: t.subjectIds ?? [] }); setEditId(t.id); setModal(true) }

  const save = () => {
    if (!form.name.trim()) return
    if (editId) {
      store.updateTeacher(editId, form)
      toast('Professor atualizado', 'ok')
    } else {
      store.addTeacher(form.name.trim(), form)
      toast('Professor adicionado', 'ok')
    }
    setModal(false)
  }

  return (
    <div>
      <div className="flex gap-2 mb-5">
        <button className="btn btn-dark" onClick={openAdd}>+ Novo Professor</button>
      </div>

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
                    <div key={t.id} className="flex items-center gap-2 p-2 rounded-xl border border-bdr hover:border-t3 transition-colors">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: cv.tg, color: cv.tx }}>{t.name.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{t.name}</div>
                        <div className="text-[11px] text-t3 truncate">{teacherSubjectNames(t, store.subjects) || '—'}</div>
                      </div>
                      <span className="text-xs text-t2 shrink-0">{ct} aulas</span>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>✏️</button>
                      <button className="btn btn-ghost btn-xs text-err" onClick={() => {
                        if (confirm(`Remover ${t.name}?`)) { store.removeTeacher(t.id); toast('Professor removido', 'ok') }
                      }}>✕</button>
                    </div>
                  )
                })}
                {list.length === 0 && <p className="text-xs text-t3 py-2">Nenhum professor neste nível.</p>}
              </div>
            </div>
          )
        })}

        {/* Professores sem matéria associada a nenhum segmento */}
        {(() => {
          const unassigned = store.teachers.filter(t =>
            teacherSegmentIds(t, store.subjects, store.areas).length === 0
          ).sort((a, b) => a.name.localeCompare(b.name))
          if (!unassigned.length) return null
          return (
            <div className="card border-dashed border-warn/50 bg-amber-50/30">
              <div className="font-bold text-sm mb-3 pb-2 border-b border-bdr text-amber-700">
                ⚠ Sem segmento definido <span className="text-xs font-normal text-t3 ml-1">{unassigned.length} prof.</span>
              </div>
              <div className="space-y-2">
                {unassigned.map(t => {
                  const ct = store.schedules.filter(s => s.teacherId === t.id).length
                  return (
                    <div key={t.id} className="flex items-center gap-2 p-2 rounded-xl border border-bdr hover:border-t3 transition-colors bg-surf">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-amber-100 text-amber-700">
                        {t.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{t.name}</div>
                        <div className="text-[11px] text-amber-600 truncate">Sem matéria associada — clique em ✏️ para configurar</div>
                      </div>
                      <span className="text-xs text-t2 shrink-0">{ct} aulas</span>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>✏️</button>
                      <button className="btn btn-ghost btn-xs text-err" onClick={() => {
                        if (confirm(`Remover ${t.name}?`)) { store.removeTeacher(t.id); toast('Professor removido', 'ok') }
                      }}>✕</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>

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

function ScheduleGrid({ teacher, store }) {
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
                        // Número de turmas ainda disponíveis neste slot/dia
                        const occupiedTurmas = store.schedules
                          .filter(s => s.timeSlot === slot && s.day === day && s.teacherId !== teacher.id)
                          .map(s => s.turma)
                        const allTurmas = seg.grades.flatMap(g =>
                          g.classes.map(c => `${g.name} ${c.letter}`)
                        )
                        const freeTurmas = allTurmas.filter(t => !occupiedTurmas.includes(t))

                        return (
                          <td key={day} className={`px-1.5 py-1.5 align-top ${teacherConflict ? 'bg-amber-50/40' : ''}`}>
                            <div className="space-y-1">
                              {mine.map(s => {
                                const subj = store.subjects.find(x => x.id === s.subjectId)
                                return (
                                  <div key={s.id} className="relative bg-surf2 border border-bdr rounded-lg p-1.5 text-[11px] group">
                                    <div className="font-bold truncate">{s.turma}</div>
                                    <div className="text-t3 truncate">{subj?.name ?? '—'}</div>
                                    <button
                                      className="absolute top-0.5 right-0.5 text-t3 hover:text-err hidden group-hover:block"
                                      onClick={() => removeSchedule(s.id)}
                                    >✕</button>
                                  </div>
                                )
                              })}

                              {/* Bloquear + se professor já tem aula neste horário */}
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

function AddScheduleModal({ open, onClose, teacher, segId, turno, aulaIdx, day, store, onSave }) {
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

  // Turmas já ocupadas por outro professor neste slot/dia
  const occupiedTurmas = new Set(
    store.schedules
      .filter(s => s.timeSlot === slot && s.day === day && s.teacherId !== teacher.id)
      .map(s => s.turma)
  )

  const save = () => {
    if (!turma) { alert('Selecione a turma.'); return }
    if (store.schedules.find(s => s.teacherId === teacher.id && s.day === day && s.timeSlot === slot))
      { alert('Conflito: professor já tem aula neste horário.'); return }
    if (occupiedTurmas.has(turma))
      { alert('Conflito: esta turma já tem professor neste horário.'); return }
    onSave({ teacherId: teacher.id, subjectId: subjId || null, turma, day, timeSlot: slot })
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar Aula">
      <div className="space-y-4">
        <div>
          <label className="lbl">Matéria</label>
          <select className="inp" value={subjId} onChange={e => setSubjId(e.target.value)}>
            <option value="">— sem matéria —</option>
            {mySubjs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Ano / Série</label>
          <select className="inp" value={grade} onChange={e => { setGrade(e.target.value); setTurma('') }}>
            <option value="">Selecione…</option>
            {grades.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Turma</label>
          <select className="inp" value={turma} onChange={e => setTurma(e.target.value)}>
            <option value="">Selecione…</option>
            {allTurmasForGrade.map(t => (
              <option key={t} value={t} disabled={occupiedTurmas.has(t)}>
                {t}{occupiedTurmas.has(t) ? ' — 🔒 ocupada' : ''}
              </option>
            ))}
          </select>
          {occupiedTurmas.size > 0 && grade && (
            <p className="text-[11px] text-amber-600 mt-1">
              🔒 Turmas com professor já alocado neste horário aparecem bloqueadas.
            </p>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <button className="btn btn-dark flex-1" onClick={save}>Adicionar</button>
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
  const [celular,     setCelular]     = useState(t?.celular ?? '')
  const [selSubjs,    setSelSubjs]    = useState(t?.subjectIds ?? [])
  const [schedModal,  setSchedModal]  = useState(false)

  if (!t) return <p className="text-t3 text-sm">Perfil não disponível.</p>

  const save = () => {
    store.updateTeacher(t.id, { celular, subjectIds: selSubjs })
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
    </div>
  )
}
