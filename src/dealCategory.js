/*
 * E-16 (David, D-55; audit docs/70): the Deal Category (`Lead_Category`, multi-select) follows the products on the form. Reps stop
 * setting it by hand. Pure: no React, no ZOHO.
 *
 * E-115 (David 10-27, docs/73 + 75; layout agreed with Deluge, their docs/48): every product is asked "Is this item outsourced?"
 * No = In house; Yes = "Ordered in, finished in house" or "Ordered in, ready to go". From the answers the form writes, with the
 * category, two Deal fields:
 *   - Outsourced Items (multi-line text): one line per ordered-in product, "<product> - <answer>". For people and the ORDER PRODUCTS task.
 *   - Ordered In - Ready To Go (multi-select, 13 options = the categories that make an in-house task): a category only when EVERY
 *     product under it is ready to go. The production masters skip that category's in-house task(s).
 * `Outsourced` on the category now follows the answers (any product ordered in), not a fixed list of products (it replaces D-55's
 * "Banners / Patches / Magnets always add Outsourced"). A ready-to-go product keeps its own tag (a bought-in Banners order keeps
 * Banners) but not `Vinyl Department`, which means in-house vinyl work.
 *
 * The form OWNS the product and department tags below. On Submit it replaces those and keeps everything else on the Deal: School
 * Advertiser, School Sponsorship, Unqualified and any value it does not know (legacy `Fridge Magnets`, a new option nobody told us
 * about). Values are written exactly as CRM displays them (the API takes the display label -- docs/08); Banners is stored as `Vinyl`
 * underneath, which only matters to functions that compare stored strings (asked of Deluge, docs/72 §B6).
 */
import CONFIG from "./dealCategoryConfig.json";

export const VD = "Vinyl Department";
export const OUT = "Outsourced";

/* ---------- E-115: how each product is made (David's words, saved as they are shown: label = stored value) ---------- */
export const IN_HOUSE = "In house";
export const ORDERED_FINISH = "Ordered in, finished in house";
export const ORDERED_READY = "Ordered in, ready to go";
export const SOURCING = [IN_HOUSE, ORDERED_FINISH, ORDERED_READY];

/* Products always bought in finished: the question opens on "ordered in, ready to go" (the rep can change it). */
export const ALWAYS_BOUGHT = new Set(["Business Cards", "Flyers", "Keychains", "Tumblers", "Name Tag", "Outsourced"]);
/* The products that are made or bought (asked); Graphic Design and the online storefront are services and never asked. */
export const ASKED_TYPES = new Set(["garment", "nongarment", "gangsheet"]);

const nameOf = (p) => String((p && p.productName) || "").trim();
export const isAsked = (p) => ASKED_TYPES.has(p && p.productType);
export const defaultSourcing = (productName) => (ALWAYS_BOUGHT.has(String(productName || "").trim()) ? ORDERED_READY : IN_HOUSE);
/* The answer for a product: the rep's, else the default (older orders, online orders and the robot never had the question). */
export const sourcingOf = (p) => (!isAsked(p) ? IN_HOUSE : SOURCING.includes(p && p.sourcing) ? p.sourcing : defaultSourcing(nameOf(p)));
export const isOrderedIn = (p) => sourcingOf(p) !== IN_HOUSE;

/* form product name -> Deal Category tags (D-55; Outsourced is added from the answers, E-115) */
export const CATEGORY_FOR = {
  "Screen Printing": ["Screen Printing"],
  Embroidery: ["Embroidery"],
  "Direct-to-Garment": ["DTG (Direct-to-Garment)", VD],
  "Direct-to-Film": ["DTF (Direct-to-Film)", VD],
  "Heat-Transfer": ["HTV (Heat-Transfer-Vinyl)", VD],
  Vinyl: ["HTV (Heat-Transfer-Vinyl)", VD], // D-55 (2): garment vinyl = HTV (retired from the form 10-23; older orders)
  "Pressed Patches": ["Patches", VD],
  "DTF Gang Sheet": ["DTF Gang Sheet", VD], // not also DTF (docs/70 §8.5)
  Patches: ["Patches", VD],
  Stickers: ["Stickers", VD],
  Decals: ["Decals", VD],
  Magnets: ["Magnets", VD],
  "Fridge Magnets": ["Magnets", VD],
  Posters: ["Posters", VD],
  Banners: ["Banners", VD],
  "Business Cards": [],
  Flyers: [],
  Keychains: [],
  Tumblers: [],
  "Name Tag": [],
  "Pocket Schedules": ["Pocket Schedules"], // D-55 (3): may be retired once Deluge confirms
  "Marketing Materials": ["Marketing Materials"], // same
  "Stationery + Promotion": ["Stationery + Promotional"], // same
  Outsourced: [],
  "Graphic Design": ["Graphic Design"],
  "Online StoreFront": ["Online Storefront"], // D-55 (4): Graphic Design only when that product is selected too
  "Online Storefront": ["Online Storefront"],
};

