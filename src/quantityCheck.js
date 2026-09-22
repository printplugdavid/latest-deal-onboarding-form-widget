/*
 * quantityCheck.js -- does the free-text size breakdown add up to the garment quantity?
 *
 * Why: "Total Garment Quantity" is the single number the print-count engine multiplies by, and
 * nothing checked it. Agents have submitted forms where the individual garments listed in
 * "Total Count, Colors & Sizes" don't add up to that total (David, 2026-09-22), and on
 * Stephanie McBride Deal 2 a total typed for the whole order became 14x the real count
 * (docs/03, 2026-09-22 (6)). The number cannot be validated from the CRM side afterwards, so it
 * has to be questioned while the agent is still in the form.
 *
 * This only ever WARNS. The breakdown is free text and agents legitimately write things it cannot
 * parse, so a hard block would stop real work. Pure: no React, no ZOHO -- the form shows it live and
 * onSubmit prints the same finding in the note.
 */

// Size names that start with a digit -- 2XL, 3X, 4 XL. Those digits are not quantities.
const SIZE_TOKEN = /\b\d+\s*X+\s*L?\b/gi;
// A number that is a measurement, not a count: 3.5", 12”, 6 inch, 10 inches.
const MEASUREMENT = /\b\d+(\.\d+)?\s*(?:"|”|''|'|in\b|inch\w*)/gi;
const DECIMAL = /\b\d+\.\d+\b/g;

/*
 * Sum the counts in a free-text size breakdown.
 * "Black 5- Small, 5- Medium, 7- Large, 6- XL, 1- 4XL"  -> 24
 * '3.5" wide - QTY - 11, 6" wide - QTY - 15'            -> 26  (the sizes are ignored)
 * returns { sum, numbers, parsed } -- parsed is false when there was nothing countable
 */
export function sumSizeCounts(text) {
  const raw = String(text == null ? "" : text);
  const cleaned = raw.replace(MEASUREMENT, " ").replace(SIZE_TOKEN, " ").replace(DECIMAL, " ");
  const numbers = (cleaned.match(/\b\d+\b/g) || []).map((n) => parseInt(n, 10)).filter((n) => n > 0);
  const sum = numbers.reduce((a, b) => a + b, 0);
  return { sum, numbers, parsed: numbers.length > 0 };
}

/*
 * Compare one garment row's breakdown against its stated total.
 * Returns null when there is nothing to say -- no total yet, or nothing countable in the text.
 * Otherwise { sum, total, difference, message }.
 */
export function checkGarmentQuantity(countColorSize, garmentQuantity) {
  const total = parseInt(garmentQuantity, 10);
  if (isNaN(total) || total <= 0) return null;
  const { sum, parsed } = sumSizeCounts(countColorSize);
  if (!parsed || sum === total) return null;
  const difference = sum - total;
  return {
    sum,
    total,
    difference,
    message:
      `The sizes listed add up to ${sum}, but Total Garment Quantity is ${total}` +
      ` (${difference > 0 ? "+" : ""}${difference}). Check that no garment is missing from either one.`,
  };
}
