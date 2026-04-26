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

/**
 * Resolve o caminho base para absences.
 * Se schoolId for fornecido, usa schools/{schoolId}/absences.
 * Caso contrário, mantém compatibilidade com a coleção global /absences/ (legado).
 */
function absencesPath(schoolId?: string): string {
  return schoolId ? `schools/${schoolId}/absences` : "absences";
}

/**
 * Resolve o caminho base para teachers.
 * Se schoolId for fornecido, usa schools/{schoolId}/teachers.
 * Caso contrário, mantém compatibilidade com a coleção global /teachers/ (legado).
 */
function teachersPath(schoolId?: string): string {
  return schoolId ? `schools/${schoolId}/teachers` : "teachers";
}

/**
 * Resolve o caminho base para pending_actions.
 */
function pendingActionsPath(schoolId?: string): string {
  return schoolId ? `schools/${schoolId}/pending_actions` : "pending_actions";
}

/**
 * Resolve o caminho base para admin_actions.
 */
function adminActionsPath(schoolId?: string): string {
  return schoolId ? `schools/${schoolId}/admin_actions` : "admin_actions";
}

// ── createAbsence ─────────────────────────────────────────────────────────────

export const createAbsence = functions.https.onCall(async (data, context) => {
  const schoolId = data?.schoolId ? String(data.schoolId) : undefined;
  await verifyCoordinatorOrAdmin(context, schoolId);

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

  await admin
    .firestore()
    .collection(absencesPath(schoolId))
    .doc(absenceId)
    .set(absence);

  return { id: absenceId };
});

// ── updateAbsence ─────────────────────────────────────────────────────────────

export const updateAbsence = functions.https.onCall(async (data, context) => {
  const schoolId = data?.schoolId ? String(data.schoolId) : undefined;
  await verifyCoordinatorOrAdmin(context, schoolId);

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
    .collection(absencesPath(schoolId))
    .doc(absenceId)
    .get();
  if (!absenceDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Ausência não encontrada");
  }

  const substituteId = data?.substituteId !== undefined ? data.substituteId : null;
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

export const deleteAbsence = functions.https.onCall(async (data, context) => {
  const schoolId = data?.schoolId ? String(data.schoolId) : undefined;
  await verifyCoordinatorOrAdmin(context, schoolId);

  const absenceId = String(data?.absenceId ?? "");
  if (!absenceId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "absenceId é obrigatório"
    );
  }

  await admin
    .firestore()
    .collection(absencesPath(schoolId))
    .doc(absenceId)
    .delete();

  return { ok: true };
});

// ── applyPendingAction ────────────────────────────────────────────────────────

export const applyPendingAction = functions.https.onCall(
  async (data, context) => {
    const schoolId = data?.schoolId ? String(data.schoolId) : undefined;
    await verifyAdmin(context, schoolId);

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
      .collection(pendingActionsPath(schoolId))
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
  }
);
