"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillRemovedFrom = exports.applyPendingAction = exports.removeTeacherFromSchool = exports.joinSchoolAsAdmin = exports.designateSchoolAdmin = exports.setTeacherRoleInSchool = exports.reinstateRemovedUser = exports.rejectTeacher = exports.approveTeacher = exports.deleteAbsence = exports.updateAbsence = exports.createAbsence = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const auth_1 = require("./auth");
const actions_1 = require("./actions");
admin.initializeApp();
const region = functions.region("southamerica-east1");
// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() {
    return Math.random().toString(36).slice(2, 9);
}
function validateNoFormationSlots(slots) {
    if (!Array.isArray(slots)) {
        throw new functions.https.HttpsError("invalid-argument", "slots deve ser um array");
    }
    const hasFormation = slots.some((s) => {
        var _a;
        const slot = s;
        return String((_a = slot.subjectId) !== null && _a !== void 0 ? _a : "").startsWith("formation-");
    });
    if (hasFormation) {
        throw new functions.https.HttpsError("invalid-argument", "Slots de formação não são permitidos");
    }
}
function calcStatus(slots) {
    if (!Array.isArray(slots) || slots.length === 0)
        return "open";
    const covered = slots.filter((s) => {
        const slot = s;
        return !!slot.substituteId;
    }).length;
    if (covered === 0)
        return "open";
    if (covered < slots.length)
        return "partial";
    return "covered";
}
/**
 * Resolve o caminho base para absences.
 * Se schoolId for fornecido, usa schools/{schoolId}/absences.
 * Caso contrário, mantém compatibilidade com a coleção global /absences/ (legado).
 */
function absencesPath(schoolId) {
    return schoolId ? `schools/${schoolId}/absences` : "absences";
}
/**
 * Resolve o caminho base para teachers.
 * Se schoolId for fornecido, usa schools/{schoolId}/teachers.
 * Caso contrário, mantém compatibilidade com a coleção global /teachers/ (legado).
 */
function teachersPath(schoolId) {
    return schoolId ? `schools/${schoolId}/teachers` : "teachers";
}
/**
 * Resolve o caminho base para pending_actions.
 */
function pendingActionsPath(schoolId) {
    return schoolId ? `schools/${schoolId}/pending_actions` : "pending_actions";
}
/**
 * Resolve o caminho base para admin_actions.
 */
