/*
 * amendBilling.js -- E-157 (David 10-29, our docs/85, Deluge docs/53 + docs/54): the Amendment Form charges more or less.
 *
 * The form prices the order BEFORE and AFTER the amendment with the onboarding draft's own rules (billingLines.js) and the same Books
 * rates, and sends only the DIFFERENCE to Deluge's widget_amend_billing, which decides by the Deal's Books document:
 *   not paid (invoice or estimate) -> lines added / lowered on it (a sent invoice too, with a reason)
 *   part paid                      -> added lines go on it; a lower becomes a credit note applied to it
 *   fully paid                     -> added lines on a NEW draft invoice; a lower = a credit note (left as customer credit)
 *   a credit note                  -> a task for the Deal's Sales Person: refund it or keep it
 * Hand edits and discounts on the invoice are never touched; a lower that matches no line comes back in `not_matched` and is shown
 * FIRST (David: discourage changing invoices by hand).
 *
 * Pairing (before line <-> after line): garments by SKU + color (one line per Books size item per color), prints / extras / gang sheets
 * by SKU, everything else (products, fees, other charges, PPFEE8) by SKU + description + rate. A print whose price tier changes moves to
 * another SKU = the old SKU lowered, the new one added. A garment that gains sizes = one add line for what was added; one that loses
 * sizes = one lower on the old line's text (`description` = how Books has it) with `new_description` (Deluge v4; v3 ignores it).
 *
 * Every real call goes out ONCE (Deluge 10-29: v3 has no duplicate guard): never retried; a call that does not answer tells the rep to
 * check Books first. `amendment_id` is sent for the v4 guard. No React. Tested in amendBilling.test.js.
 */
import { buildBillingLines, priceLines, skusToFind } from "./billingLines";
import CONFIG from "./billingConfig.json";

export const AMEND_FUNCTION = "widget_amend_billing";
export const amendBillingOn = () => CONFIG.amendBilling === true;

const str = (v) => (v == null ? "" : String(v));
const round2 = (n) => Math.round(n * 100) / 100;

