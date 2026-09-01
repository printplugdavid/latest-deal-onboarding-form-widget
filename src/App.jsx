import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  FormLabel,
  TextField,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { useFieldArray } from "react-hook-form";
import GarmentForm from "./components/GarmentForm";
import NonGarmentForm from "./components/NonGarmentForm";
import GraphicForm from "./components/GraphicForm";
import OnlineStorefrontForm from "./components/OnlineStorefrontForm";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";

const ZOHO = window.ZOHO;

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
function pcOverview(p) { const bits = [pcHas(p?.quantityOrdered) ? `<b>${pcEsc(p.quantityOrdered)}×</b>` : "", pcEsc(p?.productName)].filter(Boolean).join(" "); const extra = [pcHas(p?.dimensions) ? pcEsc(p.dimensions) : "", pcHas(p?.vendorsUsed) ? "vendor: " + pcEsc(p.vendorsUsed) : ""].filter(Boolean).join(" · "); return `<div class="orow">${bits}${extra ? ` <span class="omute">— ${extra}</span>` : ""}</div>`; }
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
    else { gsum = pcGarmentSummary(items, bi); const jobs = {}; byCard[cardKey].forEach(({ p, r }) => { (jobs[r.job] = jobs[r.job] || { key: r.key, items: [] }).items.push(p); }); body = Object.entries(jobs).map(([job, info]) => { const cnt = info.key && counts && pcHas(counts[info.key]) ? `<span class="jcount">${counts[info.key]} prints</span>` : ""; const entries = info.items.map((p) => p.productType === "garment" ? (p.primaryBranches || []).map((g) => pcGarmentBlock(g, bi, p.premiumIronPass)).join("") : pcOverview(p)).join(""); return `<div class="job"><div class="jhead"><span>${pcEsc(job)}</span>${cnt}</div>${entries}</div>`; }).join(""); }
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

