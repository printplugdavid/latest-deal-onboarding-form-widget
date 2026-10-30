/*
 * proofs.js -- E-174 / D-83 (David 10-30): the test garment (proof print) step of each department's production flow, between Start and
 * Close. "Test garment approved" means the first piece -- the proof print -- passed and production keeps going.
 *
 *   - One approval per GARMENT on the department's card, covering all its graphics ("Yes, per garment"); a non-garment item (stickers,
 *     decals, banners ...) or a gang sheet gets one approval each.
 *   - Each approval is a dated "PRODUCTION FLOW" note: "<Dept> - PROOF APPROVED - <when> - <who>" + "Approved: <item>" lines. No new
 *     Deal field (David: "perfect").
 *   - When every proof of a department is approved, that department goes into the Deal's multi-select Test_Garments_Approved (labels:
 *     Screen Print, Embroidery, DTG, DTF, Stickers, Decals, Outsourced).
 *   - When every proof on the ORDER is approved ("When all approved"), the Deal moves to "Test Garment Approved" (with workflow, so its
 *     date stamp runs) -- only from Mock-Up Approved / In Production or Online Purchase / In Production; from any other stage the proofs
 *     are recorded and the stage stays.
 *   - A department's Close waits for its proofs ("Yes, wait for proofs").
 * The Outsourced and Graphic Design tabs have no proof step. Pure: no React, no ZOHO.
 */
import { cardRouteOf } from "../productionCards";
import { DEPARTMENTS, FLOW_NOTE_TITLE } from "./productionFlow";

const str = (v) => (v == null ? "" : String(v));

export const PROOF_DEPTS = ["screen", "embroidery", "vinyl"];
const CARD_FOR_DEPT = { screen: "screenprint", embroidery: "embroidery", vinyl: "vinyl" };
export const TEST_GARMENT_STAGE = "Test Garment Approved";
export const TEST_GARMENT_FIELD = "Test_Garments_Approved";
/* The stages a finished set of proofs moves the Deal from (D-83). */
export const TEST_GARMENT_FROM = ["Mock-Up Approved / In Production", "Online Purchase / In Production"];

export const proofStepOn = (config) => !!config && config.proofStepOn === true;

const short = (s, n) => {
  const t = str(s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trim() + "…" : t;
};
/* What a garment's graphics are, for its label: each graphic's placements (else its description). */
const graphicsOf = (g) =>
  (g.secondaryBranches || [])
    .map((gr) => {
      const where = (gr && gr.tartiaryBranches ? gr.tartiaryBranches : []).map((p) => str(p && p.placementLocation).trim()).filter(Boolean);
      return where.length ? where.join(" + ") : short(gr && gr.graphicDescription, 40);
    })
    .filter(Boolean);

/*
 * The proofs a department's card needs, in card order: [{ key, label }]. key = the label in lower case (+ " #2" for a repeat), so an
 * approval survives a re-read of the order but a garment that was changed by an amendment needs a new proof.
 */
export function proofItems(data, dept) {
  const card = CARD_FOR_DEPT[dept];
  if (!card) return [];
  const out = [];
  const seen = {};
  const add = (label) => {
    const base = label.toLowerCase();
    seen[base] = (seen[base] || 0) + 1;
    out.push({ key: seen[base] > 1 ? `${base} #${seen[base]}` : base, label: seen[base] > 1 ? `${label} #${seen[base]}` : label });
  };
  ((data && data.products) || []).forEach((p) => {
    if (!p) return;
    const route = cardRouteOf(p);
    if (!route || route.card !== card) return;
    if (p.productType === "garment") {
      (p.primaryBranches || []).forEach((g, i) => {
        if (!g) return;
        const name = str(g.garmentType).split("\n")[0].trim() || `${str(p.productName)} garment ${i + 1}`;
        const gr = graphicsOf(g);
        add(`${name}${gr.length ? " (" + gr.join(" + ") + ")" : ""}`);
      });
    } else if (p.productType === "gangsheet") {
      add("DTF Gang Sheet");
    } else {
      add(`${str(p.productName).trim() || "Item"}${str(p.dimensions).trim() ? " (" + str(p.dimensions).trim() + ")" : ""}`);
    }
  });
  return out;
}

const deptLabel = (dept) => (DEPARTMENTS[dept] || {}).label || dept;
const HEAD = (dept) => `${deptLabel(dept)} - PROOF APPROVED - `;

/* The note for one approval (or several ticked at once). */
export function proofNote({ dept, who, when, labels }) {
  return [`${HEAD(dept)}${str(when)}${who ? " - " + str(who) : ""}`, ...(labels || []).map((l) => `Approved: ${l}`)].join("\n");
}

/* Every approval on the Deal for a department: Map(key -> { label, who, when }). Reads the PRODUCTION FLOW notes. */
export function proofApprovals(notes, dept) {
  const map = new Map();
  (notes || [])
    .filter((n) => n && n.Note_Title === FLOW_NOTE_TITLE)
    .map((n) => ({ t: str(n.Created_Time), lines: str(n.Note_Content).replace(/<br\s*\/?>/gi, "\n").split("\n") }))
    .filter((n) => n.lines[0].startsWith(HEAD(dept)))
    .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0))
    .forEach((n) => {
      const rest = n.lines[0].slice(HEAD(dept).length);
      const i = rest.indexOf(" - ");
      const when = i >= 0 ? rest.slice(0, i) : rest;
      const who = i >= 0 ? rest.slice(i + 3) : "";
      n.lines.slice(1).forEach((l) => {
        const m = /^Approved: (.+)$/.exec(l.trim());
        if (m && !map.has(m[1].trim().toLowerCase())) map.set(m[1].trim().toLowerCase(), { label: m[1].trim(), who, when });
      });
    });
  return map;
}

