import { formatBR, dateToDayLabel, parseDate, formatISO } from '../helpers/dates'
import { isFormationSlot } from '../helpers/turmas'
import { slotFullLabel, getAulas, gerarPeriodosEspeciais, makeEspecialSlot, getCfg, parseSlot, toMin, mergeAndSortPeriodos } from '../periods'

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
    .grade-section + .grade-section{page-break-before:always}
    @media print{
      body{background:#fff}
      .page{box-shadow:none;border-radius:0;padding:0}
      .grade-section + .grade-section{page-break-before:always}
    }
  `
}

// ─── Casca HTML ───────────────────────────────────────────────────────────────

function _wrap(title, metaHTML, bodyHTML, docTitle = 'GestãoEscolar — Relatório de Substituições') {
  const now = new Date().toLocaleString('pt-BR')
  return `<!DOCTYPE html><html lang="pt-BR">
<head><meta charset="UTF-8"><title>${title}</title><style>${_css()}</style></head>
<body><div class="page">
  <div class="doc-hdr">
    <div class="doc-ttl">${docTitle}</div>
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
  const period = slotFullLabel(sl.timeSlot, store.periodConfigs)

  // Detectar se slot é FORMAÇÃO
  const isFormation = isFormationSlot(sl.turma, sl.subjectId, store.sharedSeries ?? [])

  if (isFormation) {
    // Marcar slot FORMAÇÃO como "Dispensa"
    return `<tr>
      <td>${period}</td>
      <td>${sl.turma ?? '—'}</td>
      <td>${subj?.name ?? '—'}</td>
      <td class="ok"><span class="badge-formation">Dispensa</span></td>
    </tr>`
  }

  // Comportamento normal para slots regulares
  const sub  = sl.substituteId ? store.teachers.find(t => t.id === sl.substituteId) : null
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

  // Filtrar slots não-FORMAÇÃO para totalizadores
  const nonFormationSlots = allSlots.filter(s => !isFormationSlot(s.turma, s.subjectId, store.sharedSeries ?? []))
  const covered = nonFormationSlots.filter(s => s.substituteId).length
  const hasFormation = allSlots.length > nonFormationSlots.length
  const coverageNote = hasFormation ? ' (sem FORMAÇÃO)' : ''

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Professor Ausente</span><span class="m-val">${teacher?.name ?? '—'}</span></div>
    <div class="m-blk"><span class="m-lbl">Data</span><span class="m-val">${formatBR(date)}</span></div>
    <div class="m-blk"><span class="m-lbl">Dia</span><span class="m-val">${dayLabel ?? '—'}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Cobertura</span>
      <span class="m-val ${covered === nonFormationSlots.length ? 'ok' : 'err'}">${covered}/${nonFormationSlots.length} aulas${coverageNote}</span>
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

  // Filtrar slots não-FORMAÇÃO para totalizadores
  const nonFormationSlots = allSlots.filter(s => !isFormationSlot(s.turma, s.subjectId, store.sharedSeries ?? []))
  const covered = nonFormationSlots.filter(s => s.substituteId).length
  const hasFormation = allSlots.length > nonFormationSlots.length
  const totalNote = hasFormation ? ` (sem FORMAÇÃO)` : ''

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Professor</span><span class="m-val">${teacher?.name ?? '—'}</span></div>
    <div class="m-blk"><span class="m-lbl">Período</span><span class="m-val">${_filterLabel(filter)}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Total</span>
      <span class="m-val">${nonFormationSlots.length} aula${nonFormationSlots.length !== 1 ? 's' : ''}${totalNote}</span>
    </div>
    <div class="m-blk" style="text-align:right">
      <span class="m-lbl">Cobertura</span>
      <span class="m-val ${covered === nonFormationSlots.length ? 'ok' : 'err'}">${covered}/${nonFormationSlots.length}</span>
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

  // Filtrar slots não-FORMAÇÃO para totalizadores
  const nonFormationSlots = allSlots.filter(s => !isFormationSlot(s.turma, s.subjectId, store.sharedSeries ?? []))
  const covered = nonFormationSlots.filter(s => s.substituteId).length
  const hasFormation = allSlots.length > nonFormationSlots.length
  const absencesNote = hasFormation ? ` (sem FORMAÇÃO)` : ''

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Data</span><span class="m-val">${formatBR(date)}</span></div>
    <div class="m-blk"><span class="m-lbl">Dia</span><span class="m-val">${dayLabel ?? '—'}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Ausências</span><span class="m-val">${nonFormationSlots.length} aula${nonFormationSlots.length !== 1 ? 's' : ''}${absencesNote}</span>
    </div>
    <div class="m-blk" style="text-align:right">
      <span class="m-lbl">Cobertura</span>
      <span class="m-val ${covered === nonFormationSlots.length ? 'ok' : 'err'}">${covered}/${nonFormationSlots.length}</span>
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
  const friISO  = formatISO(friDate)

  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monDate); d.setDate(monDate.getDate() + i)
    return formatISO(d)
  })

  const allSlots = (store.absences ?? [])
    .filter(ab => !teacherIdFilter || ab.teacherId === teacherIdFilter)
    .flatMap(ab => ab.slots
      .filter(sl => sl.date >= monISO && sl.date <= friISO)
      .map(sl => ({ ...sl, teacherId: ab.teacherId, absenceId: ab.id }))
    )

  const teacher = teacherIdFilter ? store.teachers.find(t => t.id === teacherIdFilter) : null

  // Filtrar slots não-FORMAÇÃO para totalizadores
  const nonFormationSlots = allSlots.filter(s => !isFormationSlot(s.turma, s.subjectId, store.sharedSeries ?? []))
  const covered = nonFormationSlots.filter(s => s.substituteId).length
  const hasFormation = allSlots.length > nonFormationSlots.length
  const totalNote = hasFormation ? ` (sem FORMAÇÃO)` : ''

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Semana</span><span class="m-val">${formatBR(monISO)} – ${formatBR(friISO)}</span></div>
    ${teacher ? `<div class="m-blk"><span class="m-lbl">Professor</span><span class="m-val">${teacher.name}</span></div>` : ''}
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Total</span><span class="m-val">${nonFormationSlots.length} aula${nonFormationSlots.length !== 1 ? 's' : ''}${totalNote}</span>
    </div>
    <div class="m-blk" style="text-align:right">
      <span class="m-lbl">Cobertura</span>
      <span class="m-val ${covered === nonFormationSlots.length ? 'ok' : 'err'}">${covered}/${nonFormationSlots.length}</span>
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

  // Filtrar slots não-FORMAÇÃO para totalizadores
  const nonFormationSlots = allSlots.filter(s => !isFormationSlot(s.turma, s.subjectId, store.sharedSeries ?? []))
  const covered = nonFormationSlots.filter(s => s.substituteId).length
  const hasFormation = allSlots.length > nonFormationSlots.length
  const totalNote = hasFormation ? ` (sem FORMAÇÃO)` : ''

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Mês</span><span class="m-val">${MONTH_NAMES[month]} ${year}</span></div>
    ${teacher ? `<div class="m-blk"><span class="m-lbl">Professor</span><span class="m-val">${teacher.name}</span></div>` : ''}
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Total</span><span class="m-val">${nonFormationSlots.length} aula${nonFormationSlots.length !== 1 ? 's' : ''}${totalNote}</span>
    </div>
    <div class="m-blk" style="text-align:right">
      <span class="m-lbl">Cobertura</span>
      <span class="m-val ${covered === nonFormationSlots.length ? 'ok' : 'err'}">${covered}/${nonFormationSlots.length}</span>
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

