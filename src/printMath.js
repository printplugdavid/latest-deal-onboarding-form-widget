/*
 * printMath.js -- THE definition of how prints are counted.
 *
 * Lifted VERBATIM from the onboarding form's submit handler. The arithmetic
 * below is the onboarding form's, unchanged: same order of operations, same
 * product buckets, same catch-all. Do not "improve" it here. If print counting
 * ever needs to change it changes in this file, and both forms move together.
 *
 * The onboarding form passes the full products array. The revision form passes
 * a synthetic products array containing only the affected garments, with
 * garmentQuantity replaced by the number of garments being redone -- so a
 * revision is costed by exactly the same rules as the job that caused it.
 */

export function computePrints(products) {
  let vinylDeptPrints = 0;
  let embroideryPrints = 0;
  let screenPrintPrints = 0;
  let outsourcedProducts = 0;
  let vinylActualPrints = 0;
  let vinylProjectedPrints = 0;
  let embroideryActualPrints = 0;
  let embroideryProjectedPrints = 0;
  let screenActualPrints = 0;
  let screenProjectedPrints = 0;
  let dtgPrints = 0;
  let dtfPrints = 0;
  let htvPrints = 0;
  let vinylPrints = 0;
  let stickersPrints = 0;
  let decalsPrints = 0;
  let bannersPrints = 0;
  let postersPrints = 0;
  let magnetsPrints = 0;
  let patchesPrints = 0;

  const screenPrintDept = ["Screen Printing"];
  const embroideryDept = ["Embroidery"];
  const heatPressProducts = ["Direct-to-Garment", "Direct-to-Film", "Heat-Transfer"];

  (products || []).forEach((product) => {
    const pName = product?.productName;
    const heatPressMultiplier = heatPressProducts.includes(pName) ? 2 : 1;
    const ironValue = product?.premiumIronPass === "Yes" ? 1 : 0;
    if (product?.productType === "garment") {
      product?.primaryBranches?.forEach((branch) => {
        const qty = parseInt(branch?.garmentQuantity) || 0;
        branch?.secondaryBranches?.forEach((graphic) => {
          const colors = parseInt(graphic?.numberOfColorsUsed) || 1;
          const placements = parseInt(graphic?.numberOfPlacements) || 0;
          const underbase = graphic?.underbase;
          const underbaseValue =
            underbase === "Single-pass"
              ? 1
              : underbase === "Double-pass"
              ? 2
              : underbase === "Triple-pass"
              ? 3
              : 0;
          if (screenPrintDept.includes(pName)) {
            const actual = qty * colors * placements;
            const projected = qty * (underbaseValue + ironValue);
            screenActualPrints += actual;
            screenProjectedPrints += projected;
            screenPrintPrints += actual + projected;
          } else if (embroideryDept.includes(pName)) {
            const actual = qty * placements;
            embroideryActualPrints += actual;
            embroideryPrints += actual;
          } else if (pName === "Direct-to-Garment") {
            const actual = qty * placements;
            const total = actual * heatPressMultiplier;
            vinylActualPrints += actual;
            vinylProjectedPrints += total - actual;
            dtgPrints += total;
          } else if (pName === "Direct-to-Film") {
            const actual = qty * placements;
            const total = actual * heatPressMultiplier;
            vinylActualPrints += actual;
            vinylProjectedPrints += total - actual;
            dtfPrints += total;
          } else if (pName === "Heat-Transfer") {
            const actual = qty * colors * placements;
            const total = actual * heatPressMultiplier;
            vinylActualPrints += actual;
            vinylProjectedPrints += total - actual;
            htvPrints += total;
          } else if (pName === "Vinyl") {
            const actual = qty * colors * placements;
            vinylActualPrints += actual;
            vinylPrints += actual;
          } else if (pName === "Pressed Patches") {
            const actual = qty * placements;
            vinylActualPrints += actual;
            patchesPrints += actual;
          }
        });
      });
    } else if (product?.productType === "nongarment") {
      const qty = parseInt(product?.quantityOrdered) || 0;
      if (pName === "Patches") {
        vinylActualPrints += qty;
        patchesPrints += qty;
      } else if (pName === "Stickers") {
        vinylActualPrints += qty;
        stickersPrints += qty;
      } else if (pName === "Decals") {
        vinylActualPrints += qty;
        decalsPrints += qty;
      } else if (pName === "Banners") {
        vinylActualPrints += qty;
        bannersPrints += qty;
      } else if (pName === "Posters") {
        vinylActualPrints += qty;
        postersPrints += qty;
      } else if (pName === "Magnets" || pName === "Fridge Magnets") {
        vinylActualPrints += qty;
        magnetsPrints += qty;
      } else {
        outsourcedProducts += qty;
      }
    }
  });

  vinylDeptPrints =
    dtgPrints +
    dtfPrints +
    htvPrints +
    vinylPrints +
    stickersPrints +
    decalsPrints +
    bannersPrints +
    postersPrints +
    magnetsPrints +
    patchesPrints;

  return {
    // department roll-ups -- what the revision/correction slot fields receive
    SD: screenPrintPrints,
    ED: embroideryPrints,
    VD: vinylDeptPrints,
    outsourced: outsourcedProducts,
    // actual / projected split -- for the note, not for the fields
    actual: {
      SD: screenActualPrints,
      ED: embroideryActualPrints,
      VD: vinylActualPrints,
    },
    projected: {
      SD: screenProjectedPrints,
      ED: embroideryProjectedPrints,
      VD: vinylProjectedPrints,
    },
    perJob: {
      dtg: dtgPrints,
      dtf: dtfPrints,
      htv: htvPrints,
      vinyl: vinylPrints,
      stickers: stickersPrints,
      decals: decalsPrints,
      banners: bannersPrints,
      posters: postersPrints,
      magnets: magnetsPrints,
      patches: patchesPrints,
    },
  };
}

/*
 * Which department owns the reprint, derived from productName. Same buckets the
 * calculation above uses, so the pre-filled department can never disagree with
 * the numbers. Returns the picklist option exactly as CRM shows it -- that is
 * what the API reads and writes.
 */
export const VINYL_DEPT = "Vinyl Department";

export function departmentFor(productName, productType) {
  const p = String(productName || "").trim();
  if (p === "Screen Printing") return "Screen Printing";
  if (p === "Embroidery") return "Embroidery";
  if (p === "Graphic Design") return "Graphic Design";
  if (productType === "garment") return VINYL_DEPT;
  if (["Patches", "Stickers", "Decals", "Banners", "Posters", "Magnets", "Fridge Magnets"].includes(p)) {
    return VINYL_DEPT;
  }
  return "Outsourced";
}
