import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { getAulas } from '../lib/periods'
import { openPDF, generateSchoolScheduleHTML } from '../lib/reports'

const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']

function SchoolGrid({ seg, schedules, store }) {
  const turno = seg.turno ?? 'manha'
  const aulas = getAulas(seg.id, turno, store.periodConfigs)

  if (aulas.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-surface2">
            <th className="text-left px-3 py-2 font-semibold text-t2 w-20 border-b border-border">Aula</th>
            {DAYS.map(d => (
              <th key={d} className="text-left px-3 py-2 font-semibold text-t2 border-b border-border">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {aulas.map((aula, i) => {
            const daySlots = DAYS.map((_, dayIdx) => {
              const day = dayIdx + 1
              return schedules.filter(s => {
                if (!s.timeSlot) return false
                const [sid, , ai] = s.timeSlot.split('|')
                return sid === seg.id && Number(ai) === aula.aulaIdx && s.day === day
              })
            })

            const isEmpty = daySlots.every(ds => ds.length === 0)

            return (
              <tr key={aula.aulaIdx} className={i % 2 === 0 ? 'bg-bg' : 'bg-surface'}>
                <td className="px-3 py-2 font-medium text-t2 whitespace-nowrap align-top border-r border-border">
                  <div>{aula.label}</div>
                  {aula.inicio && (
                    <div className="text-[10px] text-t3">{aula.inicio}–{aula.fim}</div>
                  )}
                </td>
                {daySlots.map((matches, dayIdx) => (
                  <td key={dayIdx} className="px-2 py-2 align-top border-r border-border last:border-r-0">
                    {matches.length === 0 ? (
                      isEmpty ? null : <span className="text-t3">—</span>
                    ) : (
                      <div className="space-y-1">
                        {matches.map(s => {
                          const teacher = store.teachers.find(t => t.id === s.teacherId)
                          const subject = store.subjects?.find(sub => sub.id === s.subjectId)
                          return (
                            <div key={s.id} className="leading-tight">
                              <span className="font-semibold text-accent">{teacher?.name ?? '—'}</span>
                              <span className="text-t3"> • </span>
                              <span className="text-t2">{s.turma}</span>
                              {subject && (
                                <>
                                  <span className="text-t3"> • </span>
                                  <span className="text-t3">{subject.name}</span>
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
  const [filterTeacher, setFilterTeacher] = useState('')
  const [filterTurma,   setFilterTurma]   = useState('')
  const [filtersOpen,   setFiltersOpen]   = useState(false)

  // Listas para os selects
  const teachersWithSchedules = store.teachers
    .filter(t => store.schedules.some(s => s.teacherId === t.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  const allTurmas = [...new Set(
    store.schedules
      .filter(s => !filterTeacher || s.teacherId === filterTeacher)
      .map(s => s.turma)
      .filter(Boolean)
  )].sort()

  // Schedules filtrados
  const filtered = store.schedules.filter(s =>
    (!filterTeacher || s.teacherId === filterTeacher) &&
    (!filterTurma   || s.turma    === filterTurma)
  )

  // Segmentos com schedules filtrados
  const segIds = [...new Set(filtered.map(s => s.timeSlot?.split('|')[0]).filter(Boolean))]
  const relevantSegments = store.segments.filter(s => segIds.includes(s.id))

  const hasFilters = filterTeacher || filterTurma

  function clearFilters() {
    setFilterTeacher('')
    setFilterTurma('')
  }

  const totalSchedules = store.schedules.length

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-extrabold tracking-tight flex-1">Grade Horária da Escola</h1>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => openPDF(generateSchoolScheduleHTML(
            { teacherId: filterTeacher || undefined, turma: filterTurma || undefined },
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
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-surface border border-border text-sm font-semibold"
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
                  className="input w-full text-sm"
                  value={filterTeacher}
                  onChange={e => {
                    setFilterTeacher(e.target.value)
                    setFilterTurma('') // reset turma quando muda professor
                  }}
                >
                  <option value="">Todos os professores</option>
                  {teachersWithSchedules.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Filtro turma */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-t2">Turma</label>
                <select
                  className="input w-full text-sm"
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
                    <button onClick={() => setFilterTeacher('')} className="ml-1 text-accent/60 hover:text-accent">✕</button>
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
                <div key={seg.id} className="space-y-2">
                  <div className="text-sm font-bold text-t1">
                    {seg.name} — {turnoLabel}
                  </div>
                  <SchoolGrid
                    seg={seg}
                    schedules={filtered}
                    store={store}
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