function _scheduleGrid(seg, turno, schedules, store, showTeacher = false, useApelido = false, horariosSemana = null) {
  const cfg = getCfg(seg.id, turno, store.periodConfigs)
  const allItems = mergeAndSortPeriodos(cfg)
  if (!allItems.length) return ''

  const header = `<tr><th style="width:90px;color:#1a1814"></th>${SCHED_DAYS.map(d => `<th style="color:#1a1814">${d}</th>`).join('')}</tr>`

  // ── Pré-calcular slotKey para itens especiais (índice 1-based) ─────────────
  let aulaEspecialCount = 0
  const itemsWithSlot = allItems.map(item => {
    if (item._tipo === 'especial' && !item.isIntervalo) {
      aulaEspecialCount += 1
      return { ...item, slotKey: makeEspecialSlot(seg.id, turno, aulaEspecialCount) }
    }
    return { ...item, slotKey: null }
  })

  // ── Pre-calcular separadores: inserir traço duplo na transição regular↔especial ─
  const baseType = t => t._tipo?.startsWith('especial') || t._tipo?.startsWith('intervalo-especial') ? 'especial' : 'regular'
  const separatorBefore = new Set()
  for (let i = 1; i < itemsWithSlot.length; i++) {
    if (baseType(itemsWithSlot[i]) !== baseType(itemsWithSlot[i - 1])) {
      separatorBefore.add(i)
    }
  }

  // ── Gerar HTML de cada linha ──────────────────────────────────────────────
  // rowDataIdx conta apenas linhas de dados (aulas), excluindo intervalos e separadores,
  // para reproduzir a alternância par/ímpar correta independente do traço diagonal.
  let rowDataIdx = 0

  const allRows = itemsWithSlot.map((item, i) => {
    const sep = separatorBefore.has(i)
      ? `<tr><td colspan="6" style="border-top:3px double #1a1814;padding:0;height:0"></td></tr>`
      : ''

    // Linha de intervalo (regular ou especial) — não conta na alternância
    if (item.isIntervalo) {
      return sep + `<tr>
      <td style="width:90px;white-space:nowrap;color:#1a1814;font-size:10px">${item.inicio}–${item.fim}<br>${item.label}</td>
      <td colspan="5" style="border:1px solid #e5e2d9"></td>
    </tr>`
    }

    // Linha de dados: incrementar contador e calcular cor de fundo par/ímpar
    const isEven = (rowDataIdx % 2 === 1) // 0-based: posição 1, 3, 5… = linhas "pares" da tabela
    rowDataIdx++
    const rowBg = isEven ? '#f9f8f6' : '#ffffff'

    // Traço diagonal (fora do expediente): gradiente + cor de fundo alternada como camadas múltiplas
    const diagonalBg = `linear-gradient(to bottom right, transparent calc(50% - 0.5px), #D1CEC8 50%, transparent calc(50% + 0.5px)), ${rowBg}`

    if (item._tipo === 'regular') {
      const { aulaIdx, label, inicio, fim } = item
      const cells = SCHED_DAYS.map(day => {
        // RN-01: verificar se a célula está fora do expediente
        if (horariosSemana !== null) {
          const horarioDia = horariosSemana[day]
          if (horarioDia?.entrada && horarioDia?.saida) {
            if (inicio && fim && (toMin(inicio) < toMin(horarioDia.entrada) || toMin(fim) > toMin(horarioDia.saida))) {
              return `<td style="background:${diagonalBg}"></td>`
            }
          }
        }
        const matches = schedules.filter(s =>
          s.timeSlot === `${seg.id}|${turno}|${aulaIdx}` && s.day === day
        )
        if (!matches.length) return `<td style="background:${rowBg};color:#c8c4bb">—</td>`
        const lines = matches.map(s => {
          const subj = store.subjects.find(x => x.id === s.subjectId)
          if (showTeacher) {
            const teacher = store.teachers.find(t => t.id === s.teacherId)
            const displayName = useApelido ? (teacher?.apelido || teacher?.name || '—') : (teacher?.name ?? '—')
            return `<strong style="color:#1a1814;font-size:11px;text-transform:uppercase;letter-spacing:.02em">${displayName}</strong><br><span style="color:#4a4740;font-size:10px">${subj?.name ?? '—'}</span>`
          }
          return `<strong style="color:#1a1814;font-size:11px;text-transform:uppercase;letter-spacing:.02em">${s.turma ?? '—'}</strong><br><span style="color:#4a4740;font-size:10px">${subj?.name ?? '—'}</span>`
        }).join('<hr style="border:none;border-top:1px solid #e5e2d9;margin:3px 0">')
        return `<td style="background:${rowBg}">${lines}</td>`
      }).join('')
      return sep + `<tr>
      <td style="width:90px;white-space:nowrap;color:#1a1814;background:${rowBg}"><strong>${label}</strong><br><span style="color:#4a4740;font-size:10px">${inicio}–${fim}</span></td>
      ${cells}
    </tr>`
    }

    const { slotKey, label, inicio, fim } = item
    const labelStyle = `border-left:3px solid #C05621;width:90px;white-space:nowrap;color:#1a1814;background:${rowBg}`

    const cells = SCHED_DAYS.map(day => {
      // RN-01: verificar se a célula está fora do expediente
      if (horariosSemana !== null) {
        const horarioDia = horariosSemana[day]
        if (horarioDia?.entrada && horarioDia?.saida) {
          if (inicio && fim && (toMin(inicio) < toMin(horarioDia.entrada) || toMin(fim) > toMin(horarioDia.saida))) {
            return `<td style="background:${diagonalBg}"></td>`
          }
        }
      }
      if (!slotKey) {
        return `<td style="background:${rowBg};color:#c8c4bb">—</td>`
      }
      const matches = schedules.filter(s => s.timeSlot === slotKey && s.day === day)
      if (!matches.length) return `<td style="background:${rowBg};color:#c8c4bb">—</td>`
      const lines = matches.map(s => {
        const subj = store.subjects.find(x => x.id === s.subjectId)
        if (showTeacher) {
          const teacher = store.teachers.find(t => t.id === s.teacherId)
          const displayName = useApelido ? (teacher?.apelido || teacher?.name || '—') : (teacher?.name ?? '—')
          return `<strong style="color:#1a1814;font-size:11px;text-transform:uppercase;letter-spacing:.02em">${displayName}</strong><br><span style="color:#4a4740;font-size:10px">${subj?.name ?? '—'}</span>`
        }
        return `<strong style="color:#1a1814;font-size:11px;text-transform:uppercase;letter-spacing:.02em">${s.turma ?? '—'}</strong><br><span style="color:#4a4740;font-size:10px">${subj?.name ?? '—'}</span>`
      }).join('<hr style="border:none;border-top:1px solid #e5e2d9;margin:3px 0">')
      return `<td style="background:${rowBg}">${lines}</td>`
    }).join('')

    return sep + `<tr>
      <td style="${labelStyle}"><strong>${label}</strong><br><span style="color:#4a4740;font-size:10px">${inicio}–${fim}</span></td>
      ${cells}
    </tr>`
  }).join('')

  return `<table style="table-layout:fixed;width:100%">${header}<tbody>${allRows}</tbody></table>`
}

