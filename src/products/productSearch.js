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

/* Exact code first, then codes that start with the term, then name matches; inactive and code-less rows dropped. */
export function rankProducts(list, term) {
  const t = str(term).trim().toUpperCase();
  const seen = new Set();
  const score = (p) => (p.sku.toUpperCase() === t ? 0 : p.sku.toUpperCase().startsWith(t) ? 1 : 2);
  return (list || [])
    .filter((p) => p && p.sku && p.active && !seen.has(p.sku) && seen.add(p.sku))
    .sort((a, b) => score(a) - score(b) || a.sku.localeCompare(b.sku, "en", { numeric: true }));
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
 * { status: "ok" | "unavailable", products } -- never throws. Two or more characters; the best 30 shown.
 */
export async function searchProducts(term) {
  const t = str(term).trim();
  const zoho = typeof window !== "undefined" ? window.ZOHO : null;
  const local = created.filter((p) => p.sku.toUpperCase().startsWith(t.toUpperCase()) || p.name.toLowerCase().includes(t.toLowerCase()));
  if (t.length < 2) return { status: "ok", products: [] };
  if (!(zoho && zoho.CRM && zoho.CRM.API && typeof zoho.CRM.API.searchRecord === "function")) {
    return { status: local.length ? "ok" : "unavailable", products: rankProducts(local, t) };
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
    t.length >= 3 ? search(zoho, { Entity: "Products", Type: "word", Query: t, per_page: 30 }) : Promise.resolve([]),
  ]);
  let ranked = rankProducts([...local, ...byCode, ...byWord], t);
  // E-106: a code CRM does not know yet may already be in Books (added in another sitting, not synced): ask Books for that code.
  if (/^[A-Z0-9]{3,}$/.test(code) && /\d/.test(code) && !ranked.some((p) => p.sku.toUpperCase() === code)) {
    const fromBooks = await booksLookup(code);
    if (fromBooks) ranked = [fromBooks, ...ranked];
  }
  return { status: "ok", products: ranked.slice(0, 30) };
}

const lookedUp = new Map(); // code -> product | null, for this sitting
async function booksLookup(code) {
  if (lookedUp.has(code)) return lookedUp.get(code);
  const [hit] = (await findSkusInBooks([code])).filter((x) => x.active);
  const p = hit ? { id: "", sku: hit.sku, name: hit.name, brand: "", category: "", active: true, fromBooks: true } : null;
  lookedUp.set(code, p);
  return p;
}

/* E-106: the rest of a Books-only item's size-band family (ST290 -> ST2901, ST2902 …), looked up in Books in one call. */
export async function booksFamilyOf(base) {
  const b = str(base).trim().toUpperCase();
  const found = await findSkusInBooks([b, `${b}1`, `${b}2`, `${b}3`, `${b}4`]);
  return found.filter((x) => x.active).map((x) => ({ id: "", sku: x.sku, name: x.name, brand: "", category: "", active: true, fromBooks: true }));
}
