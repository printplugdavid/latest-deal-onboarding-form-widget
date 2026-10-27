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

/*
 * docs/25 §2c: the outsourced vendor's code; "" = no code yet (the form offers the next free one, E-128). Since 10-24 Books is the master
 * (Vendor Code field, step 075): `live` = Books' vendors from "lists" ([{ name, code }]); our registry copy is the fallback.
 * Any letter case (Books renamed PRINTOGRAPH -> Printograph on 10-23, step 073, and the exact-case lookup lost its code).
 */
export const vendorCodeFor = (vendorName, live = []) => {
  const want = cleanWords(vendorName).toLowerCase();
  const hit = (live || []).find((v) => v && cleanWords(v.name).toLowerCase() === want && str(v.code).trim());
  if (hit) return normalizeSku(hit.code);
  const key = Object.keys(RULES.vendorCodes).find((k) => k.toLowerCase() === want);
  return key ? RULES.vendorCodes[key] : "";
};

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
  // SanMar marks retired styles in the title itself ("DISCONTINUED Gildan - DryBlend …"): never part of a name.
  let t = cleanWords(str(title).replace(/\bdiscontinued\b/gi, " "));
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

/*
 * Books docs/25 §6 / docs/39 §5 (David 10-20): what a quantity of 1 means. Quantity = print products, stickers and anything priced by
 * quantity tier, decoration services included · Square Feet = signage sold by area · Hour(s) = labor billed by time · Pieces = the rest
 * (garments, hats, promo products, patches, most physical items). A suggestion: the rep may pick another unit.
 */
const BY_QUANTITY = ["Product - Print", "Product - Stickers/Decals", "Service - DTF", "Service - DTG", "Service - Embroidery", "Service - HTV",
  "Service - Screen Print", "Service - Laser Engraving"];
export function unitFor(category) {
  if (BY_QUANTITY.includes(category)) return "Quantity";
  if (category === "Product - Signage") return "Square Feet";
  if (category === "Service - Graphic Design") return "Hour(s)";
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
    // Books docs/38 + docs/25 §3: a garment / supplier product's name leads with its brand ("Sport-Tek - PosiCharge ... - XS-XL").
    if (it.brand && (it.kind === "supplier" || isGarmentCategory(it.category)) && !name.startsWith(it.brand + " - "))
      p.push(`name must start with the brand: "${it.brand} - ..."`);
    if (!RULES.categories.includes(it.category)) p.push("pick a category");
    if (!RULES.units.includes(it.unit)) p.push("pick a unit");
    if (it.itemType !== "sales") {
      if (!it.vendorId) p.push("no vendor (pick one from Books' list, or type a new one and choose Add)");
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
    // E-128 (Books docs/25 §2a): the supplier's own number when the SKU had to change because Books already used it.
    ...(str(it.partNumber).trim() ? { part_number: str(it.partNumber).trim() } : {}),
    // E-128 / D-61: a vendor code the form made; Deluge saves it on the vendor only when its Vendor Code is blank.
    ...(str(it.vendorCode).trim() ? { vendor_code: normalizeSku(it.vendorCode) } : {}),
  };
}

/*
 * E-126 / E-128 (David 10-23, D-61; Books docs/25 §2c): a vendor with no code yet gets the next FREE code, never one typed and never a
 * wait on David. In order: the first 3 letters of its name; then the first 2 letters + each later letter of the name in turn; then the
 * first 4 letters. Letters only, upper case (Deluge refuses anything else). The rep says OK, or "Not right" for the next one.
 */
const nameLetters = (vendorName) => cleanWords(vendorName).replace(/[^a-z]/gi, "").toUpperCase();
export const suggestVendorCode = (vendorName) => nameLetters(vendorName).slice(0, 3);
export function vendorCodeCandidates(vendorName) {
  const L = nameLetters(vendorName);
  if (L.length < 2) return [];
  const out = [L.slice(0, 3)];
  for (let j = 2; j < L.length; j++) out.push(L[0] + L[1] + L[j]);
  if (L.length >= 4) out.push(L.slice(0, 4));
  return [...new Set(out)];
}

/*
 * Is this code free for this vendor? Taken (Books docs/25 §2c) = another vendor's code (Books' live codes, or our fallback copy), or an
 * existing product code starts with it and belongs to ANOTHER vendor (a brand's style prefix, e.g. BB = Brooks Brothers). Not "starts
 * with a 2-letter code": AP, UP, DM, BB, BP are grandfathered and would block every vendor starting with those letters. The vendor's own
 * items never block it, so the same name gives the same code every time.
 */
