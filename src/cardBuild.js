/*
 * cardBuild.js -- rebuilding a Deal's production cards from its saved order. Moved verbatim out of
 * CardViewer.jsx (2026-10-12, E-52) so the Quality Check form shows the SAME cards the viewer does
 * (D-24: imported, never copied). Pure: no ZOHO, no React.
 */
import { buildProductionCards, workDriveTarget } from "./productionCards";
import { dealShipments } from "./tracking";

// Tab order and labels, keyed by the filenames buildProductionCards() writes in App.jsx.
export const CARD_ORDER = [
  ["production-card-screenprint.html", "Screen Print"],
  ["production-card-embroidery.html", "Embroidery"],
  ["production-card-vinyl.html", "Vinyl"],
  ["production-card-outsourced.html", "Outsourced"],
  ["production-card-graphicdesign.html", "Graphic Design"],
  ["production-card-storefront.html", "Storefront"],
  ["production-card-colormatch.html", "Color Matching"],
];
// A card the viewer shows whenever the onboarding data produces it, attached or not -- so deals
// onboarded before the card existed get it too (E-48).
export const ALWAYS_BUILT = ["production-card-colormatch.html"];
export const labelFor = (name) =>
  (CARD_ORDER.find(([file]) => file === name) || [])[1] ||
  name.replace(/^production-card-/, "").replace(/\.html$/i, "");
export const orderOf = (name) => {
  const i = CARD_ORDER.findIndex(([file]) => file === name);
  return i === -1 ? CARD_ORDER.length : i;
};

// Deal field -> the count key buildProductionCards() reads. 1:1 with the updateRecord in App.jsx.
export const COUNT_FIELDS = {
  Screen_Print_Prints: "screenPrintPrints",
  Embroidery_Department_Prints: "embroideryPrints",
  Vinyl_Department_Prints: "vinylDeptPrints",
  Embroidery_Small_Prints: "embroiderySmallPrints",
  Embroidery_Medium_Prints: "embroideryMediumPrints",
  Embroidery_Large_Prints: "embroideryLargePrints",
  DTG_Prints: "dtgPrints",
  DTF_Prints: "dtfPrints",
  DTF_Gang_Sheet_Prints: "gangSheetPrints",
  HTV_Prints: "htvPrints",
  Vinyl_Prints: "vinylPrints",
  Stickers_Prints: "stickersPrints",
  Decals_Prints: "decalsPrints",
  Banners_Prints: "bannersPrints",
  Posters_Prints: "postersPrints",
  Magnets_Prints: "magnetsPrints",
  Patches_Prints: "patchesPrints",
  Outsourced_Prints: "outsourcedProducts",
};

/*
 * data = the newest onboarding-form.json, deal = the Deal record. Returns Map(file name -> html),
 * built from the Deal's CURRENT print counts and Closing Date.
 */
export function buildCardsFromData(data, deal) {
  const counts = {};
  for (const [field, key] of Object.entries(COUNT_FIELDS)) {
    if (deal[field] != null) counts[key] = deal[field];
  }
  // The due date on a card came from the payload -- the date typed at onboarding -- so a card kept
  // showing it after the deal moved, which is what production was reading. David's ruling
  // (2026-09-22, E-21): the Deal's CURRENT Closing Date wins. Viewer only; the attached files are
  // create-only and still carry the original date, which is one more reason to read cards here.
  // If the Deal has no Closing Date, fall through to the payload and the card's own
  // "See Closing Date on Deal" fallback.
  // TRAP: CRM date fields come back as bare "YYYY-MM-DD", which `new Date()` reads as UTC midnight.
  // West of UTC that renders as the PREVIOUS day -- "2026-09-24" printed 2026-09-23 in Boise. Pin it
  // to local midnight so the card shows the date the Deal actually says. (The form's own due date is
  // a DatePicker object and was never affected, which is why this only bites here.)
  const localDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d);
  const liveDue = deal.Closing_Date
    ? { ...data, hardDueDate: "Yes", dueDate: localDate(deal.Closing_Date) }
    : data;
  const built = new Map();
  // E-53: the PO number and the WorkDrive folder come from the Deal as it is now, like the due date.
  // E-55: the Deal's own folder when the Deal carries its link, otherwise the Mock Up folder, named as such.
  const folder = workDriveTarget(deal);
  // E-117a (Angela, 10-23): where the garments were really ordered from is the Deal's Garments Ordered Notes, written after ordering;
  // the cards here are rebuilt from the Deal as it is now, so they show it.
  // E-137: the boxes coming in from suppliers, read from the Deal now (the new Production Tracking field, else the 8 old boxes).
  const dealInfo = { poNumber: deal.PO_Number, workDriveLink: folder.href, workDriveLabel: folder.label, garmentsOrderedNotes: deal.Garments_Ordered_Notes, shipments: dealShipments(deal) };
  for (const c of buildProductionCards(liveDue, counts, dealInfo)) built.set(c.name.toLowerCase(), c.html);
  return built;
}
