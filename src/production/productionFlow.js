/*
 * productionFlow.js -- E-70 round 1 (David 10-29, our 04): the Production Cards become production's workflow hub. Each department's
 * card tab (Screen Print, Embroidery, Vinyl) carries its job's flow, step by step:
 *
 *   START  1. count + sort            -> Deal "Garments Received?" ticked
 *          2. artwork + placement     -> any doubt = STOP, talk to the sales person
 *          3. tools + supplies        -> No = STOP, add what's missing to the Order Supplies List (E-163 digitizes it later)
 *          4. screen print: grams of ink MIXED per Pantone -> PANTONE_n / PANTONE_n_Mixed (codes from the order, E-159)
 *   ANY TIME after the artwork check: missing / damaged garments (Missing Garments + Reorder Needed), Call Client (+ notes)
 *   CLOSE  David's questions, each a required Yes (v1: a No blocks closing); screen print adds the Pantone question with grams LEFT
 *          per Pantone; feedback per task -> the department's open work tasks closed -> when no work task is left open on the Deal and
 *          the Deal is in a production stage, the stage moves to Quality Check.
 *
 * Every answer goes on a dated "PRODUCTION FLOW" note, which is also how a reopened card knows a department already started.
 * The steps and questions are DATA (below), so later rounds add a department's checks without new code.
 * Pure: no React, no ZOHO. Tested in productionFlow.test.js.
 */
import { colorModeFor, readInkText } from "../colorLibrary";
import { parseSizeText } from "../sizeRows";

const str = (v) => (v == null ? "" : String(v));

export const FLOW_NOTE_TITLE = "PRODUCTION FLOW";
export const BLOCK_TEXT = "Please ensure that step is completed before closing the task.";

/* ---------- departments: which card tab, which tasks ---------- */
export const DEPARTMENTS = {
  screen: { key: "screen", label: "Screen Print", card: "production-card-screenprint.html", inks: true },
  embroidery: { key: "embroidery", label: "Embroidery", card: "production-card-embroidery.html", inks: false },
  vinyl: { key: "vinyl", label: "Vinyl", card: "production-card-vinyl.html", inks: false },
  /* E-164 (D-75): the Production Manager's packing step for outsourced products. No start steps; David's two close questions only. */
  outsourced: { key: "outsourced", label: "Outsourced", card: "production-card-outsourced.html", inks: false, start: false },
};
export const deptForCard = (cardName) => Object.values(DEPARTMENTS).find((d) => d.card === str(cardName).toLowerCase()) || null;
/* The card tab's flow, if any: the Outsourced tab only while its switch is on (productionConfig.json outsourcedOn). */
export const outsourcedOn = (config) => !!config && config.outsourcedOn === true;
export const flowDeptFor = (cardName, config) => {
  const d = deptForCard(cardName);
  return d && d.key === "outsourced" && !outsourcedOn(config) ? null : d;
};

/* The English half of a bilingual subject, upper-cased, without "RUSH: ". */
const englishHalf = (subject) =>
  str(subject)
    .split(" / ")[0]
    .trim()
    .toUpperCase()
    .replace(/^RUSH:\s*/, "");

/*
 * A production WORK task and its department, from the subject (measured 10-29 on every task since 09-15):
 *   EMBROIDERY: Produce Order · SCREEN PRINT(ING): Produce Order · VINYL DEPARTMENT[: DTF | DTG | DECALS | ...]: Produce Order
 *   and the same with Reproduce Order (revisions) / Correct Order (corrections), with or without "RUSH: ".
 * E-164: "PRODUCTION MANAGER: Package Outsourced Products" is the Outsourced tab's work task (the fulfill step, made when the order
 * task is completed; Deluge evidence 10-29, subjects confirmed unchanged by Deluge E-165).
 * Anything else (Emulsion Screens, Quality Check, Order Products, manager tasks) is not a work task -> null.
 */
