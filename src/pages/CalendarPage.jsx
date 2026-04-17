import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import useAuthStore from '../store/useAuthStore'
import { DAYS } from '../lib/constants'
import { colorOfTeacher, teacherSubjectNames, formatBR, dateToDayLabel, businessDaysBetween, formatISO, formatMonthlyAulas } from '../lib/helpers'
import { getPeriodos, slotLabel } from '../lib/periods'
import { rankCandidates, suggestSubstitutes, monthlyLoad, createAbsence as _buildAbsence } from '../lib/absences'
import { generateDayHTML, generateSlotCertificateHTML, openPDF } from '../lib/reports'
import Modal from '../components/ui/Modal'
import ToggleRuleButtons from '../components/ui/ToggleRuleButtons'
import { toast } from '../hooks/useToast'

// ─── Helpers de semana ────────────────────────────────────────────────────────

function getWeekDates(offset = 0) {
  const today = new Date()
  const diff  = today.getDay() === 0 ? -6 : 1 - today.getDay()
  const mon   = new Date(today)
  mon.setDate(today.getDate() + diff + offset * 7)
  return DAYS.map((_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return formatISO(d)
  })
}

// ─── TeacherCard ─────────────────────────────────────────────────────────────

function TeacherCard({ teacher, selected, onClick, store }) {
  const cv     = colorOfTeacher(teacher, store)
  const nAulas = store.schedules.filter(s => s.teacherId === teacher.id).length
  const hasAbs = (store.absences ?? []).some(ab => ab.teacherId === teacher.id)

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left w-full
        ${selected ? 'border-navy bg-surf shadow-sm' : 'border-bdr bg-surf hover:border-t3'}`}
    >
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
        style={{ background: cv.tg, color: cv.tx }}>
        {teacher.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{teacher.name}</div>
        <div className="text-[11px] text-t3 truncate">{teacherSubjectNames(teacher, store.subjects) || '—'}</div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: cv.tg, color: cv.tx }}>{nAulas}</span>
        {hasAbs && <span className="text-[9px] text-err font-bold">● falta</span>}
      </div>
    </button>
  )
}

// ─── SubPicker ────────────────────────────────────────────────────────────────

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
            <FullCandidateList
              candidates={candidates} curSub={curSub} matchLabel={matchLabel}
              store={store} onSelect={handleAssign}
            />
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
      <button
        className="text-[11px] text-navy underline underline-offset-2"
        onClick={() => setOpen(true)}
      >
        {curSub ? '↺ Trocar' : '+ Escolher substituto'}
      </button>

      <Modal open={open} onClose={() => { setOpen(false); setAssignedTeacher(null) }} title="Selecionar Substituto">
        <div className="border-t border-bdr pt-3">
          <FullCandidateList
            candidates={candidates} curSub={curSub} matchLabel={matchLabel}
            store={store} onSelect={handleAssign}
          />
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

function FullCandidateList({ candidates, curSub, matchLabel, store, onSelect }) {
  if (!candidates.length) return (
    <p className="text-center text-t3 py-8 text-sm">Nenhum professor disponível.</p>
  )
  return (
    <div className="space-y-1.5">
      {candidates.map(c => {
        const cv    = colorOfTeacher(c.teacher, store)
        const isCur = c.teacher.id === curSub?.id
        return (
          <button
            key={c.teacher.id}
            onClick={() => onSelect(c.teacher)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left
              ${isCur ? 'border-navy bg-surf2' : 'border-bdr hover:border-t3 hover:bg-surf2'}`}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cv.dt }} />
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

// ─── DayModal ─────────────────────────────────────────────────────────────────

