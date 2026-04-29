import { useState, useMemo, useEffect } from 'react'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { colorOfTeacher, teacherSubjectNames, formatBR, dateToDayLabel, weekStart, formatISO, parseDate } from '../lib/helpers'
import { getAulas, slotLabel, getCfg, gerarPeriodosEspeciais } from '../lib/periods'
import { toast } from '../hooks/useToast'
import Modal from '../components/ui/Modal'
import { ScheduleGrid } from '../components/ui/ScheduleGrid'

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── SelectionToolbar ─────────────────────────────────────────────────────────

function SelectionToolbar({ isAdmin, selectionMode, setSelectionMode, visibleSlots, onSelectAll, onClearAll, onSelectFaltas, onSelectSubs }) {
  if (!isAdmin) return null
  return (
    <div className="flex gap-2 flex-wrap items-center mb-3">
      <button
        data-testid="select-mode-toggle"
        className={`btn btn-xs ${selectionMode ? 'btn-dark' : 'btn-ghost'}`}
        onClick={() => { setSelectionMode(v => !v); onClearAll() }}
      >
        {selectionMode ? '✕ Cancelar' : '☑ Selecionar'}
      </button>
      {selectionMode && (
        <>
          <button data-testid="select-all" className="btn btn-ghost btn-xs" onClick={() => onSelectAll(visibleSlots)}>Selecionar tudo</button>
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
      <span className="text-sm font-semibold flex-1">{count} ausência{count !== 1 ? 's' : ''} selecionada{count !== 1 ? 's' : ''}</span>
      <button className="btn btn-ghost btn-sm text-white border-white/30 hover:border-white" onClick={onClear}>Desmarcar tudo</button>
      <button data-testid="bulk-delete" className="btn btn-sm bg-err text-white border-err hover:bg-red-700" onClick={onDelete}>Excluir selecionadas</button>
    </div>
  )
}

// ─── UndoBar ──────────────────────────────────────────────────────────────────

function UndoBar({ count, onUndo }) {
  if (!count) return null
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-amber-700 text-white px-5 py-3 flex items-center gap-3 shadow-2xl">
      <span className="text-sm font-semibold flex-1">{count} ausência{count !== 1 ? 's' : ''} removida{count !== 1 ? 's' : ''}</span>
      <button data-testid="undo-bulk" className="btn btn-sm bg-white text-amber-800 border-white hover:bg-amber-50" onClick={onUndo}>Desfazer</button>
    </div>
  )
}

// ─── WhatsAppButton ───────────────────────────────────────────────────────────

function WhatsAppButton({ mode, context, store }) {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState(() => localStorage.getItem('gestao_whatsapp_phone') ?? '')

  const handleSend = async () => {
    const digits = phone.replace(/\D/g, '')
    const fullNumber = digits.startsWith('55') ? digits : `55${digits}`
    localStorage.setItem('gestao_whatsapp_phone', digits)
    const { buildWhatsAppMessage } = await import('../lib/reports')
    const msg = buildWhatsAppMessage(mode, context, store)
    window.open(`https://api.whatsapp.com/send?phone=${fullNumber}&text=${encodeURIComponent(msg)}`, '_blank')
    setOpen(false)
  }

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>📱 WhatsApp</button>
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

// ─── SlotRow ──────────────────────────────────────────────────────────────────

function SlotRow({ sl, store, isAdmin, showTeacher = false, selectionMode = false, isSelected = false, onToggle }) {
  const { deleteAbsenceSlot } = useAppStore()
  const subj    = store.subjects.find(s => s.id === sl.subjectId)
  const sub     = sl.substituteId ? store.teachers.find(t => t.id === sl.substituteId) : null
  const parts      = sl.timeSlot?.split('|') ?? []
  const isEspecial = parts.length >= 3 && parts[2].startsWith('e')
  const aula = (() => {
    if (parts.length < 3) return null
    if (isEspecial) {
      const n    = Number(parts[2].slice(1))
      const cfg  = getCfg(parts[0], parts[1], store.periodConfigs)
      const item = gerarPeriodosEspeciais(cfg).find(p => p.aulaIdx === parts[2])
      return { label: `Tempo ${n}`, inicio: item?.inicio ?? '', fim: item?.fim ?? '' }
    }
    return getAulas(parts[0], parts[1], store.periodConfigs).find(p => p.aulaIdx === Number(parts[2])) ?? null
  })()
  const teacher = showTeacher ? store.teachers.find(t => t.id === sl.teacherId) : null

  return (
    <div
      data-testid={`slot-row-${sl.id}`}
      className={`flex items-center gap-3 py-2.5 border-b border-bdr/60 last:border-0 transition-colors
        ${isSelected ? 'bg-accent-l' : ''}`}
    >
      {selectionMode && isAdmin && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(sl.id)}
          className="shrink-0 w-4 h-4 accent-accent cursor-pointer"
        />
      )}
      <div className="min-w-[68px] font-mono text-[11px] text-t1 shrink-0">
        <div className="font-bold">{aula?.label ?? slotLabel(sl.timeSlot, store.periodConfigs)}</div>
        <div className="text-t3 text-[10px]">{aula?.inicio ?? ''}–{aula?.fim ?? ''}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{sl.turma}</div>
        <div className="text-xs text-t2 truncate">{subj?.name ?? '—'}</div>
        {teacher && <div className="text-xs text-t3 truncate">{teacher.name}</div>}
      </div>
      <div className="text-right min-w-[110px] shrink-0">
        {sub
          ? <div className="text-xs font-bold text-ok">✓ {sub.name}</div>
          : <div className="text-xs font-bold text-err">⚠ Sem sub.</div>}
      </div>
      {isAdmin && !selectionMode && (
        <button
          data-testid={`slot-delete-${sl.id}`}
          onClick={() => { deleteAbsenceSlot(sl.absenceId, sl.id); toast('Falta removida', 'ok') }}
          className="text-t3 hover:text-err transition-colors text-sm shrink-0"
          title="Remover"
        >✕</button>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AbsencesPage() {
  const store    = useAppStore()
  const { role } = useAuthStore()
  const isAdmin  = role === 'admin'
  const [mode, setMode]             = useState('teacher')
  const [selTeacher, setSelTeacher] = useState(null)
  const [selDate,    setSelDate]    = useState(null)
  const [weekRef,    setWeekRef]    = useState(null)
  const [monthRef,   setMonthRef]   = useState(null)

  // Load absences on mount
  useEffect(() => {
    store.loadAbsencesIfNeeded()
  }, [store])

  // Seleção em lote
  const [selectedIds,   setSelectedIds]   = useState(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [undoBuffer,    setUndoBuffer]    = useState(null) // { absences, count }
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
    toast(`${count} ausência${count !== 1 ? 's' : ''} removida${count !== 1 ? 's' : ''}`, 'warn')
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

  const allSlots = useMemo(() =>
    (store.absences ?? []).flatMap(ab =>
      ab.slots.map(sl => ({ ...sl, teacherId: ab.teacherId, absenceId: ab.id }))
    ), [store.absences]
  )

  const tabs = [
    { id: 'teacher', label: '👤 Por Professor' },
    { id: 'day',     label: '📅 Por Dia' },
    { id: 'week',    label: '🗓 Por Semana' },
    { id: 'month',   label: '📆 Por Mês' },
  ]

  const handleTabChange = (id) => {
    setMode(id); setSelTeacher(null); setSelDate(null)
    setSelectionMode(false); setSelectedIds(new Set())
  }

  return (
    <div className={selectedIds.size > 0 || undoBuffer ? 'pb-16' : ''}>
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">Relatório de Ausências</h1>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-5">
        {tabs.map(t => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => handleTabChange(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border
              ${mode === t.id ? 'bg-navy text-white border-navy' : 'bg-surf text-t2 border-bdr hover:border-t3'}`}
          >{t.label}</button>
        ))}
      </div>

      {mode === 'teacher' && <ViewByTeacher store={store} isAdmin={isAdmin} allSlots={allSlots} selTeacher={selTeacher} setSelTeacher={setSelTeacher} selProps={selProps} />}
      {mode === 'day'     && <ViewByDay     store={store} isAdmin={isAdmin} allSlots={allSlots} selDate={selDate}       setSelDate={setSelDate}       selProps={selProps} />}
      {mode === 'week'    && <ViewByWeek    store={store} isAdmin={isAdmin} allSlots={allSlots} weekRef={weekRef}       setWeekRef={setWeekRef}       selProps={selProps} />}
      {mode === 'month'   && <ViewByMonth   store={store} isAdmin={isAdmin} allSlots={allSlots} monthRef={monthRef}     setMonthRef={setMonthRef}     selProps={selProps} />}

      {undoBuffer
        ? <UndoBar count={undoBuffer.count} onUndo={handleUndo} />
        : <BulkActionBar count={selectedIds.size} onDelete={handleBulkDelete} onClear={onClearAll} />
      }
    </div>
  )
}

// ─── View: Por Professor ──────────────────────────────────────────────────────

function ViewByTeacher({ store, isAdmin, allSlots, selTeacher, setSelTeacher, selProps }) {
  const { selectedIds, selectionMode, setSelectionMode, onToggle, onSelectAll, onClearAll, onSelectFaltas, onSelectSubs } = selProps
  const [filter, setFilter] = useState('all') // 'all' | 'day' | 'week' | 'month'
  const [filterDate,  setFilterDate]  = useState(formatISO(new Date()))
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth())
  const [filterYear,  setFilterYear]  = useState(new Date().getFullYear())

  const withAbs = store.teachers.filter(t =>
    allSlots.some(sl => sl.teacherId === t.id)
  ).sort((a, b) => a.name.localeCompare(b.name))

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

  const handlePDF = async () => {
    if (!selTeacher) return
    const { openPDF, generateTeacherHTML } = await import('../lib/reports')
    openPDF(generateTeacherHTML(selTeacher, buildFilter(), store))
  }

  const detail = selTeacher ? (() => {
    const teacher = store.teachers.find(t => t.id === selTeacher)
    if (!teacher) return null
    const f = buildFilter()
    const slots = allSlots
      .filter(sl => sl.teacherId === selTeacher)
      .filter(sl => {
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
    const segIds = [...new Set(
      store.schedules
        .filter(s => s.teacherId === selTeacher)
        .map(s => s.timeSlot?.split('|')[0])
        .filter(Boolean)
    )]
    const relevantSegments = store.segments.filter(s => segIds.includes(s.id))
    return { teacher, byDate, total: slots.length, slots, relevantSegments }
  })() : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
      {/* Lista */}
      <div>
        <div className="text-[11px] font-bold text-t2 uppercase tracking-wide mb-2">
          {withAbs.length} professor{withAbs.length !== 1 ? 'es' : ''} com ausências
        </div>
        <div className="space-y-1.5 max-h-[65vh] overflow-y-auto scroll-thin pr-1">
          {withAbs.length === 0 ? (
            <div className="card text-center py-8">
              <div className="text-3xl mb-2">✅</div>
              <div className="text-sm font-bold text-t2">Sem ausências registradas</div>
            </div>
          ) : withAbs.map(t => {
            const cv = colorOfTeacher(t, store)
            const ct = allSlots.filter(sl => sl.teacherId === t.id).length
            return (
              <button key={t.id} onClick={() => setSelTeacher(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all
                  ${selTeacher === t.id ? 'border-navy bg-surf' : 'border-bdr bg-surf hover:border-t3'}`}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: cv.tg, color: cv.tx }}>{t.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{t.name}</div>
                  <div className="text-[11px] text-t3">{ct} aula{ct !== 1 ? 's' : ''} ausente{ct !== 1 ? 's' : ''}</div>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: cv.tg, color: cv.tx }}>{ct}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Detalhe */}
      <div>
        {!detail ? (
          <div className="flex items-center justify-center h-48 text-t3">
            <div className="text-center">
              <div className="text-4xl mb-2">👤</div>
              <div className="text-sm">Selecione um professor</div>
            </div>
          </div>
        ) : (() => {
          const { teacher, byDate, total, slots: detailSlots, relevantSegments } = detail
          const cv = colorOfTeacher(teacher, store)
          return (
            <div>
              {/* Header do professor + filtros */}
              <div className="flex items-start gap-3 p-4 rounded-xl border-2 mb-3"
                style={{ background: cv.bg, borderColor: cv.bd }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-extrabold shrink-0"
                  style={{ background: cv.tg, color: cv.tx }}>{teacher.name.charAt(0)}</div>
                <div className="flex-1">
                  <div className="font-extrabold text-base" style={{ color: cv.tx }}>{teacher.name}</div>
                  <div className="text-xs opacity-70" style={{ color: cv.tx }}>{teacherSubjectNames(teacher, store.subjects) || '—'}</div>
                </div>
                <button data-testid="export-pdf" onClick={handlePDF} className="btn btn-ghost btn-xs shrink-0">📄 PDF</button>
                {(() => {
                  const waLabel = filter === 'day' ? formatBR(filterDate)
                    : filter === 'week' ? (() => { const ws = weekStart(filterDate); const d = parseDate(ws); d.setDate(d.getDate() + 4); return `${formatBR(ws)} – ${formatBR(formatISO(d))}` })()
                    : filter === 'month' ? `${MONTH_NAMES[filterMonth]} ${filterYear}`
                    : 'Todos os registros'
                  return (
                    <WhatsAppButton mode="teacher"
                      context={{ slots: detailSlots, label: waLabel, teacherName: teacher.name }}
                      store={store} />
                  )
                })()}
              </div>

              {/* Filtros de período */}
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

              {/* SelectionToolbar */}
              <SelectionToolbar
                isAdmin={isAdmin}
                selectionMode={selectionMode}
                setSelectionMode={setSelectionMode}
                visibleSlots={detailSlots}
                onSelectAll={onSelectAll}
                onClearAll={onClearAll}
                onSelectFaltas={onSelectFaltas}
                onSelectSubs={onSelectSubs}
              />

              {/* Registros */}
              {Object.keys(byDate).length === 0 ? (
                <div className="card text-center py-8">
                  <div className="text-2xl mb-2">✅</div>
                  <div className="text-sm text-t2">Nenhuma ausência no período selecionado</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.keys(byDate).sort().map(date => {
                    const dateSlots = byDate[date]
                    const covered = dateSlots.filter(s => s.substituteId).length
                    const statusColor = covered === dateSlots.length ? 'text-ok' : covered > 0 ? 'text-amber-600' : 'text-err'
                    return (
                      <div key={date} className="card">
                        <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-bdr">
                          <div>
                            <div className="font-bold text-sm">{dateToDayLabel(date)}</div>
                            <div className="font-mono text-xs text-t2">{formatBR(date)}</div>
                          </div>
                          <div className={`text-xs font-bold ${statusColor}`}>
                            {covered === dateSlots.length ? '✓ Coberta' : covered > 0 ? `⚠ ${covered}/${dateSlots.length}` : '✕ Sem sub.'}
                          </div>
                        </div>
                        {dateSlots.map(sl => (
                          <SlotRow key={sl.id} sl={sl} store={store} isAdmin={isAdmin}
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

// ─── View: Por Dia ────────────────────────────────────────────────────────────

function ViewByDay({ store, isAdmin, allSlots, selDate, setSelDate, selProps }) {
  const { selectedIds, selectionMode, setSelectionMode, onToggle, onSelectAll, onClearAll, onSelectFaltas, onSelectSubs } = selProps
  const today = formatISO(new Date())
  const date  = selDate ?? today
  const datesWithAbs = [...new Set(allSlots.map(s => s.date))].sort().reverse()
  const slotsOnDate  = allSlots.filter(sl => sl.date === date)

  const handlePDF = async () => {
    const { openPDF, generateByDayHTML } = await import('../lib/reports')
    openPDF(generateByDayHTML(date, store))
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div>
          <label className="lbl">Data</label>
          <input type="date" className="inp !w-auto" value={date} onChange={e => setSelDate(e.target.value)} />
        </div>
        {datesWithAbs.length > 0 && (
          <div>
            <label className="lbl">Datas com ausências</label>
            <div className="flex gap-1.5 flex-wrap">
              {datesWithAbs.slice(0, 10).map(d => (
                <button key={d} onClick={() => setSelDate(d)}
                  className={`btn btn-xs ${d === date ? 'btn-dark' : 'btn-ghost'}`}>
                  {formatBR(d)}
                </button>
              ))}
            </div>
          </div>
        )}
        {slotsOnDate.length > 0 && (
          <>
            <button data-testid="export-pdf" onClick={handlePDF} className="btn btn-ghost btn-sm ml-auto">📄 Exportar PDF</button>
            <WhatsAppButton mode="day"
              context={{ slots: slotsOnDate, label: formatBR(date) }}
              store={store} />
          </>
        )}
      </div>
      <SelectionToolbar
        isAdmin={isAdmin}
        selectionMode={selectionMode}
        setSelectionMode={setSelectionMode}
        visibleSlots={slotsOnDate}
        onSelectAll={onSelectAll}
        onClearAll={onClearAll}
        onSelectFaltas={onSelectFaltas}
        onSelectSubs={onSelectSubs}
      />
      {slotsOnDate.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-sm font-bold text-t2">Sem ausências em {formatBR(date)}</div>
        </div>
      ) : (
        <GroupedByTeacher slots={slotsOnDate} store={store} isAdmin={isAdmin}
          selectedIds={selectedIds} selectionMode={selectionMode} onToggle={onToggle} />
      )}
    </div>
  )
}

// ─── View: Por Semana ─────────────────────────────────────────────────────────

function ViewByWeek({ store, isAdmin, allSlots, weekRef, setWeekRef, selProps }) {
  const { selectedIds, selectionMode, setSelectionMode, onToggle, onSelectAll, onClearAll, onSelectFaltas, onSelectSubs } = selProps
  const [filterTeacher, setFilterTeacher] = useState('')
  const refDate = weekRef ? parseDate(weekRef) : new Date()
  const monISO  = weekStart(formatISO(refDate))
  const monDate = parseDate(monISO)
  const friDate = new Date(monDate); friDate.setDate(monDate.getDate() + 4)
  const friISO  = formatISO(friDate)
  const weekLabel = `${formatBR(monISO)} – ${formatBR(friISO)}`

  const prev = () => { const d = parseDate(monISO); d.setDate(d.getDate() - 7); setWeekRef(formatISO(d)) }
  const next = () => { const d = parseDate(monISO); d.setDate(d.getDate() + 7); setWeekRef(formatISO(d)) }

  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monDate); d.setDate(monDate.getDate() + i); return formatISO(d)
  })

  const weekSlots = allSlots
    .filter(sl => sl.date >= monISO && sl.date <= friISO)
    .filter(sl => !filterTeacher || sl.teacherId === filterTeacher)

  const teachersThisWeek = [...new Set(allSlots.filter(sl => sl.date >= monISO && sl.date <= friISO).map(sl => sl.teacherId))]
    .map(tid => store.teachers.find(t => t.id === tid)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))

  const handlePDF = async () => {
    const { openPDF, generateByWeekHTML } = await import('../lib/reports')
    openPDF(generateByWeekHTML(monISO, filterTeacher || null, store))
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button className="btn btn-ghost btn-sm text-lg px-2" onClick={prev}>‹</button>
        <div className="font-bold text-sm min-w-[200px] text-center">{weekLabel}</div>
        <button className="btn btn-ghost btn-sm text-lg px-2" onClick={next}>›</button>
        <button className="btn btn-ghost btn-xs text-accent" onClick={() => setWeekRef(null)}>Hoje</button>

        {teachersThisWeek.length > 0 && (
          <select className="inp !w-auto py-1 text-xs ml-2" value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}>
            <option value="">Todos os professores</option>
            {teachersThisWeek.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        {weekSlots.length > 0 && (
          <>
            <button data-testid="export-pdf" onClick={handlePDF} className="btn btn-ghost btn-sm ml-auto">📄 Exportar PDF</button>
            <WhatsAppButton mode="week"
              context={{ slots: weekSlots, label: weekLabel }}
              store={store} />
          </>
        )}
      </div>

      <SelectionToolbar
        isAdmin={isAdmin}
        selectionMode={selectionMode}
        setSelectionMode={setSelectionMode}
        visibleSlots={weekSlots}
        onSelectAll={onSelectAll}
        onClearAll={onClearAll}
        onSelectFaltas={onSelectFaltas}
        onSelectSubs={onSelectSubs}
      />

      {weekSlots.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-sm font-bold text-t2">Sem ausências nesta semana</div>
        </div>
      ) : days.map(date => {
        const daySlots = weekSlots.filter(sl => sl.date === date)
        if (!daySlots.length) return null
        return (
          <div key={date} className="mb-4">
            <div className="text-xs font-bold text-t2 uppercase tracking-wide mb-2">
              {dateToDayLabel(date)} · {formatBR(date)}
            </div>
            <GroupedByTeacher slots={daySlots} store={store} isAdmin={isAdmin}
              selectedIds={selectedIds} selectionMode={selectionMode} onToggle={onToggle} />
          </div>
        )
      })}
    </div>
  )
}

// ─── View: Por Mês ────────────────────────────────────────────────────────────

function ViewByMonth({ store, isAdmin, allSlots, monthRef, setMonthRef, selProps }) {
  const { selectedIds, selectionMode, setSelectionMode, onToggle, onSelectAll, onClearAll, onSelectFaltas, onSelectSubs } = selProps
  const [filterTeacher, setFilterTeacher] = useState('')
  const refDate = monthRef ? parseDate(monthRef) : new Date()
  const year    = refDate.getFullYear()
  const month   = refDate.getMonth()

  const monthSlots = allSlots
    .filter(sl => {
      const d = parseDate(sl.date)
      return d.getFullYear() === year && d.getMonth() === month
    })
    .filter(sl => !filterTeacher || sl.teacherId === filterTeacher)

  const teachersThisMonth = [...new Set(
    allSlots.filter(sl => {
      const d = parseDate(sl.date)
      return d.getFullYear() === year && d.getMonth() === month
    }).map(sl => sl.teacherId)
  )].map(tid => store.teachers.find(t => t.id === tid)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))

  const byDate = {}
  monthSlots.forEach(sl => { if (!byDate[sl.date]) byDate[sl.date] = []; byDate[sl.date].push(sl) })

  const handlePDF = async () => {
    const { openPDF, generateByMonthHTML } = await import('../lib/reports')
    openPDF(generateByMonthHTML(year, month, filterTeacher || null, store))
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button className="btn btn-ghost btn-xs text-lg px-2"
          onClick={() => setMonthRef(formatISO(new Date(year, month - 1, 1)))}>‹</button>
        <span className="font-bold text-sm">{year}</span>
        <button className="btn btn-ghost btn-xs text-lg px-2"
          onClick={() => setMonthRef(formatISO(new Date(year, month + 1, 1)))}>›</button>
        <div className="flex gap-1 flex-wrap">
          {MONTH_NAMES.map((name, idx) => (
            <button key={idx}
              onClick={() => setMonthRef(formatISO(new Date(year, idx, 1)))}
              className={`btn btn-xs ${idx === month ? 'btn-dark' : 'btn-ghost'}`}>
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-xs text-accent" onClick={() => setMonthRef(null)}>Hoje</button>

        {teachersThisMonth.length > 0 && (
          <select className="inp !w-auto py-1 text-xs" value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}>
            <option value="">Todos os professores</option>
            {teachersThisMonth.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        {monthSlots.length > 0 && (
          <>
            <button data-testid="export-pdf" onClick={handlePDF} className="btn btn-ghost btn-sm ml-auto">📄 Exportar PDF</button>
            <WhatsAppButton mode="month"
              context={{ slots: monthSlots, label: `${MONTH_NAMES[month]} ${year}` }}
              store={store} />
          </>
        )}
      </div>

      <SelectionToolbar
        isAdmin={isAdmin}
        selectionMode={selectionMode}
        setSelectionMode={setSelectionMode}
        visibleSlots={monthSlots}
        onSelectAll={onSelectAll}
        onClearAll={onClearAll}
        onSelectFaltas={onSelectFaltas}
        onSelectSubs={onSelectSubs}
      />

      {monthSlots.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-sm font-bold text-t2">Sem ausências em {MONTH_NAMES[month]} {year}</div>
        </div>
      ) : Object.keys(byDate).sort().map(date => (
        <div key={date} className="mb-4">
          <div className="text-xs font-bold text-t2 uppercase tracking-wide mb-2">
            {dateToDayLabel(date)} · {formatBR(date)}
          </div>
          <GroupedByTeacher slots={byDate[date]} store={store} isAdmin={isAdmin}
            selectedIds={selectedIds} selectionMode={selectionMode} onToggle={onToggle} />
        </div>
      ))}
    </div>
  )
}

// ─── GroupedByTeacher ─────────────────────────────────────────────────────────

function GroupedByTeacher({ slots, store, isAdmin, selectedIds = new Set(), selectionMode = false, onToggle }) {
  const byTeacher = {}
  slots.forEach(sl => { if (!byTeacher[sl.teacherId]) byTeacher[sl.teacherId] = []; byTeacher[sl.teacherId].push(sl) })

  return (
    <div className="space-y-3">
      {Object.entries(byTeacher).map(([tid, tSlots]) => {
        const teacher = store.teachers.find(t => t.id === tid)
        if (!teacher) return null
        const cv      = colorOfTeacher(teacher, store)
        const covered = tSlots.filter(s => s.substituteId).length
        return (
          <div key={tid} className="card">
            <div className="flex items-center gap-3 mb-3 pb-2.5 border-b border-bdr">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ background: cv.tg, color: cv.tx }}>{teacher.name.charAt(0)}</div>
              <div className="flex-1">
                <div className="font-bold text-sm">{teacher.name}</div>
                <div className="text-xs text-t2">{teacherSubjectNames(teacher, store.subjects) || '—'}</div>
              </div>
              <div className={`text-xs font-bold ${covered === tSlots.length ? 'text-ok' : covered > 0 ? 'text-amber-600' : 'text-err'}`}>
                {covered}/{tSlots.length} coberta{covered !== 1 ? 's' : ''}
              </div>
            </div>
            {tSlots.map(sl => (
              <SlotRow key={sl.id} sl={sl} store={store} isAdmin={isAdmin}
                selectionMode={selectionMode} isSelected={selectedIds.has(sl.id)} onToggle={onToggle} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
