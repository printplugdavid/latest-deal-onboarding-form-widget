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

async function call(name, args) {
  try {
    const zoho = typeof window !== "undefined" ? window.ZOHO : null;
    const execute = zoho && zoho.CRM && zoho.CRM.FUNCTIONS && zoho.CRM.FUNCTIONS.execute;
    if (typeof execute !== "function") return { status: "unavailable", message: "not inside Zoho" };
    const response = await zoho.CRM.FUNCTIONS.execute(name, { arguments: JSON.stringify(args) });
    return readAnswer(response, name);
  } catch (e) {
    return { status: "unavailable", message: name + " is not installed yet (" + str((e && e.message) || e) + ")" };
  }
}

const books = (action, payload) => call(RULES.functions.books, { action, payload: JSON.stringify(payload || {}) });

/* Live vendor and brand lists. { status, vendors: [{ id, name }], brands: [name] } */
export async function booksLists() {
  const a = await books("lists");
  return {
    ...a,
    vendors: Array.isArray(a.vendors) ? a.vendors.filter((v) => v && v.id && v.name).map((v) => ({ id: str(v.id), name: str(v.name) })) : [],
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
