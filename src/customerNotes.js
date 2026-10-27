/*
 * customerNotes.js -- E-38. The Account's standing "Customer Notes" (particulars that apply to
 * every deal for that customer: picky about placement, prefers a certain feel of print, ...).
 *
 *   Account field  Customer_Specific_Notes  (textarea, 2,000 characters)
 *   Deal field     Customer_Notes           (CRM rolls the Account's text down to its Deals when the
 *                                            Account is EDITED -- a Deal created later does not
 *                                            inherit, measured 2026-10-02; the forms cover that by
 *                                            writing the Deal themselves)
 *
 * House rule (D-23, and David 2026-10-02): ADD, never replace. An entry is appended on its own
 * dated line; existing text is never trimmed or rewritten.
 *
 * The pure half is at the top (tested); the two functions that talk to Zoho are at the bottom.
 * Nothing here touches the onboarding NOTE -- both note parsers stay exactly as they were.
 */

export const ACCOUNT_NOTES_FIELD = "Customer_Specific_Notes";
export const DEAL_NOTES_FIELD = "Customer_Notes";
export const CUSTOMER_NOTES_LIMIT = 2000;

export const CUSTOMER_NOTES_QUESTION =
  "Are there any details or considerations that will need to be considered for all future deals in this account?";
export const CUSTOMER_NOTES_TOOLTIP =
  "Entries will be added to the Customer Notes on the account page, and display on all future deals under this account.";

const clean = (s) => String(s == null ? "" : s).replace(/\s+$/, "");

export function todayStamp(d) {
  const x = d || new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/* existing + a blank line + "[2026-10-05] entry". A blank entry returns the existing text untouched. */
export function appendCustomerNote(existing, entry, dateStr) {
  const old = clean(existing);
  const e = String(entry == null ? "" : entry).trim();
  if (!e) return old;
  const line = `[${dateStr || todayStamp()}] ${e}`;
  return old ? old + "\n\n" + line : line;
}

/* How many characters over the Account field's limit the appended text would be (0 = it fits). */
export function overLimitBy(existing, entry, dateStr) {
  return Math.max(0, appendCustomerNote(existing, entry, dateStr).length - CUSTOMER_NOTES_LIMIT);
}

// ---- Zoho -------------------------------------------------------------------------------------
// window.ZOHO is read at call time, so importing this module outside Zoho (tests) is harmless.
const zoho = () => window.ZOHO;
const ok = (r) => r?.data?.[0]?.code === "SUCCESS";

/* The Account's current notes. Never throws: a deal with no Account, or a failed read, is "". */
export async function loadAccountNotes(deal) {
  const accountId = deal?.Account_Name?.id || null;
  if (!accountId) return { accountId: null, notes: "" };
  try {
    const r = await zoho().CRM.API.getRecord({ Entity: "Accounts", RecordID: accountId });
    return { accountId, notes: clean(r?.data?.[0]?.[ACCOUNT_NOTES_FIELD]) };
  } catch (e) {
    console.log("Customer notes: could not read the Account:", e);
    return { accountId, notes: "", readFailed: true };
  }
}

/*
 * Append `entry` to the Account, then make this Deal's field match. Never throws.
 *
 *  - The Account is RE-READ here so a note someone else added while the form was open is kept.
 *  - If the Account could not be read, it is NOT written (that would replace text we never saw).
 *  - Account write uses the workflow trigger, the same as a person editing the Account page, so
 *    CRM's own roll-down to the account's other deals runs.
 *  - The Deal write has no trigger and is its own call, so a refusal here cannot touch the print
 *    counts or the note.
 *
 * Returns { combined, accountWritten, dealWritten, tooLong, problem } -- `combined` is what the
 * production cards should show.
 */
export async function saveCustomerNotes({ entity, recordId, deal, entry, dateStr }) {
  const out = { combined: "", accountWritten: false, dealWritten: false, tooLong: false, problem: "" };
  const e = String(entry == null ? "" : entry).trim();
  const dealNow = clean(deal?.[DEAL_NOTES_FIELD]);
  try {
    const acct = await loadAccountNotes(deal);
    if (!acct.accountId) {
      // No Account on this Deal: keep the entry on the Deal itself rather than lose it.
      out.combined = appendCustomerNote(dealNow, e, dateStr);
      if (e) out.problem = "this deal has no Account, so the note was saved on the Deal only";
    } else if (acct.readFailed) {
      out.combined = appendCustomerNote(dealNow, e, dateStr);
      if (e) out.problem = "the Account could not be read, so the note was saved on the Deal only";
    } else {
      out.combined = acct.notes;
      if (e) {
        const next = appendCustomerNote(acct.notes, e, dateStr);
        if (next.length > CUSTOMER_NOTES_LIMIT) {
          out.tooLong = true;
          out.problem = "the Account's Customer Notes field is full (2,000 characters) -- the note was NOT added";
        } else {
          const r = await zoho().CRM.API.updateRecord({
            Entity: "Accounts",
            APIData: { id: acct.accountId, [ACCOUNT_NOTES_FIELD]: next },
            Trigger: ["workflow"],
          });
          if (ok(r)) {
            out.accountWritten = true;
            out.combined = next;
          } else {
            out.problem = "the Account refused the update, so the note was saved on the Deal only";
            out.combined = appendCustomerNote(acct.notes, e, dateStr);
          }
        }
      }
    }
    // Never destroy: text someone typed straight onto this Deal that the Account does not carry is
    // left alone here (CRM's own roll-down may still replace it -- that is its behaviour, not ours).
    const dealHasOwnText = dealNow !== "" && !out.combined.includes(dealNow);
    if (dealHasOwnText) out.dealKept = true;
    if (out.combined && out.combined !== dealNow && !dealHasOwnText) {
      const r = await zoho().CRM.API.updateRecord({
        Entity: entity,
        APIData: { id: recordId, [DEAL_NOTES_FIELD]: out.combined },
        Trigger: [],
      });
      out.dealWritten = ok(r);
    }
  } catch (err) {
    console.log("Customer notes: save failed:", err);
    out.problem = out.problem || "customer notes could not be saved";
  }
  return out;
}
