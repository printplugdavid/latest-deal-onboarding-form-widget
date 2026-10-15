/*
 * artCopy.js -- E-72. Ask the CRM to copy the files a rep attached in the onboarding form into the
 * Deal's WorkDrive `Art Assets` folder.
 *
 * The widget cannot send a file to WorkDrive itself (the SDK's CONNECTION.invoke has no file field), so
 * the work is done by the Deluge function WIDGET_Copy_Onboarding_Files (Deluge thread, their docs/33):
 * it reads the onboarding note's attachments through the CRM API and uploads each one to `Art Assets`,
 * skipping a file already there with the same name and size (David chose that 10-15), and leaving its
 * own Note "ART FILES - not copied to WorkDrive" naming anything it could not copy. If the Deal has no
 * folder yet it runs the folder function itself first.
 *
 * Rules from that thread, kept here so no caller can get them wrong:
 *   - call it AFTER the note's files are attached, with the onboarding note's id (the Deal's own
 *     attachment URL returns nothing for note files).
 *   - there is no dry run: every call is real. A second call is harmless (same files are skipped) but
 *     pointless, so call it once.
 *   - a run takes a few seconds and stops starting new files at 7 s. Nobody waits for the copy itself.
 *
 * It can never block or fail a form: every path is caught and ends in a line in the console.
 */
import { shouldRequestFolders } from "./dealFolders";

export const COPY_FUNCTION = "widget_copy_onboarding_files";

/*
 * Should this Deal's files be sent at all? Only when at least one file reached the note, and only on a
 * Deal the folder automation owns -- the same test as the folder call. A Deal with a hand-made folder
 * (its Mock Up link but no Deal_Folder_Link) is left alone: the function would otherwise build a second,
 * standard folder set beside the hand-made one (David: no hand-made duplicates).
 */
export function shouldCopyArt(deal, filesOnNote) {
  return Number(filesOnNote) > 0 && shouldRequestFolders(deal);
}

export const copyArguments = (dealId, noteId) => ({
  arguments: JSON.stringify({ deal_id: String(dealId), note_id: String(noteId) }),
});

const list = (v) => (Array.isArray(v) ? v.map((x) => String(x)) : []);

/*
 * What the function said, in one shape. `details.output` arrives as a JSON string.
 *   { status: "ok" | "partial" | "error" | "unavailable", message, copied, skipped, notCopied }
 * "unavailable" = no usable answer (function missing, refused, not JSON) -- never thrown.
 */
export function readCopyAnswer(response) {
  const none = (message) => ({ status: "unavailable", message, copied: [], skipped: [], notCopied: [] });
  try {
    const raw = response && response.details ? response.details.output : undefined;
    const out = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!out || typeof out !== "object") return none("no answer from " + COPY_FUNCTION);
    const status = ["ok", "partial", "error"].includes(out.status) ? out.status : "unavailable";
    return {
      status,
      message: String(out.message == null ? "" : out.message),
      copied: list(out.copied),
      skipped: list(out.skipped_already_there),
      notCopied: list(out.not_copied),
    };
  } catch (e) {
    return none("unreadable answer: " + String((e && e.message) || e));
  }
}

/*
 * Fire the request and return at once. The returned promise resolves to readCopyAnswer(...); it never
 * rejects or throws. The caller does not wait for the copy -- only, briefly, for the request to leave
 * (see afterRequestLeaves).
 */
export function requestArtCopy(dealId, noteId) {
  try {
    const zoho = typeof window !== "undefined" ? window.ZOHO : null;
    const execute = zoho && zoho.CRM && zoho.CRM.FUNCTIONS && zoho.CRM.FUNCTIONS.execute;
    if (!dealId || !noteId || typeof execute !== "function") {
      return Promise.resolve(readCopyAnswer(null));
    }
    return Promise.resolve()
      .then(() => zoho.CRM.FUNCTIONS.execute(COPY_FUNCTION, copyArguments(dealId, noteId)))
      .then(readCopyAnswer)
      .catch((e) => ({ ...readCopyAnswer(null), message: "call failed: " + String((e && e.message) || e) }))
      .then((answer) => {
        if (answer.status !== "ok") console.log("Art files: not all copied to WorkDrive by this call -", answer.message || answer.status);
        return answer;
      });
  } catch (e) {
    console.log("Art files: request could not be made -", e);
    return Promise.resolve(readCopyAnswer(null));
  }
}

/*
 * The form closes with closeReload(), which reloads the Deal page -- and the SDK's calls are made by
 * that page. Closing in the same instant as the request could cut it off before it leaves. So the form
 * waits for the answer or GRACE_MS, whichever comes first, and then closes. Never rejects.
 */
export const GRACE_MS = 2000;
export function afterRequestLeaves(pending, ms = GRACE_MS) {
  return Promise.race([
    Promise.resolve(pending).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}
