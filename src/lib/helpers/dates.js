export const parseDate = (s) => {
  if (!s || typeof s !== 'string') return new Date(NaN)
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export const formatISO = (d) => {
  if (!d || isNaN(d.getTime())) return null
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const formatBR = (s) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function dateToDayLabel(s) {
  const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']
  const idx = parseDate(s).getDay()
  return idx >= 1 && idx <= 5 ? DAYS[idx - 1] : null
}

export function weekStart(s) {
  const d = parseDate(s)
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay()
  d.setDate(d.getDate() + diff)
  return formatISO(d)
}

export function businessDaysBetween(from, to) {
  const result = []
  const cur = parseDate(from)
  const end = parseDate(to)
  while (cur <= end) {
    const idx = cur.getDay()
    if (idx >= 1 && idx <= 5) result.push(formatISO(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

export const formatMonthlyAulas = (count) =>
  count === 1 ? '1 aula' : `${count} aulas`
