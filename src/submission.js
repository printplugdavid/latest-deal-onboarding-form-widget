/*
 * submission.js -- what the onboarding form's Submit produces, as one pure function (docs/45, 47).
 *
 * buildSubmission() is the ONE path from the form's answers to the four things Submit writes: the note, the 18
 * print fields, onboarding-form.json and the production cards. The form calls it (App.jsx onSubmit), and so does
 * the InkSoft order-sync, headless, for online orders -- which is why nothing here may touch React, ZOHO, window
 * or the network. The CRM writes stay in the caller.
 *
 * Order, exactly as Submit has always run it:
 *   1. E-58 splits: a graphic unticked for a garment in a split garment type is left out of that garment.
 *   2. note text, print fields and card counts (onboardingNote.js, shared with the Amendment Form).
 *   3. E-48 color matches -- derived, saved as a `_` key; a failure leaves them out, nothing else.
 *   4. the JSON stamp: _schemaVersion 1, _submittedAt, and for an automatic onboarding _source + _inksoftOrderId.
 *   5. the cards, from the same counts -- a failure gives no cards, nothing else.
 * Customer Notes are NOT done here: saving them is a CRM write. The caller passes the combined text it saved
 * (dealInfo.customerNotes) so the JSON and the cards print it, as before.
 */
import { applyGarmentSplits } from "./garmentSplit";
import { buildOnboardingNote } from "./onboardingNote";
import { buildColorMatches } from "./colorMatch";
import { buildProductionCards } from "./productionCards";

export const AUTO_SOURCE = "online-order-auto";
const has = (v) => v != null && String(v).trim() !== "";
const newLine = String.fromCharCode(10); // the note's line break, as onboardingNote.js writes it (00 rule 5)

/* The line an automatic onboarding adds at the very end of the note, so a person reading the Deal can tell. */
export const autoNoteLine = (orderId) => "Onboarded automatically from InkSoft order " + String(orderId).trim();

/*
 * formData  -- the form's answers, as react-hook-form hands them to onSubmit (or as the order-sync maps them).
 * dealInfo  -- { poNumber, workDriveLink, workDriveLabel, customerNotes, source, inksoftOrderId, submittedAt }
 *              all optional. `source` is only ever AUTO_SOURCE or absent: "note" means a lossy rebuild to every
 *              reader (docs/06), so it is refused here.
 * Returns { data, note, printFields, cardCounts, json, cards: [{ name, html }] }. `data` is the answers after the
 * splits -- what every other part was built from.
 */
export function buildSubmission(formData, dealInfo = {}) {
  const data = applyGarmentSplits(formData);
  const { content, printFields, cardCounts } = buildOnboardingNote(data);

  const auto = dealInfo.source === AUTO_SOURCE;
  const note = auto && has(dealInfo.inksoftOrderId) ? content + newLine + newLine + autoNoteLine(dealInfo.inksoftOrderId) : content;

  const cardData = has(dealInfo.customerNotes) ? { ...data, customerNotes: dealInfo.customerNotes } : data;

  let colorMatches = [];
  try {
    colorMatches = buildColorMatches(cardData);
  } catch (e) {
    console.log("Color matching failed - skipping:", e);
  }
  const json = JSON.stringify({
    ...cardData,
    ...(colorMatches.length ? { _colorMatches: colorMatches } : {}),
    _schemaVersion: 1,
    _submittedAt: has(dealInfo.submittedAt) ? String(dealInfo.submittedAt) : new Date().toISOString(),
    ...(auto ? { _source: AUTO_SOURCE } : {}),
    ...(auto && has(dealInfo.inksoftOrderId) ? { _inksoftOrderId: String(dealInfo.inksoftOrderId).trim() } : {}),
  });

  let cards = [];
  try {
    cards = buildProductionCards(cardData, cardCounts, {
      poNumber: dealInfo.poNumber,
      workDriveLink: dealInfo.workDriveLink,
      workDriveLabel: dealInfo.workDriveLabel,
    });
  } catch (e) {
    console.log("Production card generation failed - skipping:", e);
  }

  return { data, note, printFields, cardCounts, json, cards };
}

/*
 * profileFromSubmission(json) -- per graphic, the answers that stay the same from one order of a store design to
 * the next, so the order-sync can key them by InkSoft art file and fill the next order without a person.
 * Accepts the parsed JSON or its string. Garment graphics only (gang sheets, storefronts and non-garment products
 * carry no reusable art answers). Returns [{ product, garment, graphic, productName, garmentType, garmentKind,
 * answers: {...}, placements: [{...}] }] in the order they appear. Keys absent from the order are left out.
 */
const GRAPHIC_KEYS = [
  "graphicDescription", "isGraphicPrintReady", "currentGraphicFormat", "fineDetail", "numberOfColorsUsed",
  "underbase", "colorsUsed", "colorChange", "detailsOfColorChange", "fontsUsed", "specialtyThread",
];
const PLACEMENT_KEYS = [
  "placementPick", "placementOther", "placementLocation", "widthIn", "heightIn", "sizeAndDimensions",
  "placementSize", "positionNote",
];
const pick = (obj, keys) => {
  const out = {};
  keys.forEach((k) => {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") out[k] = obj[k];
  });
  return out;
};

export function profileFromSubmission(json) {
  let order = json;
  try {
    if (typeof json === "string") order = JSON.parse(json);
  } catch (e) {
    return [];
  }
  const out = [];
  ((order && order.products) || []).forEach((p, pi) => {
    if (!p || p.productType !== "garment") return;
    (p.primaryBranches || []).forEach((gar, gi) => {
      ((gar && gar.secondaryBranches) || []).forEach((g, ki) => {
        if (!g) return;
        out.push({
          product: pi,
          garment: gi,
          graphic: ki,
          productName: p.productName || "",
          garmentType: (gar && gar.garmentType) || "",
          garmentKind: (gar && gar.garmentKind) || "",
          answers: pick(g, GRAPHIC_KEYS),
          placements: (g.tartiaryBranches || []).map((t) => pick(t, PLACEMENT_KEYS)),
        });
      });
    });
  });
  return out;
}
