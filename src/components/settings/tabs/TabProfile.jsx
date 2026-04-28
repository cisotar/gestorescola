// TabProfile — edição de perfil pessoal + histórico de solicitações

import { useState, useEffect } from 'react'
import useAppStore from '../../../store/useAppStore'
import useAuthStore from '../../../store/useAuthStore'
import useSchoolStore from '../../../store/useSchoolStore'
import { toast } from '../../../hooks/useToast'
import { DAYS } from '../../../lib/constants'
import { calcSubjectChange, myTimeAgo, STATUS_BADGE } from '../../../lib/settings'
import { getMyPendingActions } from '../../../lib/db'
import { ScheduleGridModal } from '../../ui/ScheduleGrid'
import SubjectSelector from '../shared/SubjectSelector'
import Spinner from '../../ui/Spinner'

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

function SecaoHorarios({ teacher, isEditable }) {
  const store = useAppStore()
  const [editando, setEditando] = useState(false)
  const [horariosSemana, setHorariosSemana] = useState(teacher?.horariosSemana ?? {})
  const [saving, setSaving] = useState(false)
  const teacherHorarios = teacher?.horariosSemana ?? {}

  const handleSave = async () => {
    setSaving(true)
    try {
      await store.updateTeacherProfile(teacher.id, { horariosSemana })
      toast('Horários salvos com sucesso', 'ok')
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

// ─── MyRequestsSection ────────────────────────────────────────────────────────

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

// ─── TabProfile ───────────────────────────────────────────────────────────────

export default function TabProfile({ teacher }) {
  const store = useAppStore()
  const { teacher: authTeacher, isCoordinator, loading } = useAuthStore()
  const schoolId = useSchoolStore(s => s.currentSchoolId)
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
      const actions = await getMyPendingActions(schoolId, t.id)
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

  if (loading) return (
    <div className="flex items-center gap-2 text-t3 text-sm">
      <Spinner size={16} />
      <span>Carregando perfil...</span>
    </div>
  )
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

      <SecaoHorarios teacher={t} isEditable={true} />

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
