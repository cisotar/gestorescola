import { useState, useMemo } from 'react'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { allTurmaObjects, findTurma, parseDate, colorOfTeacher, teacherSubjectNames,
         businessDaysBetween, dateToDayLabel, formatISO, weekStart, formatBR } from '../lib/helpers'
import { slotLabel, getAulas, makeSlot } from '../lib/periods'
import {
  openPDF,
  generateSubstitutionTimesheetHTML,
  generateSubstitutionBalanceHTML,
  generateSubstitutionRankingHTML,
} from '../lib/reports'

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
  const store             = useAppStore()
  const { role, teacher } = useAuthStore()
  const isAdmin           = role === 'admin'

  // Filtros globais
  const [selSubstitute, setSelSubstitute] = useState(isAdmin ? null : (teacher?.id ?? null))
  const [selSegment,    setSelSegment]    = useState(null)
  const [selTurma,      setSelTurma]      = useState(null)
  const [filterMonth,   setFilterMonth]   = useState(new Date().getMonth())
  const [filterYear,    setFilterYear]    = useState(new Date().getFullYear())

  // Tab ativa
  const [mode, setMode] = useState('substitute')

  const handleTabChange = (id) => setMode(id)

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
    { id: 'ranking',    label: '🏆 Ranking' },
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
    <div>
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
        />
      )}
      {mode === 'day'        && <ViewByDay        store={store} isAdmin={isAdmin} filteredSlots={filteredSlots} selSegment={selSegment} selTurma={selTurma} />}
      {mode === 'week'       && <ViewByWeek       store={store} isAdmin={isAdmin} filteredSlots={filteredSlots} />}
      {mode === 'month'      && <ViewByMonth      store={store} isAdmin={isAdmin} filteredSlots={filteredSlots} filterMonth={filterMonth} filterYear={filterYear} />}
      {mode === 'ranking'    && <ViewRanking      store={store} isAdmin={isAdmin} filteredSlots={filteredSlots} filterMonth={filterMonth} filterYear={filterYear} />}
    </div>
  )
}

// ─── SubSlotRow ───────────────────────────────────────────────────────────────

function SubSlotRow({ sl, store }) {
  const sub     = store.teachers.find(t => t.id === sl.substituteId)
  const teacher = store.teachers.find(t => t.id === sl.teacherId)
  return (
    <div className="flex items-center gap-2 py-1.5 text-xs border-b border-bdr/60 last:border-0">
      <span className="font-mono text-[11px] text-t2 shrink-0">
        {slotLabel(sl.timeSlot, store.periodConfigs)}
      </span>
      <span className="text-t3">·</span>
      <span className="font-bold text-t1 truncate">{sl.turma}</span>
      <span className="text-t3">—</span>
      <span className="text-ok font-bold truncate">{sub?.name ?? '—'}</span>
      <span className="text-t3">cobriu</span>
      <span className="text-t2 truncate">{teacher?.name ?? '—'}</span>
    </div>
  )
}

// ─── TeacherSubCard ───────────────────────────────────────────────────────────

