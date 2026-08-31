/*
 * payload.js -- reads the onboarding payload the onboarding form attaches to
 * the Deal as onboarding-form.json.
 *
 * Read path confirmed against a live deal on 31 Aug 2026:
 *   getFile({ id: <$file_id> })  ->  Blob (application/x-download)
 *   .text()                      ->  the JSON
 *
 * TRAP: getFile must be given the attachment's internal "$file_id", NOT the
 * attachment record id. Passing the record id returns an EMPTY Blob -- size 0,
 * mime text/xml -- and throws nothing. The failure is completely silent.
 */

const ZOHO = window.ZOHO;

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
    .sort((a, b) => new Date(b?.Created_Time || 0) - new Date(a?.Created_Time || 0));
}

export async function readPayload(entity, recordId) {
  const candidates = await listPayloadAttachments(entity, recordId);
  if (!candidates.length) {
    return { ok: false, reason: "no-payload", attachment: null, data: null };
  }

  // Newest wins if onboarding was ever re-submitted on this deal.
  const attachment = candidates[0];
  const fileId = attachment["$file_id"];
  if (!fileId) {
    return { ok: false, reason: "no-file-id", attachment, data: null };
  }

  const blob = await ZOHO.CRM.API.getFile({ id: fileId });
  const text = await blob.text();

  if (!text || !text.trim()) {
    // The silent-failure signature described above.
    return { ok: false, reason: "empty-blob", attachment, data: null };
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: "unparseable", attachment, data: null, raw: text };
  }

  return { ok: true, reason: null, attachment, data, bytes: text.length };
}

/*
 * Deals onboarded before the products org-variable was fixed have " Vinyl"
 * (leading space) baked into their saved payload. Trim on read so historical
 * vinyl jobs map to the right department instead of silently costing zero.
 */
export function normalizeProducts(data) {
  const products = (data?.products || []).map((p) => ({
    ...p,
    productName: String(p?.productName || "").trim(),
  }));
  return products;
}
