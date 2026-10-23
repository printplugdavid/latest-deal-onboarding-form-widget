/*
 * E-109 / D-53 (David, 10-22; revised 10-23 with the Books thread): screen print has a 12-piece minimum, but under 12 is a rare
 * exception -- priced with the Under-12 rows (tee PPSP2…, hoodie PPSPH32…), FLAGGED to the rep, never blocked. Counted per order:
 * every garment listed under Screen Printing (tees and hoodies together, client-provided included), from Total Garment Quantity or,
 * when that is blank, the size lines. Onboarding form only. Pure.
 */
import CONFIG from "./billingConfig.json";
import { parseSizeText } from "../sizeRows";

export const SCREEN_PRINT_MINIMUM = Number(CONFIG.screenPrintMinimum) || 12;

const count = (b) => {
  const n = parseInt(String((b && b.garmentQuantity) == null ? "" : b.garmentQuantity), 10);
  if (Number.isFinite(n) && n > 0) return n;
  return parseSizeText(b && b.countColorSize).rows.reduce((s, r) => s + (Number(r.count) || 0), 0);
};

/* null when fine (no screen print, or 12+); else { count, minimum, message } -- a warning, not a stop */
export function screenPrintShortfall(data) {
  const garments = ((data && data.products) || [])
    .filter((p) => p && p.productType === "garment" && String(p.productName || "").trim() === "Screen Printing")
    .flatMap((p) => (p.primaryBranches || []).filter(Boolean));
  if (!garments.length) return null;
  const total = garments.reduce((s, b) => s + count(b), 0);
  if (total >= SCREEN_PRINT_MINIMUM) return null;
  return {
    count: total,
    minimum: SCREEN_PRINT_MINIMUM,
    message:
      `Below the ${SCREEN_PRINT_MINIMUM}-piece screen print minimum: this order has ${total} garment${total === 1 ? "" : "s"} under Screen Printing` +
      (total ? "" : " (enter the quantity or sizes)") +
      `. This is an exception, priced at the Under-12 rate. Confirm it with the customer before sending the invoice.`,
  };
}
