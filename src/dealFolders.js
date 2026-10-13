/*
 * dealFolders.js -- E-56. Ask the CRM to create this Deal's WorkDrive folders.
 *
 * The work is done by the Deluge function WIDGET_Create_Deal_Folders (Deluge thread, 2026-10-13;
 * their reply is snapshotted in docs/38): Account folder -> Deal folder -> Mock Up, Art Assets,
 * Rejected, and inside Art Assets a folder per onboarded department; then it writes the Deal's
 * Deal_Folder_Link (and WorkDrive_Link when that is empty). It reads the departments from the Deal's
 * print fields, so it is called AFTER the form has written them.
 *
 * Two rules from that thread, kept here so no caller can get them wrong:
 *   - `dry_run` must be the exact STRING "false" or nothing is created.
 *   - a real run takes about 13 seconds. Nobody waits for it: requestDealFolders() is fired and left.
 *     The function is safe to call again, and on a failure it leaves its own Note on the Deal
 *     ("DEAL FOLDER AUTOMATION - needs attention"), so the form has nothing to report.
 *
 * It can never block or fail a form: every path is caught, and a missing function, a refusal (its
 * REST API switched off) or a slow answer all end the same way -- a line in the console.
 */
import { DEAL_FOLDER_FIELD } from "./productionCards";

export const FOLDER_FUNCTION = "widget_create_deal_folders";

/*
 * Should this Deal be sent to the function at all? David: no back-fill -- folders made by hand before
 * the automation have names nobody can match reliably, so an old Deal must not get a second, duplicate
 * set. The Deal itself says which case it is, with no guessing:
 *   - it has a Deal_Folder_Link          -> made by the automation: yes (it only adds what is missing)
 *   - no Deal_Folder_Link, but a WorkDrive_Link (the Mock Up link someone pasted)
 *                                        -> a hand-made folder exists: NO
 *   - neither                            -> no folder yet: yes, create it
 */
const filled = (v) => String(v == null ? "" : v).trim() !== "";
export function shouldRequestFolders(deal) {
  if (!deal) return false;
  if (filled(deal[DEAL_FOLDER_FIELD])) return true;
  return !filled(deal.WorkDrive_Link);
}

export const folderArguments = (dealId) => ({
  arguments: JSON.stringify({ deal_id: String(dealId), dry_run: "false" }),
});

const list = (v) => (Array.isArray(v) ? v.map((x) => String(x)) : []);

/*
 * What the function said, in one shape. `details.output` arrives as a JSON string.
 *   { status: "ok" | "error" | "unavailable", message, created, found, dealFolderLink }
 * "unavailable" = no usable answer (function missing, refused, not JSON) -- never thrown.
 */
export function readFolderAnswer(response) {
  const none = (message) => ({ status: "unavailable", message, created: [], found: [], dealFolderLink: "" });
  try {
    const raw = response && response.details ? response.details.output : undefined;
    const out = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!out || typeof out !== "object") return none("no answer from " + FOLDER_FUNCTION);
    const status = out.status === "ok" ? "ok" : out.status === "error" ? "error" : "unavailable";
    return {
      status,
      message: String(out.message == null ? "" : out.message),
      created: list(out.created),
      found: list(out.found),
      dealFolderLink: /^https:\/\//i.test(String(out.deal_folder_link || "")) ? String(out.deal_folder_link) : "",
      // a dry run creates nothing -- if one ever comes back, say so rather than call it done
      ...(out.dry_run === true || out.dry_run === "true" ? { status: "unavailable", message: "the function answered as a dry run - nothing was created" } : {}),
    };
  } catch (e) {
    return none("unreadable answer: " + String((e && e.message) || e));
  }
}

/*
 * Fire the request and return at once. The returned promise is for tests and logging only --
 * callers do NOT await it. Resolves to readFolderAnswer(...); never rejects, never throws.
 */
export function requestDealFolders(dealId) {
  try {
    const zoho = typeof window !== "undefined" ? window.ZOHO : null;
    const execute = zoho && zoho.CRM && zoho.CRM.FUNCTIONS && zoho.CRM.FUNCTIONS.execute;
    if (!dealId || typeof execute !== "function") {
      return Promise.resolve(readFolderAnswer(null));
    }
    return Promise.resolve()
      .then(() => zoho.CRM.FUNCTIONS.execute(FOLDER_FUNCTION, folderArguments(dealId)))
      .then(readFolderAnswer)
      .catch((e) => ({ ...readFolderAnswer(null), message: "call failed: " + String((e && e.message) || e) }))
      .then((answer) => {
        if (answer.status !== "ok") console.log("Deal folders: not created by this call -", answer.message || answer.status);
        return answer;
      });
  } catch (e) {
    console.log("Deal folders: request could not be made -", e);
    return Promise.resolve(readFolderAnswer(null));
  }
}
