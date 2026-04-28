/**
 * Cleanup ad-hoc: remove TODOS os vínculos de um email em todas as escolas.
 *
 * Uso:
 *   node scripts/cleanup-removed-user.js paodociso@gmail.com
 *
 * O que faz:
 *  - Encontra users/{uid} where email == EMAIL
 *  - Apaga TODAS as entradas em users/{uid}.schools (mantém doc para histórico)
 *  - Para cada schools/{schoolId}:
 *    - Apaga teachers/{x} where email == EMAIL
 *    - Apaga schedules/{x} where teacherId == teacher.id
 *    - Apaga pending_teachers/{uid}
 *    - Cria removed_users/{uid} com marcador
 *
 * Bypassa rules via Admin SDK.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

if (!getApps().length) {
  const keyPath = resolve(__dirname, '..', 'serviceAccountKey.json')
  if (!existsSync(keyPath)) {
    console.error('serviceAccountKey.json não encontrado em', keyPath)
    process.exit(1)
  }
  initializeApp({
    credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))),
  })
}

const db = getFirestore()

const targetEmail = (process.argv[2] || '').trim().toLowerCase()
if (!targetEmail) {
  console.error('Uso: node scripts/cleanup-removed-user.js <email>')
  process.exit(1)
}

console.log(`Cleaning up email: ${targetEmail}`)

async function main() {
  // 1. Encontrar uid via users/
  const usersSnap = await db.collection('users').where('email', '==', targetEmail).get()
  const uids = usersSnap.docs.map(d => d.id)
  console.log(`UIDs encontrados em users/: ${uids.length} → ${uids.join(', ') || '(nenhum)'}`)

  // 2. Listar todas as escolas
  const schoolsSnap = await db.collection('schools').get()
  console.log(`Total de escolas: ${schoolsSnap.size}`)

  let touched = 0

  for (const schoolDoc of schoolsSnap.docs) {
    const schoolId = schoolDoc.id
    let schoolTouched = false

    // 2a. Achar e deletar teachers com este email
    const teachersSnap = await db
      .collection(`schools/${schoolId}/teachers`)
      .where('email', '==', targetEmail)
      .get()

    const teacherIds = teachersSnap.docs.map(d => d.id)

    for (const teacherDoc of teachersSnap.docs) {
      const teacherId = teacherDoc.id
      console.log(`  [${schoolId}] teacher encontrado: ${teacherId}`)

      // Deletar schedules deste teacher
      const schedulesSnap = await db
        .collection(`schools/${schoolId}/schedules`)
        .where('teacherId', '==', teacherId)
        .get()
      const batch = db.batch()
      schedulesSnap.docs.forEach(d => batch.delete(d.ref))
      batch.delete(teacherDoc.ref)
      await batch.commit()
      console.log(`  [${schoolId}] deletado teacher ${teacherId} + ${schedulesSnap.size} schedules`)
      schoolTouched = true
    }

    // 2b. Deletar pending_teachers de cada uid
    for (const uid of uids) {
      const pendingRef = db.doc(`schools/${schoolId}/pending_teachers/${uid}`)
      const pendingSnap = await pendingRef.get()
      if (pendingSnap.exists) {
        await pendingRef.delete()
        console.log(`  [${schoolId}] deletado pending_teachers/${uid}`)
        schoolTouched = true
      }
    }

    // 2c. Marcar removed_users (para cada uid)
    for (const uid of uids) {
      await db.doc(`schools/${schoolId}/removed_users/${uid}`).set({
        uid,
        email: targetEmail,
        teacherIds,
        removedAt: FieldValue.serverTimestamp(),
        removedBy: 'cleanup-script',
        removedByEmail: 'cleanup-script',
      })
      console.log(`  [${schoolId}] criado removed_users/${uid}`)
      schoolTouched = true
    }

    // Marcação por email se não há uid resolvido
    if (uids.length === 0 && schoolTouched) {
      const emailKey = `email_${targetEmail.replace(/[^a-z0-9._-]/g, '_')}`
      await db.doc(`schools/${schoolId}/removed_users/${emailKey}`).set({
        email: targetEmail,
        teacherIds,
        removedAt: FieldValue.serverTimestamp(),
        removedBy: 'cleanup-script',
      })
      console.log(`  [${schoolId}] criado removed_users/${emailKey} (sem UID)`)
    }

    if (schoolTouched) touched++
  }

  // 3. Limpar entradas users/{uid}.schools
  for (const uid of uids) {
    const userRef = db.doc(`users/${uid}`)
    const snap = await userRef.get()
    if (snap.exists) {
      const data = snap.data() || {}
      const schoolKeys = Object.keys(data.schools || {})
      if (schoolKeys.length > 0) {
        const updates = {}
        for (const k of schoolKeys) {
          updates[`schools.${k}`] = FieldValue.delete()
        }
        await userRef.update(updates)
        console.log(`Limpou users/${uid}.schools (${schoolKeys.length} entries)`)
      }
    }
  }

  console.log(`\n✓ Cleanup concluído. Escolas afetadas: ${touched}/${schoolsSnap.size}`)
}

main().catch(err => {
  console.error('FATAL', err)
  process.exit(1)
})
