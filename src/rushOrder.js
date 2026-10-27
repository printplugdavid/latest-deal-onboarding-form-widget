/*
 * E-142 (David, 2026-10-27): the onboarding form's rush answer sets the Deal's "Rush Order?" box (`Rush_Order`), both ways.
 * "We charge for rushes": reps no longer tick the box by hand, and a rush fee comes off with a discount, not by unticking.
 *
 * Rush = a hard due date AND "Upcharged For Rush Turnaround Time?" ticked (the same answer that puts PPFEE1 on the invoice).
 *
 * The box picks the rule at the move to "Mock-Up Approved / In Production": RUSH: In Production Master when ticked, the
 * regular one when not (Deluge evidence 2026-10-15). Changing it once that move has happened can fire the RUSH rule later
 * on top of the regular tasks, so the form changes it ONLY while the Deal is in one of the early stages below. Any other
 * stage (production, after, school / advertiser, online, or a stage added later) -> the box is left as it is and the rep
 * is told.
 */
export const RUSH_FIELD = "Rush_Order";

export const RUSH_REMINDER = "We charge for rushes. To take the fee off, add a discount on the invoice.";

/* Stage labels as the API returns them (display values), measured 2026-10-27. */
export const PRE_PRODUCTION_STAGES = [
  "Prospect - Send Invoice",
  "Prospect - Follow Up",
  "Prospect - Invoice Sent",
  "Prospect - Estimate Sent",
  "Prospect - Estimate Converted",
  "Invoice Needs Revisions",
  "Down Payment Rendered - In Design",
  "Payment Deferred - In Design",
  "Design Mock-Up Sent",
  "Mock-Up Needs Revisions",
  "Negotiation/Review",
];

const ticked = (v) => v === true || v === "true" || v === "Yes";

/* What the form's answers say the box should be. */
export const wantsRush = (data) => !!data && data.hardDueDate === "Yes" && ticked(data.upchargedForRushTurnaround);

/*
 * { change, value, blocked, message }
 *   change  -- write `Rush_Order: value` (the box differs from the answer and the Deal is still before production)
 *   blocked -- the box differs but the stage is past that point: nothing is written, `message` is for the rep
 * Nothing to do (box already right): change and blocked both false.
 */
export function rushBoxPlan(deal, data) {
  const value = wantsRush(data);
  const now = !!(deal && deal[RUSH_FIELD] === true);
  if (now === value) return { change: false, value, blocked: false, message: "" };
  const stage = String((deal && deal.Stage) || "").trim();
  if (PRE_PRODUCTION_STAGES.includes(stage)) return { change: true, value, blocked: false, message: "" };
  return {
    change: false,
    value,
    blocked: true,
    message:
      `Rush: your answer says this order is ${value ? "a RUSH" : "NOT a rush"}, but the Deal is at "${stage || "(no stage)"}", ` +
      `so the form did not change its "Rush Order?" box (it is ${now ? "ticked" : "not ticked"}). ` +
      "Tell the production manager. The rest of the form is being saved as normal.",
  };
}
