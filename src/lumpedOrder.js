/*
 * lumpedOrder.js -- E-42. Catch an order entered as ONE garment type when it is really several.
 *
 * The form's model is "every graphic on a garment type goes on every garment of that type", and
 * the print count multiplies accordingly. Two real orders broke that:
 *   - Flute Summit Deal 2: 12 different garments + 7 logos in one garment type, one logo each.
 *     Counted 168, real 24 (docs/04 E-37).
 *   - Ammo Squared Deal 12: 600 hats in three colors + 5 graphics, each scoped to some colors.
 *     Counted 3,000 embroidery, real 1,800 (docs/03 2026-10-06 (3)).
 * Nothing warned either time: the sizes add up, the quantity is right.
 *
 * This asks ONE question when the shape looks like that -- "does every graphic go on every
 * garment listed here?" -- and says what to do on a No. It never blocks and never changes a count.
 *
 * Pure: no React, no ZOHO.
 */
import { parseSizeText } from "./sizeRows";

export const LUMPED_FIELD = "everyGraphicOnEveryGarment";
export const LUMPED_QUESTION = "Does every graphic go on every garment listed here?";

const uniq = (list) => list.filter((v, i) => v && list.indexOf(v) === i);
const lower = (s) => String(s == null ? "" : s).toLowerCase();

// Words that name a garment color. Only counted as "scoping" when the same word is also written
// in this garment's own style / size text, so "white ink on the logo" alone does not trip it.
const COLOR_WORDS = [
  "black", "white", "grey", "gray", "navy", "blue", "red", "green", "olive", "maroon", "charcoal",
  "heather", "royal", "purple", "pink", "orange", "yellow", "brown", "tan", "khaki", "camo",
  "multicam", "loden", "cream", "natural", "sand", "gold", "teal",
];

/*
 * What about this garment type suggests it may be several?
 *   graphics  -- how many graphics it has
 *   variety   -- plain-language reasons it looks like more than one kind of garment
 *   scoped    -- 1-based numbers of graphics whose description names a particular style/color
 *   suspect   -- 2+ graphics AND some variety: worth asking
 *   strong    -- suspect AND at least one graphic scopes itself: very likely lumped
 */
export function lumpedSignals(garment) {
  const g = garment || {};
  const list = Array.isArray(g.secondaryBranches) ? g.secondaryBranches : [];
  const typed = parseInt(g.numberOfGraphics, 10);
  const graphics = Math.max(list.length, isNaN(typed) ? 0 : typed);

  const skus = uniq((g.garmentSkus || []).map((r) => lower(r && r.sku).trim()));
  const styles = String(g.garmentType == null ? "" : g.garmentType)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const rows = parseSizeText(g.countColorSize).rows;
  const colors = uniq(rows.map((r) => lower(r.color).trim()));
  const groups = uniq(rows.map((r) => lower(r.group).trim()));

  const variety = [];
  if (skus.length >= 2) variety.push(`${skus.length} SKUs`);
  if (styles.length >= 2) variety.push(`${styles.length} styles`);
  if (colors.length >= 2) variety.push(`${colors.length} colors`);
  if (groups.length >= 2 && styles.length < 2) variety.push(`${groups.length} style groups`);

  const own = lower(g.garmentType) + "\n" + lower(g.countColorSize);
  const ownColors = COLOR_WORDS.filter((w) => new RegExp("\\b" + w + "\\b").test(own));
  const scoped = [];
  list.forEach((gr, i) => {
    const d = lower(gr && gr.graphicDescription);
    if (!d) return;
    const namesSku = skus.some((s) => s.length >= 3 && d.indexOf(s) >= 0);
    const namesColor = ownColors.length >= 2 && ownColors.some((w) => new RegExp("\\b" + w + "\\b").test(d));
    const countsOut = /(^|\n)\s*\d+\s*[-–x×]\s*\S/.test(d) || /\bon\s*:/.test(d);
    if (namesSku || namesColor || countsOut) scoped.push(i + 1);
  });

  const suspect = graphics >= 2 && variety.length > 0;
  return { graphics, variety, scoped, suspect, strong: suspect && scoped.length > 0 };
}

/* The sentence under the question. */
export function lumpedExplanation(sig) {
  if (!sig || !sig.suspect) return "";
  const what = sig.variety.join(", ");
  const base = `This garment type lists ${what} and ${sig.graphics} graphics. The print count puts every graphic on every garment.`;
  return sig.scoped.length
    ? `${base} Graphic ${sig.scoped.join(", ")} ${sig.scoped.length === 1 ? "mentions" : "mention"} particular styles or colors.`
    : base;
}

export const LUMPED_NO_ADVICE =
  "Split this into separate garment types - one for each group of garments that gets the same graphics " +
  "(raise Number of Garment Types and move the garments and graphics). As entered, the print count will be too high.";

/* What the note prints for a garment the rep answered No on (and did not split). */
export const LUMPED_NOTE_LINE =
  "NOTE: the rep answered that NOT every graphic goes on every garment in this garment type. " +
  "The print count counts every graphic on every garment, so it is too high for this garment type.";

/*
 * Every garment type on the order that still needs a look: suspect, and not answered Yes.
 * Returns [{ product, garment, label, answer, strong }].
 */
export function lumpedConcerns(products) {
  const out = [];
  (products || []).forEach((p, pi) => {
    if (!p || p.productType !== "garment") return;
    (p.primaryBranches || []).forEach((gar, gi) => {
      const sig = lumpedSignals(gar);
      const answer = gar && gar[LUMPED_FIELD];
      if (!sig.suspect || answer === "Yes") return;
      out.push({
        product: pi,
        garment: gi,
        label: `${p.productName || "Product " + (pi + 1)} - Garment ${gi + 1}`,
        answer: answer === "No" ? "No" : "",
        strong: sig.strong,
        explanation: lumpedExplanation(sig),
      });
    });
  });
  return out;
}
