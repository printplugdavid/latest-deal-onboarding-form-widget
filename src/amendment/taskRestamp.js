/*
 * taskRestamp.js -- E-43. After an amendment changes the print counts, the open production tasks
 * still carry the numbers they were created with (Ammo Squared 12: Deal 3,000, task 2,400). This
 * works out which of the Deal's count fields each task holds and what it should now say.
 *
 * WHICH FIELD A TASK HOLDS is read from its subject -- measured 2026-10-08 on every task with a
 * Print_Count since 2026-08-15 (28 subjects) and checked field-by-field against 25 deals:
 *     EMBROIDERY: Produce Order                      -> Embroidery_Department_Prints
 *     SCREEN PRINT(ING): Produce Order               -> Screen_Print_Prints
 *     VINYL DEPARTMENT: <JOB>: Produce Order         -> that job's own field (DTF_Prints, ...)
 *     OUTSOURCED: Order Products                     -> Outsourced_Prints
 * with or without a leading "RUSH: ". The production function (Deluge, not ours) does the first
 * stamp; this only RE-stamps, so the two can never disagree about a task this file does not know.
 *
 * NEVER touched: a completed task (its count is a record of work done), a Reproduce / Correct task
 * (those belong to the revision form), and any subject not in the table -- an unknown task is left
 * alone, never guessed at.
 */
const VINYL_JOB_FIELD = {
  DTF: "DTF_Prints",
  DTG: "DTG_Prints",
  HTV: "HTV_Prints",
  DECALS: "Decals_Prints",
  STICKERS: "Stickers_Prints",
  MAGNETS: "Magnets_Prints",
  BANNERS: "Banners_Prints",
  POSTERS: "Posters_Prints",
  PATCHES: "Patches_Prints",
  "DTF GANG SHEET": "DTF_Gang_Sheet_Prints",
};

/* The English half of a bilingual subject, upper-cased, without "RUSH: ". */
const englishHalf = (subject) =>
  String(subject || "")
    .split(" / ")[0]
    .trim()
    .toUpperCase()
    .replace(/^RUSH:\s*/, "");

/* The Deal count field this task carries, or null when it is not a task this file re-stamps. */
export function countFieldForTask(subject) {
  const s = englishHalf(subject);
  if (/\bREPRODUCE\b|\bCORRECT\b|\bRE-?ORDER\b/.test(s)) return null;
  if (/^OUTSOURCED: ORDER PRODUCTS$/.test(s)) return "Outsourced_Prints";
  if (!/: PRODUCE ORDER$/.test(s)) return null;
  if (/^EMBROIDERY: PRODUCE ORDER$/.test(s)) return "Embroidery_Department_Prints";
  if (/^SCREEN PRINT(ING)?: PRODUCE ORDER$/.test(s)) return "Screen_Print_Prints";
  const m = /^VINYL DEPARTMENT: (.+): PRODUCE ORDER$/.exec(s);
  if (m) return VINYL_JOB_FIELD[m[1].trim()] || null;
  return null; // includes the bare "VINYL DEPARTMENT: Produce Order" -- which job it means is not knowable
}

export const restampLine = (from, to, when) =>
  "[Print count updated " + from + " -> " + to + " by onboarding amendment " + when + "]";

/*
 * tasks: [{ id, Subject, Status, Print_Count, Description }] -- the Deal's tasks, any status.
 * counts: the 18 print fields the amendment is writing.
 * Returns the writes to make: [{ id, subject, field, from, to, description }].
 */
export function planTaskRestamp(tasks, counts, when) {
  const out = [];
  (tasks || []).forEach((t) => {
    if (!t || !t.id) return;
    if (/^completed$/i.test(String(t.Status || "").trim())) return;
    const field = countFieldForTask(t.Subject);
    if (!field) return;
    const to = Number(counts?.[field]);
    if (!Number.isFinite(to)) return;
    const raw = t.Print_Count;
    if (raw === undefined) return; // the count was not readable -- do not overwrite blind
    const from = raw === null || raw === "" ? null : Number(raw);
    if (from === to) return;
    const line = restampLine(from === null ? "(blank)" : from, to, when);
    const prior = String(t.Description || "").trimEnd();
    out.push({
      id: t.id,
      subject: String(t.Subject || "").split(" / ")[0].trim(),
      field,
      from,
      to,
      description: prior ? prior + "\n\n" + line : line,
    });
  });
  return out;
}
