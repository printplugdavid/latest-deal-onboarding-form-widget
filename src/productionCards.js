/*
 * productionCards.js -- the production card generator, moved verbatim out of App.jsx so the
 * card viewer can rebuild a deal's cards from onboarding-form.json without loading the form.
 * App.jsx imports it for submit; CardViewer.jsx imports it to rebuild a deal's cards.
 * Keep it pure: no ZOHO, no React, no state.
 */

import { gangSheetPrints } from "./gangSheet";
import { readColorSwatches } from "./colorLibrary";
import { artNames } from "./graphicArt";
import { buildColorMatches, COLOR_MATCH_CAVEAT } from "./colorMatch";
import { sizeBlocks, stylesNotMarked } from "./sizeRows";
import { formatSizeVariants } from "./sizeVariants";
import { itemText, orderGarments, sortBoxesForCard } from "./production/boxContents";

/*
 * E-65 (David, 2026-10-14): the Graphic Design card says what FILE each graphic needs for its print method, so the
 * designer knows the exact deliverable. David's list: embroidery -> DST; screen print -> vector, color-separated (or
 * run through Action Seps); DTG and DTF -> PNG; HTV -> usually vector ("I think!" -- to confirm). The rest are not
 * stated yet and show nothing rather than a guess. A "Print Methods" document may feed this later.
 */
export const FILE_NEEDED = {
  Embroidery: "DST - a digitized embroidery file",
  "Screen Printing": "Vector (AI / EPS / PDF), color-separated - or run through Action Seps",
  "Direct-to-Garment": "PNG - transparent background, full resolution at print size",
  "Direct-to-Film": "PNG - transparent background, full resolution at print size",
  "DTF Gang Sheet": "PNG - transparent background, full resolution at print size",
  "Heat-Transfer": "Vector cut file (AI / EPS / SVG) - to confirm",
};

// ===== Production card generator (attached to the Deal as per-department HTML job sheets) =====
const pcEsc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pcHas = (v) => v !== undefined && v !== null && String(v).trim() !== "" && v !== false && v !== "false";
const pcSkus = (g) => (g?.garmentSkus || []).map((r) => r?.sku).filter((v) => pcHas(v)).join(", ");
const pcDate = (d) => { if (!pcHas(d)) return ""; const o = new Date(d); return isNaN(o) ? String(d) : `${o.getFullYear()}-${String(o.getMonth() + 1).padStart(2, "0")}-${String(o.getDate()).padStart(2, "0")}`; };
const PC_ROUTE = {
  "Screen Printing": { card: "screenprint", job: "Screen Printing", key: "screenPrintPrints" },
  "Embroidery": { card: "embroidery", job: "Embroidery", key: "embroideryPrints" },
  "Direct-to-Garment": { card: "vinyl", job: "DTG", key: "dtgPrints" },
  "Direct-to-Film": { card: "vinyl", job: "DTF", key: "dtfPrints" },
  "Heat-Transfer": { card: "vinyl", job: "HTV", key: "htvPrints" },
  "Vinyl": { card: "vinyl", job: "Vinyl", key: "vinylPrints" },
  "Pressed Patches": { card: "vinyl", job: "Patches", key: "patchesPrints" },
  "Patches": { card: "vinyl", job: "Patches", key: "patchesPrints" },
  "Stickers": { card: "vinyl", job: "Stickers", key: "stickersPrints" },
  "Decals": { card: "vinyl", job: "Decals", key: "decalsPrints" },
  "Banners": { card: "vinyl", job: "Banners", key: "bannersPrints" },
  "Posters": { card: "vinyl", job: "Posters", key: "postersPrints" },
  "Magnets": { card: "vinyl", job: "Magnets", key: "magnetsPrints" },
  "Fridge Magnets": { card: "vinyl", job: "Magnets", key: "magnetsPrints" },
};
const PC_META = {
  screenprint: { title: "SCREEN PRINT / SERIGRAFÍA", file: "production-card-screenprint.html", dept: "Screen Print", countKey: "screenPrintPrints", bi: true },
  embroidery: { title: "EMBROIDERY", file: "production-card-embroidery.html", dept: "Embroidery", countKey: "embroideryPrints", bi: false },
  vinyl: { title: "VINYL DEPARTMENT", file: "production-card-vinyl.html", dept: "Vinyl", countKey: "vinylDeptPrints", bi: false },
  outsourced: { title: "OUTSOURCED — ORDER / STOCK", file: "production-card-outsourced.html", dept: "Outsourced", countKey: "outsourcedProducts", bi: false },
  graphicdesign: { title: "GRAPHIC DESIGN / ARTWORK", file: "production-card-graphicdesign.html", dept: "Graphics", countKey: null, bi: false },
  storefront: { title: "ONLINE STOREFRONT", file: "production-card-storefront.html", dept: "Online Storefront", countKey: null, bi: false },
  colormatch: { title: "COLOR MATCHING — ALL DEPARTMENTS", file: "production-card-colormatch.html", dept: "Color Matching", countKey: null, bi: false },
};
const pcRoute = (p) => PC_ROUTE[p?.productName] || (p?.productType === "gangsheet" ? { card: "vinyl", job: "DTF Gang Sheet", key: "gangSheetPrints" } : p?.productType === "nongarment" ? { card: "outsourced", job: "Outsourced", key: "outsourcedProducts" } : (p?.productType === "onlinestorefront" ? { card: "storefront", job: "Online Storefront", key: null } : null));
function pcRow(en, es, v, opts) { opts = opts || {}; if (!pcHas(v)) return ""; const label = opts.bi && es ? `${en} / ${es}` : en; return `<div class="row${opts.crit ? " crit" : ""}"><span class="lbl">${pcEsc(label)}</span><span class="val">${pcEsc(v)}</span></div>`; }
// E-41: a swatch per chart color named in "Colors Used", for products that have a chart (cut vinyl).
// Nothing recognised -> empty string, so a card with no chart colors is exactly what it was.
// Since E-41 phase 2 the same row covers thread (by number) and screen-print ink (house / Pantone / HEX).
function pcSwatches(productName, text) {
  const m = readColorSwatches(productName, text); if (!m.length) return "";
  return `<div class="row"><span class="lbl">Chart colors (approx.)</span><span class="val">${m.map((c) => `<span class="swatch" style="display:inline-block;width:14px;height:14px;border:1px solid #777;border-radius:2px;vertical-align:-2px;margin-right:4px;background:${c.background};-webkit-print-color-adjust:exact;print-color-adjust:exact"></span>${pcEsc(c.label)}`).join(" &nbsp; ")}</span></div>`;
}
// E-57: a garment type that lists several styles reads "Gildan Long Sleeve / Gildan Hoodie", not run together.
const pcType = (g) => String(g?.garmentType == null ? "" : g.garmentType).split(/\r?\n/).map((x) => x.trim()).filter(Boolean).join(" / ");
/*
 * E-57 (the graphic designer, 2026-10-13: "can't see which color goes to which garment"). The size
 * breakdown used to be poured into one row, where its line breaks vanished. Now: the style as a
 * heading, then each color on its own line with its sizes as tags and its piece count. Text the
 * parser cannot place is shown as typed, with its line breaks. When the garment type names several
 * styles and the sizes do not say which is which, the card SAYS so instead of leaving it to a guess.
 */
