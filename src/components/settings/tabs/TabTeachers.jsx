// TabTeachers — CRUD de professores com filtros, modais e perfis

import { useState, useEffect, useRef } from 'react'
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
  designateLocalAdmin,
  syncTeacherRoleInUserDoc,
  getSchoolSlug,
  saveSchoolSlug,
} from '../../../lib/db'
import useSchoolStore from '../../../store/useSchoolStore'
import Modal from '../../ui/Modal'
import { ScheduleGridModal } from '../../ui/ScheduleGrid'
import GradeTurnoCard from '../../ui/GradeTurnoCard'
import ProfilePillDropdown from '../shared/ProfilePillDropdown'
import ProfileSelector from '../../ui/ProfileSelector'
import SubjectSelector from '../shared/SubjectSelector'
import { parseSlot } from '../../../lib/periods'

// ─── buildWhatsAppHref ────────────────────────────────────────────────────────

function buildWhatsAppHref(t) {
  const raw = t.whatsapp || t.celular || ''
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  const phone = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`
  return `https://api.whatsapp.com/send?phone=${phone}`
}

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

// ─── ConviteCard ──────────────────────────────────────────────────────────────

function ConviteCard() {
  const { currentSchool } = useSchoolStore()
  const slug = currentSchool?.slug
  const url  = slug ? `${window.location.origin}/join/${slug}` : null

  const handleCopy = () => {
    if (!url) return
    navigator.clipboard.writeText(url)
    toast('Link copiado!', 'ok')
  }

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="lbl !mb-0">Link de Convite</h3>
      </div>
      {url ? (
        <div className="flex items-center gap-2">
          <input
            className="inp flex-1 font-mono text-sm"
            value={url}
            readOnly
          />
          <button className="btn btn-dark btn-sm shrink-0" onClick={handleCopy}>
            Copiar link
          </button>
        </div>
      ) : (
        <p className="text-sm text-t3">Slug de convite não configurado</p>
      )}
    </div>
  )
}

// ─── SlugEditor ───────────────────────────────────────────────────────────────

const SLUG_REGEX = /^[a-z0-9-]+$/

