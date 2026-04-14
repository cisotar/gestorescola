import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { allTurmaObjects, findTurma, parseDate, colorOfTeacher, teacherSubjectNames,
         businessDaysBetween, dateToDayLabel, formatISO, weekStart, formatBR } from '../lib/helpers'
import { slotLabel, getAulas } from '../lib/periods'
import {
  openPDF,
  generateSubstitutionTimesheetHTML,
  generateSubstitutionBalanceHTML,
  generateSubstitutionRankingHTML,
} from '../lib/reports'
import { toast } from '../hooks/useToast'
import Modal from '../components/ui/Modal'

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── computeAbsenceSlots (helper) ─────────────────────────────────────────────
// Aplica os mesmos filtros do `absenceCountByTeacher` e retorna os slots reais
// para um determinado professor. Usado on-demand no handler do botão "Extrato".
function computeAbsenceSlots(teacherId, filters, store) {
  const { selSegment, selTurma, filterMonth, filterYear } = filters
  const out = []
  for (const ab of (store.absences ?? [])) {
    if (ab.teacherId !== teacherId) continue
    for (const sl of (ab.slots ?? [])) {
      if (selSegment) {
        const turmaObj = findTurma(sl.turma, store.segments)
        if (!turmaObj || turmaObj.segmentId !== selSegment) continue
      }
      if (selTurma && sl.turma !== selTurma) continue
      if (sl.date) {
        const d = parseDate(sl.date)
        if (d.getMonth() !== filterMonth || d.getFullYear() !== filterYear) continue
      }
      out.push({ ...sl, teacherId: ab.teacherId, absenceId: ab.id })
    }
  }
  return out
}

// ─── SubFilterToolbar ──────────────────────────────────────────────────────────

