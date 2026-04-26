import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { verifyCoordinatorOrAdmin, verifyAdmin } from "./auth";
import { ACTION_MAP } from "./actions";

admin.initializeApp();

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function validateNoFormationSlots(slots: unknown[]): void {
  if (!Array.isArray(slots)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "slots deve ser um array"
    );
  }
  const hasFormation = slots.some((s) => {
    const slot = s as Record<string, unknown>;
    return String(slot.subjectId ?? "").startsWith("formation-");
  });
  if (hasFormation) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Slots de formação não são permitidos"
    );
  }
}

function calcStatus(slots: unknown[]): string {
  if (!Array.isArray(slots) || slots.length === 0) return "open";
  const covered = slots.filter((s) => {
    const slot = s as Record<string, unknown>;
    return !!slot.substituteId;
  }).length;
  if (covered === 0) return "open";
  if (covered < slots.length) return "partial";
  return "covered";
}

// ── createAbsence ─────────────────────────────────────────────────────────────

export const createAbsence = functions.https.onCall(async (data, context) => {
  await verifyCoordinatorOrAdmin(context);

  const teacherId = String(data?.teacherId ?? "");
  if (!teacherId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "teacherId é obrigatório"
    );
  }

  const slots = (data?.slots ?? []) as unknown[];
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
      throw new functions.https.HttpsError(
        "not-found",
        "Professor não encontrado"
      );
    }
  }

  const absenceId = uid();
  const absence = {
    id: absenceId,
    teacherId,
    createdAt: new Date().toISOString(),
    status: "open",
    slots: slots.map((s) => {
      const slot = s as Record<string, unknown>;
      return {
        id: uid(),
        date: slot.date ?? null,
        day: slot.day ?? null,
        timeSlot: slot.timeSlot ?? null,
        scheduleId: slot.scheduleId ?? null,
        subjectId: slot.subjectId ?? null,
        turma: slot.turma ?? "",
        substituteId: null,
      };
    }),
  };

  await admin.firestore().collection("absences").doc(absenceId).set(absence);

  return { id: absenceId };
});

// ── updateAbsence ─────────────────────────────────────────────────────────────

export const updateAbsence = functions.https.onCall(async (data, context) => {
  await verifyCoordinatorOrAdmin(context);

  const absenceId = String(data?.absenceId ?? "");
  if (!absenceId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "absenceId é obrigatório"
    );
  }

  const slots = (data?.slots ?? []) as unknown[];
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

  const substituteId = data?.substituteId !== undefined ? data.substituteId : null;
  const status = calcStatus(slots);

  await admin.firestore().collection("absences").doc(absenceId).update({
    slots,
    substituteId,
    status,
  });

  return { ok: true };
});

// ── deleteAbsence ─────────────────────────────────────────────────────────────

export const deleteAbsence = functions.https.onCall(async (data, context) => {
  await verifyCoordinatorOrAdmin(context);

  const absenceId = String(data?.absenceId ?? "");
  if (!absenceId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "absenceId é obrigatório"
    );
  }

  await admin.firestore().collection("absences").doc(absenceId).delete();

  return { ok: true };
});

// ── applyPendingAction ────────────────────────────────────────────────────────

export const applyPendingAction = functions.https.onCall(
  async (data, context) => {
    await verifyAdmin(context);

    const pendingActionId = String(data?.pendingActionId ?? "");
    if (!pendingActionId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "pendingActionId é obrigatório"
      );
    }

    const approved = Boolean(data?.approved);
    const rejectionReason = data?.rejectionReason
      ? String(data.rejectionReason)
      : null;

    const db = admin.firestore();

    // Read the pending action
    const pendingDoc = await db
      .collection("pending_actions")
      .doc(pendingActionId)
      .get();

    if (!pendingDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Ação pendente não encontrada"
      );
    }

    const pendingData = pendingDoc.data() as Record<string, unknown>;

    if (
      pendingData.status === "approved" ||
      pendingData.status === "rejected"
    ) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Ação já processada"
      );
    }

    const actionType = String(pendingData.action ?? "");
    const payload = (pendingData.payload ?? {}) as Record<string, unknown>;

    // If approved, execute the action server-side
    if (approved) {
      const handler = ACTION_MAP[actionType];
      if (!handler) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          `Ação desconhecida: ${actionType}`
        );
      }
      await handler(db, payload);
    }

    const actorEmail = (context.auth?.token.email ?? "").toLowerCase();
    const actorUid = context.auth?.uid ?? "";

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
  }
);
