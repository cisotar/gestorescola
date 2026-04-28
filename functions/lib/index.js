"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPendingAction = exports.removeTeacherFromSchool = exports.rejectTeacher = exports.approveTeacher = exports.deleteAbsence = exports.updateAbsence = exports.createAbsence = void 0;
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const schoolId = String((_a = data === null || data === void 0 ? void 0 : data.schoolId) !== null && _a !== void 0 ? _a : "");
    const pendingUid = String((_b = data === null || data === void 0 ? void 0 : data.pendingUid) !== null && _b !== void 0 ? _b : "");
    let profile = String((_c = data === null || data === void 0 ? void 0 : data.profile) !== null && _c !== void 0 ? _c : "teacher");
    if (!schoolId || !pendingUid) {
        throw new functions.https.HttpsError("invalid-argument", "schoolId e pendingUid são obrigatórios");
    }
    if (!VALID_PROFILES.includes(profile))
        profile = "teacher";
    await (0, auth_1.verifyAdminOrCoordinatorViaUsers)(context, schoolId);
    const db = admin.firestore();
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
        teacherData = Object.assign(Object.assign({}, existingSnap.docs[0].data()), { status: "approved", profile, horariosSemana: (_f = (_e = pendingData.horariosSemana) !== null && _e !== void 0 ? _e : existingSnap.docs[0].data().horariosSemana) !== null && _f !== void 0 ? _f : null });
    }
    else {
        teacherId = uid();
        teacherData = {
            id: teacherId,
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
    const role = profile === "coordinator"
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
    batch.set(db.collection("users").doc(pendingUid), {
        email,
        schools: { [schoolId]: { role, status: "approved", teacherDocId: teacherId } },
    }, { merge: true });
    orphanSnap.docs.forEach((d) => {
        batch.update(d.ref, { teacherId });
    });
    batch.delete(pendingRef);
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
// ── removeTeacherFromSchool ───────────────────────────────────────────────────
// Revogação atômica de acesso de um professor à escola.
// Apaga teacher doc, schedules, pending_teachers e users/{uid}.schools[schoolId].
// Reusa verifyAdmin (SaaS admin OU admin local). Coordenador NÃO pode chamar.
exports.removeTeacherFromSchool = region.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f, _g;
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
    // 5. Resolver Firebase Auth UID do professor.
    // O doc teachers/ não tem campo uid (approveTeacher não grava). O vínculo
    // autoritativo está em users/{authUid}.schools[schoolId].teacherDocId === teacherId.
    // Buscar via email (campo gravado em users/{uid} no nível raiz).
    let teacherUid = "";
    if (teacherEmail) {
        const usersSnap = await db
            .collection("users")
            .where("email", "==", teacherEmail)
            .limit(1)
            .get();
        if (!usersSnap.empty) {
            teacherUid = usersSnap.docs[0].id;
        }
    }
    // 6. Bloquear self-removal — comparar UID resolvido E teacherDocId do caller
    // (vínculo via users/{callerUid}.schools[schoolId].teacherDocId).
    const callerUserSnap = await db.doc(`users/${callerUid}`).get();
    const callerSchoolEntry = (_f = ((_e = callerUserSnap.data()) !== null && _e !== void 0 ? _e : {}).schools) === null || _f === void 0 ? void 0 : _f[schoolId];
    const callerTeacherDocId = String((_g = callerSchoolEntry === null || callerSchoolEntry === void 0 ? void 0 : callerSchoolEntry.teacherDocId) !== null && _g !== void 0 ? _g : "");
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
    if (teacherUid) {
        batch.delete(db.doc(`schools/${schoolId}/pending_teachers/${teacherUid}`));
        if (userExists) {
            batch.update(db.doc(`users/${teacherUid}`), {
                [`schools.${schoolId}`]: admin.firestore.FieldValue.delete(),
            });
        }
    }
    await batch.commit();
    return {
        ok: true,
        deletedSchedules: schedulesSnap.size,
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
//# sourceMappingURL=index.js.map