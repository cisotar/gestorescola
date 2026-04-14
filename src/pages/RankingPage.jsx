import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import { businessDaysBetween, dateToDayLabel, formatISO } from '../lib/helpers'
import { openPDF, generateAssiduityRankingHTML } from '../lib/reports'

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const now = new Date()

export default function RankingPage() {
  const navigate = useNavigate()
  const store    = useAppStore()

  const [filterMonth, setFilterMonth] = useState(now.getMonth())
  const [filterYear,  setFilterYear]  = useState(now.getFullYear())

  useEffect(() => {
    store.loadAbsencesIfNeeded()
  }, [store])

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  const rankingRows = useMemo(() => {
    const monthStart = formatISO(new Date(filterYear, filterMonth, 1))
    const monthEnd   = formatISO(new Date(filterYear, filterMonth + 1, 0))
    const days       = businessDaysBetween(monthStart, monthEnd)
    const dayLabels  = days.map(d => dateToDayLabel(d)).filter(Boolean)

    const schedByTeacherDay = new Map()
    ;(store.schedules ?? []).forEach(s => {
      const key = `${s.teacherId}||${s.day}`
      schedByTeacherDay.set(key, (schedByTeacherDay.get(key) ?? 0) + 1)
    })

    const absByTeacher  = new Map()
    const subsByTeacher = new Map()
    ;(store.absences ?? []).forEach(ab => {
      ab.slots.forEach(sl => {
        if (sl.date < monthStart || sl.date > monthEnd) return
        absByTeacher.set(ab.teacherId, (absByTeacher.get(ab.teacherId) ?? 0) + 1)
        if (sl.substituteId) {
          subsByTeacher.set(sl.substituteId, (subsByTeacher.get(sl.substituteId) ?? 0) + 1)
        }
      })
    })

    return (store.teachers ?? []).map(t => {
      const scheduled      = dayLabels.reduce((acc, lbl) => acc + (schedByTeacherDay.get(`${t.id}||${lbl}`) ?? 0), 0)
      const absences       = absByTeacher.get(t.id) ?? 0
      const subsRealizadas = subsByTeacher.get(t.id) ?? 0
      const saldo          = scheduled - absences + subsRealizadas
      const pctAssiduidade = scheduled > 0
        ? Math.min(100, Math.max(0, Math.round((scheduled - absences) / scheduled * 100)))
        : null
      return { teacher: t, scheduled, absences, subsRealizadas, saldo, pctAssiduidade }
    })
  }, [store.teachers, store.schedules, store.absences, filterMonth, filterYear])

  const sortedRanking = useMemo(() => {
    return [...rankingRows].sort((a, b) => {
      const pa = a.pctAssiduidade ?? -1
      const pb = b.pctAssiduidade ?? -1
      if (pb !== pa) return pb - pa
      return a.teacher.name.localeCompare(b.teacher.name)
    })
  }, [rankingRows])

  const handleGerarRelatorio = () =>
    openPDF(generateAssiduityRankingHTML(sortedRanking, filterMonth, filterYear))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/substitutions')}
          className="btn btn-ghost btn-sm"
        >
          ← Voltar
        </button>
        <h1 className="text-xl font-extrabold tracking-tight">Ranking de Assiduidade</h1>
      </div>

      {/* Filtros + Botão */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-t3 uppercase tracking-wide">Mês</label>
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(Number(e.target.value))}
            className="input text-sm"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-t3 uppercase tracking-wide">Ano</label>
          <select
            value={filterYear}
            onChange={e => setFilterYear(Number(e.target.value))}
            className="input text-sm"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleGerarRelatorio}
          className="btn btn-primary btn-sm ml-auto"
        >
          Gerar Relatório
        </button>
      </div>

      {/* Tabela */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-bdr">
          <div className="font-bold text-sm">
            {MONTH_NAMES[filterMonth]} {filterYear}
          </div>
          <div className="text-xs text-t3">{sortedRanking.length} professores</div>
        </div>

        {sortedRanking.length === 0 ? (
          <div className="p-8 text-center text-t3 text-sm">Nenhum professor cadastrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-surf2">
                  {['#', 'Professor', 'Aulas Próprias', 'Ausências', 'Subs Realizadas', 'Saldo', '% Assiduidade'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-t3 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRanking.map((row, idx) => (
                  <tr key={row.teacher.id} className="border-b border-bdr/50 hover:bg-surf2 transition-colors">
                    <td className="px-4 py-3 font-bold text-t3 text-xs">{idx + 1}º</td>
                    <td className="px-4 py-3 font-semibold text-sm">{row.teacher.name}</td>
                    <td className="px-4 py-3 text-center font-bold">{row.scheduled}</td>
                    <td className="px-4 py-3 text-center font-bold text-err text-xs">{row.absences || '—'}</td>
                    <td className="px-4 py-3 text-center font-bold text-ok text-xs">{row.subsRealizadas || '—'}</td>
                    <td className={`px-4 py-3 text-center font-bold text-xs ${row.saldo < 0 ? 'text-err' : 'text-t1'}`}>
                      {row.saldo}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.pctAssiduidade !== null ? (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          row.pctAssiduidade >= 90 ? 'bg-ok-l text-ok' :
                          row.pctAssiduidade >= 75 ? 'bg-amber-50 text-amber-700' :
                          'bg-err-l text-err'
                        }`}>
                          {row.pctAssiduidade}%
                        </span>
                      ) : (
                        <span className="text-xs text-t3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