function App() {
  const [initialized, setInitialized] = useState(false); // initialize the widget
  const [entity, setEntity] = useState(null); // keeps the module
  const [entityId, setEntityId] = useState(null); // keeps the module id
  const [recordData, setRecordData] = useState(null); // holds record response

  const [options, setOptions] = useState(null);

  const [attachments, setAttachments] = useState([]);
  const [fileError, setFileError] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // initialize the app
    ZOHO.embeddedApp.on("PageLoad", function (data) {
      ZOHO.CRM.UI.Resize({ height: "90%", width: "60%" }); // resize the widget window
      setEntity(data?.Entity);
      setEntityId(data?.EntityId?.[0]);

      setInitialized(true);
    });

    ZOHO.embeddedApp.init();
  }, []);

  useEffect(() => {
    // get all data
    if (initialized) {
      const fetchData = async () => {
        const recordResp = await ZOHO.CRM.API.getRecord({
          Entity: entity,
          approved: "both",
          RecordID: entityId,
        });
        setRecordData(recordResp?.data?.[0]);

        const variableResp = await ZOHO.CRM.API.getOrgVariable("products");
        let optionsList = variableResp?.Success?.Content?.split(",");
        setOptions(optionsList);
        // console.log(variableResp?.Success?.Content);
      };

      fetchData();
    }
  }, [initialized]);

  const methods = useForm({
    defaultValues: {
      contactInfo: {
        Account_Name: recordData?.Account_Name?.name,
        Deal_Name: recordData?.Deal_Name,
        Contact_Name: recordData?.Contact_Name?.name,
        Contact_Phone: recordData?.Contact_Phone,
        Contact_Email: recordData?.Contact_Email,
        Sales_Person: recordData?.Sales_Person,
      },
    },
  });

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = methods;

  const {
    fields: productFields,
    append,
    remove,
  } = useFieldArray({
    control,
    name: "products",
  });

  const hardDueDate = useWatch({
    control,
    name: `hardDueDate`,
  });

  const doProductsNeedShipped = useWatch({
    control,
    name: `doProductsNeedShipped`,
  });

  const discountsForExtendedTurnaround = useWatch({
    control,
    name: `discountsForExtendedTurnaround`,
  });

  const howDidYouHearAboutUs = useWatch({
    control,
    name: `howDidYouHearAboutUs`,
  });

  const customDate = (date) => {
    const dateObj = new Date(date);
    let year = dateObj.getFullYear();
    let month = dateObj.getMonth();
    let day = dateObj.getDate();
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  function hexToText(hex) {
    var result = "";
    for (var i = 0; i < hex.length; i += 2) {
      result += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return result;
  }

  // Example usage
  var newLine = hexToText("0A");

  // Checkbox fields are stored as booleans. The note reads better as Yes/No.
  // NOTE FORMATTING ONLY - the JSON payload keeps the raw boolean on purpose,
  // because the revision form parses it. Do not normalise the stored values.
  const yn = (v) => (v === true ? "Yes" : v === false ? "No" : v ?? "");

  // Repeatable SKU rows render as a single comma-separated line in the note.
  const skuList = (rows) =>
    (rows || [])
      .map((r) => r?.sku)
      .filter((v) => v != null && String(v).trim() !== "")
      .join(", ");

  const onSubmit = async (data) => {
    setLoading(true);
    console.log("Collected Form Data:", data);

    // PRINT COUNT CALCULATION (runs first so counts are available while the note is assembled)
    // Department roll-ups (feed the note's actual/projected summary)
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
    // Per-job totals (written to dedicated Deal fields; feed the per-category Produce Order tasks)
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
    data?.products?.forEach((product) => {
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
            const underbaseValue = underbase === "Single-pass" ? 1 : underbase === "Double-pass" ? 2 : underbase === "Triple-pass" ? 3 : 0;
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
          // catch-all: Outsourced, Business Cards, Flyers, Keychains, Tumblers,
          // Name Tag, Marketing Materials, Pocket Schedules, and any new nongarment product
          outsourcedProducts += qty;
        }
      }
    });
    // Vinyl Department = sum of every vinyl-family job (the department roll-up)
    vinylDeptPrints = dtgPrints + dtfPrints + htvPrints + vinylPrints + stickersPrints + decalsPrints + bannersPrints + postersPrints + magnetsPrints + patchesPrints;
    const totalPrints = vinylDeptPrints + embroideryPrints + screenPrintPrints;
    const totalActualPrints = vinylActualPrints + embroideryActualPrints + screenActualPrints;
    const totalProjectedPrints = vinylProjectedPrints + embroideryProjectedPrints + screenProjectedPrints;
    // start mapping and extracting fields
    let content =
      "CONTACT INFO" +
      newLine +
      "---------------------------" +
      newLine +
      newLine +
      "Account Name: " +
      data?.contactInfo?.Account_Name +
      newLine +
      newLine +
      "Contact Name: " +
      data?.contactInfo?.Contact_Name +
      newLine +
      newLine +
      "Contact Phone: " +
      data?.contactInfo?.Contact_Phone +
      newLine +
      newLine +
      "Contact Email: " +
      data?.contactInfo?.Contact_Email +
      newLine +
      newLine +
      "Deal Name: " +
      data?.contactInfo?.Deal_Name +
      newLine +
      newLine +
      "Sales Person: " +
      data?.contactInfo?.Sales_Person +
      newLine +
      newLine +
      newLine +
      "PRODUCT INFORMATION" +
      newLine +
      "---------------------------" +
      newLine +
      newLine +
      "Selected Product Types: " +
      data?.products?.map((product) => product?.productName)?.join(", ") +
      newLine +
      newLine;

    data?.products?.forEach((product, index) => {
      let productName = product?.productName;
      content =
        content +
        "Product " +
        (index + 1) +
        ": " +
        productName +
        newLine +
        "---------------------------" +
        newLine +
        newLine;

      let productType = product?.productType;
      if (productType === "garment") {
        content =
          content +
          "Garment & Graphic Information" +
          newLine +
          "---------------------------" +
          newLine +
          newLine +
          "Number of Garment Types: " +
          product?.numberOfGarmentTypes +
          newLine +
          newLine;

        if (product?.premiumIronPass) {
          content =
            content +
            "Premium Iron Pass?: " +
            product?.premiumIronPass +
            newLine +
            newLine;
        }

        if (Number(product?.numberOfGarmentTypes) > 0) {
          product?.primaryBranches?.forEach((branch, branchIndex) => {
            content =
              content +
              "Garment " +
              (branchIndex + 1) +
              ":" +
              newLine +
              "---------------------------" +
              newLine +
              newLine +
              "Garment Type (Brand / Style): " +
              branch?.garmentType +
              newLine +
              newLine +
              "SKU(s): " +
              skuList(branch?.garmentSkus) +
              newLine +
              newLine +
              "Total Count, Colors & Sizes: " +
              branch?.countColorSize +
              newLine +
              newLine +
              "Graphic & Placement Information" +
              newLine +
              "---------------------------" +
              newLine +
              newLine +
              "Number of Graphics: " +
              branch?.numberOfGraphics +
              newLine +
              newLine;

            if (Number(branch?.numberOfGraphics) > 0) {
              branch?.secondaryBranches?.forEach(
                (subBranch, subBranchIndex) => {
                  content =
                    content +
                    "Graphic " +
                    (subBranchIndex + 1) +
                    ":" +
                    newLine +
                    "---------------------------" +
                    newLine +
                    newLine +
                    "Graphic Description: " +
                    subBranch?.graphicDescription +
                    newLine +
                    newLine +
                    "Is Graphic Print Ready?: " +
                    yn(subBranch?.isGraphicPrintReady) +
                    newLine +
                    newLine +
                    "Current Graphic Format: " +
                    subBranch?.currentGraphicFormat +
                    newLine +
                    newLine +
                    "Fine Detail?: " +
                    subBranch?.fineDetail +
                    newLine +
                    newLine;

                  if (subBranch?.fineDetail === "Yes") {
                    content =
                      content +
                      "Depending on current inventory, embroidery jobs with fine detail incur an upcharge for specialty thread: " +
                      yn(subBranch?.specialtyThread) +
                      newLine +
                      newLine;
                  }

                  content =
                    content +
                    "Upcharge Acknowledged?: " +
                    yn(subBranch?.upchargeAcknowledged) +
                    newLine +
                    newLine +
                    "Number Of Colors Used: " +
                    subBranch?.numberOfColorsUsed +
                    newLine +
                    newLine +
                    "Underbase Needed?: " +
                    subBranch?.underbase +
                    newLine +
                    newLine +
                    "Colors Used (Threads / PANTONES): " +
                    subBranch?.colorsUsed +
                    newLine +
                    newLine +
                    "Color Change?: " +
                    subBranch?.colorChange +
                    newLine +
                    newLine;

                  if (subBranch?.colorChange === "Yes") {
                    content =
                      content +
                      "Please Provide Details Of Color Change: " +
                      subBranch?.detailsOfColorChange +
                      newLine +
                      newLine;
                  }

                  content =
                    content +
                    "Fonts Used: " +
                    subBranch?.fontsUsed +
                    newLine +
                    newLine +
                    "Number Of Placements: " +
                    subBranch?.numberOfPlacements +
                    newLine +
                    newLine;

                  if (Number(subBranch?.numberOfPlacements) > 0) {
                    subBranch?.tartiaryBranches.forEach(
                      (subSubBranch, subSubBranchIndex) => {
                        content =
                          content +
                          "Placement " +
                          (subSubBranchIndex + 1) +
                          ":" +
                          newLine +
                          "---------------------------" +
                          newLine +
                          newLine +
                         "Placement Location: " +
                          subSubBranch?.placementLocation +
                          newLine +
                          newLine +
                          "Sizes & Dimensions: " +
                          subSubBranch?.sizeAndDimensions +
                          newLine +
                          newLine +
                          "Placement Size: " +
                          subSubBranch?.placementSize +
                          newLine +
                          newLine;
                      },
                    );
                  }
                },
              );
            }

            content =
              content +
              "Is This Garment Used With Other Application Types?: " +
              branch?.isUsedInOtherAppTypes +
              newLine +
              newLine;

            if (branch?.isUsedInOtherAppTypes === "Yes") {
              content =
                content +
                "Please Choose Application Type: " +
                branch?.chooseApplicationType +
                newLine +
                newLine;
            }

            content =
              content +
              "Vendors Used: " +
              branch?.vendorsUsed +
              newLine +
              newLine +
              "Special Instructions / Considerations: " +
              branch?.specialInstructions +
              newLine +
              newLine;
          });
        }

        content =
          content +
          "Other Information: " +
          product?.otherInformation +
          newLine +
          newLine +
          newLine;
      } else if (productType === "nongarment") {
        content =
          content +
          "Graphic Information" +
          newLine +
          "---------------------------" +
          newLine +
          newLine +
          "Number of Graphics: " +
          product?.numberOfGraphics +
          newLine +
          newLine;

        if (Number(product?.numberOfGraphics) > 0) {
          product?.branches?.forEach((branch, branchIndex) => {
            content =
              content +
              "Graphic " +
              (branchIndex + 1) +
              ": " +
              newLine +
              "---------------------------" +
              newLine +
              newLine +
              "Graphic Description: " +
              branch?.graphicDescription +
              newLine +
              newLine +
              "Is Graphic Print Ready?: " +
              yn(branch?.isGraphicPrintReady) +
              newLine +
              newLine +
              "Number of Colors Used: " +
              branch?.numberOfColorsUsed +
              newLine +
              newLine +
              "Colors Used: " +
              branch?.colorsUsed +
              newLine +
              newLine +
              "Current Graphic Format: " +
              branch?.currentGraphicFormat +
              newLine +
              newLine +
              "Upcharge Acknowledged?: " +
              yn(branch?.upchargedAcknowledged) +
              newLine +
              newLine +
              "Fonts Used: " +
              branch?.fontsUsed +
              newLine +
              newLine;
          });
        }

        content =
          content +
          "Quantity & Variables" +
          newLine +
          newLine +
          "Quantity Ordered: " +
          product?.quantityOrdered +
          newLine +
          newLine +
          "Dimensions: " +
          product?.dimensions +
          newLine +
          newLine +
          "# Of Sides: " +
          product?.numberOfSides +
          newLine +
          newLine +
          "Special Instructions: " +
          product?.specialInstructions +
          newLine +
          newLine +
          "Vendor Information" +
          newLine +
          newLine +
          "Is Outsourced?: " +
          yn(product?.isOutsourced) +
          newLine +
          newLine +
          "Vendors Used: " +
          product?.vendorsUsed +
          newLine +
          newLine +
          newLine;
      } else if (productType === "onlinestorefront") {
        content =
          content +
          "Online Storefront Information" +
          newLine +
          "---------------------------" +
          newLine +
          newLine +
          "Preferred Online Suffix: " +
          product?.preferredOnlineSuffix +
          newLine +
          newLine +
          "Contact Phone # for Storefront: " +
          product?.contactPhoneForStorefront +
          newLine +
          newLine +
          "Contact Email for Storefront: " +
          product?.contactEmailForStorefront +
          newLine +
          newLine +
          "Company Address for Storefront: " +
          product?.companyAddressForStorefront +
          newLine +
          newLine +
          "Specific Products on Storefront: " +
          product?.specificProductsOnStorefront +
          newLine +
          newLine +
          "Specific Product Base Pricing: " +
          product?.specificProductBasePricing +
          newLine +
          newLine +
          "Print Applications for Products: " +
          product?.printApplicationsForProducts?.join(", ") +
          newLine +
          newLine +
          "Are Your Graphics Print-Ready?: " +
          product?.areGraphicsPrintReady +
          newLine +
          newLine;

        if (product?.areGraphicsPrintReady === "No") {
          content =
            content +
            "Upcharge for Graphic Design?: " +
            yn(product?.upchargeForGraphicDesign) +
            newLine +
            newLine;
        }

        content =
          content +
          "Do You Have a Desired Live Date?: " +
          product?.desiredLiveDate +
          newLine +
          newLine;

        if (product?.desiredLiveDate === "Yes") {
          content =
            content +
            "Storefront Live Date: " +
            customDate(product?.storefrontLiveDate) +
            newLine +
            newLine;
        }

        content =
          content +
          "Is the Storefront Temporary or Evergreen?: " +
          product?.isStorefrontTemporaryOrEvergreen +
          newLine +
          newLine;

        if (product?.isStorefrontTemporaryOrEvergreen === "Temporary") {
          content =
            content +
            "Storefront End Date: " +
            customDate(product?.storefrontEndDate) +
            newLine +
            newLine;
        }

        content =
          content +
          "Mark Up Products?: " +
          product?.markUpProducts +
          newLine +
          newLine;

        if (product?.markUpProducts === "Yes") {
          content =
            content +
            "Percentage to Mark Up: " +
            product?.percentageToMarkUp +
            newLine +
            newLine;
        }

        content =
          content +
          "Do You Want Your Products to Be Customizable?: " +
          product?.productsCustomizable +
          newLine +
          newLine +
          "Are There Any Custom Fields or Notes You Would Like on Your Page?: " +
          product?.customFieldsOrNotes +
          newLine +
          newLine;

        if (product?.customFieldsOrNotes === "Yes") {
          content =
            content +
            "Please List Special Fields: " +
            product?.pleaseListSpecialFields +
            newLine +
            newLine;
        }

        content =
          content +
          "How Would You Like To Fulfill Orders?: " +
          product?.howToFulfillOrders?.join(", ") +
          newLine +
          newLine +
          "Would You Like To Include Any Other Links On Your Storefront?: " +
          product?.anyOtherLinks +
          newLine +
          newLine;

        if (product?.anyOtherLinks === "Yes") {
          content =
            content +
            "Please Provide Links: " +
            product?.pleaseProvideLinks +
            newLine +
            newLine;
        }

        content =
          content +
          "Do You Have any Banners or Graphics You Want Displayed on Your Website?: " +
          product?.bannersOrGraphics +
          newLine +
          newLine +
          newLine;
      } else if (productType === "graphic") {
        content =
          content +
          "Graphic Description: " +
          product?.graphicDescription +
          newLine +
          newLine +
          "Design Service Needed?: " +
          yn(product?.designServiceNeeded) +
          newLine +
          newLine +
          "Design Assets Provided?: " +
          yn(product?.designAssetsProvided) +
          newLine +
          newLine +
          "Desired Graphic Application: " +
          product?.desiredGraphicApplication +
          newLine +
          newLine +
          "Fonts Used: " +
          product?.fontsUsed +
          newLine +
          newLine +
          "Estimated Design Hours: " +
          product?.estimatedDesignHours +
          newLine +
          newLine +
          "Service Cost Acknowledged?: " +
          yn(product?.serviceCostAcknowledged) +
          newLine +
          newLine +
          "Date Needed By: " +
          customDate(product?.dateNeededBy) +
          newLine +
          newLine +
          "Special Instructions: " +
          product?.specialInstructions +
          newLine +
          newLine +
          newLine;
      }
    });

    content =
      content +
      "OTHER INFORMATION" +
      newLine +
      "---------------------------" +
      newLine +
      newLine +
      "How Did You Hear About Us?: " +
      data?.howDidYouHearAboutUs +
      newLine +
      newLine;

    if (data?.howDidYouHearAboutUs === "Other") {
      content =
        content +
        "Detail Lead Source: " +
        data?.detailLeadSource +
        newLine +
        newLine;
    }

    content =
      content +
      "Supplies / Materials Needed: " +
      data?.suppliesMaterialsNeeded +
      newLine +
      newLine +
      "Outsourced Products Ordered: " +
      outsourcedProducts +
      newLine +
      newLine +
      "Special Instructions: " +
      data?.specialInstructions +
      newLine +
      newLine +
      "Is This a Repeat Order?: " +
      data?.isRepeatOrder +
      newLine +
      newLine +
      "Do Products Need Shipped?: " +
      data?.doProductsNeedShipped +
      newLine +
      newLine;

    if (data?.doProductsNeedShipped === "Yes") {
      content =
        content +
        "Shipping Contact & Address: " +
        data?.shippingContactAddress +
        newLine +
        newLine +
        "Other Shipping Details: " +
        data?.otherShippingDetails +
        newLine +
        newLine;
    }

    content =
      content +
      "Customer Consents to Email and Text?: " +
      data?.customerConsentsToEmailAndText +
      newLine +
      newLine +
      "Round up for Charity?: " +
      data?.roundUpForCharity +
      newLine +
      newLine +
      newLine +
      "TURNAROUND TIME" +
      newLine +
      "---------------------------" +
      newLine +
      newLine +
      "Does Customer Have A Hard Due Date?: " +
      data?.hardDueDate +
      newLine +
      newLine;

    if (data?.hardDueDate === "Yes") {
      content =
        content +
        "Due Date: " +
        customDate(data?.dueDate) +
        newLine +
        newLine +
        "Upcharged For Rush Turnaround Time?: " +
        yn(data?.upchargedForRushTurnaround) +
        newLine +
        newLine;
    }

    if (data?.hardDueDate === "No") {
      content =
        content +
        "Discounts for Extended Turnaround Time?: " +
        data?.discountsForExtendedTurnaround +
        newLine +
        newLine;

      if (data?.discountsForExtendedTurnaround === "Yes") {
        content =
          content +
          "Add 1 Week To Production Time?: " +
          yn(data?.addOneWeekToProductionTime) +
          newLine +
          newLine;
      }

      if (data?.discountsForExtendedTurnaround === "No") {
        content =
          content +
          "10-14 Business Day Turnaround?: " +
          yn(data?.tenFourteenBusinessDayTurnaround) +
          newLine +
          newLine;
      }
    }

    content =
      content +
      "Custmer Acknowledged 24-48 Hour Mock-Up?: " +
      data?.typicalMockup;

    content =
      content +
      newLine + newLine +
      "PRINT COUNT SUMMARY" + newLine +
      "---------------------------" + newLine + newLine +
      "Actual = base design prints. Projected = extra prints from process steps (underbase, premium iron, heat press). Total = Actual + Projected." + newLine + newLine +
      "Screen Print" + newLine +
      "   Actual: " + screenActualPrints + "  |  Projected: " + screenProjectedPrints + "  |  Total: " + screenPrintPrints + newLine + newLine +
      "Vinyl" + newLine +
      "   Actual: " + vinylActualPrints + "  |  Projected: " + vinylProjectedPrints + "  |  Total: " + vinylDeptPrints + newLine + newLine +
      "Embroidery" + newLine +
      "   Actual: " + embroideryActualPrints + "  |  Projected: " + embroideryProjectedPrints + "  |  Total: " + embroideryPrints + newLine + newLine +
      "---------------------------" + newLine + newLine +
      "ALL DEPARTMENTS" + newLine +
      "   Actual: " + totalActualPrints + "  |  Projected: " + totalProjectedPrints + "  |  Total: " + totalPrints;
    
    // go for API call
    // Attempt to update Deal print count fields — silent fallback if fields don't exist yet
    try {
      await ZOHO.CRM.API.updateRecord({
        Entity: entity,
        APIData: {
          id: entityId,
          Vinyl_Department_Prints: vinylDeptPrints,
          Embroidery_Department_Prints: embroideryPrints,
          Screen_Print_Prints: screenPrintPrints,
          Vinyl_Prints: vinylPrints,
          DTG_Prints: dtgPrints,
          DTF_Prints: dtfPrints,
          HTV_Prints: htvPrints,
          Stickers_Prints: stickersPrints,
          Decals_Prints: decalsPrints,
          Banners_Prints: bannersPrints,
          Posters_Prints: postersPrints,
          Magnets_Prints: magnetsPrints,
          Patches_Prints: patchesPrints,
          Outsourced_Prints: outsourcedProducts,
        }
      });
    } catch (err) {
          console.log("Print count fields not yet on layout — skipping field update:", err);
    }

    // Attach the full form submission as a minified JSON file on the Deal (create-only;
    // machine-readable handoff for downstream production tooling). Own try/catch so a
    // failure here never blocks the note, the counts, or the form closing.
    try {
      const onboardingJson = JSON.stringify(data);
      const jsonBlob = new Blob([onboardingJson], { type: "application/json" });
      await ZOHO.CRM.API.attachFile({
        Entity: entity,
        RecordID: entityId,
        File: {
          Name: "onboarding-form.json",
          Content: jsonBlob,
        },
      });
    } catch (err) {
        console.log("Onboarding JSON attach failed — skipping:", err);
    }

    // Generate per-department production cards and attach each to the Deal (create-only,
    // human-readable job sheets). Own try/catch so a failure never blocks the note or counts.
    try {
      const cardCounts = {
        screenPrintPrints, embroideryPrints, vinylDeptPrints,
        dtgPrints, dtfPrints, htvPrints, vinylPrints, stickersPrints,
        decalsPrints, bannersPrints, postersPrints, magnetsPrints,
        patchesPrints, outsourcedProducts,
      };
      const productionCards = buildProductionCards(data, cardCounts);
      for (let c = 0; c < productionCards.length; c++) {
        try {
          const cardBlob = new Blob([productionCards[c].html], { type: "text/html" });
          await ZOHO.CRM.API.attachFile({
            Entity: entity,
            RecordID: entityId,
            File: { Name: productionCards[c].name, Content: cardBlob },
          });
        } catch (e) {
          console.log("Production card attach failed:", productionCards[c].name, e);
        }
      }
    } catch (err) {
      console.log("Production card generation failed — skipping:", err);
    }

    const response = await ZOHO.CRM.API.addNotes({
      
      Entity: entity,
      RecordID: entityId,
      Title: "DEAL ONBOARDING FORM",
      Content: content,
    });
    console.log(response);
    if (response?.data?.[0]?.code) {
      // ZOHO.CRM.UI.Popup.closeReload();
      const noteId = response?.data?.[0]?.details?.id;
      if (noteId !== null || noteId !== undefined) {
        // work on uploading attachments
        if (attachments.length > 0) {
          for (let i = 0; i < attachments.length; i++) {
            const file = attachments[i];
            const fileName = file.name;
            const blob = await file.arrayBuffer(); // Convert to Blob content

            const fileContent = new Blob([blob], { type: file.type });

            try {
              const response = await ZOHO.CRM.API.attachFile({
                Entity: "Notes",
                RecordID: noteId,
                File: {
                  Name: fileName,
                  Content: fileContent,
                },
              });

              if (i === attachments.length - 1) {
                ZOHO.CRM.UI.Popup.closeReload();
                setLoading(false);
              }
            } catch (err) {
              console.error("Upload failed for", fileName, err);
            }
          }
        } else {
          // No attachments, just close
          ZOHO.CRM.UI.Popup.closeReload();
          setLoading(false);
        }
      }
    }
  };

  if (recordData && options) {
    return (
      <Box sx={{ width: "100%" }}>
        <FormProvider {...methods}>
          <Box
            sx={{
              width: "90%",
              mx: "auto",
              bgcolor: "#F5F5F5",
              px: 2,
              py: 2,
              mb: 2,
            }}
            component="form"
            onSubmit={handleSubmit(onSubmit)}
          >
            <Typography
              sx={{
                textAlign: "center",
                pb: "1.5rem",
                fontWeight: "bold",
                fontSize: "1.5rem",
              }}
            >
              Deal Onboarding Form
            </Typography>

            <Typography
              variant="p"
              sx={{
                pt: "1rem",
                pb: "2rem",
                fontSize: "1.2rem",
                fontWeight: "bold",
              }}
            >
              CONTACT INFO
            </Typography>

            <Box sx={{ width: "100%", mt: 2 }}>
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                  mb: 2,
                }}
              >
                <Controller
                  control={control}
                  name="contactInfo.Account_Name"
                  defaultValue={recordData?.Account_Name?.name}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Account_Name"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Account Name"
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="contactInfo.Deal_Name"
                  defaultValue={recordData?.Deal_Name}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Deal_Name"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Deal Name"
                    />
                  )}
                />
              </Box>

              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                  mb: 2,
                }}
              >
                <Controller
                  control={control}
                  name="contactInfo.Contact_Name"
                  defaultValue={recordData?.Contact_Name?.name}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Contact_Name"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Contact Name"
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="contactInfo.Contact_Phone"
                  defaultValue={recordData?.Contact_Phone || ""}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Contact_Phone"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Contact Phone"
                    />
                  )}
                />
              </Box>

              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                  mb: 2,
                }}
              >
                <Controller
                  control={control}
                  name="contactInfo.Contact_Email"
                  defaultValue={recordData?.Contact_Email}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Contact_Email"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Contact Email"
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="contactInfo.Sales_Person"
                  defaultValue={recordData?.Sales_Person || ""}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Sales_Person"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Sales Person"
                    />
                  )}
                />
              </Box>
            </Box>

            <Typography
              variant="p"
              sx={{
                pt: "1rem",
                pb: "2rem",
                fontSize: "1.2rem",
                fontWeight: "bold",
                mt: 4,
              }}
            >
              Product Information
            </Typography>

            <Typography
              sx={{
                pt: "1rem",
                pb: "2rem",
                fontSize: "1rem",
                fontWeight: "bold",
              }}
            >
              Services / Printing Applications
            </Typography>

            <Controller
              name="productSelector"
              control={control}
              defaultValue={[]}
              render={({ field }) => (
                <Autocomplete
                  multiple
                  options={options || []}
                  value={field.value || []}
                  onChange={(e, newValue) => {
                    field.onChange(newValue);

                    const existingProductNames =
                      watch("products")?.map(
                        (p) => p.productName + "#" + p.productType,
                      ) || [];

                    const newProductsToAdd = newValue.filter(
                      (val) => !existingProductNames.includes(val),
                    );

                    // Add split product info
                    newProductsToAdd.forEach((combined) => {
                      const [productName, productType] = combined.split("#");
                      append({ productName, productType });
                    });

                    // Remove deselected items
                    const removed = existingProductNames.filter(
                      (pt) => !newValue.includes(pt),
                    );
                    removed.forEach((pt) => {
                      const [productName, productType] = pt.split("#");
                      const indexToRemove = watch("products")?.findIndex(
                        (p) =>
                          p.productName === productName &&
                          p.productType === productType,
                      );
                      if (indexToRemove !== -1) remove(indexToRemove);
                    });
                  }}
                  getOptionLabel={(option) => option.split("#")[0]} // only show product name
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Select Product Types"
                      size="small"
                    />
                  )}
                />
              )}
            />

            {productFields.map((item, index) => {
              const productType = watch(`products.${index}.productType`);
              const productName = watch(`products.${index}.productName`);

              return (
                <Box
                  key={item.id}
                  sx={{ border: "1px solid #ccc", p: 2, my: 2 }}
                >
                  <Box
                    mb={2}
                    sx={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Typography fontWeight="bold">
                      {productName} ({productType})
                    </Typography>

                    <Button
                      type="button"
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => {
                        const currentSelection = watch("productSelector") || [];
                        const toRemove = `${productName}#${productType}`;
                        const updatedSelection = currentSelection.filter(
                          (v) => v !== toRemove,
                        );
                        setValue("productSelector", updatedSelection);
                        remove(index);
                      }}
                    >
                      Remove
                    </Button>
                  </Box>

                  {productType === "garment" && (
                    <GarmentForm
                      index={index}
                      options={options}
                      productName={productName}
                    />
                  )}

                  {productType === "nongarment" && (
                    <NonGarmentForm index={index} />
                  )}

                  {productType === "graphic" && <GraphicForm index={index} />}

                  {productType === "onlinestorefront" && (
                    <OnlineStorefrontForm index={index} />
                  )}
                </Box>
              );
            })}

            <Typography
              sx={{
                pt: "1rem",
                fontSize: "1.2rem",
                fontWeight: "bold",
              }}
            >
              Other Information
            </Typography>

            <Controller
              control={control}
              name="howDidYouHearAboutUs"
              defaultValue={""}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="howDidYouHearAboutUs"
                  size="small"
                  options={[
                    "Google",
                    "Facebook",
                    "Yelp",
                    "Bing",
                    "Referall",
                    "Cold Call",
                    "Previous Customer",
                    "Other",
                  ]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="How Did You Hear About Us?"
                    />
                  )}
                />
              )}
            />

            {howDidYouHearAboutUs === "Other" && (
              <Controller
                control={control}
                name="detailLeadSource"
                defaultValue=""
                render={({ field }) => (
                  <TextField
                    multiline
                    rows={3}
                    size="small"
                    id="detailLeadSource"
                    variant="outlined"
                    fullWidth
                    label="Detail Lead Source"
                    {...field}
                    sx={{ mb: "1rem", mt: "5px" }}
                  />
                )}
              />
            )}

            <Controller
              control={control}
              name={`suppliesMaterialsNeeded`}
              defaultValue=""
              render={({ field }) => (
                <TextField
                  multiline
                  rows={3}
                  size="small"
                  id="suppliesMaterialsNeeded"
                  variant="outlined"
                  fullWidth
                  label="Supplies / Materials Needed"
                  {...field}
                  sx={{ mb: "1rem", mt: "5px" }}
                />
              )}
            />

            <Controller
              control={control}
              name={`specialInstructions`}
              defaultValue=""
              render={({ field }) => (
                <TextField
                  multiline
                  rows={3}
                  size="small"
                  id="specialInstructions"
                  variant="outlined"
                  fullWidth
                  label="Special Instructions"
                  {...field}
                  sx={{ mb: "1rem", mt: "5px" }}
                />
              )}
            />

            <Controller
              control={control}
              name="isRepeatOrder"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="isRepeatOrder"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Is This a Repeat Order?"
                    />
                  )}
                />
              )}
            />

            <Controller
              control={control}
              name="doProductsNeedShipped"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="doProductsNeedShipped"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Do Products Need Shipped?"
                    />
                  )}
                />
              )}
            />

            {doProductsNeedShipped === "Yes" && (
              <>
                <Controller
                  control={control}
                  name="shippingContactAddress"
                  defaultValue=""
                  render={({ field }) => (
                    <TextField
                      multiline
                      rows={3}
                      size="small"
                      id="shippingContactAddress"
                      variant="outlined"
                      fullWidth
                      label="Shipping Contact & Address"
                      {...field}
                      sx={{ mb: "1rem", mt: "5px" }}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="otherShippingDetails"
                  defaultValue=""
                  render={({ field }) => (
                    <TextField
                      multiline
                      rows={3}
                      size="small"
                      id="otherShippingDetails"
                      variant="outlined"
                      fullWidth
                      label="Other Shipping Details"
                      {...field}
                      sx={{ mb: "1rem", mt: "5px" }}
                    />
                  )}
                />
              </>
            )}

            <Controller
              control={control}
              name="customerConsentsToEmailAndText"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="customerConsentsToEmailAndText"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Customer Consents to Email and Text?"
                    />
                  )}
                />
              )}
            />

            <Controller
              control={control}
              name="roundUpForCharity"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="roundUpForCharity"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Round up for Charity?"
                    />
                  )}
                />
              )}
            />

            <Box sx={{ mt: 2 }}>
              <Typography
                sx={{
                  fontSize: "0.9rem",
                  fontWeight: "bold",
                  mb: 1,
                }}
              >
                File Upload (Max total: 15MB)
              </Typography>

              <input
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files);
                  const totalSize = files.reduce(
                    (acc, file) => acc + file.size,
                    0,
                  );

                  if (totalSize > 15 * 1024 * 1024) {
                    setFileError("Total file size cannot exceed 15MB.");
                    setAttachments([]);
                  } else {
                    setFileError("");
                    setAttachments(files);
                  }
                }}
              />

              {fileError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {fileError}
                </Alert>
              )}

              {attachments.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" fontWeight="bold">
                    Selected Files:
                  </Typography>
                  <ul style={{ paddingLeft: "1rem", margin: 0 }}>
                    {attachments.map((file, idx) => (
                      <li key={idx}>
                        {file.name} - {(file.size / (1024 * 1024)).toFixed(2)}{" "}
                        MB
                      </li>
                    ))}
                  </ul>
                </Box>
              )}
            </Box>

            <Typography
              sx={{
                pt: "1rem",
                fontSize: "1.2rem",
                fontWeight: "bold",
              }}
            >
              Turnaround Time
            </Typography>

            <Controller
              control={control}
              name="hardDueDate"
              defaultValue={""}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="hardDueDate"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Does Customer Have A Hard Due Date?"
                    />
                  )}
                />
              )}
            />

            {hardDueDate === "Yes" && (
              <>
                <Box sx={{ mb: "1rem" }}>
                  <FormLabel
                    id="date"
                    sx={{ mb: "10px", color: "black", display: "block" }}
                  >
                    Due Date
                  </FormLabel>
                  <Controller
                    name={`dueDate`}
                    control={control}
                    render={({ field }) => (
                      <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <DatePicker
                          onChange={(newValue) =>
                            field.onChange(dayjs(newValue).format("YYYY/MM/DD"))
                          }
                          {...field}
                          renderInput={(params) => (
                            <TextField
                              id="dueDate"
                              variant="outlined"
                              type="date"
                              sx={{
                                "& .MuiInputBase-root": {
                                  height: "2.3rem !important",
                                },
                              }}
                              {...params}
                            />
                          )}
                        />
                      </LocalizationProvider>
                    )}
                  />
                </Box>
                <Controller
                  control={control}
                  name="upchargedForRushTurnaround"
                  defaultValue={false}
                  render={({ field }) => (
                    <FormGroup>
                      <FormControlLabel
                        control={<Checkbox {...field} checked={!!field.value} />}
                        label="Upcharged For Rush Turnaround Time?"
                      />
                    </FormGroup>
                  )}
                />
              </>
            )}

            {hardDueDate === "No" && (
              <>
                <Controller
                  control={control}
                  name="discountsForExtendedTurnaround"
                  defaultValue={""}
                  render={({ field }) => (
                    <Autocomplete
                      {...field}
                      options={["Yes", "No"]}
                      value={field.value || ""}
                      onChange={(_, newValue) => field.onChange(newValue)}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Discounts for Extended Turnaround Time?"
                          variant="outlined"
                          size="small"
                          fullWidth
                          sx={{ mb: "1rem", mt: "5px" }}
                        />
                      )}
                    />
                  )}
                />

                {discountsForExtendedTurnaround === "Yes" && (
                  <Controller
                    control={control}
                    name="addOneWeekToProductionTime"
                    defaultValue={false}
                    render={({ field }) => (
                      <FormGroup>
                        <FormControlLabel
                          control={<Checkbox {...field} checked={!!field.value} />}
                          label="Add 1 Week To Production Time"
                        />
                      </FormGroup>
                    )}
                  />
                )}

                {discountsForExtendedTurnaround === "No" && (
                  <Controller
                    control={control}
                    name="tenFourteenBusinessDayTurnaround"
                    defaultValue={false}
                    render={({ field }) => (
                      <FormGroup>
                        <FormControlLabel
                          control={<Checkbox {...field} checked={!!field.value} />}
                          label="10-14 Business Day Turnaround"
                        />
                      </FormGroup>
                    )}
                  />
                )}
              </>
            )}

            <Controller
              control={control}
              name="typicalMockup"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="typicalMockup"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Custmer Acknowledged 24-48 Hour Mock-Up?"
                    />
                  )}
                />
              )}
            />


            {/* <Button
              type="submit"
              variant="contained"
              size="small"
              sx={{ mt: 2 }}
            >
              Submit
            </Button> */}

            <Box
              sx={{
                m: "1rem 0",
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <Button
                onClick={() => {
                  ZOHO.CRM.UI.Popup.close();
                }}
                variant="outlined"
              >
                Cancel
              </Button>

              <Button
                variant="contained"
                type="submit"
                loadingPosition="start"
                // loading={addCardLoading}
                disabled={loading}
              >
                Submit Form
              </Button>
            </Box>
          </Box>
        </FormProvider>
      </Box>
    );
  } else {
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "1rem",
            margin: "20% 0",
          }}
        >
          <CircularProgress color="inherit" />
          <Typography fontWeight="bold" fontSize="1.5rem">
            Fetching Data. Please Wait...
          </Typography>
        </Box>
      </Box>
    );
  }
}

export default App;
