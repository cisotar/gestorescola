export function allTurmaObjects(segments) {
  return segments.flatMap(seg =>
    seg.grades.flatMap(grade =>
      (grade.classes ?? []).map(cls => ({
        label:       `${grade.name} ${cls.letter}`,
        segmentId:   seg.id,
        segmentName: seg.name,
        gradeName:   grade.name,
        letter:      cls.letter,
        turno:       cls.turno ?? 'manha',
      }))
    )
  )
}

export function findTurma(label, segments) {
  return allTurmaObjects(segments).find(t => t.label === label) ?? null
}

/**
 * Detecta se um nome de turma refere-se a uma turma compartilhada.
 *
 * Compara o nome da turma exatamente contra a lista de turmas compartilhadas,
 * retornando verdadeiro apenas se houver match exato no campo `name`.
 *
 * @param {string} turmaName - Nome da turma a verificar (ex: "FORMAÇÃO", "6º Ano A")
 * @param {Array<{id: string, name: string, type: string}>} sharedSeries - Lista de turmas compartilhadas do banco
 * @returns {boolean} true se turmaName existe em sharedSeries[].name, false caso contrário
 *
 * @example
 * // Detecta turma compartilhada pelo nome exato
 * isSharedSeries('FORMAÇÃO', [{id: '1', name: 'FORMAÇÃO', type: 'formation'}]) // → true
 *
 * @example
 * // Case-sensitive: não detecta caso mude maiúscula/minúscula
 * isSharedSeries('formação', [{id: '1', name: 'FORMAÇÃO', type: 'formation'}]) // → false
 *
 * @example
 * // Retorna false para turmas regulares ou array vazio
 * isSharedSeries('6º Ano A', [{id: '1', name: 'FORMAÇÃO', type: 'formation'}]) // → false
 * isSharedSeries('FORMAÇÃO', []) // → false
 */
export function isSharedSeries(turmaName, sharedSeries = []) {
  return sharedSeries.some(ss => ss.name === turmaName)
}

/**
 * Detecta se um slot é de aula de formação (type === "formation").
 *
 * Verifica se a turma é uma turma compartilhada de tipo "formation".
 * O subjectId agora aponta para subjects[].id normalmente (matéria da grade),
 * portanto não é mais usado para detectar o tipo de formação.
 *
 * @param {string|null} turma - Nome da turma (ex: "FORMAÇÃO", "6º Ano A", null)
 * @param {string|null} _subjectId - Ignorado (mantido por compatibilidade de assinatura)
 * @param {Array<{id: string, name: string, type: 'formation'|'elective'}>} [sharedSeries=[]]
 * @returns {boolean} true se slot pertence a turma de formação, false caso contrário
 *
 * @example
 * isFormationSlot("FORMAÇÃO", null, [{id: '1', name: 'FORMAÇÃO', type: 'formation'}]) // → true
 * isFormationSlot("Eletiva 2024", null, [{id: '2', name: 'Eletiva 2024', type: 'elective'}]) // → false
 * isFormationSlot("6º Ano A", "subj-bio", [{id: '1', name: 'FORMAÇÃO', type: 'formation'}]) // → false
 */
export function isFormationSlot(turma, _subjectId, sharedSeries = []) {
  if (!turma) return false
  const sharedTurma = sharedSeries.find(ss => ss.name === turma)
  return !!(sharedTurma && sharedTurma.type === 'formation')
}

export function teacherSubjectNames(teacher, subjects) {
  return (teacher?.subjectIds ?? [])
    .map(sid => subjects.find(s => s.id === sid)?.name)
    .filter(Boolean)
    .join(', ')
}
