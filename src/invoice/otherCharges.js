/*
 * E-108 (docs/63, Books docs/39 §5b): the "Other charges" a rep may add, and the ones the form suggests from the order (a button the
 * rep presses). E-154 (David 10-29): the ART fees are no longer suggestions -- they are added on their own, per graphic (artFees). Pure.
 */
import GRID from "./billingGrid.json";

const str = (v) => (v == null ? "" : String(v));
const int = (v) => {
  const n = parseInt(str(v), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/* The list offered in the picker: Books name + how it is counted. */
export const OTHER_CHARGES = GRID.otherCharges.map((c) => ({ ...c, name: (GRID.items[c.sku] || {}).name || c.sku }));
export const chargeLabel = (sku) => {
  const c = OTHER_CHARGES.find((x) => x.sku === sku);
  return c ? `${c.name} (${c.sku}, ${c.per})` : sku;
};

const graphicsOf = (products, method) =>
  (products || [])
    .filter((p) => p && p.productType === "garment" && str(p.productName) === method)
    .flatMap((p) => (p.primaryBranches || []).filter(Boolean).flatMap((b) => (b.secondaryBranches || []).filter(Boolean).map((g) => ({ b, g }))));

/*
 * [{ sku, quantity, why }] -- suggestions not already in the rep's Other charges. Prompt ideas from docs/39 §5b:
 * not a repeat order + screen print -> setup per color · underbase (dark garments) -> extra white ink layer · new embroidery
 * logo -> digitizing · art not print ready -> vector fee · estimated design hours -> graphic design.
 */
export function suggestCharges(data) {
  const d = data || {};
  const repeat = str(d.isRepeatOrder) === "Yes";
  const out = [];
  const screen = graphicsOf(d.products, "Screen Printing");
  if (!repeat && screen.length) {
    const colors = screen.reduce((n, x) => n + Math.max(1, int(x.g.numberOfColorsUsed)), 0);
    out.push({ sku: "PPFEE2", quantity: colors, why: "new screens (not a repeat order): setup per color" });
  }
  const dark = screen.filter((x) => /pass/i.test(str(x.g.underbase)));
  if (dark.length) {
    const pieces = dark.reduce((n, x) => n + int(x.b.garmentQuantity), 0);
    if (pieces) out.push({ sku: "PPFEE5", quantity: pieces, why: "an underbase is set (dark garments): extra white ink layer" });
  }
  // E-154: digitizing, vector fee and the design half hour are added on their own now (artFees), so they are no longer suggested.
  const hours = (d.products || [])
    .filter((p) => p && p.productType === "graphic")
    .reduce((n, p) => n + (Number(str(p.estimatedDesignHours).replace(/[^\d.]/g, "")) || 0), 0);
  if (hours > 0) out.push({ sku: "PPGD2", quantity: hours, why: `estimated design hours: ${hours}` });
  const have = new Set((d.otherCharges || []).map((c) => str(c && c.sku).toUpperCase()));
  return out.filter((s) => !have.has(s.sku) && GRID.items[s.sku]);
}

/*
 * E-154 (David 10-29), per graphic, from that graphic's own answers:
 *   Screen Printing   not print ready -> Graphic Design half hour (PPGD1); no print-ready vector file -> Vector Fee (PPFEE3) (both can apply)
 *   Embroidery        no digitized file (DST) -> Digitizing (PPEDF)
 *   DTF / DTG / HTV   not print ready -> Graphic Design half hour (PPGD1)
 * "Is Graphic Print Ready?" is a tick box (true / false; "Yes" / "No" in older or robot data). The two new questions are Yes / No;
 * blank = not answered = no fee (artQuestionsOpen counts those so the rep sees them).
 * [{ sku, quantity, description, why, on, graphics }] one row per fee; `on` false when the rep switched it off (`artFeesOff`) or
 * already added that charge by hand (the hand-added line wins).
 */
export const ART_FEES = { design: "PPGD1", vector: "PPFEE3", digitizing: "PPEDF" };
const IMAGE_METHODS = ["Direct-to-Film", "Direct-to-Garment", "Heat-Transfer"];
const isReady = (v) => v === true || ["yes", "true"].includes(str(v).trim().toLowerCase());
const saysNo = (v) => str(v).trim().toLowerCase() === "no";
const short = (t) => {
  const s = str(t).replace(/\s+/g, " ").trim();
  return s.length > 40 ? s.slice(0, 39) + "…" : s;
};

export function artFees(data) {
  const d = data || {};
  const found = { PPGD1: [], PPFEE3: [], PPEDF: [] };
  const label = (method, x, k) => `${method} graphic ${k + 1}${short(x.g.graphicDescription) ? ": " + short(x.g.graphicDescription) : ""}`;
  graphicsOf(d.products, "Screen Printing").forEach((x, k) => {
    if (!isReady(x.g.isGraphicPrintReady)) found.PPGD1.push(label("Screen print", x, k));
    if (saysNo(x.g.hasPrintReadyVector)) found.PPFEE3.push(label("Screen print", x, k));
  });
  graphicsOf(d.products, "Embroidery").forEach((x, k) => {
    if (saysNo(x.g.hasDigitizedFile)) found.PPEDF.push(label("Embroidery", x, k));
  });
  IMAGE_METHODS.forEach((m) =>
    graphicsOf(d.products, m).forEach((x, k) => {
      if (!isReady(x.g.isGraphicPrintReady)) found.PPGD1.push(label(m, x, k));
    })
  );
  const off = new Set((d.artFeesOff || []).map((v) => str(v).toUpperCase()));
  const byHand = new Set((d.otherCharges || []).map((c) => str(c && c.sku).trim().toUpperCase()));
  const WHY = { PPGD1: "not print ready", PPFEE3: "no print-ready vector file", PPEDF: "no digitized file (DST)" };
  return ["PPGD1", "PPFEE3", "PPEDF"]
    .filter((sku) => found[sku].length && GRID.items[sku])
    .map((sku) => ({
      sku,
      quantity: found[sku].length,
      description: `${GRID.items[sku].name} - ${found[sku].join("; ")}`,
      why: WHY[sku],
      graphics: found[sku],
      byHand: byHand.has(sku),
      on: !off.has(sku) && !byHand.has(sku),
    }));
}

/* How many graphics still need the vector (screen print) or DST (embroidery) answer before their fees can be worked out. */
export function artQuestionsOpen(data) {
  const d = data || {};
  const v = graphicsOf(d.products, "Screen Printing").filter((x) => !str(x.g.hasPrintReadyVector).trim()).length;
  const e = graphicsOf(d.products, "Embroidery").filter((x) => !str(x.g.hasDigitizedFile).trim()).length;
  return { vector: v, digitized: e };
}

