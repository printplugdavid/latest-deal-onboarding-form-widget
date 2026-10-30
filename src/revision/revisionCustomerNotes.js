/*
 * revisionCustomerNotes.js -- E-132. The revision form's side of the Account's Customer Notes.
 *
 * The saving itself is customerNotes.js, an UNCHANGED copy of main's file (the session-start check
 * compares the two, like printMath.js). This file only decides what the revision form does with it:
 *
 *  - the save runs only when the person answered Yes and typed something (a revision never
 *    touches the Account or the Deal's Customer Notes otherwise);
 *  - the revision note gets a CUSTOMER NOTES section saying what happened, with the text, so a
 *    note that could not reach the Account is still on record;
 *  - a problem becomes one translated warning; the revision itself is already saved.
 */

/* The text to add, or "" when nothing should be saved. */
export function customerNotesEntry(hasCustomerNotes, text) {
  return hasCustomerNotes === "Yes" ? String(text == null ? "" : text).trim() : "";
}

/* Lines for the revision note. `result` is saveCustomerNotes()'s reply (null = not attempted). */
export function customerNotesNoteLines(entry, result, div) {
  if (!entry) return [];
  let head;
  if (result && result.accountWritten) head = "CUSTOMER NOTES (added to the account)";
  else if (result && result.tooLong) head = "CUSTOMER NOTES (NOT added - the account's Customer Notes field is full)";
  else if (result && result.dealWritten) head = "CUSTOMER NOTES (saved on this deal only - the account was not updated)";
  else head = "CUSTOMER NOTES (could not be saved)";
  const L = ["", head, div];
  entry.split("\n").forEach((line) => L.push("  " + line.trimEnd()));
  return L;
}

/* The i18n key of the warning to show after Submit, or "" when all went well. */
export function customerNotesWarningKey(entry, result) {
  if (!entry || !result) return "";
  if (result.accountWritten) return "";
  if (result.tooLong) return "cn.warnFull";
  if (result.dealWritten) return "cn.warnDealOnly";
  return "cn.warnFailed";
}
