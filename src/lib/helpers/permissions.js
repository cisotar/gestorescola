/**
 * Valida se um usuário pode editar a grade de um professor específico.
 *
 * Implementa regras RBAC (Role-Based Access Control):
 * - Admin, coordenador puro, ou teacher-coordenador podem editar qualquer professor
 * - Professor (role === 'teacher') pode editar apenas se for a si mesmo (usuarioLogado.id === professorAlvo.id)
 * - Outros roles (pending, null) retornam false
 *
 * @param {Object|null} usuarioLogado - Documento teacher do usuário logado (ou null para admins puros)
 *   Estrutura: { id, name, profile, email, subjectIds?, ... }
 * @param {Object|null} professorAlvo - Documento teacher alvo da edição
 *   Estrutura: { id, name, profile, ... }
 * @param {Object} authStore - `useAuthStore.getState()` com campos { role, teacher, user, ... }
 *   role: 'admin' | 'coordinator' | 'teacher-coordinator' | 'teacher' | 'pending' | null
 * @returns {boolean} true se usuário pode editar, false caso contrário
 *
 * @example
 * // Admin editando qualquer professor — sempre true
 * const store = useAuthStore.getState()  // role: 'admin', teacher: null
 * canEditTeacher(null, professorX, store)  // → true
 *
 * @example
 * // Professor editando sua própria grade — true
 * const store = useAuthStore.getState()  // role: 'teacher', teacher: {id: 'abc123', ...}
 * canEditTeacher({id: 'abc123'}, {id: 'abc123'}, store)  // → true
 *
 * @example
 * // Professor editando grade de outro — false
 * const store = useAuthStore.getState()  // role: 'teacher', teacher: {id: 'abc123', ...}
 * canEditTeacher({id: 'abc123'}, {id: 'def456'}, store)  // → false
 *
 * @example
 * // Coordenador editando qualquer professor — true
 * const store = useAuthStore.getState()  // role: 'coordinator', teacher: {id: 'coo789', ...}
 * canEditTeacher({id: 'coo789'}, {id: 'xyz999'}, store)  // → true
 */
export function canEditTeacher(usuarioLogado, professorAlvo, authStore) {
  // Guard: dados faltando
  if (!authStore?.role || !professorAlvo) {
    return false
  }

  const { role } = authStore

  // Admin pode editar qualquer um
  if (role === 'admin') {
    return true
  }

  // Coordenador (puro ou teacher-coord) pode editar qualquer um
  if (role === 'coordinator' || role === 'teacher-coordinator') {
    return true
  }

  // Professor (role === 'teacher') pode editar só a si mesmo
  if (role === 'teacher') {
    // Guard: usuário logado sem id (anomalia)
    if (!usuarioLogado?.id) {
      return false
    }
    // Comparação estrita
    return usuarioLogado.id === professorAlvo.id
  }

  // Outros roles (pending, null, desconhecido) → false
  return false
}
