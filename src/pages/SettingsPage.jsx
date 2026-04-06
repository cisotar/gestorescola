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

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap mb-6">
        {isAdmin
          ? ADMIN_TABS.map(t => <button key={t.id} className={tabClass(t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)
          : <button className={tabClass('profile')} onClick={() => setTab('profile')}>👤 Meu Perfil</button>}
      </div>

      {/* Conteúdo */}
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

// ─── Tab: Segmentos ────────────────────────────────────────────────────────────

function TabSegments() {
  const store = useAppStore()
  const [name, setName] = useState('')

  return (
    <div className="space-y-5">
      {/* Novo segmento */}
      <div className="card">
        <div className="font-bold text-sm mb-3">Novo Segmento</div>
        <div className="flex gap-2">
          <input className="inp" placeholder="Ex: Educação Infantil" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { store.addSegment(name.trim()); setName(''); toast('Segmento criado', 'ok') } }} />
          <button className="btn btn-dark" onClick={() => { if (!name.trim()) return; store.addSegment(name.trim()); setName(''); toast('Segmento criado', 'ok') }}>
            Adicionar
          </button>
        </div>
      </div>

      {/* Lista */}
      {store.segments.map(seg => (
        <div key={seg.id} className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-base">{seg.name}</div>
              <div className="text-xs text-t3">{seg.grades.length} série{seg.grades.length !== 1 ? 's' : ''}</div>
            </div>
            <button className="btn btn-ghost btn-xs text-err" onClick={() => { if (confirm('Remover segmento?')) store.removeSegment(seg.id) }}>✕ Remover</button>
          </div>

          {/* Turno */}
          <div className="flex items-center gap-2">
            <label className="lbl !mb-0">Turno:</label>
            <select className="inp !w-auto py-1 text-sm" value={seg.turno ?? 'manha'}
              onChange={e => store.setSegmentTurno(seg.id, e.target.value)}>
              <option value="manha">🌅 Manhã</option>
              <option value="tarde">🌇 Tarde</option>
            </select>
          </div>

          {/* Séries */}
          <GradeList seg={seg} store={store} />
        </div>
      ))}
    </div>
  )
}

function GradeList({ seg, store }) {
  const [gradeInput, setGradeInput] = useState('')

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input className="inp" placeholder="Ex: 5º Ano, 4ª Série…" value={gradeInput} onChange={e => setGradeInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && gradeInput.trim()) { store.addGrade(seg.id, gradeInput.trim()); setGradeInput('') } }} />
        <button className="btn btn-dark" onClick={() => { if (!gradeInput.trim()) return; store.addGrade(seg.id, gradeInput.trim()); setGradeInput('') }}>+ Série</button>
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
        <input className="inp !w-24 py-1 text-xs" placeholder="Letra (A,B…)" value={letter} onChange={e => setLetter(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && letter.trim()) { store.addClassToGrade(seg.id, grade.name, letter.trim()); setLetter('') } }} />
        <button className="btn btn-dark btn-xs" onClick={() => { if (!letter.trim()) return; store.addClassToGrade(seg.id, grade.name, letter.trim()); setLetter('') }}>+</button>
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
    <div className={`grid gap-5`} style={{ gridTemplateColumns: `repeat(${store.segments.length || 1}, 1fr)` }}>
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
    const lines = txt.split('\n').map(l => l.trim()).filter(Boolean).filter((v,i,a) => a.indexOf(v) === i)
    store.saveAreaWithSubjects(area.id, name.trim() || area.name, lines)
    toast('Disciplinas salvas', 'ok')
  }

  return (
    <div className="rounded-xl border-l-4 p-3 bg-surf border border-bdr" style={{ borderLeftColor: cv.dt }}>
      <div className="flex items-center gap-2 mb-2">
        <input className="font-bold text-sm flex-1 bg-transparent outline-none border-b border-transparent hover:border-bdr focus:border-navy px-1 py-0.5 transition-colors"
          value={name} onChange={e => setName(e.target.value)} />
        <span className="text-xs text-t3">{subs.length} disc.</span>
        <button className="btn btn-dark btn-xs" onClick={save}>Salvar</button>
        <button className="btn btn-ghost btn-xs text-err" onClick={() => { if (confirm(`Remover área "${area.name}"?`)) store.removeArea(area.id) }}>✕</button>
      </div>
      <textarea
        className="inp text-xs font-mono resize-y min-h-[80px] w-full"
        placeholder="Uma disciplina por linha…" value={txt}
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
      <input className="inp" placeholder="Nova área…" value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && add()} />
      <button className="btn btn-dark" onClick={add}>＋</button>
    </div>
  )
}

