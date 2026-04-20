import { useState, useEffect } from 'react'
import useAppStore from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { DAYS } from '../../lib/constants'
import { toast } from '../../hooks/useToast'

// ─── HorarioDiaSemana (modo edição) ──────────────────────────────────────────

export function HorarioDiaSemana({ day, value, onChange }) {
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

// ─── TabelaHorarios (modo leitura — grade estilo PDF) ─────────────────────────

export function TabelaHorarios({ horariosSemana }) {
  const h = horariosSemana ?? {}
  return (
    <div className="card p-0 overflow-hidden overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-surf2 border-b border-bdr">
            <th className="px-3 py-2 text-left font-bold text-t2 w-[90px]">Horário</th>
            {DAYS.map(d => (
              <th key={d} className="px-2 py-2 text-center font-bold text-t2 min-w-[100px]">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-bdr/50">
            <td className="px-3 py-1.5 font-bold text-t2">Entrada</td>
            {DAYS.map(d => (
              <td key={d} className="px-2 py-1.5 text-center text-t1">
                {h[d]?.entrada ?? <span className="text-t3">—</span>}
              </td>
            ))}
          </tr>
          <tr>
            <td className="px-3 py-1.5 font-bold text-t2">Saída</td>
            {DAYS.map(d => (
              <td key={d} className="px-2 py-1.5 text-center text-t1">
                {h[d]?.saida ?? <span className="text-t3">—</span>}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ─── HorariosSemanaForm ───────────────────────────────────────────────────────

export function HorariosSemanaForm({ value, onChange, onSave, onCancel, saving }) {
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

export function SecaoHorarios({ teacher, isEditable }) {
  const store = useAppStore()
  const { teacher: myTeacher } = useAuthStore()
  const [editando, setEditando] = useState(false)
  const [horariosSemana, setHorariosSemana] = useState(teacher?.horariosSemana ?? {})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEditando(false)
    setHorariosSemana(teacher?.horariosSemana ?? {})
  }, [teacher?.id])

  const teacherHorarios = teacher?.horariosSemana ?? {}

  const handleSave = async () => {
    setSaving(true)
    const cleaned = Object.fromEntries(
      Object.entries(horariosSemana).filter(([, v]) => v?.entrada && v?.saida)
    )
    try {
      const authState = useAuthStore.getState()
      const isSelf = myTeacher?.id === teacher.id
      if (isSelf && authState.role === 'teacher') {
        await store.updateTeacherProfile(teacher.id, { horariosSemana: cleaned })
      } else {
        await store.updateTeacher(teacher.id, { horariosSemana: cleaned })
      }
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
    <div className="space-y-2 pb-2 border-b border-bdr">
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
        <TabelaHorarios horariosSemana={teacherHorarios} />
      )}
    </div>
  )
}
