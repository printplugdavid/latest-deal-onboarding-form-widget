/*
 * E-100: find real products for a SKU row. CRM Products mirror Books items (the native sync: Books SKU -> Product_Code,
 * name, Category -> Item_Category; Brand filled by the Books thread's drift guard). Measured 2026-10-20: all 4,058 active
 * products carry a Product Code. Search is by the start of the code (exact codes only: 6400 is not 64000, 220 Paragon is
 * not 220 Richardson -- the brand is shown on every option) and by words of the name.
 */
import { findSkusInBooks } from "./booksItems";

const str = (v) => (v == null ? "" : String(v));

/* CRM search criteria need ( ) , escaped. */
const esc = (v) => str(v).replace(/[(),\\]/g, (c) => "\\" + c);

export function toProduct(rec) {
  return {
    id: str(rec && rec.id),
    sku: str(rec && rec.Product_Code).trim(),
    name: str(rec && rec.Product_Name).trim(),
    brand: str(rec && rec.Brand).trim(),
    vendor: str(rec && rec.Vendor_Name && (rec.Vendor_Name.name || rec.Vendor_Name)).trim(), // E-113 (Books step 072)
    category: str(rec && (rec.Item_Category || rec.Product_Category)).trim(),
    active: !(rec && rec.Product_Active === false),
  };
}

/* Products created in this session reach CRM only after the next Books -> CRM sync, so they are offered from here. */
const created = [];
export function rememberCreated(products) {
  (products || []).forEach((p) => {
    if (p && p.sku && !created.some((c) => c.sku === p.sku)) created.push({ ...p, active: true, justCreated: true });
  });
}

/*
 * E-139: which Books report categories a non-garment product's items live in (measured on the 10-27 Books pull: e.g. 61 of 63
 * "sticker" items are "Product - Stickers/Decals"). Used only to ORDER results -- nothing is hidden -- so a row for Stickers
 * shows sticker items before a "3x3" banner. Form product name -> categories.
 */
const STICKERS = "Product - Stickers/Decals";
const PRINT = "Product - Print";
const PROMO = "Product - Promotional";
export const PRODUCT_TYPE_CATEGORIES = {
  Stickers: [STICKERS],
  Decals: [STICKERS],
  Magnets: ["Product - Magnets"],
  "Fridge Magnets": ["Product - Magnets"],
  Patches: ["Product - Patches"],
  "Pressed Patches": ["Product - Patches"],
  Banners: ["Product - Signage"],
  Posters: [PRINT, PROMO],
  "Business Cards": [PRINT],
  Flyers: [PRINT],
  "Pocket Schedules": [PRINT],
  "Marketing Materials": [PRINT],
  Keychains: [PROMO],
  Tumblers: [PROMO],
  "Name Tag": [PROMO],
  "Stationery + Promotion": [PROMO],
};
export const categoriesForProductType = (name) => PRODUCT_TYPE_CATEGORIES[str(name).trim()] || [];

/*
 * Exact code first, then codes that start with the term, then names holding every typed word, then the other name matches;
 * inside each step the row's own product type first (E-139), then code order. Inactive and code-less rows dropped.
 */
export function rankProducts(list, term, preferCategories) {
  const t = str(term).trim().toUpperCase();
  const words = str(term).toLowerCase().split(/\s+/).filter(Boolean);
  const prefer = new Set((preferCategories || []).map((c) => str(c).toLowerCase()));
  const seen = new Set();
  const score = (p) => {
    const code = p.sku.toUpperCase();
    if (code === t) return 0;
    if (code.startsWith(t)) return 1;
    const name = str(p.name).toLowerCase();
    return words.length && words.every((w) => name.includes(w)) ? 2 : 3;
  };
  const own = (p) => (prefer.size && prefer.has(str(p.category).toLowerCase()) ? 0 : 1);
  return (list || [])
    .filter((p) => p && p.sku && p.active && !seen.has(p.sku) && seen.add(p.sku))
    .sort((a, b) => score(a) - score(b) || own(a) - own(b) || a.sku.localeCompare(b.sku, "en", { numeric: true }));
}

