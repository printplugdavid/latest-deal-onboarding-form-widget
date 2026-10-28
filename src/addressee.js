/*
 * E-130 / D-66 (David with the team, 2026-10-28): "primarily they are wanting the Addressee to fill in for any order that needs
 * shipping, including from Inksoft purchases." The Deal's Addressee is ONE line (CRM text field, 255 characters). The form writes the
 * ship-to typed under "Do Products Need Shipped?" = Yes, joined with commas ("Name, Street, City, ST ZIP") -- the style the QC form
 * splits (qc/qcRules.js splitAddress splits only on commas).
 *
 * Rules: the newest address wins (a different Addressee is replaced and the rep is told what it was); a pickup or an empty address
 * never blanks it; any stage (nothing reacts to Addressee, and the write goes with Trigger: []). "Shipped?" is NOT touched here -- it
 * means "has shipped" and the QC form ticks it with the tracking number.
 * Used by the onboarding Submit, the Amendment Form, and the InkSoft robot (onlineOrder/index.js buildForOrder -> addressee).
 */

export const ADDRESSEE_FIELD = "Addressee";
export const ADDRESSEE_MAX = 255;

const str = (v) => (v == null ? "" : String(v));

// "Jane Doe\n123 Main St\nBoise, ID 83702" -> "Jane Doe, 123 Main St, Boise, ID 83702". Empty pieces and doubled commas drop out.
export function addresseeLine(text) {
  return str(text)
    .split(/\r?\n|,/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ");
}

const same = (a, b) => addresseeLine(a).toLowerCase() === addresseeLine(b).toLowerCase();

/*
 * What the Deal's Addressee should become after this Submit / Amendment save.
 * -> { change, value, was, cut, message }. `message` is for the rep ("" when there is nothing to say).
 */
export function addresseePlan(deal, data) {
  const none = { change: false, value: "", was: str(deal?.[ADDRESSEE_FIELD]), cut: false, message: "" };
  if (str(data?.doProductsNeedShipped).trim() !== "Yes") return none;
  let value = addresseeLine(data?.shippingContactAddress);
  if (!value) return none;
  const was = str(deal?.[ADDRESSEE_FIELD]).trim();
  if (same(value, was) && !(value.length > ADDRESSEE_MAX)) return { ...none, value };
  let cut = false;
  if (value.length > ADDRESSEE_MAX) {
    value = value.slice(0, ADDRESSEE_MAX).replace(/[,\s]+$/, "");
    cut = true;
    if (value === was) return { ...none, value };
  }
  const notes = [];
  if (was) notes.push("The Deal's Addressee was changed to the ship-to address on this form: " + value + "\n(It was: " + was + ")");
  if (cut) notes.push("The ship-to address is longer than the Deal's Addressee can hold (" + ADDRESSEE_MAX + " characters), so the end was cut off. Please check the Addressee on the Deal.");
  return { change: true, value, was, cut, message: notes.join("\n\n") };
}

/*
 * Amendment Form only: did THIS amendment change the ship-to (the address, or "Do Products Need Shipped?" turned to Yes)? An amendment
 * saved for another reason must not put the onboarding address back over one corrected later (e.g. at quality check).
 */
export function shipToChanged(before, after) {
  if (str(after?.doProductsNeedShipped).trim() !== "Yes") return false;
  if (str(before?.doProductsNeedShipped).trim() !== "Yes") return true;
  return !same(before?.shippingContactAddress, after?.shippingContactAddress);
}
