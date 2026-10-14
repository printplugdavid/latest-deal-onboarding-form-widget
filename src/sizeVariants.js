/*
 * sizeVariants.js -- E-67 (the team, 2026-10-14; David: "I believe that is fine").
 * "Production cards do not represent specific graphics when they go on different sizes of shirts." A placement
 * printed 10" wide on adult shirts may be 8" on youth and 12" on 2XL and up. A placement can now carry, besides its
 * usual Size & Dimensions, a short list of exceptions: a garment-size GROUP (picked) and that group's dimensions.
 * Saved on the placement as `sizeVariants: [{ sizes, dimensions }]`. Nothing here changes a print count.
 * Pure: no React, no ZOHO.
 */
export const SIZE_GROUPS = ["Youth", "Toddler", "Small–Medium", "Large–XL", "2XL and up", "Tall sizes", "Ladies' fit"];

const str = (v) => String(v == null ? "" : v).trim();

/* Only the rows with both a group and a dimension. */
export const cleanVariants = (list) =>
  (Array.isArray(list) ? list : []).map((r) => ({ sizes: str(r && r.sizes), dimensions: str(r && r.dimensions) })).filter((r) => r.sizes && r.dimensions);

/* "Youth: 8 in wide · 2XL and up: 12 in wide" -- or "" when there are none. */
export const formatSizeVariants = (list) => cleanVariants(list).map((r) => r.sizes + ": " + r.dimensions).join(" · ");
