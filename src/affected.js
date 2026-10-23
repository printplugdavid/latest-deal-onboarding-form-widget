import { computePrints, departmentFor } from "./printMath";
import { estimateGangSheet } from "./gangSheet";

/*
 * affected.js -- turning "what the agent ticked" into something the print
 * calculation can cost.
 *
 * The calculation itself lives in printMath.js and is the onboarding form's,
 * untouched. This module only decides WHICH parts of the order to hand it.
 */

/*
 * Garment sizes offered in the picker. The main run covers nearly every order;
 * "Other" opens a free-text box for toddler, youth, infant, split hat sizes
 * (S/M, L/XL) and anything else. Big sizes read 2XL-5XL rather than
 * XXL-XXXXXL -- counting X's is how a reorder goes wrong.
 */
export const SIZE_OPTIONS = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "OSFA"];
export const OTHER_SIZE = "__other__";

/*
 * E-46 / E-51. Youth and tall sizes, the same short codes the onboarding form saves (sizeRows.js on
 * main). Kept as their own runs: the size grid shows them on request, and a typed range ("YS-YL 2")
 * only ever spans one run.
 */
export const YOUTH_SIZES = ["YXS", "YS", "YM", "YL", "YXL"];
// E-81 (David, 2026-10-19): toddler 2T / 3T / 4T, the same codes the onboarding form saves. Their own run, like youth.
export const TODDLER_SIZES = ["2T", "3T", "4T"];
export const TALL_SIZES = ["LT", "XLT", "2XLT", "3XLT", "4XLT"];
const ADULT_RUN = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const SIZE_RUNS = [ADULT_RUN, TODDLER_SIZES, YOUTH_SIZES, TALL_SIZES];
export const ALL_SIZES = ADULT_RUN.concat(["OSFA"], TODDLER_SIZES, YOUTH_SIZES, TALL_SIZES);

// What agents actually type -> the code. Compared with spaces, dots and hyphens removed.
const SIZE_ALIASES = {
  XXSMALL: "XXS", XSMALL: "XS", EXTRASMALL: "XS", SM: "S", SML: "S", SMALL: "S",
  MED: "M", MD: "M", MEDIUM: "M", LG: "L", LRG: "L", LARGE: "L",
  XLARGE: "XL", EXTRALARGE: "XL", "1XL": "XL", "1X": "XL",
  XXL: "2XL", "2X": "2XL", XXXL: "3XL", "3X": "3XL", XXXXL: "4XL", "4X": "4XL", XXXXXL: "5XL", "5X": "5XL",
  OS: "OSFA", ONESIZE: "OSFA", OSFM: "OSFA",
  YOUTHXS: "YXS", YOUTHS: "YS", YOUTHSMALL: "YS", YOUTHM: "YM", YOUTHMEDIUM: "YM",
  YOUTHL: "YL", YOUTHLARGE: "YL", YOUTHXL: "YXL",
  TODDLER2: "2T", TODDLER2T: "2T", "2TODDLER": "2T", TODDLER3: "3T", TODDLER3T: "3T", "3TODDLER": "3T",
  TODDLER4: "4T", TODDLER4T: "4T", "4TODDLER": "4T",
  LARGETALL: "LT", XLTALL: "XLT", XXLT: "2XLT", "2XLTALL": "2XLT", XXXLT: "3XLT", "3XLTALL": "3XLT", "4XLTALL": "4XLT",
};
const toSize = (word) => {
  const w = String(word || "").toUpperCase().replace(/[\s.]/g, "");
  if (ALL_SIZES.includes(w)) return w;
  return SIZE_ALIASES[w] || null;
};

/* The sizes between two ends of one run, inclusive, in order. [] when they are not in the same run. */
export function sizeRange(from, to) {
  for (const run of SIZE_RUNS) {
    const a = run.indexOf(from);
    const b = run.indexOf(to);
    if (a !== -1 && b !== -1) return a <= b ? run.slice(a, b + 1) : run.slice(b, a + 1);
  }
  return [];
}

