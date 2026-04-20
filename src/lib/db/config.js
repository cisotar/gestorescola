import { db } from '../firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'

/**
 * Seed padrão de turmas compartilhadas.
 *
 * @typedef {Object} SharedSeries
 * @property {string} id - Identificador único (ex: 'shared-formacao')
 * @property {string} name - Nome exibido (ex: 'FORMAÇÃO')
 * @property {'formation'|'elective'} type - Tipo de turma:
 *   - 'formation' — turmas de formação (ex: ATPCG, ATPCA) que NÃO demandam substituto
 *   - 'elective' — turmas eletivas que DEMANDAM substituto como aulas regulares
 *
 * @example
 * {
 *   id: 'shared-formacao',
 *   name: 'FORMAÇÃO',
 *   type: 'formation'  // não demanda substituto
 * }
 */
const DEFAULT_SHARED_SERIES = [
  {
    id: 'shared-formacao',
    name: 'FORMAÇÃO',
    type: 'formation',
  },
]

export async function _loadConfig() {
  const snap = await getDoc(doc(db, 'meta', 'config'))
  if (!snap.exists()) {
    try {
      await setDoc(doc(db, 'meta', 'config'), { sharedSeries: DEFAULT_SHARED_SERIES }, { merge: true })
    } catch (e) {
      console.warn('[db] Falha ao persistir seed de sharedSeries:', e)
    }
    return { sharedSeries: DEFAULT_SHARED_SERIES }
  }
  const data = snap.data()
  const keys = ['segments','periodConfigs','areas','subjects','sharedSeries','workloadWarn','workloadDanger']
  const result = {}
  keys.forEach(k => { if (data[k] !== undefined) result[k] = data[k] })
  if (!data.sharedSeries?.length) {
    result.sharedSeries = DEFAULT_SHARED_SERIES
    try {
      await setDoc(doc(db, 'meta', 'config'), { sharedSeries: DEFAULT_SHARED_SERIES }, { merge: true })
    } catch (e) {
      console.warn('[db] Falha ao persistir seed de sharedSeries:', e)
    }
  }
  return result
}

export async function saveConfig(state) {
  try {
    const { setDoc } = await import('firebase/firestore')
    const { serverTimestamp } = await import('firebase/firestore')
    await setDoc(doc(db, 'meta', 'config'), {
      segments: state.segments, periodConfigs: state.periodConfigs,
      areas: state.areas, subjects: state.subjects, sharedSeries: state.sharedSeries ?? [],
      workloadWarn: state.workloadWarn, workloadDanger: state.workloadDanger,
      updatedAt: serverTimestamp(),
    })
  } catch (e) { console.error(e) }
}