export function deptOfTask(subject) {
  const s = englishHalf(subject);
  if (s === "PRODUCTION MANAGER: PACKAGE OUTSOURCED PRODUCTS") return "outsourced";
  if (!/: (PRODUCE|REPRODUCE|CORRECT) ORDER$/.test(s)) return null;
  if (/^EMBROIDERY:/.test(s)) return "embroidery";
  if (/^SCREEN PRINT(ING)?:/.test(s)) return "screen";
  if (/^VINYL DEPARTMENT:/.test(s)) return "vinyl";
  return null;
}
const isOpen = (t) => t && t.id && !/^completed$/i.test(str(t.Status).trim());
/* withOutsourced false = round 1 as before: the Package task is not counted (switch off). */
export const openWorkTasks = (tasks, withOutsourced = false) =>
  (tasks || []).filter((t) => {
    const d = isOpen(t) && deptOfTask(t.Subject);
    return !!d && (withOutsourced || d !== "outsourced");
  });
export const openDeptTasks = (tasks, dept) => (tasks || []).filter((t) => isOpen(t) && deptOfTask(t.Subject) === dept);

/*
 * E-164 / D-75 (David 10-29, "Order + Package"): the outsourced ORDER task, "OUTSOURCED: Order Products" (+ "RUSH: ", + "OUTSOURCED:
 * PATCHES: "), holds the move to Quality Check too, but is the Account Manager's job, so it is never closed from a card. The Account
 * Manager's parallel "ACCOUNT MANAGER: OUTSOURCED: Order Outsourced Product" is NOT counted (a duplicate, E-165).
 */
export const isOrderProductsTask = (subject) => /^OUTSOURCED: (PATCHES: )?ORDER PRODUCTS$/.test(englishHalf(subject));
export const openOrderTasks = (tasks) => (tasks || []).filter((t) => isOpen(t) && isOrderProductsTask(t.Subject));
/* Every open task that keeps the Deal out of Quality Check. */
export const openHoldTasks = (tasks, withOutsourced = false) => [
  ...openWorkTasks(tasks, withOutsourced),
  ...(withOutsourced ? openOrderTasks(tasks) : []),
];
export const ownerOf = (t) => ({ id: str(t && t.Owner && t.Owner.id), name: str(t && t.Owner && t.Owner.name) });
export const taskTitle = (t) => str(t && t.Subject).split(" / ")[0].trim();

/* ---------- the steps (data) ---------- */
export const START_STEPS = [
  {
    key: "count",
    question: "Initial count done: all garments / products are here, counted and sorted, and ready for this job?",
    stop: "Stop: don't start until everything is here. If something is missing or damaged, use \"Missing or damaged garments\" below.",
  },
  {
    key: "artwork",
    question:
      "Print-ready artwork and placement verified with the mock-up and the original art, with a critical eye (no errors, no drift from the original)?",
    stop: "Stop and talk to the sales person before you go on. Use \"Call Client\" below to flag it if the client needs to be asked.",
  },
  {
    key: "tools",
    question: "Tools and supplies available and ready?",
    stop: "Stop: add what's missing to the Order Supplies List, then come back when it's here.",
  },
];

/* David's Close Task questions, word for word (10-29). Each must be Yes. */
export const CLOSE_QUESTIONS = [
  { key: "sorted", question: "Garments counted and sorted by size?" },
  {
    key: "standards",
    question: "Job completed according to mock-up and standards, ensuring no drift from original artwork unless approved by client?",
  },
  { key: "clean", question: "Work space cleaned up and ready for next job?" },
  { key: "stocked", question: "Products stocked, with any needs recorded for Inventory Ordering?" },
];
export const DEPT_CLOSE_QUESTIONS = {
  screen: [{ key: "pantones", question: "PANTONE amounts mixed and left over recorded in CRM?" }],
  embroidery: [],
  vinyl: [],
};
/* E-164: David's two questions for the Outsourced tab, word for word (10-29, "Only those two for now"). They replace the four. */
export const OUTSOURCED_CLOSE_QUESTIONS = [
  { key: "verified", question: "Products counted and verified against mock-up and original artwork?" },
  { key: "boxed", question: "Products removed from supplier boxes and put into Print Plug / unbranded boxes?" },
];
export const closeQuestionsFor = (dept) =>
  dept === "outsourced" ? [...OUTSOURCED_CLOSE_QUESTIONS] : [...CLOSE_QUESTIONS, ...(DEPT_CLOSE_QUESTIONS[dept] || [])];