// ─── 8. Grade horária — por professor ────────────────────────────────────────

export function generateTeacherScheduleHTML(teacher, store, useApelido = false) {
  const teacherSchedules = (store.schedules ?? []).filter(s => s.teacherId === teacher.id)

  // ── Detecção de turno duplo (mesma lógica de SchedulePage.jsx) ─────────────
  const pairsSeen = new Set()
  const allPairs = teacherSchedules
    .map(s => parseSlot(s.timeSlot))
    .filter(Boolean)
    .reduce((acc, { segmentId, turno }) => {
      const key = `${segmentId}|${turno}`
      if (!pairsSeen.has(key)) {
        pairsSeen.add(key)
        acc.push({ segmentId, turno })
      }
      return acc
    }, [])

  const distinctTurnos = [...new Set(allPairs.map(p => p.turno))]
  const isDupleTurno = distinctTurnos.length >= 2

  // Para turno duplo: um par por turno distinto (primeiro encontrado)
  const turnoPairs = isDupleTurno
    ? distinctTurnos.map(t => allPairs.find(p => p.turno === t))
    : []

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Professor</span><span class="m-val">${teacher?.name ?? '—'}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Aulas/semana</span>
      <span class="m-val">${teacherSchedules.length}</span>
    </div>`

  const TURNO_LABELS_PDF = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }

  // ── Tabela de horários de entrada/saída ──────────────────────────────────────
  const hs = teacher.horariosSemana
  const hsValido = hs && typeof hs === 'object' && Object.keys(hs).length > 0
  const horariosSemanaParam = hsValido ? hs : null

  let scheduleHeaderHTML
  if (hsValido) {
    const entradaRow = SCHED_DAYS.map(d => `<td style="text-align:center">${hs[d]?.entrada ?? '—'}</td>`).join('')
    const saidaRow   = SCHED_DAYS.map(d => `<td style="text-align:center">${hs[d]?.saida   ?? '—'}</td>`).join('')
    scheduleHeaderHTML = `<table style="margin-bottom:16px;table-layout:fixed;width:100%">
      <thead><tr>
        <th style="width:90px"></th>
        ${SCHED_DAYS.map(d => `<th style="text-align:center">${d}</th>`).join('')}
      </tr></thead>
      <tbody>
        <tr><td style="color:#6b6760;font-weight:700">Entrada</td>${entradaRow}</tr>
        <tr><td style="color:#6b6760;font-weight:700">Saída</td>${saidaRow}</tr>
      </tbody>
    </table>`
  } else {
    scheduleHeaderHTML = `<p style="color:#a09d97;margin-bottom:16px">Horários de entrada e saída não informados</p>`
  }

  let bodyHTML

  if (isDupleTurno) {
    // ── Turno duplo: uma <section class="grade-section"> por turno ────────────
    const sections = turnoPairs.map(({ segmentId, turno }, idx) => {
      const seg = store.segments.find(s => s.id === segmentId)
      const segName = seg?.name ?? segmentId
      const turnoLabel = TURNO_LABELS_PDF[turno] ?? turno
      // Filtrar schedules do professor apenas para este segmento/turno
      const filteredSchedules = teacherSchedules.filter(s => {
        const parsed = parseSlot(s.timeSlot)
        return parsed && parsed.segmentId === segmentId && parsed.turno === turno
      })
      const grid = seg ? _scheduleGrid(seg, turno, filteredSchedules, store, false, useApelido, horariosSemanaParam) : ''
      const repeatedHeader = idx === 0 ? '' : scheduleHeaderHTML
      return `<section class="grade-section" style="${idx === 0 ? '' : 'page-break-before:always;'}">
        ${repeatedHeader}
        <h2 style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#1a1814;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1a1814">${segName} — ${turnoLabel}</h2>
        ${grid}
      </section>`
    })

    if (sections.length === 0) {
      bodyHTML = scheduleHeaderHTML + '<p style="color:#a09d97;padding:20px 0">Nenhum horário cadastrado.</p>'
    } else {
      bodyHTML = scheduleHeaderHTML + sections.join('')
    }
  } else {
    // ── Turno simples: usar pares reais (segmento/turno) derivados dos schedules ─
    const gridsHTML = allPairs.length === 0
      ? '<p style="color:#a09d97;padding:20px 0">Nenhum horário cadastrado.</p>'
      : allPairs.map(({ segmentId, turno }) => {
          const seg = store.segments.find(s => s.id === segmentId)
          if (!seg) return ''
          const turnoLabel = TURNO_LABELS_PDF[turno] ?? turno
          const filteredSchedules = teacherSchedules.filter(s => {
            const parsed = parseSlot(s.timeSlot)
            return parsed && parsed.segmentId === segmentId && parsed.turno === turno
          })
          return `
            <div class="section">
              <div class="sec-hdr">${seg.name} — ${turnoLabel}</div>
              ${_scheduleGrid(seg, turno, filteredSchedules, store, false, useApelido, horariosSemanaParam)}
            </div>`
        }).join('')
    bodyHTML = scheduleHeaderHTML + gridsHTML
  }

  return _wrap(`Grade Horária — ${teacher?.name ?? '—'}`, metaHTML, bodyHTML, 'GestãoEscolar — Grade Horária')
}

// ─── 8.1 Grade horária — por professor com turnos específicos ─────────────────

export function generateGradesProfessorHTML(teacher, turnos, store, useApelido = false) {
  /**
   * Gera HTML completo para PDF de grades de professor com suporte a turno duplo.
   *
   * teacher:    Objeto professor com id, name, apelido, horariosSemana
   * turnos:     Array [{ segmentId, turno }, ...] — turnos a renderizar
   * store:      useAppStore state com segments, subjects, periodConfigs, schedules
   * useApelido: boolean — usar apelido vs nome completo
   *
   * Retorna:    HTML string completo com doctype, pronto para openPDF()
   */

  // ── Filtrar schedules do professor ──────────────────────────────────────────
  const teacherSchedules = (store.schedules ?? []).filter(s => s.teacherId === teacher?.id)

  // ── Validar entrada: se turnos vazio, retornar aviso ──────────────────────
  if (!turnos || turnos.length === 0) {
    const metaHTML = `
      <div class="m-blk"><span class="m-lbl">Professor</span><span class="m-val">${teacher?.name ?? '—'}</span></div>
      <div class="m-blk" style="margin-left:auto;text-align:right">
        <span class="m-lbl">Aulas/semana</span>
        <span class="m-val">0</span>
      </div>`
    const bodyHTML = '<p style="color:#a09d97;padding:20px 0">Nenhum período informado.</p>'
    return _wrap(`Grade Horária — ${teacher?.name ?? '—'}`, metaHTML, bodyHTML, 'GestãoEscolar — Grade Horária')
  }

  // ── Metadados do cabeçalho ──────────────────────────────────────────────────
  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Professor</span><span class="m-val">${teacher?.name ?? '—'}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Aulas/semana</span>
      <span class="m-val">${teacherSchedules.length}</span>
    </div>`

  // ── Tabela de horários de entrada/saída ──────────────────────────────────────
  const hs = teacher?.horariosSemana
  const hsValido = hs && typeof hs === 'object' && Object.keys(hs).length > 0
  const horariosSemanaParam = hsValido ? hs : null

  let scheduleHeaderHTML
  if (hsValido) {
    const entradaRow = SCHED_DAYS.map(d => `<td style="text-align:center">${hs[d]?.entrada ?? '—'}</td>`).join('')
    const saidaRow   = SCHED_DAYS.map(d => `<td style="text-align:center">${hs[d]?.saida   ?? '—'}</td>`).join('')
    scheduleHeaderHTML = `<table style="margin-bottom:16px;table-layout:fixed;width:100%">
      <thead><tr>
        <th style="width:90px"></th>
        ${SCHED_DAYS.map(d => `<th style="text-align:center">${d}</th>`).join('')}
      </tr></thead>
      <tbody>
        <tr><td style="color:#6b6760;font-weight:700">Entrada</td>${entradaRow}</tr>
        <tr><td style="color:#6b6760;font-weight:700">Saída</td>${saidaRow}</tr>
      </tbody>
    </table>`
  } else {
    scheduleHeaderHTML = ''
  }

  // ── Labels de turno para PDF ────────────────────────────────────────────────
  const TURNO_LABELS_PDF = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }

  // ── Renderizar seções por turno (com page-break para turno duplo) ───────────
  const sections = turnos.map(({ segmentId, turno }, idx) => {
    const seg = store.segments?.find(s => s.id === segmentId)
    const segName = seg?.name ?? segmentId
    const turnoLabel = TURNO_LABELS_PDF[turno] ?? turno

    // ── Filtrar schedules apenas para este segmento/turno do professor ────────
    const filteredSchedules = teacherSchedules.filter(s => {
      const parsed = parseSlot(s.timeSlot)
      return parsed && parsed.segmentId === segmentId && parsed.turno === turno
    })

    // ── Renderizar grid principal ──────────────────────────────────────────────
    const grid = seg ? _scheduleGrid(seg, turno, filteredSchedules, store, false, useApelido, horariosSemanaParam) : ''
    const gridOrEmpty = grid || '<p style="color:#a09d97;padding:20px 0">Nenhum horário cadastrado.</p>'

    // ── Subtitle com page-break e repetição de cabeçalho se não for o primeiro ─
    const pageBreakStyle = idx === 0 ? '' : 'page-break-before:always;'
    const repeatedHeader = idx === 0 ? '' : scheduleHeaderHTML

    return `<section class="grade-section" style="${pageBreakStyle}">
      ${repeatedHeader}
      <h2 style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#1a1814;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1a1814">${segName} — ${turnoLabel}</h2>
      ${gridOrEmpty}
    </section>`
  }).join('')

  // ── Montar body final ──────────────────────────────────────────────────────
  const bodyHTML = sections.length === 0
    ? '<p style="color:#a09d97;padding:20px 0">Nenhum horário cadastrado.</p>'
    : scheduleHeaderHTML + sections

  return _wrap(`Grade Horária — ${teacher?.name ?? '—'}`, metaHTML, bodyHTML, 'GestãoEscolar — Grade Horária')
}

