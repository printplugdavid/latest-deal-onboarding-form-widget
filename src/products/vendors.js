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

/* Books vendors that are not a place we order from (our own decoration / fee items). Stock from the shelf is "Inventory". */
export const NOT_A_VENDOR = ["The Print Plug"];

// Spaces and punctuation ignored: older orders were typed by hand ("SanMar", "SSactivewear", "Stahls").
const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "");

/* The Deal choice with this name (any case, spacing or punctuation), or "". */
export const dealVendor = (name) => DEAL_VENDORS.find((v) => norm(v) === norm(name)) || "";

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
  return DEAL_VENDORS.filter((v) => want.has(v));
}

/* What the Deal's `Vendors` becomes: { value, changed }. The form owns the field; it never blanks it when the order names no vendor. */
export function mergeDealVendors(current, products) {
  const now = (Array.isArray(current) ? current : current ? String(current).split(";") : []).map((v) => String(v).trim()).filter(Boolean);
  const want = dealVendorsFrom(products);
  if (!want.length) return { value: now, changed: false };
  const same = want.length === now.length && want.every((v) => now.includes(v));
  return { value: want, changed: !same };
}