function pcSizes(g, bi) {
  const text = g?.countColorSize; if (!pcHas(text)) return "";
  const label = bi ? "Count / Colors / Sizes / Cant / Colores / Tallas" : "Count / Colors / Sizes";
  const { blocks, unparsed } = sizeBlocks(text);
  if (!blocks.length) return `<div class="row"><span class="lbl">${pcEsc(label)}</span><span class="val" style="white-space:pre-line">${pcEsc(String(text).trim())}</span></div>`;
  const lines = []; let last = null;
  // E-83 (Angela, 2026-10-19: "separate the count with the garments -- helps when I'm looking for them"): with two or
  // more styles, each style heading carries its own piece count.
  const perStyle = {}; blocks.forEach((b) => { if (b.group) perStyle[b.group] = (perStyle[b.group] || 0) + b.total; });
  // Styled inline, not in PC_CSS: a CSS change would alter every card's bytes (the online-order golden test), not just these.
  const styleCount = (g) => (Object.keys(perStyle).length > 1 ? `<span class="szgt" style="float:right;background:#1a1a1a;color:#fff;border-radius:3px;padding:0 6px;-webkit-print-color-adjust:exact;print-color-adjust:exact">${perStyle[g]} ${bi ? "pcs / pzas" : "pcs"}</span>` : "");
  blocks.forEach((b) => {
    if (b.group !== last) { if (b.group) lines.push(`<div class="szg">${pcEsc(b.group)}${styleCount(b.group)}</div>`); last = b.group; }
    lines.push(`<div class="szc">${b.color ? `<span class="szn">${pcEsc(b.color)}</span>` : ""}${b.sizes.map((x) => `<span class="sz">${pcEsc(x.size)} <b>${x.count}</b></span>`).join("")}<span class="szt">= ${b.total}</span></div>`);
  });
  unparsed.forEach((u) => lines.push(`<div class="szu">${pcEsc(u)}</div>`));
  const n = stylesNotMarked(g);
  const warn = n ? `<div class="szw">&#9888; ${n} styles on this garment type &mdash; the sizes do not say which is which. Ask sales before starting.${bi ? ` / ${n} estilos &mdash; las tallas no indican cu&aacute;l es cu&aacute;l. Pregunte a ventas antes de empezar.` : ""}</div>` : "";
  // The label sits ABOVE the breakdown, not beside it: the bilingual label is wide and the sizes need the room.
  return `<div class="szrow"><div class="lbl">${pcEsc(label)}</div><div class="val">${lines.join("")}${warn}</div></div>`;
}
/* E-173 (graphic department via David 10-30): a row whose value keeps its own line breaks (details typed over several lines). */
function pcRowLines(en, es, v, opts) { opts = opts || {}; if (!pcHas(v)) return ""; const label = opts.bi && es ? `${en} / ${es}` : en; return `<div class="row${opts.crit ? " crit" : ""}"><span class="lbl">${pcEsc(label)}</span><span class="val" style="white-space:pre-line">${pcEsc(String(v).trim())}</span></div>`; }
/*
 * E-173 / D-82 (David 10-30: "Yes, add it"): Color Change on the department cards and the Graphic Design card -- which garment color gets
 * which ink / thread, as typed at onboarding ("Navy garment gets the white/gold and black ink"). Shown only when the answer is Yes (or
 * details were typed); a plain "No" adds nothing.
 */
