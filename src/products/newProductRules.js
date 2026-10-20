/*
 * E-85 / E-100: the Books item convention (Books SKU thread docs/25, as form rules in their docs/30) turned into code.
 * A rep fills in plain fields; everything with a syntax -- SKU, name, category, unit, accounts, price floor -- is built
 * here, the same way every time. Pure functions only; the screen is components/NewProductForm.jsx.
 * Books owns the rules: when their docs change, this file and newProductRules.json follow in a tagged release.
 */
import RULES from "./newProductRules.json";
import { booksCategoryFor } from "../garmentCategories";

export { RULES };

export const PRODUCT_KINDS = [
  { key: "supplier", label: "Supplier goods (the supplier has a style or item number)" },
  { key: "inHouse", label: "In-house (we make it or do it)" },
  { key: "outsourced", label: "Outsourced, no supplier number" },
];

const str = (v) => (v == null ? "" : String(v));
const squash = (s) => str(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const round2 = (n) => Math.round(Number(n) * 100) / 100;
/* Up to the next cent, without float dust (6.765 -> 6.77, 15.367 -> 15.37, 7.00 stays 7.00). */
export const ceilCent = (n) => Math.ceil(round2(Number(n) * 100) - 1e-6) / 100;

/* ® ™ © out, one space between words, no stray dashes at the ends. */
export function cleanWords(s) {
  return str(s)
    .replace(/[®™©]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .trim();
}

/* docs/25 §2: upper case, no spaces, no dashes. */
export function normalizeSku(s) {
  return str(s).toUpperCase().replace(/[\s\-_/]+/g, "");
}

/* docs/25 §3c size tokens: XXL -> 2XL, S/M -> S-M, a lone hat SM -> S-M (ruling 8). */
export function sizeToken(s) {
  const t = cleanWords(s).toUpperCase();
  return RULES.sizeTokens[t] || t;
}
const sizeRank = (s) => {
  const i = RULES.sizeOrder.indexOf(s);
  return i < 0 ? 999 : i;
};

/*
 * docs/25 §1.2: sizes priced together = one item; priced separately = one item per band.
 * sizes = [{ size, cost }] where cost is the case price of that size (the highest color price, decision 6).
 * Returns [{ label, sizes, cost }] smallest first: PC54 -> S-XL 3.00 · 2XL 4.96 · 3XL-6XL 6.14.
 */
export function bandsFromSizes(sizes) {
  const bySize = new Map();
  (sizes || []).forEach((r) => {
    const size = sizeToken(r && r.size);
    const cost = round2(r && r.cost);
    if (!size || !Number.isFinite(cost)) return;
    if (!bySize.has(size) || bySize.get(size) < cost) bySize.set(size, cost);
  });
  const rows = [...bySize.entries()]
    .map(([size, cost]) => ({ size, cost }))
    .sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
  const bands = [];
  rows.forEach((r) => {
    const last = bands[bands.length - 1];
    if (last && last.cost === r.cost) last.sizes.push(r.size);
    else bands.push({ sizes: [r.size], cost: r.cost });
  });
  return bands.map((b) => ({
    ...b,
    label: b.sizes.length === 1 ? b.sizes[0] : `${b.sizes[0]}-${b.sizes[b.sizes.length - 1]}`,
  }));
}

/* docs/25 §2a: the style bare for the first (standard) band, then style+1, +2 ... smallest upcharge first. */
export function skusForBands(style, count) {
  const base = normalizeSku(style);
  return Array.from({ length: Math.max(0, count) }, (_, i) => (i === 0 ? base : `${base}${i}`));
}

const SMALL_WORDS = new Set(["a", "an", "and", "the", "of", "for", "with", "to", "in", "on", "by", "or", "x"]);
/* docs/25 §2b / §2c: a prefix (PP, or the vendor code) + the first letter of each meaningful word. */
export function initialsSku(prefix, words) {
  const letters = cleanWords(words)
    .split(/[\s\-/]+/)
    .filter((w) => w && !SMALL_WORDS.has(w.toLowerCase()) && /[a-z0-9]/i.test(w))
    .map((w) => w.replace(/[^a-z0-9]/gi, "").charAt(0))
    .join("");
  return normalizeSku(str(prefix) + letters);
}

/* docs/25 §2c: the outsourced vendor's code from the registry; "" = no code yet (David picks one). */
export const vendorCodeFor = (vendorName) => RULES.vendorCodes[cleanWords(vendorName)] || "";

/* The one Books spelling of a brand, or "" when Books has no such brand (-> David). */
export function booksBrandFor(brand, booksBrands = RULES.booksBrands) {
  const b = cleanWords(brand);
  if (!b) return "";
  const aliased = RULES.brandAliases[b] || b;
  const hit = (booksBrands || []).find((x) => squash(x) === squash(aliased));
  return hit || "";
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/*
 * docs/25 §3a: the product words are the supplier's title as advertised, minus the brand (it leads the name), minus
 * our SKU / the trailing style code, minus ® ™ ©. A maker's style number inside the title stays (ruling 7).
 */
export function productWordsFromTitle(title, brands, style) {
  let t = cleanWords(title);
  const lead = (brands || []).map(cleanWords).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const b of lead) {
    const re = new RegExp("^" + escapeRe(b).replace(/\\ /g, "\\s*") + "(\\s*-\\s*|\\s+)", "i");
    if (re.test(t)) {
      t = t.replace(re, "");
      break;
    }
  }
  const s = cleanWords(style);
  if (s) t = t.replace(new RegExp("[\\s.-]+" + escapeRe(s) + "\\.?$", "i"), "");
  return cleanWords(t.replace(/\s*\.\s*$/, ""));
}

/*
 * docs/25 §3: Brand - Product - Color/Style - Size/Dimension - Quantity, empty parts left out, order kept.
 * Never: QTY:, parentheses, double spaces or dashes, ® ™ ©.
 */
export function buildName({ brand, product, colorStyle, size, quantity } = {}) {
  const part = (v) =>
    cleanWords(
      str(v)
        .replace(/\bqty\s*:?\s*/gi, "")
        .replace(/[()]/g, "")
        .replace(/\s*-\s*-+\s*/g, " - ")
    );
  const qty = part(quantity).replace(/\s*-\s*/g, "-");
  const sz = part(size).replace(/\s*-\s*/g, "-");
  return [part(brand), part(product), part(colorStyle), sz, qty].filter(Boolean).join(" - ");
}

export const isGarmentCategory = (c) => /^Garment - /.test(str(c));
export const isServiceCategory = (c) => /^Service - /.test(str(c)) || c === "Fee" || c === "Donation";

/* The Books category for a garment from the form's own kind + age (D-43, our crosswalk). */
export const garmentCategoryFor = (kind, age) => booksCategoryFor(kind, age);

/*
 * docs/25 §7. Garments: at least the greater of cost x 1.10 or the next whole dollar. Outsourced non-garments: cost x 1.30
 * (up to 1.40 for rush / premium, the rep's call). In-house: never below cost. 0 = no floor can be set (cost missing).
 */
export function priceFloor(cost, category, kind) {
  const c = Number(cost);
  if (!Number.isFinite(c) || c <= 0) return 0;
  if (isGarmentCategory(category)) return Math.max(ceilCent(c * 1.1), Math.ceil(round2(c) - 1e-9));
  if (kind === "inHouse") return round2(c);
  return ceilCent(c * 1.3);
}

/* docs/25 §4 table (Korie to confirm). { name, id } or null when the category's account is still open. */
export function purchaseAccountFor(category, kind) {
  const map = RULES.purchaseAccountByCategory;
  let name = isGarmentCategory(category) ? map["Garment - *"] : map[category];
  if (name && typeof name === "object") name = kind === "inHouse" ? name.inHouse : name.bought;
  if (!name) return null;
  return { name, id: RULES.purchaseAccounts[name] || "" };
}

/* docs/25 §4: goods for anything physical; service for decoration, labor, fees. */
export const productTypeFor = (category) => (isServiceCategory(category) ? "service" : "goods");

/* docs/25 §4: Sales only for things we never buy -- fees, donations, our own services. */
export function itemTypeFor(category, kind) {
  if (category === "Fee" || category === "Donation") return "sales";
  if (kind === "inHouse" && isServiceCategory(category)) return "sales";
  return "sales_and_purchases";
}

/* docs/25 §6: what a quantity of 1 means. Pieces unless the price is for a whole set / tier. */
export function unitFor(category) {
  if (category === "Product - Print") return "Quantity";
  return "Pieces";
}

const NAME_NEVER = [
  [/\bqty\b/i, 'no "QTY"'],
  [/[()]/, "no parentheses"],
  [/ {2}|--/, "no double spaces or dashes"],
  [/[®™©]/, "no ® ™ ©"],
  [/\bprint price\b|\$/i, "no price words"],
];

/*
 * The hard stops before anything is sent to Books (docs/30 steps 5-13). Each item:
 *   { sku, name, brand, vendorId, vendorName, category, unit, cost, price, productType, itemType, accountId, purchaseAccountId, kind }
 * Returns one list of problems per item, in plain words; an empty list = ready. Whether the SKU or name is already
 * taken in Books (active or inactive) is the books function's check, not this one.
 */
export function checkItems(items, { booksBrands = RULES.booksBrands } = {}) {
  const seenSku = new Map();
  const seenName = new Map();
  (items || []).forEach((it, i) => {
    seenSku.set(normalizeSku(it.sku), (seenSku.get(normalizeSku(it.sku)) || []).concat(i));
    seenName.set(squash(it.name), (seenName.get(squash(it.name)) || []).concat(i));
  });
  return (items || []).map((it) => {
    const p = [];
    const sku = str(it.sku);
    if (!sku) p.push("no SKU");
    else if (!/^[A-Z0-9]+$/.test(sku)) p.push("SKU must be upper case letters and numbers only");
    if ((seenSku.get(normalizeSku(sku)) || []).length > 1) p.push("two items in this batch have the same SKU");
    const name = str(it.name);
    if (!name) p.push("no name");
    NAME_NEVER.forEach(([re, why]) => re.test(name) && p.push("name: " + why));
    // Ruling 7: a maker's style number inside a supplier title is fine (Richardson "112 Trucker Cap"); our own
    // codes (PP..., PRI..., STA...) never go in a name.
    if (it.kind !== "supplier" && sku && new RegExp("(^|[\\s-])" + escapeRe(sku) + "($|[\\s-])", "i").test(name))
      p.push("name: our SKU must not be in the name");
    if ((seenName.get(squash(name)) || []).length > 1) p.push("two items in this batch have the same name");
    if (!it.brand) p.push("no brand");
    else if (!(booksBrands || []).includes(it.brand)) p.push(`brand "${it.brand}" is not in Books yet (ask David)`);
    if (!RULES.categories.includes(it.category)) p.push("pick a category");
    if (!RULES.units.includes(it.unit)) p.push("pick a unit");
    if (it.itemType !== "sales") {
      if (!it.vendorId) p.push("no vendor (pick one from Books' list; a new vendor -> David)");
      if (!(Number(it.cost) > 0)) p.push("cost is $0 or missing (ask before guessing)");
      if (!it.purchaseAccountId) p.push(`no cost account for "${it.category}" yet (Korie)`);
    }
    if (!(Number(it.price) > 0)) p.push("no selling price");
    const floor = priceFloor(it.cost, it.category, it.kind);
    if (floor && Number(it.price) + 1e-9 < floor) p.push(`price is below the floor of $${floor.toFixed(2)}`);
    if (Number(it.cost) > 0 && Number(it.price) + 1e-9 < Number(it.cost)) p.push("price is below cost");
    return p;
  });
}

/* What the books function's create action receives for one item (Books API field names). */
export function toBooksItem(it) {
  return {
    sku: it.sku,
    name: it.name,
    brand: it.brand,
    unit: it.unit,
    vendor_id: it.itemType === "sales" ? "" : it.vendorId,
    category: it.category,
    rate: round2(it.price),
    purchase_rate: it.itemType === "sales" ? 0 : round2(it.cost),
    product_type: it.productType,
    item_type: it.itemType,
    account_id: RULES.salesAccount.id,
    purchase_account_id: it.itemType === "sales" ? "" : it.purchaseAccountId,
    is_taxable: true,
    product_url: str(it.productUrl),
  };
}