function adminActionsPath(schoolId) {
    return schoolId ? `schools/${schoolId}/admin_actions` : "admin_actions";
}
// ── createAbsence ─────────────────────────────────────────────────────────────
exports.createAbsence = region.https.onCall(async (data, context) => {
    var _a, _b;
    const schoolId = (data === null || data === void 0 ? void 0 : data.schoolId) ? String(data.schoolId) : undefined;
    await (0, auth_1.verifyCoordinatorOrAdmin)(context, schoolId);
    const teacherId = String((_a = data === null || data === void 0 ? void 0 : data.teacherId) !== null && _a !== void 0 ? _a : "");
    if (!teacherId) {
        throw new functions.https.HttpsError("invalid-argument", "teacherId é obrigatório");
    }
    const slots = ((_b = data === null || data === void 0 ? void 0 : data.slots) !== null && _b !== void 0 ? _b : []);
    validateNoFormationSlots(slots);
    // Verify teacher exists
    const teacherDoc = await admin
        .firestore()
        .collection(teachersPath(schoolId))
        .doc(teacherId)
        .get();
    if (!teacherDoc.exists) {
        // Try by id field in case teacherId is a reference by internal id
        const teacherSnap = await admin
            .firestore()
            .collection(teachersPath(schoolId))
            .where("id", "==", teacherId)
            .limit(1)
            .get();
        if (teacherSnap.empty) {
            throw new functions.https.HttpsError("not-found", "Professor não encontrado");
        }
    }
    const absenceId = uid();
    const absence = {
        id: absenceId,
        teacherId,
        createdAt: new Date().toISOString(),
        status: "open",
        slots: slots.map((s) => {
            var _a, _b, _c, _d, _e, _f;
            const slot = s;
            return {
                id: uid(),
                date: (_a = slot.date) !== null && _a !== void 0 ? _a : null,
                day: (_b = slot.day) !== null && _b !== void 0 ? _b : null,
                timeSlot: (_c = slot.timeSlot) !== null && _c !== void 0 ? _c : null,
                scheduleId: (_d = slot.scheduleId) !== null && _d !== void 0 ? _d : null,
                subjectId: (_e = slot.subjectId) !== null && _e !== void 0 ? _e : null,
                turma: (_f = slot.turma) !== null && _f !== void 0 ? _f : "",
                substituteId: null,
            };
        }),
    };
    await admin
        .firestore()
        .collection(absencesPath(schoolId))
        .doc(absenceId)
        .set(absence);
    return { id: absenceId };
});
// ── updateAbsence ─────────────────────────────────────────────────────────────
exports.updateAbsence = region.https.onCall(async (data, context) => {
    var _a, _b;
    const schoolId = (data === null || data === void 0 ? void 0 : data.schoolId) ? String(data.schoolId) : undefined;
    await (0, auth_1.verifyCoordinatorOrAdmin)(context, schoolId);
    const absenceId = String((_a = data === null || data === void 0 ? void 0 : data.absenceId) !== null && _a !== void 0 ? _a : "");
    if (!absenceId) {
        throw new functions.https.HttpsError("invalid-argument", "absenceId é obrigatório");
    }
    const slots = ((_b = data === null || data === void 0 ? void 0 : data.slots) !== null && _b !== void 0 ? _b : []);
    validateNoFormationSlots(slots);
    // Verify absence exists
    const absenceDoc = await admin
        .firestore()
        .collection(absencesPath(schoolId))
        .doc(absenceId)
        .get();
    if (!absenceDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Ausência não encontrada");
    }
    const substituteId = (data === null || data === void 0 ? void 0 : data.substituteId) !== undefined ? data.substituteId : null;
    const status = calcStatus(slots);
    await admin
        .firestore()
        .collection(absencesPath(schoolId))
        .doc(absenceId)
        .update({
        slots,
        substituteId,
        status,
    });
    return { ok: true };
});
// ── deleteAbsence ─────────────────────────────────────────────────────────────
exports.deleteAbsence = region.https.onCall(async (data, context) => {
    var _a;
    const schoolId = (data === null || data === void 0 ? void 0 : data.schoolId) ? String(data.schoolId) : undefined;
    await (0, auth_1.verifyCoordinatorOrAdmin)(context, schoolId);
    const absenceId = String((_a = data === null || data === void 0 ? void 0 : data.absenceId) !== null && _a !== void 0 ? _a : "");
    if (!absenceId) {
        throw new functions.https.HttpsError("invalid-argument", "absenceId é obrigatório");
    }
    await admin
        .firestore()
        .collection(absencesPath(schoolId))
        .doc(absenceId)
        .delete();
    return { ok: true };
});
// ── approveTeacher ────────────────────────────────────────────────────────────
// Atomicamente: cria/atualiza schools/{schoolId}/teachers/, deleta
// schools/{schoolId}/pending_teachers/{pendingUid}, escreve users/{pendingUid}.
// Migra schedules órfãos do UID pendente para o teacher.id final.
const VALID_PROFILES = ["teacher", "coordinator", "teacher-coordinator", "admin"];
exports.approveTeacher = region.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const schoolId = String((_a = data === null || data === void 0 ? void 0 : data.schoolId) !== null && _a !== void 0 ? _a : "");
    const pendingUid = String((_b = data === null || data === void 0 ? void 0 : data.pendingUid) !== null && _b !== void 0 ? _b : "");
    let profile = String((_c = data === null || data === void 0 ? void 0 : data.profile) !== null && _c !== void 0 ? _c : "teacher");
    const overrideRemoval = Boolean(data === null || data === void 0 ? void 0 : data.overrideRemoval);
    if (!schoolId || !pendingUid) {
        throw new functions.https.HttpsError("invalid-argument", "schoolId e pendingUid são obrigatórios");
    }
    if (!VALID_PROFILES.includes(profile))
        profile = "teacher";
    await (0, auth_1.verifyAdminOrCoordinatorViaUsers)(context, schoolId);
    const db = admin.firestore();
    // Defesa em profundidade (MÉDIA #4 complemento): se existe marcador em
    // removed_users/{pendingUid}, exigir flag explícita overrideRemoval para
    // re-aprovar. Sem o override, aprovação é bloqueada — admin precisa
    // chamar reinstateRemovedUser primeiro OU passar overrideRemoval: true
    // ciente de que está re-aprovando alguém previamente removido.
    const removedRef = db.doc(`schools/${schoolId}/removed_users/${pendingUid}`);
    const removedSnap = await removedRef.get();
    if (removedSnap.exists && !overrideRemoval) {
        throw new functions.https.HttpsError("failed-precondition", "Usuário foi removido desta escola. Use overrideRemoval: true para re-aprovar ou chame reinstateRemovedUser.");
    }
    const pendingRef = db
        .collection(`schools/${schoolId}/pending_teachers`)
        .doc(pendingUid);
    const pendingSnap = await pendingRef.get();
    if (!pendingSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Solicitação pendente não encontrada");
    }
    const pendingData = pendingSnap.data();
    const email = String((_d = pendingData.email) !== null && _d !== void 0 ? _d : "").toLowerCase();
    if (!email) {
        throw new functions.https.HttpsError("invalid-argument", "Doc pendente sem email");
    }
    // Procurar teacher existente por email
    const existingSnap = await db
        .collection(`schools/${schoolId}/teachers`)
        .where("email", "==", email)
        .limit(1)
        .get();
    let teacherId;
    let teacherData;
    if (!existingSnap.empty) {
        teacherId = existingSnap.docs[0].id;
        teacherData = Object.assign(Object.assign({}, existingSnap.docs[0].data()), { uid: pendingUid, status: "approved", profile, horariosSemana: (_f = (_e = pendingData.horariosSemana) !== null && _e !== void 0 ? _e : existingSnap.docs[0].data().horariosSemana) !== null && _f !== void 0 ? _f : null });
    }
    else {
        teacherId = uid();
        teacherData = {
            id: teacherId,
            uid: pendingUid,
            name: (_g = pendingData.name) !== null && _g !== void 0 ? _g : "",
            email,
            whatsapp: "",
            celular: (_h = pendingData.celular) !== null && _h !== void 0 ? _h : "",
            apelido: (_j = pendingData.apelido) !== null && _j !== void 0 ? _j : "",
            subjectIds: (_k = pendingData.subjectIds) !== null && _k !== void 0 ? _k : [],
            status: "approved",
            profile,
            horariosSemana: (_l = pendingData.horariosSemana) !== null && _l !== void 0 ? _l : null,
        };
    }
    // ── Validação de consistência profile × subjectIds ──────────────────────
    if (profile === "coordinator") {
        // Coordenadores puros não lecionam — descartar qualquer subjectIds recebido
        teacherData.subjectIds = [];
    }
    else if (profile === "teacher" || profile === "teacher-coordinator") {
        const resolvedSubjectIds = ((_m = teacherData.subjectIds) !== null && _m !== void 0 ? _m : []);
        if (resolvedSubjectIds.length === 0) {
            throw new functions.https.HttpsError("failed-precondition", "Professor deve ter ao menos uma matéria selecionada");
        }
    }
    const role = profile === "admin"
        ? "admin"
        : profile === "coordinator"
            ? "coordinator"
            : profile === "teacher-coordinator"
                ? "teacher-coordinator"
                : "teacher";
    // Migrar schedules órfãos (teacherId == pendingUid) para o teacher.id real
    const orphanSnap = await db
        .collection(`schools/${schoolId}/schedules`)
        .where("teacherId", "==", pendingUid)
        .get();
    const batch = db.batch();
    batch.set(db.collection(`schools/${schoolId}/teachers`).doc(teacherId), teacherData);
    // users/{uid}: gravar membership e, em paralelo, remover schoolId do índice
    // invertido removedFrom (caso o usuário tenha sido removido antes — ver #472).
    // arrayRemove é idempotente: se o array não contém schoolId (ou o campo não
    // existe), o servidor trata como no-op. Combina com set+merge sem exigir
    // pré-leitura do doc users/{uid}.
    batch.set(db.collection("users").doc(pendingUid), {
        email,
        schools: { [schoolId]: { role, status: "approved", teacherDocId: teacherId } },
        removedFrom: admin.firestore.FieldValue.arrayRemove(schoolId),
    }, { merge: true });
    orphanSnap.docs.forEach((d) => {
        batch.update(d.ref, { teacherId });
    });
    batch.delete(pendingRef);
    // Limpar marcador removed_users — admin está aprovando explicitamente, então
    // a remoção anterior é superada. Se o doc não existir, delete é no-op.
    batch.delete(db.doc(`schools/${schoolId}/removed_users/${pendingUid}`));
    await batch.commit();
    return { ok: true, teacherId };
});
// ── rejectTeacher ─────────────────────────────────────────────────────────────
exports.rejectTeacher = region.https.onCall(async (data, context) => {
    var _a, _b;
    const schoolId = String((_a = data === null || data === void 0 ? void 0 : data.schoolId) !== null && _a !== void 0 ? _a : "");
    const pendingUid = String((_b = data === null || data === void 0 ? void 0 : data.pendingUid) !== null && _b !== void 0 ? _b : "");
    if (!schoolId || !pendingUid) {
        throw new functions.https.HttpsError("invalid-argument", "schoolId e pendingUid são obrigatórios");
    }
    await (0, auth_1.verifyAdminOrCoordinatorViaUsers)(context, schoolId);
    const db = admin.firestore();
    const pendingRef = db
        .collection(`schools/${schoolId}/pending_teachers`)
        .doc(pendingUid);
    // Limpar schedules órfãos do uid pendente
    const orphanSnap = await db
        .collection(`schools/${schoolId}/schedules`)
        .where("teacherId", "==", pendingUid)
        .get();
    const batch = db.batch();
    orphanSnap.docs.forEach((d) => batch.delete(d.ref));
    // Marca users/{uid}.schools[schoolId] como rejected (cliente trata como sem acesso)
    batch.set(db.collection("users").doc(pendingUid), { schools: { [schoolId]: { role: "rejected", status: "rejected" } } }, { merge: true });
    batch.delete(pendingRef);
    await batch.commit();
    return { ok: true };
});
// ── reinstateRemovedUser ─────────────────────────────────────────────────────
// Remove o marcador removed_users/{uid} de uma escola, permitindo que o
// professor volte a se cadastrar via /join/<slug>. NÃO recria membership —
// o professor precisa passar pelo fluxo normal de aprovação novamente.
// Autorização: SaaS admin OU admin local da escola.
exports.reinstateRemovedUser = region.https.onCall(async (data, context) => {
    var _a, _b, _c;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const schoolId = String((_a = data === null || data === void 0 ? void 0 : data.schoolId) !== null && _a !== void 0 ? _a : "");
    const targetUid = String((_b = data === null || data === void 0 ? void 0 : data.targetUid) !== null && _b !== void 0 ? _b : "");
    const targetEmail = String((_c = data === null || data === void 0 ? void 0 : data.email) !== null && _c !== void 0 ? _c : "").toLowerCase().trim();
    if (!schoolId || (!targetUid && !targetEmail)) {
        throw new functions.https.HttpsError("invalid-argument", "schoolId e (targetUid ou email) são obrigatórios");
    }
    await (0, auth_1.verifyAdmin)(context, schoolId);
    const db = admin.firestore();
    // Batch atômico: garante que removed_users/{uid} e o índice invertido
    // users/{uid}.removedFrom são atualizados juntos. Sem isso, uma falha
    // entre as duas operações deixaria o boot bloqueando o login (RN-R6)
    // mesmo após a reativação.
    const batch = db.batch();
    if (targetUid) {
        batch.delete(db.doc(`schools/${schoolId}/removed_users/${targetUid}`));
        // Pré-checar users/{uid}: arrayRemove só pode ser aplicado a docs que
        // existem via update; se o doc não existe, simplesmente pulamos —
        // não há índice a limpar.
        const userRef = db.doc(`users/${targetUid}`);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
            batch.update(userRef, {
                removedFrom: admin.firestore.FieldValue.arrayRemove(schoolId),
            });
        }
    }
    // Fallback por email (para docs criados sem uid)
    if (targetEmail) {
        const emailKey = `email_${targetEmail.replace(/[^a-z0-9._-]/g, "_")}`;
        batch.delete(db.doc(`schools/${schoolId}/removed_users/${emailKey}`));
    }
    await batch.commit();
    return { ok: true };
});
// ── setTeacherRoleInSchool ───────────────────────────────────────────────────
// Atualiza o role de um teacher em users/{uid}.schools[schoolId].role e,
// adicionalmente, sincroniza schools/{schoolId}/teachers/{teacherId}.profile.
// Para role='admin', também atualiza schools/{schoolId}.adminEmail.
//
// Resolve o UID do alvo via (em ordem):
//  1. teacher.uid (gravado por approveTeacher)
//  2. users where email == teacherEmail
//  3. users where schools.{schoolId}.teacherDocId == teacherId
//
// Autorização: SaaS admin OU admin local da escola.
const VALID_ROLES_TO_SET = [
    "teacher",
    "coordinator",
    "teacher-coordinator",
    "admin",
];
exports.setTeacherRoleInSchool = region.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const schoolId = String((_a = data === null || data === void 0 ? void 0 : data.schoolId) !== null && _a !== void 0 ? _a : "");
    const teacherId = String((_b = data === null || data === void 0 ? void 0 : data.teacherId) !== null && _b !== void 0 ? _b : "");
    const newRole = String((_c = data === null || data === void 0 ? void 0 : data.role) !== null && _c !== void 0 ? _c : "");
    if (!schoolId || !teacherId || !newRole) {
        throw new functions.https.HttpsError("invalid-argument", "schoolId, teacherId e role são obrigatórios");
    }
    if (!VALID_ROLES_TO_SET.includes(newRole)) {
        throw new functions.https.HttpsError("invalid-argument", `Role inválido: ${newRole}`);
    }
    await (0, auth_1.verifyAdmin)(context, schoolId);
    const db = admin.firestore();
    const teacherRef = db.doc(`schools/${schoolId}/teachers/${teacherId}`);
    const teacherSnap = await teacherRef.get();
    if (!teacherSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Teacher não encontrado");
    }
    const teacherData = ((_d = teacherSnap.data()) !== null && _d !== void 0 ? _d : {});
    const teacherEmail = String((_e = teacherData.email) !== null && _e !== void 0 ? _e : "").toLowerCase();
    // Resolver UID
    let teacherUid = String((_f = teacherData.uid) !== null && _f !== void 0 ? _f : "");
    if (!teacherUid && teacherEmail) {
        const usersSnap = await db
            .collection("users")
            .where("email", "==", teacherEmail)
            .limit(1)
            .get();
        if (!usersSnap.empty)
            teacherUid = usersSnap.docs[0].id;
    }
    if (!teacherUid) {
        const fallbackSnap = await db
            .collection("users")
            .where(`schools.${schoolId}.teacherDocId`, "==", teacherId)
            .limit(1)
            .get();
        if (!fallbackSnap.empty)
            teacherUid = fallbackSnap.docs[0].id;
    }
    const profile = newRole; // role e profile são equivalentes neste contrato
    const batch = db.batch();
    batch.update(teacherRef, { profile });
    if (teacherUid) {
        const userRef = db.doc(`users/${teacherUid}`);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
            const existing = ((_g = userSnap.data()) !== null && _g !== void 0 ? _g : {});
            const schools = (_h = existing.schools) !== null && _h !== void 0 ? _h : undefined;
            const hasEntry = !!(schools === null || schools === void 0 ? void 0 : schools[schoolId]);
            if (hasEntry) {
                // Atualizar role e, em paralelo, garantir que removedFrom não
                // contenha schoolId (ALTA #2 — fechar stale do índice invertido).
                batch.update(userRef, {
                    [`schools.${schoolId}.role`]: newRole,
                    removedFrom: admin.firestore.FieldValue.arrayRemove(schoolId),
                });
            }
            else {
                batch.set(userRef, {
                    schools: {
                        [schoolId]: {
                            role: newRole,
                            status: "approved",
                            teacherDocId: teacherId,
                        },
                    },
                    removedFrom: admin.firestore.FieldValue.arrayRemove(schoolId),
                }, { merge: true });
            }
        }
    }
    if (newRole === "admin" && teacherEmail) {
        batch.update(db.doc(`schools/${schoolId}`), {
            adminEmail: teacherEmail,
            adminEmailUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    await batch.commit();
    return {
        ok: true,
        teacherUidResolved: !!teacherUid,
        role: newRole,
    };
});
// ── designateSchoolAdmin ─────────────────────────────────────────────────────
// Atualiza schools/{schoolId}.adminEmail e, se possível, eleva o role do
// usuário-alvo (encontrado por email) para 'admin' em users/{uid}.schools[schoolId].
// Autorização: SaaS admin OU admin local da escola. O usuário-alvo pode ainda
// não existir em /users/ — nesse caso, o adminEmail fica gravado e a promoção
// efetiva acontece no próximo login (via joinSchoolAsAdmin).
exports.designateSchoolAdmin = region.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const schoolId = String((_a = data === null || data === void 0 ? void 0 : data.schoolId) !== null && _a !== void 0 ? _a : "");
    const newEmail = String((_b = data === null || data === void 0 ? void 0 : data.email) !== null && _b !== void 0 ? _b : "")
        .trim()
        .toLowerCase();
    if (!schoolId || !newEmail) {
        throw new functions.https.HttpsError("invalid-argument", "schoolId e email são obrigatórios");
    }
    await (0, auth_1.verifyAdmin)(context, schoolId);
    const db = admin.firestore();
    // 1. Atualizar adminEmail na escola (sempre executa)
    const batch = db.batch();
    batch.update(db.doc(`schools/${schoolId}`), {
        adminEmail: newEmail,
        adminEmailUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // 2. Tentar promover via /users/ por email
    let promoted = false;
    let targetUid = null;
    const usersSnap = await db
        .collection("users")
        .where("email", "==", newEmail)
        .limit(1)
        .get();
    if (!usersSnap.empty) {
        targetUid = usersSnap.docs[0].id;
        const userData = (_c = usersSnap.docs[0].data()) !== null && _c !== void 0 ? _c : {};
        const hasEntry = (_e = ((_d = userData.schools) !== null && _d !== void 0 ? _d : {})) === null || _e === void 0 ? void 0 : _e[schoolId];
        if (hasEntry) {
            // Promover a admin e, em paralelo, limpar removedFrom (ALTA #2 —
            // fechar stale do índice invertido caso o usuário tenha sido
            // removido antes). arrayRemove é idempotente.
            batch.update(db.doc(`users/${targetUid}`), {
                [`schools.${schoolId}.role`]: "admin",
                removedFrom: admin.firestore.FieldValue.arrayRemove(schoolId),
            });
            promoted = true;
        }
    }
    await batch.commit();
    return { ok: true, promoted, targetUid };
});
// ── joinSchoolAsAdmin ────────────────────────────────────────────────────────
// Auto-promoção de admin local ao entrar na escola via /join/<slug>.
// Validação backend: caller.email (lowercase) === schools/{schoolId}.adminEmail.
// Substitui o setDoc client-side em JoinPage para fechar o vetor de privilege
// escalation que existia quando users/{uid} era write-livre pelo próprio uid.
exports.joinSchoolAsAdmin = region.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const schoolId = String((_a = data === null || data === void 0 ? void 0 : data.schoolId) !== null && _a !== void 0 ? _a : "");
    if (!schoolId) {
        throw new functions.https.HttpsError("invalid-argument", "schoolId é obrigatório");
    }
    const db = admin.firestore();
    const callerUid = context.auth.uid;
    const callerEmail = String((_c = (_b = context.auth.token) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : "")
        .toLowerCase()
        .trim();
    if (!callerEmail) {
        throw new functions.https.HttpsError("failed-precondition", "Conta sem email associado");
    }
    const schoolSnap = await db.doc(`schools/${schoolId}`).get();
    if (!schoolSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Escola não existe");
    }
    const schoolData = ((_d = schoolSnap.data()) !== null && _d !== void 0 ? _d : {});
    const adminEmail = String((_e = schoolData.adminEmail) !== null && _e !== void 0 ? _e : "")
        .toLowerCase()
        .trim();
    const status = String((_f = schoolData.status) !== null && _f !== void 0 ? _f : "active");
    if (status === "suspended") {
        throw new functions.https.HttpsError("failed-precondition", "Escola está suspensa");
    }
    if (schoolData.deletedAt != null) {
        throw new functions.https.HttpsError("failed-precondition", "Escola foi removida");
    }
    if (!adminEmail || adminEmail !== callerEmail) {
        throw new functions.https.HttpsError("permission-denied", "Email não corresponde ao admin desta escola");
    }
    // Remove eventual marcação removed_users (admin re-entrando — se SaaS admin
    // rotacionar adminEmail e o anterior foi removido, este é o novo, então
    // limpamos a marcação dele se houver). Apenas para o próprio uid.
    const removedRef = db.doc(`schools/${schoolId}/removed_users/${callerUid}`);
    const userRef = db.doc(`users/${callerUid}`);
    const batch = db.batch();
    // Inclui removedFrom: arrayRemove(schoolId) para limpar índice invertido
    // caso o admin tenha sido removido antes (ALTA #1 — fechar stale do
    // removedFrom). arrayRemove é idempotente: se schoolId não estiver no
    // array (ou o campo não existir), o servidor trata como no-op.
    batch.set(userRef, {
        email: callerEmail,
        schools: {
            [schoolId]: { role: "admin", status: "approved" },
        },
        removedFrom: admin.firestore.FieldValue.arrayRemove(schoolId),
    }, { merge: true });
    batch.delete(removedRef);
    await batch.commit();
    return { ok: true };
});
// ── removeTeacherFromSchool ───────────────────────────────────────────────────
// Revogação atômica de acesso de um professor à escola.
// Apaga teacher doc, schedules, pending_teachers e users/{uid}.schools[schoolId].
// Reusa verifyAdmin (SaaS admin OU admin local). Coordenador NÃO pode chamar.
exports.removeTeacherFromSchool = region.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    // 1. context.auth presente
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    // 2. Validar inputs
    const schoolId = String((_a = data === null || data === void 0 ? void 0 : data.schoolId) !== null && _a !== void 0 ? _a : "");
    const teacherId = String((_b = data === null || data === void 0 ? void 0 : data.teacherId) !== null && _b !== void 0 ? _b : "");
    if (!schoolId || !teacherId) {
        throw new functions.https.HttpsError("invalid-argument", "schoolId e teacherId são obrigatórios");
    }
    // 3. Autorização: SaaS admin OU admin local
    await (0, auth_1.verifyAdmin)(context, schoolId);
    const db = admin.firestore();
    const callerUid = context.auth.uid;
    // 4. Buscar teacher doc — idempotência se não existe
    const teacherRef = db.doc(`schools/${schoolId}/teachers/${teacherId}`);
    const teacherSnap = await teacherRef.get();
    if (!teacherSnap.exists) {
        return { ok: true, deletedSchedules: 0, idempotent: true };
    }
    const teacherData = ((_c = teacherSnap.data()) !== null && _c !== void 0 ? _c : {});
    const teacherEmail = String((_d = teacherData.email) !== null && _d !== void 0 ? _d : "").toLowerCase();
    const teacherUidFromDoc = String((_e = teacherData.uid) !== null && _e !== void 0 ? _e : "");
    // 5. Resolver Firebase Auth UID do professor por múltiplos caminhos:
    //    a) Campo `uid` no teacher doc (gravado por approveTeacher recente)
    //    b) Query `users where email == teacherEmail` (lowercase)
    //    c) Fallback: `users where schools.{schoolId}.teacherDocId == teacherId`
    let teacherUid = teacherUidFromDoc;
    if (!teacherUid && teacherEmail) {
        const usersSnap = await db
            .collection("users")
            .where("email", "==", teacherEmail)
            .limit(1)
            .get();
        if (!usersSnap.empty) {
            teacherUid = usersSnap.docs[0].id;
        }
    }
    if (!teacherUid) {
        // Fallback: encontra users cujo schools[schoolId].teacherDocId aponta para este teacher
        const fallbackSnap = await db
            .collection("users")
            .where(`schools.${schoolId}.teacherDocId`, "==", teacherId)
            .limit(1)
            .get();
        if (!fallbackSnap.empty) {
            teacherUid = fallbackSnap.docs[0].id;
        }
    }
    if (!teacherUid) {
        console.warn(`[removeTeacherFromSchool] UID não resolvido para schoolId=${schoolId} teacherId=${teacherId} email=${teacherEmail}. Procedendo com remoção parcial.`);
    }
    // 6. Bloquear self-removal — comparar UID resolvido E teacherDocId do caller
    // (vínculo via users/{callerUid}.schools[schoolId].teacherDocId).
    const callerUserSnap = await db.doc(`users/${callerUid}`).get();
    const callerSchoolEntry = (_g = ((_f = callerUserSnap.data()) !== null && _f !== void 0 ? _f : {}).schools) === null || _g === void 0 ? void 0 : _g[schoolId];
    const callerTeacherDocId = String((_h = callerSchoolEntry === null || callerSchoolEntry === void 0 ? void 0 : callerSchoolEntry.teacherDocId) !== null && _h !== void 0 ? _h : "");
    if (callerUid === teacherUid ||
        (callerTeacherDocId && callerTeacherDocId === teacherId)) {
        throw new functions.https.HttpsError("failed-precondition", "Admin não pode remover a si mesmo");
    }
    // 7. Query schedules deste teacher
    const schedulesSnap = await db
        .collection(`schools/${schoolId}/schedules`)
        .where("teacherId", "==", teacherId)
        .get();
    // 8. Pré-checar users/{teacherUid} para evitar NOT_FOUND no batch.update
    let userExists = false;
    if (teacherUid) {
        const userSnap = await db.doc(`users/${teacherUid}`).get();
        userExists = userSnap.exists;
    }
    // 9. Montar e commitar batch atômico
    const batch = db.batch();
    batch.delete(teacherRef);
    schedulesSnap.docs.forEach((d) => batch.delete(d.ref));
    const removedAt = admin.firestore.FieldValue.serverTimestamp();
    const callerEmail = String((_l = (_k = (_j = context.auth) === null || _j === void 0 ? void 0 : _j.token) === null || _k === void 0 ? void 0 : _k.email) !== null && _l !== void 0 ? _l : "").toLowerCase();
    if (teacherUid) {
        batch.delete(db.doc(`schools/${schoolId}/pending_teachers/${teacherUid}`));
        // Índice invertido: users/{uid}.removedFrom = arrayUnion(schoolId).
        // Permite ao boot detectar revogação em 1 RTT quando users/{uid}.schools
        // está vazio (RN-R1). Usa set+merge para cobrir caso em que o doc
        // users/{uid} foi totalmente apagado — arrayUnion é idempotente, então
        // chamadas repetidas para a mesma escola não duplicam a entrada.
        // TODO v2: revokeRefreshTokens — invalidar tokens via
        // admin.auth().revokeRefreshTokens(teacherUid) para forçar reautenticação
        // imediata. Fora do escopo v1 (ver Parte 4 da spec).
        if (userExists) {
            batch.update(db.doc(`users/${teacherUid}`), {
                [`schools.${schoolId}`]: admin.firestore.FieldValue.delete(),
                removedFrom: admin.firestore.FieldValue.arrayUnion(schoolId),
            });
        }
        else {
            batch.set(db.doc(`users/${teacherUid}`), {
                removedFrom: admin.firestore.FieldValue.arrayUnion(schoolId),
            }, { merge: true });
        }
        // Marcação de remoção — bloqueia recriação de pending_teachers
        // pelo próprio usuário ao tentar entrar de novo via /join/
        batch.set(db.doc(`schools/${schoolId}/removed_users/${teacherUid}`), {
            uid: teacherUid,
            email: teacherEmail,
            teacherId,
            removedAt,
            removedBy: callerUid,
            removedByEmail: callerEmail,
        });
    }
    else if (teacherEmail) {
        // Sem UID resolvido — registra por email (key=email lowercase) para
        // bloqueio futuro caso o usuário tente entrar com este email.
        batch.set(db.doc(`schools/${schoolId}/removed_users/email_${teacherEmail.replace(/[^a-z0-9._-]/g, "_")}`), {
            email: teacherEmail,
            teacherId,
            removedAt,
            removedBy: callerUid,
            removedByEmail: callerEmail,
        });
    }
    await batch.commit();
    return {
        ok: true,
        deletedSchedules: schedulesSnap.size,
        teacherUidResolved: !!teacherUid,
    };
});
// ── applyPendingAction ────────────────────────────────────────────────────────
exports.applyPendingAction = region.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const schoolId = (data === null || data === void 0 ? void 0 : data.schoolId) ? String(data.schoolId) : undefined;
    await (0, auth_1.verifyAdmin)(context, schoolId);
    const pendingActionId = String((_a = data === null || data === void 0 ? void 0 : data.pendingActionId) !== null && _a !== void 0 ? _a : "");
    if (!pendingActionId) {
        throw new functions.https.HttpsError("invalid-argument", "pendingActionId é obrigatório");
    }
    const approved = Boolean(data === null || data === void 0 ? void 0 : data.approved);
    const rejectionReason = (data === null || data === void 0 ? void 0 : data.rejectionReason)
        ? String(data.rejectionReason)
        : null;
    const db = admin.firestore();
    // Read the pending action
    const pendingDoc = await db
        .collection(pendingActionsPath(schoolId))
        .doc(pendingActionId)
        .get();
    if (!pendingDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Ação pendente não encontrada");
    }
    const pendingData = pendingDoc.data();
    if (pendingData.status === "approved" ||
        pendingData.status === "rejected") {
        throw new functions.https.HttpsError("failed-precondition", "Ação já processada");
    }
    const actionType = String((_b = pendingData.action) !== null && _b !== void 0 ? _b : "");
    const payload = ((_c = pendingData.payload) !== null && _c !== void 0 ? _c : {});
    // If approved, execute the action server-side
    if (approved) {
        const handler = actions_1.ACTION_MAP[actionType];
        if (!handler) {
            throw new functions.https.HttpsError("invalid-argument", `Ação desconhecida: ${actionType}`);
        }
        await handler(db, payload);
    }
    const actorEmail = ((_e = (_d = context.auth) === null || _d === void 0 ? void 0 : _d.token.email) !== null && _e !== void 0 ? _e : "").toLowerCase();
    const actorUid = (_g = (_f = context.auth) === null || _f === void 0 ? void 0 : _f.uid) !== null && _g !== void 0 ? _g : "";
    // Write audit log to admin_actions
    const adminActionId = uid();
    await db
        .collection(adminActionsPath(schoolId))
        .doc(adminActionId)
        .set({
        id: adminActionId,
        actionType,
        actorId: actorUid,
        actorEmail,
        pendingActionId,
        payload,
        approved,
        rejectionReason,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Update pending_actions with review result
    await db
        .collection(pendingActionsPath(schoolId))
        .doc(pendingActionId)
        .update({
        status: approved ? "approved" : "rejected",
        reviewedBy: actorEmail,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectionReason,
    });
    return { ok: true };
});
// ── backfillRemovedFrom ──────────────────────────────────────────────────────
// Reconciliação histórica do índice invertido users/{uid}.removedFrom a partir
// do source of truth schools/{schoolId}/removed_users/{docId}. Necessária para
// usuários removidos antes do deploy do índice invertido (issue #483).
//
// Autorização: SaaS admin only (documento em /admins/{email_lower}).
// NÃO aceita admin local — operação cruza escolas via collectionGroup.
//
// Estratégia:
//   1. Iterar collectionGroup('removed_users') em uma única query.
//   2. Para cada doc cujo id parece ser um uid (não começa com "email_"),
//      extrair schoolId do parent.parent e adicionar a users/{uid}.removedFrom
//      via arrayUnion (idempotente).
//   3. Processar em batches de 400 (limite Firestore: 500/batch).
//   4. Usar set+merge para cobrir docs users/{uid} que não existem ainda —
//      evita NOT_FOUND no batch.update.
//
// Idempotência: arrayUnion garante que chamadas repetidas não duplicam
// entradas no array removedFrom. Operação puramente aditiva — nunca remove.
const BACKFILL_BATCH_SIZE = 400;
exports.backfillRemovedFrom = region.https.onCall(async (_data, context) => {
    var _a, _b;
    // 1. Autenticação obrigatória
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    // 2. Autorização: somente SaaS admin (não aceita admin local)
    const callerEmail = String((_b = (_a = context.auth.token) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : "")
        .toLowerCase()
        .trim();
    if (!callerEmail) {
        throw new functions.https.HttpsError("permission-denied", "Conta sem email associado");
    }
    const adminSnap = await admin
        .firestore()
        .collection("admins")
        .doc(callerEmail)
        .get();
    if (!adminSnap.exists) {
        throw new functions.https.HttpsError("permission-denied", "Apenas SaaS admin pode executar backfill");
    }
    const db = admin.firestore();
    // 3. Iterar todos os removed_users via collectionGroup
    const groupSnap = await db.collectionGroup("removed_users").get();
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const samples = [];
    // 4. Processar em batches de 400
    let batch = db.batch();
    let batchOps = 0;
    for (const doc of groupSnap.docs) {
        const docId = doc.id;
        const parentSchool = doc.ref.parent.parent;
        // Pular docs criados por email (key "email_..."): não há uid para indexar
        if (docId.startsWith("email_")) {
            skipped += 1;
            continue;
        }
        // Sem parent.parent — registro defeituoso, pula
        if (!parentSchool) {
            skipped += 1;
            continue;
        }
        const schoolId = parentSchool.id;
        const userRef = db.doc(`users/${docId}`);
        // set+merge cobre o caso de users/{uid} não existir.
        // arrayUnion é idempotente: chamadas repetidas com o mesmo schoolId
        // não duplicam a entrada.
        batch.set(userRef, {
            removedFrom: admin.firestore.FieldValue.arrayUnion(schoolId),
        }, { merge: true });
        processed += 1;
        batchOps += 1;
        if (samples.length < 5) {
            samples.push({ uid: docId, schoolId });
        }
        // Commit quando atingir o limite do batch
        if (batchOps >= BACKFILL_BATCH_SIZE) {
            try {
                await batch.commit();
            }
            catch (err) {
                errors += 1;
                console.error("[backfillRemovedFrom] Erro em commit de batch:", err);
            }
            batch = db.batch();
            batchOps = 0;
        }
    }
    // Commit final de operações restantes
    if (batchOps > 0) {
        try {
            await batch.commit();
        }
        catch (err) {
            errors += 1;
            console.error("[backfillRemovedFrom] Erro em commit final:", err);
        }
    }
    console.log(`[backfillRemovedFrom] Concluído: total=${groupSnap.size} processed=${processed} skipped=${skipped} errors=${errors}`, { samples });
    return { ok: true, processed, skipped, errors };
});
//# sourceMappingURL=index.js.map