import TURNAROUND_CONFIG from "./turnaroundConfig.json";
import { PRE_PRODUCTION_STAGES } from "./rushOrder";
/*
 * E-133 (David, 2026-10-27): the extended-turnaround discount, in one place for the onboarding form, the Amendment
 * Form, the note and the invoice.
 *
 * No hard due date -> one question. Yes = the customer gives us one extra week and the invoice gets 5% off (PPETD,
 * which the draft-invoice function adds). No = the normal 10-14 business days, no discount.
 *
 * Before E-133 it was "Discounts for Extended Turnaround Time?" plus a tick box under each answer, and ticking
 * "10-14 Business Day Turnaround" (shown after a No) also counted as the discount. Old notes still carry those
 * lines; the Amendment Form reads them (noteToForm.js).
 */
export const EXTRA_WEEK_QUESTION = "Add one week to turnaround time for an additional 5% off the invoice?";
export const OLD_DISCOUNT_QUESTION = "Discounts for Extended Turnaround Time?";

/* True when the invoice should get the 5% extended-turnaround discount. */
export const takesExtraWeekDiscount = (d) => !!d && d.hardDueDate === "No" && d.discountsForExtendedTurnaround === "Yes";

/*
 * E-144 (David 10-27; Deluge docs/49): the Deal's Turnaround and Closing Date.
 *
 *   hard due date Yes + rush upcharge  -> Turnaround "Rush",          Closing Date = the due date
 *   hard due date Yes, no rush         -> Turnaround "Hard Due Date", Closing Date = the due date
 *   hard due date No + extra week Yes  -> Turnaround "Extended",      Closing Date = the date picked on the calendar
 *   hard due date No + extra week No   -> Turnaround "Standard",      Closing Date not written (the production master sets it)
 *
 * The calendar runs from the standard date + 1 to + 7 days (default + 7). Standard date = today (America/Denver) + 14
 * weekdays -- the same count as Zoho's addBusinessDay(14) in the Closing Date function (weekdays only, no holidays).
 * Written only before production (same early stages as E-142), Trigger [], and only while turnaroundConfig.json is on.
 */

export const TURNAROUND_FIELD = "Turnaround";
export const CLOSING_FIELD = "Closing_Date";
export const EXTENDED_DATE_LABEL = "Extended Closing Date";
export const turnaroundWriteOn = () => TURNAROUND_CONFIG.writeOnSubmit === true;

const pad = (n) => String(n).padStart(2, "0");
const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/* Today's date in Denver as YYYY-MM-DD. */
export function denverToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(ymd, n) {
  const d = fromYmd(ymd);
  d.setDate(d.getDate() + n);
  return ymdOf(d);
}

export function addWeekdays(ymd, n) {
  const d = fromYmd(ymd);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left -= 1;
  }
  return ymdOf(d);
}

/* The Extended calendar: standard date, earliest and latest pick, and the default (+ 7). */
export function extendedRange(today = denverToday()) {
  const standard = addWeekdays(today, 14);
  return { standard, min: addDays(standard, 1), max: addDays(standard, 7), dflt: addDays(standard, 7) };
}

/* A picker value (dayjs, Date, ISO text, "YYYY/MM/DD" or "YYYY-MM-DD") as YYYY-MM-DD in the rep's own time zone; "" if none. */
export function toYmd(v) {
  if (v == null || v === "") return "";
  if (typeof v === "object" && typeof v.format === "function") return v.isValid && !v.isValid() ? "" : v.format("YYYY-MM-DD");
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = v instanceof Date ? v : new Date(s);
  return Number.isNaN(d.getTime()) ? "" : ymdOf(d);
}

const rushTicked = (v) => v === true || v === "true" || v === "Yes";

/* { turnaround, closingDate } from the answers; turnaround "" when the answers do not say (hard due date blank). */
export function turnaroundOf(data) {
  const d = data || {};
  if (d.hardDueDate === "Yes") return { turnaround: rushTicked(d.upchargedForRushTurnaround) ? "Rush" : "Hard Due Date", closingDate: toYmd(d.dueDate) };
  if (d.hardDueDate === "No") {
    if (d.discountsForExtendedTurnaround === "Yes") return { turnaround: "Extended", closingDate: toYmd(d.extendedClosingDate) };
    if (d.discountsForExtendedTurnaround === "No") return { turnaround: "Standard", closingDate: "" };
  }
  return { turnaround: "", closingDate: "" };
}

/*
 * { fields, blocked, message } for the Deal: `fields` = what to write (Turnaround and/or Closing_Date, only what differs);
 * past the early stages nothing is written and `message` is for the rep.
 */
export function turnaroundPlan(deal, data) {
  const { turnaround, closingDate } = turnaroundOf(data);
  const fields = {};
  if (turnaround && (deal && deal[TURNAROUND_FIELD]) !== turnaround) fields[TURNAROUND_FIELD] = turnaround;
  if (closingDate && toYmd(deal && deal[CLOSING_FIELD]) !== closingDate) fields[CLOSING_FIELD] = closingDate;
  if (!Object.keys(fields).length) return { fields: {}, blocked: false, message: "" };
  const stage = String((deal && deal.Stage) || "").trim();
  if (PRE_PRODUCTION_STAGES.includes(stage)) return { fields, blocked: false, message: "" };
  return {
    fields: {},
    blocked: true,
    message:
      `Turnaround: your answers say "${turnaround}"${closingDate ? ` with a Closing Date of ${closingDate}` : ""}, but the Deal is at ` +
      `"${stage || "(no stage)"}", so the form did not change its Turnaround or Closing Date. Tell the production manager. ` +
      "The rest of the form is being saved as normal.",
  };
}

/* The due date must not be in the past (Denver). */
export const dueDateProblem = (v, today = denverToday()) => {
  const ymd = toYmd(v);
  if (!ymd) return "Required";
  return ymd < today ? "The due date is in the past" : "";
};
