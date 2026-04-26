import { getCfg, makeEspecialSlot, mergeAndSortPeriodos } from '../../lib/periods'
import { isRestSlot } from '../../lib/helpers'

const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']

/**
 * SchoolGrid - Grade horária coletiva (por turma ou escola)
 *
 * Renderiza uma matriz de horários (dias da semana × aulas) para uma turma ou segmento específico.
 * Suporta exibição de professores ou turmas nas células.
 *
 * @param {Object} seg - Segmento { id, name, turno }
 * @param {Array} schedules - Array de schedules customizado para filtrar
 * @param {Object} store - Store useAppStore()
 * @param {boolean} [showTeacher=true] - Se true, exibe nomes de professores; se false, exibe nomes de turmas
 * @param {boolean} [useApelido=false] - Se true e showTeacher=true, exibe apelido do professor ao invés de nome completo
 */
export default function SchoolGrid({ seg, schedules, store, showTeacher = true, useApelido = false }) {
  const turno = seg.turno ?? 'manha'
  const cfg = getCfg(seg.id, turno, store.periodConfigs)

  if (!cfg) return null

  const periodos = mergeAndSortPeriodos(cfg)

  if (!periodos.some(p => !p.isIntervalo)) return null

  let regIdx = 0
  let espCount = 0

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
          {periodos.map((p, pIdx) => {
            if (p.isIntervalo) {
              return (
                <tr key={`intervalo-${pIdx}`} className="bg-surf2 border-b border-bdr/50">
                  <td className="px-3 py-2 whitespace-nowrap align-top border-r border-bdr bg-surf2">
                    <div className="text-xs font-semibold text-t2">{p.label}</div>
                    {p.inicio && (
                      <div className="font-mono text-[10px] text-t3">{p.inicio}–{p.fim}</div>
                    )}
                  </td>
                  {DAYS.map(day => (
                    <td key={day} className="px-2 py-2 align-top border-r border-bdr last:border-r-0 bg-surf2" />
                  ))}
                </tr>
              )
            }

            if (p._tipo === 'regular') {
              const aula = p
              const daySlots = DAYS.map(day => {
                return schedules.filter(s => {
                  if (!s.timeSlot) return false
                  const [sid, , ai] = s.timeSlot.split('|')
                  return sid === seg.id && Number(ai) === aula.aulaIdx && s.day === day
                })
              })

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
                            return (
                              <div key={s.id} className="leading-tight">
                                {showTeacher ? (
                                  <>
                                    <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide">{useApelido ? (teacher?.apelido || teacher?.name || '—') : (teacher?.name || '—')}</div>
                                    <div className="text-[#4a4740] text-[10px]">{isRestSlot(s.turma, store.sharedSeries) ? 'almoço/janta' : (subject?.name ?? '—')}</div>
                                    {s.sharedSubject && <span className="text-[9px] text-t3 truncate italic">{s.sharedSubject}</span>}
                                  </>
                                ) : (
                                  <>
                                    <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide">{s.turma ?? '—'}</div>
                                    <div className="text-[#4a4740] text-[10px]">{isRestSlot(s.turma, store.sharedSeries) ? 'almoço/janta' : (subject?.name ?? '—')}</div>
                                    {s.sharedSubject && <span className="text-[9px] text-t3 truncate italic">{s.sharedSubject}</span>}
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
              espCount += 1
              const espN = p.aulaIdx ? parseInt(p.aulaIdx.replace('e', ''), 10) : espCount
              const slotKey = makeEspecialSlot(seg.id, turno, espN)
              const daySlots = DAYS.map(day =>
                schedules.filter(s => s.timeSlot === slotKey && s.day === day)
              )
              return (
                <tr key={`esp-${espN}`} className="bg-surf2 border-b border-bdr/50">
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
                            return (
                              <div key={s.id} className="leading-tight">
                                {showTeacher ? (
                                  <>
                                    <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide">{useApelido ? (teacher?.apelido || teacher?.name || '—') : (teacher?.name || '—')}</div>
                                    <div className="text-[#4a4740] text-[10px]">{isRestSlot(s.turma, store.sharedSeries) ? 'almoço/janta' : (subject?.name ?? '—')}</div>
                                    {s.sharedSubject && <span className="text-[9px] text-t3 truncate italic">{s.sharedSubject}</span>}
                                  </>
                                ) : (
                                  <>
                                    <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide">{s.turma ?? '—'}</div>
                                    <div className="text-[#4a4740] text-[10px]">{isRestSlot(s.turma, store.sharedSeries) ? 'almoço/janta' : (subject?.name ?? '—')}</div>
                                    {s.sharedSubject && <span className="text-[9px] text-t3 truncate italic">{s.sharedSubject}</span>}
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
