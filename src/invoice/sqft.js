/*
 * sqft.js -- E-156 (David 10-29): the square-foot calculator for products Books prices per square foot.
 *
 *   Decals (single / multi color)  tier by NUMBER OF DECALS ("1-10" ... "101+"), the line = tier SKU x total square feet
 *   Vinyl stencils                 tier by TOTAL SQUARE FEET ("Under 1 ft - 9 ft" ... "30 ft +"), line = tier SKU x total square feet
 *   Custom-size vinyl banner       PRIVB (one rate), line = PRIVB x total square feet
 * Magnets stay per piece by size (no square-foot item in Books). A standard-size banner keeps its own per-piece item.
 *
 * Which product it is comes from the SKU the rep picked (any tier of the family): the form then picks the RIGHT tier itself.
 * Tiers come from Books' item names (tools/invoice/build-grid.py), so a renamed tier fails that build, not an invoice. Pure.
 */
import GRID from "./billingGrid.json";

const str = (v) => (v == null ? "" : String(v));
const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => {
  const n = parseFloat(str(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const FAMILY_LABEL = {
  decalSingle: "Single Color Decals",
  decalMulti: "Multi Color Decals",
  stencil: "Vinyl Stencil",
  banner: "Vinyl Banner (custom size)",
};

/* "decalSingle" | "decalMulti" | "stencil" | "banner" | "" -- from the SKU(s) the rep picked on the product. */
export function familyOf(skus) {
  const list = (skus || []).map((s) => str(s).trim().toUpperCase()).filter(Boolean);
  for (const key of ["decalSingle", "decalMulti", "stencil"]) {
    const grid = (GRID.grids && GRID.grids[key]) || [];
    if (list.some((s) => grid.some((r) => r.sku === s))) return key;
  }
  const banner = GRID.sqft && GRID.sqft.bannerCustom;
  if (banner && list.includes(banner)) return "banner";
  return "";
}

const inRange = (n, [lo, hi]) => n >= lo && (hi == null || n <= hi);
/* The tier row for n; between two rows (e.g. 9.5 sq ft, or a gap) -> the highest row it has reached, like the gang sheet. */
const pick = (rows, key, n) => rows.find((r) => inRange(n, r[key])) || [...rows].sort((a, b) => a[key][0] - b[key][0]).filter((r) => n >= r[key][0]).pop() || rows[0];

/*
 * { family, each, total, count, sku, line } or { family, why } (why = what the rep still has to enter).
 * `count` = how many (Quantity Ordered), width / height in inches.
 */
export function sqftCalc({ skus, count, widthIn, heightIn }) {
  const family = familyOf(skus);
  if (!family) return { family: "" };
  const n = Math.round(num(count));
  const w = num(widthIn);
  const h = num(heightIn);
  if (!n) return { family, why: "enter the quantity" };
  if (!(w > 0 && h > 0)) return { family, why: "enter the width and height in inches" };
  const each = round2((w * h) / 144);
  const total = round2(((w * h) / 144) * n);
  let sku = "";
  if (family === "banner") sku = GRID.sqft.bannerCustom;
  else if (family === "stencil") sku = pick(GRID.grids.stencil, "feet", total).sku;
  else sku = pick(GRID.grids[family], "count", n).sku;
  const name = (GRID.items[sku] || {}).name || sku;
  return {
    family,
    each,
    total,
    count: n,
    sku,
    line: {
      sku,
      quantity: total,
      description: `${n} x ${w}" x ${h}" (${each} sq ft each, ${total} sq ft)`,
      group: "product",
      clientQty: 0,
    },
    summary: `${n} x ${w}" x ${h}" = ${each} sq ft each, ${total} sq ft in all -> ${name} (${sku}) x ${total} sq ft`,
  };
}
