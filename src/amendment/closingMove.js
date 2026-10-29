/*
 * closingMove.js -- E-150 (David 10-29): the Amendment Form's "Dates" answers move the Deal's Closing Date. D-65: this is the only
 * way to move it (no hand edits). Same mapping as onboarding (turnaround.js `turnaroundOf`):
 *
 *   before production  -> the form writes Turnaround + Closing Date itself (and the Rush box, E-142), Trigger [] -- exactly what
 *                         onboarding does; the production master reads them at the In Production move.
 *   in production      -> the Turnaround is written here; the Closing Date goes through the Deluge function MOVE_FUNCTION, which
 *                         saves it (with workflow, for "Needs Pickup") and moves every OPEN Produce Order task by the same number
 *                         of days (David: "they move the same number of days the closing date does as simple math to start";
 *                         "Produce tasks only for now"). Behind turnaroundConfig.json `moveInProduction` until Deluge has built it
 *                         (our docs/83).
 *   any later stage    -> nothing is written; the rep is told.
 *
 * Only when the Dates answers changed in THIS amendment: an amendment about something else never touches the date.
 * No React. Tested in closingMove.test.js.
 */
import TURNAROUND_CONFIG from "../turnaroundConfig.json";
import { CLOSING_FIELD, TURNAROUND_FIELD, toYmd, turnaroundOf, turnaroundPlan } from "../turnaround";
import { PRE_PRODUCTION_STAGES } from "../rushOrder";

export const MOVE_FUNCTION = "WIDGET_Move_Closing_Date";

/* Stages where production tasks exist and may be moved (stage names measured by COQL 2026-10-29). */
export const IN_PRODUCTION_STAGES = ["Mock-Up Approved / In Production", "Online Purchase / In Production"];

export const amendmentDatesOn = () => TURNAROUND_CONFIG.writeOnSubmit === true && TURNAROUND_CONFIG.amendmentDates === true;
export const moveInProductionOn = () => amendmentDatesOn() && TURNAROUND_CONFIG.moveInProduction === true;

const tick = (v) => (v === true || v === "true" || v === "Yes" ? "Yes" : "");
const same = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();

/* True when any Dates answer differs between the onboarding as loaded and as it will be saved. */
export function datesChanged(before, after) {
  const a = before || {};
  const b = after || {};
  return (
    !same(a.hardDueDate, b.hardDueDate) ||
    !same(a.discountsForExtendedTurnaround, b.discountsForExtendedTurnaround) ||
    tick(a.upchargedForRushTurnaround) !== tick(b.upchargedForRushTurnaround) ||
    toYmd(a.dueDate) !== toYmd(b.dueDate) ||
    toYmd(a.extendedClosingDate) !== toYmd(b.extendedClosingDate)
  );
}

/*
 * What to do with the Deal for an amendment's Dates answers:
 *   { kind: "none" }                                         nothing differs from the Deal
 *   { kind: "write", fields }                                write `fields` (Turnaround / Closing_Date), Trigger []
 *   { kind: "move", fields, from, to }                       write `fields` (Turnaround only), then the Deluge move from -> to
 *   { kind: "blocked", fields, message }                     write `fields` if any; the date is NOT moved; `message` is for the rep
 */
export function amendmentDatePlan(deal, data, { moveOn = moveInProductionOn() } = {}) {
  const stage = String((deal && deal.Stage) || "").trim();
  if (PRE_PRODUCTION_STAGES.includes(stage)) {
    const p = turnaroundPlan(deal, data);
    return Object.keys(p.fields).length ? { kind: "write", fields: p.fields } : { kind: "none" };
  }
  const { turnaround, closingDate } = turnaroundOf(data);
  const from = toYmd(deal && deal[CLOSING_FIELD]);
  const fields = {};
  const inProduction = IN_PRODUCTION_STAGES.includes(stage);
  if (inProduction && turnaround && !same(deal && deal[TURNAROUND_FIELD], turnaround)) fields[TURNAROUND_FIELD] = turnaround;
  if (!closingDate || closingDate === from) return Object.keys(fields).length ? { kind: "write", fields } : { kind: "none" };
  if (inProduction && moveOn) return { kind: "move", fields, from, to: closingDate };
  return {
    kind: "blocked",
    fields,
    message: inProduction
      ? `Closing Date: your answers say ${closingDate} (it is ${from || "blank"}), but the Deal is already in production and moving ` +
        "its date and production tasks from this form is not switched on yet. The Closing Date was not changed. Tell the " +
        "production manager. The rest of the amendment is being saved as normal."
      : `Closing Date: your answers say ${closingDate} (it is ${from || "blank"}), but the Deal is at "${stage || "(no stage)"}", ` +
        "past production, so the form did not change it. Tell the production manager. The rest of the amendment is being saved " +
        "as normal.",
  };
}

/* The Deluge answer, read the same careful way as the other widget calls. */
export function readMove(answer) {
  const a = answer || {};
  const moved = Array.isArray(a.moved) ? a.moved : [];
  return {
    ok: a.status === "ok",
    message: String(a.message || ""),
    shiftDays: Number(a.shift_days) || 0,
    before: String(a.closing_before || ""),
    after: String(a.closing_after || ""),
    moved: moved.map((t) => ({ subject: String((t && t.subject) || "").split(" / ")[0], from: String((t && t.from) || ""), to: String((t && t.to) || "") })),
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* One line for the rep, from a read answer: "Closing Date 2026-11-14 → 2026-11-21 (+7 days); 2 production tasks moved: ...". */
export function describeMove(m) {
  const days = m.shiftDays > 0 ? `+${plural(m.shiftDays, "day")}` : `${m.shiftDays < 0 ? "-" : ""}${plural(Math.abs(m.shiftDays), "day")}`;
  const head = `Closing Date ${m.before || "(blank)"} → ${m.after} (${days})`;
  if (!m.moved.length) return head + "; no open production tasks to move";
  return head + `; ${plural(m.moved.length, "open production task")} moved: ` + m.moved.map((t) => `${t.subject} ${t.from} → ${t.to}`).join("; ");
}
