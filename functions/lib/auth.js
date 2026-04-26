"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyCoordinatorOrAdmin = verifyCoordinatorOrAdmin;
exports.verifyAdmin = verifyAdmin;
const admin = require("firebase-admin");
const functions = require("firebase-functions/v1");
/**
 * Verifica que o chamador é coordenador, teacher-coordinator ou admin.
 *
 * Nota importante: teachers/ usa Document IDs gerados por uid() interno,
 * NÃO o Firebase Auth UID. Por isso a verificação precisa fazer query
 * where('email', '==', email) em vez de doc('teachers/{auth.uid}').
 */
async function verifyCoordinatorOrAdmin(context) {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const email = ((_a = context.auth.token.email) !== null && _a !== void 0 ? _a : "").toLowerCase();
    // Verificar se é admin (documento em /admins/{email})
    const adminSnap = await admin.firestore().collection("admins").doc(email).get();
    if (adminSnap.exists)
        return;
    // Verificar profile via query por campo email (Document ID != Firebase UID)
    const teacherSnap = await admin
        .firestore()
        .collection("teachers")
        .where("email", "==", email)
        .limit(1)
        .get();
    if (teacherSnap.empty) {
        throw new functions.https.HttpsError("permission-denied", "Professor não encontrado");
    }
    const profile = teacherSnap.docs[0].data().profile;
    if (profile !== "coordinator" && profile !== "teacher-coordinator") {
        throw new functions.https.HttpsError("permission-denied", "Role insuficiente");
    }
}
/**
 * Verifica que o chamador é admin.
 */
async function verifyAdmin(context) {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const email = ((_a = context.auth.token.email) !== null && _a !== void 0 ? _a : "").toLowerCase();
    const adminSnap = await admin.firestore().collection("admins").doc(email).get();
    if (!adminSnap.exists) {
        throw new functions.https.HttpsError("permission-denied", "Admin required");
    }
}
//# sourceMappingURL=auth.js.map