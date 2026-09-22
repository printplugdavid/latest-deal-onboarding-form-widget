/*
 * gangSheet.js -- how many prints fit on a DTF gang sheet.
 *
 * One implementation, two callers: DtfGangSheetForm.jsx shows the estimate live while sales type,
 * and onSubmit uses the same numbers for the Deal fields, the note and the production card. Keep it
 * pure: no ZOHO, no React, no state.
 *
 * D-13 (2026-09-21, David): a gang sheet is its own product, its print count is COMPUTED from the
 * sheet size + each graphic's size with an average half-inch gap between graphics, and it carries NO
 * heat-press multiplier -- the sheet ships unpressed, so one print is one print. David called the
 * packing rule "something like this to start", so the tunables are named constants right here.
 */

// Average space between graphics on the sheet, in inches. Between graphics only -- no edge margin,
// because the film is trimmed to the artwork.
export const GANG_GAP_INCHES = 0.5;

const num = (v) => {
  const n = parseFloat(v);
  return isNaN(n) || n <= 0 ? 0 : n;
};
const count = (v) => {
  const n = parseInt(v);
  return isNaN(n) || n < 0 ? 0 : n;
};

// How many of a w x h graphic fit across a sheet of width sheetW.
const across = (sheetW, w) =>
  w <= 0 ? 0 : Math.floor((sheetW + GANG_GAP_INCHES) / (w + GANG_GAP_INCHES));

/*
 * Shelf packing, in the order sales entered the graphics: each graphic takes as many full rows as it
 * needs, and the next graphic starts below. It is an estimate, not a nesting algorithm -- a real
 * operator nests better than this, so treat the result as a floor.
 *
 * Per graphic, "quantityPerSheet" blank means FILL the space that is left with that graphic; a number
 * means place exactly that many. Each graphic is tried in both orientations and the better one wins,
 * because sheets are ganged both ways in practice.
 *
 * graphics: [{ graphicWidth, graphicHeight, quantityPerSheet }]
 * returns  { printsPerSheet, perGraphic: [{ placed, requested, rows, across, rotated, fits }],
 *            overflow, heightUsed, heightLeft }
 */
export function estimateGangSheet(sheetWidth, sheetHeight, graphics) {
  const sheetW = num(sheetWidth);
  const sheetH = num(sheetHeight);
  const rows = [];
  let heightLeft = sheetH;
  let printsPerSheet = 0;
  let overflow = false;

  (graphics || []).forEach((g) => {
    const w = num(g?.graphicWidth);
    const h = num(g?.graphicHeight);
    const requested = count(g?.quantityPerSheet);
    if (!sheetW || !sheetH || !w || !h) {
      rows.push({ placed: 0, requested, rows: 0, across: 0, rotated: false, fits: false });
      return;
    }

    // Try the graphic as entered and rotated 90 degrees; keep whichever places more.
    const tries = [
      { w, h, rotated: false },
      { w: h, h: w, rotated: true },
    ].map((o) => {
      const perRow = across(sheetW, o.w);
      if (!perRow) return { placed: 0, rowsUsed: 0, perRow: 0, ...o };
      const rowsThatFit = Math.floor((heightLeft + GANG_GAP_INCHES) / (o.h + GANG_GAP_INCHES));
      if (requested > 0) {
        const rowsNeeded = Math.ceil(requested / perRow);
        const rowsUsed = Math.min(rowsNeeded, Math.max(rowsThatFit, 0));
        return { placed: Math.min(requested, rowsUsed * perRow), rowsUsed, perRow, ...o };
      }
      return { placed: Math.max(rowsThatFit, 0) * perRow, rowsUsed: Math.max(rowsThatFit, 0), perRow, ...o };
    });
    const best = tries[0].placed >= tries[1].placed ? tries[0] : tries[1];

    // A requested quantity that does not fit is still counted -- production prints what was asked,
    // and the form warns that it needs more than one sheet. Never silently drop a print.
    const placed = requested > 0 ? requested : best.placed;
    if (requested > 0 && best.placed < requested) overflow = true;

    heightLeft = Math.max(heightLeft - best.rowsUsed * (best.h + GANG_GAP_INCHES), 0);
    printsPerSheet += placed;
    rows.push({
      placed,
      requested,
      rows: best.rowsUsed,
      across: best.perRow,
      rotated: best.rotated,
      fits: requested > 0 ? best.placed >= requested : best.placed > 0,
    });
  });

  return {
    printsPerSheet,
    perGraphic: rows,
    overflow,
    heightUsed: Math.max(sheetH - heightLeft, 0),
    heightLeft,
  };
}

// The product's whole contribution: prints on one sheet x how many sheets were ordered.
export function gangSheetPrints(product) {
  const sheets = count(product?.numberOfGangSheets) || 0;
  const { printsPerSheet, overflow, perGraphic } = estimateGangSheet(
    product?.gangSheetWidth,
    product?.gangSheetHeight,
    product?.gangGraphics
  );
  return { sheets, printsPerSheet, total: printsPerSheet * sheets, overflow, perGraphic };
}
