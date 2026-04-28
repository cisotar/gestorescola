import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { verifyCoordinatorOrAdmin, verifyAdmin, verifyAdminOrCoordinatorViaUsers } from "./auth";
import { ACTION_MAP } from "./actions";

admin.initializeApp();

const region = functions.region("southamerica-east1");

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

export const createAbsence = region.https.onCall(async (data, context) => {
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

export const updateAbsence = region.https.onCall(async (data, context) => {
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

export const deleteAbsence = region.https.onCall(async (data, context) => {
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

// ── approveTeacher ────────────────────────────────────────────────────────────
// Atomicamente: cria/atualiza schools/{schoolId}/teachers/, deleta
// schools/{schoolId}/pending_teachers/{pendingUid}, escreve users/{pendingUid}.
// Migra schedules órfãos do UID pendente para o teacher.id final.

const VALID_PROFILES = ["teacher", "coordinator", "teacher-coordinator", "admin"];

export const approveTeacher = region.https.onCall(async (data, context) => {
  const schoolId = String(data?.schoolId ?? "");
  const pendingUid = String(data?.pendingUid ?? "");
  let profile = String(data?.profile ?? "teacher");

  if (!schoolId || !pendingUid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "schoolId e pendingUid são obrigatórios"
    );
  }
  if (!VALID_PROFILES.includes(profile)) profile = "teacher";

  await verifyAdminOrCoordinatorViaUsers(context, schoolId);

  const db = admin.firestore();
  const pendingRef = db
    .collection(`schools/${schoolId}/pending_teachers`)
    .doc(pendingUid);
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Solicitação pendente não encontrada"
    );
  }
  const pendingData = pendingSnap.data() as Record<string, unknown>;
  const email = String(pendingData.email ?? "").toLowerCase();
  if (!email) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Doc pendente sem email"
    );
  }

  // Procurar teacher existente por email
  const existingSnap = await db
    .collection(`schools/${schoolId}/teachers`)
    .where("email", "==", email)
    .limit(1)
    .get();

  let teacherId: string;
  let teacherData: Record<string, unknown>;

  if (!existingSnap.empty) {
    teacherId = existingSnap.docs[0].id;
    teacherData = {
      ...existingSnap.docs[0].data(),
      status: "approved",
      profile,
      horariosSemana:
        pendingData.horariosSemana ??
        existingSnap.docs[0].data().horariosSemana ??
        null,
    };
  } else {
    teacherId = uid();
    teacherData = {
      id: teacherId,
      name: pendingData.name ?? "",
      email,
      whatsapp: "",
      celular: pendingData.celular ?? "",
      apelido: pendingData.apelido ?? "",
      subjectIds: pendingData.subjectIds ?? [],
      status: "approved",
      profile,
      horariosSemana: pendingData.horariosSemana ?? null,
    };
  }

  const role =
    profile === "coordinator"
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
  batch.set(
    db.collection(`schools/${schoolId}/teachers`).doc(teacherId),
    teacherData
  );
  batch.set(
    db.collection("users").doc(pendingUid),
    {
      email,
      schools: { [schoolId]: { role, status: "approved", teacherDocId: teacherId } },
    },
    { merge: true }
  );
  orphanSnap.docs.forEach((d) => {
    batch.update(d.ref, { teacherId });
  });
  batch.delete(pendingRef);
  await batch.commit();

  return { ok: true, teacherId };
});

// ── rejectTeacher ─────────────────────────────────────────────────────────────

export const rejectTeacher = region.https.onCall(async (data, context) => {
  const schoolId = String(data?.schoolId ?? "");
  const pendingUid = String(data?.pendingUid ?? "");
  if (!schoolId || !pendingUid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "schoolId e pendingUid são obrigatórios"
    );
  }
  await verifyAdminOrCoordinatorViaUsers(context, schoolId);

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
  batch.set(
    db.collection("users").doc(pendingUid),
    { schools: { [schoolId]: { role: "rejected", status: "rejected" } } },
    { merge: true }
  );
  batch.delete(pendingRef);
  await batch.commit();

  return { ok: true };
});

// ── removeTeacherFromSchool ───────────────────────────────────────────────────
// Revogação atômica de acesso de um professor à escola.
// Apaga teacher doc, schedules, pending_teachers e users/{uid}.schools[schoolId].
// Reusa verifyAdmin (SaaS admin OU admin local). Coordenador NÃO pode chamar.

export const removeTeacherFromSchool = region.https.onCall(
  async (data, context) => {
    // 1. context.auth presente
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Login required"
      );
    }

    // 2. Validar inputs
    const schoolId = String(data?.schoolId ?? "");
    const teacherId = String(data?.teacherId ?? "");
    if (!schoolId || !teacherId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "schoolId e teacherId são obrigatórios"
      );
    }

    // 3. Autorização: SaaS admin OU admin local
    await verifyAdmin(context, schoolId);

    const db = admin.firestore();
    const callerUid = context.auth.uid;

    // 4. Buscar teacher doc — idempotência se não existe
    const teacherRef = db.doc(`schools/${schoolId}/teachers/${teacherId}`);
    const teacherSnap = await teacherRef.get();
    if (!teacherSnap.exists) {
      return { ok: true, deletedSchedules: 0, idempotent: true };
    }

    const teacherData = (teacherSnap.data() ?? {}) as Record<string, unknown>;
    const teacherEmail = String(teacherData.email ?? "").toLowerCase();

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
    const callerSchoolEntry = (
      ((callerUserSnap.data() ?? {}) as Record<string, unknown>).schools as
        | Record<string, { teacherDocId?: string }>
        | undefined
    )?.[schoolId];
    const callerTeacherDocId = String(callerSchoolEntry?.teacherDocId ?? "");

    if (
      callerUid === teacherUid ||
      (callerTeacherDocId && callerTeacherDocId === teacherId)
    ) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Admin não pode remover a si mesmo"
      );
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
      batch.delete(
        db.doc(`schools/${schoolId}/pending_teachers/${teacherUid}`)
      );
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
  }
);

// ── applyPendingAction ────────────────────────────────────────────────────────

export const applyPendingAction = region.https.onCall(
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
