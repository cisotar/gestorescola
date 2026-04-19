import { useState } from 'react'
import useAppStore from '../store/useAppStore'
import SchoolGrid from '../components/ui/SchoolGrid'
import { openPDF, generateSchoolScheduleHTML } from '../lib/reports'

export default function SchoolSchedulePage() {

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
