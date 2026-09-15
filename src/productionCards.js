/*
 * productionCards.js -- the production card generator, moved verbatim out of App.jsx so the
 * card viewer can rebuild a deal's cards from onboarding-form.json without loading the form.
 * App.jsx imports it for submit; CardViewer.jsx imports it as its fallback read path.
 * Keep it pure: no ZOHO, no React, no state.
 */

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
};
const pcRoute = (p) => PC_ROUTE[p?.productName] || (p?.productType === "nongarment" ? { card: "outsourced", job: "Outsourced", key: "outsourcedProducts" } : (p?.productType === "onlinestorefront" ? { card: "storefront", job: "Online Storefront", key: null } : null));
function pcRow(en, es, v, opts) { opts = opts || {}; if (!pcHas(v)) return ""; const label = opts.bi && es ? `${en} / ${es}` : en; return `<div class="row${opts.crit ? " crit" : ""}"><span class="lbl">${pcEsc(label)}</span><span class="val">${pcEsc(v)}</span></div>`; }
function pcGarmentBlock(g, bi, ironPass) {
  const graphics = (g?.secondaryBranches || []).map((gr, i) => {
    const pl = (gr?.tartiaryBranches || []).map((p) => { if (!pcHas(p?.placementLocation) && !pcHas(p?.placementSize) && !pcHas(p?.sizeAndDimensions)) return ""; const bits = [pcHas(p?.placementSize) ? pcEsc(p.placementSize) : "", pcHas(p?.sizeAndDimensions) ? pcEsc(p.sizeAndDimensions) : ""].filter(Boolean).join(" · "); return `<div class="prow"><span class="ploc">${pcEsc(p?.placementLocation || "Placement")}</span>${bits ? " · " + bits : ""}</div>`; }).join("");
    return `<div class="graphic"><div class="grtitle">${bi ? "Graphic / Gráfico" : "Graphic"} ${i + 1}${pcHas(gr?.graphicDescription) ? ": " + pcEsc(gr.graphicDescription) : ""}</div>${pcRow("Colors", "Colores", gr?.numberOfColorsUsed, { crit: true, bi })}${pcRow("Colors Used", "Colores", gr?.colorsUsed, { bi })}${pcRow("Underbase", "Base", gr?.underbase, { bi })}${pcHas(ironPass) ? pcRow("Premium Iron Pass", "Planchado", ironPass, { bi }) : ""}${pl ? `<div class="plc">${pl}</div>` : ""}</div>`;
  }).join("");
  const also = (g?.isUsedInOtherAppTypes === "Yes" && pcHas(g?.chooseApplicationType)) ? `<div class="alsonote">${bi ? "Also used with / También con" : "Also used with"}: <b>${pcEsc(g.chooseApplicationType)}</b></div>` : "";
  return `<div class="garment"><div class="ghead"><span class="gname">${pcEsc(g?.garmentType || "Garment")}</span>${pcHas(g?.garmentQuantity) ? `<span class="gqty">${bi ? "Qty / Cant" : "Qty"}: ${pcEsc(g.garmentQuantity)}</span>` : ""}</div>${pcRow("SKU(s)", "SKU(s)", pcSkus(g), { bi })}${pcRow("Count / Colors / Sizes", "Cant / Colores / Tallas", g?.countColorSize, { bi })}${graphics}${also}${pcRow("Vendors", "Proveedores", g?.vendorsUsed, { bi })}${pcRow("Special Instructions", "Instrucciones", g?.specialInstructions, { bi })}</div>`;
}
function pcGarmentSummary(items, bi) {
  const gs = []; items.forEach((p) => { if (p.productType === "garment") (p.primaryBranches || []).forEach((g) => { if (pcHas(g?.garmentType) || pcHas(g?.garmentQuantity)) gs.push(`${pcHas(g?.garmentQuantity) ? pcEsc(g.garmentQuantity) + "× " : ""}${pcEsc(g?.garmentType || "Garment")}`); }); });
  if (!gs.length) return ""; return `<div class="gsummary"><b>${bi ? "Garments / Prendas" : "Garments"}:</b> ${gs.join("  •  ")}</div>`;
}
// The product-level note lives under different keys by product type - garments use
// otherInformation, non-garment and graphic use specialInstructions - but both are
// labelled "Other Information" in the form. One accessor so the cards never care which.
const pcNote = (p) => (pcHas(p?.otherInformation) ? p.otherInformation : pcHas(p?.specialInstructions) ? p.specialInstructions : "");
function pcOverview(p) { const bits = [pcHas(p?.quantityOrdered) ? `<b>${pcEsc(p.quantityOrdered)}×</b>` : "", pcEsc(p?.productName)].filter(Boolean).join(" "); const extra = [pcHas(p?.dimensions) ? pcEsc(p.dimensions) : "", pcHas(p?.vendorsUsed) ? "vendor: " + pcEsc(p.vendorsUsed) : ""].filter(Boolean).join(" · "); const note = pcHas(pcNote(p)) ? `<div class="orow"><span class="omute">Other Information —</span> <b>${pcEsc(pcNote(p))}</b></div>` : ""; return `<div class="orow">${bits}${extra ? ` <span class="omute">— ${extra}</span>` : ""}</div>${note}`; }
const PC_CSS = `body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#e9eaec;margin:0;padding:24px;color:#1a1a1a}.pcard{background:#fff;max-width:760px;margin:0 auto 28px;border:1px solid #ccc;border-radius:6px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)}.strip{background:#111;color:#fff;padding:14px 18px}.stripline{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.acct{font-size:18px;font-weight:700}.deal{color:#bbb;font-size:14px}.rush{margin-left:auto;background:#d32f2f;color:#fff;font-weight:800;padding:3px 12px;border-radius:4px;letter-spacing:.05em}.stripmeta{display:flex;gap:18px;flex-wrap:wrap;margin-top:8px;font-size:14px;align-items:baseline}.dept{font-size:20px;font-weight:800}.pc{margin-left:auto}.pc b{font-size:20px}.due b{color:#ffd54f}.gsummary{background:#f0f7ff;border-bottom:1px solid #cfe3ff;padding:8px 18px;font-size:14px}.cbody{padding:16px 18px}.job{border:1px solid #ddd;border-radius:5px;margin-bottom:14px;overflow:hidden}.jhead{background:#f3f4f6;padding:8px 12px;font-weight:700;display:flex;justify-content:space-between}.jcount{color:#d32f2f}.omute{color:#999;font-weight:400;font-size:13px}.garment{border-left:3px solid #111;padding:10px 12px;margin:10px}.ghead{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}.gname{font-size:16px;font-weight:700}.gqty{font-weight:700}.graphic{margin:8px 0 8px 10px;padding-left:12px;border-left:2px solid #ddd}.grtitle{font-weight:600;margin-bottom:4px}.row{display:flex;gap:8px;font-size:14px;padding:1px 0}.lbl{color:#666;min-width:170px}.val{font-weight:500}.row.crit .val{font-weight:800}.row.crit .lbl{color:#111}.plc{margin-top:5px}.prow{font-size:14px;background:#fff7e6;border:1px solid #ffe0a3;border-radius:3px;padding:3px 8px;margin:3px 0;display:inline-block}.ploc{font-weight:800}.alsonote{margin-top:6px;font-size:13px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:3px;padding:5px 9px}.orow{padding:5px 12px;font-size:15px;border-bottom:1px solid #eee}.cfooter{background:#f3f4f6;padding:9px 18px;font-size:13px;color:#444;border-top:1px solid #ddd}`;
const pcDoc = (cm, inner) => `<!doctype html><html><head><meta charset="utf-8"><title>${pcEsc(cm.dept)}</title><style>${PC_CSS}</style></head><body><section class="pcard">${inner}</section></body></html>`;
function buildProductionCards(data, counts) {
  const products = data?.products || [];
  const meta = { account: data?.contactInfo?.Account_Name, deal: data?.contactInfo?.Deal_Name, rush: data?.upchargedForRushTurnaround === true, due: data?.hardDueDate === "Yes" ? pcDate(data?.dueDate) : "" };
  const byCard = {}; products.forEach((p) => { const r = pcRoute(p); if (!r) return; (byCard[r.card] = byCard[r.card] || []).push({ p, r }); });
  const files = [];
  const strip = (cm, deptTotal, extra) => `<div class="strip"><div class="stripline"><span class="acct">${pcEsc(meta.account || "—")}</span><span class="deal">${pcEsc(meta.deal || "")}</span>${meta.rush ? `<span class="rush">RUSH</span>` : ""}</div><div class="stripmeta"><span class="dept">${pcEsc(cm.title)}</span>${deptTotal != null ? `<span class="pc">Print Count: <b>${deptTotal}</b></span>` : ""}<span class="due">Due: <b>${pcHas(meta.due) ? pcEsc(meta.due) : "See Closing Date on Deal"}</b></span></div></div>${extra || ""}`;
  const presentDepts = [...new Set(Object.keys(byCard).map((c) => PC_META[c].dept))]; presentDepts.push("Graphics");
  const footer = (dept) => { const o = presentDepts.filter((d) => d !== dept); return o.length ? `<div class="cfooter">Other departments on this deal: <b>${pcEsc(o.join(", "))}</b></div>` : ""; };
  for (const cardKey of Object.keys(byCard)) {
    const cm = PC_META[cardKey], bi = cm.bi, items = byCard[cardKey].map((x) => x.p);
    let body, gsum = "";
    if (cardKey === "outsourced") { body = `<div class="job"><div class="jhead"><span>Items to order / stock</span></div>${items.map(pcOverview).join("")}</div>`; }
    else if (cardKey === "storefront") { const p = items[0]; body = `<div class="job"><div class="jhead"><span>Storefront setup</span></div><div class="garment">${pcRow("Online Suffix", "", p?.preferredOnlineSuffix, { crit: true })}${pcRow("Contact Email", "", p?.contactEmailForStorefront)}${pcRow("Temporary/Evergreen", "", p?.isStorefrontTemporaryOrEvergreen)}${pcRow("End Date", "", p?.isStorefrontTemporaryOrEvergreen === "Temporary" ? pcDate(p?.storefrontEndDate) : "")}${pcRow("Fulfillment", "", (p?.howToFulfillOrders || []).join(", "))}</div></div>`; }
    else { gsum = pcGarmentSummary(items, bi);
      if (cardKey === "embroidery" && counts) {
        const sz = [["Small", counts.embroiderySmallPrints], ["Medium", counts.embroideryMediumPrints], ["Large", counts.embroideryLargePrints]]
          .filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join("  •  ");
        if (sz) gsum += `<div class="gsummary"><b>Placement sizes:</b> ${pcEsc(sz)}</div>`;
      } const jobs = {}; byCard[cardKey].forEach(({ p, r }) => { (jobs[r.job] = jobs[r.job] || { key: r.key, items: [] }).items.push(p); }); body = Object.entries(jobs).map(([job, info]) => { const cnt = info.key && counts && pcHas(counts[info.key]) ? `<span class="jcount">${counts[info.key]} prints</span>` : ""; const entries = info.items.map((p) => { if (p.productType !== "garment") return pcOverview(p); const pnote = pcHas(pcNote(p)) ? `<div class="garment">${pcRow("Other Information", "Información Adicional", pcNote(p), { crit: true, bi })}</div>` : ""; return pnote + (p.primaryBranches || []).map((g) => pcGarmentBlock(g, bi, p.premiumIronPass)).join(""); }).join(""); return `<div class="job"><div class="jhead"><span>${pcEsc(job)}</span>${cnt}</div>${entries}</div>`; }).join(""); }
    const deptTotal = cm.countKey && counts && pcHas(counts[cm.countKey]) ? counts[cm.countKey] : null;
    files.push({ name: cm.file, html: pcDoc(cm, strip(cm, deptTotal, gsum) + `<div class="cbody">${body}</div>` + footer(cm.dept)) });
  }
  const gcm = PC_META.graphicdesign; const art = [];
  products.forEach((p) => {
    if (p.productType === "garment") (p.primaryBranches || []).forEach((g) => (g.secondaryBranches || []).forEach((gr) => art.push({ src: `${p.productName} — ${g.garmentType || ""}`, gr })));
    else if (p.productType === "nongarment") (p.branches || []).forEach((gr) => art.push({ src: p.productName, gr }));
    else if (p.productType === "graphic") art.push({ src: "Graphic Design", gr: { graphicDescription: p.graphicDescription, currentGraphicFormat: p.desiredGraphicApplication, fontsUsed: p.fontsUsed, _design: p } });
  });
  const artBody = art.length ? art.map((a, i) => `<div class="job"><div class="jhead"><span>Artwork ${i + 1}</span><span class="omute">${pcEsc(a.src)}</span></div><div class="garment">${pcRow("Description", "", a.gr?.graphicDescription, { crit: true })}${pcRow("Print Ready?", "", a.gr?.isGraphicPrintReady)}${pcRow("Format", "", a.gr?.currentGraphicFormat, { crit: true })}${pcRow("Fine Detail?", "", a.gr?.fineDetail)}${pcRow("Colors", "", a.gr?.numberOfColorsUsed)}${pcRow("Colors Used", "", a.gr?.colorsUsed)}${pcRow("Fonts", "", a.gr?.fontsUsed)}${a.gr?._design ? pcRow("Design Hours", "", a.gr._design.estimatedDesignHours) : ""}${a.gr?._design ? pcRow("Assets Provided", "", a.gr._design.designAssetsProvided) : ""}</div></div>`).join("") : `<div class="job"><div class="garment"><i>No artwork details captured on this deal.</i></div></div>`;
  files.push({ name: gcm.file, html: pcDoc(gcm, strip(gcm, null, "") + `<div class="cbody">${artBody}</div>` + footer("Graphics")) });
  return files;
}

export { buildProductionCards };