function DayModal({ open, onClose, date, teacher, store, isAdmin }) {
  const { createAbsence, assignSubstitute, deleteAbsenceSlot, clearDaySubstitutes, clearDayAbsences } = useAppStore()
  const [ruleType, setRuleType] = useState('qualitative')

  if (!open || !teacher || !date) return null

  const dayLabel = dateToDayLabel(date)
  const mine     = store.schedules.filter(s => s.teacherId === teacher.id && s.day === dayLabel)
  const segIds   = [...new Set(mine.map(m => m.timeSlot?.split('|')[0]).filter(Boolean))]
  const segsForDay = store.segments.filter(s => segIds.includes(s.id))
  const segPeriodos = segsForDay.map(s => ({
    seg: s,
    periodos: getPeriodos(s.id, s.turno ?? 'manha', store.periodConfigs)
      .filter(p => !p.isIntervalo)
      .map(p => ({ ...p, slot: `${s.id}|${s.turno ?? 'manha'}|${p.aulaIdx}` }))
  }))

  const absMap = {}
  ;(store.absences ?? []).forEach(ab => {
    if (ab.teacherId !== teacher.id) return
    ab.slots.filter(s => s.date === date).forEach(s => {
      absMap[s.timeSlot] = { absenceId: ab.id, slotId: s.id, substituteId: s.substituteId }
    })
  })

  const anyAbsent    = Object.keys(absMap).length > 0
  const anyHasSub    = Object.values(absMap).some(a => a.substituteId)
  const allAbsent    = mine.length > 0 && mine.every(s => absMap[s.timeSlot])
  const allHasSub    = anyAbsent && Object.values(absMap).every(a => a.substituteId)
  const allNotCov    = anyAbsent && !Object.values(absMap).some(a => a.substituteId)

  const handleMarkAbsent = (p, sched) => {
    createAbsence(teacher.id, [{
      date, timeSlot: p.slot, scheduleId: sched.id,
      subjectId: sched.subjectId ?? null, turma: sched.turma,
    }])
    toast('Falta registrada', 'ok')
  }

  const handleMarkAll = () => {
    const slots = mine
      .filter(s => !absMap[s.timeSlot])
      .map(s => ({ date, timeSlot: s.timeSlot, scheduleId: s.id, subjectId: s.subjectId ?? null, turma: s.turma }))
    if (!slots.length) return
    createAbsence(teacher.id, slots)
    toast(`${slots.length} falta${slots.length > 1 ? 's' : ''} registrada${slots.length > 1 ? 's' : ''}`, 'ok')
  }

  const handleAcceptAll = () => {
    Object.entries(absMap).forEach(([slot, { absenceId, slotId, substituteId }]) => {
      if (substituteId) return
      const sched = mine.find(s => s.timeSlot === slot)
      const top = rankCandidates(teacher.id, date, slot, sched?.subjectId,
        store.teachers, store.schedules, store.absences, store.subjects, store.areas)[0]
      if (top) assignSubstitute(absenceId, slotId, top.teacher.id)
    })
    toast('Substituições confirmadas', 'ok')
  }

  const handleClearSubs = () => {
    if (!confirm('Remover todos os substitutos deste dia? As faltas continuam registradas.')) return
    clearDaySubstitutes(teacher.id, date)
    toast('Substitutos removidos', 'ok')
  }

  const handleClearAll = () => {
    if (!confirm('Remover todas as faltas e substitutos deste dia?')) return
    clearDayAbsences(teacher.id, date)
    toast('Faltas removidas', 'ok')
    onClose()
  }

  const handleDownloadPDF = () => {
    openPDF(generateDayHTML(date, teacher.id, store))
  }

  return (
    <Modal open={open} onClose={onClose} title={`${teacher.name} — ${dayLabel} ${formatBR(date)}`} size="lg">
      {/* Barra de ações rápidas (admin) */}
      {isAdmin && mine.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-surf2 rounded-xl">
          {!allAbsent && (
            <button className="btn btn-dark btn-sm" onClick={handleMarkAll}>
              Marcar dia inteiro
            </button>
          )}
          {anyAbsent && !allHasSub && (
            <button className="btn btn-ghost btn-sm" onClick={handleAcceptAll}>
              ✓ Aceitar sugestões
            </button>
          )}
          {anyHasSub && (
            <button className="btn btn-ghost btn-sm text-amber-700" onClick={handleClearSubs}>
              ↺ Remover substitutos
            </button>
          )}
          {anyAbsent && (
            <button className="btn btn-danger btn-sm" onClick={handleClearAll}>
              ✕ Remover todas as faltas
            </button>
          )}
          {anyAbsent && (
            <button className="btn btn-ghost btn-sm ml-auto" onClick={handleDownloadPDF}>
              📄 Baixar PDF
            </button>
          )}
        </div>
      )}

      {/* Toggle de regra — aparece acima das sugestões quando há faltas sem substituto */}
      {isAdmin && anyAbsent && !allHasSub && (
        <div className="mb-4 p-3 bg-surf2 rounded-xl">
          <ToggleRuleButtons activeRule={ruleType} onRuleChange={setRuleType} />
        </div>
      )}

      {/* Aulas */}
      <div className="space-y-4">
        {segPeriodos.length === 0 && (
          <p className="text-center text-t3 py-8 text-sm">Nenhuma aula configurada para este professor.</p>
        )}
        {segPeriodos.map(({ seg, periodos }) => {
          const turnoLabel = (seg.turno ?? 'manha') === 'tarde' ? '🌇 Tarde' : '🌅 Manhã'
          return (
            <div key={seg.id}>
              {segPeriodos.length > 1 && (
                <div className="text-[11px] font-bold text-t2 uppercase tracking-wider mb-2">
                  {seg.name} — {turnoLabel}
                </div>
              )}
              <div className="space-y-2">
                {periodos.map(p => {
                  const sched = mine.find(s => s.timeSlot === p.slot)
                  const abs   = sched ? absMap[p.slot] : null
                  const sub   = abs?.substituteId ? store.teachers.find(t => t.id === abs.substituteId) : null
                  const subj  = store.subjects.find(x => x.id === sched?.subjectId)

                  return (
                    <div key={p.slot} className={`p-3 rounded-xl border ${
                      abs ? 'bg-[#FFF1EE] border-[#FDB8A8]' :
                      sched ? 'bg-surf border-bdr' :
                      'bg-surf2/50 border-bdr/50 opacity-50'}`}>
                      <div className="flex items-start gap-3">
                        {/* Horário */}
                        <div className="text-center min-w-[60px] shrink-0">
                          <div className="font-mono text-[11px] font-bold text-t2">{p.label}</div>
                          <div className="font-mono text-[10px] text-t3">{p.inicio}–{p.fim}</div>
                        </div>

                        {/* Info + sugestões inline */}
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
                                          teacherId={teacher.id} date={date} slot={p.slot}
                                          subjectId={sched.subjectId} store={store}
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    isAdmin && (
                                      <SubPicker
                                        absenceId={abs.absenceId} slotId={abs.slotId}
                                        teacherId={teacher.id} date={date} slot={p.slot}
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

                        {/* Ações (admin) */}
                        {isAdmin && sched && (
                          <div className="shrink-0">
                            {abs ? (
                              <button
                                className="text-[11px] text-err hover:underline"
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
    </Modal>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const store    = useAppStore()
  const { role, isCoordinator } = useAuthStore()
  const isAdmin   = role === 'admin'
  const canManage = isAdmin || isCoordinator()
  const navigate = useNavigate()

  const [selectedTeacher, setSelectedTeacher] = useState(null)
  const [selectedSeg,     setSelectedSeg]     = useState(null)
  const [weekOffset,      setWeekOffset]       = useState(0)
  const [modalDate,       setModalDate]        = useState(null)

  const dates     = getWeekDates(weekOffset)
  const weekLabel = `${formatBR(dates[0])} – ${formatBR(dates[4])}`
  const todayISO  = formatISO(new Date())

  const teachersBySegment = useMemo(() =>
    store.segments.map(seg => {
      const prefix = seg.id + '|'
      const list = store.teachers
        .filter(t => store.schedules.some(s => s.teacherId === t.id && s.timeSlot?.startsWith(prefix)))
        .sort((a, b) => a.name.localeCompare(b.name))
      return { seg, list }
    }),
    [store.segments, store.teachers, store.schedules]
  )

  const teacher = selectedTeacher ? store.teachers.find(t => t.id === selectedTeacher) : null
  const seg     = selectedSeg ? store.segments.find(s => s.id === selectedSeg) : null

  const periodos = seg
    ? getPeriodos(seg.id, seg.turno ?? 'manha', store.periodConfigs)
        .filter(p => !p.isIntervalo)
        .map(p => ({ ...p, slot: `${seg.id}|${seg.turno ?? 'manha'}|${p.aulaIdx}` }))
    : []

  const mine = teacher
    ? store.schedules.filter(s => s.teacherId === teacher.id)
    : []

  const absMap = useMemo(() => {
    if (!teacher) return {}
    const map = {}
    ;(store.absences ?? []).forEach(ab => {
      if (ab.teacherId !== teacher.id) return
      ab.slots.forEach(s => { map[`${s.date}|${s.timeSlot}`] = { ...s, absenceId: ab.id } })
    })
    return map
  }, [teacher, store.absences])

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">Calendário Semanal</h1>
        <p className="text-sm text-t2 mt-0.5">Selecione um professor para ver e gerir os horários da semana.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        {/* Lista de professores */}
        <div className="space-y-4">
          {teachersBySegment.map(({ seg, list }) => (
            <div key={seg.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm">{seg.name}</span>
                <span className="text-xs text-t3">{list.length} professor{list.length !== 1 ? 'es' : ''}</span>
              </div>
              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto scroll-thin pr-1">
                {list.length === 0 && (
                  <p className="text-xs text-t3 py-2">Nenhum professor com aulas neste nível.</p>
                )}
                {list.map(t => (
                  <TeacherCard
                    key={t.id} teacher={t}
                    selected={t.id === selectedTeacher}
                    store={store}
                    onClick={() => {
                      setSelectedTeacher(t.id); setSelectedSeg(seg.id); setWeekOffset(0)
                      // MOBILE-DAY-PAGE: redireciona para página dedicada no mobile
                      if (window.innerWidth < 1024) {
                        navigate('/calendar/day', {
                          state: { teacherId: t.id, segId: seg.id, weekDates: dates, todayISO }
                        })
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Grade semanal */}
        {teacher && seg ? (
          <div>
            <div className="card mb-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1">
                <div className="font-extrabold text-base">{teacher.name}</div>
                <div className="text-xs text-t2">{teacherSubjectNames(teacher, store.subjects) || '—'} · {mine.length} aulas cadastradas</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w - 1)}>←</button>
                <span className="text-xs font-mono font-semibold text-t2 whitespace-nowrap">{weekLabel}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w + 1)}>→</button>
                {weekOffset !== 0 && (
                  <button className="btn btn-ghost btn-xs text-accent" onClick={() => setWeekOffset(0)}>hoje</button>
                )}
              </div>
            </div>

            {/* Grade semanal — oculta no mobile (mobile usa /calendar/day) */}
            <div className="hidden lg:block">
              <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-surf2 border-b border-bdr">
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-t2 w-[100px]">Aula</th>
                        {dates.map((date, i) => {
                          const isToday = date === todayISO
                          return (
                            <th key={date}
                              onClick={() => setModalDate(date)}
                              title={`Abrir ${DAYS[i]} ${formatBR(date)}`}
                              className={`px-2 py-2.5 text-center text-xs font-bold min-w-[110px] cursor-pointer transition-colors
                                ${isToday ? 'bg-accent-l text-accent hover:bg-accent-l/70' : 'text-t2 hover:bg-bdr/60'}`}
                            >
                              <div>{DAYS[i]}</div>
                              <div className="font-mono font-normal text-[10px] opacity-70">{formatBR(date)}</div>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {periodos.map(p => (
                        <tr key={p.aulaIdx} className="border-b border-bdr/50">
                          <td className="px-3 py-2">
                            <div className="font-mono text-[11px] font-bold text-t2">{p.label}</div>
                            <div className="font-mono text-[10px] text-t3">{p.inicio}–{p.fim}</div>
                          </td>
                          {dates.map((date, i) => {
                            const day   = DAYS[i]
                            const sched = mine.find(s => s.day === day && s.timeSlot === p.slot)
                            const key   = `${date}|${p.slot}`
                            const abs   = sched ? absMap[key] : null
                            const sub   = abs?.substituteId ? store.teachers.find(t => t.id === abs.substituteId) : null
                            const subj  = store.subjects.find(x => x.id === sched?.subjectId)
                            const isToday = date === todayISO
                            return (
                              <td key={date} className={`px-2 py-1.5 ${isToday ? 'bg-accent-l/30' : ''}`}>
                                {sched ? (
                                  <button
                                    onClick={() => setModalDate(date)}
                                    className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs transition-all hover:shadow-sm
                                      ${abs ? 'bg-[#FFF1EE] border-[#FDB8A8]' : 'bg-surf2 border-bdr hover:border-t3'}`}
                                  >
                                    <div className={`font-bold truncate ${abs ? 'text-[#7F1A06]' : 'text-t1'}`}>{sched.turma}</div>
                                    <div className={`text-[10px] truncate mt-0.5 ${abs ? 'text-[#9A3412]' : 'text-t2'}`}>{subj?.name ?? '—'}</div>
                                    {abs && (
                                      <div className={`text-[10px] font-bold mt-0.5 ${sub ? 'text-ok' : 'text-err'}`}>
                                        {sub ? `↳ ${sub.name}` : '⚠ sem sub.'}
                                      </div>
                                    )}
                                  </button>
                                ) : (
                                  <div className="text-[10px] text-t3 italic text-center py-2">—</div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Marcar período (admin) */}
            {canManage && <RangeAbsenceBar teacher={teacher} dates={dates} store={store} />}
          </div>
        ) : (
          <div className="flex items-center justify-center h-48 text-t3">
            <div className="text-center">
              <div className="text-4xl mb-3">👈</div>
              <div className="text-sm font-medium">Selecione um professor para ver a grade</div>
            </div>
          </div>
        )}
      </div>

      {/* Modal do dia */}
      <DayModal
        open={!!modalDate} onClose={() => setModalDate(null)}
        date={modalDate} teacher={teacher}
        store={store} isAdmin={canManage}
      />
    </div>
  )
}

// ─── RangeAbsenceBar ──────────────────────────────────────────────────────────

function RangeAbsenceBar({ teacher, dates, store }) {
  const { createAbsence } = useAppStore()
  const [from, setFrom] = useState(dates[0])
  const [to,   setTo]   = useState(dates[4])

  const handle = () => {
    if (!from || !to || from > to) { alert('Selecione um intervalo válido.'); return }
    const days = businessDaysBetween(from, to)
    let total = 0
    days.forEach(date => {
      const dayLabel = dateToDayLabel(date)
      const alreadyAbsent = new Set(
        (store.absences ?? []).flatMap(ab =>
          ab.teacherId === teacher.id ? ab.slots.filter(s => s.date === date).map(s => s.timeSlot) : []
        )
      )
      const slots = store.schedules
        .filter(s => s.teacherId === teacher.id && s.day === dayLabel && !alreadyAbsent.has(s.timeSlot))
        .map(s => ({ date, timeSlot: s.timeSlot, scheduleId: s.id, subjectId: s.subjectId ?? null, turma: s.turma }))
      if (slots.length) { createAbsence(teacher.id, slots); total += slots.length }
    })
    toast(`${total} aula${total !== 1 ? 's' : ''} marcada${total !== 1 ? 's' : ''} como falta`, 'ok')
  }

  return (
    <div className="mt-3 flex items-center gap-3 flex-wrap p-3 bg-surf2 rounded-xl border border-bdr">
      <span className="text-xs font-semibold text-t2">Marcar ausência por período:</span>
      <input type="date" className="inp !w-auto py-1 px-2 text-xs" value={from} onChange={e => setFrom(e.target.value)} />
      <span className="text-xs text-t2">até</span>
      <input type="date" className="inp !w-auto py-1 px-2 text-xs" value={to} onChange={e => setTo(e.target.value)} />
      <button className="btn btn-dark btn-sm" onClick={handle}>Marcar período</button>
    </div>
  )
}
