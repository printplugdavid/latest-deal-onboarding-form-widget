/*
 * E-121 (David 10-23): what reps SEE for a product type. The stored name (CRM org variable `products`, the note, the JSON, print
 * counts, cards, the invoice, the revision form and the robot) stays "Heat-Transfer"; only the label on screen changes. Garment
 * "Vinyl" was retired from the variable the same day ("Garment vinyl is never different. It's the same product.").
 */
const LABELS = { "Heat-Transfer": "HTV (Heat-Transfer Vinyl)" };

export const productLabel = (name) => {
  const n = name == null ? "" : String(name);
  return LABELS[n.trim()] || n;
};