/*
 * E-51 -- sizes typed in one go: "S 3, M 5, L-2XL 2", "3 S 5 M", "2- Youth Large", "S-XL 2 each".
 * A range gets the quantity on EACH size in it. Either order (size then number, or number then size)
 * is read, as long as one line keeps to one order.
 * Returns { rows: [{ size, qty }], unknown: [text the parser could not place] }. Never guesses: a
 * size it does not know ("5T", "S/M") is reported, not dropped and not invented -- that is what the
 * Other row is for.
 */
export function parseSizeText(text) {
  const rows = [];
  const unknown = [];
  const put = (size, qty) => {
    const at = rows.findIndex((r) => r.size === size);
    if (at === -1) rows.push({ size, qty });
    else rows[at] = { size, qty }; // typed twice: the later one wins
  };
  String(text || "")
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\b(YOUTH|EXTRA|ONE)\s+(?=[A-Z])/g, "$1") // "YOUTH LARGE" -> "YOUTHLARGE"
    .replace(/\b(X+L|[2-5]XL|LARGE)\s+TALL\b/g, "$1TALL")
    // E-81: "Toddler 2" / "Toddler 2T" -> "2T" (checked first, so "4 Toddler 2" reads 4 of 2T), then "2 Toddler" -> "2T"
    .replace(/\bTODDLER\s*([2-4])T?\b/g, "$1T")
    .replace(/\b([2-4])\s+TODDLER\b/g, "$1T")
    .split(/[,;\n]+/)
    .forEach((chunk) => {
      const raw = chunk.match(/[0-9]*[A-Z][A-Z0-9/]*|[0-9]+|-/g) || [];
      // -> items: { num } | { sizes: [...] } ; words that mean nothing here are dropped
      const toks = [];
      raw.forEach((t) => {
        if (t === "-") return toks.push({ dash: true });
        if (/^[0-9]+$/.test(t)) return toks.push({ num: parseInt(t, 10) });
        if (["EACH", "EA", "OF", "X", "PCS", "PC", "QTY", "TO", "THRU", "THROUGH", "AND"].includes(t)) {
          return /^(TO|THRU|THROUGH)$/.test(t) ? toks.push({ dash: true }) : null;
        }
        const s = toSize(t);
        return toks.push(s ? { sizes: [s], word: t } : { bad: t });
      });
      // size - size  ->  one range item; any other dash is just punctuation ("3- M")
      const items = [];
      for (let i = 0; i < toks.length; i++) {
        const a = toks[i];
        if (a.sizes && toks[i + 1]?.dash && toks[i + 2]?.sizes) {
          const span = sizeRange(a.sizes[0], toks[i + 2].sizes[0]);
          if (span.length) items.push({ sizes: span });
          else unknown.push(a.word + "-" + toks[i + 2].word);
          i += 2;
        } else if (!a.dash) {
          items.push(a);
        }
      }
      // A chunk holding something unreadable is handed back whole -- half of "5T 2" is not an answer.
      if (items.some((x) => x.bad)) {
        unknown.push(chunk.trim().replace(/\s+/g, " "));
        return;
      }
      const seq = items;
      if (!seq.length) return;
      const numFirst = seq[0].num !== undefined;
      for (let i = 0; i < seq.length; i += 2) {
        const first = seq[i];
        const second = seq[i + 1];
        const num = numFirst ? first : second;
        const size = numFirst ? second : first;
        if (!num || num.num === undefined || !size || !size.sizes) {
          // a size with no number, a number with no size, or the order changed mid-line
          [first, second].forEach((x) => x && unknown.push(x.sizes ? x.sizes.join("-") : String(x.num)));
          continue;
        }
        size.sizes.forEach((sz) => put(sz, num.num));
      }
    });
  return { rows, unknown };
}

/*
 * Put typed / grid quantities into an item's size rows. `entries` is [{ size, qty }]; a blank qty
 * removes that size. Known sizes are kept in chart order with the free-text Other rows after them,
 * so the note reads the same however the agent entered them.
 */
export function mergeSizeRows(existing, entries) {
  let rows = (existing || []).slice();
  (entries || []).forEach(({ size, qty }) => {
    const q = qty === "" || qty === null || qty === undefined ? "" : String(qty);
    rows = rows.filter((r) => r.size !== size);
    if (q !== "") rows.push({ size, other: "", qty: q });
  });
  const known = rows.filter((r) => r.size !== OTHER_SIZE).sort((a, b) => ALL_SIZES.indexOf(a.size) - ALL_SIZES.indexOf(b.size));
  return known.concat(rows.filter((r) => r.size === OTHER_SIZE));
}

