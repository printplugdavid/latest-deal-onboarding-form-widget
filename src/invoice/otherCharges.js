/*
 * E-108 (docs/63, Books docs/39 §5b): the "Other charges" a rep may add, and the ones the form suggests from the order. Manual for now
 * (David 10-20): a suggestion is a button the rep presses, never a line added on its own. Pure.
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
  const emb = graphicsOf(d.products, "Embroidery");
  if (!repeat && screen.length) {
    const colors = screen.reduce((n, x) => n + Math.max(1, int(x.g.numberOfColorsUsed)), 0);
    out.push({ sku: "PPFEE2", quantity: colors, why: "new screens (not a repeat order): setup per color" });
  }
  const dark = screen.filter((x) => /pass/i.test(str(x.g.underbase)));
  if (dark.length) {
    const pieces = dark.reduce((n, x) => n + int(x.b.garmentQuantity), 0);
    if (pieces) out.push({ sku: "PPFEE5", quantity: pieces, why: "an underbase is set (dark garments): extra white ink layer" });
  }
  if (!repeat && emb.length) out.push({ sku: "PPEDF", quantity: emb.length, why: "new embroidery logo (not a repeat order): digitizing" });
  const notReady = [...screen, ...emb, ...graphicsOf(d.products, "Direct-to-Film"), ...graphicsOf(d.products, "Direct-to-Garment"), ...graphicsOf(d.products, "Heat-Transfer")]
    .filter((x) => str(x.g.isGraphicPrintReady) === "No").length;
  if (notReady) out.push({ sku: "PPFEE3", quantity: notReady, why: "a graphic is not print ready: vector fee" });
  const hours = (d.products || [])
    .filter((p) => p && p.productType === "graphic")
    .reduce((n, p) => n + (Number(str(p.estimatedDesignHours).replace(/[^\d.]/g, "")) || 0), 0);
  if (hours > 0) out.push({ sku: "PPGD2", quantity: hours, why: `estimated design hours: ${hours}` });
  const have = new Set((d.otherCharges || []).map((c) => str(c && c.sku).toUpperCase()));
  return out.filter((s) => !have.has(s.sku) && GRID.items[s.sku]);
}
