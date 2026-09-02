/*
 * affected.js -- turning "what the agent ticked" into something the print
 * calculation can cost.
 *
 * The calculation itself lives in printMath.js and is the onboarding form's,
 * untouched. This module only decides WHICH parts of the order to hand it.
 */

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
        { ...branch, garmentQuantity: String(item.affected || 0), secondaryBranches: graphics },
      ],
    },
  ];
}