export function pcColorChange(gr, bi) {
  const yes = /^yes$/i.test(String(gr?.colorChange ?? "").trim());
  if (!yes && !pcHas(gr?.detailsOfColorChange)) return "";
  return pcRowLines("Color Change", "Cambio de Color", pcHas(gr?.detailsOfColorChange) ? gr.detailsOfColorChange : "Yes - no details typed", { crit: true, bi });
}
/* E-154: "Is Graphic Print Ready?" is a Yes / No answer now; older orders saved a tick box (true / false). */
const pcReady = (v) => (v === true || /^yes$/i.test(String(v ?? "").trim()) ? "Yes" : v === false || /^no$/i.test(String(v ?? "").trim()) ? "No" : "");
function pcGarmentBlock(g, bi, ironPass, productName, artDetails) {
  const graphics = (g?.secondaryBranches || []).map((gr, i) => {
    const pl = (gr?.tartiaryBranches || []).map((p) => { if (!pcHas(p?.placementLocation) && !pcHas(p?.placementSize) && !pcHas(p?.sizeAndDimensions)) return ""; const bits = [pcHas(p?.placementSize) ? pcEsc(p.placementSize) : "", pcHas(p?.sizeAndDimensions) ? pcEsc(p.sizeAndDimensions) : "", formatSizeVariants(p?.sizeVariants) ? "<b>by garment size:</b> " + pcEsc(formatSizeVariants(p.sizeVariants)) : ""].filter(Boolean).join(" · "); return `<div class="prow"><span class="ploc">${pcEsc(p?.placementLocation || "Placement")}</span>${bits ? " · " + bits : ""}</div>`; }).join("");
    return `<div class="graphic"><div class="grtitle">${bi ? "Graphic / Gráfico" : "Graphic"} ${i + 1}${pcHas(gr?.graphicDescription) ? ": " + pcEsc(gr.graphicDescription) : ""}</div>${pcRow("Art File", "Archivo", artNames(gr), { bi })}${pcRow("Colors", "Colores", gr?.numberOfColorsUsed, { crit: true, bi })}${pcRow("Colors Used", "Colores", gr?.colorsUsed, { bi })}${pcSwatches(productName, gr?.colorsUsed)}${artDetails ? pcColorChange(gr, bi) : ""}${pcRow("Underbase", "Base", gr?.underbase, { bi })}${pcHas(ironPass) ? pcRow("Premium Iron Pass", "Planchado", ironPass, { bi }) : ""}${pl ? `<div class="plc">${pl}</div>` : ""}</div>`;
  }).join("");
  const also = (g?.isUsedInOtherAppTypes === "Yes" && pcHas(g?.chooseApplicationType)) ? `<div class="alsonote">${bi ? "Also used with / También con" : "Also used with"}: <b>${pcEsc(g.chooseApplicationType)}</b></div>` : "";
  return `<div class="garment"><div class="ghead"><span class="gname">${pcEsc(pcType(g) || "Garment")}</span>${pcHas(g?.garmentQuantity) ? `<span class="gqty">${bi ? "Qty / Cant" : "Qty"}: ${pcEsc(g.garmentQuantity)}</span>` : ""}</div>${pcRow("SKU(s)", "SKU(s)", pcSkus(g), { bi })}${pcSizes(g, bi)}${graphics}${also}${pcRow("Vendors", "Proveedores", g?.vendorsUsed, { bi })}${pcRow("Special Instructions", "Instrucciones", g?.specialInstructions, { bi })}</div>`;
}
function pcGarmentSummary(items, bi) {
  const gs = []; items.forEach((p) => { if (p.productType === "garment") (p.primaryBranches || []).forEach((g) => { if (pcHas(g?.garmentType) || pcHas(g?.garmentQuantity)) gs.push(`${pcHas(g?.garmentQuantity) ? pcEsc(g.garmentQuantity) + "× " : ""}${pcEsc(pcType(g) || "Garment")}`); }); });
  if (!gs.length) return ""; return `<div class="gsummary"><b>${bi ? "Garments / Prendas" : "Garments"}:</b> ${gs.join("  •  ")}</div>`;
}
// The product-level note lives under different keys by product type - garments use
// otherInformation, non-garment and graphic use specialInstructions - but both are
// labelled "Other Information" in the form. One accessor so the cards never care which.
const pcNote = (p) => (pcHas(p?.otherInformation) ? p.otherInformation : pcHas(p?.specialInstructions) ? p.specialInstructions : "");
function pcOverview(p) { const bits = [pcHas(p?.quantityOrdered) ? `<b>${pcEsc(p.quantityOrdered)}×</b>` : "", pcEsc(p?.productName)].filter(Boolean).join(" "); const extra = [pcHas(p?.dimensions) ? pcEsc(p.dimensions) : "", pcHas(p?.vendorsUsed) ? "vendor: " + pcEsc(p.vendorsUsed) : ""].filter(Boolean).join(" · "); const note = pcHas(pcNote(p)) ? `<div class="orow"><span class="omute">Other Information —</span> <b>${pcEsc(pcNote(p))}</b></div>` : ""; return `<div class="orow">${bits}${extra ? ` <span class="omute">— ${extra}</span>` : ""}</div>${note}`; }
const PC_CSS = `body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#e9eaec;margin:0;padding:24px;color:#1a1a1a}.pcard{background:#fff;max-width:760px;margin:0 auto 28px;border:1px solid #ccc;border-radius:6px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)}.strip{background:#111;color:#fff;padding:14px 18px}.stripline{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.acct{font-size:18px;font-weight:700}.deal{color:#bbb;font-size:14px}.po{background:#ffd54f;color:#111;font-weight:700;padding:2px 10px;border-radius:4px;font-size:14px;white-space:nowrap}.po b{font-size:20px}.wd{color:#8ecbff;font-weight:700}@media print{.wd{display:none}}.rush{margin-left:auto;background:#d32f2f;color:#fff;font-weight:800;padding:3px 12px;border-radius:4px;letter-spacing:.05em}.stripmeta{display:flex;gap:18px;flex-wrap:wrap;margin-top:8px;font-size:14px;align-items:baseline}.dept{font-size:20px;font-weight:800}.pc{margin-left:auto}.pc b{font-size:20px}.due b{color:#ffd54f}.gsummary{background:#f0f7ff;border-bottom:1px solid #cfe3ff;padding:8px 18px;font-size:14px}.cbody{padding:16px 18px}.job{border:1px solid #ddd;border-radius:5px;margin-bottom:14px;overflow:hidden}.jhead{background:#f3f4f6;padding:8px 12px;font-weight:700;display:flex;justify-content:space-between}.jcount{color:#d32f2f}.omute{color:#999;font-weight:400;font-size:13px}.garment{border-left:3px solid #111;padding:10px 12px;margin:10px}.ghead{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}.gname{font-size:16px;font-weight:700}.gqty{font-weight:700}.graphic{margin:8px 0 8px 10px;padding-left:12px;border-left:2px solid #ddd}.grtitle{font-weight:600;margin-bottom:4px}.row{display:flex;gap:8px;font-size:14px;padding:1px 0}.lbl{color:#666;min-width:170px}.val{font-weight:500}.row.crit .val{font-weight:800}.row.crit .lbl{color:#111}.plc{margin-top:5px}.prow{font-size:14px;background:#fff7e6;border:1px solid #ffe0a3;border-radius:3px;padding:3px 8px;margin:3px 0;display:inline-block}.ploc{font-weight:800}.alsonote{margin-top:6px;font-size:13px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:3px;padding:5px 9px}.orow{padding:5px 12px;font-size:15px;border-bottom:1px solid #eee}.szrow{font-size:14px;padding:3px 0}.szrow .val{padding-left:10px}.szg{font-weight:800;margin-top:6px;padding-bottom:1px;border-bottom:1px solid #ccc}.szc{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:baseline;padding:3px 0}.szn{font-weight:700;min-width:120px}.sz{border:1px solid #bbb;border-radius:3px;padding:0 6px;white-space:nowrap;background:#fafafa}.szt{color:#666;font-size:13px}.szu{color:#444}.szw{margin-top:5px;background:#fff4e5;border:1px solid #ffb74d;border-radius:3px;padding:4px 8px;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}.cfooter{background:#f3f4f6;padding:9px 18px;font-size:13px;color:#444;border-top:1px solid #ddd}`;
const pcDoc = (cm, inner) => `<!doctype html><html><head><meta charset="utf-8"><title>${pcEsc(cm.dept)}</title><style>${PC_CSS}</style></head><body><section class="pcard">${inner}</section></body></html>`;
// DTF Gang Sheet block: what the vinyl department needs to lay out and print the sheet -- sheet size,
// each graphic's size and how many of it, and the estimate the Deal's print count came from (D-13).
function pcGangSheetBlock(p, bi) {
  const gang = gangSheetPrints(p);
  const graphics = (p?.gangGraphics || []).map((g, i) => {
    const row = gang.perGraphic?.[i];
    const per = pcHas(g?.quantityPerSheet) ? g.quantityPerSheet : row ? `${row.placed} (fills the sheet)` : "";
    return `<div class="graphic"><div class="grtitle">${bi ? "Graphic / Gráfico" : "Graphic"} ${i + 1}${pcHas(g?.graphicDescription) ? ": " + pcEsc(g.graphicDescription) : ""}</div>${pcRow("Size", "Tamaño", pcHas(g?.graphicWidth) && pcHas(g?.graphicHeight) ? `${g.graphicWidth}" x ${g.graphicHeight}"` : "", { crit: true, bi })}${pcRow("Per Sheet", "Por Hoja", per, { crit: true, bi })}${row && row.rotated ? pcRow("Layout", "Disposición", "rotated 90° to fit more", { bi }) : ""}${pcRow("Colors", "Colores", g?.numberOfColorsUsed, { bi })}${pcRow("Colors Used", "Colores", g?.colorsUsed, { bi })}${pcRow("Print Ready?", "¿Listo?", pcReady(g?.isGraphicPrintReady), { bi })}</div>`;
  }).join("");
  const warn = gang.overflow ? `<div class="alsonote"><b>Does not all fit on one sheet at these sizes — check before printing.</b></div>` : "";
  return `<div class="garment"><div class="ghead"><span class="gname">Gang Sheet ${pcHas(p?.gangSheetWidth) && pcHas(p?.gangSheetHeight) ? `${pcEsc(p.gangSheetWidth)}" x ${pcEsc(p.gangSheetHeight)}"` : ""}</span><span class="gqty">${bi ? "Sheets / Hojas" : "Sheets"}: ${pcEsc(gang.sheets)}</span></div>${pcRow("Estimated Prints", "Impresiones Est.", `${gang.printsPerSheet} per sheet · ${gang.total} total`, { crit: true, bi })}${pcRow("Goes on garments", "Va en prendas", p?.garmentColors, { crit: true, bi })}${graphics}${warn}${pcRow("Other Information", "Información Adicional", pcNote(p), { bi })}</div>`;
}

