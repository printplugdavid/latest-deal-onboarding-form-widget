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

  placementsOf(branch).forEach((x) => {
    if (picked && picked.indexOf(x.key) < 0) return;
    const size = String(x.placement?.placementSize || "").trim();
    if (size === "Small" || size === "Medium" || size === "Large") out[size] += qty;
    else out.Unsized += qty;
  });

  return out;
}