const qtyOf = (v) => {
  const n = parseInt(v, 10);
  return n > 0 ? n : 0;
};

/*
 * How many garments this item covers. When the agent breaks the count down by
 * size, the sizes ARE the count -- one source of truth, so the total can never
 * disagree with its own breakdown. Without sizes, the typed total stands.
 */
export function effectiveQty(item) {
  const rows = item?.sizes || [];
  if (rows.length) return rows.reduce((n, r) => n + qtyOf(r.qty), 0);
  return qtyOf(item?.affected);
}

/* "M ×3, L ×2, 3T ×1" -- rows with no quantity are left out. */
export function formatSizes(sizes) {
  return (sizes || [])
    .filter((r) => qtyOf(r.qty) > 0)
    .map((r) => {
      const label = r.size === OTHER_SIZE ? String(r.other || "").trim() || "Other" : r.size;
      return label + " \u00d7" + qtyOf(r.qty);
    })
    .join(", ");
}


export const isGangSheet = (product) => String(product?.productType || "") === "gangsheet";

/*
 * Prints on ONE sheet. From the JSON we can re-run the packing with the
 * onboarding lane's own module; from a note we cannot (no geometry), but the
 * note printed the answer, so the parser kept it.
 */
export function gangPerSheet(product) {
  const hasGeometry =
    product?.gangSheetWidth && product?.gangSheetHeight && (product?.gangGraphics || []).length;
  if (hasGeometry) {
    return estimateGangSheet(product.gangSheetWidth, product.gangSheetHeight, product.gangGraphics)
      .printsPerSheet;
  }
  const n = parseInt(product?.estimatedPrintsPerSheet, 10);
  return n > 0 ? n : 0;
}

/*
 * E-49. A product with no garment to pick and no sheet: patches, stickers, decals, banners,
 * the outsourced products, graphic design, a storefront -- and a garment product that was
 * onboarded with no garment rows. Its unit is the piece. Before this, an order made only of
 * these could not be put through the form at all (Tanner Robison Deal 1, 2026-10-08).
 */
export const isPieceItem = (product) =>
  !!product &&
  !isGangSheet(product) &&
  !(product?.productType === "garment" && (product?.primaryBranches || []).length);

// Pressed Patches is a garment product at onboarding (qty x placements, Vinyl Department).
// With no garment rows to read, a pressed patch is costed as a patch: one per piece.
const pieceName = (product) => {
  const n = String(product?.productName || "").trim();
  return n === "Pressed Patches" ? "Patches" : n;
};

/* The producing department for any product -- pieces included. */
export function departmentForProduct(product) {
  if (isPieceItem(product)) return departmentFor(pieceName(product), "nongarment");
  return departmentFor(product?.productName, product?.productType);
}

const zeroResult = () => ({
  SD: 0, ED: 0, VD: 0, outsourced: 0,
  actual: { SD: 0, ED: 0, VD: 0 },
  projected: { SD: 0, ED: 0, VD: 0 },
});

/*
 * What one affected item costs. Garments go through the onboarding form's
 * calculation; gang sheets are prints-per-sheet x sheets being reprinted,
 * with NO heat-press multiplier -- the sheet ships unpressed, so one print is
 * one print (onboarding D-13). Gang sheet prints land in the Vinyl Department
 * slot, matching where the original job's roll up (David, 2026-09-22).
 * Pieces (E-49) are costed exactly as onboarding costs a non-garment product:
 * one per piece in the Vinyl Department for the in-house names, nothing for the
 * rest -- those are recorded with a count of 0.
 */
export function costItem(products, item, formType) {
  const product = products?.[item?.productIndex];
  if (!product) return zeroResult();

  if (isGangSheet(product)) {
    const sheets = effectiveQty(item);
    const perSheet = gangPerSheet(product);
    const total = perSheet * sheets;
    const r = zeroResult();
    r.VD = total;
    r.actual.VD = total;
    r.gang = { sheets, perSheet };
    return r;
  }

  if (isPieceItem(product)) {
    const qty = effectiveQty(item);
    const r = computePrints([
      { productName: pieceName(product), productType: "nongarment", quantityOrdered: String(qty) },
    ]);
    r.piece = { qty };
    return r;
  }

  return computePrints(syntheticProducts(products, item, formType));
}

