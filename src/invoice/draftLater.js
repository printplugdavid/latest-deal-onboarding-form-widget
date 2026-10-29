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

/*
 * E-158 (David 10-29: "Could we plan it as a backup? Still give reps auto access when it works, but if it doesn't have a fallback?").
 * The instant draft is tried first, exactly as before. Only when its answer is one worth another try (canRetry: Books slow, no answer
 * in time, Books not checkable) AND the switch is on, the form hands the draft to the background: it attaches
 * billing-draft-request.json (the same payload it just sent) and ticks the hidden Deal checkbox Invoice_Drafting WITH workflow on, so
 * Deluge's rule makes the draft with Zoho's 30-second limit instead of the widget's 10 (our docs/84). After that there is no Try again:
 * a retry racing the background could pass the "one draft per Deal" check twice.
 */
export const DRAFTING_FIELD = "Invoice_Drafting";
export const REQUEST_FILE = "billing-draft-request.json";
export const BACKGROUND_MESSAGE =
  "Books is slow, so your draft will be made in the background. It will show under the Deal's Finance section in a few minutes. You can close this.";

export function requestFile(dealId, payload, { submittedBy = "", firstAnswer = {}, now = new Date() } = {}) {
  return JSON.stringify({
    deal_id: String(dealId || ""),
    requested_at: now.toISOString(),
    requested_by: String(submittedBy || ""),
    first_answer: { result: String(firstAnswer.result || ""), message: String(firstAnswer.message || "") },
    payload: { ...payload, dry_run: false },
  });
}

/*
 * Hands the draft to the background. Returns the answer to show: { result: "background", message } when both writes worked, or
 * null when anything failed (the caller then shows the first answer with Try again, as before).
 */
export async function handToBackground(zoho, entity, dealId, payload, { submittedBy = "", firstAnswer = {} } = {}) {
  try {
    const text = requestFile(dealId, payload, { submittedBy, firstAnswer });
    const att = await zoho.CRM.API.attachFile({
      Entity: entity,
      RecordID: dealId,
      File: { Name: REQUEST_FILE, Content: new Blob([text], { type: "application/json" }) },
    });
    if (!(att && att.data && att.data[0] && att.data[0].code === "SUCCESS")) return null;
    const r = await zoho.CRM.API.updateRecord({ Entity: entity, APIData: { id: dealId, [DRAFTING_FIELD]: true }, Trigger: ["workflow"] });
    if (!(r && r.data && r.data[0] && r.data[0].code === "SUCCESS")) return null;
    return { status: "ok", result: "background", message: BACKGROUND_MESSAGE, not_added: [], notes: [] };
  } catch (e) {
    return null;
  }
}

/* The instant draft, then -- only on a slow / failed answer and with the switch on -- the background hand-off. */
export async function draftOrBackground({ zoho, entity, dealId, prepared, submittedBy = "", backgroundOn = false, send, payloadOf }) {
  const answer = await send(dealId, prepared, { submittedBy });
  if (!backgroundOn || !canRetry(answer) || !prepared) return answer;
  const handed = await handToBackground(zoho, entity, dealId, payloadOf(prepared, { submittedBy }), { submittedBy, firstAnswer: answer });
  return handed || answer;
}
