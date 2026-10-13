/*
 * garmentSplit.js -- E-58. "Split this garment type": a checkbox on every garment type in the
 * onboarding form (David, 2026-10-13 -- a plain control the rep ticks, never something inferred
 * from what they wrote).
 *
 * Why: the form's rule is "every graphic on a garment type goes on every garment of that type",
 * and the print count multiplies accordingly. Jeb Shippy Deal 1 was two identical hoodies entered
 * as one garment type with three graphics, each meant for one hoodie: counted 6, real 3 -- and the
 * card it produced got the left chest stitched onto both (docs/04 E-58).
 *
 * What the tick does: adds a COPY of the garment type as a new garment (same style, SKUs, vendor
 * and graphics; quantity and sizes left blank so nothing is counted twice). In every garment of a
 * split, each graphic then has its own tick -- "this garment gets this graphic". When the form is
 * submitted, unticked graphics are left out of that garment, so what is saved is two ordinary
 * garment types, each with exactly its own graphics. The print count, the saved order's shape, the
 * note and the revision form are all unchanged -- this only changes what is entered.
 *
 * Pure: no React, no ZOHO.
 */
import { LUMPED_FIELD } from "./lumpedOrder";

export const SPLIT_OF = "splitOf"; // on a garment: the 1-based number of the garment it was split from. Saved (harmless, additive).
export const ON_GARMENT = "onThisGarment"; // on a graphic: false = this garment does not get it. Screen-only: never saved.

export const SPLIT_LABEL = "Split this garment type — some of these garments get different graphics";

const clone = (v) => JSON.parse(JSON.stringify(v == null ? {} : v));
const int = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/* The copy a split adds. `number` = the 1-based number of the garment being split. */
export function splitCopy(garment, number) {
  const copy = clone(garment);
  copy.garmentQuantity = "";
  copy.countColorSize = "";
  copy[SPLIT_OF] = number;
  delete copy[LUMPED_FIELD]; // the copy has not been asked anything
  delete copy.id;
  return copy;
}

/*
 * How garment `i` (0-based) sits in a split, read from the garments as they are now.
 *   copies     -- 1-based numbers of the garments split FROM this one
 *   splitOf    -- the number this one was split from, or null
 *   group      -- every garment number in the same split, in order (empty when not split)
 *   quantities -- each group member's quantity (0 when blank), total -- their sum
 *   canUndo    -- this garment has exactly one copy and it is the LAST garment (so removing it is
 *                 the form's ordinary "one fewer garment type")
 */
export function splitInfo(garments, i) {
  const list = Array.isArray(garments) ? garments : [];
  const number = i + 1;
  const of = (g) => int(g && g[SPLIT_OF]);
  const rootOf = (n) => {
    let cur = n;
    for (let hops = 0; hops < list.length; hops++) {
      const parent = of(list[cur - 1]);
      if (!parent || parent === cur || parent > list.length) break;
      cur = parent;
    }
    return cur;
  };
  const copies = list.map((g, n) => (of(g) === number ? n + 1 : 0)).filter(Boolean);
  const parent = of(list[i]);
  const splitOf = parent && parent !== number && parent <= list.length ? parent : null;
  const root = rootOf(number);
  const members = list.map((_, n) => n + 1).filter((n) => rootOf(n) === root);
  const group = members.length > 1 ? members : [];
  const quantities = group.map((n) => int(list[n - 1] && list[n - 1].garmentQuantity));
  return {
    copies,
    splitOf,
    group,
    quantities,
    total: quantities.reduce((a, b) => a + b, 0),
    canUndo: copies.length === 1 && copies[0] === list.length && splitInfo.noCopies(list, copies[0]),
  };
}
// a copy that has itself been split cannot be removed from under its own copies
splitInfo.noCopies = (list, number) => !list.some((g) => g && parseInt(g[SPLIT_OF], 10) === number);

/*
 * What is actually submitted: in every garment that is PART OF A SPLIT, the graphics unticked for it
 * are left out, and "Number of Graphics" is brought in line. The screen-only tick is removed from
 * every graphic everywhere. A tick left behind on a garment that is no longer split (the split was
 * undone) is ignored -- a graphic can only be left out where the rep can see the tick.
 * Never mutates its input; an order with no split and no ticks comes back equal to what went in.
 */
export function applyGarmentSplits(data) {
  if (!data || !Array.isArray(data.products)) return data;
  return {
    ...data,
    products: data.products.map((p) => {
      if (!p || p.productType !== "garment" || !Array.isArray(p.primaryBranches)) return p;
      return {
        ...p,
        primaryBranches: p.primaryBranches.map((g, gi) => {
          if (!g || !Array.isArray(g.secondaryBranches)) return g;
          const touched = g.secondaryBranches.some((gr) => gr && Object.prototype.hasOwnProperty.call(gr, ON_GARMENT));
          if (!touched) return g;
          const inSplit = splitInfo(p.primaryBranches, gi).group.length > 1;
          const kept = g.secondaryBranches
            .filter((gr) => !(inSplit && gr && gr[ON_GARMENT] === false))
            .map((gr) => {
              if (!gr) return gr;
              const { [ON_GARMENT]: _tick, ...rest } = gr;
              return rest;
            });
          const dropped = kept.length !== g.secondaryBranches.length;
          return { ...g, secondaryBranches: kept, ...(dropped ? { numberOfGraphics: String(kept.length) } : {}) };
        }),
      };
    }),
  };
}
