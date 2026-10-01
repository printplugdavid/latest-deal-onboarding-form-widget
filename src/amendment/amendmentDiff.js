/*
 * amendmentDiff.js -- the pure half of the Amendment Form (E-24, D-24).
 *
 * The amendment view loads the Deal's newest onboarding-form.json back into the SAME react-hook-form
 * shape the onboarding form submits (the JSON is `data` plus two `_` stamps -- App.jsx onSubmit), so
 * the shared branch components render it without a mapping layer. This module does the three things
 * around that which must not live in a component:
 *
 *   toFormValues   JSON -> form values. Strips the `_` stamps and turns the four date strings back into
 *                  dayjs objects. ⚠️ @mui/x-date-pickers v8 calls value.isValid() -- a string value
 *                  THROWS, so a plain reset(json) takes the view down on any deal with a date.
 *   diffValues     what the agent changed, leaf by leaf, with empty/undefined/"" treated as equal so a
 *                  Controller's defaultValue="" on a key the old payload never had is not a "change".
 *   applyAppendRule   D-23: Vendors Used and Special Instructions never lose history. The amended value
 *                  is the original plus a dated separator plus what was added.
 *
 * No Zoho, no React. Tested in amendmentDiff.test.js.
 */
import dayjs from "dayjs";

// Every DatePicker-backed field in the onboarding form (App.jsx, GraphicForm, OnlineStorefrontForm).
// If a new date field is added there, add it here or the amendment view will crash on prefill.
export const DATE_FIELD = /(^|\.)(dueDate|dateNeededBy|storefrontLiveDate|storefrontEndDate)$/;

// D-23: these accumulate. Matched at any depth (per-garment, per-product and the top-level box).
export const APPEND_FIELD = /(^|\.)(vendorsUsed|specialInstructions)$/;

// Not answers: the payload stamps, and the Autocomplete's own bookkeeping of which products exist.
const SKIP_TOP = (key) => key.startsWith("_") || key === "productSelector";

const isPlainObject = (v) =>
  v != null && typeof v === "object" && !Array.isArray(v) && !dayjs.isDayjs(v) && !(v instanceof Date);

// ---------------------------------------------------------------------------------------------------
// JSON -> form values
// ---------------------------------------------------------------------------------------------------

function reviveDates(value, path) {
  if (Array.isArray(value)) return value.map((v, i) => reviveDates(v, `${path}.${i}`));
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = reviveDates(v, path ? `${path}.${k}` : k);
    return out;
  }
  if (DATE_FIELD.test(path)) {
    if (value == null || value === "") return null;
    const d = dayjs(value);
    return d.isValid() ? d : null;
  }
  return value;
}

export function toFormValues(json) {
  const out = {};
  for (const [k, v] of Object.entries(json || {})) {
    if (k.startsWith("_")) continue;
    out[k] = reviveDates(v, k);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------------------------------

export function normalizeLeaf(v) {
  if (v == null) return "";
  if (dayjs.isDayjs(v)) return v.isValid() ? v.format("YYYY-MM-DD") : "";
  if (v instanceof Date) return isNaN(v) ? "" : dayjs(v).format("YYYY-MM-DD");
  if (typeof v === "string") return v.trim();
  // A checkbox the old payload never had mounts as `false`. Unticked and never-asked are the same
  // answer; a tick reads as "Yes" in the What Changed lines.
  if (v === false) return "";
  if (v === true) return "Yes";
  return String(v);
}

// path -> normalised leaf. Empty arrays/objects contribute nothing, so "missing" and "empty" agree.
export function flatten(value, path = "", out = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, path ? `${path}.${i}` : String(i), out));
  } else if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (!path && SKIP_TOP(k)) continue;
      flatten(v, path ? `${path}.${k}` : k, out);
    }
  } else if (path) {
    // Dates are compared as dates even if one side is still a string.
    out.set(path, DATE_FIELD.test(path) && typeof value === "string" && value
      ? normalizeLeaf(dayjs(value))
      : normalizeLeaf(value));
  }
  return out;
}

export function diffValues(before, after) {
  const a = flatten(before);
  const b = flatten(after);
  const paths = [...a.keys(), ...[...b.keys()].filter((p) => !a.has(p))];
  const changes = [];
  for (const path of paths) {
    const was = a.get(path) ?? "";
    const now = b.get(path) ?? "";
    if (was === now) continue;
    // A Yes/No question the old payload never carried mounts with its default "No". Unanswered
    // and "No" are the same answer; a real change to "Yes" (or from "Yes") is still reported.
    if (was === "" && now === "No") continue;
    changes.push({ path, before: was, after: now });
  }
  return changes;
}

