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
