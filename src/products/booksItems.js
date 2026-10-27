/*
 * E-85 / E-100: the New Product form's two CRM functions (drafts in tools/new-product/, owned by the Deluge thread once
 * adopted; David pastes them). A browser page cannot reach Books or the suppliers itself, so everything goes through
 * ZOHO.CRM.FUNCTIONS.execute, like the Quality Check form's invoice read.
 *
 *   WIDGET_Books_Items(action, payload)      action "lists"  -> Books vendors + brands (live)
 *                                            action "check"  -> is each SKU / name free (active AND inactive)?
 *                                            action "create" -> create each item, read it back, list what Books did not keep
 *   WIDGET_Supplier_Style(supplier, style, brand)   live SanMar / S&S style: title, brand, case price per size. brand is
 *                                            optional; an S&S style number two brands share ("5000" = Gildan, Bayside)
 *                                            answers "choose_brand" with the candidates (wholesale thread doc 08)
 *
 * Every call answers { status: "ok" | "error" | "choose_brand" | "unavailable", message, ... } and never throws. "unavailable" = the
 * function is not installed or gave no usable answer, so the screen can say "not switched on yet" instead of failing.
 */
import { RULES } from "./newProductRules";

const str = (v) => (v == null ? "" : String(v));

export function readAnswer(response, name) {
  const none = (message) => ({ status: "unavailable", message });
  try {
    const raw = response && response.details ? response.details.output : undefined;
    const out = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!out || typeof out !== "object") return none("no answer from " + name);
    const status = ["ok", "error", "choose_brand"].includes(out.status) ? out.status : "unavailable";
    return { ...out, status, message: str(out.message) };
  } catch (e) {
    return none("unreadable answer from " + name + ": " + str((e && e.message) || e));
  }
}

async function callOnce(name, args) {
  try {
    const zoho = typeof window !== "undefined" ? window.ZOHO : null;
    const execute = zoho && zoho.CRM && zoho.CRM.FUNCTIONS && zoho.CRM.FUNCTIONS.execute;
    if (typeof execute !== "function") return { status: "unavailable", message: "not inside Zoho" };
    const response = await zoho.CRM.FUNCTIONS.execute(name, { arguments: JSON.stringify(args) });
    return readAnswer(response, name);
  } catch (e) {
    // Zoho says "not found" / "inactive" when the function (or its REST API) is missing, and "Internal Server Error" when it
    // is installed but failed while running (an error inside it, or Zoho's time limit for widget calls).
    const why = str((e && (e.message || e.code)) || e) || "no reason given";
    const missing = /not ?found|inactive|does ?not ?exist|no such|invalid.*function/i.test(why);
    return {
      status: "unavailable",
      reason: missing ? "missing" : "failed",
      message: missing ? name + " is not installed yet (" + why + ")" : name + " failed while running (" + why + ")",
    };
  }
}

/*
 * Which name a widget must use is not settled for these two: the folder and copy calls use the lower-case REST API name
 * (widget_create_deal_folders), the Quality Check invoice read works with WIDGET_Get_Deal_Invoices (docs/35), and the
 * Deluge thread expects lower case (their docs/38 §3). So: the name as written, then its lower-case form. A function
 * that answers at all (ok / error / choose_brand) is never called twice -- a create cannot run twice this way.
 */
export async function call(name, args) {
  const first = await callOnce(name, args);
  const lower = name.toLowerCase();
  // Only a function that is not there is worth trying under its other name; one that failed while running is reported as is.
  if (first.status !== "unavailable" || lower === name || first.reason !== "missing") return first;
  const second = await callOnce(lower, args);
  return second.status !== "unavailable" ? second : { ...first, message: first.message + "; " + second.message };
}

const books = (action, payload) => call(RULES.functions.books, { action, payload: JSON.stringify(payload || {}) });

/*
 * E-126 B (Deluge 10-23): a new vendor, the same name in Books and on the Deal "Vendors" list. One call (never repeated once it
 * answered). { done, result, message, name, vendorId, layouts } -- done = the vendor can be used now (added / already_there / partial);
 * name = the spelling to write (Books' own when the vendor already existed).
 */
