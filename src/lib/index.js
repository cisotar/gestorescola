// ─── Re-exports seletivos (NÃO usar wildcard completo) ──────────────────────

// Firebase
export { app, db, auth, provider } from './firebase'
export { getSchoolCollectionRef, getSchoolDocRef, getSchoolConfigRef, getSchoolRef } from './firebase/multi-tenant'

// DB (carregamento e persistência)
export { loadFromFirestore, saveToFirestore, saveDoc, deleteDocById, updateDocById, saveConfig, createSchoolFromAdmin, setSchoolStatus, softDeleteSchool } from './db'
export { setupRealtimeListeners, registerAbsencesListener, registerHistoryListener, teardownListeners } from './db'
export { isAdmin, addAdmin, listAdmins, removeAdmin } from './db'
export { getTeacherByEmail, requestTeacherAccess, AccessRevokedError, updatePendingData, listPendingTeachers, patchTeacherSelf, approveTeacher, rejectTeacher } from './db'
export { migrateFormationSchedules, migrateSharedSeriesActivities } from './db'
export { submitPendingAction, getPendingActions, getMyPendingActions, approvePendingAction, rejectPendingAction, subscribePendingActionsCount } from './db'

// Periods (cálculo de períodos e slots)
export { toMin, fromMin, gerarPeriodos, defaultCfg, calcSaldo, validarEncaixe, getCfg, getPeriodos, getAulas, parseSlot, makeSlot, makeEspecialSlot, gerarPeriodosEspeciais, mergeAndSortPeriodos, resolveSlot, slotLabel, slotFullLabel, slotsForTurma } from './periods'

// Helpers (funções utilitárias granulares)
export { uid, h } from './helpers/ids'
export { parseDate, formatISO, formatBR, dateToDayLabel, weekStart, businessDaysBetween, formatMonthlyAulas } from './helpers/dates'
export { colorOfAreaId, colorOfTeacher, COLOR_PALETTE, COLOR_NEUTRAL } from './helpers/colors'
export { allTurmaObjects, findTurma, isSharedSeries, isFormationSlot, isRestSlot, teacherSubjectNames } from './helpers/turmas'
export { canEditTeacher } from './helpers/permissions'

// Absences (validação e ranking de substitutos)
export { monthlyLoad, isBusy, isAvailableBySchedule, weeklyLimitStatus, isUnderWeeklyLimit } from './absences'
export { rankCandidates, suggestSubstitutes } from './absences'
export { createAbsence, assignSubstitute, deleteAbsenceSlot, deleteAbsence, absencesOf, absenceSlotsInWeek } from './absences'

// Reports (geração de relatórios PDF)
export { generateDayHTML, generateTeacherHTML, generateByDayHTML, generateByWeekHTML, generateByMonthHTML, openPDF } from './reports'

// Settings (helpers de configuração)
export { PROFILE_OPTIONS, PROFILE_OPTIONS_NO_ADMIN, PROFILE_LABELS, teacherSegmentIds, teacherBelongsToSegment, isSharedSchedule, calcSubjectChange, calcAreaSubjectRemovalImpact, buildPreviewItems, timeAgo, myTimeAgo, STATUS_BADGE } from './settings'

// Boot (lógica pura de inicialização)
export { bootSequence } from './boot'

// Constants
export { DAYS, COLOR_PALETTE, COLOR_NEUTRAL } from './constants'