/*
 * E-173 (graphic department via David 10-30: "all the useful elements from the CRM he uses each day" -- the onboarding note's own
 * labels): under each artwork on the Graphic Design card, the garment it goes on (Brand / Style, SKU, garment colors -- names only, no
 * sizes), Color Change, the placements with their sizes, vendors and special instructions. Non-garment products: dimensions, vendors and
 * the product's instructions. Blank answers show nothing.
 */
const pcGarmentColors = (g) => [...new Set(sizeBlocks(g?.countColorSize).blocks.map((b) => String(b.color || "").trim()).filter(Boolean))].join(", ");
function pcArtOrder(a) {
  const g = a.garment, p = a.product, gr = a.gr;
  if (g) {
    const pl = (gr?.tartiaryBranches || []).map((x) => [x?.placementLocation, x?.sizeAndDimensions, x?.placementSize, formatSizeVariants(x?.sizeVariants) ? "by garment size: " + formatSizeVariants(x.sizeVariants) : ""].filter(pcHas).join(" · ")).filter(Boolean);
    return `<div class="plc" style="border-top:1px solid #eee;margin-top:6px;padding-top:4px">${pcRow("Brand / Style", "", pcType(g))}${pcRow("SKU(s)", "", pcSkus(g))}${pcRow("Garment Colors", "", pcGarmentColors(g))}${pcColorChange(gr, false)}${pl.map((x, i) => pcRow(pl.length > 1 ? `Placement ${i + 1}` : "Placement", "", x, { crit: true })).join("")}${pcRow("Vendors Used", "", g.vendorsUsed)}${pcRowLines("Special Instructions", "", g.specialInstructions)}</div>`;
  }
  if (p) return `<div class="plc" style="border-top:1px solid #eee;margin-top:6px;padding-top:4px">${pcRow("Sizes & Dimensions", "", p.dimensions, { crit: true })}${pcRow("Vendors Used", "", p.vendorsUsed)}${pcRowLines("Special Instructions", "", pcNote(p))}</div>`;
  return "";
}