// ─── 9. Grade horária — escola (com filtros) ──────────────────────────────────

export function generateSchoolScheduleHTML(filter = {}, store) {
  const { teacherId, segmento, turma, useApelido = false } = filter

  const filtered = (store.schedules ?? []).filter(s =>
    (!teacherId || s.teacherId === teacherId) &&
    (!segmento  || s.timeSlot?.split('|')[0] === segmento) &&
    (!turma     || s.turma    === turma)
  )

  const teacherLabel  = teacherId ? store.teachers.find(t => t.id === teacherId)?.name : null
  const segmentoLabel = segmento  ? store.segments.find(s => s.id === segmento)?.name  : null

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Filtro Professor</span><span class="m-val">${teacherLabel ?? 'Todos'}</span></div>
    <div class="m-blk"><span class="m-lbl">Filtro Segmento</span><span class="m-val">${segmentoLabel ?? 'Todos'}</span></div>
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
            ${_scheduleGrid(seg, turnoSeg, filtered, store, !teacherId, useApelido)}
          </div>`
      }).join('')

  const title = [teacherLabel, turma ? `Turma ${turma}` : null].filter(Boolean).join(' · ') || 'Todos os horários'
  return _wrap(`Grade da Escola — ${title}`, metaHTML, bodyHTML, 'GestãoEscolar — Grade Horária')
}

// ─── 10. Substituições — Folha de Ponto ──────────────────────────────────────

export function generateSubstitutionTimesheetHTML(teacher, slots, store) {
  const sorted = [...slots].sort((a, b) =>
    (a.date ?? '').localeCompare(b.date ?? '') || (a.timeSlot ?? '').localeCompare(b.timeSlot ?? '')
  )

  const firstDate = sorted[0]?.date
  const lastDate  = sorted[sorted.length - 1]?.date
  const periodLabel = firstDate && lastDate
    ? (firstDate === lastDate ? formatBR(firstDate) : `${formatBR(firstDate)} – ${formatBR(lastDate)}`)
    : '—'

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Substituto</span><span class="m-val">${teacher?.name ?? '—'}</span></div>
    <div class="m-blk"><span class="m-lbl">Período</span><span class="m-val">${periodLabel}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Total</span>
      <span class="m-val">${sorted.length} aula${sorted.length !== 1 ? 's' : ''}</span>
    </div>`

  const rows = sorted.map(sl => {
    const faltante = store.teachers.find(t => t.id === sl.teacherId)
    return `<tr>
      <td>${formatBR(sl.date)}</td>
      <td>${slotFullLabel(sl.timeSlot, store.periodConfigs)}</td>
      <td>${sl.turma ?? '—'}</td>
      <td>${faltante?.name ?? '—'}</td>
    </tr>`
  }).join('')

  const bodyHTML = sorted.length ? `
    <table>
      <thead><tr><th>Data</th><th>Horário</th><th>Turma</th><th>Professor Faltante</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : ''

  return _wrap(
    `Folha de Ponto — ${teacher?.name ?? '—'} — ${periodLabel}`,
    metaHTML, bodyHTML,
    'GestãoEscolar — Folha de Ponto'
  )
}

// ─── 11. Substituições — Extrato de Saldo ────────────────────────────────────

export function generateSubstitutionBalanceHTML(teacher, coveredSlots, absenceSlots, store) {
  const faltas     = absenceSlots.length
  const realizadas = coveredSlots.length
  const saldo      = realizadas - faltas
  const saldoClass = saldo >= 0 ? 'ok' : 'err'

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Professor</span><span class="m-val">${teacher?.name ?? '—'}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Faltas</span><span class="m-val err">${faltas}</span>
    </div>
    <div class="m-blk" style="text-align:right">
      <span class="m-lbl">Substituições</span><span class="m-val ok">${realizadas}</span>
    </div>
    <div class="m-blk" style="text-align:right">
      <span class="m-lbl">Saldo</span>
      <span class="m-val ${saldoClass}">${saldo >= 0 ? '+' : ''}${saldo}</span>
    </div>`

  const renderRow = (sl) => {
    const subj = store.subjects.find(s => s.id === sl.subjectId)
    return `<tr>
      <td>${formatBR(sl.date)}</td>
      <td>${slotFullLabel(sl.timeSlot, store.periodConfigs)}</td>
      <td>${sl.turma ?? '—'}</td>
      <td>${subj?.name ?? '—'}</td>
    </tr>`
  }

  const sortByDate = (a, b) =>
    (a.date ?? '').localeCompare(b.date ?? '') || (a.timeSlot ?? '').localeCompare(b.timeSlot ?? '')

  const sortedAbs = [...absenceSlots].sort(sortByDate)
  const sortedCov = [...coveredSlots].sort(sortByDate)

  const absencesSection = `
    <div class="section">
      <div class="sec-hdr">Faltas Cometidas (${faltas})</div>
      ${sortedAbs.length ? `
        <table>
          <thead><tr><th>Data</th><th>Horário</th><th>Turma</th><th>Disciplina</th></tr></thead>
          <tbody>${sortedAbs.map(renderRow).join('')}</tbody>
        </table>` : '<p style="color:#a09d97;padding:8px 0">Nenhuma falta no período.</p>'}
    </div>`

  const coveredSection = `
    <div class="section">
      <div class="sec-hdr">Substituições Realizadas (${realizadas})</div>
      ${sortedCov.length ? `
        <table>
          <thead><tr><th>Data</th><th>Horário</th><th>Turma</th><th>Disciplina</th></tr></thead>
          <tbody>${sortedCov.map(renderRow).join('')}</tbody>
        </table>` : '<p style="color:#a09d97;padding:8px 0">Nenhuma substituição no período.</p>'}
    </div>`

  const totalsFooter = `
    <div class="section" style="margin-top:18px;padding:12px;background:#f4f2ee;border-radius:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">
        <span><strong>Substituições:</strong> ${realizadas}</span>
        <span><strong>Faltas:</strong> ${faltas}</span>
        <span class="${saldoClass}" style="font-size:14px"><strong>Saldo:</strong> ${saldo >= 0 ? '+' : ''}${saldo}</span>
      </div>
    </div>`

  const bodyHTML = absencesSection + coveredSection + totalsFooter

  return _wrap(
    `Extrato de Saldo — ${teacher?.name ?? '—'}`,
    metaHTML, bodyHTML,
    'GestãoEscolar — Extrato de Saldo'
  )
}