async function search(zoho, config) {
  try {
    const r = await zoho.CRM.API.searchRecord(config);
    return Array.isArray(r && r.data) ? r.data.map(toProduct) : [];
  } catch (e) {
    return [];
  }
}

/*
 * { status: "ok" | "unavailable", products } -- never throws. Two or more characters; the best 100 shown (E-139: was 30;
 * "sticker" alone puts PPCDCS3 at 31 of 63 -- the list scrolls).
 * opts.preferCategories (E-139): Books categories to list first (the SKU row's product type).
 */
export async function searchProducts(term, opts = {}) {
  const prefer = opts.preferCategories || [];
  const t = str(term).trim();
  const zoho = typeof window !== "undefined" ? window.ZOHO : null;
  const local = created.filter((p) => p.sku.toUpperCase().startsWith(t.toUpperCase()) || p.name.toLowerCase().includes(t.toLowerCase()));
  if (t.length < 2) return { status: "ok", products: [] };
  if (!(zoho && zoho.CRM && zoho.CRM.API && typeof zoho.CRM.API.searchRecord === "function")) {
    return { status: local.length ? "ok" : "unavailable", products: rankProducts(local, t, prefer) };
  }
  const code = t.replace(/\s+/g, "").toUpperCase();
  const [byCode, byWord] = await Promise.all([
    search(zoho, {
      Entity: "Products",
      Type: "criteria",
      Query: `((Product_Code:starts_with:${esc(code)})and(Product_Active:equals:true))`,
      // a style's bands and variants (PC54, PC541 ... PC54LS, PC54Y ...) can pass 30: fetch the page, rank, then cut
      per_page: 200,
    }),
    // E-139: Zoho answers a word search with its NEWEST matches first; 30 of them hid every die-cut sticker behind newer
    // sticker items ("sticker" matches 63, "patch" 439). Fetch the page of 200, rank, then cut to 100.
    t.length >= 3 ? search(zoho, { Entity: "Products", Type: "word", Query: t, per_page: 200 }) : Promise.resolve([]),
  ]);
  let ranked = rankProducts([...local, ...byCode, ...byWord], t, prefer);
  // E-106: a code CRM does not know yet may already be in Books (added in another sitting, not synced): ask Books for that code.
  if (/^[A-Z0-9]{3,}$/.test(code) && /\d/.test(code) && !ranked.some((p) => p.sku.toUpperCase() === code)) {
    const fromBooks = await booksLookup(code);
    if (fromBooks) ranked = [fromBooks, ...ranked];
  }
  return { status: "ok", products: ranked.slice(0, 100) };
}

const lookedUp = new Map(); // code -> product | null, for this sitting
async function booksLookup(code) {
  if (lookedUp.has(code)) return lookedUp.get(code);
  const [hit] = (await findSkusInBooks([code])).filter((x) => x.active);
  const p = hit ? asPickerProduct(hit) : null;
  lookedUp.set(code, p);
  return p;
}

/* E-106: the rest of a Books-only item's size-band family (ST290 -> ST2901, ST2902 …), looked up in Books in one call (search, 10-22). */
export async function booksFamilyOf(base) {
  const b = str(base).trim().toUpperCase();
  const found = await findSkusInBooks([b, `${b}1`, `${b}2`, `${b}3`, `${b}4`]);
  return found.filter((x) => x.active).map(asPickerProduct);
}

/* A Books answer as a picker product (id = the CRM Product id, which a Books-only item does not have yet). */
const asPickerProduct = (x) => ({ id: "", sku: x.sku, name: x.name, brand: str(x.brand), vendor: str(x.vendor), category: str(x.category), active: true, fromBooks: true });
