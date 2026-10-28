/*
 * E-147 (David, 2026-10-28, during E-146): every online-order Deal gets a PO number the team copies onto the supplier order, so the
 * supplier robot (E-146) can match its boxes. David: "start putting E in front of that PO, because eventually it will conflict with our
 * in-store orders once it gets into 4 digits" -> E + (InkSoft order number - 1,000,000):
 *   1000259 -> E259 · 1000999 -> E999 · 1001234 -> E1234 · 1012345 -> E12345 (it never restarts; it only grows a digit).
 * An online reorder is typed E259R by the team. The E-146 Zoho function reads it back the same way (tools/e146-tracking, poTokens).
 * Written by the InkSoft robot when it creates the Deal (field PO_Number). Pure, no imports: bundled into the robot.
 */
export const ONLINE_ORDER_BASE = 1000000;

export function onlinePoNumber(orderId) {
  const s = String(orderId ?? "").trim();
  if (!/^\d+$/.test(s)) return "";
  const n = Number(s) - ONLINE_ORDER_BASE;
  return n > 0 && Number.isSafeInteger(n) ? `E${n}` : "";
}