// ---------------------------------------------------------------------------------------------------
// D-23 append rule
// ---------------------------------------------------------------------------------------------------

export const amendSeparator = (date) => `--- amended ${date} ---`;

/*
 * Never destroy. The agent edits the prefilled text however they like; what is saved always keeps the
 * original verbatim. If they typed after it, only the new part goes under the separator. If they
 * rewrote or cleared it, the original stays and their version goes underneath.
 */
export function appendAmended(before, after, date) {
  const was = normalizeLeaf(before);
  const now = normalizeLeaf(after);
  if (was === now) return before;
  if (!was) return now;
  const sep = amendSeparator(date);
  if (!now) return `${was}\n${sep}\n(cleared in this amendment)`;
  const added = now.startsWith(was) ? now.slice(was.length).trim() : now;
  return `${was}\n${sep}\n${added}`;
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

const clone = (v) => {
  if (Array.isArray(v)) return v.map(clone);
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
  return v; // dayjs objects are immutable; leaves are copied by value
};

// The values that would be SAVED: `after`, with every changed append-field merged per D-23.
export function applyAppendRule(before, after, date) {
  const out = clone(after);
  for (const { path } of diffValues(before, after)) {
    if (!APPEND_FIELD.test(path)) continue;
    setPath(out, path, appendAmended(getPath(before, path), getPath(after, path), date));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Human-readable labels, for the What Changed block
// ---------------------------------------------------------------------------------------------------

const ARRAY_LABELS = {
  primaryBranches: "Garment",
  secondaryBranches: "Graphic",
  tartiaryBranches: "Placement",
  branches: "Graphic",
  gangGraphics: "Gang graphic",
  garmentSkus: "SKU",
};

const FIELD_LABELS = {
  countColorSize: "Total Count, Colors & Sizes",
  garmentType: "Garment Type (Brand / Style)",
  garmentQuantity: "Garment Quantity",
  vendorsUsed: "Vendors Used",
  specialInstructions: "Special Instructions / Considerations",
  dueDate: "Due Date",
  hardDueDate: "Hard Due Date",
  numberOfColorsUsed: "Number of Colors",
  quantityOrdered: "Quantity Ordered",
  sku: "SKU",
};

export const humanize = (key) => {
  const words = key.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function describePath(path, values) {
  const parts = path.split(".");
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    const next = parts[i + 1];
    if (key === "products" && /^\d+$/.test(next || "")) {
      const name = getPath(values, `products.${next}.productName`);
      out.push(name ? String(name) : `Product ${Number(next) + 1}`);
      i++;
    } else if (ARRAY_LABELS[key] && /^\d+$/.test(next || "")) {
      out.push(`${ARRAY_LABELS[key]} ${Number(next) + 1}`);
      i++;
    } else if (key === "contactInfo") {
      out.push("Contact");
    } else if (/^\d+$/.test(key)) {
      out.push(`#${Number(key) + 1}`);
    } else {
      out.push(FIELD_LABELS[key] || humanize(key));
    }
  }
  return out.join(" › ");
}

// Plain-text lines for the What Changed block. Multi-line values get their own was/now lines.
export function summariseDiff(changes, values) {
  const show = (v) => (v === "" ? "(empty)" : v);
  return changes.map(({ path, before, after }) => {
    const label = describePath(path, values);
    if (before.includes("\n") || after.includes("\n")) {
      return `${label}:\n  was: ${show(before).replace(/\n/g, "\n       ")}\n  now: ${show(after).replace(/\n/g, "\n       ")}`;
    }
    return `${label}: ${show(before)} → ${show(after)}`;
  });
}

// ---------------------------------------------------------------------------------------------------
// Whole-product add / remove
// ---------------------------------------------------------------------------------------------------
/*
 * The diff above is by array index, so physically deleting product 0 would make every later product
 * look rewritten. The view therefore never splices `products` while editing: a removed product stays
 * in place and its index goes into `removed`; an added product is appended at the end. Indices stay
 * stable, Undo is free, and the saved payload is built once, here.
 */
const productTag = (p, i) => `${p?.productName || `Product ${i + 1}`} (${p?.productType || "?"})`;
const productIndexOf = (path) => {
  const m = /^products\.(\d+)(\.|$)/.exec(path);
  return m ? Number(m[1]) : -1;
};

// What gets SAVED: removed products dropped, productSelector rebuilt to match, append rule applied.
export function effectiveValues(before, after, removed, date) {
  const out = applyAppendRule(before, after, date);
  const gone = new Set(removed || []);
  const originalCount = (before?.products || []).length;
  const products = (out.products || []).filter((_, i) => !gone.has(i));
  const touched = gone.size > 0 || (out.products || []).length !== originalCount;
  out.products = products;
  if (touched) out.productSelector = products.map((p) => `${p?.productName}#${p?.productType}`);
  return out;
}

// The What Changed lines, with whole-product adds/removes stated once instead of field by field.
export function summariseAmendment(before, after, removed) {
  const gone = new Set(removed || []);
  const originalCount = (before?.products || []).length;
  const afterProducts = after?.products || [];
  const lines = [];

  [...gone].sort((a, b) => a - b).forEach((i) => {
    if (i < originalCount) lines.push(`Product removed: ${productTag(before.products[i], i)}`);
  });
  afterProducts.forEach((p, i) => {
    if (i >= originalCount && !gone.has(i)) lines.push(`Product added: ${productTag(p, i)}`);
  });

  const fieldChanges = diffValues(before, after).filter(({ path }) => {
    const i = productIndexOf(path);
    if (i === -1) return true;
    if (gone.has(i)) return false; // removed (or added then removed): its fields are not news
    // the added line already names the product
    return !(i >= originalCount && /^products\.\d+\.(productName|productType)$/.test(path));
  });
  return [...lines, ...summariseDiff(fieldChanges, after)];
}

// ---------------------------------------------------------------------------------------------------
// What Save writes (stage 2)
// ---------------------------------------------------------------------------------------------------

const NL = String.fromCharCode(10); // hard rule 5: never a literal "\n" in note text
const DIV = "---------------------------";

/*
 * The amended note is a COMPLETE DEAL ONBOARDING FORM note with a What Changed block on top.
 * Complete, not a delta: consumers take the NEWEST onboarding note (D-4), so only a full note makes
 * "newest wins" correct. The block sits ABOVE "CONTACT INFO", so every label the revision form's
 * noteParser reads is exactly where it always was.
 */
export function buildAmendmentNote({ content, lines, story, when, previousWhen }) {
  const head = [
    "ONBOARDING AMENDED " + when,
    DIV,
    "",
    "WHAT CHANGED",
  ]
    .concat((lines || []).map((l) => "• " + String(l).split("\n").join(NL + "  ")))
    .concat([
      "",
      "IN THE AGENT'S WORDS",
      String(story || "").trim() || "(nothing written)",
      "",
      "This note replaces the onboarding note" + (previousWhen ? " submitted " + previousWhen : "") + ".",
      "Production tasks created before this amendment may still show the old numbers --",
      "the production card viewer and the print counts on the Deal are current.",
      "",
      "",
    ]);
  return head.join(NL) + content;
}

// The entry appended to Onboarding_Update_Results: the auto diff, then the agent's own words.
export function buildUpdateResultsEntry({ lines, story, when }) {
  return ["--- amended " + when + " ---", "What changed:"]
    .concat((lines || []).map((l) => "• " + l))
    .concat(["In the agent's words:", String(story || "").trim() || "(nothing written)"])
    .join(NL);
}

/*
 * Append, never replace (D-23). The field holds 32,000 characters; if the history would overflow,
 * the OLDEST text is trimmed from the top and marked, so the newest amendment is always intact.
 */
export function appendUpdateResults(existing, entry, cap = 32000) {
  const was = String(existing == null ? "" : existing).trim();
  const out = was ? was + NL + NL + entry : entry;
  if (out.length <= cap) return out;
  const mark = "[earlier history trimmed to fit]" + NL;
  return mark + out.slice(out.length - (cap - mark.length));
}

export const SUPERSEDED_TITLE = (date) => "DEAL ONBOARDING FORM (SUPERSEDED " + date + ")";
export const LIVE_NOTE_TITLE = "DEAL ONBOARDING FORM";

// ---------------------------------------------------------------------------------------------------
// Per-garment add / remove
// ---------------------------------------------------------------------------------------------------
/*
 * Same idea as whole products, one level down: a removed garment stays in its array while editing
 * and its "p.g" key goes into `removedGarments`; an added garment is appended. These wrap the
 * product-level functions so nothing above had to change.
 */
const garmentKeyOf = (path) => {
  const m = /^products\.(\d+)\.primaryBranches\.(\d+)(\.|$)/.exec(path);
  return m ? m[1] + "." + m[2] : "";
};
const garmentTag = (values, p, g) => {
  const gar = getPath(values, `products.${p}.primaryBranches.${g}`) || {};
  const product = getPath(values, `products.${p}.productName`) || `Product ${p + 1}`;
  const bits = [String(gar.garmentType || "").split("\n")[0].trim(), gar.garmentQuantity ? gar.garmentQuantity + " pcs" : ""]
    .filter(Boolean)
    .join(", ");
  return `${product} › Garment ${g + 1}` + (bits ? ` (${bits})` : "");
};

export function effectiveValuesWithGarments(before, after, removed, removedGarments, date) {
  const gone = new Set(removedGarments || []);
  // Filter garments on the still-indexed tree FIRST, then let the product-level filter run.
  const staged = clone(after);
  (staged.products || []).forEach((prod, p) => {
    if (!Array.isArray(prod?.primaryBranches)) return;
    const originalLen = (getPath(before, `products.${p}.primaryBranches`) || []).length;
    const kept = prod.primaryBranches.filter((_, g) => !gone.has(p + "." + g));
    if (kept.length !== prod.primaryBranches.length || kept.length !== originalLen) {
      prod.numberOfGarmentTypes = String(kept.length);
    }
    prod.primaryBranches = kept;
  });
  // The append rule compares by index, so apply it BEFORE the garment arrays were shortened:
  const merged = applyAppendRule(before, after, date);
  (staged.products || []).forEach((prod, p) => {
    if (!Array.isArray(prod?.primaryBranches)) return;
    const src = getPath(merged, `products.${p}.primaryBranches`) || [];
    prod.primaryBranches = src.filter((_, g) => !gone.has(p + "." + g));
  });
  ["specialInstructions"].forEach((k) => {
    if (merged[k] !== undefined) staged[k] = merged[k];
  });
  (staged.products || []).forEach((prod, p) => {
    ["vendorsUsed", "specialInstructions"].forEach((k) => {
      const v = getPath(merged, `products.${p}.${k}`);
      if (v !== undefined) prod[k] = v;
    });
  });
  // Product-level removal + productSelector, with the append rule already applied above.
  const goneProducts = new Set(removed || []);
  const originalCount = (before?.products || []).length;
  const touched = goneProducts.size > 0 || (staged.products || []).length !== originalCount;
  staged.products = (staged.products || []).filter((_, i) => !goneProducts.has(i));
  if (touched) staged.productSelector = staged.products.map((p) => `${p?.productName}#${p?.productType}`);
  return staged;
}

export function summariseAmendmentWithGarments(before, after, removed, removedGarments) {
  const goneProducts = new Set(removed || []);
  const gone = new Set(removedGarments || []);
  const lines = [];
  const touchedProducts = new Set();

  [...gone].sort().forEach((key) => {
    const [p, g] = key.split(".").map(Number);
    if (goneProducts.has(p)) return;
    const originalLen = (getPath(before, `products.${p}.primaryBranches`) || []).length;
    touchedProducts.add(p);
    if (g < originalLen) lines.push("Garment removed: " + garmentTag(before, p, g));
  });
  (after?.products || []).forEach((prod, p) => {
    if (goneProducts.has(p) || p >= (before?.products || []).length) return;
    const originalLen = (getPath(before, `products.${p}.primaryBranches`) || []).length;
    (prod?.primaryBranches || []).forEach((_, g) => {
      if (g >= originalLen && !gone.has(p + "." + g)) {
        touchedProducts.add(p);
        lines.push("Garment added: " + garmentTag(after, p, g));
      }
    });
  });

  const base = summariseAmendment(before, after, removed);
  const productLines = base.filter((l) => /^Product (added|removed): /.test(l));

  const fieldChanges = diffValues(before, after).filter(({ path }) => {
    const i = productIndexOf(path);
    if (i !== -1 && goneProducts.has(i)) return false;
    if (i >= (before?.products || []).length && /^products\.\d+\.(productName|productType)$/.test(path)) return false;
    if (gone.has(garmentKeyOf(path))) return false; // a removed garment's fields are not news
    // the count is restated by the added/removed lines
    if (touchedProducts.has(i) && /^products\.\d+\.numberOfGarmentTypes$/.test(path)) return false;
    return true;
  });
  return [...productLines, ...lines, ...summariseDiff(fieldChanges, after)];
}
