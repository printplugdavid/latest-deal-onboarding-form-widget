/*
 * E-116 (team feedback 10-23): "Can the font information be a check box? As in fonts added? Yes or no, how many, then a single line(s)
 * to add the font details. Hidden unless select Yes." Pure helpers for components/FontsField.jsx.
 *
 * Saved next to the old free-text `fontsUsed` (kept: the note's "Fonts Used:" line, the Amendment Form, the revision form and the cards
 * read it): `fontsAdded` "Yes" | "No" and `fontLines` [string]. `fontsUsed` = the lines joined with "; " (Yes), "None" (No).
 */
const str = (v) => (v == null ? "" : String(v));
export const MAX_FONTS = 10;

/* What to show for saved values. An order saved before E-116 has only `fontsUsed`: shown as Yes with its lines, nothing written. */
export function fontsView(fontsAdded, fontLines, fontsUsed) {
  const used = str(fontsUsed).trim();
  const added = str(fontsAdded) || (used && used !== "None" ? "Yes" : used === "None" ? "No" : "");
  const lines = Array.isArray(fontLines)
    ? fontLines.map(str)
    : added === "Yes" && used
    ? used.split(/\r?\n|;\s*/).map((l) => l.trim()).filter(Boolean)
    : [];
  return { added, lines };
}

/* The three values to save after the rep changes something. */
export function fontsValues(added, lines) {
  if (added === "No") return { fontsAdded: "No", fontLines: [], fontsUsed: "None" };
  if (added !== "Yes") return { fontsAdded: "", fontLines: [], fontsUsed: "" };
  const clean = (lines || []).map(str);
  return { fontsAdded: "Yes", fontLines: clean, fontsUsed: clean.map((l) => l.trim()).filter(Boolean).join("; ") };
}

/* "How many fonts?" -> that many lines, keeping what was typed. */
export function resizeLines(lines, count) {
  const n = Math.max(0, Math.min(MAX_FONTS, parseInt(count, 10) || 0));
  const out = (lines || []).slice(0, n);
  while (out.length < n) out.push("");
  return out;
}