// ─── 12. Substituições — Ranking de Carga Real ───────────────────────────────

export function generateSubstitutionRankingHTML(rankingData, month, year) {
  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Mês</span><span class="m-val">${MONTH_NAMES[month]} ${year}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Professores</span>
      <span class="m-val">${rankingData.length}</span>
    </div>`

  const colorFor = pct => pct > 90 ? '#16a34a' : pct >= 70 ? '#ca8a04' : '#dc2626'

  const rows = rankingData.map((row, idx) => {
    const pct = row.scheduled > 0 ? ((row.scheduled - row.absences) / row.scheduled * 100) : null
    const pctStr = pct !== null ? `${pct.toFixed(1)}%` : '—'
    const pctColor = pct !== null ? colorFor(pct) : '#a09d97'
    return `
    <tr>
      <td style="text-align:center;width:40px"><strong>${idx + 1}</strong></td>
      <td>${row.teacher?.name ?? '—'}</td>
      <td style="text-align:center">${row.scheduled}</td>
      <td style="text-align:center">${row.absences}</td>
      <td style="text-align:center;font-weight:700;color:${pctColor}">${pctStr}</td>
    </tr>`
  }).join('')

  const bodyHTML = rankingData.length ? `
    <table>
      <thead><tr>
        <th style="width:40px;text-align:center">#</th>
        <th>Professor</th>
        <th style="text-align:center">Aulas Próprias</th>
        <th style="text-align:center">Ausências</th>
        <th style="text-align:center">% Assiduidade</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<p style="color:#a09d97;padding:20px 0">Nenhum professor no ranking.</p>'

  return _wrap(
    `Ranking de Assiduidade — ${MONTH_NAMES[month]} ${year}`,
    metaHTML, bodyHTML,
    'GestãoEscolar — Ranking de Assiduidade'
  )
}