/* ---------- reading a description: "Black\n\n3 Medium\n2 Large" -> head "Black", counts { Medium: 3, Large: 2 } ---------- */
const COUNT = /^(\d+(?:\.\d+)?) (.+)$/;
export function countsOf(text) {
  const head = [];
  const counts = new Map();
  str(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((l) => {
      const m = l.match(COUNT);
      // "1 Front Placement" / "6 Front Placements" are the same thing
      const k = m && m[2].replace(/ Placements$/, " Placement");
      if (m) counts.set(k, (counts.get(k) || 0) + Number(m[1]));
      else head.push(l);
    });
  return { head, counts };
}

/* What changed between two descriptions of the same line, in the same words ("2 Medium"), or null when it can't be read. */
function countChange(beforeText, afterText) {
  const b = countsOf(beforeText);
  const a = countsOf(afterText);
  if (!b.counts.size || !a.counts.size) return null;
  const added = [];
  const removed = [];
  new Set([...b.counts.keys(), ...a.counts.keys()]).forEach((k) => {
    const d = round2((a.counts.get(k) || 0) - (b.counts.get(k) || 0));
    const say = (n) => `${n} ${k}${n !== 1 && / Placement$/.test(k) ? "s" : ""}`;
    if (d > 0) added.push(say(d));
    if (d < 0) removed.push(say(-d));
  });
  return { head: a.head.length ? a.head : b.head, added, removed };
}

/* The add line's text for a line that grew: "Black\n\nAdded:\n2 Medium" (+ "Removed:" sizes when sizes also moved). */
function grownText(beforeText, afterText) {
  const c = countChange(beforeText, afterText);
  if (!c) return `Added to the order:\n${str(afterText)}`.trim();
  const parts = [];
  if (c.head.length) parts.push(c.head.filter((h) => !/^Stitch count estimated/i.test(h)).join("\n"));
  if (c.added.length) parts.push("Added:\n" + c.added.join("\n"));
  if (c.removed.length) parts.push("Removed:\n" + c.removed.join("\n"));
  return parts.filter(Boolean).join("\n\n");
}

/* ---------- pairing ---------- */
const colorOf = (l) => str(l.description).split("\n\n")[0].trim();
export function pairKey(l) {
  const g = str(l.group);
  if (g === "garment") return `${l.sku}|${colorOf(l)}`;
  if (g === "decoration" || g === "extra" || g === "gangSheet") return `${l.sku}|${g}`;
  return `${l.sku}|${str(l.description)}|${l.rate == null ? "" : l.rate}`;
}

const sumUp = (lines) => {
  const m = new Map();
  (lines || []).forEach((l) => {
    const k = pairKey(l);
    const had = m.get(k);
    if (had) had.quantity = round2(had.quantity + Number(l.quantity || 0));
    else m.set(k, { ...l, quantity: Number(l.quantity || 0) });
  });
  return m;
};

const addLine = (l, quantity, description) => {
  const out = { sku: l.sku, quantity: round2(quantity), description: str(description) };
  if (l.item_id) {
    out.item_id = str(l.item_id);
    out.rate = Number(l.rate) || 0; // Deluge: rate is needed whenever item_id is sent
  } else if (l.rate != null && l.group === "fee") out.rate = Number(l.rate) || 0;
  return out;
};
const lowerLine = (l, quantity, newDescription) => {
  const out = { sku: l.sku, quantity: round2(quantity), description: str(l.description) };
  if (l.item_id) out.item_id = str(l.item_id);
  if (l.line_item_id) out.line_item_id = str(l.line_item_id);
  if (newDescription != null) out.new_description = str(newDescription);
  return out;
};

/*
 * The difference between two priced line lists ({ lines } from priceLines): { add, lower, money } -- money = the change at these
 * rates before rush / card / extra-week / tax (Books works out the rest). Each entry carries `id` (stable, for the rep's tick boxes)
 * and `plain` (one line for the screen).
 */
export function billingDiff(beforeLines, afterLines) {
  const b = sumUp(beforeLines);
  const a = sumUp(afterLines);
  const add = [];
  const lower = [];
  const money = (l, q) => round2((Number(l.rate) || 0) * q);
  const label = (l, q) => `${q} x ${l.sku}${colorOf(l) && l.group === "garment" ? " " + colorOf(l) : ""}`;
  new Set([...b.keys(), ...a.keys()]).forEach((k) => {
    const was = b.get(k);
    const now = a.get(k);
    if (now && !was) {
      add.push({ id: "add:" + k, line: addLine(now, now.quantity, now.description), plain: `Add ${label(now, now.quantity)}`, amount: money(now, now.quantity) });
      return;
    }
    if (was && !now) {
      lower.push({ id: "lower:" + k, line: lowerLine(was, was.quantity), plain: `Remove ${label(was, was.quantity)}`, amount: -money(was, was.quantity) });
      return;
    }
    const d = round2(now.quantity - was.quantity);
    if (d > 0) {
      add.push({ id: "add:" + k, line: addLine(now, d, grownText(was.description, now.description)), plain: `Add ${label(now, d)}`, amount: money(now, d) });
    } else if (d < 0) {
      lower.push({ id: "lower:" + k, line: lowerLine(was, -d, now.description), plain: `Take off ${label(was, -d)}`, amount: -money(was, -d) });
    }
    // same quantity (sizes may have moved inside a line): same SKU, same rate -> no money change, nothing sent
  });
  [...add, ...lower].forEach((x) => (x.rate = Number((x.line.quantity && Math.abs(x.amount) / x.line.quantity) || 0)));
  return { add, lower, money: round2([...add, ...lower].reduce((s, x) => s + x.amount, 0)) };
}

/*
 * Paid / part-paid invoices: an add and a lower of the SAME item at the SAME price cancel out (3 Navy swapped for 3 Black would
 * otherwise make a new draft invoice AND a credit note for the same money). Returns { add, lower, netted } -- netted = how many
 * pieces cancelled. On an unpaid invoice the lines are sent as they are (the invoice's text then shows the new colors).
 */
export function netSwaps({ add, lower }) {
  const key = (x) => `${x.line.sku}|${x.rate}`;
  const addQ = new Map();
  const lowQ = new Map();
  add.forEach((x) => addQ.set(key(x), (addQ.get(key(x)) || 0) + x.line.quantity));
  lower.forEach((x) => lowQ.set(key(x), (lowQ.get(key(x)) || 0) + x.line.quantity));
  let netted = 0;
  const cancel = new Map();
  addQ.forEach((q, k) => {
    const c = Math.min(q, lowQ.get(k) || 0);
    if (c > 0) {
      cancel.set(k, c);
      netted += c;
    }
  });
  if (!netted) return { add, lower, netted: 0 };
  const trim = (list) => {
    const budget = new Map(cancel);
    return list
      .map((x) => {
        const b = budget.get(key(x)) || 0;
        if (!b) return x;
        const take = Math.min(b, x.line.quantity);
        budget.set(key(x), b - take);
        const q = round2(x.line.quantity - take);
        if (!(q > 0)) return null;
        const isAdd = x.id.startsWith("add:");
        const line = { ...x.line, quantity: q };
        // an add line's text names what it charges; a lower keeps Books' text (it is how the line is found)
        if (isAdd) line.description = `${str(x.line.description).split("\n\nAdded:")[0]}\n\nAdded: ${q} (the rest was swapped at the same price)`.trim();
        const plain = x.plain.replace(/^(Add|Take off|Remove) [\d.]+ x/, (m, verb) => `${verb === "Remove" ? "Take off" : verb} ${q} x`);
        return { ...x, id: x.id + ":net", line, plain, amount: round2((x.amount / x.line.quantity) * q) };
      })
      .filter(Boolean);
  };
  return { add: trim(add), lower: trim(lower), netted };
}

/* Hand-list items (no Books price) the amendment ADDED: the rep adds these in Books by hand. */
export function newHandItems(beforeHand, afterHand) {
  const key = (h) => `${h.what}|${h.reason}`;
  const had = new Map((beforeHand || []).map((h) => [key(h), Number(h.quantity) || 0]));
  return (afterHand || []).filter((h) => (Number(h.quantity) || 0) > (had.get(key(h)) || 0));
}

/*
 * Price both orders with ONE Books search (the same rates on both sides). `search(skus)` = booksItems.searchBooks. Books not answering
 * -> the grid's snapshot rates (found = null), said in `lookup`.
 */
export async function priceBeforeAfter(beforeData, afterData, search) {
  const bBuilt = buildBillingLines(beforeData);
  const aBuilt = buildBillingLines(afterData);
  const skus = [...new Set([...skusToFind(bBuilt), ...skusToFind(aBuilt)])];
  let found = null;
  let lookup = "";
  if (skus.length) {
    const s = await search(skus);
    if (s.status === "ok") found = s.items;
    else lookup = `Books prices could not be read (${s.message || "no answer"}).`;
  }
  const before = priceLines(bBuilt, found);
  const after = priceLines(aBuilt, found);
  return { before, after, found: !!found, lookup, flags: aBuilt.flags };
}

/* The id Deluge's v4 duplicate guard keys on: Deal id + the moment the rep pressed Save. */
export const amendmentIdOf = (dealId, isoTime) => `${str(dealId)}-${str(isoTime)}`;

/* widget_amend_billing's arguments ({ deal_id, payload: "<json string>" }, Deluge docs/54 §3 + their 10-29 interface message). */
export function amendArgs(dealId, { add, lower, flags, dryRun, submittedBy, reason, amendmentId }) {
  const why = str(reason).trim().slice(0, 400) || "Order amended";
  const payload = {
    dry_run: !!dryRun,
    submitted_by: str(submittedBy),
    reason: amendmentId ? `${why} [${amendmentId}]` : why,
    add: (add || []).map((x) => x.line),
    lower: (lower || []).map((x) => x.line),
    rush: !!(flags && flags.rush),
    extended_turnaround: !!(flags && flags.extendedTurnaround),
    paying_by_card: !!(flags && flags.payingByCard),
  };
  if (amendmentId) payload.amendment_id = str(amendmentId);
  return { deal_id: str(dealId), payload: JSON.stringify(payload) };
}

/* Results that changed Books (the rep is told what happened; anything else changed nothing). */
export const WROTE = ["changed", "credit_note", "changed_and_credit", "new_draft", "new_draft_and_credit"];
/* Results where nothing will be changed whatever the rep does -- no OK button. */
export const NOTHING_TO_SEND = ["nothing_to_change", "nothing_in_books", "online_order"];

const money2 = (n) => (n == null || n === "" || isNaN(Number(n)) ? "" : "$" + Number(n).toFixed(2));

/*
 * The function's answer, made safe for the screen: { ok, result, message, notMatched[], changes[], notes[], summary, ...raw }.
 * A call that did not answer (`unavailable`): for a real write we cannot know whether Books was changed -> `unknown`.
 */
export function readAmendAnswer(a, { dryRun }) {
  const raw = a || {};
  if (raw.status === "unavailable") {
    const missing = raw.reason === "missing";
    return {
      ok: false,
      unknown: !dryRun && !missing,
      result: missing ? "not_installed" : "no_answer",
      message: missing
        ? "The invoice update isn't switched on in Zoho yet, so Books was not changed. Change the invoice in Books if needed."
        : dryRun
        ? `Zoho did not answer in time (${raw.message}). Nothing was changed. Try "Check with Books" again in a minute.`
        : "Zoho did not answer in time, so it is not known whether the invoice was changed. Check the invoice in Books before submitting again.",
      notMatched: [],
      changes: [],
      notes: [],
    };
  }
  const result = str(raw.result);
  const list = (v) => (Array.isArray(v) ? v : []);
  const notMatched = list(raw.not_matched).map((n) =>
    typeof n === "string" ? n : `${str(n.action) === "lower" ? "Take off" : "Add"} ${str(n.quantity)} x ${str(n.sku)}${n.why ? " - " + str(n.why) : ""}`
  );
  const summary = [];
  const doc = [str(raw.document), str(raw.number)].filter(Boolean).join(" ");
  if (doc) summary.push(`${doc}${raw.doc_status ? " (" + str(raw.doc_status) + ")" : ""}`);
  if (raw.old_total != null && raw.new_total != null) summary.push(`Total ${money2(raw.old_total)} -> ${money2(raw.new_total)}`);
  else if (raw.old_total != null) summary.push(`Total now ${money2(raw.old_total)}`);
  if (raw.new_draft && raw.new_draft.number) summary.push(`New draft invoice ${raw.new_draft.number} (${money2(raw.new_draft.total)})`);
  if (raw.credit && raw.credit.number)
    summary.push(
      `Credit note ${raw.credit.number}: ${money2(raw.credit.total)}, ${money2(raw.credit.applied)} applied to the invoice` +
        (Number(raw.credit.left_as_credit) > 0 ? `, ${money2(raw.credit.left_as_credit)} left as the customer's credit` : "")
    );
  return {
    ...raw,
    ok: raw.status === "ok",
    result,
    message: str(raw.message),
    notMatched,
    changes: list(raw.changes).map(str),
    notes: list(raw.notes).map(str),
    summary,
  };
}

/* One plain line for the amendment's result list (the Save outcome). */
export function outcomeLine(ans) {
  if (!ans) return "";
  if (WROTE.includes(ans.result)) return "invoice updated in Books: " + (ans.summary.join("; ") || ans.message);
  return "invoice: " + (ans.message || ans.result);
}
