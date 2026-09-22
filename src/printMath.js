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
 *
 * ADOPTED ON main 2026-09-22 (E-8 / D-11), and extended here with the two things the
 * onboarding form had that the lifted copy did not:
 *   - the embroidery placement-size split (Small/Medium/Large), shipped in c569647
 *   - DTF gang sheets (D-13/D-14), whose prints are computed by gangSheet.js
 * Both are ADDITIVE for the revision form: new keys on the returned object, and a product
 * type it does not pass. The arithmetic that existed before is untouched -- verified by
 * differential test against the previous inline engine (docs/03, 2026-09-22 (11)).
 */
import { gangSheetPrints } from "./gangSheet";

/*
 * Negative input can only ever be a typo, and a negative print count is never a correct result --
 * but every multiplicand below was unguarded, so "-2" placements on 10 garments booked -20 prints.
 * The onboarding form's watchers reject negatives in the UI; the revision form feeds this module
 * parsed note text, where no watcher has ever run. The engine is the last line of defence, so the
 * guard belongs here, at all four sites, with one idiom (revision lane's ack, 2026-09-22).
 *
 * It changes negative input ONLY: "3"->3, ""->0, undefined->0, "0"->the existing default. Nothing
 * that was already correct moves.
 */
const atLeastZero = (n) => (n > 0 ? n : 0);

/*
 * Colours are the exception, and deliberately so (revision lane's gate run, 2026-09-22). The other
 * three multiplicands default to 0 because zero garments, placements or items genuinely means no
 * work. A graphic that exists is never printed in zero colours, which is why this field has always
 * defaulted to 1 -- "", undefined, "abc" and even "0" all count as one colour. Flooring it at 0
 * would have made a NEGATIVE the only bad input that makes a screen-print graphic vanish, adding a
 * novel route to SD = 0 in the middle of an open zeros investigation. This folds the negative into
 * the existing default instead of contradicting it, and replaces the old `|| 1` rather than wrapping it.
 */
const atLeastOne = (n) => (n > 0 ? n : 1);

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
  let embroiderySmallPrints = 0;
  let embroideryMediumPrints = 0;
  let embroideryLargePrints = 0;
  let dtgPrints = 0;
  let dtfPrints = 0;
  let gangSheetPrintsTotal = 0;
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
        const qty = atLeastZero(parseInt(branch?.garmentQuantity) || 0);
        branch?.secondaryBranches?.forEach((graphic) => {
          const colors = atLeastOne(parseInt(graphic?.numberOfColorsUsed));
          const placements = atLeastZero(parseInt(graphic?.numberOfPlacements) || 0);
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
            // Split by the per-placement size selector. Iterate the placement ROWS, not
            // numberOfPlacements: a placement with no size counts in the department total and
            // in NO bucket, so the split never invents a size (the shortfall shows as Unsized).
            (graphic?.tartiaryBranches || []).forEach((placement) => {
              const size = placement?.placementSize;
              if (size === "Small") embroiderySmallPrints += qty;
              else if (size === "Medium") embroideryMediumPrints += qty;
              else if (size === "Large") embroideryLargePrints += qty;
            });
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
      const qty = atLeastZero(parseInt(product?.quantityOrdered) || 0);
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
    } else if (product?.productType === "gangsheet") {
      // DTF Gang Sheet: prints are computed from the sheet and graphic sizes (gangSheet.js),
      // times the number of sheets. NO heat-press multiplier -- the sheet ships unpressed.
      // Its own Deal field (D-14), and it still rolls into the Vinyl Department total.
      //
      // ⚠️ .total is printsPerSheet x numberOfGangSheets -- the sheets ORDERED. That is right here,
      // because onboarding always costs the whole order. It is WRONG for any partial job: a re-run,
      // a split shipment, or a reprint of 1 sheet on a 3-sheet order bills 3x. Anything costing part
      // of a gang-sheet job must use estimateGangSheet().printsPerSheet x the sheets actually done.
      // The revision form already intercepts gang sheets before this line for exactly that reason
      // (revision lane, 2026-09-22).
      const gangTotal = gangSheetPrints(product).total;
      vinylActualPrints += gangTotal;
      gangSheetPrintsTotal += gangTotal;
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
    patchesPrints +
    gangSheetPrintsTotal;

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
    // embroidery placement-size split -- three Deal fields; they sum to ED unless a
    // placement had no size, in which case the shortfall is deliberate (Unsized).
    embroiderySizes: {
      small: embroiderySmallPrints,
      medium: embroideryMediumPrints,
      large: embroideryLargePrints,
    },
    perJob: {
      gangSheet: gangSheetPrintsTotal,
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
  // A DTF gang sheet is Vinyl Department work. Its prints get their own Deal
  // field (DTF_Gang_Sheet_Prints) AND roll into Vinyl_Department_Prints, so a
  // revision of one belongs in the VD slot (David, 2026-09-22).
  if (productType === "gangsheet") return VINYL_DEPT;
  if (productType === "garment") return VINYL_DEPT;
  if (["Patches", "Stickers", "Decals", "Banners", "Posters", "Magnets", "Fridge Magnets"].includes(p)) {
    return VINYL_DEPT;
  }
  return "Outsourced";
}
