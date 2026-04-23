// Re-export seletivamente (não usar wildcard total)
export { uid, h } from './ids'
export { parseDate, formatISO, formatBR, dateToDayLabel, weekStart, businessDaysBetween, formatMonthlyAulas } from './dates'
export { colorOfAreaId, colorOfTeacher, COLOR_PALETTE, COLOR_NEUTRAL } from './colors'
export { allTurmaObjects, findTurma, isSharedSeries, isFormationSlot, isRestSlot, teacherSubjectNames } from './turmas'
export { canEditTeacher } from './permissions'