// ─── Tab: Professores ──────────────────────────────────────────────────────────

function TabTeachers() {
  const store = useAppStore()
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name:'', email:'', celular:'', subjectIds:[] })

  const openAdd = () => { setForm({ name:'', email:'', celular:'', subjectIds:[] }); setEditId(null); setModal(true) }
  const openEdit = (t) => { setForm({ name:t.name, email:t.email??'', celular:t.celular??'', subjectIds:t.subjectIds??[] }); setEditId(t.id); setModal(true) }

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
          const prefix = seg.id + '|'
          const list = store.teachers.filter(t =>
            (t.subjectIds ?? []).some(sid => {
              const subj = store.subjects.find(s => s.id === sid)
              const area = subj ? store.areas.find(a => a.id === subj.areaId) : null
              return (area?.segmentIds ?? []).includes(seg.id)
            })
          ).sort((a,b) => a.name.localeCompare(b.name))

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
                      <button className="btn btn-ghost btn-xs text-err" onClick={() => { if (confirm(`Remover ${t.name}?`)) { store.removeTeacher(t.id); toast('Professor removido', 'ok') } }}>✕</button>
                    </div>
                  )
                })}
                {list.length === 0 && <p className="text-xs text-t3 py-2">Nenhum professor neste nível.</p>}
              </div>
            </div>
          )
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar Professor' : 'Novo Professor'}>
        <div className="space-y-4">
          <div><label className="lbl">Nome *</label><input className="inp" value={form.name} onChange={e => setForm(f => ({...f,name:e.target.value}))} /></div>
          <div><label className="lbl">E-mail</label><input className="inp" type="email" value={form.email} onChange={e => setForm(f => ({...f,email:e.target.value}))} /></div>
          <div><label className="lbl">Celular</label><input className="inp" type="tel" value={form.celular} onChange={e => setForm(f => ({...f,celular:e.target.value}))} /></div>
          <div>
            <label className="lbl">Matérias</label>
            <div className="max-h-48 overflow-y-auto scroll-thin border border-bdr rounded-xl p-3 space-y-1">
              {store.subjects.map(s => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="accent-navy" checked={(form.subjectIds ?? []).includes(s.id)}
                    onChange={e => setForm(f => ({ ...f, subjectIds: e.target.checked ? [...f.subjectIds, s.id] : f.subjectIds.filter(x => x !== s.id) }))} />
                  {s.name}
                </label>
              ))}
              {store.subjects.length === 0 && <p className="text-xs text-t3">Cadastre disciplinas primeiro.</p>}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button className="btn btn-dark flex-1" onClick={save}>Salvar</button>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Tab: Períodos ─────────────────────────────────────────────────────────────

