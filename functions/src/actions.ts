/**
 * ACTION_MAP server-side para applyPendingAction.
 *
 * Cada handler recebe o payload da pending_action e o Admin SDK Firestore,
 * e deve executar a mutação correspondente em meta/config ou nas coleções
 * de professores, etc.
 *
 * Espelha a lógica do ACTION_MAP em TabApprovals.jsx mas sem Zustand —
 * lê/escreve diretamente via Admin SDK.
 */

import * as admin from "firebase-admin";

type Firestore = admin.firestore.Firestore;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getConfig(db: Firestore) {
  const snap = await db.doc("meta/config").get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : {};
}

async function saveConfig(db: Firestore, data: Record<string, unknown>) {
  await db.doc("meta/config").set(
    { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Grade {
  name: string;
  classes: { letter: string; turno: string }[];
}

interface Segment {
  id: string;
  name: string;
  turno: string;
  grades: Grade[];
}

interface Area {
  id: string;
  name: string;
  colorIdx: number;
  segmentIds: string[];
  shared?: boolean;
}

interface Subject {
  id: string;
  name: string;
  areaId: string;
}

type ActionPayload = Record<string, unknown>;
type ActionHandler = (db: Firestore, payload: ActionPayload) => Promise<void>;

// ── Action Handlers ───────────────────────────────────────────────────────────

async function addTeacher(db: Firestore, p: ActionPayload): Promise<void> {
  const name = String(p.name ?? "").trim();
  const opts = (p.opts as Record<string, unknown>) ?? {};
  const teacher = {
    id: uid(),
    name,
    subjectIds: (opts.subjectIds as string[]) ?? [],
    email: String(opts.email ?? "").toLowerCase(),
    whatsapp: "",
    celular: String(opts.celular ?? ""),
    status: "approved",
    profile: String(opts.profile ?? "teacher"),
  };
  await db.collection("teachers").doc(teacher.id).set(teacher);
}

async function updateTeacher(db: Firestore, p: ActionPayload): Promise<void> {
  const id = String(p.id);
  const changes = (p.changes as Record<string, unknown>) ?? {};
  await db.collection("teachers").doc(id).update(changes);
}

async function removeTeacher(db: Firestore, p: ActionPayload): Promise<void> {
  const id = String(p.id);
  // Delete teacher and their schedules
  const schedulesSnap = await db
    .collection("schedules")
    .where("teacherId", "==", id)
    .get();
  const batch = db.batch();
  batch.delete(db.collection("teachers").doc(id));
  schedulesSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

async function addSchedule(db: Firestore, p: ActionPayload): Promise<void> {
  const sched = p.sched as Record<string, unknown>;
  if (!sched?.id) return;
  await db.collection("schedules").doc(String(sched.id)).set(sched);
}

async function removeSchedule(db: Firestore, p: ActionPayload): Promise<void> {
  await db.collection("schedules").doc(String(p.id)).delete();
}

async function updateSchedule(db: Firestore, p: ActionPayload): Promise<void> {
  const id = String(p.id);
  const changes = (p.changes as Record<string, unknown>) ?? {};
  await db.collection("schedules").doc(id).update(changes);
}

async function addSegment(db: Firestore, p: ActionPayload): Promise<void> {
  const cfg = await getConfig(db);
  const segments = ((cfg.segments as Segment[]) ?? []);
  const turno = String(p.turno ?? "manha");
  const seg: Segment = {
    id: uid(),
    name: String(p.name ?? "").trim(),
    turno,
    grades: [],
  };
  const periodConfigs = ((cfg.periodConfigs as Record<string, unknown>) ?? {});
  await saveConfig(db, {
    ...cfg,
    segments: [...segments, seg],
    periodConfigs: {
      ...periodConfigs,
      [seg.id]: {},
    },
  });
}

async function removeSegment(db: Firestore, p: ActionPayload): Promise<void> {
  const cfg = await getConfig(db);
  const id = String(p.id);
  const segments = ((cfg.segments as Segment[]) ?? []).filter(
    (s) => s.id !== id
  );
  const periodConfigs = (cfg.periodConfigs as Record<string, unknown>) ?? {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [id]: _removed, ...restPeriods } = periodConfigs;
  await saveConfig(db, { ...cfg, segments, periodConfigs: restPeriods });
}

async function addGrade(db: Firestore, p: ActionPayload): Promise<void> {
  const cfg = await getConfig(db);
  const segId = String(p.segId);
  const gradeName = String(p.gradeName ?? "").trim();
  const segments = ((cfg.segments as Segment[]) ?? []).map((seg) => {
    if (seg.id !== segId) return seg;
    if (seg.grades.find((g) => g.name === gradeName)) return seg;
    return { ...seg, grades: [...seg.grades, { name: gradeName, classes: [] }] };
  });
  await saveConfig(db, { ...cfg, segments });
}

async function removeGrade(db: Firestore, p: ActionPayload): Promise<void> {
  const cfg = await getConfig(db);
  const segId = String(p.segId);
  const gradeName = String(p.gradeName);
  const segments = ((cfg.segments as Segment[]) ?? []).map((seg) =>
    seg.id !== segId
      ? seg
      : { ...seg, grades: seg.grades.filter((g) => g.name !== gradeName) }
  );
  await saveConfig(db, { ...cfg, segments });
}

async function addClassToGrade(db: Firestore, p: ActionPayload): Promise<void> {
  const cfg = await getConfig(db);
  const segId = String(p.segId);
  const gradeName = String(p.gradeName);
  const letter = String(p.letter ?? "").toUpperCase();
  const segments = ((cfg.segments as Segment[]) ?? []).map((seg) => {
    if (seg.id !== segId) return seg;
    return {
      ...seg,
      grades: seg.grades.map((g) => {
        if (g.name !== gradeName) return g;
        if (g.classes.find((c) => c.letter === letter)) return g;
        const classes = [
          ...g.classes,
          { letter, turno: seg.turno ?? "manha" },
        ].sort((a, b) => a.letter.localeCompare(b.letter));
        return { ...g, classes };
      }),
    };
  });
  await saveConfig(db, { ...cfg, segments });
}

async function removeClassFromGrade(
  db: Firestore,
  p: ActionPayload
): Promise<void> {
  const cfg = await getConfig(db);
  const segId = String(p.segId);
  const gradeName = String(p.gradeName);
  const letter = String(p.letter);
  const segments = ((cfg.segments as Segment[]) ?? []).map((seg) =>
    seg.id !== segId
      ? seg
      : {
          ...seg,
          grades: seg.grades.map((g) =>
            g.name !== gradeName
              ? g
              : {
                  ...g,
                  classes: g.classes.filter((c) => c.letter !== letter),
                }
          ),
        }
  );
  await saveConfig(db, { ...cfg, segments });
}

async function removeClassFromGradeCascade(
  db: Firestore,
  p: ActionPayload
): Promise<void> {
  // Removes the class from config and cascades to schedules/absences
  const segId = String(p.segId);
  const gradeName = String(p.gradeName);
  const letter = String(p.letter);
  const fullLabel = `${gradeName} ${letter}`;
  const today = new Date().toISOString().slice(0, 10);

  // 1. Remove from meta/config
  await removeClassFromGrade(db, { segId, gradeName, letter });

  // 2. Delete schedules for this class
  const schedulesSnap = await db
    .collection("schedules")
    .where("turma", "==", fullLabel)
    .get();

  // 3. Find and update/delete absences with future slots for this class
  const absencesSnap = await db.collection("absences").get();
  const batch = db.batch();
  schedulesSnap.docs.forEach((d) => batch.delete(d.ref));

  absencesSnap.docs.forEach((d) => {
    const ab = d.data();
    const slots = (ab.slots ?? []) as Record<string, unknown>[];
    const futureSlots = slots.filter(
      (sl) => sl.turma === fullLabel && String(sl.date) >= today
    );
    if (futureSlots.length === 0) return;
    const slotsToKeep = slots.filter(
      (sl) => !(sl.turma === fullLabel && String(sl.date) >= today)
    );
    if (slotsToKeep.length === 0) {
      batch.delete(d.ref);
    } else {
      batch.update(d.ref, { slots: slotsToKeep });
    }
  });

  await batch.commit();
}

async function savePeriodCfg(db: Firestore, p: ActionPayload): Promise<void> {
  const cfg = await getConfig(db);
  const segId = String(p.segId);
  const turno = String(p.turno);
  const periodCfg = p.cfg as Record<string, unknown>;
  const periodConfigs = (cfg.periodConfigs as Record<string, Record<string, unknown>>) ?? {};
  await saveConfig(db, {
    ...cfg,
    periodConfigs: {
      ...periodConfigs,
      [segId]: {
        ...(periodConfigs[segId] ?? {}),
        [turno]: periodCfg,
      },
    },
  });
}

async function addArea(db: Firestore, p: ActionPayload): Promise<void> {
  const cfg = await getConfig(db);
  const areas = ((cfg.areas as Area[]) ?? []);
  const area: Area = {
    id: uid(),
    name: String(p.name ?? "").trim(),
    colorIdx: Number(p.colorIdx ?? 0),
    segmentIds: (p.segmentIds as string[]) ?? [],
    shared: Boolean(p.shared),
  };
  await saveConfig(db, { ...cfg, areas: [...areas, area] });
}

async function updateArea(db: Firestore, p: ActionPayload): Promise<void> {
  const cfg = await getConfig(db);
  const id = String(p.id);
  const changes = (p.changes as Record<string, unknown>) ?? {};
  const areas = ((cfg.areas as Area[]) ?? []).map((a) =>
    a.id === id ? { ...a, ...changes } : a
  );
  await saveConfig(db, { ...cfg, areas });
}

async function removeArea(db: Firestore, p: ActionPayload): Promise<void> {
  const cfg = await getConfig(db);
  const id = String(p.id);
  const subjects = ((cfg.subjects as Subject[]) ?? []);
  const removedSubjIds = new Set(
    subjects.filter((x) => x.areaId === id).map((x) => x.id)
  );
  const areas = ((cfg.areas as Area[]) ?? []).filter((a) => a.id !== id);
  const newSubjects = subjects.filter((x) => x.areaId !== id);
  // Remove subjectIds from teachers too
  const teachersSnap = await db.collection("teachers").get();
  if (!teachersSnap.empty) {
    const batch = db.batch();
    teachersSnap.docs.forEach((d) => {
      const t = d.data();
      const subjectIds = ((t.subjectIds as string[]) ?? []).filter(
        (sid) => !removedSubjIds.has(sid)
      );
      if (subjectIds.length !== (t.subjectIds ?? []).length) {
        batch.update(d.ref, { subjectIds });
      }
    });
    await batch.commit();
  }
  await saveConfig(db, { ...cfg, areas, subjects: newSubjects });
}

async function addSubject(db: Firestore, p: ActionPayload): Promise<void> {
  const cfg = await getConfig(db);
  const subjects = ((cfg.subjects as Subject[]) ?? []);
  const subject: Subject = {
    id: uid(),
    name: String(p.name ?? "").trim(),
    areaId: String(p.areaId),
  };
  await saveConfig(db, { ...cfg, subjects: [...subjects, subject] });
}

async function removeSubject(db: Firestore, p: ActionPayload): Promise<void> {
  const cfg = await getConfig(db);
  const id = String(p.id);
  const subjects = ((cfg.subjects as Subject[]) ?? []).filter(
    (x) => x.id !== id
  );
  // Remove from teachers
  const teachersSnap = await db.collection("teachers").get();
  if (!teachersSnap.empty) {
    const batch = db.batch();
    teachersSnap.docs.forEach((d) => {
      const t = d.data();
      const subjectIds = ((t.subjectIds as string[]) ?? []).filter(
        (sid) => sid !== id
      );
      if (subjectIds.length !== (t.subjectIds ?? []).length) {
        batch.update(d.ref, { subjectIds });
      }
    });
    await batch.commit();
  }
  await saveConfig(db, { ...cfg, subjects });
}

async function saveAreaWithSubjects(
  db: Firestore,
  p: ActionPayload
): Promise<void> {
  const cfg = await getConfig(db);
  const areaId = String(p.areaId);
  const name = String(p.name ?? "");
  const subjectNames = (p.subjectNames as string[]) ?? [];
  const subjects = ((cfg.subjects as Subject[]) ?? []);
  const existing = subjects.filter((x) => x.areaId === areaId);
  const toRemove = existing
    .filter((x) => !subjectNames.includes(x.name))
    .map((x) => x.id);
  const toAdd = subjectNames
    .filter((n) => !existing.find((x) => x.name === n))
    .map((n) => ({ id: uid(), name: n, areaId }));
  const removedSet = new Set(toRemove);
  const newSubjects = [
    ...subjects.filter((x) => !removedSet.has(x.id)),
    ...toAdd,
  ];
  const areas = ((cfg.areas as Area[]) ?? []).map((a) =>
    a.id === areaId ? { ...a, name } : a
  );
  // Remove removed subject IDs from teachers
  if (removedSet.size > 0) {
    const teachersSnap = await db.collection("teachers").get();
    if (!teachersSnap.empty) {
      const batch = db.batch();
      teachersSnap.docs.forEach((d) => {
        const t = d.data();
        const subjectIds = ((t.subjectIds as string[]) ?? []).filter(
          (sid) => !removedSet.has(sid)
        );
        if (subjectIds.length !== (t.subjectIds ?? []).length) {
          batch.update(d.ref, { subjectIds });
        }
      });
      await batch.commit();
    }
  }
  await saveConfig(db, { ...cfg, areas, subjects: newSubjects });
}

async function setWorkload(db: Firestore, p: ActionPayload): Promise<void> {
  const cfg = await getConfig(db);
  await saveConfig(db, {
    ...cfg,
    workloadWarn: Number(p.warn ?? 0),
    workloadDanger: Number(p.danger ?? 0),
  });
}

// ── Public ACTION_MAP ─────────────────────────────────────────────────────────

export const ACTION_MAP: Record<string, ActionHandler> = {
  addTeacher,
  updateTeacher,
  removeTeacher,
  addSchedule,
  removeSchedule,
  updateSchedule,
  addSegment,
  removeSegment,
  addGrade,
  removeGrade,
  addClassToGrade,
  removeClassFromGrade,
  removeClassFromGradeCascade,
  savePeriodCfg,
  addArea,
  updateArea,
  removeArea,
  addSubject,
  removeSubject,
  saveAreaWithSubjects,
  setWorkload,
};