// ─── 13. Ranking de Assiduidade Completo (com Subs, Saldo e %) ───────────────

export function generateAssiduityRankingHTML(rankingData, month, year) {
  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Mês</span><span class="m-val">${MONTH_NAMES[month]} ${year}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Professores</span>
      <span class="m-val">${rankingData.length}</span>
    </div>`

  const colorFor = pct => pct >= 90 ? '#16a34a' : pct >= 75 ? '#ca8a04' : '#dc2626'

  const rows = rankingData.map((row, idx) => {
    const pct      = row.pctAssiduidade
    const pctStr   = pct !== null ? `${pct}%` : '—'
    const pctColor = pct !== null ? colorFor(pct) : '#a09d97'
    const saldoColor = row.saldo < 0 ? '#dc2626' : '#1a1814'
    return `
    <tr>
      <td style="text-align:center;width:36px;font-weight:700;color:#a09d97">${idx + 1}º</td>
      <td style="font-weight:600">${row.teacher?.name ?? '—'}</td>
      <td style="text-align:center">${row.scheduled}</td>
      <td style="text-align:center;color:#c8290a;font-weight:700">${row.absences || '—'}</td>
      <td style="text-align:center;color:#16a34a;font-weight:700">${row.subsRealizadas || '—'}</td>
      <td style="text-align:center;font-weight:700;color:${saldoColor}">${row.saldo}</td>
      <td style="text-align:center;font-weight:700;color:${pctColor}">${pctStr}</td>
    </tr>`
  }).join('')

  const bodyHTML = rankingData.length ? `
    <table>
      <thead><tr>
        <th style="width:36px;text-align:center">#</th>
        <th>Professor</th>
        <th style="text-align:center">Aulas Próprias</th>
        <th style="text-align:center">Ausências</th>
        <th style="text-align:center">Subs Realizadas</th>
        <th style="text-align:center">Saldo</th>
        <th style="text-align:center">% Assiduidade</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<p style="color:#a09d97;padding:20px 0">Nenhum professor no ranking.</p>'

  return _wrap(
    `Ranking de Assiduidade — ${MONTH_NAMES[month]} ${year}`,
    metaHTML, bodyHTML,
    'GestãoEscolar — Ranking de Assiduidade'
  )
}

