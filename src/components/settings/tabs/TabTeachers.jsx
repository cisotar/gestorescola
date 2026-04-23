// TabTeachers — CRUD de professores com filtros, modais e perfis

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../../../store/useAppStore'
import useAuthStore from '../../../store/useAuthStore'
import { toast } from '../../../hooks/useToast'
import { colorOfTeacher, teacherSubjectNames } from '../../../lib/helpers'
import { DAYS } from '../../../lib/constants'
import {
  calcSubjectChange,
  teacherBelongsToSegment,
  teacherSegmentIds,
  PROFILE_OPTIONS_NO_ADMIN,
} from '../../../lib/settings'
import {
  listPendingTeachers,
  approveTeacher,
  rejectTeacher,
  addAdmin,
  listAdmins,
  removeAdmin,
} from '../../../lib/db'
import Modal from '../../ui/Modal'
import { ScheduleGridModal } from '../../ui/ScheduleGrid'
import ProfilePillDropdown from '../shared/ProfilePillDropdown'
import SubjectSelector from '../shared/SubjectSelector'

// ─── SubjectChangeModal ───────────────────────────────────────────────────────

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

// ─── TabTeachers ──────────────────────────────────────────────────────────────

export default function TabTeachers() {
  const store = useAppStore()
  const { role } = useAuthStore()
  const isAdminUser = role === 'admin'
  const navigate = useNavigate()
  const [modal,              setModal]              = useState(false)
  const [schedModal,         setSchedModal]         = useState(false)
  const [schedTeacher,       setSchedTeacher]       = useState(null)
  const [viewingSchedule,    setViewingSchedule]    = useState(null)
  const [editId,             setEditId]             = useState(null)
  const [editingTeacher,     setEditingTeacher]     = useState(null)
  const [form,               setForm]               = useState({ name: '', email: '', celular: '', apelido: '', subjectIds: [] })
  const [view,               setView]               = useState('cards') // 'cards' | 'table'
  const [subjectChangeCtx,   setSubjectChangeCtx]   = useState(null)
  const [pending,            setPending]            = useState([])
  const [pendLoaded,         setPendLoaded]         = useState(false)
  const [showPendingPanel,   setShowPendingPanel]   = useState(false)
  const [showNoSegmentPanel, setShowNoSegmentPanel] = useState(false)
  const [pendingProfiles,    setPendingProfiles]    = useState({})
  const [admins,             setAdmins]             = useState([])
  const [viewingHorarios,    setViewingHorarios]    = useState(null) // professor pendente cujos horários estão sendo exibidos

  useEffect(() => {
    listAdmins().then(list => setAdmins(list.map(a => a.email.toLowerCase())))
    listPendingTeachers().then(list => { setPending(list); setPendLoaded(true) })
  }, [])

  const isTeacherAdmin = (t) => admins.includes((t.email ?? '').toLowerCase())

  const currentProfile = (t) => {
    if (isTeacherAdmin(t)) return 'admin'
    return t.profile ?? 'teacher'
  }

  const teacherSegmentNames = (t) =>
    store.segments
      .filter(seg => teacherBelongsToSegment(t, seg.id, store.subjects, store.areas))
      .map(seg => seg.name)
      .join(', ') || '—'

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
                          <button className="btn btn-ghost btn-xs" title="Ver Grade" onClick={() => navigate(`/grades?teacher=${t.id}`)}>📅</button>
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

      {/* Modal: Adicionar/Editar Professor */}
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

      <ScheduleGridModal open={schedModal} onClose={() => setSchedModal(false)} teacher={schedTeacher} store={store} />
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
                  <button
                    className="btn btn-ghost btn-xs shrink-0 mt-0.5"
                    title="Ver horários informados"
                    onClick={() => setViewingHorarios(p)}
                  >
                    📅
                  </button>
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
                    <button className="btn btn-ghost btn-sm text-err" onClick={() => handleReject(p)}>Rejeitar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal: Horários informados pelo professor pendente */}
      <Modal
        open={!!viewingHorarios}
        onClose={() => setViewingHorarios(null)}
        title={viewingHorarios ? `Horários — ${viewingHorarios.name}` : ''}
        size="sm"
      >
        {viewingHorarios && (
          <div className="space-y-3">
            <p className="text-xs text-t3">Horários de entrada e saída informados no cadastro.</p>
            <div className="space-y-1">
              {DAYS.map(day => {
                const v = viewingHorarios.horariosSemana?.[day]
                return (
                  <div key={day} className="flex items-center gap-3 py-1.5 border-b border-bdr/50 last:border-0">
                    <span className="w-20 text-sm font-medium text-t1 shrink-0">{day}</span>
                    {v?.entrada && v?.saida ? (
                      <span className="text-sm text-t1">{v.entrada} – {v.saida}</span>
                    ) : (
                      <span className="text-sm text-t3">Não trabalha</span>
                    )}
                  </div>
                )
              })}
            </div>
            {(!viewingHorarios.horariosSemana || Object.keys(viewingHorarios.horariosSemana).length === 0) && (
              <p className="text-xs text-warn text-center py-2">Nenhum horário informado.</p>
            )}
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