function SlugEditor() {
  const { currentSchool, setCurrentSchool } = useSchoolStore()
  const [value,   setValue]   = useState(currentSchool?.slug ?? '')
  const [error,   setError]   = useState(null)
  const [saving,  setSaving]  = useState(false)

  const formatError = value.length > 0 && !SLUG_REGEX.test(value)
    ? 'Use apenas letras minúsculas, números e hífens'
    : null

  const isValid = value.length > 0 && SLUG_REGEX.test(value)

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    setError(null)
    try {
      const existing = await getSchoolSlug(value)
      if (existing && existing.schoolId !== currentSchool?.schoolId) {
        setError('Este slug já está em uso por outra escola')
        setSaving(false)
        return
      }
      await saveSchoolSlug(currentSchool.schoolId, value, currentSchool.slug)
      await setCurrentSchool(currentSchool.schoolId)
      toast('Slug atualizado com sucesso', 'ok')
    } catch (e) {
      console.error(e)
      toast('Erro ao salvar slug', 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-4 mb-5">
      <h3 className="lbl mb-2">Editar Slug de Convite</h3>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <input
            className="inp w-full font-mono text-sm"
            value={value}
            onChange={e => { setValue(e.target.value); setError(null) }}
            placeholder="ex: emef-central"
            disabled={saving}
          />
          {(formatError || error) && (
            <p className="text-xs text-err mt-1">{formatError ?? error}</p>
          )}
        </div>
        <button
          className="btn btn-dark btn-sm shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!isValid || saving}
          onClick={handleSave}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

// ─── TabTeachers ──────────────────────────────────────────────────────────────

export default function TabTeachers() {
  const store = useAppStore()
  const { role, isCoordinator } = useAuthStore()
  const isAdminUser = role === 'admin'
  const { currentSchoolId } = useSchoolStore()
  const navigate = useNavigate()
  const modalRef = useRef(null)
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
  const [viewingHorarios,    setViewingHorarios]    = useState(null) // professor pendente cujos horários estão sendo exibidos
  const [sortConfig,         setSortConfig]         = useState({ key: 'name', dir: 'asc' })

  useEffect(() => {
    if (!currentSchoolId) return
    listPendingTeachers(currentSchoolId).then(list => { setPending(list); setPendLoaded(true) }).catch(e => console.error('listPendingTeachers error', e))
  }, [currentSchoolId])

  // Profile do teacher = profile gravado no doc da escola.
  // 'admin' aqui significa Admin LOCAL daquela escola (não SaaS Admin global).
  const currentProfile = (t) => t.profile ?? 'teacher'

  const teacherSegmentNames = (t) =>
    store.segments
      .filter(seg => teacherBelongsToSegment(t, seg.id, store.subjects, store.areas))
      .map(seg => seg.name)
      .join(', ') || '—'

  const toggleSort = (key) => {
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }

  const sortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="text-t3 ml-1">⇅</span>
    return sortConfig.dir === 'asc'
      ? <span className="text-accent ml-1">▲</span>
      : <span className="text-accent ml-1">▼</span>
  }

  const handleApprove = async (p) => {
    await approveTeacher(currentSchoolId, p.id, store, useAppStore.setState)
    setPending(prev => prev.filter(x => x.id !== p.id))
    toast(`${p.name} aprovado`, 'ok')
  }

  const handleReject = async (p) => {
    if (!confirm(`Recusar acesso de ${p.name}?`)) return
    try {
      await rejectTeacher(currentSchoolId, p.id, useAppStore.setState)
      setPending(prev => prev.filter(x => x.id !== p.id))
      toast(`${p.name} recusado`, 'warn')
    } catch (e) {
      console.error(e)
      toast('Erro ao rejeitar professor', 'err')
    }
  }

  const handleProfileChange = async (t, newProfile) => {
    const oldProfile = currentProfile(t)
    if (newProfile === oldProfile) return

    if (newProfile === 'admin') {
      if (!confirm(`Promover ${t.name} a Admin desta escola dará acesso total à gestão da unidade. Confirmar?`)) return
    } else if (oldProfile === 'admin') {
      if (!confirm(`Remover privilégios de Admin desta escola de ${t.name}? Confirmar?`)) return
    }

    try {
      // Admin LOCAL: atualiza profile do teacher na escola E role em users/{uid}.schools[schoolId].
      // designateLocalAdmin sincroniza schools/{schoolId}.adminEmail e users/{uid}.schools[schoolId].role='admin'.
      if (newProfile === 'admin') {
        await store.updateTeacher(t.id, { profile: 'admin' })
        await designateLocalAdmin(currentSchoolId, t.email)
      } else {
        await store.updateTeacher(t.id, { profile: newProfile })
        // Sincroniza o role em users/{uid}.schools[schoolId] imediatamente
        // (sem esperar próximo login).
        await syncTeacherRoleInUserDoc(currentSchoolId, t.email, newProfile)
      }
      const LABELS = { teacher: 'Professor', coordinator: 'Coord. Geral', 'teacher-coordinator': 'Prof. Coord.', admin: 'Admin' }
      toast(`${t.name} agora é ${LABELS[newProfile] ?? newProfile}`, 'ok')
    } catch (e) {
      console.error(e)
      toast('Erro ao atualizar perfil', 'err')
    }
  }

  const STATUS_ORDER = ['admin', 'coordinator', 'teacher-coordinator', 'teacher']

  const pendingRows = [...pending]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => ({ ...p, _isPending: true }))

  const compare = (a, b) => {
    let result = 0
    if (sortConfig.key === 'name') {
      result = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    } else if (sortConfig.key === 'segment') {
      result = teacherSegmentNames(a).localeCompare(teacherSegmentNames(b), undefined, { sensitivity: 'base' })
    } else if (sortConfig.key === 'status') {
      const ia = STATUS_ORDER.indexOf(currentProfile(a))
      const ib = STATUS_ORDER.indexOf(currentProfile(b))
      result = (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    }
    return sortConfig.dir === 'desc' ? -result : result
  }

  const sortedRows = [...store.teachers.slice().sort(compare), ...pendingRows]

  const openAdd  = () => { setForm({ name: '', email: '', celular: '', subjectIds: [] }); setEditId(null); setEditingTeacher(null); setModal(true) }
  const openEdit = (t) => { setForm({ name: t.name, email: t.email ?? '', celular: t.celular ?? '', apelido: t.apelido ?? '', subjectIds: t.subjectIds ?? [] }); setEditId(t.id); setEditingTeacher(t); setModal(true) }

  const handleRemove = (t) => {
    if (!window.confirm(`Tem certeza que deseja remover ${t.name}? Esta ação não pode ser desfeita.`)) return
    store.removeTeacher(t.id)
    toast('Professor removido', 'ok')
  }

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
      {/* Seção: Link de Convite */}
      {(isAdminUser || isCoordinator()) && <ConviteCard />}
      {isAdminUser && <SlugEditor />}

      <div className="flex gap-2 mb-5 flex-wrap">
        {isAdminUser && <button className="btn btn-dark" onClick={openAdd}>+ Novo Professor</button>}

        {(isAdminUser || isCoordinator()) && pendLoaded && pending.length > 0 && (
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
                <th className="px-3 py-2.5 text-left text-xs font-bold text-t2 cursor-pointer hover:bg-surf2 select-none" onClick={() => toggleSort('name')}>Nome {sortIcon('name')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">E-mail</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">Telefone</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-t2 cursor-pointer hover:bg-surf2 select-none" onClick={() => toggleSort('segment')}>Segmento {sortIcon('segment')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-t2">Matérias</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-t2 cursor-pointer hover:bg-surf2 select-none" onClick={() => toggleSort('status')}>Status {sortIcon('status')}</th>
                <th className="px-3 py-2.5 w-[80px] text-right text-xs font-bold text-t2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(t => (
                <tr key={t.id} className={`border-b border-bdr/50 hover:bg-surf2/50 ${t._isPending ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-3 py-2.5 font-semibold text-sm">{t.name}</td>
                  <td className="px-3 py-2.5 text-xs text-t1">
                    {t.email
                      ? <a href={`mailto:${t.email}`} className="text-accent underline hover:text-accent/80">{t.email}</a>
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-t1">
                    {buildWhatsAppHref(t)
                      ? (
                        <a href={buildWhatsAppHref(t)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent underline hover:text-accent/80">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.107 1.51 5.84L.057 23.997l6.305-1.654A11.954 11.954 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.007-1.37l-.359-.214-3.743.982.999-3.648-.234-.374A9.818 9.818 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                          </svg>
                          {t.celular || '—'}
                        </a>
                      )
                      : '—'}
                  </td>
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
                      (isAdminUser || isCoordinator()) && (
                        <div className="flex gap-1">
                          <button className="btn btn-dark btn-xs" onClick={() => handleApprove(t)}>Aprovar</button>
                          <button className="btn btn-ghost btn-xs text-err" onClick={() => handleReject(t)}>✕</button>
                        </div>
                      )
                    ) : (
                      isAdminUser && (
                        <div className="flex gap-1 justify-end">
                          <button className="btn btn-ghost btn-xs" title="Editar professor" onClick={() => openEdit(t)}>✏️</button>
                          <button
                            className="btn btn-ghost btn-xs text-err"
                            title="Remover professor"
                            onClick={() => handleRemove(t)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                              <path d="M9 6V4h6v2" />
                            </svg>
                          </button>
                        </div>
                      )
                    )}
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 && (
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
      <Modal ref={modalRef} open={showPendingPanel} onClose={() => setShowPendingPanel(false)} title={`Aguardando Aprovação (${pending.length})`} size="lg">
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
                  <ProfileSelector
                    value={pendingProfiles[p.id]}
                    onChange={profile => setPendingProfiles(prev => ({ ...prev, [p.id]: profile }))}
                    containerRef={modalRef}
                  />
                  <div className="flex gap-2">
                    <button
                      className="btn btn-dark btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={!pendingProfiles[p.id]}
                      onClick={async () => {
                        const profile = pendingProfiles[p.id]
                        try {
                          await approveTeacher(currentSchoolId, p.id, store, useAppStore.setState, profile)
                          setPending(prev => prev.filter(x => x.id !== p.id))
                          setPendingProfiles(prev => { const n = { ...prev }; delete n[p.id]; return n })
                          const label = PROFILE_OPTIONS_NO_ADMIN.find(o => o.value === profile)?.label ?? profile
                          toast(`${p.name} aprovado como ${label}`, 'ok')
                        } catch (e) {
                          console.error(e)
                          toast('Erro ao aprovar professor', 'err')
                        }
                      }}
                    >
                      {pendingProfiles[p.id] ? `Aprovar como ${PROFILE_OPTIONS_NO_ADMIN.find(o => o.value === pendingProfiles[p.id])?.label}` : 'Aprovar'}
                    </button>
                    <button className="btn btn-ghost btn-sm text-err" onClick={() => handleReject(p)}>Rejeitar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal: Cadastro de aulas do professor pendente */}
      <Modal
        open={!!viewingHorarios}
        onClose={() => setViewingHorarios(null)}
        title={viewingHorarios ? `Aulas cadastradas — ${viewingHorarios.name}` : ''}
        size="lg"
      >
        {viewingHorarios && (() => {
          const pendingSchedules = store.schedules.filter(s => s.teacherId === viewingHorarios.id)
          const seen = new Set()
          const segmentTurnos = []
          for (const sched of pendingSchedules) {
            const parsed = parseSlot(sched.timeSlot)
            if (!parsed) continue
            const key = `${parsed.segmentId}|${parsed.turno}`
            if (!seen.has(key)) { seen.add(key); segmentTurnos.push(parsed) }
          }
          const order = { manha: 0, tarde: 1, noite: 2 }
          segmentTurnos.sort((a, b) => (order[a.turno] ?? 3) - (order[b.turno] ?? 3))
          if (segmentTurnos.length === 0) {
            return <p className="text-sm text-t3 text-center py-6">Nenhuma aula cadastrada.</p>
          }
          return (
            <div className="space-y-4">
              {segmentTurnos.map(({ segmentId, turno }) => (
                <GradeTurnoCard
                  key={`${segmentId}|${turno}`}
                  segmentId={segmentId}
                  turno={turno}
                  teacher={viewingHorarios}
                  store={store}
                  horariosSemana={viewingHorarios.horariosSemana ?? null}
                  readOnly
                />
              ))}
            </div>
          )
        })()}
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
