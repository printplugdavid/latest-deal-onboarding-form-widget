/*
 * stageMove.js -- which Stage the form moves the Deal to after a submit (D-27, 2026-10-01).
 *
 * Until now Stage was manual (David, 2026-09-02: "so agents never wait on a delayed window").
 * In practice agents forgot it -- and with no stage change the Deluge never runs, so no reorder or
 * reproduce task is created. Worse, the stage moved by hand WITHOUT the form is exactly the path
 * that produced the wrong and blank agents. So the form now moves it, LAST, after every field and
 * the note are written: the Deluge fires on the stage change and reads what the form wrote.
 *
 * Stage names are CRM's own (measured 2026-10-01). The REVISION targets are exactly the three
 * values the workflow rule "DEAL STAGE: Order Needs Revisions" fires on -- read verbatim by the
 * Deluge thread 2026-10-01: "Order Needs Revisions, SCHOOL: Order Revisions, ADVERTISER: Issues".
 * So an advertiser REVISION moves to "ADVERTISER: Issues". There is no advertiser stage for a
 * CORRECTION, and the mixed "SCHOOL/ ADVERTISER" / "SCHOOL ADVERTISER -" stages belong to neither
 * family cleanly, so those are left to a human rather than guessed.
 */
const TARGETS = {
  standard: { Revision: "Order Needs Revisions", Correction: "Order Needs Corrections" },
  school: { Revision: "SCHOOL: Order Revisions", Correction: "SCHOOL: Order Corrections" },
  advertiser: { Revision: "ADVERTISER: Issues" }, // no Correction equivalent exists
};

// Returns { move: true, stage } or { move: false, reason: "already" | "advertiser" | "unknown-type", stage? }
export function targetStage(formType, currentStage) {
  const cur = String(currentStage || "").trim();
  if (formType !== "Revision" && formType !== "Correction") return { move: false, reason: "unknown-type" };
  if (/^SCHOOL\s*\/\s*ADVERTISER/i.test(cur) || /^SCHOOL ADVERTISER/i.test(cur)) {
    return { move: false, reason: "advertiser" };
  }
  const family = /^ADVERTISER:/i.test(cur) ? TARGETS.advertiser : /^SCHOOL:/i.test(cur) ? TARGETS.school : TARGETS.standard;
  const stage = family[formType];
  if (!stage) return { move: false, reason: "advertiser" };
  // Zoho fires nothing when a field is "updated" to the value it already has, so say so plainly
  // instead of pretending the move happened.
  if (cur === stage) return { move: false, reason: "already", stage };
  return { move: true, stage };
}

/*
 * E-169 / D-80 (David 2026-10-30): every revision / correction pass makes its own redo tasks, dictated by the form, and nobody moves a
 * stage by hand. A pass filed while the Deal ALREADY sits at its revision / correction stage changes no stage, so the stage rule never
 * fires. Then (and only then) the form unticks and ticks the hidden Deal box Added_Revision; Deluge's field-update rule (repeat ON) runs
 * the same task handler. Never when the stage moved: that already ran the rule, and a tick as well would make the pass's tasks twice.
 */
export const ADDED_REVISION_FIELD = "Added_Revision";

// Stages Deluge's rule "PRODUCTION: Added Revision" (5249739000129105086) acts on (their docs/60, read back 10-30). SCHOOL: Order
// Corrections is NOT wired (that stage has its own older rule): the form never ticks there and keeps "tell the production manager".
export const ADDED_REVISION_STAGES = [
  "Order Needs Revisions",
  "SCHOOL: Order Revisions",
  "ADVERTISER: Issues",
  "Order Needs Corrections",
];

export function needsAddedRevision(target) {
  return !!target && target.move === false && target.reason === "already" && ADDED_REVISION_STAGES.includes(target.stage);
}

// Untick with no workflow, then tick with workflow (the form's copy of the Deal can be stale, and ticking a ticked box fires nothing).
// Returns true when the tick was saved. Never throws.
export async function tickAddedRevision(zoho, entity, recordId) {
  const write = (value, trigger) =>
    zoho.CRM.API.updateRecord({ Entity: entity, APIData: { id: recordId, [ADDED_REVISION_FIELD]: value }, Trigger: trigger });
  try {
    await write(false, []);
  } catch (err) {
    console.log("Added Revision not unticked:", err);
  }
  try {
    const r = await write(true, ["workflow"]);
    if (r?.data?.[0]?.code === "SUCCESS") return true;
    console.log("Added Revision not ticked:", r);
  } catch (err) {
    console.log("Added Revision not ticked:", err);
  }
  return false;
}
