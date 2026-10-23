/*
 * E-126: read the Deal `Vendors` choices from CRM when a form opens, so a vendor added in Setup is offered at once (no forms push).
 * Field metadata can lag a change by up to about an hour (docs/08). Never throws; on any failure the built-in list stays.
 */
import { setDealVendors, vendorChoicesFrom } from "./vendors";

let started = null;
export function loadDealVendors() {
  if (started) return started;
  started = (async () => {
    try {
      const zoho = typeof window !== "undefined" ? window.ZOHO : null;
      if (!(zoho && zoho.CRM && zoho.CRM.META && typeof zoho.CRM.META.getFields === "function")) return;
      const r = await zoho.CRM.META.getFields({ Entity: "Deals" });
      const names = vendorChoicesFrom(r);
      if (names.length) setDealVendors(names);
    } catch (e) {
      console.log("Deal vendor list not read - using the built-in list:", e);
    }
  })();
  return started;
}