export const hasStartSteps = (dept) => !!DEPARTMENTS[dept] && DEPARTMENTS[dept].start !== false;

export const MISSING_REASONS = [
  "Supplier sent the wrong item",
  "Supplier shorted us",
  "Damaged (holes, stains, flaws)",
  "Ordered wrong",
  "Other",
];

/* ---------- Pantones on the order (E-159 / E-160) ---------- */
/*
 * The Pantone codes in the order's screen print "Colors Used" answers, in order of first appearance: [{ code, where[] }].
 * House inks (in stock, no mixing) and HEX colors are not Pantones and are left out (David: "just the pantone code").
 */
export function pantonesOf(data) {
  const out = [];
  const seen = new Map();
  const add = (text, where) =>
    readInkText(text).forEach((it) => {
      if (it.type !== "pantone" || !it.color || !it.color.code) return;
      const code = str(it.color.code);
      if (!seen.has(code)) {
        seen.set(code, { code, where: [] });
        out.push(seen.get(code));
      }
      if (!seen.get(code).where.includes(where)) seen.get(code).where.push(where);
    });
  ((data && data.products) || []).forEach((p) => {
    if (!p || colorModeFor(p.productName) !== "ink") return;
    if (p.productType === "garment")
      (p.primaryBranches || []).forEach((g, gi) =>
        ((g && g.secondaryBranches) || []).forEach((gr, si) => add(gr && gr.colorsUsed, `Garment ${gi + 1} - Graphic ${si + 1}`))
      );
    else if (p.productType === "nongarment") (p.branches || []).forEach((gr, si) => add(gr && gr.colorsUsed, `Graphic ${si + 1}`));
  });
  return out;
}

export const PANTONE_SLOTS = 8;
const slotField = (n, part) => `PANTONE_${n}${part ? "_" + part : ""}`;
const sameCode = (a, b) => str(a).trim().toUpperCase().replace(/^PANTONE\s+/, "") === str(b).trim().toUpperCase().replace(/^PANTONE\s+/, "");

/*
 * Which Deal slot each Pantone uses: a code already in a slot keeps it; new codes take the first empty slots. More than 8 -> slot null
 * (recorded on the flow's note instead). Returns [{ code, slot, mixed, left }] with the Deal's current grams.
 */
export function pantoneSlots(deal, pantones) {
  const d = deal || {};
  const taken = new Set();
  const rows = (pantones || []).map((p) => {
    for (let n = 1; n <= PANTONE_SLOTS; n++) {
      if (sameCode(d[slotField(n)], p.code)) {
        taken.add(n);
        return { code: p.code, slot: n };
      }
    }
    return { code: p.code, slot: null };
  });
  rows.forEach((r) => {
    if (r.slot) return;
    for (let n = 1; n <= PANTONE_SLOTS; n++) {
      if (!taken.has(n) && !str(d[slotField(n)]).trim()) {
        taken.add(n);
        r.slot = n;
        return;
      }
    }
  });
  return rows.map((r) => ({
    ...r,
    mixed: r.slot != null && d[slotField(r.slot, "Mixed")] != null ? Number(d[slotField(r.slot, "Mixed")]) : null,
    left: r.slot != null && d[slotField(r.slot, "Left")] != null ? Number(d[slotField(r.slot, "Left")]) : null,
  }));
}

/*
 * E-159 (David 10-29): onboarding / the Amendment Form put the order's screen print Pantone codes on the Deal (code only). A code
 * already in a slot keeps it, new ones take empty slots, nothing is ever blanked. Returns only the fields that change.
 */
export function pantoneCodeFields(deal, data) {
  const fields = {};
  pantoneSlots(deal, pantonesOf(data)).forEach((r) => {
    if (r.slot && str((deal || {})[slotField(r.slot)]).trim() !== r.code) fields[slotField(r.slot)] = r.code;
  });
  return fields;
}
export const writePantonesOn = (config) => !!config && config.writePantones === true;