/* A department's proofs: { items: [{ key, label, approved: {who, when} | null }], left: [labels], done } (done = none left). */
export function proofStatus(data, notes, dept) {
  const approvals = proofApprovals(notes, dept);
  const items = proofItems(data, dept).map((it) => ({ ...it, approved: approvals.get(it.key) || null }));
  const left = items.filter((it) => !it.approved).map((it) => it.label);
  return { items, left, done: items.length > 0 && left.length === 0 };
}

/* The Test_Garments_Approved labels for a department's card (vinyl: by the jobs on it; HTV, banners ... have no label). */
const VINYL_LABEL = { DTG: "DTG", DTF: "DTF", "DTF Gang Sheet": "DTF", Stickers: "Stickers", Decals: "Decals" };
export function testGarmentLabels(data, dept) {
  if (dept === "screen") return ["Screen Print"];
  if (dept === "embroidery") return ["Embroidery"];
  if (dept !== "vinyl") return [];
  const out = [];
  ((data && data.products) || []).forEach((p) => {
    const r = p && cardRouteOf(p);
    const l = r && r.card === "vinyl" ? VINYL_LABEL[r.job] : null;
    if (l && !out.includes(l)) out.push(l);
  });
  return out;
}

/*
 * What an approval writes, given the notes INCLUDING the new approval (the caller adds it before asking): { fields, stage: { move, to,
 * reason }, allDone, deptDone }. fields: the department's labels added to Test_Garments_Approved (kept as they were otherwise; only when
 * that department is now done and something is new). stage: moves to Test Garment Approved only when every proof on the order is done.
 */
export function proofWrites({ deal, data, notes, dept }) {
  const mine = proofStatus(data, notes, dept);
  const depts = PROOF_DEPTS.filter((d) => proofItems(data, d).length);
  const allDone = depts.length > 0 && depts.every((d) => proofStatus(data, notes, d).done);
  const fields = {};
  if (mine.done) {
    const before = Array.isArray(deal && deal[TEST_GARMENT_FIELD]) ? deal[TEST_GARMENT_FIELD].map(str) : [];
    const add = testGarmentLabels(data, dept).filter((l) => !before.includes(l));
    if (add.length) fields[TEST_GARMENT_FIELD] = [...before, ...add];
  }
  const cur = str(deal && deal.Stage);
  let stage = { move: false, to: TEST_GARMENT_STAGE, reason: "" };
  if (!allDone) {
    const waiting = depts.filter((d) => !proofStatus(data, notes, d).done).map(deptLabel);
    stage.reason = `waiting for the proofs of ${waiting.join(", ")}`;
  } else if (cur === TEST_GARMENT_STAGE) stage.reason = "already at Test Garment Approved";
  else if (!TEST_GARMENT_FROM.includes(cur)) stage.reason = `the Deal is at "${cur}" - the stage is left as it is`;
  else stage = { move: true, to: TEST_GARMENT_STAGE, reason: "" };
  return { fields, stage, allDone, deptDone: mine.done };
}

/* A note as the CRM would return it, to ask proofWrites "what if this approval were saved". */
export const pendingNote = (content) => ({ Note_Title: FLOW_NOTE_TITLE, Note_Content: content, Created_Time: "9999-12-31T23:59:59" });