// ─── 14. Comprovante de Substituição ─────────────────────────────────────────

export function generateSlotCertificateHTML(slot, absentTeacher, substituteTeacher, store) {
  // slot: { date, timeSlot, turma, subjectId }
  const dayLabel = dateToDayLabel(slot.date)
  const period   = slotFullLabel(slot.timeSlot, store.periodConfigs)
  const subj     = store.subjects.find(s => s.id === slot.subjectId)
  const now      = new Date().toLocaleString('pt-BR')

  const metaHTML = `
    <div class="m-blk"><span class="m-lbl">Professor Ausente</span><span class="m-val">${absentTeacher?.name ?? '—'}</span></div>
    <div class="m-blk"><span class="m-lbl">Data</span><span class="m-val">${formatBR(slot.date)}</span></div>
    <div class="m-blk"><span class="m-lbl">Dia</span><span class="m-val">${dayLabel ?? '—'}</span></div>
    <div class="m-blk" style="margin-left:auto;text-align:right">
      <span class="m-lbl">Status</span>
      <span class="m-val ok">✓ Atribuído</span>
    </div>`

  const bodyHTML = `
    <div class="section">
      <div class="sec-hdr">Detalhes da Substituição</div>
      <table>
        <thead><tr><th>Horário</th><th>Turma</th><th>Disciplina</th><th>Substituto</th></tr></thead>
        <tbody>
          <tr>
            <td>${period}</td>
            <td>${slot.turma ?? '—'}</td>
            <td>${subj?.name ?? '—'}</td>
            <td class="ok">${substituteTeacher?.name ?? '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="margin-top:16px;padding:10px 12px;background:#f0fdf4;border-radius:6px;border-left:3px solid #16a34a;font-size:11px;color:#14532d">
      Comprovante gerado em ${now} — GestãoEscolar
    </div>`

  return _wrap(
    `Comprovante — ${dayLabel ?? ''}, ${formatBR(slot.date)}`,
    metaHTML, bodyHTML,
    'GestãoEscolar — Comprovante de Substituição'
  )
}
