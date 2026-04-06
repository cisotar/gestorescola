import { useState, useMemo } from 'react'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { colorOfTeacher, teacherSubjectNames, formatBR, dateToDayLabel, weekStart, formatISO, parseDate } from '../lib/helpers'
import { getAulas, slotLabel } from '../lib/periods'
import { toast } from '../hooks/useToast'
import {
  openPDF,
  generateTeacherHTML,
  generateByDayHTML,
  generateByWeekHTML,
  generateByMonthHTML,
} from '../lib/reports'

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── SlotRow ──────────────────────────────────────────────────────────────────

function SlotRow({ sl, store, isAdmin, showTeacher = false }) {
  const { deleteAbsenceSlot } = useAppStore()
  const subj    = store.subjects.find(s => s.id === sl.subjectId)
  const sub     = sl.substituteId ? store.teachers.find(t => t.id === sl.substituteId) : null
  const parts   = sl.timeSlot?.split('|') ?? []
  const aula    = parts.length >= 3 ? getAulas(parts[0], parts[1], store.periodConfigs).find(p => p.aulaIdx === Number(parts[2])) : null
  const teacher = showTeacher ? store.teachers.find(t => t.id === sl.teacherId) : null

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-bdr/60 last:border-0">
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
      {isAdmin && (
        <button
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

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">Relatório de Ausências</h1>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-5">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setMode(t.id); setSelTeacher(null); setSelDate(null) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border
              ${mode === t.id ? 'bg-navy text-white border-navy' : 'bg-surf text-t2 border-bdr hover:border-t3'}`}
          >{t.label}</button>
        ))}
      </div>

      {mode === 'teacher' && <ViewByTeacher store={store} isAdmin={isAdmin} allSlots={allSlots} selTeacher={selTeacher} setSelTeacher={setSelTeacher} />}
      {mode === 'day'     && <ViewByDay     store={store} isAdmin={isAdmin} allSlots={allSlots} selDate={selDate}       setSelDate={setSelDate} />}
      {mode === 'week'    && <ViewByWeek    store={store} isAdmin={isAdmin} allSlots={allSlots} weekRef={weekRef}       setWeekRef={setWeekRef} />}
      {mode === 'month'   && <ViewByMonth   store={store} isAdmin={isAdmin} allSlots={allSlots} monthRef={monthRef}     setMonthRef={setMonthRef} />}
    </div>
  )
}

// ─── View: Por Professor ──────────────────────────────────────────────────────

function ViewByTeacher({ store, isAdmin, allSlots, selTeacher, setSelTeacher }) {
  const [filter, setFilter] = useState('all') // 'all' | 'day' | 'week' | 'month'
  const [filterDate,  setFilterDate]  = useState(new Date().toISOString().split('T')[0])
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

  const handlePDF = () => {
    if (!selTeacher) return
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
    return { teacher, byDate, total: slots.length }
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
          const { teacher, byDate, total } = detail
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
                <button onClick={handlePDF} className="btn btn-ghost btn-xs shrink-0">📄 PDF</button>
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

              {/* Registros */}
              {Object.keys(byDate).length === 0 ? (
                <div className="card text-center py-8">
                  <div className="text-2xl mb-2">✅</div>
                  <div className="text-sm text-t2">Nenhuma ausência no período selecionado</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.keys(byDate).sort().map(date => {
                    const slots = byDate[date]
                    const covered = slots.filter(s => s.substituteId).length
                    const statusColor = covered === slots.length ? 'text-ok' : covered > 0 ? 'text-amber-600' : 'text-err'
                    return (
                      <div key={date} className="card">
                        <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-bdr">
                          <div>
                            <div className="font-bold text-sm">{dateToDayLabel(date)}</div>
                            <div className="font-mono text-xs text-t2">{formatBR(date)}</div>
                          </div>
                          <div className={`text-xs font-bold ${statusColor}`}>
                            {covered === slots.length ? '✓ Coberta' : covered > 0 ? `⚠ ${covered}/${slots.length}` : '✕ Sem sub.'}
                          </div>
                        </div>
                        {slots.map(sl => <SlotRow key={sl.id} sl={sl} store={store} isAdmin={isAdmin} />)}
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

function ViewByDay({ store, isAdmin, allSlots, selDate, setSelDate }) {
  const today = new Date().toISOString().split('T')[0]
  const date  = selDate ?? today
  const datesWithAbs = [...new Set(allSlots.map(s => s.date))].sort().reverse()
  const slotsOnDate  = allSlots.filter(sl => sl.date === date)

  const handlePDF = () => openPDF(generateByDayHTML(date, store))

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
          <button onClick={handlePDF} className="btn btn-ghost btn-sm ml-auto">📄 Exportar PDF</button>
        )}
      </div>
      {slotsOnDate.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-sm font-bold text-t2">Sem ausências em {formatBR(date)}</div>
        </div>
      ) : (
        <GroupedByTeacher slots={slotsOnDate} store={store} isAdmin={isAdmin} />
      )}
    </div>
  )
}

// ─── View: Por Semana ─────────────────────────────────────────────────────────

function ViewByWeek({ store, isAdmin, allSlots, weekRef, setWeekRef }) {
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

  const handlePDF = () => openPDF(generateByWeekHTML(monISO, filterTeacher || null, store))

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
          <button onClick={handlePDF} className="btn btn-ghost btn-sm ml-auto">📄 Exportar PDF</button>
        )}
      </div>

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
            <GroupedByTeacher slots={daySlots} store={store} isAdmin={isAdmin} />
          </div>
        )
      })}
    </div>
  )
}

// ─── View: Por Mês ────────────────────────────────────────────────────────────

function ViewByMonth({ store, isAdmin, allSlots, monthRef, setMonthRef }) {
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

  const handlePDF = () => openPDF(generateByMonthHTML(year, month, filterTeacher || null, store))

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
          <button onClick={handlePDF} className="btn btn-ghost btn-sm ml-auto">📄 Exportar PDF</button>
        )}
      </div>

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
          <GroupedByTeacher slots={byDate[date]} store={store} isAdmin={isAdmin} />
        </div>
      ))}
    </div>
  )
}

// ─── GroupedByTeacher ─────────────────────────────────────────────────────────

function GroupedByTeacher({ slots, store, isAdmin }) {
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
            {tSlots.map(sl => <SlotRow key={sl.id} sl={sl} store={store} isAdmin={isAdmin} />)}
          </div>
        )
      })}
    </div>
  )
}
