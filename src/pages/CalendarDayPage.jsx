// MOBILE-DAY-PAGE: página dedicada de dia para mobile — delete este arquivo para reverter
// Acesso: CalendarPage redireciona para cá em viewports < lg ao selecionar um professor.

import { useState, useRef, useMemo } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { DAYS } from '../lib/constants'
import { colorOfTeacher, teacherSubjectNames, formatBR, dateToDayLabel, formatMonthlyAulas } from '../lib/helpers'
import { getPeriodos } from '../lib/periods'
import { rankCandidates, suggestSubstitutes, monthlyLoad } from '../lib/absences'
import { generateDayHTML, generateSlotCertificateHTML, openPDF } from '../lib/reports'
import Modal from '../components/ui/Modal'
import ToggleRuleButtons from '../components/ui/ToggleRuleButtons'
import { toast } from '../hooks/useToast'

// ─── SubPicker (cópia local — usado inline sem o DayModal) ───────────────────

function FullCandidateList({ candidates, curSub, store, onSelect, matchLabel }) {
  if (!candidates.length) return (
    <p className="text-center text-t3 py-8 text-sm">Nenhum professor disponível.</p>
  )
  return (
    <div className="space-y-1.5">
      {candidates.map(c => {
        const isCur = c.teacher.id === curSub?.id
        return (
          <button
            key={c.teacher.id}
            onClick={() => onSelect(c.teacher)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left
              ${isCur ? 'border-navy bg-surf2' : 'border-bdr hover:border-t3 hover:bg-surf2'}`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{c.teacher.name}</div>
              <div className="text-[11px] text-t2">{matchLabel(c)} · {formatMonthlyAulas(c.load)}/mês</div>
            </div>
            {isCur && <span className="text-[11px] font-bold text-ok shrink-0">atual ✓</span>}
            <span className="text-t3 text-lg shrink-0">›</span>
          </button>
        )
      })}
    </div>
  )
}

function SubPicker({ absenceId, slotId, teacherId, date, slot, subjectId, store, compact = false, ruleType = 'qualitative' }) {
  const [open, setOpen] = useState(false)
  const [assignedTeacher, setAssignedTeacher] = useState(null)
  const { assignSubstitute } = useAppStore()

  const candidates = useMemo(() =>
    rankCandidates(teacherId, date, slot, subjectId,
      store.teachers, store.schedules, store.absences, store.subjects, store.areas),
    [teacherId, date, slot, subjectId, store]
  )

  const absenceSlot = useMemo(() => ({
    absentTeacherId: teacherId, date, slot, subjectId,
  }), [teacherId, date, slot, subjectId])

  const suggestions = useMemo(
    () => suggestSubstitutes(absenceSlot, ruleType, store).map(t => ({
      ...t,
      monthlyAulas: monthlyLoad(t.id, date, store.schedules, store.absences),
    })),
    [absenceSlot, ruleType, store, date]
  )

  const curSub = (() => {
    const ab = store.absences?.find(a => a.id === absenceId)
    const sl = ab?.slots.find(s => s.id === slotId)
    return sl?.substituteId ? store.teachers.find(t => t.id === sl.substituteId) : null
  })()

  const absentTeacher = store.teachers.find(t => t.id === teacherId)

  const handleAssign = (t) => {
    assignSubstitute(absenceId, slotId, t.id)
    setAssignedTeacher(t)
    toast(`Substituto: ${t.name}`, 'ok')
  }

  const handleDownloadPDF = () => {
    const ab = store.absences?.find(a => a.id === absenceId)
    const sl = ab?.slots.find(s => s.id === slotId)
    if (!sl || !assignedTeacher) return
    const html = generateSlotCertificateHTML(sl, absentTeacher, assignedTeacher, store)
    openPDF(html)
  }

  const matchLabel = (c) => {
    const base = c.match === 'subject' ? '⭐ mesma matéria'
               : c.match === 'area'    ? '🔵 mesma área'
               : '⚪ outra área'
    const seg  = c.sameSeg ? ' · mesmo segmento' : ' · outro segmento'
    return base + (c.match !== 'other' ? seg : '')
  }

  if (compact) {
    // Sugestões empilhadas inline (top-3 pela regra ativa)
    if (!suggestions.length) return <div className="text-[11px] text-t3 mt-1.5 italic">Nenhum disponível</div>
    return (
      <div className="mt-1.5 space-y-1">
        {suggestions.map(t => (
          <div key={t.id} className="flex items-center gap-2">
            <button
              onClick={() => handleAssign(t)}
              className="flex-1 flex items-center gap-1.5 text-left px-2 py-1 rounded-lg bg-surf border border-bdr hover:border-navy hover:bg-surf2 transition-all text-[11px]"
            >
              <span className="font-bold truncate">{t.name}</span>
              <span className="text-t3 shrink-0">{formatMonthlyAulas(t.monthlyAulas)}</span>
            </button>
          </div>
        ))}
        <button
          className="text-[11px] text-navy underline underline-offset-2"
          onClick={() => setOpen(true)}
        >ver todos ({candidates.length})</button>

        <Modal open={open} onClose={() => { setOpen(false); setAssignedTeacher(null) }} title="Selecionar Substituto">
          <div className="border-t border-bdr pt-3">
            <FullCandidateList candidates={candidates} curSub={curSub} store={store}
              onSelect={handleAssign} matchLabel={matchLabel} />
          </div>
          {assignedTeacher && (
            <div className="border-t border-bdr pt-3 mt-3 flex justify-between items-center">
              <span className="text-xs text-ok font-bold">✓ {assignedTeacher.name} atribuído</span>
              <button className="btn btn-sm btn-dark" onClick={handleDownloadPDF}>
                Baixar Comprovante
              </button>
            </div>
          )}
        </Modal>
      </div>
    )
  }

  // Versão modal (botão de troca quando já há substituto)
  return (
    <>
      <button className="text-[11px] text-navy underline underline-offset-2" onClick={() => setOpen(true)}>
        {curSub ? '↺ Trocar' : '+ Escolher substituto'}
      </button>
      <Modal open={open} onClose={() => { setOpen(false); setAssignedTeacher(null) }} title="Selecionar Substituto">
        <div className="border-t border-bdr pt-3">
          <FullCandidateList candidates={candidates} curSub={curSub} store={store}
            onSelect={handleAssign} matchLabel={matchLabel} />
        </div>
        {assignedTeacher && (
          <div className="border-t border-bdr pt-3 mt-3 flex justify-between items-center">
            <span className="text-xs text-ok font-bold">✓ {assignedTeacher.name} atribuído</span>
            <button className="btn btn-sm btn-dark" onClick={handleDownloadPDF}>
              Baixar Comprovante
            </button>
          </div>
        )}
      </Modal>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarDayPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const store     = useAppStore()
  const { role }  = useAuthStore()
  const isAdmin   = role === 'admin'

  const { createAbsence, assignSubstitute, deleteAbsenceSlot, clearDaySubstitutes, clearDayAbsences } = useAppStore()

  // Sem state → usuário acessou a URL diretamente; redireciona
  const state = location.state
  if (!state?.teacherId) return <Navigate to="/calendar" replace />

  const { teacherId, segId, weekDates, todayISO } = state

  const teacher = store.teachers.find(t => t.id === teacherId)
  const seg     = store.segments.find(s => s.id === segId)

  if (!teacher || !seg) return <Navigate to="/calendar" replace />

  // Índice inicial: dia atual dentro das datas da semana; fallback 0
  const initialIdx = weekDates.indexOf(todayISO)
  const [activeDayIdx, setActiveDayIdx] = useState(initialIdx >= 0 ? initialIdx : 0)
  const [ruleType, setRuleType] = useState('qualitative')

  const activeDate = weekDates[activeDayIdx]
  const activeDayLabel = dateToDayLabel(activeDate)

  const mine   = store.schedules.filter(s => s.teacherId === teacher.id)
  const cv     = colorOfTeacher(teacher, store)
  const hasAbs = (store.absences ?? []).some(ab => ab.teacherId === teacher.id)

  const absMap = useMemo(() => {
    const map = {}
    ;(store.absences ?? []).forEach(ab => {
      if (ab.teacherId !== teacher.id) return
      ab.slots.forEach(s => {
        map[`${s.date}|${s.timeSlot}`] = {
          absenceId:    ab.id,
          slotId:       s.id,
          substituteId: s.substituteId,
          timeSlot:     s.timeSlot,
          date:         s.date,
        }
      })
    })
    return map
  }, [teacher.id, store.absences])

  // Ações do dia
  const dayMine    = mine.filter(s => s.day === activeDayLabel)

  // Segmentos do professor no dia ativo (pode ser mais de um turno)
  const daySegIds  = [...new Set(dayMine.map(s => s.timeSlot?.split('|')[0]).filter(Boolean))]
  // Segmento primário (recebido via navigation state) aparece primeiro
  const segsForDay = store.segments
    .filter(s => daySegIds.includes(s.id))
    .sort((a, b) => (a.id === segId ? -1 : b.id === segId ? 1 : 0))
  const segPeriodos = segsForDay.map(s => ({
    seg: s,
    periodos: getPeriodos(s.id, s.turno ?? 'manha', store.periodConfigs)
      .filter(p => !p.isIntervalo)
      .map(p => ({ ...p, slot: `${s.id}|${s.turno ?? 'manha'}|${p.aulaIdx}` }))
  }))
  const dayAbsMap  = Object.fromEntries(
    Object.entries(absMap).filter(([k]) => k.startsWith(activeDate + '|'))
      .map(([k, v]) => [k.replace(activeDate + '|', ''), v])
  )
  const anyAbsent  = Object.keys(dayAbsMap).length > 0
  const anyHasSub  = Object.values(dayAbsMap).some(a => a.substituteId)
  const allAbsent  = dayMine.length > 0 && dayMine.every(s => dayAbsMap[s.timeSlot])
  const allHasSub  = anyAbsent && Object.values(dayAbsMap).every(a => a.substituteId)

  const handleMarkAll = () => {
    const slots = dayMine
      .filter(s => !dayAbsMap[s.timeSlot])
      .map(s => ({ date: activeDate, timeSlot: s.timeSlot, scheduleId: s.id, subjectId: s.subjectId ?? null, turma: s.turma }))
    if (!slots.length) return
    createAbsence(teacher.id, slots)
    toast(`${slots.length} falta${slots.length > 1 ? 's' : ''} registrada${slots.length > 1 ? 's' : ''}`, 'ok')
  }

  const handleAcceptAll = () => {
    Object.entries(dayAbsMap).forEach(([slot, { absenceId, slotId, substituteId }]) => {
      if (substituteId) return
      const sched = dayMine.find(s => s.timeSlot === slot)
      const top = rankCandidates(teacher.id, activeDate, slot, sched?.subjectId,
        store.teachers, store.schedules, store.absences, store.subjects, store.areas)[0]
      if (top) assignSubstitute(absenceId, slotId, top.teacher.id)
    })
    toast('Substituições confirmadas', 'ok')
  }

  const handleClearSubs = () => {
    if (!confirm('Remover todos os substitutos deste dia?')) return
    clearDaySubstitutes(teacher.id, activeDate)
    toast('Substitutos removidos', 'ok')
  }

  const handleClearAll = () => {
    if (!confirm('Remover todas as faltas e substitutos deste dia?')) return
    clearDayAbsences(teacher.id, activeDate)
    toast('Faltas removidas', 'ok')
  }

  const handleMarkAbsent = (p, sched) => {
    createAbsence(teacher.id, [{
      date: activeDate, timeSlot: p.slot, scheduleId: sched.id,
      subjectId: sched.subjectId ?? null, turma: sched.turma,
    }])
    toast('Falta registrada', 'ok')
  }

  const handleDownloadPDF = () => openPDF(generateDayHTML(activeDate, teacher.id, store))

  // Swipe lateral entre dias
  const touchStartX = useRef(null)
  const onTouchStart = e => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd   = e => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) < 40) return
    setActiveDayIdx(i => Math.min(Math.max(i + (dx < 0 ? 1 : -1), 0), 4))
    touchStartX.current = null
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

      {/* MOBILE-DAY-PAGE: cabeçalho com card de professor */}
      <div className="mb-4">
        <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm mb-3">← Voltar</button>
        <div className="card flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold shrink-0"
            style={{ background: cv.tg, color: cv.tx }}
          >
            {teacher.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-base truncate">{teacher.name}</div>
            <div className="text-xs text-t2 truncate">
              {teacherSubjectNames(teacher, store.subjects) || '—'} · {mine.length} aula{mine.length !== 1 ? 's' : ''} cadastrada{mine.length !== 1 ? 's' : ''}
            </div>
            {hasAbs && <div className="text-[10px] text-err font-bold mt-0.5">● possui faltas registradas</div>}
          </div>
        </div>
      </div>
      {/* fim MOBILE-DAY-PAGE cabeçalho */}

      {/* Pills dos dias — sticky abaixo da navbar */}
      <div className="flex gap-1.5 overflow-x-auto scroll-thin sticky top-14 bg-bg z-10 py-3 pb-3 mb-4 -mx-4 px-4 border-b border-bdr">
        {DAYS.map((d, i) => (
          <button
            key={d}
            onClick={() => setActiveDayIdx(i)}
            className={`flex flex-col items-center px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors
              ${activeDayIdx === i
                ? 'bg-navy text-white shadow-sm'
                : weekDates[i] === todayISO
                  ? 'bg-accent-l text-accent'
                  : 'bg-surf2 text-t2 border border-bdr'}`}
          >
            <span>{d}</span>
            <span className="font-mono font-normal text-[9px] opacity-70">{formatBR(weekDates[i])}</span>
          </button>
        ))}
      </div>

      {/* Ações rápidas (admin) */}
      {isAdmin && dayMine.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4 p-3 bg-surf2 rounded-xl">
          {!allAbsent && (
            <button className="btn btn-dark btn-sm" onClick={handleMarkAll}>Marcar dia inteiro</button>
          )}
          {anyAbsent && !allHasSub && (
            <button className="btn btn-ghost btn-sm" onClick={handleAcceptAll}>✓ Aceitar sugestões</button>
          )}
          {anyHasSub && (
            <button className="btn btn-ghost btn-sm text-amber-700" onClick={handleClearSubs}>↺ Remover substitutos</button>
          )}
          {anyAbsent && (
            <button className="btn btn-danger btn-sm" onClick={handleClearAll}>✕ Remover todas as faltas</button>
          )}
          {allHasSub && (
            <button className="btn btn-ghost btn-sm ml-auto" onClick={handleDownloadPDF}>📄 Baixar PDF</button>
          )}
        </div>
      )}

      {/* Toggle de regra — aparece quando há faltas sem substituto */}
      {isAdmin && anyAbsent && !allHasSub && (
        <div className="mt-4">
          <ToggleRuleButtons activeRule={ruleType} onRuleChange={setRuleType} />
        </div>
      )}

      {/* Lista de períodos — agrupados por segmento/turno */}
      <div className="space-y-4 mt-2">
        {segPeriodos.length === 0 && (
          <p className="text-center text-t3 py-10 text-sm">Nenhuma aula configurada para este professor.</p>
        )}
        {segPeriodos.map(({ seg: s, periodos }) => {
          const turnoLabel = (s.turno ?? 'manha') === 'tarde' ? '🌇 Tarde' : '🌅 Manhã'
          return (
            <div key={s.id}>
              {segPeriodos.length > 1 && (
                <div className="text-[11px] font-bold text-t2 uppercase tracking-wider mb-2 px-1">
                  {s.name} — {turnoLabel}
                </div>
              )}
              <div className="space-y-2">
                {periodos.map(p => {
                  const sched = dayMine.find(sc => sc.timeSlot === p.slot)
                  const abs   = sched ? dayAbsMap[p.slot] : null
                  const sub   = abs?.substituteId ? store.teachers.find(t => t.id === abs.substituteId) : null
                  const subj  = store.subjects.find(x => x.id === sched?.subjectId)

                  return (
                    <div key={p.slot} className={`card p-3 ${
                      abs ? 'border-[#FDB8A8] bg-[#FFF1EE]' :
                      !sched ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Horário ancorado */}
                        <div className="text-center min-w-[56px] shrink-0 bg-surf2 rounded-lg py-1.5 px-1">
                          <div className="font-mono text-[11px] font-bold text-t2">{p.label}</div>
                          <div className="font-mono text-[10px] text-t3">{p.inicio}–{p.fim}</div>
                        </div>

                        {/* Conteúdo */}
                        <div className="flex-1 min-w-0">
                          {sched ? (
                            <>
                              <div className="font-bold text-sm">{sched.turma}</div>
                              <div className="text-xs text-t2">{subj?.name ?? '—'}</div>
                              {abs && (
                                <div className="mt-1.5">
                                  {sub ? (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[11px] font-bold text-ok">✓ {sub.name}</span>
                                      {isAdmin && (
                                        <SubPicker
                                          absenceId={abs.absenceId} slotId={abs.slotId}
                                          teacherId={teacher.id} date={activeDate} slot={p.slot}
                                          subjectId={sched.subjectId} store={store}
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    isAdmin && (
                                      <SubPicker
                                        absenceId={abs.absenceId} slotId={abs.slotId}
                                        teacherId={teacher.id} date={activeDate} slot={p.slot}
                                        subjectId={sched.subjectId} store={store}
                                        ruleType={ruleType}
                                        compact
                                      />
                                    )
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-t3 italic">Hora de estudo</span>
                          )}
                        </div>

                        {/* Ações */}
                        {isAdmin && sched && (
                          <div className="shrink-0">
                            {abs ? (
                              <button
                                className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-[#FDB8A8] text-err bg-white hover:bg-[#FDB8A8]/30 transition-colors"
                                onClick={() => { deleteAbsenceSlot(abs.absenceId, abs.slotId); toast('Falta removida', 'ok') }}
                              >
                                Desfazer
                              </button>
                            ) : (
                              <button className="btn btn-dark btn-xs" onClick={() => handleMarkAbsent(p, sched)}>
                                Marcar falta
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
