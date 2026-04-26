"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyCoordinatorOrAdmin = verifyCoordinatorOrAdmin;
exports.verifyAdmin = verifyAdmin;
exports.verifyAdminOrCoordinatorViaUsers = verifyAdminOrCoordinatorViaUsers;
const admin = require("firebase-admin");
const functions = require("firebase-functions/v1");
/**
 * Verifica que o chamador é coordenador, teacher-coordinator ou admin.
 *
 * Se schoolId for fornecido, busca o teacher em schools/{schoolId}/teachers/.
 * Caso contrário, mantém compatibilidade com a coleção global /teachers/ (legado).
 *
 * Nota importante: teachers/ usa Document IDs gerados por uid() interno,
 * NÃO o Firebase Auth UID. Por isso a verificação precisa fazer query
 * where('email', '==', email) em vez de doc('teachers/{auth.uid}').
 */
async function verifyCoordinatorOrAdmin(context, schoolId) {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const email = ((_a = context.auth.token.email) !== null && _a !== void 0 ? _a : "").toLowerCase();
    // Verificar se é super-admin SaaS (documento em /admins/{email})
    const adminSnap = await admin.firestore().collection("admins").doc(email).get();
    if (adminSnap.exists)
        return;
    // Determinar coleção de teachers a consultar
    const teachersCollection = schoolId
        ? admin.firestore().collection(`schools/${schoolId}/teachers`)
        : admin.firestore().collection("teachers");
    // Verificar profile via query por campo email (Document ID != Firebase UID)
    const teacherSnap = await teachersCollection
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
 * Aceita super-admin SaaS (documento em /admins/) ou school-admin
 * (users/{uid}.schools[schoolId].role == 'admin').
 *
 * Se schoolId for fornecido, verifica role de admin na escola específica.
 */
async function verifyAdmin(context, schoolId) {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const email = ((_a = context.auth.token.email) !== null && _a !== void 0 ? _a : "").toLowerCase();
    const uid = context.auth.uid;
    // Verificar super-admin SaaS
    const adminSnap = await admin.firestore().collection("admins").doc(email).get();
    if (adminSnap.exists)
        return;
    // Se schoolId fornecido, verificar role de admin na escola
    if (schoolId) {
        const userSnap = await admin.firestore().collection("users").doc(uid).get();
        if (userSnap.exists) {
            const userData = userSnap.data();
            const schools = ((_b = userData.schools) !== null && _b !== void 0 ? _b : {});
            const schoolEntry = schools[schoolId];
            if (schoolEntry &&
                schoolEntry.status === "approved" &&
                schoolEntry.role === "admin") {
                return;
            }
        }
    }
    throw new functions.https.HttpsError("permission-denied", "Admin required");
}
/**
 * Verifica que o chamador é admin ou coordenador da escola, lendo de
 * users/{uid}.schools[schoolId].role. Usado em operações onde coordenadores
 * podem agir junto com admins (ex: aprovar/rejeitar professores pendentes).
 */
async function verifyAdminOrCoordinatorViaUsers(context, schoolId) {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const email = ((_a = context.auth.token.email) !== null && _a !== void 0 ? _a : "").toLowerCase();
    const uid = context.auth.uid;
    // Super-admin SaaS sempre passa
    const adminSnap = await admin.firestore().collection("admins").doc(email).get();
    if (adminSnap.exists)
        return;
    const userSnap = await admin.firestore().collection("users").doc(uid).get();
    if (userSnap.exists) {
        const userData = userSnap.data();
        const schools = ((_b = userData.schools) !== null && _b !== void 0 ? _b : {});
        const entry = schools[schoolId];
        if (entry &&
            (entry.status === "approved" || entry.status === "active") &&
            (entry.role === "admin" || entry.role === "coordinator" || entry.role === "teacher-coordinator")) {
            return;
        }
    }
    throw new functions.https.HttpsError("permission-denied", "Admin ou coordenador requerido");
}
//# sourceMappingURL=auth.js.map