function TeacherSubCard({ teacher, store, coveredSlots, absenceCount, filters }) {
  const [open, setOpen] = useState(false)
  const cv            = colorOfTeacher(teacher, store)
  const covered       = coveredSlots.length
  const balance       = covered - absenceCount
  const balanceClass  = balance >= 0 ? 'text-ok' : 'text-err'
  const balanceLabel  = balance >= 0 ? `+${balance}` : `${balance}`

  const handleTimesheetPDF = (e) => {
    e.stopPropagation()
    openPDF(generateSubstitutionTimesheetHTML(teacher, coveredSlots, store))
  }

  const handleBalancePDF = (e) => {
    e.stopPropagation()
    const absenceSlots = computeAbsenceSlots(teacher.id, filters, store)
    openPDF(generateSubstitutionBalanceHTML(teacher, coveredSlots, absenceSlots, store))
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div
        className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
        style={{ background: cv.bg, borderBottom: open ? `1px solid ${cv.bd}` : 'none' }}
      >
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-90"
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-extrabold shrink-0"
            style={{ background: cv.tg, color: cv.tx }}
          >
            {teacher.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-sm truncate" style={{ color: cv.tx }}>
              {teacher.name}
            </div>
            <div className="text-[11px] opacity-70 truncate" style={{ color: cv.tx }}>
              {teacherSubjectNames(teacher, store.subjects) || '—'}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTimesheetPDF}
            className="btn btn-ghost btn-sm"
            title="Folha de Ponto"
          >
            📄 Folha de Ponto
          </button>
          <button
            type="button"
            onClick={handleBalancePDF}
            className="btn btn-ghost btn-sm"
            title="Extrato de Saldo"
          >
            📄 Extrato de Saldo
          </button>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-surf border border-bdr text-t1">
            {covered} coberta{covered !== 1 ? 's' : ''}
          </span>
          <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-surf border border-bdr ${balanceClass}`}>
            saldo {balanceLabel}
          </span>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="text-t3 text-xs ml-1 p-1"
            aria-label={open ? 'Colapsar' : 'Expandir'}
          >
            {open ? '▾' : '▸'}
          </button>
        </div>
      </div>
      {open && (
        <div className="px-4 py-2 bg-surf">
          {coveredSlots.length === 0
            ? <div className="text-xs text-t3 py-2">Nenhuma aula coberta no período.</div>
            : coveredSlots.map(sl => (
                <SubSlotRow key={sl.id} sl={sl} store={store} />
              ))
          }
        </div>
      )}
    </div>
  )
}

// ─── ViewBySubstitute ─────────────────────────────────────────────────────────

function ViewBySubstitute({
  store,
  filteredSlotsAllSubs,
  absenceCountByTeacher,
  selSubstitute,
  filters,
}) {
  const ids = selSubstitute
    ? [selSubstitute]
    : [...new Set(filteredSlotsAllSubs.map(sl => sl.substituteId))]

  const teachers = ids
    .map(id => store.teachers.find(t => t.id === id))
    .filter(Boolean)
    .map(t => {
      const coveredSlots = filteredSlotsAllSubs.filter(sl => sl.substituteId === t.id)
      return { teacher: t, coveredSlots }
    })
    .filter(({ coveredSlots }) => coveredSlots.length > 0)
    .sort((a, b) => a.teacher.name.localeCompare(b.teacher.name))

  if (teachers.length === 0) {
    return (
      <div className="card text-center py-8">
        <div className="text-3xl mb-2">✅</div>
        <div className="text-sm font-bold text-t2">Nenhuma substituição no período</div>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {teachers.map(({ teacher, coveredSlots }) => (
        <TeacherSubCard
          key={teacher.id}
          teacher={teacher}
          store={store}
          coveredSlots={coveredSlots}
          absenceCount={absenceCountByTeacher.get(teacher.id) ?? 0}
          filters={filters}
        />
      ))}
    </div>
  )
}

// ─── ViewByDay helpers ────────────────────────────────────────────────────────

function dayDisplayName(teacher) {
  if (!teacher) return '—'
  if (teacher.apelido?.trim()) return teacher.apelido.trim()
  return teacher.name?.split(' ')[0] ?? teacher.name ?? '—'
}

function initialDate() {
  const today = new Date()
  const day = today.getDay()
  if (day === 0) today.setDate(today.getDate() + 1)       // domingo → segunda
  else if (day === 6) today.setDate(today.getDate() + 2)  // sábado → segunda
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

// ─── DayPicker ────────────────────────────────────────────────────────────────

function DayPicker({ selDate, setSelDate }) {
  const dayLabel = dateToDayLabel(selDate)
  const label = `${dayLabel ?? 'Fim de semana'}, ${formatBR(selDate)}`
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setSelDate(prevBusinessDay(selDate))}
        aria-label="Dia anterior"
      >◀</button>
      <div className="text-sm font-bold text-t1 px-2 min-w-[180px] text-center">
        {label}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setSelDate(nextBusinessDay(selDate))}
        aria-label="Próximo dia"
      >▶</button>
      <input
        type="date"
        className="inp ml-2"
        value={selDate}
        onChange={e => e.target.value && setSelDate(e.target.value)}
      />
    </div>
  )
}

// ─── DayGridBySegment ─────────────────────────────────────────────────────────

function DayGridBySegment({ seg, store, dayLabel, subByTurmaSlot, turmaFilter }) {
  const turno = seg.turno ?? 'manha'
  const aulas = getAulas(seg.id, turno, store.periodConfigs)
  let turmas = (seg.grades ?? []).flatMap(g =>
    (g.classes ?? []).map(c => `${g.name} ${c.letter}`)
  )
  if (turmaFilter) turmas = turmas.filter(t => t === turmaFilter)

  if (!turmas.length || !aulas.length) return null

  return (
    <div className="card p-0 overflow-x-auto mb-4">
      <div className="px-4 py-2 bg-surf2 border-b border-bdr">
        <div className="font-extrabold text-sm text-t1">{seg.name}</div>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-surf2 border-b border-bdr">
            <th className="px-3 py-2 text-left font-bold text-t2 w-[110px]">Aula</th>
            {turmas.map(t => (
              <th key={t} className="px-2 py-2 text-center font-bold text-t2 min-w-[100px]">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {aulas.map(p => {
            const slot = makeSlot(seg.id, turno, p.aulaIdx)
            return (
              <tr key={p.aulaIdx} className="border-b border-bdr/50">
                <td className="px-3 py-1.5 align-top">
                  <div className="font-bold font-mono">{p.label}</div>
                  <div className="font-mono text-t3 text-[10px]">{p.inicio}–{p.fim}</div>
                </td>
                {turmas.map(turma => {
                  const sched = (store.schedules ?? []).find(s =>
                    s.day === dayLabel && s.timeSlot === slot && s.turma === turma
                  )
                  const titular = sched ? store.teachers.find(t => t.id === sched.teacherId) : null
                  const subDisplay = subByTurmaSlot.get(`${turma}||${slot}`)
                  return (
                    <td key={turma} className="px-1.5 py-1.5 align-top">
                      {subDisplay ? (
                        <div className="text-[11px] font-bold text-ok truncate">
                          ✓ {subDisplay}
                        </div>
                      ) : titular ? (
                        <div className="text-[11px] text-t2 truncate">
                          {dayDisplayName(titular)}
                        </div>
                      ) : (
                        <div className="text-[11px] text-t3">—</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── ViewByDay ────────────────────────────────────────────────────────────────

function ViewByDay({ store, filteredSlots, selSegment, selTurma }) {
  const [selDate, setSelDate] = useState(() => initialDate())
  const dayLabel = dateToDayLabel(selDate)

  const daySlots = useMemo(
    () => filteredSlots.filter(sl => sl.date === selDate && sl.substituteId),
    [filteredSlots, selDate]
  )

  const subByTurmaSlot = useMemo(() => {
    const map = new Map()
    for (const sl of daySlots) {
      const sub = store.teachers.find(t => t.id === sl.substituteId)
      map.set(`${sl.turma}||${sl.timeSlot}`, dayDisplayName(sub))
    }
    return map
  }, [daySlots, store.teachers])

  const segmentsToRender = selSegment
    ? store.segments.filter(s => s.id === selSegment)
    : store.segments

  if (dayLabel === null) {
    return (
      <div>
        <DayPicker selDate={selDate} setSelDate={setSelDate} />
        <div className="card text-center py-8 text-t3 text-sm">
          Sem aulas em fim de semana.
        </div>
      </div>
    )
  }

  const renderedSegments = segmentsToRender.filter(seg => {
    const turmas = (seg.grades ?? []).flatMap(g =>
      (g.classes ?? []).map(c => `${g.name} ${c.letter}`)
    )
    const filtered = selTurma ? turmas.filter(t => t === selTurma) : turmas
    const aulas = getAulas(seg.id, seg.turno ?? 'manha', store.periodConfigs)
    return filtered.length > 0 && aulas.length > 0
  })

  return (
    <div>
      <DayPicker selDate={selDate} setSelDate={setSelDate} />
      {daySlots.length === 0 && (
        <div className="text-xs text-t3 mb-3">
          Nenhuma substituição neste dia no período filtrado.
        </div>
      )}
      {renderedSegments.length === 0 ? (
        <div className="card text-center py-8 text-t3 text-sm">
          Nenhum segmento com aulas para exibir.
        </div>
      ) : (
        renderedSegments.map(seg => (
          <DayGridBySegment
            key={seg.id}
            seg={seg}
            store={store}
            selDate={selDate}
            dayLabel={dayLabel}
            subByTurmaSlot={subByTurmaSlot}
            turmaFilter={selTurma}
          />
        ))
      )}
    </div>
  )
}

// ─── ViewByWeek ───────────────────────────────────────────────────────────────

function ViewByWeek({ store, filteredSlots }) {
  const [weekRef, setWeekRef] = useState(() => weekStart(formatISO(new Date())))

  const monISO  = weekRef
  const monDate = parseDate(monISO)
  const friDate = new Date(monDate); friDate.setDate(monDate.getDate() + 4)
  const friISO  = formatISO(friDate)
  const label   = `${formatBR(monISO)} – ${formatBR(friISO)}`

  const prev = () => {
    const d = parseDate(monISO); d.setDate(d.getDate() - 7); setWeekRef(formatISO(d))
  }
  const next = () => {
    const d = parseDate(monISO); d.setDate(d.getDate() + 7); setWeekRef(formatISO(d))
  }

  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monDate); d.setDate(monDate.getDate() + i); return formatISO(d)
  }), [monISO])

  const weekSlots = useMemo(
    () => filteredSlots.filter(sl => sl.date >= monISO && sl.date <= friISO),
    [filteredSlots, monISO, friISO]
  )

  const byDate = useMemo(() => {
    const out = {}
    for (const sl of weekSlots) {
      if (!sl.date) continue
      if (!out[sl.date]) out[sl.date] = []
      out[sl.date].push(sl)
    }
    return out
  }, [weekSlots])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button className="btn btn-ghost btn-sm" onClick={prev}>◀ Semana anterior</button>
        <div className="font-bold text-sm min-w-[200px] text-center">{label}</div>
        <button className="btn btn-ghost btn-sm" onClick={next}>Semana seguinte ▶</button>
        <button
          className="btn btn-ghost btn-xs text-accent"
          onClick={() => setWeekRef(weekStart(formatISO(new Date())))}
        >
          Hoje
        </button>
      </div>

      {weekSlots.length === 0 ? (
        <p className="text-t3 text-sm">Nenhuma substituição neste período.</p>
      ) : (
        days.map(date => {
          const daySlots = byDate[date]
          if (!daySlots?.length) return null
          return (
            <div key={date}>
              <div className="text-xs font-bold text-t2 uppercase tracking-wider py-1 mt-3">
                {dateToDayLabel(date)} — {formatBR(date)}
              </div>
              {daySlots.map(sl => <SubSlotRow key={sl.id} sl={sl} store={store} />)}
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── ViewByMonth ──────────────────────────────────────────────────────────────

function ViewByMonth({ store, filteredSlots, filterMonth, filterYear }) {
  // filteredSlots já vem restrito ao mês pelo pai, mas aplicamos novamente
  // por robustez e para deixar a intenção explícita no componente.
  const monthSlots = useMemo(() => filteredSlots.filter(sl => {
    if (!sl.date) return false
    const d = parseDate(sl.date)
    return d.getMonth() === filterMonth && d.getFullYear() === filterYear
  }), [filteredSlots, filterMonth, filterYear])

  const byDate = useMemo(() => {
    const out = {}
    for (const sl of monthSlots) {
      if (!out[sl.date]) out[sl.date] = []
      out[sl.date].push(sl)
    }
    return out
  }, [monthSlots])

  const sortedDates = useMemo(() => Object.keys(byDate).sort(), [byDate])

  if (monthSlots.length === 0) {
    return <p className="text-t3 text-sm">Nenhuma substituição neste período.</p>
  }

  return (
    <div>
      {sortedDates.map(date => (
        <div key={date}>
          <div className="text-xs font-bold text-t2 uppercase tracking-wider py-1 mt-3">
            {dateToDayLabel(date)} — {formatBR(date)}
          </div>
          {byDate[date].map(sl => <SubSlotRow key={sl.id} sl={sl} store={store} />)}
        </div>
      ))}
    </div>
  )
}
// ─── Ranking ─────────────────────────────────────────────────────────────────
// Usa a mesma lógica de contagem de src/lib/absences.js → monthlyLoad,
// mas (1) varre o mês inteiro (não só até hoje) e (2) retorna scheduled e
// substitutions separados para suportar sub-legenda e alternância de ordenação.
// Ignora `filteredSlots` de propósito — ranking é sempre global.
function ViewRanking({ store, filterMonth, filterYear }) {
  const [sortBy, setSortBy] = useState('total') // 'total' | 'substitutions'

  const rows = useMemo(() => {
    const monthStart = formatISO(new Date(filterYear, filterMonth, 1))
    const monthEnd   = formatISO(new Date(filterYear, filterMonth + 1, 0))
    const days       = businessDaysBetween(monthStart, monthEnd)

    const dayLabels = days.map(d => dateToDayLabel(d)).filter(Boolean)

    const subsByTeacher = new Map()
    ;(store.absences ?? []).forEach(ab => {
      ab.slots.forEach(sl => {
        if (!sl.substituteId) return
        if (sl.date < monthStart || sl.date > monthEnd) return
        subsByTeacher.set(sl.substituteId, (subsByTeacher.get(sl.substituteId) ?? 0) + 1)
      })
    })

    const schedByTeacherDay = new Map()
    ;(store.schedules ?? []).forEach(s => {
      const key = `${s.teacherId}||${s.day}`
      schedByTeacherDay.set(key, (schedByTeacherDay.get(key) ?? 0) + 1)
    })

    return (store.teachers ?? []).map(t => {
      const scheduled = dayLabels.reduce(
        (acc, lbl) => acc + (schedByTeacherDay.get(`${t.id}||${lbl}`) ?? 0),
        0
      )
      const substitutions = subsByTeacher.get(t.id) ?? 0
      return {
        teacher: t,
        scheduled,
        substitutions,
        total: scheduled + substitutions,
      }
    })
  }, [store.teachers, store.schedules, store.absences, filterMonth, filterYear])

  const sorted = useMemo(() => {
    const key = sortBy
    return [...rows].sort((a, b) => {
      if (b[key] !== a[key]) return b[key] - a[key]
      return a.teacher.name.localeCompare(b.teacher.name)
    })
  }, [rows, sortBy])

  const toggleLabel = sortBy === 'total'
    ? 'Ordenar por: Apenas Substituições'
    : 'Ordenar por: Carga Total'

  const handleRankingPDF = () => {
    openPDF(generateSubstitutionRankingHTML(sorted, filterMonth, filterYear, store))
  }

  if (!sorted.length) {
    return <div className="text-t3 text-sm p-4">Nenhum professor cadastrado.</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleRankingPDF}
        >
          📄 PDF Ranking
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setSortBy(s => s === 'total' ? 'substitutions' : 'total')}
        >
          {toggleLabel}
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <ul className="divide-y divide-bdr/60">
          {sorted.map((r, idx) => {
            const cor = colorOfTeacher(r.teacher, store)
            const mainValue = sortBy === 'total' ? r.total : r.substitutions
            return (
              <li key={r.teacher.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surf2 transition-colors">
                <div className="w-8 text-t3 text-xs font-mono tabular-nums">#{idx + 1}</div>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: cor.bg, color: cor.tx, borderColor: cor.bd, borderWidth: 1 }}
                >
                  {r.teacher.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-t1 text-sm truncate">{r.teacher.name}</div>
                  <div className="text-t3 text-xs">
                    {r.scheduled} próprias | {r.substitutions} substituições
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-t1 tabular-nums">
                  {mainValue}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