/*
 * A0h (David 10-24): the vendor's website goes to Books' built-in Website (Deluge v2, 10-27). Sent trimmed, https:// added; "" = none.
 * The code is never sent here: a form-made code is saved at product create, only when the vendor's Vendor Code is blank (D-61).
 */
export const cleanWebsite = (w) => {
  const s = str(w).trim().replace(/\s+/g, "");
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
};
export const websiteProblem = (w) => {
  const s = str(w).trim();
  if (!s) return "";
  return /^(https?:\/\/)?[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i.test(s) ? "" : "That does not look like a web address (e.g. printograph.com).";
};

export async function addVendor(name, website = "") {
  const a = await call("widget_add_vendor", { name: str(name).trim(), dry_run: "false", website: cleanWebsite(website), vendor_code: "" });
  const result = str(a.result);
  return {
    done: a.status === "ok" && ["added", "already_there", "partial"].includes(result),
    result: result || a.status,
    message: a.status === "unavailable" ? "Adding vendors is not set up yet: ask David." : str(a.message),
    name: str(a.name).trim() || str(name).trim(),
    vendorId: str(a.books_vendor_id),
    layouts: Array.isArray(a.layouts) ? a.layouts : [],
    website: str(a.website),
    vendorCode: str(a.vendor_code).trim().toUpperCase(),
    notKept: Array.isArray(a.not_kept) ? a.not_kept.map(str) : [],
  };
}

/*
 * Live vendor and brand lists. { status, vendors: [{ id, name, code }], brands: [name] } -- since v5 (10-27) every Books vendor (expense
 * vendors too, ~346) with its Vendor Code ("" when none); before v5 the list was mostly customers (Books dropped the vendor filter).
 */
export async function booksLists() {
  const a = await books("lists");
  return {
    ...a,
    vendors: Array.isArray(a.vendors)
      ? a.vendors.filter((v) => v && v.id && v.name).map((v) => ({ id: str(v.id), name: str(v.name), code: str(v.code).trim().toUpperCase() }))
      : [],
    brands: Array.isArray(a.brands) ? a.brands.map(str).filter(Boolean) : [],
  };
}

const results = (a) => (Array.isArray(a.results) ? a.results : []);

/* { status, results: [{ sku, name, result: "free" | "refused", clash }] } */
export async function checkInBooks(items) {
  const a = await books("check", { items });
  return { ...a, results: results(a) };
}

/* { status, results: [{ sku, name, result: "created" | "refused" | "refused by Books", item_id, read_back, not_kept, books_message }] } */
export async function createInBooks(items, submittedBy) {
  const a = await books("create", { items, submitted_by: str(submittedBy) });
  return { ...a, results: results(a) };
}

/*
 * { status, title, brand, sizes: [{ size, cost }], discontinued, priced_at, candidates } -- cost = the case price per size.
 * status "choose_brand": the style number belongs to more than one brand; ask the rep, then call again with `brand`.
 */
export async function supplierStyle(supplier, style, brand = "") {
  const a = await call(RULES.functions.supplier, { supplier: str(supplier), style: str(style).trim(), brand: str(brand).trim() });
  return {
    ...a,
    title: str(a.title),
    brand: str(a.brand),
    discontinued: a.discontinued === true || a.discontinued === "true",
    candidates: Array.isArray(a.candidates) ? a.candidates.map(str).filter(Boolean) : [],
    sizes: Array.isArray(a.sizes)
      ? a.sizes.map((s) => ({ size: str(s && s.size), cost: Number(s && s.cost) })).filter((s) => s.size && Number.isFinite(s.cost))
      : [],
  };
}

/*
 * Deluge docs/42 + 43: action "search" (read-only, live 10-22). { skus: [exact codes] } or { text }. Answers active items:
 * [{ item_id, sku, name, rate, brand, unit, category }]; `partial: true` = the function stopped early, ask again for the rest.
 * Codes go 5 per call (Deluge: ~0.4 s each, the function stops at 7 s); a code still missing after its own retry is not in Books.
 * { status: "ok" | "error" | "unavailable", items: { SKU: item } }
 */
const item = (r) => ({
  item_id: str(r && r.item_id),
  sku: str(r && r.sku).trim().toUpperCase(),
  name: str(r && r.name),
  rate: Number(r && r.rate),
  brand: str(r && r.brand),
  vendor: str(r && r.vendor_name), // E-113: Deluge 10-23 (= the Deal choice, Books docs/47)
  unit: str(r && r.unit),
  category: str(r && r.category),
});
export async function searchBooks(skus) {
  const list = [...new Set((skus || []).map((s) => str(s).trim().toUpperCase()).filter(Boolean))];
  const items = {};
  const chunks = [];
  for (let i = 0; i < list.length; i += 5) chunks.push(list.slice(i, i + 5));
  const ask = async (codes) => {
    const a = await books("search", { skus: codes });
    if (a.status !== "ok") return a;
    results(a).map(item).forEach((r) => r.sku && (items[r.sku] = r));
    return a;
  };
  const answers = await Promise.all(chunks.map(ask));
  const bad = answers.find((a) => a.status !== "ok");
  if (bad) return { status: bad.status, message: bad.message, reason: bad.reason, items };
  // partial answers: ask once more, one code at a time, for what is still missing from those chunks
  const retry = chunks.filter((c, i) => answers[i].partial === true || answers[i].partial === "true").flat().filter((c) => !items[c]);
  for (const c of retry) await ask([c]);
  return { status: "ok", message: "", items };
}

/*
 * E-106: is this exact SKU an item in Books, even if CRM's copy has not synced yet (35 min - 2 h)? Since 10-22 through "search"
 * (Deluge docs/43 §2). If "search" is not answering, the older way: the "check" action's text -- "SKU already used by: <name>
 * (active)" -- word for word (Deluge keeps it). Returns [{ sku, name, active, item_id, rate, brand, category }]; [] when it cannot tell.
 */
const HELD = /^SKU already used by: (.*) \((active|inactive)\)$/;
export async function findSkusInBooks(skus) {
  const list = [...new Set((skus || []).map((s) => str(s).trim().toUpperCase()).filter(Boolean))].slice(0, 5);
  if (!list.length) return [];
  const s = await searchBooks(list);
  if (s.status === "ok") return list.filter((c) => s.items[c]).map((c) => ({ ...s.items[c], active: true }));
  const a = await checkInBooks(list.map((sku) => ({ sku, name: `zz lookup ${sku} zz`, brand: "lookup" })));
  if (a.status !== "ok") return [];
  return a.results
    .map((r) => ({ r, m: HELD.exec(str(r && r.clash)) }))
    .filter((x) => x.m)
    .map((x) => ({ sku: str(x.r.sku).toUpperCase(), name: x.m[1], active: x.m[2] === "active" }));
}

/*
 * E-128: which of these exact SKUs Books already uses, ACTIVE OR INACTIVE (the "check" action; "search" sees active items only).
 * { status, taken: Map(SKU -> { sku, name, active }) } -- status other than "ok" = Books could not tell (never guess "free").
 */
export async function skusInBooks(skus) {
  const list = [...new Set((skus || []).map((s) => str(s).trim().toUpperCase()).filter(Boolean))];
  const taken = new Map();
  for (let i = 0; i < list.length; i += 10) {
    const part = list.slice(i, i + 10);
    const a = await checkInBooks(part.map((sku) => ({ sku, name: `zz lookup ${sku} zz`, brand: "lookup" })));
    if (a.status !== "ok") return { status: a.status, message: a.message, taken };
    a.results.forEach((r) => {
      const m = HELD.exec(str(r && r.clash));
      if (m) taken.set(str(r.sku).toUpperCase(), { sku: str(r.sku).toUpperCase(), name: m[1], active: m[2] === "active" });
    });
  }
  return { status: "ok", message: "", taken };
}

/*
 * E-108: widget_create_billing_draft (Deluge docs/43 §1). One call; never retried under another name once it answered, so a
 * draft cannot be made twice. Answer: { status, result, message, number, id, link, not_added, notes, ... } (shown as is).
 */
export async function createBillingDraft(dealId, payload) {
  const a = await call(RULES.functions.billingDraft, { deal_id: str(dealId), payload: JSON.stringify(payload) });
  return {
    ...a,
    result: str(a.result),
    number: str(a.number),
    link: str(a.link),
    not_added: Array.isArray(a.not_added) ? a.not_added : [],
    notes: Array.isArray(a.notes) ? a.notes.map(str).filter(Boolean) : [],
  };
}
