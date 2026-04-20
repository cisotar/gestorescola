import { COLOR_PALETTE, COLOR_NEUTRAL } from '../constants'

export { COLOR_PALETTE, COLOR_NEUTRAL } from '../constants'

export function colorOfAreaId(areaId, store) {
  const area = store.areas.find(a => a.id === areaId)
  return area ? COLOR_PALETTE[area.colorIdx % COLOR_PALETTE.length] : COLOR_NEUTRAL
}

export function colorOfTeacher(teacher, store) {
  if (!teacher?.subjectIds?.length) return COLOR_NEUTRAL
  const subject = store.subjects.find(s => teacher.subjectIds.includes(s.id))
  return subject ? colorOfAreaId(subject.areaId, store) : COLOR_NEUTRAL
}