// E-53: the Deal's PO number and WorkDrive folder on every card (David, 2026-10-12). Both live on
// the DEAL, not in the onboarding answers, and the folder link usually does not exist yet when the
// form is submitted -- so the caller passes what the Deal says NOW (the viewer and the Quality Check
// form read it live, like the due date). Nothing is stored in onboarding-form.json. Absent -> not
// rendered, so a card without them is exactly what it was.
const pcAttr = (s) => pcEsc(s).replace(/"/g, "&quot;");
const pcLink = (u) => { const s = String(u == null ? "" : u).trim(); return /^https:\/\//i.test(s) ? s : ""; }; // never a javascript: or data: address
/*
 * E-55 (David, 2026-10-13): the WorkDrive button should open the DEAL's own folder. The Deal's
 * long-standing WorkDrive_Link field holds the share link of the Mock Up folder inside it (it is what
 * the mock-up email sends the client), and nothing on the Deal points at the Deal folder yet. So: the
 * Deal folder when the Deal carries its link in DEAL_FOLDER_FIELD, otherwise the Mock Up folder --
 * named as what it is, so nobody opens it expecting the whole job. One rule for the cards, the card
 * viewer and the Quality Check form.
 */
export const DEAL_FOLDER_FIELD = "Deal_Folder_Link";
export function workDriveTarget(deal) {
  const dealFolder = pcLink(deal?.[DEAL_FOLDER_FIELD]);
  if (dealFolder) return { kind: "deal", href: dealFolder, label: "Open the Deal folder" };
  const mockUp = pcLink(deal?.WorkDrive_Link);
  if (mockUp) return { kind: "mockup", href: mockUp, label: "Open the Mockups folder" }; // folder renamed "Mockups" in the 2026-10-14 layout
  return { kind: "", href: "", label: "" };
}
function buildProductionCards(data, counts, dealInfo) {
  const products = data?.products || [];
  // E-173 (switch cardInfoOn, passed by the viewer as dealInfo.artDetails): Color Change on the department cards + the order details under
  // each artwork on the Graphic Design card. Off or absent -> the cards are exactly what they were.
  const artDetails = dealInfo?.artDetails === true;
  const meta = { account: data?.contactInfo?.Account_Name, deal: data?.contactInfo?.Deal_Name, rush: data?.upchargedForRushTurnaround === true, due: data?.hardDueDate === "Yes" ? pcDate(data?.dueDate) : "", po: pcHas(dealInfo?.poNumber) ? String(dealInfo.poNumber).trim() : "", workDrive: pcLink(dealInfo?.workDriveLink), workDriveLabel: pcHas(dealInfo?.workDriveLabel) ? String(dealInfo.workDriveLabel).trim() : "Open WorkDrive folder" };
  const byCard = {}; products.forEach((p) => { const r = pcRoute(p); if (!r) return; (byCard[r.card] = byCard[r.card] || []).push({ p, r }); });
  const files = [];
  // E-38: the Account's standing notes, on EVERY card (nothing says which department a note is
  // about). Absent or blank -> not rendered, so cards without notes are exactly what they were.
  const cnotes = pcHas(data?.customerNotes) ? `<div class="gsummary" style="background:#fff4e5;border-bottom:1px solid #ffd8a8"><b>Customer Notes (every deal for this account):</b><br>${pcEsc(String(data.customerNotes).trim()).replace(/\r?\n/g, "<br>")}</div>` : "";
  // E-117a: the Deal's Garments Ordered Notes (where the garments were actually ordered), on every card when the Deal has them.
  const ordered = pcHas(dealInfo?.garmentsOrderedNotes) ? `<div class="gsummary" style="background:#e7f5ff;border-bottom:1px solid #a5d8ff"><b>Garments ordered (from the Deal):</b><br>${pcEsc(String(dealInfo.garmentsOrderedNotes).trim()).replace(/\r?\n/g, "<br>")}</div>` : "";
  // E-137: the boxes of garments coming in (the Deal's Production Tracking), each number a link that opens that package. Viewer only:
  // tracking arrives after onboarding, so cards attached at Submit never have it.
  // E-146: revision reorder boxes (the Deal's Revision Tracking Link) get their own line, same look, under it.
  const shipBlock = (list, label, colors) => { const ok = (Array.isArray(list) ? list : []).filter((b) => pcHas(b?.number)); return ok.length ? `<div class="gsummary" style="${colors}"><b>${label}:</b> ${ok.map((b) => { const href = pcLink(b.link); const num = pcEsc(String(b.number)); return (href ? `<a href="${pcAttr(href)}" target="_blank" rel="noopener noreferrer">${num}</a>` : num) + (pcHas(b.carrier) ? ` <span class="omute">${pcEsc(b.carrier)}</span>` : ""); }).join(" &middot; ")}</div>` : ""; };
  const shipments = shipBlock(dealInfo?.shipments, "Garment shipments (from the Deal)", "background:#ebfbee;border-bottom:1px solid #b2f2bb") + shipBlock(dealInfo?.revisionShipments, "Revision shipments (from the Deal)", "background:#fff9db;border-bottom:1px solid #ffe066");
  // E-172 (production via David 10-30): when the supplier run listed what is in each box, each department card shows the boxes holding
  // ITS garments (with colors + sizes), flags a box that also holds another department's garments (click -> which, whose), folds away
  // boxes for other departments, and lists boxes with no contents as before. Switch boxContentsOn (dealInfo.boxContents); off, or no box
  // with contents -> the plain line above, exactly as before.
  const garmentsOnOrder = dealInfo?.boxContents ? orderGarments(data, pcRoute) : [];
  const deptName = (c) => (PC_META[c] ? PC_META[c].dept : c);
  const boxLink = (b) => { const href = pcLink(b.link); const num = pcEsc(String(b.number)); return (href ? `<a href="${pcAttr(href)}" target="_blank" rel="noopener noreferrer">${num}</a>` : num) + (pcHas(b.carrier) ? ` <span class="omute">${pcEsc(b.carrier)}</span>` : ""); };
  // E-172 (David 10-30): boxes of one S&S order differ only in the last digits, so each box says where it sits in its supplier order
  // (when the run wrote it) and the label's last 4 in bold, to match the sticker at a glance.
  const boxHead = (b) => { const n = String(b.number); const tail = n.length > 4 ? n.slice(-4) : n; return `${b.boxOf ? `<b>Box ${b.boxOf.n} of ${b.boxOf.of}</b> &middot; ` : ""}label ends <b style="font-size:16px">${pcEsc(tail)}</b> &middot; ${boxLink(b)}`; };
  const sumPcs = (list) => list.reduce((n, it) => n + (Number(it.count) || 0), 0);
  const othersList = (others, unmatched) => others.map((o) => `<div style="margin:2px 0 2px 12px">${pcEsc(itemText(o.item))} &rarr; <b>${pcEsc(o.cards.map(deptName).join(" or "))}</b></div>`).join("") + (unmatched || []).map((it) => `<div style="margin:2px 0 2px 12px">${pcEsc(itemText(it))} &rarr; <b>not on this order</b> (another Deal's garments?)</div>`).join("");
  const boxesFor = (list, label, colors, cardKey) => {
    const ok = (Array.isArray(list) ? list : []).filter((b) => pcHas(b?.number));
    if (!dealInfo?.boxContents || !cardKey || !ok.some((b) => (b.contents || []).length)) return shipBlock(list, label, colors);
    const sorted = sortBoxesForCard(ok, garmentsOnOrder, cardKey);
    const rows = sorted.mine.map(({ box, items, others, unmatched }) => {
      const shared = items.filter((it) => it.sharedWith.length).map((it) => ` <span class="omute">(also used by ${pcEsc(it.sharedWith.map(deptName).join(", "))})</span>`);
      const flagN = sumPcs(others.map((o) => o.item)) + sumPcs(unmatched);
      const flag = flagN ? `<details style="margin:3px 0 0 12px"><summary style="cursor:pointer;color:#a61e4d;font-weight:600">Also in this box: ${flagN} pcs that are not for this card</summary>${othersList(others, unmatched)}</details>` : "";
      return `<div style="margin:5px 0">${boxHead(box)}<div style="margin:2px 0 0 12px">${items.map((it) => pcEsc(itemText(it))).join("<br>")}${shared.join("")}</div>${flag}</div>`;
    }).join("");
    const elsewhere = sorted.elsewhere.length ? `<details style="margin:5px 0"><summary style="cursor:pointer">${sorted.elsewhere.length} other box${sorted.elsewhere.length === 1 ? " has" : "es have"} none of this card's garments</summary>${sorted.elsewhere.map(({ box, others, unmatched }) => `<div style="margin:4px 0">${boxHead(box)}${othersList(others, unmatched)}</div>`).join("")}</details>` : "";
    const unknown = sorted.unknown.length ? `<div style="margin:5px 0"><span class="omute">Contents not listed:</span> ${sorted.unknown.map(boxLink).join(" &middot; ")}</div>` : "";
    const head = sorted.mine.length ? `<b>${label} -- boxes with this card's garments:</b>` : `<b>${label}:</b> <span class="omute">no box lists this card's garments yet</span>`;
    return `<div class="gsummary" style="${colors}">${head}${rows}${elsewhere}${unknown}</div>`;
  };
  const shipmentsFor = (cardKey) => boxesFor(dealInfo?.shipments, "Garment shipments (from the Deal)", "background:#ebfbee;border-bottom:1px solid #b2f2bb", cardKey) + boxesFor(dealInfo?.revisionShipments, "Revision shipments (from the Deal)", "background:#fff9db;border-bottom:1px solid #ffe066", cardKey);
  const strip = (cm, deptTotal, extra, ship = shipments) => `<div class="strip"><div class="stripline">${meta.po ? `<span class="po">PO # <b>${pcEsc(meta.po)}</b></span>` : ""}<span class="acct">${pcEsc(meta.account || "—")}</span><span class="deal">${pcEsc(meta.deal || "")}</span>${meta.rush ? `<span class="rush">RUSH</span>` : ""}</div><div class="stripmeta"><span class="dept">${pcEsc(cm.title)}</span>${deptTotal != null ? `<span class="pc">Print Count: <b>${deptTotal}</b></span>` : ""}<span class="due">Due: <b>${pcHas(meta.due) ? pcEsc(meta.due) : "See Closing Date on Deal"}</b></span>${meta.workDrive ? `<a class="wd" href="${pcAttr(meta.workDrive)}" target="_blank" rel="noopener noreferrer">${pcEsc(meta.workDriveLabel)} &#8599;</a>` : ""}</div></div>${cnotes}${ordered}${ship}${extra || ""}`;
  const presentDepts = [...new Set(Object.keys(byCard).map((c) => PC_META[c].dept))]; presentDepts.push("Graphics");
  const footer = (dept) => { const o = presentDepts.filter((d) => d !== dept); return o.length ? `<div class="cfooter">Other departments on this deal: <b>${pcEsc(o.join(", "))}</b></div>` : ""; };
  for (const cardKey of Object.keys(byCard)) {
    const cm = PC_META[cardKey], bi = cm.bi, items = byCard[cardKey].map((x) => x.p);
    let body, gsum = "";
    if (cardKey === "outsourced") { body = `<div class="job"><div class="jhead"><span>Items to order / stock</span></div>${items.map(pcOverview).join("")}</div>`; }
    else if (cardKey === "storefront") { const p = items[0];
      // E-22: the person BUILDING the store reads this card, so everything they act on belongs here --
      // whether to publish the contact block, whether artwork is print-ready (and the half-hour charge),
      // which areas are designable, and any custom product titles (David, 2026-09-29).
      const artFlag = p?.logoPrintReady === "No" || p?.headerBannerPrintReady === "No";
      body = `<div class="job"><div class="jhead"><span>Storefront setup</span></div><div class="garment">${pcRow("Online Suffix", "", p?.preferredOnlineSuffix, { crit: true })}${pcRow("Contact Email", "", p?.contactEmailForStorefront)}${pcRow("Display Contact Info", "", p?.displayContactInfo, { crit: true })}${pcRow("Temporary/Evergreen", "", p?.isStorefrontTemporaryOrEvergreen)}${pcRow("End Date", "", p?.isStorefrontTemporaryOrEvergreen === "Temporary" ? pcDate(p?.storefrontEndDate) : "")}${pcRow("Fulfillment", "", (p?.howToFulfillOrders || []).join(", "))}${pcRow("Logo Print-Ready", "", p?.logoPrintReady, { crit: artFlag })}${pcRow("Header Banner Print-Ready", "", p?.headerBannerPrintReady, { crit: artFlag })}${artFlag ? pcRow("1/2 Hr Design Charge Acknowledged", "", p?.halfHourGraphicDesignAcknowledged === true ? "Yes" : "NO", { crit: true }) : ""}${pcRow("Customizable", "", p?.productsCustomizable)}${pcRow("Designable Areas", "", (p?.customizableAreas || []).join(", "), { crit: true })}${pcRow("Custom Product Titles", "", p?.useCustomProductTitles === "Yes" ? p?.customProductTitles : "")}</div></div>`; }
    else { gsum = pcGarmentSummary(items, bi);
      if (cardKey === "embroidery" && counts) {
        const sz = [["Small", counts.embroiderySmallPrints], ["Medium", counts.embroideryMediumPrints], ["Large", counts.embroideryLargePrints]]
          .filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join("  •  ");
        if (sz) gsum += `<div class="gsummary"><b>Placement sizes:</b> ${pcEsc(sz)}</div>`;
      } const jobs = {}; byCard[cardKey].forEach(({ p, r }) => { (jobs[r.job] = jobs[r.job] || { key: r.key, items: [] }).items.push(p); }); body = Object.entries(jobs).map(([job, info]) => { const cnt = info.key && counts && pcHas(counts[info.key]) ? `<span class="jcount">${counts[info.key]} prints</span>` : ""; const entries = info.items.map((p) => { if (p.productType === "gangsheet") return pcGangSheetBlock(p, bi); if (p.productType !== "garment") return pcOverview(p); const pnote = pcHas(pcNote(p)) ? `<div class="garment">${pcRow("Other Information", "Información Adicional", pcNote(p), { crit: true, bi })}</div>` : ""; return pnote + (p.primaryBranches || []).map((g) => pcGarmentBlock(g, bi, p.premiumIronPass, p.productName, artDetails)).join(""); }).join(""); return `<div class="job"><div class="jhead"><span>${pcEsc(job)}</span>${cnt}</div>${entries}</div>`; }).join(""); }
    const deptTotal = cm.countKey && counts && pcHas(counts[cm.countKey]) ? counts[cm.countKey] : null;
    files.push({ name: cm.file, html: pcDoc(cm, strip(cm, deptTotal, gsum, shipmentsFor(cardKey)) + `<div class="cbody">${body}</div>` + footer(cm.dept)) });
  }
  const gcm = PC_META.graphicdesign; const art = [];
  products.forEach((p) => {
    if (p.productType === "garment") (p.primaryBranches || []).forEach((g) => (g.secondaryBranches || []).forEach((gr) => art.push({ src: `${p.productName} — ${g.garmentType || ""}`, gr, need: FILE_NEEDED[p.productName], garment: g })));
    else if (p.productType === "nongarment") (p.branches || []).forEach((gr) => art.push({ src: p.productName, gr, need: FILE_NEEDED[p.productName], product: p }));
    else if (p.productType === "gangsheet") (p.gangGraphics || []).forEach((gr) => art.push({ src: `${p.productName} — ${gr?.graphicWidth || "?"}" x ${gr?.graphicHeight || "?"}"`, gr, need: FILE_NEEDED["DTF Gang Sheet"] }));
    else if (p.productType === "graphic") art.push({ src: "Graphic Design", gr: { graphicDescription: p.graphicDescription, currentGraphicFormat: p.desiredGraphicApplication, fontsUsed: p.fontsUsed, _design: p } });
  });
  const artBody = art.length ? art.map((a, i) => `<div class="job"><div class="jhead"><span>Artwork ${i + 1}</span><span class="omute">${pcEsc(a.src)}</span></div><div class="garment">${pcRow("File needed", "", a.need, { crit: true })}${pcRow("Description", "", a.gr?.graphicDescription, { crit: true })}${pcRow("Art File", "", artNames(a.gr))}${pcRow("Print Ready?", "", artDetails ? pcReady(a.gr?.isGraphicPrintReady) || a.gr?.isGraphicPrintReady : a.gr?.isGraphicPrintReady)}${pcRow("Format", "", a.gr?.currentGraphicFormat, { crit: true })}${pcRow("Fine Detail?", "", a.gr?.fineDetail)}${pcRow("Colors", "", a.gr?.numberOfColorsUsed)}${pcRow("Colors Used", "", a.gr?.colorsUsed)}${pcRow("Fonts", "", a.gr?.fontsUsed)}${a.gr?._design ? pcRow("Design Hours", "", a.gr._design.estimatedDesignHours) : ""}${a.gr?._design ? pcRow("Assets Provided", "", a.gr._design.designAssetsProvided) : ""}${artDetails ? pcArtOrder(a) : ""}</div></div>`).join("") : `<div class="job"><div class="garment"><i>No artwork details captured on this deal.</i></div></div>`;
  files.push({ name: gcm.file, html: pcDoc(gcm, strip(gcm, null, "") + `<div class="cbody">${artBody}</div>` + footer("Graphics")) });
  // E-48: the Color Matching card -- each color on the order with its best counterparts in the other
  // departments. Only made when at least one color is recognized, so an order without any gets exactly
  // the cards it always did.
  const cmatches = buildColorMatches(data);
  if (cmatches.length) {
    const ccm = PC_META.colormatch;
    const sw = (hex, size) => `<span class="swatch" style="display:inline-block;width:${size}px;height:${size}px;border:1px solid #777;border-radius:3px;vertical-align:-4px;margin-right:6px;background:${hex};-webkit-print-color-adjust:exact;print-color-adjust:exact"></span>`;
    const DEPTS = ["Screen Print", "Embroidery", "Vinyl"];
    const cbody = DEPTS.map((dept) => {
      const rows = cmatches.filter((e) => e.dept === dept);
      if (!rows.length) return "";
      const entries = rows.map((e) => {
        const groups = DEPTS.filter((d) => e.matches.some((x) => x.dept === d)).map((d) => `<div class="row"><span class="lbl">${pcEsc(d === "Screen Print" ? "Screen print ink" : d === "Embroidery" ? "Embroidery thread" : "Vinyl")}</span><span class="val">${e.matches.filter((x) => x.dept === d).map((x) => `<div style="margin:2px 0">${sw(x.hex, 16)}<b>${pcEsc(x.label)}</b> <span style="font-weight:400;color:${x.basis === "official" ? "#1b5e20" : "#666"}">· ${pcEsc(x.quality)}${x.note ? " · " + pcEsc(x.note) : ""}</span></div>`).join("")}</span></div>`).join("");
        return `<div class="garment"><div class="ghead"><span class="gname">${sw(e.color.hex, 20)}${pcEsc(e.color.label)}</span></div><div class="row"><span class="lbl">Used on</span><span class="val" style="font-weight:400">${pcEsc(e.where.join("; "))}</span></div>${e.color.metallic ? `<div class="alsonote">Metallic - not matched. Match by eye against the real material.</div>` : groups}</div>`;
      }).join("");
      return `<div class="job"><div class="jhead"><span>${pcEsc(dept)} colors on this order</span><span class="omute">best matches in the other departments</span></div>${entries}</div>`;
    }).join("");
    files.push({ name: ccm.file, html: pcDoc(ccm, strip(ccm, null, "") + `<div class="cbody">${cbody}<div class="alsonote">${pcEsc(COLOR_MATCH_CAVEAT)}</div></div>` + footer("Color Matching")) });
  }
  return files;
}

export { buildProductionCards };
// E-166: which card a product lands on, shared with the production flow so each tab expects exactly what its card shows.
export { pcRoute as cardRouteOf };
