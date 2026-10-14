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

/*
 * E-66 (2026-10-14). Jeb Shippy Deal 1: the onboarding form saved Graphic 3's colors as "TBD" at 3:20 PM; the rep
 * edited the onboarding NOTE by hand at 3:50 PM to add the threads. Everything that shows the order (the cards, the
 * Quality Check form) is built from the saved order, so the hand edit never reached them. This reads only times --
 * nothing anyone typed: if the live onboarding note was modified more than `graceMinutes` after the saved order was
 * attached, return the note's edit time (a Date); otherwise null.
 */
export function noteEditedAfterSave(note, savedOrder, graceMinutes = 5) {
  const t = (v) => {
    const d = new Date(v == null ? "" : v);
    return isNaN(d) ? null : d;
  };
  const edited = t(note && note.Modified_Time);
  const created = t(note && note.Created_Time);
  const saved = t(savedOrder && savedOrder.Created_Time);
  if (!edited || !saved) return null;
  const grace = graceMinutes * 60 * 1000;
  if (edited - saved <= grace) return null;
  if (created && edited - created <= grace) return null; // written once, by the form, and never touched
  return edited;
}
export const NOTE_EDITED_WARNING =
  "The onboarding note was edited by hand after this order was saved, and these cards are built from the saved order. Check the note for anything newer, and make order changes with the Amendment Form so the cards follow.";

