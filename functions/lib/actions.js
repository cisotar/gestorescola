"use strict";
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTION_MAP = void 0;
const admin = require("firebase-admin");
// ── Helpers ───────────────────────────────────────────────────────────────────
async function getConfig(db) {
    const snap = await db.doc("meta/config").get();
    return snap.exists ? snap.data() : {};
}
async function saveConfig(db, data) {
    await db.doc("meta/config").set(Object.assign(Object.assign({}, data), { updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
}
function uid() {
    return Math.random().toString(36).slice(2, 9);
}
// ── Action Handlers ───────────────────────────────────────────────────────────
async function addTeacher(db, p) {
    var _a, _b, _c, _d, _e, _f;
    const name = String((_a = p.name) !== null && _a !== void 0 ? _a : "").trim();
    const opts = (_b = p.opts) !== null && _b !== void 0 ? _b : {};
    const teacher = {
        id: uid(),
        name,
        subjectIds: (_c = opts.subjectIds) !== null && _c !== void 0 ? _c : [],
        email: String((_d = opts.email) !== null && _d !== void 0 ? _d : "").toLowerCase(),
        whatsapp: "",
        celular: String((_e = opts.celular) !== null && _e !== void 0 ? _e : ""),
        status: "approved",
        profile: String((_f = opts.profile) !== null && _f !== void 0 ? _f : "teacher"),
    };
    await db.collection("teachers").doc(teacher.id).set(teacher);
}
async function updateTeacher(db, p) {
    var _a;
    const id = String(p.id);
    const changes = (_a = p.changes) !== null && _a !== void 0 ? _a : {};
    await db.collection("teachers").doc(id).update(changes);
}
async function removeTeacher(db, p) {
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
async function addSchedule(db, p) {
    const sched = p.sched;
    if (!(sched === null || sched === void 0 ? void 0 : sched.id))
        return;
    await db.collection("schedules").doc(String(sched.id)).set(sched);
}
async function removeSchedule(db, p) {
    await db.collection("schedules").doc(String(p.id)).delete();
}
async function updateSchedule(db, p) {
    var _a;
    const id = String(p.id);
    const changes = (_a = p.changes) !== null && _a !== void 0 ? _a : {};
    await db.collection("schedules").doc(id).update(changes);
}
async function addSegment(db, p) {
    var _a, _b, _c, _d;
    const cfg = await getConfig(db);
    const segments = ((_a = cfg.segments) !== null && _a !== void 0 ? _a : []);
    const turno = String((_b = p.turno) !== null && _b !== void 0 ? _b : "manha");
    const seg = {
        id: uid(),
        name: String((_c = p.name) !== null && _c !== void 0 ? _c : "").trim(),
        turno,
        grades: [],
    };
    const periodConfigs = ((_d = cfg.periodConfigs) !== null && _d !== void 0 ? _d : {});
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { segments: [...segments, seg], periodConfigs: Object.assign(Object.assign({}, periodConfigs), { [seg.id]: {} }) }));
}
async function removeSegment(db, p) {
    var _a, _b;
    const cfg = await getConfig(db);
    const id = String(p.id);
    const segments = ((_a = cfg.segments) !== null && _a !== void 0 ? _a : []).filter((s) => s.id !== id);
    const periodConfigs = (_b = cfg.periodConfigs) !== null && _b !== void 0 ? _b : {};
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _c = periodConfigs, _d = id, _removed = _c[_d], restPeriods = __rest(_c, [typeof _d === "symbol" ? _d : _d + ""]);
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { segments, periodConfigs: restPeriods }));
}
async function addGrade(db, p) {
    var _a, _b;
    const cfg = await getConfig(db);
    const segId = String(p.segId);
    const gradeName = String((_a = p.gradeName) !== null && _a !== void 0 ? _a : "").trim();
    const segments = ((_b = cfg.segments) !== null && _b !== void 0 ? _b : []).map((seg) => {
        if (seg.id !== segId)
            return seg;
        if (seg.grades.find((g) => g.name === gradeName))
            return seg;
        return Object.assign(Object.assign({}, seg), { grades: [...seg.grades, { name: gradeName, classes: [] }] });
    });
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { segments }));
}
async function removeGrade(db, p) {
    var _a;
    const cfg = await getConfig(db);
    const segId = String(p.segId);
    const gradeName = String(p.gradeName);
    const segments = ((_a = cfg.segments) !== null && _a !== void 0 ? _a : []).map((seg) => seg.id !== segId
        ? seg
        : Object.assign(Object.assign({}, seg), { grades: seg.grades.filter((g) => g.name !== gradeName) }));
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { segments }));
}
async function addClassToGrade(db, p) {
    var _a, _b;
    const cfg = await getConfig(db);
    const segId = String(p.segId);
    const gradeName = String(p.gradeName);
    const letter = String((_a = p.letter) !== null && _a !== void 0 ? _a : "").toUpperCase();
    const segments = ((_b = cfg.segments) !== null && _b !== void 0 ? _b : []).map((seg) => {
        if (seg.id !== segId)
            return seg;
        return Object.assign(Object.assign({}, seg), { grades: seg.grades.map((g) => {
                var _a;
                if (g.name !== gradeName)
                    return g;
                if (g.classes.find((c) => c.letter === letter))
                    return g;
                const classes = [
                    ...g.classes,
                    { letter, turno: (_a = seg.turno) !== null && _a !== void 0 ? _a : "manha" },
                ].sort((a, b) => a.letter.localeCompare(b.letter));
                return Object.assign(Object.assign({}, g), { classes });
            }) });
    });
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { segments }));
}
async function removeClassFromGrade(db, p) {
    var _a;
    const cfg = await getConfig(db);
    const segId = String(p.segId);
    const gradeName = String(p.gradeName);
    const letter = String(p.letter);
    const segments = ((_a = cfg.segments) !== null && _a !== void 0 ? _a : []).map((seg) => seg.id !== segId
        ? seg
        : Object.assign(Object.assign({}, seg), { grades: seg.grades.map((g) => g.name !== gradeName
                ? g
                : Object.assign(Object.assign({}, g), { classes: g.classes.filter((c) => c.letter !== letter) })) }));
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { segments }));
}
async function removeClassFromGradeCascade(db, p) {
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
        var _a;
        const ab = d.data();
        const slots = ((_a = ab.slots) !== null && _a !== void 0 ? _a : []);
        const futureSlots = slots.filter((sl) => sl.turma === fullLabel && String(sl.date) >= today);
        if (futureSlots.length === 0)
            return;
        const slotsToKeep = slots.filter((sl) => !(sl.turma === fullLabel && String(sl.date) >= today));
        if (slotsToKeep.length === 0) {
            batch.delete(d.ref);
        }
        else {
            batch.update(d.ref, { slots: slotsToKeep });
        }
    });
    await batch.commit();
}
async function savePeriodCfg(db, p) {
    var _a, _b;
    const cfg = await getConfig(db);
    const segId = String(p.segId);
    const turno = String(p.turno);
    const periodCfg = p.cfg;
    const periodConfigs = (_a = cfg.periodConfigs) !== null && _a !== void 0 ? _a : {};
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { periodConfigs: Object.assign(Object.assign({}, periodConfigs), { [segId]: Object.assign(Object.assign({}, ((_b = periodConfigs[segId]) !== null && _b !== void 0 ? _b : {})), { [turno]: periodCfg }) }) }));
}
async function addArea(db, p) {
    var _a, _b, _c, _d;
    const cfg = await getConfig(db);
    const areas = ((_a = cfg.areas) !== null && _a !== void 0 ? _a : []);
    const area = {
        id: uid(),
        name: String((_b = p.name) !== null && _b !== void 0 ? _b : "").trim(),
        colorIdx: Number((_c = p.colorIdx) !== null && _c !== void 0 ? _c : 0),
        segmentIds: (_d = p.segmentIds) !== null && _d !== void 0 ? _d : [],
        shared: Boolean(p.shared),
    };
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { areas: [...areas, area] }));
}
async function updateArea(db, p) {
    var _a, _b;
    const cfg = await getConfig(db);
    const id = String(p.id);
    const changes = (_a = p.changes) !== null && _a !== void 0 ? _a : {};
    const areas = ((_b = cfg.areas) !== null && _b !== void 0 ? _b : []).map((a) => a.id === id ? Object.assign(Object.assign({}, a), changes) : a);
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { areas }));
}
async function removeArea(db, p) {
    var _a, _b;
    const cfg = await getConfig(db);
    const id = String(p.id);
    const subjects = ((_a = cfg.subjects) !== null && _a !== void 0 ? _a : []);
    const removedSubjIds = new Set(subjects.filter((x) => x.areaId === id).map((x) => x.id));
    const areas = ((_b = cfg.areas) !== null && _b !== void 0 ? _b : []).filter((a) => a.id !== id);
    const newSubjects = subjects.filter((x) => x.areaId !== id);
    // Remove subjectIds from teachers too
    const teachersSnap = await db.collection("teachers").get();
    if (!teachersSnap.empty) {
        const batch = db.batch();
        teachersSnap.docs.forEach((d) => {
            var _a, _b;
            const t = d.data();
            const subjectIds = ((_a = t.subjectIds) !== null && _a !== void 0 ? _a : []).filter((sid) => !removedSubjIds.has(sid));
            if (subjectIds.length !== ((_b = t.subjectIds) !== null && _b !== void 0 ? _b : []).length) {
                batch.update(d.ref, { subjectIds });
            }
        });
        await batch.commit();
    }
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { areas, subjects: newSubjects }));
}
async function addSubject(db, p) {
    var _a, _b;
    const cfg = await getConfig(db);
    const subjects = ((_a = cfg.subjects) !== null && _a !== void 0 ? _a : []);
    const subject = {
        id: uid(),
        name: String((_b = p.name) !== null && _b !== void 0 ? _b : "").trim(),
        areaId: String(p.areaId),
    };
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { subjects: [...subjects, subject] }));
}
async function removeSubject(db, p) {
    var _a;
    const cfg = await getConfig(db);
    const id = String(p.id);
    const subjects = ((_a = cfg.subjects) !== null && _a !== void 0 ? _a : []).filter((x) => x.id !== id);
    // Remove from teachers
    const teachersSnap = await db.collection("teachers").get();
    if (!teachersSnap.empty) {
        const batch = db.batch();
        teachersSnap.docs.forEach((d) => {
            var _a, _b;
            const t = d.data();
            const subjectIds = ((_a = t.subjectIds) !== null && _a !== void 0 ? _a : []).filter((sid) => sid !== id);
            if (subjectIds.length !== ((_b = t.subjectIds) !== null && _b !== void 0 ? _b : []).length) {
                batch.update(d.ref, { subjectIds });
            }
        });
        await batch.commit();
    }
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { subjects }));
}
async function saveAreaWithSubjects(db, p) {
    var _a, _b, _c, _d;
    const cfg = await getConfig(db);
    const areaId = String(p.areaId);
    const name = String((_a = p.name) !== null && _a !== void 0 ? _a : "");
    const subjectNames = (_b = p.subjectNames) !== null && _b !== void 0 ? _b : [];
    const subjects = ((_c = cfg.subjects) !== null && _c !== void 0 ? _c : []);
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
    const areas = ((_d = cfg.areas) !== null && _d !== void 0 ? _d : []).map((a) => a.id === areaId ? Object.assign(Object.assign({}, a), { name }) : a);
    // Remove removed subject IDs from teachers
    if (removedSet.size > 0) {
        const teachersSnap = await db.collection("teachers").get();
        if (!teachersSnap.empty) {
            const batch = db.batch();
            teachersSnap.docs.forEach((d) => {
                var _a, _b;
                const t = d.data();
                const subjectIds = ((_a = t.subjectIds) !== null && _a !== void 0 ? _a : []).filter((sid) => !removedSet.has(sid));
                if (subjectIds.length !== ((_b = t.subjectIds) !== null && _b !== void 0 ? _b : []).length) {
                    batch.update(d.ref, { subjectIds });
                }
            });
            await batch.commit();
        }
    }
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { areas, subjects: newSubjects }));
}
async function setWorkload(db, p) {
    var _a, _b;
    const cfg = await getConfig(db);
    await saveConfig(db, Object.assign(Object.assign({}, cfg), { workloadWarn: Number((_a = p.warn) !== null && _a !== void 0 ? _a : 0), workloadDanger: Number((_b = p.danger) !== null && _b !== void 0 ? _b : 0) }));
}
// ── Public ACTION_MAP ─────────────────────────────────────────────────────────
exports.ACTION_MAP = {
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
//# sourceMappingURL=actions.js.map