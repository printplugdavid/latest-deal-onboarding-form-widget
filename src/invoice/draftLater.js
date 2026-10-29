/*
 * draftLater.js -- E-151 (David 10-29). When the draft estimate / invoice was not made at Submit (Books slow, window closed), the rep
 * reopens the onboarding form on the Deal. The form then sees the Deal is already onboarded and offers ONLY the draft (David: "Draft
 * only"; the full form is never submitted twice), built from the newest saved onboarding (amendments included) with its own Invoice or
 * Estimate answer, through the same Zoho function (widget_create_billing_draft). That function checks for a draft already linked to
 * the Deal before it makes anything ("exists"), so a second draft cannot be made this way.
 *
 * No React here. Tested in draftLater.test.js.
 */
import { LIVE_NOTE_TITLE } from "../amendment/amendmentDiff";
import { newestFirst, readFileText } from "../zohoFiles";
import { flagsOf } from "./billingLines";

/*
 * Is this Deal already onboarded, and what did it save?
 *   { onboarded: false }                                      never onboarded -> the normal form
 *   { onboarded: true, json, savedAt }                        the newest onboarding-form.json (an amendment writes a newer one)
 *   { onboarded: true, json: null, noteOnly: true }           only a live onboarding note (before the form saved its answers)
 * `related` = { attachments, notes } as the Zoho related lists return them; `readText(fileId)` reads one file.
 */
export async function findOnboarding(related, readText = readFileText) {
  const jsons = ((related && related.attachments) || [])
    .filter((a) => String((a && a.File_Name) || "").toLowerCase() === "onboarding-form.json")
    .sort(newestFirst);
  const liveNote = ((related && related.notes) || []).some((n) => n && n.Note_Title === LIVE_NOTE_TITLE);
  if (!jsons.length) return liveNote ? { onboarded: true, json: null, noteOnly: true } : { onboarded: false };
  const newest = jsons[0];
  let json = null;
  try {
    const { text } = await readText(newest["$file_id"]);
    json = text && text.trim() ? JSON.parse(text) : null;
  } catch (e) {
    json = null;
  }
  return { onboarded: true, json, savedAt: newest.Created_Time || "", unreadable: !json };
}

/* Reads the two related lists from Zoho. A failure is thrown: the caller then shows the normal form (never blocks a rep). */
export async function loadOnboarding(zoho, entity, recordId) {
  const list = (RelatedList) => zoho.CRM.API.getRelatedRecords({ Entity: entity, RecordID: recordId, RelatedList, page: 1, per_page: 200 });
  const [att, notes] = await Promise.all([list("Attachments"), list("Notes")]);
  return findOnboarding({ attachments: (att && att.data) || [], notes: (notes && notes.data) || [] });
}

/*
 * Can the reopened form offer the draft? { can, document, why } -- `why` says in plain words why not.
 */
export function draftOffer(found, { draftsOn = true, billingOn = true } = {}) {
  if (!draftsOn || !billingOn) return { can: false, document: "", why: "" };
  if (!found || !found.onboarded) return { can: false, document: "", why: "" };
  if (found.noteOnly)
    return { can: false, document: "", why: "This Deal was onboarded before the form saved its answers, so the form cannot make its draft. Make it in Books." };
  if (!found.json) return { can: false, document: "", why: "The saved onboarding could not be read, so the form cannot make the draft. Make it in Books." };
  const { document } = flagsOf(found.json);
  if (!document) return { can: false, document: "", why: 'The onboarding did not answer "Invoice or Estimate?", so the form cannot make a draft. Make it in Books.' };
  return { can: true, document, why: "" };
}

/* Answers worth another try: Books was slow, or Zoho did not answer in time, or Books could not be checked. Never a refusal. */
export function canRetry(answer) {
  const a = answer || {};
  if (a.result === "too_slow" || a.result === "refused_by_books") return true;
  return a.result === "not_sent" && a.reason === "failed";
}
