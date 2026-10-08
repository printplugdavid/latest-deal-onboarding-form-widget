/*
 * colorCatalogs.js -- E-41. The shop's own color charts, so a rep picks a color that EXISTS and
 * production sees a swatch, not just a word.
 *
 * ⚠️ `colorsUsed` STAYS A STRING. This module only helps fill that box and reads it back; the
 * note, the JSON and both note parsers see the same text they always have.
 *
 * Catalogues live here as data. Today: single-color vinyl (David's chart, 2026-10-06, 30 colors).
 * To come, same shape: the Madeira machine-thread chart (the first chart sent was a different
 * Madeira line -- none of the shop's thread numbers were in it) and a house Pantone ink list.
 *
 * Swatches are an on-screen approximation -- a guard against "wrong blue", not a color match.
 *
 * Pure: no React, no ZOHO.
 */
import VINYL_ROWS from "./colorData/vinyl.json";

/*
 * Since 2026-10-07 (E-48) the vinyl list is GENERATED from the color library -- the full ORACAL 651
 * range: 30 colors on the shop's chart (stocked) and 50 order-in. Swatch values are ORAFOL's own,
 * which replaced the shop chart's (David: "I would go with their catalog"). The 30 stocked colors
 * keep the shop's names, so text already written on deals still matches.
 */
export const VINYL_COLORS = VINYL_ROWS.map(([code, name, hex, metallic, stocked]) => ({
  code,
  name,
  hex: hex || null,
  metallic: !!metallic || /\b(gold|silver|copper|metallic)\b/i.test(name),
  stocked: !!stocked,
}));

export const VINYL_CATALOG = { key: "vinyl", label: "vinyl", colors: VINYL_COLORS };

// Which products are cut from the single-color vinyl chart. Stickers are printed, not cut, so
// they are deliberately not here; add a product name to opt it in.
const VINYL_PRODUCTS = ["Vinyl", "Heat-Transfer", "Decals"];

export function catalogFor(productName) {
  return VINYL_PRODUCTS.indexOf(String(productName || "")) >= 0 ? VINYL_CATALOG : null;
}

// "Matte"/"Matt", "Gray"/"Grey", the chart's own old "Turqoise" spelling, case and spacing.
const norm = (s) =>
  String(s == null ? "" : s)
    .toLowerCase()
    .replace(/\bmatte\b/g, "matt")
    .replace(/\bgray\b/g, "grey")
    .replace(/\bturqoise\b/g, "turquoise")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* The separate things written in the box: one per line, comma, semicolon, slash, "and" or "&". */
export function splitColorText(text) {
  return String(text == null ? "" : text)
    .split(/\r?\n|,|;|\/|&|\band\b/i)
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

/*
 * Read the box against a catalogue.
 *   matched   -- catalogue colors named in it, in the order written, no repeats
 *   unmatched -- everything else, as typed (a typo, a color not on the chart, or a real note)
 * A piece matches only when it IS a catalogue name -- "Dark Red" never counts as "Red".
 */
export function readColors(text, catalog) {
  const matched = [];
  const unmatched = [];
  if (!catalog) return { matched, unmatched };
  const byNorm = {};
  catalog.colors.forEach((c) => (byNorm[norm(c.name)] = c));
  splitColorText(text).forEach((piece) => {
    const hit = byNorm[norm(piece)];
    if (hit) {
      if (matched.indexOf(hit) < 0) matched.push(hit);
    } else {
      unmatched.push(piece);
    }
  });
  return { matched, unmatched };
}

/* Add a picked color on its own line. Already there (any spelling the reader accepts) -> unchanged. */
export function addColorToText(text, name, catalog) {
  const cur = String(text == null ? "" : text);
  const color = catalog && catalog.colors.filter((c) => c.name === name)[0];
  if (!color) return cur;
  if (readColors(cur, catalog).matched.indexOf(color) >= 0) return cur;
  const base = cur.replace(/\s+$/, "");
  return base ? base + "\n" + name : name;
}

/* The CSS background for a swatch. Metallics have no flat screen color, so they get a sheen. */
export function swatchBackground(color) {
  if (!color) return "#fff";
  if (color.hex) return color.hex;
  return /gold|copper/i.test(color.name)
    ? "linear-gradient(135deg,#8a6d1f,#f5e08a,#b8962e)"
    : "linear-gradient(135deg,#7d7d7d,#f2f2f2,#a3a3a3)";
}
