import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";

/**
 * Verifica que o chamador é coordenador, teacher-coordinator ou admin.
 *
 * Nota importante: teachers/ usa Document IDs gerados por uid() interno,
 * NÃO o Firebase Auth UID. Por isso a verificação precisa fazer query
 * where('email', '==', email) em vez de doc('teachers/{auth.uid}').
 */
export async function verifyCoordinatorOrAdmin(
  context: functions.https.CallableContext
): Promise<void> {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const email = (context.auth.token.email ?? "").toLowerCase();

  // Verificar se é admin (documento em /admins/{email})
  const adminSnap = await admin.firestore().collection("admins").doc(email).get();
  if (adminSnap.exists) return;

  // Verificar profile via query por campo email (Document ID != Firebase UID)
  const teacherSnap = await admin
    .firestore()
    .collection("teachers")
    .where("email", "==", email)
    .limit(1)
    .get();

  if (teacherSnap.empty) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Professor não encontrado"
    );
  }

  const profile = teacherSnap.docs[0].data().profile;
  if (profile !== "coordinator" && profile !== "teacher-coordinator") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Role insuficiente"
    );
  }
}

/**
 * Verifica que o chamador é admin.
 */
export async function verifyAdmin(
  context: functions.https.CallableContext
): Promise<void> {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  const email = (context.auth.token.email ?? "").toLowerCase();
  const adminSnap = await admin.firestore().collection("admins").doc(email).get();

  if (!adminSnap.exists) {
    throw new functions.https.HttpsError("permission-denied", "Admin required");
  }
}
