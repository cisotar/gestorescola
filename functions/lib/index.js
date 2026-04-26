"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPendingAction = exports.deleteAbsence = exports.updateAbsence = exports.createAbsence = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const auth_1 = require("./auth");
const actions_1 = require("./actions");
admin.initializeApp();
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
// ── createAbsence ─────────────────────────────────────────────────────────────
exports.createAbsence = functions.https.onCall(async (data, context) => {
    var _a, _b;
    await (0, auth_1.verifyCoordinatorOrAdmin)(context);
    const teacherId = String((_a = data === null || data === void 0 ? void 0 : data.teacherId) !== null && _a !== void 0 ? _a : "");
    if (!teacherId) {
        throw new functions.https.HttpsError("invalid-argument", "teacherId é obrigatório");
    }
    const slots = ((_b = data === null || data === void 0 ? void 0 : data.slots) !== null && _b !== void 0 ? _b : []);
    validateNoFormationSlots(slots);
    // Verify teacher exists
    const teacherDoc = await admin
        .firestore()
        .collection("teachers")
        .doc(teacherId)
        .get();
    if (!teacherDoc.exists) {
        // Try by email in case teacherId is actually an email
        const teacherSnap = await admin
            .firestore()
            .collection("teachers")
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
    await admin.firestore().collection("absences").doc(absenceId).set(absence);
    return { id: absenceId };
});
// ── updateAbsence ─────────────────────────────────────────────────────────────
exports.updateAbsence = functions.https.onCall(async (data, context) => {
    var _a, _b;
    await (0, auth_1.verifyCoordinatorOrAdmin)(context);
    const absenceId = String((_a = data === null || data === void 0 ? void 0 : data.absenceId) !== null && _a !== void 0 ? _a : "");
    if (!absenceId) {
        throw new functions.https.HttpsError("invalid-argument", "absenceId é obrigatório");
    }
    const slots = ((_b = data === null || data === void 0 ? void 0 : data.slots) !== null && _b !== void 0 ? _b : []);
    validateNoFormationSlots(slots);
    // Verify absence exists
    const absenceDoc = await admin
        .firestore()
        .collection("absences")
        .doc(absenceId)
        .get();
    if (!absenceDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Ausência não encontrada");
    }
    const substituteId = (data === null || data === void 0 ? void 0 : data.substituteId) !== undefined ? data.substituteId : null;
    const status = calcStatus(slots);
    await admin.firestore().collection("absences").doc(absenceId).update({
        slots,
        substituteId,
        status,
    });
    return { ok: true };
});
// ── deleteAbsence ─────────────────────────────────────────────────────────────
exports.deleteAbsence = functions.https.onCall(async (data, context) => {
    var _a;
    await (0, auth_1.verifyCoordinatorOrAdmin)(context);
    const absenceId = String((_a = data === null || data === void 0 ? void 0 : data.absenceId) !== null && _a !== void 0 ? _a : "");
    if (!absenceId) {
        throw new functions.https.HttpsError("invalid-argument", "absenceId é obrigatório");
    }
    await admin.firestore().collection("absences").doc(absenceId).delete();
    return { ok: true };
});
// ── applyPendingAction ────────────────────────────────────────────────────────
exports.applyPendingAction = functions.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f, _g;
    await (0, auth_1.verifyAdmin)(context);
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
        .collection("pending_actions")
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
    await db.collection("admin_actions").doc(adminActionId).set({
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
    await db.collection("pending_actions").doc(pendingActionId).update({
        status: approved ? "approved" : "rejected",
        reviewedBy: actorEmail,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectionReason,
    });
    return { ok: true };
});
//# sourceMappingURL=index.js.map