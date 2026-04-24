// Re-export seletivamente
export { monthlyLoad, isBusy, isAvailableBySchedule, weeklyLimitStatus, isUnderWeeklyLimit, substitutesAtSlot } from './validation'
export { rankCandidates, suggestSubstitutes } from './ranking'
export { createAbsence, assignSubstitute, deleteAbsenceSlot, deleteAbsence, absencesOf, absenceSlotsInWeek } from './mutations'

// Backward compatibility — helpers de dates (como era antes)
export { dateToDayLabel, formatISO, formatBR, parseDate, weekStart, businessDaysBetween } from '../helpers/dates'
