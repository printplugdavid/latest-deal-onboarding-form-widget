/*
 * E-113 (David 10-23; Books docs/47): "Vendors Used" is a pick list of the Deal's vendor choices, filled from the product picked, and the
 * form owns the Deal's `Vendors` field (agents stop writing it by hand). Pure: no React, no ZOHO.
 *
 * One spelling everywhere since 10-23 (Books steps 072-073): Books vendor names = CRM Products' Vendor = the Deal `Vendors` choices below.
 * A vendor not in this list stays as typed text, is not written to the Deal, and is flagged to the Books thread (they add it to Books and
 * the Deal list together, then this list).
 *
 * Saved per garment type / product: `vendorsList` (the list, additive JSON key, docs/06) and `vendorsUsed` (the same as text, "San Mar,
 * S&S Activewear" -- the note line, cards, revision form, robot and parsers read it as before; amendments append to it, D-23).
 */
export const DEAL_VENDORS = [
  "AlphaBroder", "AnyPromo.com", "AS Colour", "Augusta Sportswear", "Banner Buzz", "Big Promotions", "Brotallion", "Cap America",
  "Coldesi", "Cutter & Buck", "Decky", "Discount Mugs", "Elite Sport Socks", "Faire", "GS-JJ", "Hit Promotional Products", "Inventory",
  "Koozie Group", "Otto International", "Pacific Headwear", "Patches 4 Less", "Printograph", "PrintRunner", "Richardsons Sports",
  "Riteline", "S&S Activewear", "San Mar", "Showdown Display", "Stahl's", "Sticker Mule", "Stormtech USA", "Swag Brokers",
  "The Game Headwear", "Uniform Advantage", "UPrinting", "USCutter", "Wal Mart", "YETI",
];

/*
 * E-126: the choices as Zoho has them NOW. When the form opens it reads the Deal field's choices (dealVendorsLive.js); an option David
 * or Books adds in Setup then shows up without a forms release. DEAL_VENDORS above is only the fallback when that read fails.
 */
let live = null;
const listeners = new Set();
export const currentDealVendors = () => live || DEAL_VENDORS;
export function setDealVendors(list) {
  const clean = [...new Set((list || []).map((v) => String(v).trim()).filter(Boolean))];
  live = clean.length ? clean : null;
  listeners.forEach((f) => f());
}
export const onDealVendorsChange = (f) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

/*
 * The Deal `Vendors` choices from a CRM field-metadata answer (META.getFields, or a layout): every option not marked "unused" (old
 * spellings Books took off the layouts stay on the field as unused, step 073), "-None-" dropped. [] when the field is not there.
 */
export function vendorChoicesFrom(resp) {
  const found = [];
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if (o.api_name === "Vendors" && Array.isArray(o.pick_list_values)) found.push(o);
    Object.values(o).forEach(walk);
  };
  walk(resp);
  const names = found
    .flatMap((f) => f.pick_list_values)
    .filter((p) => p && p.type !== "unused")
    .map((p) => String(p.display_value || "").trim())
    .filter((n) => n && n !== "-None-");
  return [...new Set(names)];
}

/* Books vendors that are not a place we order from (our own decoration / fee items). Stock from the shelf is "Inventory". */
export const NOT_A_VENDOR = ["The Print Plug"];

// Spaces and punctuation ignored: older orders were typed by hand ("SanMar", "SSactivewear", "Stahls").
const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "");

/* The Deal choice with this name (any case, spacing or punctuation), or "". */
export const dealVendor = (name) => currentDealVendors().find((v) => norm(v) === norm(name)) || "";

const SEPARATOR = /^---.*---$|^\(cleared in this amendment\)$/i; // amendSeparator (D-23)

/* A garment type's / product's vendors as a list: the saved list, else read from the text (older orders, the robot). */
export function vendorsOf(holder) {
  if (holder && Array.isArray(holder.vendorsList)) return holder.vendorsList.map((v) => String(v).trim()).filter(Boolean);
  const seen = new Set();
  return String((holder && holder.vendorsUsed) || "")
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter((t) => t && !SEPARATOR.test(t))
    .map((t) => dealVendor(t) || t)
    .filter((t) => !seen.has(norm(t)) && seen.add(norm(t)));
}

export const vendorsText = (list) => (list || []).join(", ");

/* The vendors on the list that are not Deal choices (shown to the rep: "tell the Books thread"). */
export const notOnDealList = (list) => (list || []).filter((v) => !dealVendor(v));

/*
 * The list after a product with this Books vendor is picked, or null for "leave it": nothing to add, already there, our own items, or the
 * rep typed something by hand (a list with a non-Deal entry is theirs -- only a list of Deal choices grows by itself).
 */
export function withVendor(list, vendor) {
  const v = String(vendor || "").trim();
  if (!v || NOT_A_VENDOR.some((n) => norm(n) === norm(v))) return null;
  const name = dealVendor(v) || v;
  const now = list || [];
  if (now.some((x) => norm(x) === norm(name))) return null;
  if (!now.length) return [name];
  return now.every((x) => dealVendor(x)) ? [...now, name] : null;
}

/* Every Deal choice named anywhere on the order (products and their garment types), in the Deal list's order. */
export function dealVendorsFrom(products) {
  const want = new Set();
  (products || []).forEach((p) => {
    if (!p) return;
    [p, ...(Array.isArray(p.primaryBranches) ? p.primaryBranches : [])].forEach((h) => vendorsOf(h).forEach((v) => dealVendor(v) && want.add(dealVendor(v))));
  });
  return currentDealVendors().filter((v) => want.has(v));
}

/* What the Deal's `Vendors` becomes: { value, changed }. The form owns the field; it never blanks it when the order names no vendor. */
export function mergeDealVendors(current, products) {
  const now = (Array.isArray(current) ? current : current ? String(current).split(";") : []).map((v) => String(v).trim()).filter(Boolean);
  const want = dealVendorsFrom(products);
  if (!want.length) return { value: now, changed: false };
  const same = want.length === now.length && want.every((v) => now.includes(v));
  return { value: want, changed: !same };
}

/* ---------- E-126 B: adding a new vendor from a form (Deluge WIDGET_Add_Vendor) ---------- */

/* Deluge's name rules (their README): 2-100 characters, no comma or semicolon. "" when fine. */
export function newVendorProblem(name) {
  const n = String(name || "").trim();
  if (n.length < 2 || n.length > 100) return "A vendor name is 2 to 100 characters.";
  if (/[,;]/.test(n)) return "A vendor name cannot have a comma or a semicolon.";
  return "";
}

const distance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

/*
 * An existing vendor this name is probably meant to be ("did you mean San Mar?"), or "": the same letters, two typos or fewer, or one
 * name starting with the other (both at least 4 letters).
 */
export function nearVendor(name, list = currentDealVendors()) {
  const n = norm(name);
  if (!n) return "";
  const exact = (list || []).find((v) => norm(v) === n);
  if (exact) return exact;
  const close = (list || [])
    .map((v) => ({ v, k: norm(v) }))
    .filter(({ k }) => k && ((n.length >= 4 && k.length >= 4 && (k.startsWith(n) || n.startsWith(k))) || distance(n, k) <= 2))
    .sort((a, b) => distance(n, a.k) - distance(n, b.k));
  return close.length ? close[0].v : "";
}

/* Put a vendor the function just added on the live list, so it is offered and written at once. */
export function rememberNewVendor(name) {
  const n = String(name || "").trim();
  if (n && !currentDealVendors().some((v) => norm(v) === norm(n))) setDealVendors([...currentDealVendors(), n]);
}