/* Deluge docs/48 §2 B: the 13 "Ordered In - Ready To Go" options, in their order (= the categories that make an in-house task). */
export const READY_OPTIONS = [
  "Screen Printing",
  "Embroidery",
  "DTF (Direct-to-Film)",
  "DTF Gang Sheet",
  "DTG (Direct-to-Garment)",
  "HTV (Heat-Transfer-Vinyl)",
  "Stickers",
  "Decals",
  "Banners",
  "Stationery + Promotional",
  "Magnets",
  "Patches",
  "Posters",
];
/* The one category a product's in-house task belongs to, or "" (Business Cards and the like make no in-house task). */
export const readyCategoryOf = (p) => (CATEGORY_FOR[nameOf(p)] || []).find((c) => READY_OPTIONS.includes(c)) || "";

/* Every tag the form owns (replaces). Anything else on the Deal is kept. */
export const OWNED = new Set([
  "Banners",
  "Decals",
  "DTF (Direct-to-Film)",
  "DTF Gang Sheet",
  "DTG (Direct-to-Garment)",
  "Embroidery",
  "Graphic Design",
  "HTV (Heat-Transfer-Vinyl)",
  "Magnets",
  "Marketing Materials",
  "Online Storefront",
  OUT,
  "Patches",
  "Pocket Schedules",
  "Posters",
  "Screen Printing",
  "Stationery + Promotional",
  "Stickers",
  VD,
]);

const ORDER = [...OWNED]; // a steady order, so the same products always write the same list

/* The tags the form's products call for, in a steady order; [] when no product is known. */
export function categoriesFor(products) {
  const want = new Set();
  (products || []).forEach((p) => {
    const ready = sourcingOf(p) === ORDERED_READY;
    // a product bought in finished keeps its own tag, but no in-house vinyl work (Vinyl Department)
    (CATEGORY_FOR[nameOf(p)] || []).filter((c) => !(ready && c === VD)).forEach((c) => want.add(c));
    if (isOrderedIn(p)) want.add(OUT);
  });
  return ORDER.filter((c) => want.has(c));
}

const asList = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : String(v).split(";")).map((x) => String(x).trim()).filter(Boolean);

/*
 * What the Deal's category becomes: { value, changed[, unknown] }. Keeps every tag the form does not own; replaces the owned ones
 * with the products' tags. Changes nothing when the form has no product or any product the table does not know.
 */
export function mergeCategories(current, products) {
  const now = asList(current);
  const names = (products || []).map(nameOf).filter(Boolean);
  // A product the table does not know (a new option in the CRM list, an old hand-edited note): leave the Deal's tags alone
  // rather than drop that product's tag. `unknown` names it for the log.
  const unknown = names.filter((n) => !CATEGORY_FOR[n]);
  if (unknown.length) return { value: now, changed: false, unknown };
  const want = categoriesFor(products);
  if (!want.length) return { value: now, changed: false };
  const value = [...now.filter((c) => !OWNED.has(c)), ...want];
  const same = value.length === now.length && value.every((c) => now.includes(c));
  return { value, changed: !same };
}

/* ---------- E-115: the two Deal fields (Deluge docs/48) ---------- */

/* "Outsourced Items": one line per ordered-in product, in the order's order; "" when nothing is ordered in. */
export function outsourcedItemsText(products) {
  return (products || [])
    .filter((p) => nameOf(p) && isOrderedIn(p))
    .map((p) => `${nameOf(p)} - ${sourcingOf(p)}`)
    .join("\n");
}

/* "Ordered In - Ready To Go": a category only when EVERY product under it is ready to go (mixed = the task is still made). */
export function readyCategories(products) {
  const by = new Map();
  (products || []).forEach((p) => {
    const c = readyCategoryOf(p);
    if (!c) return;
    by.set(c, (by.get(c) || []).concat(sourcingOf(p) === ORDERED_READY));
  });
  return READY_OPTIONS.filter((c) => by.has(c) && by.get(c).every(Boolean));
}

const sameText = (a, b) => String(a || "").replace(/\r\n/g, "\n").trim() === String(b || "").replace(/\r\n/g, "\n").trim();
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/*
 * The Deal fields this form writes for outsourcing: { fields, changed }. Replaces both fields each time (blank when nothing is ordered
 * in any more). `deal` = the Deal record as read (its current values). Field names come from dealCategoryConfig.json.
 */
export function outsourcingFields(deal, products) {
  const textField = CONFIG.outsourcedItemsField;
  const listField = CONFIG.readyField;
  const text = outsourcedItemsText(products);
  const ready = readyCategories(products);
  const fields = { [textField]: text, [listField]: ready };
  const changed = !sameText(deal && deal[textField], text) || !sameSet(asList(deal && deal[listField]), ready);
  return { fields, changed };
}

export const categoryWriteOn = () => CONFIG.writeOnSubmit === true;
