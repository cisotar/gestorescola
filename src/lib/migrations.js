/**
 * Migrações de dados e schema
 *
 * Esta é a única migração permanente de sharedSeries necessária.
 * TODO: Remover migrateSharedSeriesToNewFormat após 2026-06-01,
 * quando todos os usuários tiverem migrado para o novo schema de sharedSeries.
 * A partir dessa data, todos os documentos estarão no novo formato
 * (id, name, type) sem activities[], tipo ou order.
 */

/**
 * Migra sharedSeries do formato antigo (com activities[], tipo, order)
 * para o novo formato (apenas id, name, type).
 *
 * Detecção automática (idempotente): se sharedSeries[0].activities estiver
 * ausente, dados já estão migrados ou nunca tiveram o formato antigo.
 * Neste caso, retorna config inalterado com wasMigrated: false.
 *
 * Se atividades estiverem presentes, executa migração única e persiste em Firestore.
 *
 * @param {object} config - Objeto de configuração contendo sharedSeries
 * @returns {object} { config: migratedConfig, wasMigrated: boolean }
 */
export function migrateSharedSeriesToNewFormat(config) {
  // Validações defensivas
  if (!config || typeof config !== 'object') {
    return { config, wasMigrated: false }
  }

  const { sharedSeries } = config

  // Se não há sharedSeries, nada a migrar
  if (!Array.isArray(sharedSeries) || sharedSeries.length === 0) {
    return { config, wasMigrated: false }
  }

  // Detecta dados antigos: verifica se o primeiro item tem activities[]
  // Se activities[] ausente, dados já estão migrados ou nunca tiveram o formato antigo (idempotente)
  if (!sharedSeries[0]?.activities) {
    // Dados já estão migrados ou nunca tiveram atividades
    return { config, wasMigrated: false }
  }

  // ─── Executa migração ───────────────────────────────────────────────────
  const migratedSharedSeries = sharedSeries.map(item => {
    const { id, name, activities, tipo, order, type, ...rest } = item

    // Preserva id e name, descarta activities/tipo/order
    const migrated = { id, name, ...rest }

    // Adiciona type baseado no name
    if (name === 'FORMAÇÃO') {
      migrated.type = 'formation'
    } else {
      migrated.type = 'elective'
    }

    return migrated
  })

  console.log(`[migrations] Migrou ${migratedSharedSeries.length} sharedSeries para novo formato`)

  return {
    config: { ...config, sharedSeries: migratedSharedSeries },
    wasMigrated: true
  }
}

/**
 * Migra schedules de turmas compartilhadas, setando subjectId = null.
 *
 * Após migração de sharedSeries (issue 224), schedules que referem turmas
 * compartilhadas (ex: "FORMAÇÃO") precisam ter subjectId = null.
 *
 * A função é idempotente: verifica se subjectId !== null antes de migrar.
 *
 * @param {array} schedules - Array de schedules
 * @param {array} sharedSeries - Array de sharedSeries migrados (com .name)
 * @returns {object} { schedules: updatedSchedules, migratedCount: number, skippedCount: number }
 */
export function migrateSchedulesForSharedSeries(schedules, sharedSeries) {
  // Validações defensivas
  if (!Array.isArray(schedules) || !Array.isArray(sharedSeries)) {
    return { schedules, migratedCount: 0, skippedCount: 0 }
  }

  // Se não há sharedSeries, nada a migrar
  if (sharedSeries.length === 0) {
    return { schedules, migratedCount: 0, skippedCount: 0 }
  }

  // Cria Set de nomes de sharedSeries para O(1) lookup
  const sharedNames = new Set(sharedSeries.map(s => s.name))

  let migratedCount = 0
  let skippedCount = 0

  // Itera schedules e migra conforme necessário
  const updatedSchedules = schedules.map(schedule => {
    // Se turma não é compartilhada, deixa intacto
    if (!sharedNames.has(schedule.turma)) {
      return schedule
    }

    // Turma é compartilhada: verifica se precisa migrar
    if (schedule.subjectId !== null) {
      // Migra: seta subjectId = null
      migratedCount++
      return { ...schedule, subjectId: null }
    } else {
      // Já foi migrado: incrementa skipped
      skippedCount++
      return schedule
    }
  })

  return { schedules: updatedSchedules, migratedCount, skippedCount }
}
