/*
 * graphicUploader.js -- E-162 / E-170 (D-77, D-78): the ONE upload routine both the onboarding form ("Art for this graphic") and the
 * Production Cards' Graphic Design tab use. Part 1 of David's two parts, right away:
 *   1. Deluge's dry run (folders only, fast) -> the next version -> the final name;
 *   2. a "GRAPHIC UPLOAD" note (people's lines + the FILING JSON line) with the renamed file attached;
 *   3. the hidden Deal box Graphics_Filing unticked (Trigger []), then ticked with workflow -> Deluge's rule files everything
 *      on the Deal's GRAPHIC UPLOAD notes right away (instant rule, docs/58 §11) and retitles the note "GRAPHIC UPLOAD - FILED" (their docs/58).
 * The only ZOHO-calling part of the upload; the naming rules are in graphicUpload.js.
 */
import {
  FILING_FIELD,
  UPLOAD_FUNCTION,
  UPLOAD_NOTE_TITLE,
  callArguments,
  dryRunPayload,
  extOf,
  fileName,
  folderFor,
  poPart,
  readUploadAnswer,
  stemFor,
  uploadNote,
  versionFrom,
  otherTyped,
} from "./graphicUpload";
import { requestDealFolders, shouldRequestFolders } from "../dealFolders";

/* E-171: Deals whose folders this window already asked for (the Deal record in memory does not learn the new folder link). */
const foldersAskedFor = new Set();

const ok = (r) => r?.data?.[0]?.code === "SUCCESS";
const stamp = () => new Date().toLocaleString("en-US", { timeZone: "America/Denver", dateStyle: "short", timeStyle: "short" });

/*
 * Upload one file. parts = { dept, garment, placement, format, artName }; graphic = { key, label } or null (a file not tied to one
 * graphic); links = every graphic the file belongs to (D-79 "Also used by"; the first is the graphic it was uploaded on).
 * Returns { name, folder, wouldMove, noteId, filingStarted }; throws with a plain message when the file could not be attached.
 */
export async function uploadGraphicFile(zoho, { entity, recordId, deal, who, source, file, parts, graphic, links, startFiling, ensureFolders }) {
  const stem = stemFor({ po: poPart(deal), ...parts });
  const ext = extOf(file.name);
  const folder = folderFor(parts.dept, parts.format);
  const dry = readUploadAnswer(
    await zoho.CRM.FUNCTIONS.execute(UPLOAD_FUNCTION, callArguments(recordId, dryRunPayload({ files: [{ name: fileName(stem, 1, ext), stem, ext, folder }], who, source })))
  );
  if (dry.status !== "ok") throw new Error(dry.message || dry.result || "the WorkDrive function did not answer");
  const { version, wouldMove } = versionFrom(dry, stem);
  const name = fileName(stem, version, ext);

  const n = await zoho.CRM.API.addNotes({
    Entity: entity,
    RecordID: recordId,
    Title: UPLOAD_NOTE_TITLE,
    Content: uploadNote({
      who,
      when: stamp(),
      items: [{ name, stem, ext, folder, original: file.name, wouldMove, links: links && links.length ? links : graphic ? [graphic] : [], other: parts.format === "OTHER" ? otherTyped(parts) : "" }],
    }),
  });
  if (!ok(n)) throw new Error("the GRAPHIC UPLOAD note was not saved");
  const noteId = n.data[0]?.details?.id;
  const content = new Blob([await file.arrayBuffer()], { type: file.type });
  const a = await zoho.CRM.API.attachFile({ Entity: "Notes", RecordID: noteId, File: { Name: name, Content: content } });
  if (a && a.data && a.data[0] && a.data[0].code && a.data[0].code !== "SUCCESS") throw new Error("the file was not attached to the note");

  let filingStarted = false;
  /*
   * E-171 (David 10-30): a Deal with no WorkDrive folder yet (onboarding, before Submit) -- ask for the folders now, once per Deal, and
   * tick the filing box again when they exist, so this upload is filed without waiting for Submit. Never awaited: the rep keeps working.
   * (WIDGET_Create_Deal_Folders is safe to run twice; Submit's own call adds the department folders.)
   */
  const noFolderYet = !!deal && !String(deal.Deal_Folder_Link || "").trim() && shouldRequestFolders(deal);
  if (startFiling && ensureFolders && noFolderYet && !foldersAskedFor.has(String(recordId))) {
    foldersAskedFor.add(String(recordId));
    refileAfterFolders(zoho, { entity, recordId, folders: requestDealFolders(recordId) });
  }
  if (startFiling) {
    try {
      // Always untick first: the Deal record in memory can be stale (an earlier upload in this window ticked it), and ticking an
      // already-ticked box would not fire the field-update rule again.
      await zoho.CRM.API.updateRecord({ Entity: entity, APIData: { id: recordId, [FILING_FIELD]: false }, Trigger: [] });
      const r = await zoho.CRM.API.updateRecord({ Entity: entity, APIData: { id: recordId, [FILING_FIELD]: true }, Trigger: ["workflow"] });
      filingStarted = ok(r);
    } catch (e) {
      filingStarted = false;
    }
  }
  return { name, folder, wouldMove, noteId, filingStarted };
}

/*
 * Deluge docs/59 §2.0 (10-30): a file uploaded at onboarding BEFORE the Deal has its WorkDrive folder is answered `no_deal_folder` by the
 * instant filing run (its 3 tries happen within seconds). Submit makes the folders (WIDGET_Create_Deal_Folders, ~13 s), so once that
 * answers ok / skipped, untick -> tick Graphics_Filing once more and the waiting files are filed. Never throws; resolves true when re-ticked.
 */
export async function refileAfterFolders(zoho, { entity, recordId, folders }) {
  try {
    const ans = await folders;
    if (!ans || (ans.status !== "ok" && ans.status !== "skipped")) return false;
    await zoho.CRM.API.updateRecord({ Entity: entity, APIData: { id: recordId, [FILING_FIELD]: false }, Trigger: [] });
    const r = await zoho.CRM.API.updateRecord({ Entity: entity, APIData: { id: recordId, [FILING_FIELD]: true }, Trigger: ["workflow"] });
    return ok(r);
  } catch (e) {
    return false;
  }
}
/* Wait for a promise, but no longer than ms (resolves "timeout" then). */
export const withCap = (promise, ms) => Promise.race([promise, new Promise((res) => setTimeout(() => res("timeout"), ms))]);