/*
 * Every placement on a garment, flattened, so a correction can pick the ones
 * actually being redone. A graphic that records a placement count but no
 * placement detail still contributes selectable slots.
 */
export function placementsOf(branch) {
  const out = [];
  (branch?.secondaryBranches || []).forEach((g, gi) => {
    const detail = g?.tartiaryBranches || [];
    const n = detail.length || parseInt(g?.numberOfPlacements, 10) || 0;
    for (let pi = 0; pi < n; pi++) {
      out.push({ key: gi + ":" + pi, gi, pi, graphic: g, placement: detail[pi] || null });
    }
  });
  return out;
}

export function syntheticProducts(products, item, formType) {
  const product = products[item.productIndex];
  if (!product) return [];
  const branch = product?.primaryBranches?.[item.garmentIndex];
  if (!branch) return [];

  let graphics = branch.secondaryBranches || [];
  if (formType === "Correction") {
    /*
     * Only the ticked placements are costed. A shirt with three placements
     * where one is redone costs one placement, not three -- so each graphic is
     * narrowed to however many of ITS placements were selected, and graphics
     * with none selected drop out entirely.
     */
    const perGraphic = {};
    (item.placementKeys || []).forEach((k) => {
      const gi = Number(String(k).split(":")[0]);
      perGraphic[gi] = (perGraphic[gi] || 0) + 1;
    });
    graphics = graphics
      .map((g, gi) => (perGraphic[gi] ? { ...g, numberOfPlacements: String(perGraphic[gi]) } : null))
      .filter(Boolean);
    if (!graphics.length) return [];
  } else if (Array.isArray(item.graphicKeys)) {
    /*
     * E-37 (2026-10-02). A revision reprints every graphic on the garment -- unless the agent
     * says which ones these garments actually carry. Needed when an order was onboarded with
     * several different garments lumped into ONE garment type: Flute Summit Deal 2 had 12
     * garments and 7 graphics, one logo per garment, and a 5-garment revision came out as
     * 5 x 7 x 2 = 70 prints instead of 10. `graphicKeys` undefined/null = all (the default,
     * and exactly the old behaviour); an array = only those graphic indexes.
     */
    const keep = item.graphicKeys.map(Number);
    graphics = graphics.filter((_, gi) => keep.indexOf(gi) >= 0);
    if (!graphics.length) return [];
  }

  return [
    {
      ...product,
      primaryBranches: [
        { ...branch, garmentQuantity: String(effectiveQty(item)), secondaryBranches: graphics },
      ],
    },
  ];
}

/*
 * Embroidery prints broken down by placement size, for one affected item.
 *
 * Onboarding now splits Embroidery_Department_Prints into Small/Medium/Large
 * Deal fields. Revisions have no equivalent fields -- and adding them would be
 * 15 of them across the slots -- so the breakdown goes in the note instead,
 * where it can be read without a schema change. David's call, 2026-09-02.
 *
 * Embroidery costs qty x placements, so each placement contributes the full
 * affected quantity, attributed to that placement's size. A placement with no
 * size recorded counts as Unsized rather than being guessed at -- the same
 * ruling onboarding applied.
 */
/*
 * Does this graphic produce any prints at all? Mirrors printMath.js's D-16 rule:
 * a BLANK number falls back to the rows the agent built, an explicit "0" or a
 * negative means none. A graphic that prints nothing has nothing to attribute,
 * which is what keeps Small+Medium+Large <= the embroidery total.
 *
 * This duplicates three lines of the shared module on purpose -- we need the
 * answer per graphic, and printMath only returns totals. The cross-check test in
 * affected.test.js asserts we still agree with it across blank / "0" / "-2" /
 * normal, so if that rule ever moves, the suite says so rather than drifting.
 */
function graphicPrints(graphic) {
  const typed = parseInt(graphic?.numberOfPlacements, 10);
  const rows = (graphic?.tartiaryBranches || []).length;
  return (isNaN(typed) ? rows : Math.max(0, typed)) > 0;
}