export function vendorCodeTaken(code, vendorName, products = [], live = []) {
  const c = normalizeSku(code);
  const mine = cleanWords(vendorName).toLowerCase();
  if (!c) return { taken: true, why: "no letters in the vendor name" };
  const codes = [
    ...(live || []).filter((v) => v && str(v.code).trim()).map((v) => [cleanWords(v.name), normalizeSku(v.code)]),
    ...Object.entries(RULES.vendorCodes),
  ];
  const other = codes.find(([k, v]) => k.toLowerCase() !== mine && v === c);
  if (other) return { taken: true, why: `${c} is already ${other[0]}'s code` };
  const clash = (products || []).find((p) => p && normalizeSku(p.sku).startsWith(c) && cleanWords(p.vendor).toLowerCase() !== mine);
  if (clash) return { taken: true, why: `${c} already starts ${clash.sku}${clash.vendor ? ` (${clash.vendor})` : ""}` };
  return { taken: false, why: "" };
}

/*
 * E-128 (David 10-23, Books docs/25 §2a, their A0i): the supplier's own number is already a SKU on a DIFFERENT product (the rep said
 * "No, not this product"). The new product changes; the existing one keeps its SKU. Supplier goods: the BRAND's first 2 letters + the
 * number (Richardson 220 -> RI220), then 3, then 4 letters when taken. Outsourced: the vendor code + the number. Bands +1, 2, 3 as usual.
 * The supplier's own number is kept in Books' Part Number. Returns the prefixes to try, best first.
 */
export function clashPrefixes(kind, { brand = "", vendorCode = "" } = {}) {
  if (kind === "outsourced") return vendorCode ? [normalizeSku(vendorCode)] : [];
  const L = cleanWords(brand).replace(/[^a-z]/gi, "").toUpperCase();
  return [...new Set([L.slice(0, 2), L.slice(0, 3), L.slice(0, 4)].filter((p) => p.length >= 2))];
}

/*
 * Is "prefix + number" free? `taken` = the SKUs Books already has (active or inactive; from the "check" action); `products` = CRM
 * products whose code starts with it (the DT8001 trap: letters + number must not start another brand's existing SKU). A product of
 * this same brand never blocks it.
 */
export function clashSkuFree(base, bandSkus, { taken = new Set(), products = [], brand = "" } = {}) {
  const b = normalizeSku(base);
  const hit = (bandSkus || []).map(normalizeSku).find((s) => taken.has(s));
  if (hit) return { free: false, why: `${hit} is already in Books` };
  const other = (products || []).find((p) => p && normalizeSku(p.sku).startsWith(b) && squash(p.brand) !== squash(brand));
  if (other) return { free: false, why: `${b} would look like ${other.sku}${other.brand ? ` (${other.brand})` : ""}` };
  return { free: true, why: "" };
}

/*
 * E-127 (David 10-23: vendor, brand, SKU and product name stay data-confident). A brand Books has never used can be added from the New
 * Product form after one confirm: the name cleaned (no ® ™ ©, single spaces), a near-match warning against Books' brands and our aliases,
 * then OK. In Books a brand is text on the item, so it exists once the first item with it is created.
 */
export const cleanBrand = (name) => cleanWords(name);

export function newBrandProblem(name) {
  const n = cleanBrand(name);
  if (n.length < 2 || n.length > 60) return "A brand name is 2 to 60 characters.";
  if (!/[a-z]/i.test(n)) return "A brand name needs letters.";
  if (/[,;]/.test(n)) return "A brand name cannot have a comma or a semicolon.";
  return "";
}

const bsq = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const editDistance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

/*
 * The Books brands this name may be, best first (up to `max`): an alias ("Port & Co" -> "Port & Company"), the same letters, a typo
 * (1 on names of 3-5 letters, 2 on longer ones: OTTO, YETI and OGIO count), or a prefix of 3+ letters. The rep can always dismiss them
 * ("Not right" -> David), so look-alikes are offered generously (David 10-23).
 */
export function nearBrands(name, brands = RULES.booksBrands, max = 3) {
  const n = bsq(cleanBrand(name));
  if (n.length < 3) return [];
  const alias = Object.keys(RULES.brandAliases).find((k) => bsq(k) === n);
  if (alias) return [RULES.brandAliases[alias]];
  const list = brands || [];
  const same = list.find((b) => bsq(b) === n);
  if (same) return [same];
  const typos = n.length >= 6 ? 2 : 1;
  return list
    .map((b) => ({ b, k: bsq(b) }))
    .filter(({ k }) => k && ((Math.min(n.length, k.length) >= 3 && (k.startsWith(n) || n.startsWith(k))) || editDistance(n, k) <= typos))
    .map((x) => ({ ...x, d: editDistance(n, x.k) }))
    .sort((x, y) => x.d - y.d || x.b.localeCompare(y.b))
    .slice(0, max)
    .map((x) => x.b);
}
/* The single best look-alike, or "". */
export const nearBrand = (name, brands) => nearBrands(name, brands, 1)[0] || "";
