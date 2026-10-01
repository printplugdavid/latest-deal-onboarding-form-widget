/*
 * zohoFiles.js -- reading a Deal's attachments through the widget SDK.
 *
 * Shared by the card viewer (?view=cards) and the Amendment Form (?view=amendment). Moved here
 * verbatim from CardViewer.jsx so the two views import one copy (D-24: imported, never copied).
 * TRAP: getFile needs the attachment's "$file_id", NOT its record id -- the record id returns an
 * empty Blob and throws nothing.
 */

// window.ZOHO is read at call time, not import time, so importing this module outside Zoho is harmless.
const zoho = () => window.ZOHO;

export const newestFirst = (a, b) =>
  new Date(b?.Created_Time || 0) - new Date(a?.Created_Time || 0);

// getFile's return shape is not documented. The revision form gets a Blob for JSON, but accept
// whatever arrives, and describe it so a failure is diagnosable from the screen.
export async function readFileText(fileId) {
  const r = await zoho().CRM.API.getFile({ id: fileId });
  let text = "";
  try {
    if (typeof r === "string") text = r;
    else if (r && typeof r.text === "function") text = await r.text(); // Blob, File, Response
    else if (r instanceof ArrayBuffer || ArrayBuffer.isView(r)) text = new TextDecoder().decode(r);
    else if (r && typeof r === "object") {
      const inner = r.data ?? r.response ?? r.body ?? r.content;
      if (typeof inner === "string") text = inner;
      else if (inner && typeof inner.text === "function") text = await inner.text();
    }
  } catch (e) {
    /* leave text empty; the shape below still explains what came back */
  }
  const size = r?.size ?? r?.byteLength ?? r?.length;
  const shape =
    Object.prototype.toString.call(r).slice(8, -1) +
    (r?.type ? ` ${r.type}` : "") +
    (size != null ? `, ${size} bytes` : "");
  return { text, shape };
}
