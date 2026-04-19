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

