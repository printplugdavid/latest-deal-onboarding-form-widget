/*
 * dealBar.js -- E-173 / D-82 (graphic department via David 10-30): what staff read off the Deal page every day, shown at the top of
 * EVERY Production Cards tab: Deal Status, Salesperson, Open Activities and the Books invoice. Plus the reader for the Send Mockup
 * button (Graphic Design tab only). Pure: no ZOHO, no React.
 *
 * Money stays off the cards (David 10-30: "Leave money off"): the invoice reader never returns a total, a balance or a rate.
 */

export const INVOICE_FUNCTION = "WIDGET_Get_Deal_Invoices"; // the Quality Check form's read (Deluge docs/16); same call, same answer
export const BOOKS_ORG_ID = "774544002"; // Print Plug's Zoho Books organization (the invoice function's own booksOrgId)
export const SEND_MOCKUP_FUNCTION = "widget_send_mockup"; // Deluge's card-callable copy of the Deal's Send Mockup button (our docs/91)
export const MOCKUP_STAGE = "Design Mock-Up Sent";

const str = (v) => (v == null ? "" : String(v));
const has = (v) => str(v).trim() !== "";

/* The Deal's status and salesperson. Salesperson = the Deal's "Sales Person" (what staff call the salesperson); else the record owner. */
export function dealHead(deal) {
  return {
    stage: str(deal?.Stage).trim(),
    salesPerson: str(deal?.Sales_Person).trim() || str(deal?.Owner?.name).trim(),
  };
}

/* Task subjects are "ENGLISH / SPANISH" (Deluge's convention): the card shows the English half. */
export const englishSubject = (s) => {
  const t = str(s).trim();
  const i = t.indexOf(" / ");
  return i > 0 ? t.slice(0, i).trim() : t;
};

/*
 * Open Activities: every open task on the Deal (the Deal page's own list), soonest due first, undated last. today = "YYYY-MM-DD" in
 * Mountain time (the viewer passes it), used for "past due" / "today".
 */
export function openActivities(tasks, today) {
  const open = (tasks || []).filter((t) => t && t.id && !/^completed$/i.test(str(t.Status).trim()));
  return open
    .map((t) => {
      const due = /^\d{4}-\d{2}-\d{2}/.test(str(t.Due_Date)) ? str(t.Due_Date).slice(0, 10) : "";
      return {
        id: str(t.id),
        subject: englishSubject(t.Subject) || "(no subject)",
        who: str(t?.Owner?.name).trim(),
        due,
        late: !!(due && today && due < today),
        today: !!(due && today && due === today),
      };
    })
    .sort((a, b) => (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : 0) || a.subject.localeCompare(b.subject));
}

/* Books' invoice statuses in plain words. Unknown ones are shown as Books spells them. */
const STATUS_TEXT = {
  draft: "Draft (not sent yet)",
  sent: "Sent",
  viewed: "Sent (client viewed it)",
  unpaid: "Unpaid",
  overdue: "Overdue",
  partially_paid: "Partly paid",
  paid: "Paid",
  void: "Void",
};
export const invoiceStatusText = (s) => STATUS_TEXT[str(s).trim().toLowerCase()] || str(s).replace(/_/g, " ").trim();

/* "Open in Books": the invoice page in Zoho Books. Only for a numeric id (nothing typed elsewhere can become a link). */
export const booksInvoiceLink = (id) => (/^\d+$/.test(str(id).trim()) ? `https://books.zoho.com/app/${BOOKS_ORG_ID}#/invoices/${str(id).trim()}` : "");

/*
 * The answer to ZOHO.CRM.FUNCTIONS.execute(INVOICE_FUNCTION, ...): a JSON string at details.output. Books ids are long numbers --
 * if one ever comes back unquoted, JSON.parse would round it, so it is quoted first. Returns { state, invoices, message } with
 * state "none" | "ok" | "error"; each invoice { id, number, status, statusText, link, items[{ name, description, quantity }],
 * itemsLoaded } -- never an amount.
 */
export function readInvoices(raw) {
  const fail = (message) => ({ state: "error", invoices: [], message });
  let out = raw?.details?.output ?? raw?.output ?? raw;
  if (typeof out === "string") {
    try {
      out = JSON.parse(out.replace(/("invoice_id"\s*:\s*)(\d{10,})/g, '$1"$2"'));
    } catch (e) {
      return fail("The invoice could not be read.");
    }
  }
  if (!out || typeof out !== "object" || out.status !== "ok" || !Array.isArray(out.invoices))
    return fail("The invoice could not be read" + (has(out?.message) ? " (" + str(out.message) + ")" : "") + ".");
  const invoices = out.invoices.filter(Boolean).map((i) => ({
    id: str(i.invoice_id),
    number: str(i.number),
    status: str(i.status).toLowerCase(),
    statusText: invoiceStatusText(i.status),
    link: booksInvoiceLink(i.invoice_id),
    itemsLoaded: i.line_items_loaded !== false,
    items: (Array.isArray(i.line_items) ? i.line_items : [])
      .filter(Boolean)
      .map((l) => ({ name: str(l.name).trim(), description: str(l.description).trim(), quantity: l.quantity == null ? "" : str(l.quantity) }))
      .filter((l) => l.name || l.description),
  }));
  return invoices.length ? { state: "ok", invoices, message: "" } : { state: "none", invoices: [], message: "No invoice in Zoho Books is linked to this Deal yet." };
}

/*
 * Send Mockup (proposed contract, our docs/91): arguments { deal_id, dry_run "true" | "false", submitted_by }. Reply (JSON string at
 * details.output): { status "ok" | "error", result "dry_run" | "sent" | "no_link" | "no_email" | "error", message, to [emails],
 * contact, subject, stage_after }. Anything else reads as an error with what came back.
 */
export function readSendMockup(raw) {
  let out = raw?.details?.output ?? raw?.output ?? raw;
  if (typeof out === "string") {
    try {
      out = JSON.parse(out);
    } catch (e) {
      return { ok: false, result: "error", message: "The answer was not understood.", to: [], contact: "", subject: "" };
    }
  }
  if (!out || typeof out !== "object") return { ok: false, result: "error", message: "No answer came back.", to: [], contact: "", subject: "" };
  const result = str(out.result).trim() || (out.status === "ok" ? "" : "error");
  return {
    ok: out.status === "ok" && (result === "dry_run" || result === "sent"),
    result,
    message: str(out.message).trim(),
    to: (Array.isArray(out.to) ? out.to : has(out.to) ? [out.to] : []).map((x) => str(x).trim()).filter(Boolean),
    contact: str(out.contact).trim(),
    subject: str(out.subject).trim(),
    stageAfter: str(out.stage_after).trim() || MOCKUP_STAGE,
  };
}
