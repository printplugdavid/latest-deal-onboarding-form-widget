/*
 * E-104: a garment type filled from one Books product. A rep searches by SKU or name at the top of the garment type; the pick
 * fills Garment Type, Garment Kind and the SKU rows for the style's size-band family (PC54 S-XL, PC541 2XL, PC542 3XL-6XL).
 * Books names every band item "<Brand> - <Product> - <band>" (2,408 of 2,597 garment items, docs/60), so the family is the
 * items whose name, without its band, is the same. Pure functions; the screen is components/GarmentProductPick.jsx.
 */
import { canonicalKind } from "../placements";
import { parseSizeText } from "../sizeRows";
import RULES from "./newProductRules.json";

const str = (v) => (v == null ? "" : String(v));

/* The name without its last " - <band>" part: "Port & Company - Core Cotton Tee - S-XL" -> "Port & Company - Core Cotton Tee". */
export const nameStem = (name) => str(name).trim().replace(/\s+-\s+[^\s]+$/, "");

/*
 * The codes to search a family by. A trailing digit may be a band number (PC541 = PC54's 2XL) or part of the style (PC54),
 * so both are searched: PC541 -> PC541, PC54 · PC54 -> PC54, PC5 · 112 -> 112, 11. The name filter keeps only the family.
 */
export function familySearchCodes(sku) {
  const s = str(sku).trim().toUpperCase();
  return /\d$/.test(s) && s.length > 2 ? [s, s.slice(0, -1)] : [s];
}

/* The picked product's family among search results: same name stem, codes that share the base. Smallest code first. */
export function familyOf(picked, results) {
  const stem = nameStem(picked && picked.name).toLowerCase();
  const codes = familySearchCodes(picked && picked.sku);
  const base = codes[codes.length - 1];
  const fam = (results || []).filter(
    (p) => p && p.sku && nameStem(p.name).toLowerCase() === stem && p.sku.toUpperCase().startsWith(base)
  );
  if (!fam.some((p) => p.sku === picked.sku)) fam.push(picked);
  const seen = new Set();
  return fam
    .filter((p) => !seen.has(p.sku) && seen.add(p.sku))
    .sort((a, b) => a.sku.length - b.sku.length || a.sku.localeCompare(b.sku, "en", { numeric: true }));
}

const has = (name, words) => words.some((w) => new RegExp("\\b" + w + "\\b", "i").test(str(name)));

/* The form's Garment Kind from the Books category (D-43 in reverse) and the name's words; "" when it cannot tell. */
export function kindFromBooks(category, name) {
  const c = str(category);
  const byName = () => {
    if (has(name, ["beanie", "knit cap", "toque"])) return "Beanie";
    if (has(name, ["cap", "hat", "trucker", "snapback", "visor"])) return "Hat / Cap";
    if (has(name, ["polo"])) return "Polo";
    if (has(name, ["hoodie", "hooded", "sweatshirt", "crewneck", "crew", "quarter-zip", "1/4-zip", "full-zip", "fleece"])) return "Hoodie / Crew / Zip";
    if (has(name, ["jacket", "vest", "soft shell", "parka", "windbreaker"])) return "Jacket / Vest";
    if (has(name, ["pant", "pants", "short", "shorts", "jogger", "sweatpant", "legging"])) return "Pants / Shorts";
    if (has(name, ["bag", "tote", "backpack", "duffel", "cinch"])) return "Bag / Tote / Backpack";
    if (has(name, ["apron"])) return "Apron";
    if (has(name, ["tee", "t-shirt", "shirt", "tank", "long sleeve", "button-up", "henley", "jersey"])) return "Tee / Long Sleeve / Tank / Button-up";
    return "";
  };
  const fixed = {
    "Garment - Tops": "Tee / Long Sleeve / Tank / Button-up",
    "Garment - Polos": "Polo",
    "Garment - Hoodies & Sweatshirts": "Hoodie / Crew / Zip",
    "Garment - Outerwear": "Jacket / Vest",
    "Garment - Bottoms": "Pants / Shorts",
  }[c];
  if (fixed) return canonicalKind(fixed) || fixed;
  if (c === "Garment - Hats") return has(name, ["beanie", "knit cap", "toque"]) ? "Beanie" : "Hat / Cap";
  const k = byName(); // Youth, Infant/Toddler, Accessories: the category does not say the kind
  return k ? canonicalKind(k) || k : "";
}

/* What a pick fills: Garment Type text, kind, and one SKU row per family item. */
export function garmentFill(family, category) {
  const first = family[0] || {};
  return {
    garmentType: `${nameStem(first.name)} (${first.sku})`,
    garmentKind: kindFromBooks(category || first.category, first.name),
    garmentSkus: family.map((p) => ({ sku: p.sku, productId: p.id || "", productName: p.name || "", productSource: p.justCreated ? "created" : "books" })),
  };
}

/*
 * E-107: the size band a Books item covers, from the end of its name: "- S-XL" -> S..XL, "- 2XL" -> 2XL, "- 3XL-6XL" -> 3XL..6XL.
 * Returns [fromRank, toRank] in the naming guide's size order, or null when the name has no band (then it covers every size).
 */
const rank = (s) => RULES.sizeOrder.indexOf(s);
export function bandOf(name) {
  const m = /\s-\s([^\s]+)$/.exec(str(name).trim());
  if (!m) return null;
  const token = m[1].toUpperCase();
  if (token === "OSFA" || token === "OSFM") return null;
  const whole = rank(token);
  if (whole >= 0) return [whole, whole];
  const [a, b] = token.split("-");
  const ra = rank(a);
  const rb = rank(b);
  return ra >= 0 && rb >= 0 ? [Math.min(ra, rb), Math.max(ra, rb)] : null;
}

/*
 * The family items the order's size lines need, in family order. Each size goes to the band that covers it (a youth size on a style
 * whose bands read XS-XL is matched without its Y). No sizes yet -> the first (standard) band only. Sizes no band covers are returned
 * in `unmatched`, never guessed.
 */
export function skusForSizes(family, countColorSize) {
  const fam = family || [];
  const sizes = [...new Set(parseSizeText(countColorSize).rows.map((r) => r.size).filter(Boolean))];
  if (!fam.length) return { items: [], unmatched: [] };
  if (!sizes.length) return { items: [fam[0]], unmatched: [] };
  const bands = fam.map((p) => ({ p, band: bandOf(p.name) }));
  const need = new Set();
  const unmatched = [];
  sizes.forEach((size) => {
    const tries = [size, /^Y(XS|S|M|L|XL)$/.test(size) ? size.slice(1) : null].filter(Boolean);
    let hit = null;
    for (const t of tries) {
      const r = rank(t);
      hit = bands.find((b) => b.band && r >= b.band[0] && r <= b.band[1]) || null;
      if (hit) break;
    }
    if (!hit) hit = bands.find((b) => !b.band) || null; // one item for every size (hats, bags)
    if (hit) need.add(hit.p.sku);
    else unmatched.push(size);
  });
  return { items: fam.filter((p) => need.has(p.sku)), unmatched };
}
