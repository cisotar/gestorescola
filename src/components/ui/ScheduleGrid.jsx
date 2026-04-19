import { useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { getCfg, gerarPeriodos, gerarPeriodosEspeciais, makeEspecialSlot, toMin, mergeAndSortPeriodos } from '../../lib/periods'
import { isSharedSeries } from '../../lib/helpers'
import AddScheduleModal from './AddScheduleModal'
import Modal from './Modal'
import { toast } from '../../hooks/useToast'

// ─── Helper: detectar segmentos de um professor ──────────────────────────────
/**
 * Calcula os segmentIds únicos que um professor atua, derivados de suas matérias
 */
function teacherSegmentIds(teacher, subjects, areas) {
  return [...new Set(
    (teacher.subjectIds ?? []).flatMap(sid => {
      const subj = subjects.find(s => s.id === sid)
      const area = subj ? areas.find(a => a.id === subj.areaId) : null
      return area?.segmentIds ?? []
    })
  )]
}

// ─── Helper: detectar se aula é em área compartilhada ────────────────────────
/**
 * Verifica se um schedule pertence a uma área marcada como compartilhada
 */
function isSharedSchedule(schedule, store) {
  const subj = store.subjects.find(s => s.id === schedule.subjectId)
  const area = store.areas.find(a => a.id === subj?.areaId)
  return area?.shared === true
}

// ─── Componente auxiliar: célula de horário fora do turno ────────────────────
/**
 * Exibe célula com diagonal tracejada para horários fora do turno do professor
 */
function CelulaFora({ day }) {
  return (
    <td
      key={day}
      className="border border-bdr"
      style={{
        backgroundColor: '#F4F2EE',
        background: 'linear-gradient(to bottom right, transparent calc(50% - 0.5px), #D1CEC8 50%, transparent calc(50% + 0.5px))',
      }}
    />
  )
}

/**
 * ScheduleGrid - Grade de horários (matriz dias × aulas)
 *
 * Renderiza uma matriz de horários (dias da semana × aulas) com opções de adicionar/remover aulas.
 * Suporta modo leitura (readOnly), filtro por segmento, horários customizados por dia, e mapa de substituições.
 *
 * @param {Object} teacher - Objeto professor com { id, subjectIds, horariosSemana? }
 * @param {Object} store - Store useAppStore() com segments, subjects, areas, schedules, periodConfigs, sharedSeries
 * @param {boolean} [readOnly=false] - Se true, oculta botões de edição (✕ e +)
 * @param {Object} [substitutionMap] - Mapa { timeSlot: nomeProfessor } para exibir substituições
 * @param {Object} [segmentFilter=null] - Filtro { segmentId, turno } para exibir apenas um segmento
 * @param {Object} [horariosSemana=null] - Horários customizados por dia: { "Segunda": { entrada: "07:00", saida: "12:00" }, ... }
 */
export function ScheduleGrid({ teacher, store, readOnly = false, substitutionMap, segmentFilter = null, horariosSemana = null }) {
  const { addSchedule, removeSchedule } = useAppStore()
  const [modal, setModal] = useState(null)

  const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']

  // Segmentos do professor derivados das matérias — mesma lógica de TabTeachers e TabSchedules
  const teacherSegIds = teacherSegmentIds(teacher, store.subjects, store.areas)
  const relevantSegments = segmentFilter
    ? store.segments.filter(s => s.id === segmentFilter.segmentId)
    : store.segments.filter(s => teacherSegIds.includes(s.id))

  return (
    <div>
      {relevantSegments.length === 0 && (
        <p className="text-sm text-t3 py-4">Este professor não tem matérias associadas a nenhum segmento.</p>
      )}

      {relevantSegments.map(seg => {
        const turno = segmentFilter?.turno ?? seg.turno ?? 'manha'
        const cfg = getCfg(seg.id, turno, store.periodConfigs)
        const periodos = mergeAndSortPeriodos(cfg)
        if (!periodos.some(p => !p.isIntervalo)) return null

        // Build _espIdx for especial aulas (1-based counter among non-interval especial items)
        let espCount = 0
        const periodosComIdx = periodos.map(p => {
          if (p._tipo === 'especial') { espCount += 1; return { ...p, _espIdx: espCount } }
          return p
        })

        return (
          <div key={seg.id} className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-xs font-bold text-t2 uppercase tracking-wide">{seg.name}</div>
              <div className="text-xs text-t3 px-2 py-0.5 rounded-full bg-surf2 border border-bdr">
                {turno === 'tarde' ? '🌇 Tarde' : '🌅 Manhã'}
              </div>
            </div>
            <div className="card p-0 overflow-hidden overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-surf2 border-b border-bdr">
                    <th className="px-3 py-2 text-left font-bold text-t2 w-[90px]">Aula</th>
                    {DAYS.map(d => (
                      <th key={d} className="px-2 py-2 text-center font-bold text-t2 min-w-[100px]">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodosComIdx.map((p, i) => {
                    if (p.isIntervalo) {
                      return (
                        <tr key={`intervalo-${i}`} className="bg-surf2 border-b border-bdr/50">
                          <td className="px-3 py-1">
                            <div className="font-mono text-[10px] text-t3">{p.inicio}–{p.fim}</div>
                            <div className="text-xs font-semibold text-t2">{p.label}</div>
                          </td>
                          {DAYS.map(day => (
                            <td key={day} className="bg-surf2" />
                          ))}
                        </tr>
                      )
                    }

                    if (p._tipo === 'regular') {
                      return (
                        <tr key={p.aulaIdx} className="border-b border-bdr/50">
                          <td className="px-3 py-1.5">
                            <div className="font-bold font-mono">{p.label}</div>
                            <div className="font-mono text-t3 text-[10px]">{p.inicio}–{p.fim}</div>
                          </td>
                          {DAYS.map(day => {
                            if (horariosSemana !== null) {
                              const horarioDia = horariosSemana[day]
                              if (horarioDia?.entrada && horarioDia?.saida) {
                                if (p.inicio && p.fim &&
                                  (toMin(p.inicio) < toMin(horarioDia.entrada) || toMin(p.fim) > toMin(horarioDia.saida))) {
                                  return <CelulaFora key={day} />
                                }
                              }
                            }
                            const slot = `${seg.id}|${turno}|${p.aulaIdx}`
                            const mine = store.schedules.filter(s =>
                              s.teacherId === teacher.id && s.timeSlot === slot && s.day === day
                            )
                            // Conflito de professor: já tem aula neste slot/dia
                            const teacherConflict = mine.length > 0
                            // Turmas ocupadas por outros professores neste slot/dia
                            const occupiedSchedules = store.schedules
                              .filter(s => s.timeSlot === slot && s.day === day && s.teacherId !== teacher.id)
                            const hardBlockedTurmas = occupiedSchedules
                              .filter(s => !isSharedSchedule(s, store) && !isSharedSeries(s.turma, store.sharedSeries))
                              .map(s => s.turma)
                            const allTurmas = seg.grades.flatMap(g =>
                              g.classes.map(c => `${g.name} ${c.letter}`)
                            )
                            // freeTurmas: turmas sem ocupante de área não-compartilhada (inclui turmas de área compartilhada)
                            const freeTurmas = allTurmas.filter(t => !hardBlockedTurmas.includes(t))

                            return (
                              <td key={day} className={`px-1.5 py-1.5 align-top ${teacherConflict ? 'bg-amber-50/40' : ''}`}>
                                <div className="space-y-1">
                                  {mine.map(s => {
                                    const subj = store.subjects.find(x => x.id === s.subjectId)
                                    return (
                                      <div key={s.id} className="relative bg-surf2 border border-bdr rounded-lg p-1.5 text-[11px] group">
                                        <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide truncate">{s.turma}</div>
                                        <div className="text-[#4a4740] text-[10px] truncate">{subj?.name ?? '—'}</div>
                                        {!readOnly && (
                                          <button
                                            className="absolute top-0.5 right-0.5 text-t3 hover:text-err hidden group-hover:block"
                                            onClick={() => removeSchedule(s.id)}
                                          >✕</button>
                                        )}
                                      </div>
                                    )
                                  })}

                                  {substitutionMap?.[slot] && (
                                    <div className="text-[10px] font-bold text-ok truncate">
                                      ✓ {substitutionMap[slot]}
                                    </div>
                                  )}

                                  {/* Indicadores de bloqueio — sem dados de terceiros */}
                                  {!readOnly && (teacherConflict ? (
                                    <div className="w-full text-center text-[10px] text-amber-600 py-1 rounded-lg bg-amber-50 border border-amber-200"
                                      title="Professor já tem aula neste horário">
                                      🔒
                                    </div>
                                  ) : freeTurmas.length === 0 ? (
                                    <div className="w-full text-center text-[10px] text-t3 py-1 rounded-lg bg-surf2 border border-dashed border-bdr"
                                      title="Todas as turmas já têm professor neste horário">
                                      —
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setModal({ segId: seg.id, turno, aulaIdx: p.aulaIdx, day })}
                                      className="w-full text-center text-[10px] text-t3 hover:text-navy py-1 rounded-lg hover:bg-surf2 transition-colors border border-dashed border-bdr hover:border-bdr"
                                    >＋</button>
                                  ))}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    }

                    // _tipo === 'especial'
                    const aulaCount = p._espIdx
                    return (
                      <tr key={`esp-${aulaCount}`} className="border-b border-bdr/50 bg-surf2">
                        <td className="px-3 py-1.5 border-l-2 border-accent">
                          <div className="font-bold font-mono">{p.label}</div>
                          <div className="font-mono text-t3 text-[10px]">{p.inicio}–{p.fim}</div>
                        </td>
                        {DAYS.map(day => {
                          if (horariosSemana !== null) {
                            const horarioDia = horariosSemana[day]
                            if (horarioDia?.entrada && horarioDia?.saida) {
                              if (p.inicio && p.fim &&
                                (toMin(p.inicio) < toMin(horarioDia.entrada) || toMin(p.fim) > toMin(horarioDia.saida))) {
                                return <CelulaFora key={day} />
                              }
                            }
                          }
                          const slot = makeEspecialSlot(seg.id, turno, aulaCount)
                          const mine = store.schedules.filter(s =>
                            s.teacherId === teacher.id && s.timeSlot === slot && s.day === day
                          )
                          const teacherConflict = mine.length > 0
                          const occupiedSchedules = store.schedules
                            .filter(s => s.timeSlot === slot && s.day === day && s.teacherId !== teacher.id)
                          const hardBlockedTurmas = occupiedSchedules
                            .filter(s => !isSharedSchedule(s, store) && !isSharedSeries(s.turma, store.sharedSeries))
                            .map(s => s.turma)
                          const allTurmas = seg.grades.flatMap(g =>
                            g.classes.map(c => `${g.name} ${c.letter}`)
                          )
                          const freeTurmas = allTurmas.filter(t => !hardBlockedTurmas.includes(t))

                          return (
                            <td key={day} className={`px-1.5 py-1.5 align-top bg-surf2 ${teacherConflict ? 'bg-amber-50/40' : ''}`}>
                              <div className="space-y-1">
                                {mine.map(s => {
                                  const subj = store.subjects.find(x => x.id === s.subjectId)
                                  return (
                                    <div key={s.id} className="relative bg-white border border-bdr rounded-lg p-1.5 text-[11px] group">
                                      <div className="font-semibold text-[#1a1814] text-[11px] uppercase tracking-wide truncate">{s.turma}</div>
                                      <div className="text-[#4a4740] text-[10px] truncate">{subj?.name ?? '—'}</div>
                                      {!readOnly && (
                                        <button
                                          className="absolute top-0.5 right-0.5 text-t3 hover:text-err hidden group-hover:block"
                                          onClick={() => removeSchedule(s.id)}
                                        >✕</button>
                                      )}
                                    </div>
                                  )
                                })}

                                {substitutionMap?.[slot] && (
                                  <div className="text-[10px] font-bold text-ok truncate">
                                    ✓ {substitutionMap[slot]}
                                  </div>
                                )}

                                {!readOnly && (teacherConflict ? (
                                  <div className="w-full text-center text-[10px] text-amber-600 py-1 rounded-lg bg-amber-50 border border-amber-200"
                                    title="Professor já tem aula neste horário">
                                    🔒
                                  </div>
                                ) : freeTurmas.length === 0 ? (
                                  <div className="w-full text-center text-[10px] text-t3 py-1 rounded-lg border border-dashed border-bdr"
                                    title="Todas as turmas já têm professor neste horário">
                                    —
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setModal({ segId: seg.id, turno, aulaIdx: `e${aulaCount}`, day })}
                                    className="w-full text-center text-[10px] text-t3 hover:text-navy py-1 rounded-lg hover:bg-white transition-colors border border-dashed border-bdr hover:border-bdr"
                                  >＋</button>
                                ))}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {modal && (
        <AddScheduleModal
          open={!!modal}
          onClose={() => setModal(null)}
          teacher={teacher}
          segId={modal.segId}
          turno={modal.turno}
          aulaIdx={modal.aulaIdx}
          day={modal.day}
          store={store}
          onSave={(sched) => { addSchedule(sched); setModal(null); toast('Aula adicionada', 'ok') }}
        />
      )}
    </div>
  )
}

/**
 * ScheduleGridModal - Abre ScheduleGrid em um modal
 *
 * @param {boolean} open - Se o modal está aberto
 * @param {function} onClose - Callback ao fechar modal
 * @param {Object} teacher - Objeto professor
 * @param {Object} store - Store useAppStore()
 * @param {boolean} [readOnly=false] - Se true, modo leitura
 */
export function ScheduleGridModal({ open, onClose, teacher, store, readOnly = false }) {
  if (!teacher) return null
  return (
    <Modal open={open} onClose={onClose} title={`Grade de Horários — ${teacher.name}`} size="xl">
      <ScheduleGrid teacher={teacher} store={store} readOnly={readOnly} />
    </Modal>
  )
}
