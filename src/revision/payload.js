/*
 * payload.js -- loads the order's product tree for a Deal.
 *
 * Two sources, tried in order:
 *
 *   1. onboarding-form.json attached to the Deal   (deals onboarded since the
 *      JSON change; complete, includes garmentQuantity)
 *   2. the "DEAL ONBOARDING FORM" note             (2,659 deals; everything the
 *      revision calculation needs except garmentQuantity, which the agent
 *      supplies anyway)
 *
 * Read path for (1) confirmed against a live deal 31 Aug 2026:
 *   getFile({ id: <$file_id> })  ->  Blob (application/x-download)
 *   .text()                      ->  the JSON
 *
 * TRAP: getFile must be given the attachment's internal "$file_id", NOT the
 * attachment record id. Passing the record id returns an EMPTY Blob -- size 0,
 * mime text/xml -- and throws nothing. The failure is completely silent.
 */
import { parseOnboardingNote } from "./noteParser";

const ZOHO = window.ZOHO;

const ONBOARDING_NOTE_TITLE = "DEAL ONBOARDING FORM";

const newestFirst = (a, b) => new Date(b?.Created_Time || 0) - new Date(a?.Created_Time || 0);

export async function listPayloadAttachments(entity, recordId) {
  const resp = await ZOHO.CRM.API.getRelatedRecords({
    Entity: entity,
    RecordID: recordId,
    RelatedList: "Attachments",
    page: 1,
    per_page: 200,
  });
  return (resp?.data || [])
    .filter((a) => String(a?.File_Name || "").toLowerCase().endsWith(".json"))
    .sort(newestFirst);
}

async function readJsonAttachment(entity, recordId) {
  const candidates = await listPayloadAttachments(entity, recordId);
  if (!candidates.length) return null;

  // Newest wins if onboarding was ever re-submitted on this deal.
  const attachment = candidates[0];
  const fileId = attachment["$file_id"];
  if (!fileId) return null;

  const blob = await ZOHO.CRM.API.getFile({ id: fileId });
  const text = await blob.text();
  if (!text || !text.trim()) return null; // the silent-failure signature above

  return { data: JSON.parse(text), attachment, bytes: text.length };
}

async function readOnboardingNote(entity, recordId) {
  const resp = await ZOHO.CRM.API.getRelatedRecords({
    Entity: entity,
    RecordID: recordId,
    RelatedList: "Notes",
    page: 1,
    per_page: 200,
  });
  const notes = (resp?.data || [])
    .filter((n) => String(n?.Note_Title || "").trim().toUpperCase() === ONBOARDING_NOTE_TITLE)
    .sort(newestFirst);
  if (!notes.length) return null;

  const note = notes[0];
  const products = parseOnboardingNote(note?.Note_Content);
  if (!products.length) return null;

  return { products, note };
}

/*
 * Returns { ok, source, products, reason }.
 *   source "json" -- full payload, garment quantities present
 *   source "note" -- reconstructed, garment quantities absent (not needed)
 */
export async function readPayload(entity, recordId) {
  let jsonErr = null;
  try {
    const json = await readJsonAttachment(entity, recordId);
    if (json) {
      return {
        ok: true,
        source: "json",
        products: normalizeProducts(json.data),
        raw: json.data,
        attachment: json.attachment,
        reason: null,
      };
    }
  } catch (e) {
    jsonErr = (e && e.message) || String(e);
  }

  try {
    const fromNote = await readOnboardingNote(entity, recordId);
    if (fromNote) {
      return {
        ok: true,
        source: "note",
        products: fromNote.products.map(trimProductName),
        raw: null,
        note: fromNote.note,
        reason: jsonErr ? "json-failed" : "no-json",
      };
    }
  } catch (e) {
    return { ok: false, source: null, products: [], reason: "note-failed: " + ((e && e.message) || e) };
  }

  return {
    ok: false,
    source: null,
    products: [],
    reason: jsonErr ? "json-failed: " + jsonErr : "no-payload",
  };
}

/*
 * Deals onboarded before the products org-variable was fixed have " Vinyl"
 * (leading space) baked in. Trim on read so historical vinyl jobs map to the
 * right department instead of silently costing zero.
 */
function trimProductName(p) {
  return { ...p, productName: String(p?.productName || "").trim() };
}

export function normalizeProducts(data) {
  return (data?.products || []).map(trimProductName);
}