export function embroiderySizes(products, item, formType) {
  const out = { Small: 0, Medium: 0, Large: 0, Unsized: 0 };

  const product = products?.[item?.productIndex];
  if (!product || String(product.productName || "").trim() !== "Embroidery") return out;

  const branch = product?.primaryBranches?.[item.garmentIndex];
  if (!branch) return out;

  const qty = effectiveQty(item);
  if (!qty) return out;

  // A revision reprints every placement; a correction only the ticked ones.
  const picked = formType === "Correction" ? item.placementKeys || [] : null;
  // E-37: on a revision, only the graphics the agent kept ticked (null = all).
  const keptGraphics =
    formType !== "Correction" && Array.isArray(item.graphicKeys) ? item.graphicKeys.map(Number) : null;

  placementsOf(branch).forEach((x) => {
    if (picked && picked.indexOf(x.key) < 0) return;
    if (keptGraphics && keptGraphics.indexOf(x.gi) < 0) return;
    if (!graphicPrints(x.graphic)) return;
    const size = String(x.placement?.placementSize || "").trim();
    if (size === "Small" || size === "Medium" || size === "Large") out[size] += qty;
    else out.Unsized += qty;
  });

  return out;
}

/*
 * E-124 (David 10-23, Gingerich Site & Underground): one garment type on the order can hold more than one style (long sleeves AND
 * hoodies under one "Garment Type"). The revision / correction then named both and the wrong one was reordered. These are the
 * styles to choose from -- [] when the garment type is a single style, so nothing is asked and the note reads as before.
 *   style = { key, garment, skus }   garment: what to call it; skus: its SKU codes (one style can have several size-band codes)
 * Sources, best first: product names from the picker (E-100) · the Garment Type lines paired in order with the SKU styles when the
 * counts match (reps type both in the same order) · the SKU codes alone · the Garment Type lines alone (older orders, no SKUs).
 */
const BAND = /^(Y|T|LT)?\(?([0-9]?X{0,4}[SML]|[0-9]?X{1,4}L?T?|OSFA|[0-9]T|ONE SIZE)\)?(\s*-\s*([0-9]?X{0,4}[SML]|[0-9]?X{1,4}L?T?|[0-9]T))?$/i;
const stemOf = (name) => {
  const parts = String(name || "").split(/\s+-\s+/);
  return parts.length > 1 && BAND.test(parts[parts.length - 1].trim()) ? parts.slice(0, -1).join(" - ") : String(name || "").trim();
};
export function garmentStyles(branch) {
  const lines = String(branch?.garmentType || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const rows = (branch?.garmentSkus || [])
    .map((r) => ({ sku: String(r?.sku || "").trim().toUpperCase(), name: String(r?.productName || "").trim() }))
    .filter((r) => r.sku && r.sku !== "PPCO"); // the client's own garment row is not a style
  // Group size-band codes of one style: the same product name, or a code that is another code + one digit (PC78H, PC78H2).
  const fams = [];
  rows.forEach((r) => {
    const stem = r.name ? stemOf(r.name).toLowerCase() : "";
    let f = fams.find((x) => (stem && x.stem === stem) || x.skus.some((s) => r.sku === s || (/\d$/.test(r.sku) && r.sku.slice(0, -1) === s) || (/\d$/.test(s) && s.slice(0, -1) === r.sku)));
    if (f && stem && f.stem && f.stem !== stem) f = null;
    if (!f) fams.push((f = { stem, name: r.name ? stemOf(r.name) : "", skus: [] }));
    if (!f.skus.includes(r.sku)) f.skus.push(r.sku);
    if (!f.stem && stem) Object.assign(f, { stem, name: stemOf(r.name) });
  });
  if (fams.length >= 2) {
    const paired = lines.length === fams.length && fams.every((f) => !f.name);
    return fams.map((f, k) => ({ key: f.skus[0], garment: f.name || (paired ? lines[k] : ""), skus: f.skus }));
  }
  if (!rows.length && lines.length >= 2) return lines.map((l, k) => ({ key: "line" + k, garment: l, skus: [] }));
  return [];
}

/* "Port and Company Hoodie (PC78H)" -- how a style reads in the picker. */
export const styleLabel = (s) => (s.garment ? s.garment + (s.skus.length ? " (" + s.skus.join(", ") + ")" : "") : s.skus.join(", "));