/* Grams typed by the agent: a number 0 or more, or null when blank / not a number. */
export const grams = (v) => {
  const t = str(v).trim().replace(/,/g, "").replace(/\s*g$/i, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
};

/* The Deal fields for one set of grams: { PANTONE_n: code, PANTONE_n_<part>: grams } ("Mixed" at the start, "Left" at close). */
export function pantoneFields(rows, part, typed) {
  const fields = {};
  (rows || []).forEach((r, i) => {
    if (!r.slot) return;
    const g = grams(typed && typed[i]);
    fields[slotField(r.slot)] = r.code;
    if (g != null) fields[slotField(r.slot, part)] = g;
  });
  return fields;
}

/* ---------- missing / damaged garments ---------- */
/* What the order holds, for the picker: [{ garment, rows: [{ color, size, count }] }] (garment = the Garment Type's first line). */
export function orderGarments(data) {
  const out = [];
  ((data && data.products) || []).forEach((p) => {
    if (!p || p.productType !== "garment") return;
    (p.primaryBranches || []).forEach((b, i) => {
      if (!b) return;
      const name = str(b.garmentType).split("\n")[0].trim() || `${p.productName} garment ${i + 1}`;
      const rows = parseSizeText(b.countColorSize).rows.map((r) => ({ color: str(r.color), size: str(r.size), count: Number(r.count) || 0 }));
      out.push({ garment: name, rows });
    });
  });
  return out;
}

/* One dated Missing Garments line: "[2026-10-29 Mastin] 2 x Gildan 5000 Black L - Supplier shorted us. <note>" */
export function missingLine({ quantity, garment, color, size, reason, note, who, date }) {
  const what = [garment, color, size].map(str).filter(Boolean).join(" ");
  const tail = [str(reason).trim(), str(note).trim()].filter(Boolean).join(". ");
  return `[${str(date)}${who ? " " + str(who) : ""}] ${Number(quantity) || 0} x ${what}${tail ? " - " + tail : ""}`;
}
export const appendDated = (prior, line) => (str(prior).trim() ? str(prior).replace(/\s+$/, "") + "\n" + line : line);

/*
 * A box whose rule fires on each tick (Reorder Needed since 10-29; Call Client once David sets repeat on): already ticked -> untick
 * first (no workflow), then tick with workflow, so the task is made again. Returns the two writes in order.
 */
export const reTick = (field, ticked) => [
  ...(ticked ? [{ fields: { [field]: false }, workflow: false }] : []),
  { fields: { [field]: true }, workflow: true },
];

/* ---------- close ---------- */
/* The stages from which the flow moves a finished Deal to Quality Check (others: the stage is left as it is, and the agent told). */
export const PRODUCTION_STAGES = [
  "Mock-Up Approved / In Production",
  "Online Purchase / In Production",
  "Test Garment Approved",
  "Order Needs Revisions",
  "Order Needs Corrections",
];
export const QC_STAGE = "Quality Check";

/*
 * What Close does: { problems[], close[] (task ids), stage: { move, to, reason }, fields }.
 * answers = { questionKey: "yes" | "no" }; closing = ids of the department's tasks the agent is closing; inkLeft = grams typed per row.
 */
export function closePlan({ dept, tasks, closing, answers, rows, inkLeft, stage, withOutsourced = false }) {
  const problems = [];
  closeQuestionsFor(dept).forEach((q) => {
    const a = str(answers && answers[q.key]);
    if (a === "no") problems.push(`${q.question} - ${BLOCK_TEXT}`);
    else if (a !== "yes") problems.push(`Answer: ${q.question}`);
  });
  const ids = (closing || []).map(str);
  if (!ids.length) problems.push("Tick the task(s) you are closing.");
  if (DEPARTMENTS[dept] && DEPARTMENTS[dept].inks)
    (rows || []).forEach((r, i) => {
      if (grams(inkLeft && inkLeft[i]) == null) problems.push(`Grams of ink left for Pantone ${r.code}.`);
    });
  const stillOpen = openHoldTasks(tasks, withOutsourced).filter((t) => !ids.includes(str(t.id)));
  const outsourcedOpen = stillOpen.some((t) => deptOfTask(t.Subject) === "outsourced" || isOrderProductsTask(t.Subject));
  const cur = str(stage);
  let move = { move: false, to: QC_STAGE, reason: "" };
  if (stillOpen.length)
    move.reason = `${stillOpen.length} ${outsourcedOpen ? "production or outsourced" : "production"} task(s) still open: ${stillOpen.map(taskTitle).join("; ")}`;
  else if (cur === QC_STAGE) move.reason = "already in Quality Check";
  else if (!PRODUCTION_STAGES.includes(cur)) move.reason = `the Deal is at "${cur}", not a production stage - the stage is left as it is`;
  else move = { move: true, to: QC_STAGE, reason: "" };
  const fields = DEPARTMENTS[dept] && DEPARTMENTS[dept].inks ? pantoneFields(rows, "Left", inkLeft) : {};
  return { problems, close: ids, stage: move, fields, stillOpen };
}

/* ---------- the note ---------- */
const yn = (a) => (a === "yes" ? "Yes" : a === "no" ? "No" : "-");
const inkLines = (rows, typed, word) =>
  (rows || [])
    .map((r, i) => {
      const g = grams(typed && typed[i]);
      return g == null ? "" : `  Pantone ${r.code}: ${g} g ${word}${r.slot ? "" : " (no free PANTONE slot on the Deal - recorded here only)"}`;
    })
    .filter(Boolean);

/* "Screen Print · STARTED" note: the start answers and the grams mixed. */
export function startNote({ dept, who, when, answers, rows, inkMixed }) {
  const d = DEPARTMENTS[dept];
  const lines = [`${d ? d.label : dept} - STARTED - ${str(when)}${who ? " - " + str(who) : ""}`];
  START_STEPS.forEach((s) => lines.push(`${s.question} ${yn(answers && answers[s.key])}`));
  const ink = inkLines(rows, inkMixed, "mixed");
  if (ink.length) lines.push("Ink mixed:", ...ink);
  return lines.join("\n");
}

/* "Screen Print · CLOSED" note: tasks closed, the answers, grams left, feedback per task, what happened to the stage. */
export function closeNote({ dept, who, when, tasks, closing, answers, rows, inkLeft, feedback, stage }) {
  const d = DEPARTMENTS[dept];
  const byId = new Map((tasks || []).map((t) => [str(t.id), t]));
  const lines = [`${d ? d.label : dept} - CLOSED - ${str(when)}${who ? " - " + str(who) : ""}`];
  (closing || []).forEach((id) => {
    const t = byId.get(str(id));
    lines.push(`Closed: ${t ? taskTitle(t) : id}${t && ownerOf(t).name ? " (" + ownerOf(t).name + ")" : ""}`);
    const f = str(feedback && feedback[id]).trim();
    if (f) lines.push(`  Feedback: ${f}`);
  });
  closeQuestionsFor(dept).forEach((q) => lines.push(`${q.question} ${yn(answers && answers[q.key])}`));
  const ink = inkLines(rows, inkLeft, "left");
  if (ink.length) lines.push("Ink left:", ...ink);
  if (stage) lines.push(stage.move ? `Deal moved to ${stage.to}.` : `Stage not moved: ${stage.reason}.`);
  return lines.join("\n");
}

/* Short dated lines for the in-between actions (missing garments, Call Client), also kept on the flow note. */
export const actionNote = (dept, when, who, text) =>
  `${(DEPARTMENTS[dept] && DEPARTMENTS[dept].label) || dept} - ${str(when)}${who ? " - " + str(who) : ""}\n${str(text)}`;

/*
 * Has this department started since its last close? Reads the PRODUCTION FLOW notes (newest first by Created_Time):
 * the newest "<Dept> - STARTED" / "<Dept> - CLOSED" line decides.
 */
export function deptStarted(notes, dept) {
  const label = (DEPARTMENTS[dept] || {}).label || dept;
  const mine = (notes || [])
    .filter((n) => n && n.Note_Title === FLOW_NOTE_TITLE)
    .map((n) => ({ t: str(n.Created_Time), first: str(n.Note_Content).split("\n")[0] }))
    .filter((n) => n.first.startsWith(label + " - STARTED") || n.first.startsWith(label + " - CLOSED"))
    .sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
  return !!mine.length && mine[0].first.startsWith(label + " - STARTED");
}
