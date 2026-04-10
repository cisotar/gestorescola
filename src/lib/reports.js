import { formatBR, dateToDayLabel, parseDate } from './helpers'
import { slotFullLabel, getAulas } from './periods'

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── Motor de impressão ───────────────────────────────────────────────────────

export function openPDF(html) {
  const win = window.open('', '_blank')
  if (!win) { alert('Permita popups para abrir o relatório.'); return }
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

// ─── CSS para impressão ───────────────────────────────────────────────────────

function _css() {
  return `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1814;background:#fff}
    .page{max-width:740px;margin:0 auto;padding:28px}
    .doc-hdr{border-bottom:2px solid #1a1814;padding-bottom:14px;margin-bottom:22px}
    .doc-ttl{font-size:19px;font-weight:800;letter-spacing:-0.02em}
    .doc-sub{font-size:12px;color:#6b6760;margin-top:3px}
    .doc-meta{display:flex;gap:28px;margin-top:12px;flex-wrap:wrap;align-items:flex-end}
    .m-blk{display:flex;flex-direction:column;gap:2px}
    .m-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#a09d97}
    .m-val{font-size:14px;font-weight:700}
    .section{margin-bottom:22px}
    .sec-hdr{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
      color:#6b6760;border-bottom:1px solid #e5e2d9;padding-bottom:5px;margin-bottom:10px}
    .teacher-hdr{background:#f4f2ee;font-weight:700;padding:6px 10px;border-radius:5px;
      margin:10px 0 6px;font-size:12px;border-left:3px solid #1a1814}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px}
    th{background:#f4f2ee;font-weight:700;text-align:left;padding:6px 8px;
      border:1px solid #e5e2d9;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
    td{padding:6px 8px;border:1px solid #e5e2d9;vertical-align:top}
    tr:nth-child(even) td{background:#f9f8f6}
    .ok{color:#16a34a;font-weight:700}
    .err{color:#c8290a;font-weight:700}
    .doc-ftr{margin-top:32px;border-top:1px solid #e5e2d9;padding-top:8px;font-size:10px;
      color:#a09d97;display:flex;justify-content:space-between}
    @media print{
      body{background:#fff}
      .page{box-shadow:none;border-radius:0;padding:0}
    }
  `
}

// ─── Casca HTML ───────────────────────────────────────────────────────────────

function _wrap(title, metaHTML, bodyHTML) {
  const now = new Date().toLocaleString('pt-BR')
  return `<!DOCTYPE html><html lang="pt-BR">
<head><meta charset="UTF-8"><title>${title}</title><style>${_css()}</style></head>
<body><div class="page">
  <div class="doc-hdr">
    <div class="doc-ttl">GestãoEscolar — Relatório de Substituições</div>
    <div class="doc-sub">${title}</div>
    <div class="doc-meta">${metaHTML}</div>
  </div>
  ${bodyHTML || '<p style="color:#a09d97;padding:20px 0">Nenhuma ausência no período.</p>'}
  <div class="doc-ftr"><span>GestãoEscolar</span><span>Gerado em ${now}</span></div>
</div></body></html>`
}

// ─── Linha de slot ────────────────────────────────────────────────────────────

function _slotRow(sl, store) {
  const subj = store.subjects.find(s => s.id === sl.subjectId)
  const sub  = sl.substituteId ? store.teachers.find(t => t.id === sl.substituteId) : null
  const period = slotFullLabel(sl.timeSlot, store.periodConfigs)
  return `<tr>
    <td>${period}</td>
    <td>${sl.turma ?? '—'}</td>
    <td>${subj?.name ?? '—'}</td>
    <td class="${sub ? 'ok' : 'err'}">${sub ? sub.name : '⚠ Sem substituto'}</td>
  </tr>`
}

// ─── 1. Relatório do dia — modal de dia ───────────────────────────────────────

export function generateDayHTML(date, teacherId, store) {
  const teacher  = store.teachers.find(t => t.id === teacherId)
  const dayLabel = dateToDayLabel(date)

  const allSlots = (store.absences ?? [])
    .filter(ab => ab.teacherId === teacherId)
    .flatMap(ab => ab.slots.filter(sl => sl.date === date).map(sl => ({ ...sl, absenceId: ab.id })))
    .sort((a, b) => (a.timeSlot ?? '').localeCompare(b.timeSlot ?? ''))

  const covered = allSlots.filter(s => s.substituteId).length

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Professor Ausente</span><span class="m-val">${teacher?.name ?? '—'}</span></div>
    <div class="m-blk"><span class="m-lbl">Data</span><span class="m-val">${formatBR(date)}</span></div>
    <div class="m-blk"><span class="m-lbl">Dia</span><span class="m-val">${dayLabel ?? '—'}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Cobertura</span>
      <span class="m-val ${covered === allSlots.length ? 'ok' : 'err'}">${covered}/${allSlots.length} aulas</span>
    </div>`

  const bodyHTML = allSlots.length ? `
    <table>
      <thead><tr><th>Horário</th><th>Turma</th><th>Disciplina</th><th>Substituto</th></tr></thead>
      <tbody>${allSlots.map(sl => _slotRow(sl, store)).join('')}</tbody>
    </table>` : ''

  return _wrap(`Substituições — ${dayLabel ?? ''}, ${formatBR(date)}`, metaHTML, bodyHTML)
}

// ─── 2. Relatório por professor ───────────────────────────────────────────────

export function generateTeacherHTML(teacherId, filter, store) {
  const teacher = store.teachers.find(t => t.id === teacherId)

  const allSlots = (store.absences ?? [])
    .filter(ab => ab.teacherId === teacherId)
    .flatMap(ab => ab.slots.map(sl => ({ ...sl, absenceId: ab.id })))
    .filter(sl => _filterSlot(sl, filter))
    .sort((a, b) => a.date.localeCompare(b.date))

  const byDate = {}
  allSlots.forEach(sl => { if (!byDate[sl.date]) byDate[sl.date] = []; byDate[sl.date].push(sl) })

  const covered = allSlots.filter(s => s.substituteId).length

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Professor</span><span class="m-val">${teacher?.name ?? '—'}</span></div>
    <div class="m-blk"><span class="m-lbl">Período</span><span class="m-val">${_filterLabel(filter)}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Total</span>
      <span class="m-val">${allSlots.length} aula${allSlots.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="m-blk" style="text-align:right">
      <span class="m-lbl">Cobertura</span>
      <span class="m-val ${covered === allSlots.length ? 'ok' : 'err'}">${covered}/${allSlots.length}</span>
    </div>`

  // Grade horária do professor (segmentos onde tem horários cadastrados)
  const teacherSchedules = (store.schedules ?? []).filter(s => s.teacherId === teacherId)
  const schedSegIds = [...new Set(teacherSchedules.map(s => s.timeSlot?.split('|')[0]).filter(Boolean))]
  const schedSegments = store.segments.filter(s => schedSegIds.includes(s.id))

  const scheduleGridHTML = schedSegments.length === 0 ? '' :
    `<div class="section">
      <div class="sec-hdr">Grade Horária</div>
      ${schedSegments.map(seg => {
        const turno = seg.turno ?? 'manha'
        const turnoLabel = turno === 'tarde' ? '🌇 Tarde' : '🌅 Manhã'
        return `
          <div style="margin-bottom:16px">
            <div style="font-size:11px;font-weight:700;color:#6b6860;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">
              ${seg.name} — ${turnoLabel}
            </div>
            ${_scheduleGrid(seg, turno, teacherSchedules, store, false)}
          </div>`
      }).join('')}
    </div>`

  const absencesHTML = Object.keys(byDate).map(date => `
    <div class="section">
      <div class="sec-hdr">${dateToDayLabel(date) ?? ''} — ${formatBR(date)}</div>
      <table>
        <thead><tr><th>Horário</th><th>Turma</th><th>Disciplina</th><th>Substituto</th></tr></thead>
        <tbody>${byDate[date].map(sl => _slotRow(sl, store)).join('')}</tbody>
      </table>
    </div>`).join('')

  const bodyHTML = scheduleGridHTML + absencesHTML

  return _wrap(`Ausências — ${teacher?.name ?? '—'} — ${_filterLabel(filter)}`, metaHTML, bodyHTML)
}

// ─── 3. Relatório por dia ─────────────────────────────────────────────────────

export function generateByDayHTML(date, store) {
  const dayLabel = dateToDayLabel(date)

  const allSlots = (store.absences ?? [])
    .flatMap(ab => ab.slots
      .filter(sl => sl.date === date)
      .map(sl => ({ ...sl, teacherId: ab.teacherId, absenceId: ab.id }))
    )
    .sort((a, b) => (a.timeSlot ?? '').localeCompare(b.timeSlot ?? ''))

  const byTeacher = {}
  allSlots.forEach(sl => {
    if (!byTeacher[sl.teacherId]) byTeacher[sl.teacherId] = []
    byTeacher[sl.teacherId].push(sl)
  })

  const covered = allSlots.filter(s => s.substituteId).length

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Data</span><span class="m-val">${formatBR(date)}</span></div>
    <div class="m-blk"><span class="m-lbl">Dia</span><span class="m-val">${dayLabel ?? '—'}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Ausências</span><span class="m-val">${allSlots.length} aula${allSlots.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="m-blk" style="text-align:right">
      <span class="m-lbl">Cobertura</span>
      <span class="m-val ${covered === allSlots.length ? 'ok' : 'err'}">${covered}/${allSlots.length}</span>
    </div>`

  const bodyHTML = Object.entries(byTeacher).map(([tid, slots]) => {
    const teacher = store.teachers.find(t => t.id === tid)
    return `
      <div class="section">
        <div class="teacher-hdr">${teacher?.name ?? '—'}</div>
        <table>
          <thead><tr><th>Horário</th><th>Turma</th><th>Disciplina</th><th>Substituto</th></tr></thead>
          <tbody>${slots.map(sl => _slotRow(sl, store)).join('')}</tbody>
        </table>
      </div>`
  }).join('')

  return _wrap(`Ausências — ${dayLabel ?? ''}, ${formatBR(date)}`, metaHTML, bodyHTML)
}

// ─── 4. Relatório por semana ──────────────────────────────────────────────────

export function generateByWeekHTML(monISO, teacherIdFilter, store) {
  const monDate = parseDate(monISO)
  const friDate = new Date(monDate); friDate.setDate(monDate.getDate() + 4)
  const friISO  = friDate.toISOString().split('T')[0]

  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monDate); d.setDate(monDate.getDate() + i)
    return d.toISOString().split('T')[0]
  })

  const allSlots = (store.absences ?? [])
    .filter(ab => !teacherIdFilter || ab.teacherId === teacherIdFilter)
    .flatMap(ab => ab.slots
      .filter(sl => sl.date >= monISO && sl.date <= friISO)
      .map(sl => ({ ...sl, teacherId: ab.teacherId, absenceId: ab.id }))
    )

  const teacher = teacherIdFilter ? store.teachers.find(t => t.id === teacherIdFilter) : null
  const covered = allSlots.filter(s => s.substituteId).length

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Semana</span><span class="m-val">${formatBR(monISO)} – ${formatBR(friISO)}</span></div>
    ${teacher ? `<div class="m-blk"><span class="m-lbl">Professor</span><span class="m-val">${teacher.name}</span></div>` : ''}
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Total</span><span class="m-val">${allSlots.length} aula${allSlots.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="m-blk" style="text-align:right">
      <span class="m-lbl">Cobertura</span>
      <span class="m-val ${covered === allSlots.length ? 'ok' : 'err'}">${covered}/${allSlots.length}</span>
    </div>`

  const bodyHTML = days.map(date => {
    const daySlots = allSlots.filter(sl => sl.date === date)
    if (!daySlots.length) return ''
    const byTeacher = {}
    daySlots.forEach(sl => { if (!byTeacher[sl.teacherId]) byTeacher[sl.teacherId] = []; byTeacher[sl.teacherId].push(sl) })
    return `
      <div class="section">
        <div class="sec-hdr">${dateToDayLabel(date) ?? ''} — ${formatBR(date)}</div>
        ${Object.entries(byTeacher).map(([tid, slots]) => {
          const t = store.teachers.find(x => x.id === tid)
          return `
            <div class="teacher-hdr">${t?.name ?? '—'}</div>
            <table>
              <thead><tr><th>Horário</th><th>Turma</th><th>Disciplina</th><th>Substituto</th></tr></thead>
              <tbody>${slots.map(sl => _slotRow(sl, store)).join('')}</tbody>
            </table>`
        }).join('')}
      </div>`
  }).join('')

  const title = teacher
    ? `Ausências — ${teacher.name} — semana ${formatBR(monISO)}`
    : `Ausências — Semana ${formatBR(monISO)}`
  return _wrap(title, metaHTML, bodyHTML)
}

// ─── 5. Relatório por mês ─────────────────────────────────────────────────────

export function generateByMonthHTML(year, month, teacherIdFilter, store) {
  const allSlots = (store.absences ?? [])
    .filter(ab => !teacherIdFilter || ab.teacherId === teacherIdFilter)
    .flatMap(ab => ab.slots
      .filter(sl => {
        const d = parseDate(sl.date)
        return d.getFullYear() === year && d.getMonth() === month
      })
      .map(sl => ({ ...sl, teacherId: ab.teacherId, absenceId: ab.id }))
    )
    .sort((a, b) => a.date.localeCompare(b.date))

  const teacher = teacherIdFilter ? store.teachers.find(t => t.id === teacherIdFilter) : null
  const covered = allSlots.filter(s => s.substituteId).length

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Mês</span><span class="m-val">${MONTH_NAMES[month]} ${year}</span></div>
    ${teacher ? `<div class="m-blk"><span class="m-lbl">Professor</span><span class="m-val">${teacher.name}</span></div>` : ''}
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Total</span><span class="m-val">${allSlots.length} aula${allSlots.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="m-blk" style="text-align:right">
      <span class="m-lbl">Cobertura</span>
      <span class="m-val ${covered === allSlots.length ? 'ok' : 'err'}">${covered}/${allSlots.length}</span>
    </div>`

  const byDate = {}
  allSlots.forEach(sl => { if (!byDate[sl.date]) byDate[sl.date] = []; byDate[sl.date].push(sl) })

  const bodyHTML = Object.keys(byDate).map(date => {
    const daySlots = byDate[date]
    const byTeacher = {}
    daySlots.forEach(sl => { if (!byTeacher[sl.teacherId]) byTeacher[sl.teacherId] = []; byTeacher[sl.teacherId].push(sl) })
    return `
      <div class="section">
        <div class="sec-hdr">${dateToDayLabel(date) ?? ''} — ${formatBR(date)}</div>
        ${Object.entries(byTeacher).map(([tid, slots]) => {
          const t = store.teachers.find(x => x.id === tid)
          return `
            <div class="teacher-hdr">${t?.name ?? '—'}</div>
            <table>
              <thead><tr><th>Horário</th><th>Turma</th><th>Disciplina</th><th>Substituto</th></tr></thead>
              <tbody>${slots.map(sl => _slotRow(sl, store)).join('')}</tbody>
            </table>`
        }).join('')}
      </div>`
  }).join('')

  const title = teacher
    ? `Ausências — ${teacher.name} — ${MONTH_NAMES[month]} ${year}`
    : `Ausências — ${MONTH_NAMES[month]} ${year}`
  return _wrap(title, metaHTML, bodyHTML)
}

// ─── 6. Mensagem WhatsApp ─────────────────────────────────────────────────────

function _slotLine(sl, store) {
  const aulaIdx = Number((sl.timeSlot ?? '').split('|')[2] ?? 0)
  const ordinal = `${aulaIdx + 1}ª aula`
  const subj = store.subjects.find(s => s.id === sl.subjectId)
  const sub  = sl.substituteId ? store.teachers.find(t => t.id === sl.substituteId) : null
  return `${ordinal} · ${sl.turma ?? '—'} · ${subj?.name ?? '—'} | Subst.: ${sub ? sub.name : 'EM PROCESSAMENTO'}`
}

export function buildWhatsAppMessage(mode, context, store) {
  const { slots = [], label = '', teacherName } = context

  const header = '*Relatório de Ausência*'

  if (!slots.length) {
    return `${header}\n\nNenhuma ausência registrada.`
  }

  // Modos com professor único
  if (mode === 'teacher' || (mode === 'day' && teacherName)) {
    const dateLabel = mode === 'day' ? `📅 Data: ${label}` : `📅 Período: ${label}`
    const lines = slots
      .sort((a, b) => (a.timeSlot ?? '').localeCompare(b.timeSlot ?? ''))
      .map(sl => _slotLine(sl, store))
    return [
      header, '',
      dateLabel,
      `👤 Professor ausente: ${teacherName ?? '—'}`, '',
      'Aulas:',
      ...lines,
    ].join('\n')
  }

  // Modos com múltiplos professores (week / month / day sem filtro)
  const icon = mode === 'week' ? '🗓 Semana:' : mode === 'month' ? '📆 Mês:' : '📅 Data:'
  const sections = []
  const byTeacher = {}
  slots.forEach(sl => {
    if (!byTeacher[sl.teacherId]) byTeacher[sl.teacherId] = []
    byTeacher[sl.teacherId].push(sl)
  })

  Object.entries(byTeacher).forEach(([tid, tSlots]) => {
    const teacher = store.teachers.find(t => t.id === tid)
    const byDate = {}
    tSlots.forEach(sl => {
      if (!byDate[sl.date]) byDate[sl.date] = []
      byDate[sl.date].push(sl)
    })
    const dateParts = Object.keys(byDate).sort().map(date => {
      const dayLines = byDate[date]
        .sort((a, b) => (a.timeSlot ?? '').localeCompare(b.timeSlot ?? ''))
        .map(sl => _slotLine(sl, store))
      return [`${dateToDayLabel(date)}, ${formatBR(date)}:`, ...dayLines].join('\n')
    })
    sections.push([`👤 ${teacher?.name ?? '—'}`, '', ...dateParts].join('\n'))
  })

  return [header, '', `${icon} ${label}`, '', sections.join('\n\n---\n')].join('\n')
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function _filterSlot(sl, filter) {
  if (!filter || filter.type === 'all') return true
  if (filter.type === 'day') return sl.date === filter.date
  if (filter.type === 'week') return sl.date >= filter.weekStart && sl.date <= filter.weekEnd
  if (filter.type === 'month') {
    const d = parseDate(sl.date)
    return d.getFullYear() === filter.year && d.getMonth() === filter.month
  }
  return true
}

function _filterLabel(filter) {
  if (!filter || filter.type === 'all') return 'Todos os registros'
  if (filter.type === 'day') return formatBR(filter.date)
  if (filter.type === 'week') return `Semana de ${formatBR(filter.weekStart)}`
  if (filter.type === 'month') return `${MONTH_NAMES[filter.month]} ${filter.year}`
  return '—'
}

// ─── 7. Grade horária — helper interno ───────────────────────────────────────

const SCHED_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']

function _scheduleGrid(seg, turno, schedules, store, showTeacher = false) {
  const aulas = getAulas(seg.id, turno, store.periodConfigs)
  if (!aulas.length) return ''

  const header = `<tr><th style="min-width:90px"></th>${SCHED_DAYS.map(d => `<th>${d}</th>`).join('')}</tr>`

  const rows = aulas.map(({ aulaIdx, label, inicio, fim }) => {
    const cells = SCHED_DAYS.map(day => {
      const matches = schedules.filter(s =>
        s.timeSlot === `${seg.id}|${turno}|${aulaIdx}` && s.day === day
      )
      if (!matches.length) return '<td style="color:#c8c4bb">—</td>'
      const lines = matches.map(s => {
        const subj = store.subjects.find(x => x.id === s.subjectId)
        if (showTeacher) {
          const teacher = store.teachers.find(t => t.id === s.teacherId)
          return `<strong>${teacher?.name ?? '—'}</strong><br>${s.turma ?? '—'} · ${subj?.name ?? '—'}`
        }
        return `<strong>${s.turma ?? '—'}</strong><br>${subj?.name ?? '—'}`
      }).join('<hr style="border:none;border-top:1px solid #e5e2d9;margin:3px 0">')
      return `<td>${lines}</td>`
    }).join('')
    return `<tr>
      <td style="white-space:nowrap"><strong>${label}</strong><br><span style="color:#a09d97;font-size:10px">${inicio}–${fim}</span></td>
      ${cells}
    </tr>`
  }).join('')

  return `<table>${header}<tbody>${rows}</tbody></table>`
}

// ─── 8. Grade horária — por professor ────────────────────────────────────────

export function generateTeacherScheduleHTML(teacher, store) {
  // Segmentos do professor derivados das matérias
  const teacherSegIds = [...new Set(
    (teacher.subjectIds ?? []).flatMap(sid => {
      const subj = store.subjects.find(s => s.id === sid)
      const area = subj ? store.areas.find(a => a.id === subj.areaId) : null
      return area?.segmentIds ?? []
    })
  )]
  const relevantSegments = store.segments.filter(s => teacherSegIds.includes(s.id))

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Professor</span><span class="m-val">${teacher?.name ?? '—'}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Aulas/semana</span>
      <span class="m-val">${(store.schedules ?? []).filter(s => s.teacherId === teacher.id).length}</span>
    </div>`

  const teacherSchedules = (store.schedules ?? []).filter(s => s.teacherId === teacher.id)

  const bodyHTML = relevantSegments.length === 0
    ? '<p style="color:#a09d97;padding:20px 0">Nenhum horário cadastrado.</p>'
    : relevantSegments.map(seg => {
        const turno = seg.turno ?? 'manha'
        const turnoLabel = turno === 'tarde' ? '🌇 Tarde' : '🌅 Manhã'
        return `
          <div class="section">
            <div class="sec-hdr">${seg.name} — ${turnoLabel}</div>
            ${_scheduleGrid(seg, turno, teacherSchedules, store, false)}
          </div>`
      }).join('')

  return _wrap(`Grade Horária — ${teacher?.name ?? '—'}`, metaHTML, bodyHTML)
}

// ─── 9. Grade horária — escola (com filtros) ──────────────────────────────────

export function generateSchoolScheduleHTML(filter = {}, store) {
  const { teacherId, turma } = filter

  const filtered = (store.schedules ?? []).filter(s =>
    (!teacherId || s.teacherId === teacherId) &&
    (!turma    || s.turma    === turma)
  )

  const teacherLabel = teacherId ? store.teachers.find(t => t.id === teacherId)?.name : null

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Filtro Professor</span><span class="m-val">${teacherLabel ?? 'Todos'}</span></div>
    <div class="m-blk"><span class="m-lbl">Filtro Turma</span><span class="m-val">${turma ?? 'Todas'}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Total aulas</span><span class="m-val">${filtered.length}</span>
    </div>`

  // Segmentos presentes nos schedules filtrados
  const segIds = [...new Set(filtered.map(s => s.timeSlot?.split('|')[0]).filter(Boolean))]
  const relevantSegments = store.segments.filter(s => segIds.includes(s.id))

  const bodyHTML = relevantSegments.length === 0
    ? '<p style="color:#a09d97;padding:20px 0">Nenhum horário encontrado para os filtros selecionados.</p>'
    : relevantSegments.map(seg => {
        const turnoSeg = seg.turno ?? 'manha'
        const turnoLabel = turnoSeg === 'tarde' ? '🌇 Tarde' : '🌅 Manhã'
        return `
          <div class="section">
            <div class="sec-hdr">${seg.name} — ${turnoLabel}</div>
            ${_scheduleGrid(seg, turnoSeg, filtered, store, true)}
          </div>`
      }).join('')

  const title = [teacherLabel, turma ? `Turma ${turma}` : null].filter(Boolean).join(' · ') || 'Todos os horários'
  return _wrap(`Grade da Escola — ${title}`, metaHTML, bodyHTML)
}
