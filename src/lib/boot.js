/**
 * bootSequence — função pura de decisão de boot
 *
 * Determina role, schoolId e quais listeners iniciar a partir dos dados
 * já lidos pelos stores. Não acessa localStorage, Firebase, Zustand ou React.
 * Todos os inputs chegam via parâmetro; todos os outputs são declarativos.
 *
 * @param {object|null}  user              FirebaseUser | null
 * @param {object|null}  userSnap          DocumentSnapshot | null
 *                                         interface: { exists(): bool, data(): { schools: { [schoolId]: { role: string } } } }
 * @param {Array}        availableSchools   [{ schoolId: string, ...schoolDoc.data() }]
 * @param {string|null}  savedSchoolId      valor já lido do localStorage pelo store
 * @param {boolean}      isSuperUser        true se email em SUPER_USERS ou na coleção admins/
 * @returns {{ role: string|null, schoolId: string|null, clearLocalStorage: boolean, startPendingListener: boolean, startApprovalListener: boolean, fullyRevoked: boolean }}
 */
export function bootSequence(user, userSnap, availableSchools, savedSchoolId, isSuperUser) {
  const BASE = {
    role:                 null,
    schoolId:             null,
    clearLocalStorage:    false,
    startPendingListener: false,
    startApprovalListener: false,
    fullyRevoked:         false,
  }

  // ── Usuário não autenticado ──────────────────────────────────────────────────
  if (user === null || user === undefined) {
    return { ...BASE }
  }

  // ── SaaS admin / admin global ────────────────────────────────────────────────
  if (isSuperUser === true) {
    if (availableSchools.length === 0) {
      return {
        ...BASE,
        role:              'admin',
        schoolId:          null,
        clearLocalStorage: savedSchoolId != null,
      }
    }

    // availableSchools tem pelo menos uma entrada
    const savedIsValid = savedSchoolId != null && availableSchools.some(s => s.schoolId === savedSchoolId)
    const resolvedId = savedIsValid ? savedSchoolId : availableSchools[0].schoolId

    return {
      ...BASE,
      role:                 'admin',
      schoolId:             resolvedId,
      clearLocalStorage:    false,
      startPendingListener: resolvedId != null,
    }
  }

  // ── Guard: revogação total (heurística) ─────────────────────────────────────
  // Fecha o caso do usuário removido antes do deploy do índice invertido:
  // users/{uid} existe mas schools={} e nenhuma escola disponível listou ele.
  // Sem este guard, cairíamos em Etapa 2 e retornaríamos role 'pending', dando
  // acesso indevido à PendingPage.
  const userExists = userSnap?.exists?.() === true
  const schoolsMapEmpty =
    userExists &&
    Object.keys(userSnap.data()?.schools ?? {}).length === 0
  if (
    userExists &&
    schoolsMapEmpty &&
    availableSchools.length === 0 &&
    savedSchoolId == null
  ) {
    return {
      ...BASE,
      role:              null,
      schoolId:          null,
      clearLocalStorage: true,
      fullyRevoked:      true,
    }
  }

  // ── Usuário comum (isSuperUser = false) ────────────────────────────────────
  // Etapa 1: determinar candidateSchoolId e clearLocalStorage
  let candidateSchoolId
  let clearLocalStorage

  if (savedSchoolId != null) {
    const savedInAvailable = availableSchools.some(s => s.schoolId === savedSchoolId)
    if (savedInAvailable) {
      candidateSchoolId = savedSchoolId
      clearLocalStorage = false
    } else if (availableSchools.length > 0) {
      // savedId stale: redirecionar para primeira escola disponível
      candidateSchoolId = availableSchools[0].schoolId
      clearLocalStorage = true
    } else {
      // Usuário pendente: sem membership, mas savedSchoolId presente (RN-2)
      candidateSchoolId = savedSchoolId
      clearLocalStorage = false
    }
  } else if (availableSchools.length === 1) {
    // RN-6: auto-seleção
    candidateSchoolId = availableSchools[0].schoolId
    clearLocalStorage = false
  } else {
    // Sem savedId e múltiplas ou nenhuma escola
    candidateSchoolId = null
    clearLocalStorage = false
  }

  // Etapa 2: se sem escola, usuario é pending sem contexto
  if (candidateSchoolId === null) {
    return {
      ...BASE,
      role:                 'pending',
      schoolId:             null,
      clearLocalStorage,
      startApprovalListener: true,
    }
  }

  // Etapa 3: determinar role a partir de users/{uid}.schools[candidateSchoolId]
  const schoolEntry = userSnap?.exists?.()
    ? (userSnap.data()?.schools?.[candidateSchoolId] ?? null)
    : null

  const localRole = typeof schoolEntry === 'object' && schoolEntry !== null
    ? (schoolEntry?.role ?? null)
    : null

  // RN-7: rejected → sem role, sem listeners
  if (localRole === 'rejected') {
    return {
      ...BASE,
      role:             null,
      schoolId:         null,
      clearLocalStorage,
    }
  }

  // Role válido (aprovado e não-pending)
  if (localRole && localRole !== 'pending') {
    const normalized = normalizeRole(localRole)

    if (normalized === 'admin') {
      return {
        ...BASE,
        role:                 'admin',
        schoolId:             candidateSchoolId,
        clearLocalStorage,
        startPendingListener: true,
      }
    }

    return {
      ...BASE,
      role:             normalized,
      schoolId:         candidateSchoolId,
      clearLocalStorage,
    }
  }

  // Sem role válido → pending (novo usuário ou localRole === 'pending')
  return {
    ...BASE,
    role:                 'pending',
    schoolId:             candidateSchoolId,
    clearLocalStorage,
    startApprovalListener: true,
  }
}

/**
 * Normaliza o role bruto lido do Firestore para os valores canônicos do sistema.
 * @param {string} raw
 * @returns {'coordinator'|'teacher-coordinator'|'admin'|'teacher'}
 */
function normalizeRole(raw) {
  if (raw === 'coordinator')         return 'coordinator'
  if (raw === 'teacher-coordinator') return 'teacher-coordinator'
  if (raw === 'admin')               return 'admin'
  return 'teacher'
}
