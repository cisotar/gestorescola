import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { getAulas, getCfg, gerarPeriodosEspeciais, makeEspecialSlot, toMin } from '../lib/periods'
import { openPDF, generateSchoolScheduleHTML } from '../lib/reports'
import { isSharedSeriesTurma, getSharedSeriesActivity } from '../lib/helpers'

const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']

function SchoolGrid({ seg, schedules, store, showTeacher = true, useApelido = false }) {
  const turno = seg.turno ?? 'manha'
  const aulas = getAulas(seg.id, turno, store.periodConfigs)
  const cfg = getCfg(seg.id, turno, store.periodConfigs)
  const especiais = gerarPeriodosEspeciais(cfg)

  if (aulas.length === 0) return null

  // Atribuir espCount ANTES do sort para preservar os timeSlots do Firestore
  let espCount = 0
  const periodosEspeciais = especiais
    .filter(p => !p.isIntervalo)
    .map(p => {
      espCount += 1
      return { ...p, _tipo: 'especial', _espIdx: espCount, _slotKey: makeEspecialSlot(seg.id, turno, espCount) }
    })

  const periodosRegulares = aulas.map(p => ({ ...p, _tipo: 'regular' }))

  const periodos = [...periodosRegulares, ...periodosEspeciais]
    .sort((a, b) => toMin(a.inicio) - toMin(b.inicio))

  let regIdx = 0

  return (
    <div className="overflow-x-auto rounded-xl border border-bdr">
      <table className="w-full text-xs border-collapse table-fixed">
        <thead>
          <tr className="bg-surf2">
            <th className="text-left px-3 py-2 font-bold text-[#1a1814] w-[90px] border-b border-bdr">Aula</th>
            {DAYS.map(d => (
              <th key={d} className="text-left px-3 py-2 font-bold text-[#1a1814] border-b border-bdr">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periodos.map((p) => {
            if (p._tipo === 'regular') {
              const aula = p
              const daySlots = DAYS.map(day => {
                return schedules.filter(s => {
                  if (!s.timeSlot) return false
                  const [sid, , ai] = s.timeSlot.split('|')
                  return sid === seg.id && Number(ai) === aula.aulaIdx && s.day === day
                })
              })

              const isEmpty = daySlots.every(ds => ds.length === 0)
              if (isEmpty) return null

              const stripe = regIdx % 2 === 0 ? 'bg-bg' : 'bg-surf'
              regIdx += 1

              return (
                <tr key={aula.aulaIdx} className={stripe}>
                  <td className="px-3 py-2 font-bold text-[#1a1814] whitespace-nowrap align-top border-r border-bdr">
                    <div>{aula.label}</div>
                    {aula.inicio && (
                      <div className="text-[10px] text-[#4a4740]">{aula.inicio}–{aula.fim}</div>
                    )}
                  </td>
                  {daySlots.map((matches, dayIdx) => (
                    <td key={dayIdx} className="px-2 py-2 align-top border-r border-bdr last:border-r-0">
                      {matches.length === 0 ? (
                        <span className="text-t3">—</span>
                      ) : (
                        <div className="space-y-1">
                          {matches.map(s => {
                            const teacher = store.teachers.find(t => t.id === s.teacherId)
                            const subject = store.subjects?.find(sub => sub.id === s.subjectId)
                            const isShared = isSharedSeriesTurma(s.turma, store.sharedSeries)
                            const sharedAct = isShared ? getSharedSeriesActivity(s.subjectId, store.sharedSeries) : null
                            const displayLabel = isShared
                              ? `${s.turma} · ${sharedAct?.name ?? '?'}`
                              : s.turma
                            return (
                              <div key={s.id} className="leading-tight">
                                {showTeacher ? (
                                  <>
                                    <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide">{useApelido ? (teacher?.apelido || teacher?.name || '—') : (teacher?.name || '—')}</div>
                                    <div className="text-[#4a4740] text-[10px]">{subject?.name ?? '—'}</div>
                                  </>
                                ) : (
                                  <>
                                    <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide">{displayLabel ?? '—'}</div>
                                    <div className="text-[#4a4740] text-[10px]">{subject?.name ?? '—'}</div>
                                  </>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              )
            } else {
              // _tipo === 'especial'
              const slotKey = p._slotKey
              const daySlots = DAYS.map(day =>
                schedules.filter(s => s.timeSlot === slotKey && s.day === day)
              )
              return (
                <tr key={`esp-${p._espIdx}`} className="bg-surf2 border-b border-bdr/50">
                  <td className="px-3 py-2 font-bold text-[#1a1814] whitespace-nowrap align-top border-r border-bdr border-l-2 border-accent bg-surf2">
                    <div>{p.label}</div>
                    {p.inicio && (
                      <div className="text-[10px] text-[#4a4740]">{p.inicio}–{p.fim}</div>
                    )}
                  </td>
                  {daySlots.map((matches, dayIdx) => (
                    matches.length === 0 ? (
                      <td key={dayIdx} className="px-2 py-2 align-top border-r border-bdr last:border-r-0 bg-surf2" />
                    ) : (
                      <td key={dayIdx} className="px-2 py-2 align-top border-r border-bdr last:border-r-0 bg-surf2">
                        <div className="space-y-1">
                          {matches.map(s => {
                            const teacher = store.teachers.find(t => t.id === s.teacherId)
                            const subject = store.subjects?.find(sub => sub.id === s.subjectId)
                            const isShared = isSharedSeriesTurma(s.turma, store.sharedSeries)
                            const sharedAct = isShared ? getSharedSeriesActivity(s.subjectId, store.sharedSeries) : null
                            const displayLabel = isShared
                              ? `${s.turma} · ${sharedAct?.name ?? '?'}`
                              : s.turma
                            return (
                              <div key={s.id} className="leading-tight">
                                {showTeacher ? (
                                  <>
                                    <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide">{useApelido ? (teacher?.apelido || teacher?.name || '—') : (teacher?.name || '—')}</div>
                                    <div className="text-[#4a4740] text-[10px]">{subject?.name ?? '—'}</div>
                                  </>
                                ) : (
                                  <>
                                    <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide">{displayLabel ?? '—'}</div>
                                    <div className="text-[#4a4740] text-[10px]">{subject?.name ?? '—'}</div>
                                  </>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    )
                  ))}
                </tr>
              )
            }
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function SchoolSchedulePage() {
  const { role } = useAuthStore()
  if (role !== 'admin') return <Navigate to="/home" replace />

  const store = useAppStore()
  const [filterTeacher,  setFilterTeacher]  = useState('')
  const [filterSegmento, setFilterSegmento] = useState('')
  const [filterTurma,    setFilterTurma]    = useState('')
  const [filtersOpen,    setFiltersOpen]    = useState(false)
  const [useApelido,     setUseApelido]     = useState(false)

  const anyHasApelido = store.teachers.some(t => t.apelido)

  // Listas para os selects
  const teachersWithSchedules = store.teachers
    .filter(t => store.schedules.some(s => s.teacherId === t.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  const segmentosComSchedules = store.segments.filter(seg =>
    store.schedules.some(s =>
      s.timeSlot?.split('|')[0] === seg.id &&
      (!filterTeacher || s.teacherId === filterTeacher)
    )
  )

  const allTurmas = [...new Set(
    store.schedules
      .filter(s =>
        (!filterTeacher  || s.teacherId === filterTeacher) &&
        (!filterSegmento || s.timeSlot?.split('|')[0] === filterSegmento)
      )
      .map(s => s.turma)
      .filter(Boolean)
  )].sort()

  // Schedules filtrados
  const filtered = store.schedules.filter(s =>
    (!filterTeacher  || s.teacherId === filterTeacher) &&
    (!filterSegmento || s.timeSlot?.split('|')[0] === filterSegmento) &&
    (!filterTurma    || s.turma    === filterTurma)
  )

  // Segmentos com schedules filtrados
  const segIds = [...new Set(filtered.map(s => s.timeSlot?.split('|')[0]).filter(Boolean))]
  const relevantSegments = store.segments.filter(s => segIds.includes(s.id))

  const hasFilters = filterTeacher || filterSegmento || filterTurma

  function clearFilters() {
    setFilterTeacher('')
    setFilterSegmento('')
    setFilterTurma('')
  }

  const totalSchedules = store.schedules.length

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-extrabold tracking-tight flex-1">Grade Horária da Escola</h1>
        {anyHasApelido && (
          <div className="flex items-center gap-1 rounded-lg border border-bdr bg-surf2 p-0.5 text-xs">
            <button
              className={!useApelido ? 'px-2 py-0.5 rounded bg-surf border border-bdr font-semibold text-t1' : 'px-2 py-0.5 rounded text-t2'}
              onClick={() => setUseApelido(false)}
            >Nome</button>
            <button
              className={useApelido ? 'px-2 py-0.5 rounded bg-surf border border-bdr font-semibold text-t1' : 'px-2 py-0.5 rounded text-t2'}
              onClick={() => setUseApelido(true)}
            >Apelido</button>
          </div>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => openPDF(generateSchoolScheduleHTML(
            { teacherId: filterTeacher || undefined, segmento: filterSegmento || undefined, turma: filterTurma || undefined, useApelido },
            store
          ))}
        >
          📄 Exportar PDF
        </button>
      </div>

      {/* Layout: sidebar desktop + accordion mobile */}
      <div className="lg:flex gap-6 items-start">

        {/* Filtros */}
        <div className="lg:w-64 shrink-0">

          {/* Mobile: accordion toggle */}
          <div className="lg:hidden mb-3">
            <button
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-surf border border-bdr text-sm font-semibold"
              onClick={() => setFiltersOpen(v => !v)}
            >
              <span>🔍 Filtros {hasFilters ? '(ativos)' : ''}</span>
              <span>{filtersOpen ? '▲' : '▼'}</span>
            </button>
          </div>

          {/* Painel de filtros — sempre visível em lg, toggle em mobile */}
          <div className={`space-y-4 ${filtersOpen ? 'block' : 'hidden'} lg:block`}>
            <div className="card p-4 space-y-4">
              <div className="text-xs font-bold text-t2 uppercase tracking-wider">Filtros</div>

              {/* Filtro professor */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-t2">Professor</label>
                <select
                  className="inp w-full text-sm"
                  value={filterTeacher}
                  onChange={e => {
                    setFilterTeacher(e.target.value)
                    setFilterSegmento('')
                    setFilterTurma('')
                  }}
                >
                  <option value="">Todos os professores</option>
                  {teachersWithSchedules.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Filtro segmento */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-t2">Segmento</label>
                <select
                  className="inp w-full text-sm"
                  value={filterSegmento}
                  onChange={e => {
                    setFilterSegmento(e.target.value)
                    setFilterTurma('')
                  }}
                >
                  <option value="">Todos os segmentos</option>
                  {segmentosComSchedules.map(seg => (
                    <option key={seg.id} value={seg.id}>{seg.name}</option>
                  ))}
                </select>
              </div>

              {/* Filtro turma */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-t2">Turma</label>
                <select
                  className="inp w-full text-sm"
                  value={filterTurma}
                  onChange={e => setFilterTurma(e.target.value)}
                >
                  <option value="">Todas as turmas</option>
                  {allTurmas.map(turma => (
                    <option key={turma} value={turma}>{turma}</option>
                  ))}
                </select>
              </div>

              {/* Limpar filtros */}
              {hasFilters && (
                <button
                  className="btn btn-ghost btn-sm w-full"
                  onClick={clearFilters}
                >
                  ✕ Limpar filtros
                </button>
              )}
            </div>

            {/* Chips de filtros ativos */}
            {hasFilters && (
              <div className="flex flex-wrap gap-2">
                {filterTeacher && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold">
                    {teachersWithSchedules.find(t => t.id === filterTeacher)?.name}
                    <button onClick={() => { setFilterTeacher(''); setFilterSegmento(''); setFilterTurma('') }} className="ml-1 text-accent/60 hover:text-accent">✕</button>
                  </span>
                )}
                {filterSegmento && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold">
                    {segmentosComSchedules.find(s => s.id === filterSegmento)?.name}
                    <button onClick={() => { setFilterSegmento(''); setFilterTurma('') }} className="ml-1 text-accent/60 hover:text-accent">✕</button>
                  </span>
                )}
                {filterTurma && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold">
                    {filterTurma}
                    <button onClick={() => setFilterTurma('')} className="ml-1 text-accent/60 hover:text-accent">✕</button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Grade principal */}
        <div className="flex-1 space-y-6 min-w-0">
          {totalSchedules === 0 ? (
            <div className="card text-center py-16 text-t3">Nenhum horário cadastrado.</div>
          ) : relevantSegments.length === 0 ? (
            <div className="card text-center py-16 text-t3">
              {hasFilters
                ? 'Nenhum horário encontrado para os filtros selecionados.'
                : 'Nenhum horário cadastrado.'}
            </div>
          ) : (
            relevantSegments.map(seg => {
              const turnoLabel = (seg.turno ?? 'manha') === 'tarde' ? '🌇 Tarde' : '🌅 Manhã'
              return (
                <div key={seg.id} className="card p-4 space-y-3">
                  <div className="text-sm font-bold text-t1">
                    {seg.name} — {turnoLabel}
                  </div>
                  <SchoolGrid
                    seg={seg}
                    schedules={filtered}
                    store={store}
                    showTeacher={!filterTeacher}
                    useApelido={useApelido}
                  />
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