function TabPeriods() {
  const store = useAppStore()
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
      {store.segments.map(seg => {
        const turno = seg.turno ?? 'manha'
        const cfg   = getCfg(seg.id, turno, store.periodConfigs)
        const preview = gerarPeriodos(cfg)

        const update = (field, val) => {
          store.savePeriodCfg(seg.id, turno, { ...cfg, [field]: val })
        }

        return (
          <div key={seg.id} className="card space-y-4">
            <div className="font-bold text-base">{seg.name} · {turno === 'tarde' ? '🌇 Tarde' : '🌅 Manhã'}</div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="lbl">Início</label><input className="inp" type="time" value={cfg.inicio} onChange={e => update('inicio', e.target.value)} /></div>
              <div><label className="lbl">Duração (min)</label><input className="inp" type="number" min="30" max="120" value={cfg.duracao} onChange={e => update('duracao', Number(e.target.value))} /></div>
              <div><label className="lbl">Qtd. aulas</label><input className="inp" type="number" min="1" max="12" value={cfg.qtd} onChange={e => update('qtd', Number(e.target.value))} /></div>
            </div>
            {/* Preview */}
            <div className="bg-surf2 rounded-xl p-3">
              <div className="text-[11px] font-bold text-t2 uppercase tracking-wide mb-2">Preview</div>
              <div className="space-y-0.5">
                {preview.map((p, i) => p.isIntervalo ? (
                  <div key={i} className="text-xs text-amber-700 font-semibold py-0.5">☕ Intervalo {p.inicio}–{p.fim}</div>
                ) : (
                  <div key={i} className="text-xs"><span className="font-bold">{p.label}</span> {p.inicio}–{p.fim}</div>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tab: Horários ────────────────────────────────────────────────────────────

function TabSchedules() {
  const store = useAppStore()
  const [selTeacher, setSelTeacher] = useState(null)
  const teacher = selTeacher ? store.teachers.find(t => t.id === selTeacher) : null

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {store.segments.map(seg => {
          const prefix = seg.id + '|'
          const list   = store.teachers.sort((a,b) => a.name.localeCompare(b.name))
          return (
            <div key={seg.id} className="card">
              <div className="font-bold text-sm mb-3">{seg.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {list.map(t => {
                  const cv     = colorOfTeacher(t, store)
                  const nAulas = store.schedules.filter(s => s.teacherId === t.id && s.timeSlot?.startsWith(prefix)).length
                  return (
                    <button key={t.id} onClick={() => setSelTeacher(t.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all
                        ${selTeacher === t.id ? 'border-navy bg-surf' : 'border-bdr hover:border-t3'}`}>
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
      </div>

      {teacher && <ScheduleGrid teacher={teacher} store={store} />}
    </div>
  )
}

function ScheduleGrid({ teacher, store }) {
  const { addSchedule, removeSchedule } = useAppStore()
  const [modal, setModal] = useState(null) // { segId, turno, aulaIdx, day }

  const DAYS = ['Segunda','Terça','Quarta','Quinta','Sexta']

  return (
    <div>
      <div className="font-bold text-sm mb-4">{teacher.name} — Grade de Horários</div>
      {store.segments.map(seg => {
        const turno   = seg.turno ?? 'manha'
        const aulas   = gerarPeriodos(getCfg(seg.id, turno, store.periodConfigs)).filter(p => !p.isIntervalo)
        if (!aulas.length) return null
        return (
          <div key={seg.id} className="mb-6">
            <div className="text-xs font-bold text-t2 uppercase tracking-wide mb-2">{seg.name}</div>
            <div className="card p-0 overflow-hidden overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-surf2 border-b border-bdr">
                    <th className="px-3 py-2 text-left font-bold text-t2 w-[90px]">Aula</th>
                    {DAYS.map(d => <th key={d} className="px-2 py-2 text-center font-bold text-t2 min-w-[100px]">{d}</th>)}
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
                        const slot  = `${seg.id}|${turno}|${p.aulaIdx}`
                        const mine  = store.schedules.filter(s => s.teacherId === teacher.id && s.timeSlot === slot && s.day === day)
                        return (
                          <td key={day} className="px-1.5 py-1.5 align-top">
                            <div className="space-y-1">
                              {mine.map(s => {
                                const subj = store.subjects.find(x => x.id === s.subjectId)
                                return (
                                  <div key={s.id} className="relative bg-surf2 border border-bdr rounded-lg p-1.5 text-[11px] group">
                                    <div className="font-bold truncate">{s.turma}</div>
                                    <div className="text-t3 truncate">{subj?.name ?? '—'}</div>
                                    <button className="absolute top-0.5 right-0.5 text-t3 hover:text-err hidden group-hover:block"
                                      onClick={() => removeSchedule(s.id)}>✕</button>
                                  </div>
                                )
                              })}
                              <button
                                onClick={() => setModal({ segId: seg.id, turno, aulaIdx: p.aulaIdx, day })}
                                className="w-full text-center text-[10px] text-t3 hover:text-navy py-1 rounded-lg hover:bg-surf2 transition-colors border border-dashed border-bdr hover:border-bdr">
                                ＋
                              </button>
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

      {/* Modal adicionar aula */}
      {modal && (
        <AddScheduleModal
          open={!!modal} onClose={() => setModal(null)}
          teacher={teacher} segId={modal.segId} turno={modal.turno}
          aulaIdx={modal.aulaIdx} day={modal.day} store={store}
          onSave={(sched) => { addSchedule(sched); setModal(null); toast('Aula adicionada', 'ok') }}
        />
      )}
    </div>
  )
}

function AddScheduleModal({ open, onClose, teacher, segId, turno, aulaIdx, day, store, onSave }) {
  const seg      = store.segments.find(s => s.id === segId)
  const mySubjs  = (teacher.subjectIds ?? []).map(sid => store.subjects.find(s => s.id === sid)).filter(Boolean)
  const [subjId, setSubjId] = useState(mySubjs[0]?.id ?? '')
  const [grade,  setGrade]  = useState('')
  const [turma,  setTurma]  = useState('')

  const grades = seg?.grades ?? []
  const turmas = grade ? (grades.find(g => g.name === grade)?.classes ?? []).map(c => `${grade} ${c.letter}`) : []

  const save = () => {
    if (!turma) { alert('Selecione a turma.'); return }
    const slot = `${segId}|${turno}|${aulaIdx}`
    if (store.schedules.find(s => s.teacherId === teacher.id && s.day === day && s.timeSlot === slot))
      { alert('Conflito: professor já tem aula neste horário.'); return }
    if (store.schedules.find(s => s.turma === turma && s.day === day && s.timeSlot === slot))
      { alert('Conflito: esta turma já tem aula neste horário.'); return }
    onSave({ teacherId: teacher.id, subjectId: subjId || null, turma, day, timeSlot: slot })
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar Aula">
      <div className="space-y-4">
        <div><label className="lbl">Matéria</label>
          <select className="inp" value={subjId} onChange={e => setSubjId(e.target.value)}>
            <option value="">— sem matéria —</option>
            {mySubjs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label className="lbl">Ano / Série</label>
          <select className="inp" value={grade} onChange={e => { setGrade(e.target.value); setTurma('') }}>
            <option value="">Selecione…</option>
            {grades.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
        </div>
        <div><label className="lbl">Turma</label>
          <select className="inp" value={turma} onChange={e => setTurma(e.target.value)}>
            <option value="">Selecione…</option>
            {turmas.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
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
    <Modal open={open} onClose={onClose} title="Professores Pendentes"
      // eslint-disable-next-line react/no-children-prop
    >
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
              <input className="inp" type="email" placeholder="email@escola.com" value={email} onChange={e => setEmail(e.target.value)} />
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
  const [celular, setCelular] = useState(t?.celular ?? '')
  const [selSubjs, setSelSubjs] = useState(new Set(t?.subjectIds ?? []))

  if (!t) return <p className="text-t3 text-sm">Perfil não disponível.</p>

  const save = () => {
    store.updateTeacher(t.id, { celular, subjectIds: [...selSubjs] })
    toast('Perfil salvo', 'ok')
  }

  const toggle = (id) => setSelSubjs(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  return (
    <div className="max-w-md space-y-5">
      {/* Cabeçalho */}
      <div className="card flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-navy text-white flex items-center justify-center text-xl font-extrabold shrink-0">
          {t.name.charAt(0)}
        </div>
        <div>
          <div className="font-extrabold text-lg">{t.name}</div>
          <div className="text-sm text-t2">{t.email ?? ''}</div>
          <div className="text-xs text-t3 mt-0.5">{store.schedules.filter(s => s.teacherId === t.id).length} aulas cadastradas</div>
        </div>
      </div>

      {/* E-mail (read-only) */}
      <div>
        <label className="lbl">E-mail <span className="text-t3 normal-case font-normal">(não editável)</span></label>
        <div className="inp bg-surf2 text-t2">{t.email ?? '—'}</div>
      </div>

      {/* Celular */}
      <div>
        <label className="lbl">Celular / WhatsApp</label>
        <input className="inp" type="tel" placeholder="(11) 99999-9999" value={celular} onChange={e => setCelular(e.target.value)} />
      </div>

      {/* Matérias */}
      <div>
        <label className="lbl">Matérias que leciono</label>
        <div className="border border-bdr rounded-xl p-3 max-h-64 overflow-y-auto scroll-thin space-y-1">
          {store.subjects.length === 0 && <p className="text-xs text-t3">Nenhuma matéria cadastrada.</p>}
          {store.subjects.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
              <input type="checkbox" className="accent-navy" checked={selSubjs.has(s.id)} onChange={() => toggle(s.id)} />
              {s.name}
            </label>
          ))}
        </div>
      </div>

      <button className="btn btn-dark" onClick={save}>Salvar alterações</button>
    </div>
  )
}
