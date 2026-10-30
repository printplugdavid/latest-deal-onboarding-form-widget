/*
 * E-183 / E-114 (David 10-30, "Agree on both counts"): the Deal's "Garments Provided" choice follows the order's client-owned garments.
 * Production reads it at the stage move to In Production: exactly "Garments Provided from Client" skips the Order Garments task
 * (Deluge masters); blank and the mixed value still order. Setting either client value makes the Sales Person an "Inspect Client
 * Supplied Garments" task (rule "Client Supplied Garments Task Automation", create or edit, repeat OFF -- so once per Deal).
 *
 * Rules:
 *   - no client-owned (PPCO) garment on the order -> nothing written (a value someone set by hand is never cleared);
 *   - every garment row is client-owned only -> "Garments Provided from Client";
 *   - some client-owned, some bought (or a garment row with no SKU, so we can't tell) -> "Garments Purchased + Provided From Client".
 * Used by the onboarding Submit and the Amendment Form. Behind productionConfig.json `garmentsProvidedOn`.
 */
import { isClientOwnedSku } from "./clientOwned";

export const GARMENTS_PROVIDED_FIELD = "Garments_Provided_1";
export const PROVIDED = "Garments Provided from Client";
export const MIXED = "Garments Purchased + Provided From Client";

const str = (v) => (v == null ? "" : String(v));
const has = (v) => str(v).trim() !== "";

export const garmentsProvidedOn = (config) => !!config && config.garmentsProvidedOn === true;

/* The garment rows on the order: every garment product's garment types, each read as client-owned, bought or mixed. */
function garmentRows(data) {
  const rows = [];
  (data?.products || []).forEach((p) => {
    if (p?.productType !== "garment") return;
    (p?.primaryBranches || []).forEach((b) => {
      const skus = (b?.garmentSkus || []).map((r) => str(r?.sku).trim()).filter(Boolean);
      const own = skus.filter((s) => isClientOwnedSku(s)).length;
      rows.push({ own, bought: skus.length - own, none: skus.length === 0 });
    });
  });
  return rows;
}

/* What the order's garments say the Deal's choice should be: PROVIDED, MIXED or "" (no client-owned garment). */
export function garmentsProvidedValue(data) {
  const rows = garmentRows(data);
  if (!rows.some((r) => r.own > 0)) return "";
  return rows.every((r) => r.own > 0 && r.bought === 0) ? PROVIDED : MIXED;
}

/*
 * What to write after this Submit / Amendment save. -> { change, value, was, workflow, message }.
 * `before` (Amendment Form only) = the order as it was: an amendment that did not change the client-owned picture leaves the Deal as
 * it is, so a later correction by hand is not put back.
 * `workflow` is false only at the stage whose create-or-edit rule repeats on every save (Order Needs Corrections), so a save there
 * does not re-fire it.
 */
export function garmentsProvidedPlan(deal, data, before) {
  const was = str(deal?.[GARMENTS_PROVIDED_FIELD]).trim();
  const value = garmentsProvidedValue(data);
  const none = { change: false, value, was, workflow: false, message: "" };
  if (!value || value === was) return none;
  if (before !== undefined && garmentsProvidedValue(before) === value && has(was)) return none;
  const workflow = !/needs corrections/i.test(str(deal?.Stage));
  const lines = [];
  if (has(was)) lines.push(`The Deal's "Garments Provided" was changed to "${value}" to match the garments on this form (it was "${was}").`);
  if (/in production|test garment|quality check/i.test(str(deal?.Stage)) && value === PROVIDED) {
    lines.push("This Deal is already in production, so an Order Garments task made earlier stays. Close it if nothing needs ordering.");
  }
  return { change: true, value, was, workflow, message: lines.join("\n\n") };
}
