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
