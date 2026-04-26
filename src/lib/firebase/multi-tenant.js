import { collection, doc } from 'firebase/firestore'
import { db } from './index'

/**
 * Retorna uma CollectionReference para uma subcoleção de uma escola.
 * Equivale a: collection(db, 'schools', schoolId, subcollection)
 *
 * @param {string} schoolId      - ID da escola (ex: 'sch-default')
 * @param {string} subcollection - Nome da subcoleção (ex: 'teachers')
 */
export function getSchoolCollectionRef(schoolId, subcollection) {
  return collection(db, 'schools', schoolId, subcollection)
}

/**
 * Retorna uma DocumentReference para um documento em uma subcoleção de escola.
 * Equivale a: doc(db, 'schools', schoolId, subcollection, docId)
 *
 * @param {string} schoolId      - ID da escola
 * @param {string} subcollection - Nome da subcoleção
 * @param {string} docId         - ID do documento
 */
export function getSchoolDocRef(schoolId, subcollection, docId) {
  return doc(db, 'schools', schoolId, subcollection, docId)
}

/**
 * Retorna uma DocumentReference para o documento de configuração da escola.
 * Equivale a: doc(db, 'schools', schoolId, 'config', 'main')
 *
 * @param {string} schoolId - ID da escola
 */
export function getSchoolConfigRef(schoolId) {
  return doc(db, 'schools', schoolId, 'config', 'main')
}

/**
 * Retorna uma DocumentReference para o documento raiz da escola.
 * Equivale a: doc(db, 'schools', schoolId)
 *
 * @param {string} schoolId - ID da escola
 */
export function getSchoolRef(schoolId) {
  return doc(db, 'schools', schoolId)
}