function SubFilterToolbar({ store, isAdmin,
  selSubstitute, setSelSubstitute,
  selSegment, setSelSegment,
  selTurma, setSelTurma,
  filterMonth, setFilterMonth,
  filterYear, setFilterYear,
}) {
  const turmas = selSegment
    ? allTurmaObjects(store.segments).filter(t => t.segmentId === selSegment)
    : []
  const sortedTeachers = [...store.teachers].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex gap-3 flex-wrap items-end mb-5">
      {isAdmin && (
        <div>
          <label className="lbl">Substituto</label>
          <select
            className="inp"
            value={selSubstitute ?? ''}
            onChange={e => setSelSubstitute(e.target.value || null)}
          >
            <option value="">Todos</option>
            {sortedTeachers.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="lbl">Segmento</label>
        <select
          className="inp"
          value={selSegment ?? ''}
          onChange={e => { setSelSegment(e.target.value || null); setSelTurma(null) }}
        >
          <option value="">Todos</option>
          {store.segments.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      {selSegment && (
        <div>
          <label className="lbl">Turma</label>
          <select
            className="inp"
            value={selTurma ?? ''}
            onChange={e => setSelTurma(e.target.value || null)}
          >
            <option value="">Todas</option>
            {turmas.map(t => (
              <option key={t.label} value={t.label}>{t.label}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="lbl">Mês</label>
        <select
          className="inp"
          value={filterMonth}
          onChange={e => setFilterMonth(Number(e.target.value))}
        >
          {MONTH_NAMES.map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="lbl">Ano</label>
        <input
          className="inp w-24"
          type="number"
          value={filterYear}
          onChange={e => setFilterYear(Number(e.target.value))}
        />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubstitutionsPage() {
  const navigate          = useNavigate()
  const store             = useAppStore()
  const { role, teacher } = useAuthStore()
  const isAdmin           = role === 'admin'

  // Load absences on mount
  useEffect(() => {
    store.loadAbsencesIfNeeded()
  }, [store])

  // Filtros globais
  const [selSubstitute, setSelSubstitute] = useState(isAdmin ? null : (teacher?.id ?? null))
  const [selSegment,    setSelSegment]    = useState(null)
  const [selTurma,      setSelTurma]      = useState(null)
  const [filterMonth,   setFilterMonth]   = useState(new Date().getMonth())
  const [filterYear,    setFilterYear]    = useState(new Date().getFullYear())

  // Tab ativa
  const [mode, setMode] = useState('substitute')

  // Seleção em lote
  const [selectedIds,   setSelectedIds]   = useState(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [undoBuffer,    setUndoBuffer]    = useState(null)
  const [undoTimer,     setUndoTimer]     = useState(null)

  const onToggle = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const onSelectAll   = (slots) => setSelectedIds(new Set(slots.map(sl => sl.id)))
  const onClearAll    = () => setSelectedIds(new Set())
  const onSelectFaltas = (slots) => setSelectedIds(new Set(slots.filter(sl => !sl.substituteId).map(sl => sl.id)))
  const onSelectSubs  = (slots) => setSelectedIds(new Set(slots.filter(sl => sl.substituteId).map(sl => sl.id)))

  const handleBulkDelete = () => {
    const count = selectedIds.size
    if (!count) return
    const snapshot = store.absences
    store.deleteManySlots(selectedIds)
    setSelectedIds(new Set())
    setSelectionMode(false)
    setUndoBuffer({ absences: snapshot, count })
    toast(`${count} substituição${count !== 1 ? 'ões' : ''} removida${count !== 1 ? 's' : ''}`, 'warn')
    const t = setTimeout(() => setUndoBuffer(null), 5000)
    setUndoTimer(t)
  }

  const handleUndo = () => {
    if (!undoBuffer) return
    store.restoreAbsences(undoBuffer.absences)
    clearTimeout(undoTimer)
    setUndoBuffer(null)
    toast('Exclusão desfeita', 'ok')
  }

  const selProps = { selectedIds, selectionMode, setSelectionMode, onToggle, onSelectAll, onClearAll, onSelectFaltas, onSelectSubs }

  const handleTabChange = (id) => {
    setMode(id)
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  // Todos os slots que possuem substituição
  const allSubSlots = useMemo(() =>
    (store.absences ?? []).flatMap(ab =>
      ab.slots
        .filter(sl => sl.substituteId)
        .map(sl => ({ ...sl, teacherId: ab.teacherId, absenceId: ab.id }))
    ), [store.absences]
  )

  // Slots filtrados pelos filtros globais
  const filteredSlots = useMemo(() => {
    return allSubSlots.filter(sl => {
      if (selSubstitute && sl.substituteId !== selSubstitute) return false
      if (selSegment) {
        const turmaObj = findTurma(sl.turma, store.segments)
        if (!turmaObj || turmaObj.segmentId !== selSegment) return false
      }
      if (selTurma && sl.turma !== selTurma) return false
      if (sl.date) {
        const d = parseDate(sl.date)
        if (d.getMonth() !== filterMonth || d.getFullYear() !== filterYear) return false
      }
      return true
    })
  }, [allSubSlots, selSubstitute, selSegment, selTurma, filterMonth, filterYear, store.segments])

  // Slots filtrados SEM o filtro de substituto (usado pelo ViewBySubstitute
  // para calcular `covered` de cada professor mesmo quando nenhum substituto
  // está selecionado no filtro global).
  const filteredSlotsAllSubs = useMemo(() => {
    return allSubSlots.filter(sl => {
      if (selSegment) {
        const turmaObj = findTurma(sl.turma, store.segments)
        if (!turmaObj || turmaObj.segmentId !== selSegment) return false
      }
      if (selTurma && sl.turma !== selTurma) return false
      if (sl.date) {
        const d = parseDate(sl.date)
        if (d.getMonth() !== filterMonth || d.getFullYear() !== filterYear) return false
      }
      return true
    })
  }, [allSubSlots, selSegment, selTurma, filterMonth, filterYear, store.segments])

  // Contagem de faltas (todos os slots de ausência, substituído ou não)
  // por professor, aplicando os mesmos filtros de período/segmento/turma
  // do restante da página. O saldo é, portanto, escopado ao recorte visível.
  const absenceCountByTeacher = useMemo(() => {
    const map = new Map()
    for (const ab of (store.absences ?? [])) {
      for (const sl of (ab.slots ?? [])) {
        if (selSegment) {
          const turmaObj = findTurma(sl.turma, store.segments)
          if (!turmaObj || turmaObj.segmentId !== selSegment) continue
        }
        if (selTurma && sl.turma !== selTurma) continue
        if (sl.date) {
          const d = parseDate(sl.date)
          if (d.getMonth() !== filterMonth || d.getFullYear() !== filterYear) continue
        }
        map.set(ab.teacherId, (map.get(ab.teacherId) ?? 0) + 1)
      }
    }
    return map
  }, [store.absences, store.segments, selSegment, selTurma, filterMonth, filterYear])

  const tabs = [
    { id: 'substitute', label: '👤 Substituto' },
    { id: 'day',        label: '📅 Dia' },
    { id: 'week',       label: '🗓 Semana' },
    { id: 'month',      label: '📆 Mês' },
  ]

  const filterProps = {
    store, isAdmin,
    selSubstitute, setSelSubstitute,
    selSegment, setSelSegment,
    selTurma, setSelTurma,
    filterMonth, setFilterMonth,
    filterYear, setFilterYear,
  }

  return (
    <div className={selectedIds.size > 0 || undoBuffer ? 'pb-16' : ''}>
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">Relatório de Substituições</h1>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-4">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border
              ${mode === t.id ? 'bg-navy text-white border-navy' : 'bg-surf text-t2 border-bdr hover:border-t3'}`}
          >{t.label}</button>
        ))}
        {mode === 'month' && (
          <button
            onClick={() => navigate('/substitutions/ranking')}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold border bg-surf text-t2 border-bdr hover:border-t3 transition-colors ml-auto"
          >
            🏆 Ranking
          </button>
        )}
      </div>

      <SubFilterToolbar {...filterProps} />

      {mode === 'substitute' && (
        <ViewBySubstitute
          store={store}
          isAdmin={isAdmin}
          filteredSlots={filteredSlots}
          filteredSlotsAllSubs={filteredSlotsAllSubs}
          absenceCountByTeacher={absenceCountByTeacher}
          selSubstitute={selSubstitute}
          filterMonth={filterMonth}
          filterYear={filterYear}
          filters={{ selSegment, selTurma, filterMonth, filterYear }}
          selProps={selProps}
        />
      )}
      {mode === 'day'        && <ViewByDay        store={store} isAdmin={isAdmin} filteredSlots={filteredSlots} selProps={selProps} />}
      {mode === 'week'       && <ViewByWeek       store={store} isAdmin={isAdmin} filteredSlots={filteredSlots} selProps={selProps} />}
      {mode === 'month'      && <ViewByMonth      store={store} isAdmin={isAdmin} filteredSlots={filteredSlots} selProps={selProps} />}

      {undoBuffer
        ? <UndoBar count={undoBuffer.count} onUndo={handleUndo} />
        : <BulkActionBar count={selectedIds.size} onDelete={handleBulkDelete} onClear={onClearAll} />
      }
    </div>
  )
}

// ─── SelectionToolbar ─────────────────────────────────────────────────────────

function SelectionToolbar({ isAdmin, selectionMode, setSelectionMode, visibleSlots, onSelectAll, onClearAll, onSelectFaltas, onSelectSubs }) {
  if (!isAdmin) return null
  return (
    <div className="flex gap-2 flex-wrap items-center mb-3">
      <button
        className={`btn btn-xs ${selectionMode ? 'btn-dark' : 'btn-ghost'}`}
        onClick={() => { setSelectionMode(v => !v); onClearAll() }}
      >
        {selectionMode ? '✕ Cancelar' : '☑ Selecionar'}
      </button>
      {selectionMode && (
        <>
          <button className="btn btn-ghost btn-xs" onClick={() => onSelectAll(visibleSlots)}>Selecionar tudo</button>
          <button className="btn btn-ghost btn-xs" onClick={onClearAll}>Desmarcar tudo</button>
          <button className="btn btn-ghost btn-xs" onClick={() => onSelectFaltas(visibleSlots)}>Só faltas</button>
          <button className="btn btn-ghost btn-xs" onClick={() => onSelectSubs(visibleSlots)}>Só substituições</button>
        </>
      )}
    </div>
  )
}

// ─── BulkActionBar ────────────────────────────────────────────────────────────

function BulkActionBar({ count, onDelete, onClear }) {
  if (count === 0) return null
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-navy text-white px-5 py-3 flex items-center gap-3 shadow-2xl">
      <span className="text-sm font-semibold flex-1">{count} substituição{count !== 1 ? 'ões' : ''} selecionada{count !== 1 ? 's' : ''}</span>
      <button className="btn btn-ghost btn-sm text-white border-white/30 hover:border-white" onClick={onClear}>Desmarcar tudo</button>
      <button className="btn btn-sm bg-err text-white border-err hover:bg-red-700" onClick={onDelete}>Excluir selecionadas</button>
    </div>
  )
}

// ─── UndoBar ──────────────────────────────────────────────────────────────────

function UndoBar({ count, onUndo }) {
  if (!count) return null
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-amber-700 text-white px-5 py-3 flex items-center gap-3 shadow-2xl">
      <span className="text-sm font-semibold flex-1">{count} substituição{count !== 1 ? 'ões' : ''} removida{count !== 1 ? 's' : ''}</span>
      <button className="btn btn-sm bg-white text-amber-800 border-white hover:bg-amber-50" onClick={onUndo}>Desfazer</button>
    </div>
  )
}

// ─── SubSlotRow ───────────────────────────────────────────────────────────────

function SubSlotRow({ sl, store, isAdmin = false, selectionMode = false, isSelected = false, onToggle }) {
  const { deleteAbsenceSlot } = useAppStore()
  const subj    = store.subjects.find(s => s.id === sl.subjectId)
  const absent  = store.teachers.find(t => t.id === sl.teacherId)
  const parts   = sl.timeSlot?.split('|') ?? []
  const aula    = parts.length >= 3
    ? getAulas(parts[0], parts[1], store.periodConfigs).find(p => p.aulaIdx === Number(parts[2]))
    : null

  return (
    <div
      className={`flex items-center gap-3 py-2.5 border-b border-bdr/60 last:border-0 transition-colors
        ${isSelected ? 'bg-accent-l' : ''}`}
    >
      {selectionMode && isAdmin && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle?.(sl.id)}
          className="shrink-0 w-4 h-4 accent-accent cursor-pointer"
        />
      )}
      {sl.date && (
        <div className="min-w-[52px] text-[11px] text-t3 font-mono shrink-0">
          {formatBR(sl.date)}
        </div>
      )}
      <div className="min-w-[68px] font-mono text-[11px] text-t1 shrink-0">
        <div className="font-bold">{aula?.label ?? slotLabel(sl.timeSlot, store.periodConfigs)}</div>
        <div className="text-t3 text-[10px]">{aula?.inicio ?? ''}–{aula?.fim ?? ''}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{sl.turma}</div>
        <div className="text-xs text-t2 truncate">{subj?.name ?? '—'}</div>
      </div>
      <div className="text-right min-w-[110px] shrink-0">
        <div className="text-xs font-bold text-t1">{absent?.name ?? '—'}</div>
        <div className="text-[10px] text-t3">professor ausente</div>
      </div>
      {isAdmin && !selectionMode && (
        <button
          onClick={() => { deleteAbsenceSlot(sl.absenceId, sl.id); toast('Substituição removida', 'ok') }}
          className="text-t3 hover:text-err transition-colors text-sm shrink-0"
          title="Remover"
        >✕</button>
      )}
    </div>
  )
}

// ─── WhatsAppButton ──────────────────────────────────────────────────────────

function WhatsAppButton({ message }) {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState(() => localStorage.getItem('gestao_whatsapp_phone') ?? '')
  const handleSend = () => {
    const digits = phone.replace(/\D/g, '')
    localStorage.setItem('gestao_whatsapp_phone', digits)
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank')
    setOpen(false)
  }
  return (
    <>
      <button className="btn btn-ghost btn-xs shrink-0" onClick={() => setOpen(true)}>📱 WhatsApp</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Enviar por WhatsApp">
        <div className="space-y-4">
          <div>
            <label className="lbl">Número WhatsApp</label>
            <input className="inp" type="tel" placeholder="55 11 99999-9999" value={phone}
              onChange={e => setPhone(e.target.value)} />
            <p className="text-xs text-t3 mt-1">Incluir código do país. Ex: 5511999999999</p>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn btn-dark" onClick={handleSend} disabled={!phone.replace(/\D/g, '')}>
              Abrir WhatsApp
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ─── ViewBySubstitute (master-detail) ────────────────────────────────────────

function ViewBySubstitute({
  store,
  isAdmin,
  filteredSlotsAllSubs,
  absenceCountByTeacher,
  selSubstitute,
  filters,
  selProps,
}) {
  const { selectedIds, selectionMode, setSelectionMode, onToggle, onSelectAll, onClearAll, onSelectFaltas, onSelectSubs } = selProps
  const [selTeacher, setSelTeacher] = useState(selSubstitute)
  const [filter, setFilter]         = useState('all')
  const [filterDate, setFilterDate] = useState(formatISO(new Date()))
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth())
  const [filterYear, setFilterYear]   = useState(new Date().getFullYear())

  const withSubs = useMemo(() => {
    const ids = selSubstitute
      ? [selSubstitute]
      : [...new Set(filteredSlotsAllSubs.map(sl => sl.substituteId))]
    return ids
      .map(id => store.teachers.find(t => t.id === id))
      .filter(Boolean)
      .map(t => ({
        teacher: t,
        count: filteredSlotsAllSubs.filter(sl => sl.substituteId === t.id).length,
      }))
      .filter(({ count }) => count > 0)
      .sort((a, b) => a.teacher.name.localeCompare(b.teacher.name))
  }, [filteredSlotsAllSubs, selSubstitute, store.teachers])

  const buildFilter = () => {
    if (filter === 'all')   return { type: 'all' }
    if (filter === 'day')   return { type: 'day', date: filterDate }
    if (filter === 'month') return { type: 'month', year: filterYear, month: filterMonth }
    if (filter === 'week') {
      const ws = weekStart(filterDate)
      const we = (() => { const d = parseDate(ws); d.setDate(d.getDate() + 4); return formatISO(d) })()
      return { type: 'week', weekStart: ws, weekEnd: we }
    }
    return null
  }

  const detail = selTeacher ? (() => {
    const teacher = store.teachers.find(t => t.id === selTeacher)
    if (!teacher) return null
    const f = buildFilter()
    const allTeacherSlots = filteredSlotsAllSubs.filter(sl => sl.substituteId === selTeacher)
    const slots = allTeacherSlots.filter(sl => {
      if (!f || f.type === 'all') return true
      if (f.type === 'day')   return sl.date === f.date
      if (f.type === 'week')  return sl.date >= f.weekStart && sl.date <= f.weekEnd
      if (f.type === 'month') {
        const d = parseDate(sl.date)
        return d.getFullYear() === f.year && d.getMonth() === f.month
      }
      return true
    })
    const byDate = {}
    slots.forEach(sl => { if (!byDate[sl.date]) byDate[sl.date] = []; byDate[sl.date].push(sl) })
    const covered = allTeacherSlots.length
    const absenceCount = absenceCountByTeacher.get(teacher.id) ?? 0
    const balance = covered - absenceCount
    return { teacher, byDate, total: slots.length, slots, covered, absenceCount, balance }
  })() : null

  const handleTimesheetPDF = () => {
    if (!detail) return
    openPDF(generateSubstitutionTimesheetHTML(detail.teacher, detail.slots, store))
  }

  const handleBalancePDF = () => {
    if (!detail) return
    const absenceSlots = computeAbsenceSlots(detail.teacher.id, filters, store)
    openPDF(generateSubstitutionBalanceHTML(detail.teacher, detail.slots, absenceSlots, store))
  }

  const buildWhatsAppMsg = () => {
    if (!detail) return ''
    const { teacher, slots, covered, balance } = detail
    const periodLabel = filter === 'day' ? formatBR(filterDate)
      : filter === 'week' ? (() => { const ws = weekStart(filterDate); const d = parseDate(ws); d.setDate(d.getDate() + 4); return `${formatBR(ws)} – ${formatBR(formatISO(d))}` })()
      : filter === 'month' ? `${MONTH_NAMES[filterMonth]} ${filterYear}`
      : 'Todos os registros'
    let msg = `*Substituições — ${teacher.name}*\nPeríodo: ${periodLabel}\nTotal: ${covered} coberturas | Saldo: ${balance >= 0 ? '+' : ''}${balance}\n`
    slots.forEach(sl => {
      const absent = store.teachers.find(t => t.id === sl.teacherId)
      msg += `\n• ${formatBR(sl.date)} — ${slotLabel(sl.timeSlot, store.periodConfigs)} — ${sl.turma} (cobriu ${absent?.name ?? '—'})`
    })
    return msg
  }

  if (withSubs.length === 0) {
    return (
      <div className="card text-center py-8">
        <div className="text-3xl mb-2">✅</div>
        <div className="text-sm font-bold text-t2">Nenhuma substituição no período</div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
      {/* Sidebar */}
      <div>
        <div className="text-[11px] font-bold text-t2 uppercase tracking-wide mb-2">
          {withSubs.length} substituto{withSubs.length !== 1 ? 's' : ''} no período
        </div>
        <div className="space-y-1.5 max-h-[65vh] overflow-y-auto scroll-thin pr-1">
          {withSubs.map(({ teacher: t, count }) => {
            const cv = colorOfTeacher(t, store)
            return (
              <button key={t.id} onClick={() => setSelTeacher(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all
                  ${selTeacher === t.id ? 'border-navy bg-surf' : 'border-bdr bg-surf hover:border-t3'}`}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: cv.tg, color: cv.tx }}>{t.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{t.name}</div>
                  <div className="text-[11px] text-t3">{count} cobertura{count !== 1 ? 's' : ''}</div>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: cv.tg, color: cv.tx }}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Painel central */}
      <div>
        {!detail ? (
          <div className="flex items-center justify-center h-48 text-t3">
            <div className="text-center">
              <div className="text-4xl mb-2">👤</div>
              <div className="text-sm">Selecione um professor</div>
            </div>
          </div>
        ) : (() => {
          const { teacher, byDate, total, covered, balance } = detail
          const cv = colorOfTeacher(teacher, store)
          const balanceClass = balance >= 0 ? 'text-ok' : 'text-err'
          const balanceLabel = balance >= 0 ? `+${balance}` : `${balance}`
          return (
            <div>
              {/* Cabeçalho do professor */}
              <div className="flex items-start gap-3 p-4 rounded-xl border-2 mb-3"
                style={{ background: cv.bg, borderColor: cv.bd }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-extrabold shrink-0"
                  style={{ background: cv.tg, color: cv.tx }}>{teacher.name.charAt(0)}</div>
                <div className="flex-1">
                  <div className="font-extrabold text-base" style={{ color: cv.tx }}>{teacher.name}</div>
                  <div className="text-xs opacity-70" style={{ color: cv.tx }}>{teacherSubjectNames(teacher, store.subjects) || '—'}</div>
                  <div className="flex gap-2 mt-1.5">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-surf border border-bdr text-t1">
                      {covered} coberta{covered !== 1 ? 's' : ''}
                    </span>
                    <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-surf border border-bdr ${balanceClass}`}>
                      saldo {balanceLabel}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                  <button onClick={handleTimesheetPDF} className="btn btn-ghost btn-xs">📄 Folha de Ponto</button>
                  <button onClick={handleBalancePDF} className="btn btn-ghost btn-xs">📄 Extrato</button>
                  <WhatsAppButton message={buildWhatsAppMsg()} />
                </div>
              </div>

              {/* Filtros temporais internos */}
              <div className="flex gap-2 flex-wrap mb-4 items-center">
                {['all','day','week','month'].map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`btn btn-xs ${filter === f ? 'btn-dark' : 'btn-ghost'}`}>
                    {f === 'all' ? 'Todos' : f === 'day' ? 'Por Dia' : f === 'week' ? 'Por Semana' : 'Por Mês'}
                  </button>
                ))}
                {filter === 'day' && (
                  <input type="date" className="inp !w-auto py-1 text-xs" value={filterDate}
                    onChange={e => setFilterDate(e.target.value)} />
                )}
                {filter === 'week' && (
                  <input type="date" className="inp !w-auto py-1 text-xs" value={filterDate}
                    onChange={e => setFilterDate(e.target.value)} />
                )}
                {filter === 'month' && (
                  <div className="flex gap-1.5 flex-wrap">
                    {MONTH_NAMES.map((m, i) => (
                      <button key={i} onClick={() => setFilterMonth(i)}
                        className={`btn btn-xs ${filterMonth === i ? 'btn-dark' : 'btn-ghost'}`}>{m.slice(0,3)}</button>
                    ))}
                    <input type="number" className="inp !w-20 py-1 text-xs" value={filterYear}
                      onChange={e => setFilterYear(Number(e.target.value))} />
                  </div>
                )}
                <span className="text-xs text-t3 ml-1">{total} aula{total !== 1 ? 's' : ''}</span>
              </div>

              <SelectionToolbar isAdmin={isAdmin} selectionMode={selectionMode} setSelectionMode={setSelectionMode}
                visibleSlots={detail.slots} onSelectAll={onSelectAll} onClearAll={onClearAll} onSelectFaltas={onSelectFaltas} onSelectSubs={onSelectSubs} />

              {/* Lista de registros agrupados por data */}
              {Object.keys(byDate).length === 0 ? (
                <div className="card text-center py-8">
                  <div className="text-2xl mb-2">✅</div>
                  <div className="text-sm text-t2">Nenhuma substituição no período selecionado</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.keys(byDate).sort().map(date => {
                    const dateSlots = byDate[date]
                    return (
                      <div key={date} className="card">
                        <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-bdr">
                          <div>
                            <div className="font-bold text-sm">{dateToDayLabel(date)}</div>
                            <div className="font-mono text-xs text-t2">{formatBR(date)}</div>
                          </div>
                          <div className="text-xs font-bold text-ok">
                            {dateSlots.length} cobertura{dateSlots.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        {dateSlots.map(sl => (
                          <SubSlotRow key={sl.id} sl={sl} store={store} isAdmin={isAdmin}
                            selectionMode={selectionMode} isSelected={selectedIds.has(sl.id)} onToggle={onToggle} />
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ─── Shared helper ───────────────────────────────────────────────────────────

function groupBySubstitute(slots, store) {
  const map = new Map()
  for (const sl of slots) {
    if (!map.has(sl.substituteId)) map.set(sl.substituteId, [])
    map.get(sl.substituteId).push(sl)
  }
  return [...map.entries()]
    .map(([id, ss]) => ({ teacher: store.teachers.find(t => t.id === id), slots: ss }))
    .filter(g => g.teacher)
    .sort((a, b) => a.teacher.name.localeCompare(b.teacher.name))
}

// ─── ViewByDay helpers ────────────────────────────────────────────────────────

function initialDate() {
  const today = new Date()
  const day = today.getDay()
  if (day === 0) today.setDate(today.getDate() + 1)
  else if (day === 6) today.setDate(today.getDate() + 2)
  return formatISO(today)
}

function prevBusinessDay(iso) {
  const d = parseDate(iso)
  do { d.setDate(d.getDate() - 1) } while (d.getDay() === 0 || d.getDay() === 6)
  return formatISO(d)
}

function nextBusinessDay(iso) {
  const d = parseDate(iso)
  do { d.setDate(d.getDate() + 1) } while (d.getDay() === 0 || d.getDay() === 6)
  return formatISO(d)
}

// ─── ViewByDay ────────────────────────────────────────────────────────────────

function ViewByDay({ store, isAdmin, filteredSlots, selProps }) {
  const { selectedIds, selectionMode, setSelectionMode, onToggle, onSelectAll, onClearAll, onSelectFaltas, onSelectSubs } = selProps
  const [selDate, setSelDate] = useState(() => initialDate())

  const daySlots = useMemo(
    () => filteredSlots.filter(sl => sl.date === selDate),
    [filteredSlots, selDate]
  )

  const recentDates = useMemo(
    () => [...new Set(filteredSlots.map(sl => sl.date))].sort().reverse().slice(0, 10),
    [filteredSlots]
  )

  const grouped = useMemo(() => groupBySubstitute(daySlots, store), [daySlots, store.teachers])

  const handlePDF = () => {
    openPDF(generateSubstitutionTimesheetHTML(null, daySlots, store))
  }

  const buildWhatsAppMsg = () => {
    let msg = `*Substituições — ${dateToDayLabel(selDate) ?? ''}, ${formatBR(selDate)}*\n`
    msg += `Total: ${daySlots.length} cobertura${daySlots.length !== 1 ? 's' : ''}\n`
    grouped.forEach(({ teacher, slots }) => {
      msg += `\n*${teacher.name}* (${slots.length}):`
      slots.forEach(sl => {
        const absent = store.teachers.find(t => t.id === sl.teacherId)
        msg += `\n  • ${slotLabel(sl.timeSlot, store.periodConfigs)} — ${sl.turma} (cobriu ${absent?.name ?? '—'})`
      })
    })
    return msg
  }

  return (
    <div>
      {/* Controles */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button className="btn btn-ghost btn-sm" onClick={() => setSelDate(prevBusinessDay(selDate))}>◀</button>
        <div className="text-sm font-bold text-t1 min-w-[160px] text-center">
          {dateToDayLabel(selDate) ?? 'Fim de semana'}, {formatBR(selDate)}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setSelDate(nextBusinessDay(selDate))}>▶</button>
        <button className="btn btn-ghost btn-xs" onClick={() => setSelDate(initialDate())}>Hoje</button>
        <input type="date" className="inp !w-auto py-1 text-xs ml-2" value={selDate}
          onChange={e => e.target.value && setSelDate(e.target.value)} />
        {daySlots.length > 0 && (
          <>
            <button onClick={handlePDF} className="btn btn-ghost btn-sm ml-auto">📄 PDF</button>
            <WhatsAppButton message={buildWhatsAppMsg()} />
          </>
        )}
      </div>

      {/* Pills rápidos */}
      {recentDates.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-4">
          <span className="text-[11px] font-bold text-t3 uppercase tracking-wider self-center mr-1">Datas:</span>
          {recentDates.map(d => (
            <button key={d} onClick={() => setSelDate(d)}
              className={`btn btn-xs ${d === selDate ? 'btn-dark' : 'btn-ghost'}`}>
              {formatBR(d)}
            </button>
          ))}
        </div>
      )}

      <SelectionToolbar isAdmin={isAdmin} selectionMode={selectionMode} setSelectionMode={setSelectionMode}
        visibleSlots={daySlots} onSelectAll={onSelectAll} onClearAll={onClearAll} onSelectFaltas={onSelectFaltas} onSelectSubs={onSelectSubs} />

      {/* Conteúdo */}
      {daySlots.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-sm font-bold text-t2">
            Nenhuma substituição em {formatBR(selDate)}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ teacher, slots }) => {
            const cv = colorOfTeacher(teacher, store)
            return (
              <div key={teacher.id} className="card">
                <div className="flex items-center gap-3 mb-3 pb-2.5 border-b border-bdr">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ background: cv.tg, color: cv.tx }}>{teacher.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{teacher.name}</div>
                    <div className="text-[11px] text-t3">{teacherSubjectNames(teacher, store.subjects) || '—'}</div>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: cv.tg, color: cv.tx }}>
                    {slots.length} coberta{slots.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {slots.map(sl => (
                  <SubSlotRow key={sl.id} sl={sl} store={store} isAdmin={isAdmin}
                    selectionMode={selectionMode} isSelected={selectedIds.has(sl.id)} onToggle={onToggle} />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── ViewByWeek ───────────────────────────────────────────────────────────────

function ViewByWeek({ store, isAdmin, filteredSlots, selProps }) {
  const { selectedIds, selectionMode, setSelectionMode, onToggle, onSelectAll, onClearAll, onSelectFaltas, onSelectSubs } = selProps
  const [weekRef, setWeekRef] = useState(() => weekStart(formatISO(new Date())))
  const [filterSub, setFilterSub] = useState('')

  const monISO  = weekRef
  const monDate = parseDate(monISO)
  const friDate = new Date(monDate); friDate.setDate(monDate.getDate() + 4)
  const friISO  = formatISO(friDate)
  const label   = `${formatBR(monISO)} – ${formatBR(friISO)}`

  const prev = () => { const d = parseDate(monISO); d.setDate(d.getDate() - 7); setWeekRef(formatISO(d)) }
  const next = () => { const d = parseDate(monISO); d.setDate(d.getDate() + 7); setWeekRef(formatISO(d)) }

  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monDate); d.setDate(monDate.getDate() + i); return formatISO(d)
  }), [monISO])

  const weekSlots = useMemo(
    () => filteredSlots
      .filter(sl => sl.date >= monISO && sl.date <= friISO)
      .filter(sl => !filterSub || sl.substituteId === filterSub),
    [filteredSlots, monISO, friISO, filterSub]
  )

  const subsThisWeek = useMemo(() => {
    const ids = [...new Set(filteredSlots.filter(sl => sl.date >= monISO && sl.date <= friISO).map(sl => sl.substituteId))]
    return ids.map(id => store.teachers.find(t => t.id === id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
  }, [filteredSlots, monISO, friISO, store.teachers])

  const handlePDF = () => openPDF(generateSubstitutionTimesheetHTML(null, weekSlots, store))

  const buildWhatsAppMsg = () => {
    let msg = `*Substituições — Semana ${label}*\n`
    msg += `Total: ${weekSlots.length} cobertura${weekSlots.length !== 1 ? 's' : ''}\n`
    days.forEach(date => {
      const daySlots = weekSlots.filter(sl => sl.date === date)
      if (!daySlots.length) return
      msg += `\n*${dateToDayLabel(date)}, ${formatBR(date)}*`
      const grouped = groupBySubstitute(daySlots, store)
      grouped.forEach(({ teacher, slots }) => {
        msg += `\n  *${teacher.name}* (${slots.length}):`
        slots.forEach(sl => {
          const absent = store.teachers.find(t => t.id === sl.teacherId)
          msg += `\n    • ${slotLabel(sl.timeSlot, store.periodConfigs)} — ${sl.turma} (cobriu ${absent?.name ?? '—'})`
        })
      })
    })
    return msg
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button className="btn btn-ghost btn-sm" onClick={prev}>◀</button>
        <div className="font-bold text-sm min-w-[200px] text-center">{label}</div>
        <button className="btn btn-ghost btn-sm" onClick={next}>▶</button>
        <button className="btn btn-ghost btn-xs" onClick={() => setWeekRef(weekStart(formatISO(new Date())))}>Hoje</button>

        {subsThisWeek.length > 0 && (
          <select className="inp !w-auto py-1 text-xs ml-2" value={filterSub} onChange={e => setFilterSub(e.target.value)}>
            <option value="">Todos os substitutos</option>
            {subsThisWeek.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        {weekSlots.length > 0 && (
          <>
            <button onClick={handlePDF} className="btn btn-ghost btn-sm ml-auto">📄 PDF</button>
            <WhatsAppButton message={buildWhatsAppMsg()} />
          </>
        )}
      </div>

      <SelectionToolbar isAdmin={isAdmin} selectionMode={selectionMode} setSelectionMode={setSelectionMode}
        visibleSlots={weekSlots} onSelectAll={onSelectAll} onClearAll={onClearAll} onSelectFaltas={onSelectFaltas} onSelectSubs={onSelectSubs} />

      {weekSlots.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-sm font-bold text-t2">Nenhuma substituição nesta semana</div>
        </div>
      ) : (
        <div className="card">
          {days.map(date => {
            const daySlots = weekSlots.filter(sl => sl.date === date)
            if (!daySlots.length) return null
            const grouped = groupBySubstitute(daySlots, store)
            return (
              <div key={date} className="mb-4 last:mb-0">
                <div className="text-xs font-bold text-t2 uppercase tracking-wider mb-2">
                  {dateToDayLabel(date)} · {formatBR(date)}
                </div>
                <div className="space-y-3">
                  {grouped.map(({ teacher, slots }) => {
                    const cv = colorOfTeacher(teacher, store)
                    return (
                      <div key={teacher.id} className="border border-bdr rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ background: cv.tg, color: cv.tx }}>{teacher.name.charAt(0)}</div>
                          <div className="font-bold text-sm truncate flex-1">{teacher.name}</div>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                            style={{ background: cv.tg, color: cv.tx }}>
                            {slots.length} coberta{slots.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {slots.map(sl => <SubSlotRow key={sl.id} sl={sl} store={store} isAdmin={isAdmin}
                          selectionMode={selectionMode} isSelected={selectedIds.has(sl.id)} onToggle={onToggle} />)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── ViewByMonth ──────────────────────────────────────────────────────────────

function ViewByMonth({ store, isAdmin, filteredSlots, selProps }) {
  const { selectedIds, selectionMode, setSelectionMode, onToggle, onSelectAll, onClearAll, onSelectFaltas, onSelectSubs } = selProps
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [filterSub, setFilterSub] = useState('')
  const [showRanking, setShowRanking] = useState(false)
  const [rankSort, setRankSort] = useState('attendance') // 'attendance' | 'scheduled' | 'absences'

  const monthSlots = useMemo(
    () => filteredSlots
      .filter(sl => { const d = parseDate(sl.date); return d.getFullYear() === year && d.getMonth() === month })
      .filter(sl => !filterSub || sl.substituteId === filterSub),
    [filteredSlots, year, month, filterSub]
  )

  const subsThisMonth = useMemo(() => {
    const ids = [...new Set(
      filteredSlots.filter(sl => { const d = parseDate(sl.date); return d.getFullYear() === year && d.getMonth() === month })
        .map(sl => sl.substituteId)
    )]
    return ids.map(id => store.teachers.find(t => t.id === id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
  }, [filteredSlots, year, month, store.teachers])

  // Agrupar dias em semanas (Seg–Sex) para cards semanais
  const weeks = useMemo(() => {
    const sortedDates = [...new Set(monthSlots.map(sl => sl.date))].sort()
    if (!sortedDates.length) return []
    const wks = []
    let currentWeekStart = null
    let currentWeek = []
    for (const date of sortedDates) {
      const ws = weekStart(date)
      if (ws !== currentWeekStart) {
        if (currentWeek.length) wks.push({ weekStart: currentWeekStart, dates: currentWeek })
        currentWeekStart = ws
        currentWeek = []
      }
      currentWeek.push(date)
    }
    if (currentWeek.length) wks.push({ weekStart: currentWeekStart, dates: currentWeek })
    return wks
  }, [monthSlots])

  // Ranking: assiduidade por professor
  const rankingRows = useMemo(() => {
    const monthStart = formatISO(new Date(year, month, 1))
    const monthEnd   = formatISO(new Date(year, month + 1, 0))
    const days       = businessDaysBetween(monthStart, monthEnd)
    const dayLabels  = days.map(d => dateToDayLabel(d)).filter(Boolean)

    const schedByTeacherDay = new Map()
    ;(store.schedules ?? []).forEach(s => {
      const key = `${s.teacherId}||${s.day}`
      schedByTeacherDay.set(key, (schedByTeacherDay.get(key) ?? 0) + 1)
    })

    const absByTeacher = new Map()
    ;(store.absences ?? []).forEach(ab => {
      ab.slots.forEach(sl => {
        if (sl.date < monthStart || sl.date > monthEnd) return
        absByTeacher.set(sl.teacherId, (absByTeacher.get(sl.teacherId) ?? 0) + 1)
      })
    })

    return (store.teachers ?? []).map(t => {
      const scheduled = dayLabels.reduce(
        (acc, lbl) => acc + (schedByTeacherDay.get(`${t.id}||${lbl}`) ?? 0), 0
      )
      const absences = absByTeacher.get(t.id) ?? 0
      const attendance = scheduled > 0 ? ((scheduled - absences) / scheduled * 100) : null
      return { teacher: t, scheduled, absences, attendance }
    })
  }, [store.teachers, store.schedules, store.absences, year, month])

  const sortedRanking = useMemo(() => {
    return [...rankingRows].sort((a, b) => {
      if (rankSort === 'attendance') {
        const aa = a.attendance ?? -1, bb = b.attendance ?? -1
        if (bb !== aa) return bb - aa
      } else if (rankSort === 'scheduled') {
        if (b.scheduled !== a.scheduled) return b.scheduled - a.scheduled
      } else {
        if (b.absences !== a.absences) return b.absences - a.absences
      }
      return a.teacher.name.localeCompare(b.teacher.name)
    })
  }, [rankingRows, rankSort])

  const handlePDF = () => openPDF(generateSubstitutionTimesheetHTML(null, monthSlots, store))

  const handleRankingPDF = () => openPDF(generateSubstitutionRankingHTML(sortedRanking, month, year))

  const buildWhatsAppMsg = () => {
    let msg = `*Substituições — ${MONTH_NAMES[month]} ${year}*\n`
    msg += `Total: ${monthSlots.length} cobertura${monthSlots.length !== 1 ? 's' : ''}\n`
    const sortedDates = [...new Set(monthSlots.map(sl => sl.date))].sort()
    sortedDates.forEach(date => {
      const daySlots = monthSlots.filter(sl => sl.date === date)
      msg += `\n*${dateToDayLabel(date)}, ${formatBR(date)}*`
      const grouped = groupBySubstitute(daySlots, store)
      grouped.forEach(({ teacher, slots }) => {
        msg += `\n  *${teacher.name}* (${slots.length}):`
        slots.forEach(sl => {
          const absent = store.teachers.find(t => t.id === sl.teacherId)
          msg += `\n    • ${slotLabel(sl.timeSlot, store.periodConfigs)} — ${sl.turma} (cobriu ${absent?.name ?? '—'})`
        })
      })
    })
    return msg
  }

  const colorForPct = pct => pct > 90 ? 'text-green-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600'

  const sortLabels = { attendance: '% Assiduidade', scheduled: 'Aulas Próprias', absences: 'Ausências' }
  const nextSort = () => setRankSort(s => s === 'attendance' ? 'scheduled' : s === 'scheduled' ? 'absences' : 'attendance')

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y - 1)}>◀</button>
        <span className="font-bold text-sm">{year}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y + 1)}>▶</button>

        <div className="flex gap-1 flex-wrap">
          {MONTH_NAMES.map((name, idx) => (
            <button key={idx} onClick={() => setMonth(idx)}
              className={`btn btn-xs ${idx === month ? 'btn-dark' : 'btn-ghost'}`}>
              {name.slice(0, 3)}
            </button>
          ))}
        </div>

        <button className="btn btn-ghost btn-xs" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}>Hoje</button>

        {!showRanking && subsThisMonth.length > 0 && (
          <select className="inp !w-auto py-1 text-xs ml-2" value={filterSub} onChange={e => setFilterSub(e.target.value)}>
            <option value="">Todos os substitutos</option>
            {subsThisMonth.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        <div className="flex gap-2 ml-auto">
          <button onClick={() => setShowRanking(r => !r)}
            className={`btn btn-sm ${showRanking ? 'btn-dark' : 'btn-ghost'}`}>
            🏆 Ranking
          </button>
          {!showRanking && monthSlots.length > 0 && (
            <>
              <button onClick={handlePDF} className="btn btn-ghost btn-sm">📄 PDF</button>
              <WhatsAppButton message={buildWhatsAppMsg()} />
            </>
          )}
        </div>
      </div>

      {showRanking ? (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-t3">Ordenar por:</span>
            <button onClick={nextSort} className="btn btn-ghost btn-xs">{sortLabels[rankSort]} ↓</button>
            <button onClick={handleRankingPDF} className="btn btn-ghost btn-sm ml-auto">📄 PDF Ranking</button>
          </div>

          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surf2 text-t2 text-xs uppercase tracking-wider">
                  <th className="px-3 py-2 text-center w-10">#</th>
                  <th className="px-3 py-2 text-left">Professor</th>
                  <th className="px-3 py-2 text-center">Aulas Próprias</th>
                  <th className="px-3 py-2 text-center">Ausências</th>
                  <th className="px-3 py-2 text-center">% Assiduidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bdr/60">
                {sortedRanking.map((r, idx) => {
                  const cv = colorOfTeacher(r.teacher, store)
                  const pctStr = r.attendance !== null ? `${r.attendance.toFixed(1)}%` : '—'
                  const pctClass = r.attendance !== null ? colorForPct(r.attendance) : 'text-t3'
                  return (
                    <tr key={r.teacher.id} className="hover:bg-surf2 transition-colors even:bg-surf/50">
                      <td className="px-3 py-2.5 text-center text-t3 font-mono text-xs">{idx + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ background: cv.tg, color: cv.tx }}>{r.teacher.name.charAt(0)}</div>
                          <span className="font-semibold truncate">{r.teacher.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{r.scheduled}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{r.absences}</td>
                      <td className={`px-3 py-2.5 text-center font-bold tabular-nums ${pctClass}`}>{pctStr}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <SelectionToolbar isAdmin={isAdmin} selectionMode={selectionMode} setSelectionMode={setSelectionMode}
            visibleSlots={monthSlots} onSelectAll={onSelectAll} onClearAll={onClearAll} onSelectFaltas={onSelectFaltas} onSelectSubs={onSelectSubs} />

          {monthSlots.length === 0 ? (
            <div className="card text-center py-10">
              <div className="text-3xl mb-2">✅</div>
              <div className="text-sm font-bold text-t2">Nenhuma substituição em {MONTH_NAMES[month]} {year}</div>
            </div>
          ) : (
            <div className="space-y-4">
              {weeks.map(wk => {
                const wkMonDate = parseDate(wk.weekStart)
                const wkFriDate = new Date(wkMonDate); wkFriDate.setDate(wkMonDate.getDate() + 4)
                const wkLabel = `${formatBR(wk.weekStart)} – ${formatBR(formatISO(wkFriDate))}`
                return (
                  <div key={wk.weekStart} className="card">
                    <div className="text-[11px] font-bold text-t3 uppercase tracking-wider mb-3">Semana {wkLabel}</div>
                    {wk.dates.map(date => {
                      const daySlots = monthSlots.filter(sl => sl.date === date)
                      if (!daySlots.length) return null
                      const grouped = groupBySubstitute(daySlots, store)
                      return (
                        <div key={date} className="mb-4 last:mb-0">
                          <div className="text-xs font-bold text-t2 uppercase tracking-wider mb-2">
                            {dateToDayLabel(date)} · {formatBR(date)}
                          </div>
                          <div className="space-y-3">
                            {grouped.map(({ teacher, slots }) => {
                              const cv = colorOfTeacher(teacher, store)
                              return (
                                <div key={teacher.id} className="border border-bdr rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                      style={{ background: cv.tg, color: cv.tx }}>{teacher.name.charAt(0)}</div>
                                    <div className="font-bold text-sm truncate flex-1">{teacher.name}</div>
                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                                      style={{ background: cv.tg, color: cv.tx }}>
                                      {slots.length} coberta{slots.length !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                  {slots.map(sl => <SubSlotRow key={sl.id} sl={sl} store={store} isAdmin={isAdmin}
                                    selectionMode={selectionMode} isSelected={selectedIds.has(sl.id)} onToggle={onToggle} />)}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
