/*
 * qcRules.js -- E-52, the Quality Check form (?view=qc). Everything the form DECIDES lives here,
 * pure and tested: which tasks are QC tasks, which stage a result leads to, what is written to the
 * Deal, the partial-pickup record, the note, and the plain-language "what will happen" list.
 * QcApp.jsx only shows it and carries out the plan -- the panel and the submit read the SAME plan,
 * so the screen cannot promise one thing and write another.
 *
 * Measured 2026-10-12 (docs/03): the stage change itself does the rest. Each target stage already
 * has a workflow rule that stamps its own date, tags the Deal, makes the follow-up task and (for
 * Production Complete and Products Shipped) emails the customer. So this form writes NO date stamps
 * and creates NO tasks -- it writes its few fields, closes the QC task, and moves the stage LAST
 * with the workflow trigger (D-27). Doing any of that here as well would double it.
 */
import { VINYL_DEPT, departmentFor } from "../printMath";
import { stylesNotMarked } from "../sizeRows";
import { formatSizeVariants } from "../sizeVariants";

// The only boxes QC has to tick (David's list, quality-check/03 section 4). Expected to grow:
// add a line here and the form, the note and the tests pick it up.
export const APPROVALS = [
  { key: "count", label: "Count is accurate — and the colors and styles are right" },
  { key: "graphic", label: "The graphic matches the original artwork and the mock-up" },
  { key: "quality", label: "Print quality is up to standard" },
  { key: "placement", label: "Placement is accurate and consistent — it reflects the mock-up and the notes" },
];

// Stage names exactly as CRM displays them (docs/08: the display value, never actual_value).
export const STAGES = {
  QC: "Quality Check",
  FAILED: "Failed Quality Check",
  REMAINDER: "Production Complete - Remainder Due",
  NO_REMAINDER: "Production Complete - No Remainder",
  NEED_SHIP: "Products Need Shipping",
  SHIPPED: "Products Shipped",
};

// E-82 (David 10-29): PART = "part of the order is ready, the rest is still in production" -- nothing failed, the Deal stays in QC.
export const RESULTS = { PICKUP: "pickup", SHIP: "ship", FAILED: "failed", PART: "part" };
export const DEFAULT_TRACKING_URL = "https://tools.usps.com/tracking/"; // what every shipped deal carries today
export const QC_NOTE_TITLE = "QUALITY CHECK FORM";

// What CRM does by itself when a Deal ENTERS each stage -- read from Deal and Task timelines
// 2026-10-12. Shown to the agent before they confirm; never repeated by the form.
export const STAGE_AUTOMATIONS = {
  [STAGES.REMAINDER]:
    "CRM then emails the customer the Production Complete email, tags the Deal, stamps the production-complete date, creates the SALES: Order Fulfillment task and hands the Deal to the sales person.",
  [STAGES.NO_REMAINDER]:
    "CRM then emails the customer the Production Complete email, tags the Deal, stamps the production-complete date, creates the SALES: Order Fulfillment task and hands the Deal to the sales person.",
  [STAGES.NEED_SHIP]:
    "CRM then tags the Deal Needs Shipping, stamps the needs-shipping date and creates the ACCOUNT MANAGER: Ship Product(s) task.",
  [STAGES.SHIPPED]:
    "CRM then emails the customer the Shipping Confirmation email, tags the Deal, stamps the shipped date and creates the ACCOUNT MANAGER: Add Shipping Tracking Number task.",
  [STAGES.FAILED]:
    "CRM then stamps the failed-quality-check date and creates the SALES: Failed Quality Check Follow-Up task.",
};

const str = (v) => String(v == null ? "" : v).trim();
const has = (v) => str(v) !== "" && v !== false;
const NL = String.fromCharCode(10);

export const allApproved = (approvals) => APPROVALS.every((a) => !!approvals?.[a.key]);

/*
 * The Deal's open quality-check tasks. David: "contains Quality Check in task title". Measured
 * since 2026-08-15: "PRODUCTION MANAGER: Quality Check / ..." (266), "QUALITY CHECK" (82) -- and
 * "SALES: Failed Quality Check Follow-Up" (5), which holds the same words and must NOT be closed
 * by this form. A Deal can carry two open ones (it re-entered Quality Check); both are returned.
 */
export function isQcTask(task) {
  const s = str(task?.Subject).toLowerCase();
  if (!s.includes("quality check") || s.includes("failed")) return false;
  return !/^completed$/i.test(str(task?.Status));
}
export const openQcTasks = (tasks) => (tasks || []).filter((t) => t && t.id && isQcTask(t));

/*
 * What goes big on the label and at the top of the screen. The PO number is what people look for on
 * the shelf (it is on the green stickers). Online orders have no PO -- their own order number leads
 * the Deal name ("1000230 - Lori Weber - Online Order"), so that is shown instead, labelled as such.
 * Nothing is invented: with neither, `big` is empty and the Deal name is shown.
 */
export function dealIdentity(dealName, poNumber) {
  const name = str(dealName);
  const deal = /\bDeal\s*#?\s*(\d+)/i.exec(name);
  const online = /^\s*(\d{5,})\s*-/.exec(name);
  const dealNo = deal ? deal[1] : online ? "Online order" : name;
  if (has(poNumber)) return { bigLabel: "PO #", big: str(poNumber), dealNo };
  if (online) return { bigLabel: "ORDER #", big: online[1], dealNo };
  return { bigLabel: "", big: "", dealNo };
}

export const isRush = (deal) => !!deal?.Rush_Order || /^\s*RUSH\b/i.test(str(deal?.Deal_Name));

/*
 * The ship-to is ONE line on the Deal ("Addressee"). It is split ONLY on commas -- where a street
 * ends cannot be known from a line without them, and the form does not guess. The one safe extra:
 * a final "ST 12345" or "ST 12345-6789" piece is offered as State and ZIP separately.
 */
export function splitAddress(line) {
  const whole = str(line).replace(/\s+/g, " ");
  if (!whole) return { whole: "", parts: [] };
  if (!whole.includes(",")) return { whole, parts: [] };
  const pieces = whole.split(",").map((p) => p.trim()).filter(Boolean);
  const parts = [];
  pieces.forEach((p, i) => {
    const m = i === pieces.length - 1 ? /^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(p) : null;
    if (m) {
      parts.push({ label: "State", value: m[1].toUpperCase() });
      parts.push({ label: "ZIP", value: m[2] });
    } else {
      parts.push({ label: "Line " + (i + 1), value: p });
    }
  });
  return { whole, parts };
}

const int = (v) => {
  const n = parseInt(str(v).replace(/,/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/*
 * E-54 (David, 2026-10-13): the top of the form is "a snapshot of what the order should have on it" --
 * the print method per product, every garment / product with its graphics and placements, and the
 * notes that apply. Everything below reads the saved order (onboarding-form.json) the cards are built
 * from; nothing is invented, and an answer that was left blank gives no line.
 */
const yes = (v) => v === true || /^(yes|true)$/i.test(str(v));
const blankish = (v) => !has(v) || /^(n\/?a|none|no|false|-+)$/i.test(str(v)); // "NA", "None", "No" say nothing
const listed = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean).join(", ") : str(v));

/*
 * The heading a product sits under -- the print method, with the department in front when the two
 * differ ("Vinyl Department · Decals"). Uses printMath's own buckets, so it cannot disagree with how
 * the prints were counted.
 */
export function printMethodFor(p) {
  const name = str(p?.productName);
  if (p?.productType === "gangsheet") return VINYL_DEPT + " · DTF Gang Sheet";
  const dept = departmentFor(name, p?.productType);
  if (p?.productType === "garment") return !name || dept === name ? name || "Garments" : dept + " · " + name;
  if (dept === VINYL_DEPT) return VINYL_DEPT + " · " + name;
  return yes(p?.isOutsourced) ? "Outsourced · " + (name || "Product") : name || "Product";
}

// One graphic, as QC needs it: what it is, how many colors and which, the underbase, where it goes.
const graphicOf = (gr, placements, extra) => ({
  description: str(gr?.graphicDescription),
  colorCount: str(gr?.numberOfColorsUsed),
  colors: str(gr?.colorsUsed),
  placements: placements || [],
  facts: [
    !blankish(gr?.underbase) ? "Underbase: " + str(gr.underbase) : "",
    yes(gr?.colorChange) ? "Color change: Yes" : "",
    !blankish(gr?.fontsUsed) && !/^(idk|unknown|\?+)$/i.test(str(gr.fontsUsed)) ? "Fonts: " + str(gr.fontsUsed) : "",
    ...(extra || []),
  ].filter(Boolean),
});

/*
 * The physical things on the order, one line each -- what QC counts, and what a partial pickup is
 * chosen from. Garments by garment type; other products by the piece; gang sheets by the sheet.
 * Graphic-design-only and storefront products are not things on a shelf and give no line.
 * Since E-54 each line also carries its print method, its facts (SKU, sides, vendor ...) and its
 * callouts (the instructions typed against it) -- key, label, qty and sizes are what they were.
 */
export function orderLines(json) {
  const out = [];
  (json?.products || []).forEach((p, pi) => {
    if (!p) return;
    const method = printMethodFor(p);
    if (p.productType === "garment") {
      (p.primaryBranches || []).forEach((g, gi) => {
        if (!g || (!has(g.garmentType) && !has(g.garmentQuantity) && !has(g.countColorSize))) return;
        const skus = (g.garmentSkus || []).map((r) => str(r?.sku)).filter(Boolean).join(", ");
        const also = yes(g.isUsedInOtherAppTypes) ? listed(g.chooseApplicationType) : "";
        out.push({
          key: pi + "." + gi,
          product: str(p.productName),
          productType: "garment",
          method,
          label: str(g.garmentType).split(/\r?\n/).map((x) => x.trim()).filter(Boolean).join(" / ") || "Garment",
          qty: int(g.garmentQuantity),
          sizes: str(g.countColorSize),
          stylesUnmarked: stylesNotMarked(g), // E-57: several styles, sizes not tied to one

          special: str(g.specialInstructions),
          facts: [
            skus ? "SKU " + skus : "",
            yes(p.premiumIronPass) ? "Premium iron pass" : "",
            !blankish(g.vendorsUsed) ? "Vendor: " + str(g.vendorsUsed) : "",
          ].filter(Boolean),
          callouts: [
            also ? { label: "This garment ALSO gets", text: also } : null,
            has(g.specialInstructions) ? { label: "Special instructions", text: str(g.specialInstructions) } : null,
          ].filter(Boolean),
          placementAsked: true,
          graphics: (g.secondaryBranches || []).filter(Boolean).map((gr) =>
            graphicOf(
              gr,
              (gr.tartiaryBranches || [])
                .filter(Boolean)
                .map((pl) => [str(pl.placementLocation), str(pl.placementSize), str(pl.sizeAndDimensions), formatSizeVariants(pl.sizeVariants) ? "by garment size: " + formatSizeVariants(pl.sizeVariants) : ""].filter(Boolean).join(" · "))
                .filter(Boolean)
            )
          ),
        });
      });
    } else if (p.productType === "nongarment") {
      const sides = int(p.numberOfSides);
      // Both keys are labelled "Other Information" in the onboarding form (productionCards.pcNote).
      const notes = [str(p.otherInformation), str(p.specialInstructions)].filter((t, i, a) => t && a.indexOf(t) === i);
      out.push({
        key: String(pi),
        product: str(p.productName),
        productType: "nongarment",
        method,
        label: str(p.productName) || "Product",
        qty: int(p.quantityOrdered),
        sizes: str(p.dimensions),
        special: str(p.specialInstructions),
        facts: [
          sides ? sides + (sides === 1 ? " side" : " sides") : has(p.numberOfSides) ? "Sides: " + str(p.numberOfSides) : "",
          yes(p.isOutsourced) ? "Outsourced" : "Made in house",
          !blankish(p.vendorsUsed) && !/^in.?house$/i.test(str(p.vendorsUsed)) ? "Vendor: " + str(p.vendorsUsed) : "",
        ].filter(Boolean),
        callouts: notes.map((text) => ({ label: "Other information", text })),
        placementAsked: false, // the onboarding form asks placement for garments only
        graphics: (p.branches || []).filter(Boolean).map((gr) => graphicOf(gr, [])),
      });
    } else if (p.productType === "gangsheet") {
      const size = [str(p.gangSheetWidth), str(p.gangSheetHeight)].filter(Boolean).join(" × ");
      const notes = [str(p.otherInformation), str(p.specialInstructions)].filter((t, i, a) => t && a.indexOf(t) === i);
      out.push({
        key: String(pi),
        product: "DTF Gang Sheet",
        productType: "gangsheet",
        method,
        label: "DTF Gang Sheet",
        qty: int(p.numberOfGangSheets),
        sizes: size,
        special: str(p.otherInformation),
        facts: has(p.garmentColors) ? ["Goes on: " + str(p.garmentColors)] : [], // E-69
        callouts: notes.map((text) => ({ label: "Other information", text })),
        placementAsked: true, // "per sheet" stands in for placement
        graphics: (p.gangGraphics || []).filter(Boolean).map((gr) =>
          graphicOf(
            gr,
            has(gr.quantityPerSheet) ? [str(gr.quantityPerSheet) + " per sheet"] : [],
            has(gr.graphicWidth) && has(gr.graphicHeight) ? ["Size: " + str(gr.graphicWidth) + '" × ' + str(gr.graphicHeight) + '"'] : []
          )
        ),
      });
    }
  });
  return out;
}

/*
 * The snapshot: the same lines, grouped under their print method in the order the products were
 * entered. A garment product's own "other information" applies to every garment under that method,
 * so it sits on the group. Products with nothing to count (graphic design, a storefront) are named
 * at the foot so the list is the whole order.
 */
export function orderSnapshot(json) {
  const groups = [];
  const byMethod = {};
  const groupFor = (method) => {
    if (!byMethod[method]) {
      byMethod[method] = { method, lines: [], notes: [] };
      groups.push(byMethod[method]);
    }
    return byMethod[method];
  };
  const lines = orderLines(json);
  (json?.products || []).forEach((p, pi) => {
    if (!p) return;
    const mine = lines.filter((l) => l.key === String(pi) || l.key.startsWith(pi + "."));
    const note = p.productType === "garment" ? str(p.otherInformation) : "";
    if (!mine.length && !note) return;
    const g = groupFor(printMethodFor(p));
    g.lines.push(...mine);
    if (note && !g.notes.includes(note)) g.notes.push(note);
  });
  const alsoOnOrder = (json?.products || [])
    .filter((p) => p && (p.productType === "graphic" || p.productType === "onlinestorefront"))
    .map((p) => str(p.productName) || (p.productType === "graphic" ? "Graphic Design" : "Online Storefront"));
  return { groups, alsoOnOrder };
}

/*
 * "The critical parts of the notes" (quality-check/03 section 3) -- a read-only list, in the order
 * QC needs them. Only what has text is returned; the full note stays one click away on the Deal.
 */
export function criticalNotes(json, deal, accountNotes, opts) {
  const out = [];
  const placed = !!opts?.skipPlaced; // E-54: the snapshot shows these against their own product
  const add = (title, text, tone) => {
    if (has(text)) out.push({ title, text: str(text), tone: tone || "info" });
  };
  add("Customer notes (apply to every order for this account)", accountNotes || deal?.Customer_Notes, "warn");
  add("Special instructions", json?.specialInstructions, "warn");
  (json?.products || []).forEach((p) => {
    if (!p) return;
    if (placed && ["garment", "nongarment", "gangsheet"].includes(p.productType)) return;
    const name = str(p.productName) || "Product";
    add(name + " — other information", p.otherInformation, "warn");
    if (p.productType !== "garment") add(name + " — special instructions", p.specialInstructions, "warn");
  });
  add("Supplies / materials needed", json?.suppliesMaterialsNeeded);
  if (json?.doProductsNeedShipped === "Yes") {
    add("This order ships — shipping contact / address typed at onboarding", json?.shippingContactAddress || "(no address typed)");
    add("Other shipping details", json?.otherShippingDetails);
  }
  const am = json?._amendment;
  if (am && (has(am.story) || (am.changes || []).length)) {
    const lines = (am.changes || []).map((c) => "• " + str(c));
    if (has(am.story)) lines.push(str(am.story));
    add("What changed — this order was amended" + (has(am.amendedAt) ? " " + str(am.amendedAt) : ""), lines.join(NL), "warn");
  } else {
    add("What changed — this order was amended", deal?.Onboarding_Update_Results, "warn");
  }
  add(
    "Previous revision on this deal — re-check what failed before" + (deal?.Revision_Count ? " (" + deal.Revision_Count + ")" : ""),
    deal?.Revision_Details,
    "warn"
  );
  add(
    "Previous correction on this deal — re-check what failed before" + (deal?.Correction_Count ? " (" + deal.Correction_Count + ")" : ""),
    deal?.Correction_Details,
    "warn"
  );
  add("Missing garments", deal?.Missing_Garments, "warn");
  add("Already released for partial pickup", deal?.Partial_Ready_Details, "warn");
  add("Partial pickup — the customer already took", deal?.Partial_Pick_Up_Details, "warn");
  return out;
}

/* Every line starts ready (in the real cases nearly everything was) -- the agent adjusts what is not. */
export const startPartialLines = (lines) =>
  (lines || []).map((l) => ({ key: l.key, label: l.label, qty: l.qty, ready: true, readyQty: l.qty }));

const clampReady = (l) => {
  if (!l.ready) return 0;
  if (l.qty == null) return null; // quantity unknown: ready or held as a whole
  const n = int(l.readyQty);
  return n == null ? 0 : Math.min(n, l.qty);
};

/*
 * The dated READY / HELD line written to Partial_Ready_Details, e.g.
 *   [2026-10-12] READY: Hoodies 23 of 24 · Hats 24 of 24. HELD: Hoodies 1. Notes: all but the 2XL
 */
export function buildPartialEntry({ lines, notes, dateStr }) {
  const ready = [];
  const held = [];
  (lines || []).forEach((l) => {
    const r = clampReady(l);
    if (l.qty == null) {
      (l.ready ? ready : held).push(l.label);
      return;
    }
    if (r > 0) ready.push(l.label + " " + r + " of " + l.qty);
    if (r < l.qty) held.push(l.label + " " + (l.qty - r));
  });
  let text = "[" + dateStr + "] READY: " + (ready.length ? ready.join(" · ") : (lines || []).length ? "nothing listed" : "see notes") + ".";
  if (held.length) text += " HELD: " + held.join(" · ") + ".";
  if (has(notes)) text += " Notes: " + str(notes);
  return text;
}
export const partialHasSomethingReady = ({ lines, notes }) =>
  (lines || []).some((l) => (l.qty == null ? l.ready : clampReady(l) > 0)) || has(notes);

/* Append, never replace (D-23): the earlier text is kept verbatim, the new entry goes underneath. */
export function appendDated(existing, entry) {
  const old = String(existing == null ? "" : existing).replace(/\s+$/, "");
  return old ? old + NL + NL + entry : entry;
}

/*
 * Which stage a result leads to. School and advertiser deals have their own stage families and
 * which of those mean "passed" has never been measured -- so the form does not guess: it saves
 * everything else and tells the person to move the stage by hand.
 * Returns { move: true, stage } or { move: false, reason: "family" | "already" | "undecided", stage? }.
 */
export function targetStage({ result, remainderDue, hasTracking, currentStage }) {
  const cur = str(currentStage);
  let stage = null;
  if (result === RESULTS.PART) return { move: false, reason: "part" };
  if (result === RESULTS.FAILED) stage = STAGES.FAILED;
  else if (result === RESULTS.SHIP) stage = hasTracking ? STAGES.SHIPPED : STAGES.NEED_SHIP;
  else if (result === RESULTS.PICKUP) {
    if (remainderDue !== true && remainderDue !== false) return { move: false, reason: "undecided" };
    stage = remainderDue ? STAGES.REMAINDER : STAGES.NO_REMAINDER;
  } else return { move: false, reason: "undecided" };
  if (/^(SCHOOL|ADVERTISER)/i.test(cur)) return { move: false, reason: "family", stage };
  // Zoho fires nothing when a field is "updated" to the value it already holds (docs/08).
  if (cur === stage) return { move: false, reason: "already", stage };
  return { move: true, stage };
}

/* An online order: no PO, its own order number leads the name. Measured 2026-10-12 on five of them:
   none has an invoice in Zoho Books, so the form must not send the agent there to look for one. */
export const isOnlineOrder = (deal) => !has(deal?.PO_Number) && /^\s*\d{5,}\s*-/.test(str(deal?.Deal_Name));

/*
 * The Deal's Books invoice, as the CRM function WIDGET_Get_Deal_Invoices returns it (Deluge thread,
 * zoho-deluge/docs/16). The form may only DECIDE "remainder due / paid in full" from it when there
 * is exactly one invoice, it has been issued, and its balance is a number. Anything else -- no
 * invoice (every online order), several, a draft, a void, a failed call, a function that is not
 * installed yet -- is "ask the agent", with the reason shown. The form never guesses about money.
 *
 * `raw` is whatever ZOHO.CRM.FUNCTIONS.execute resolved to: the answer is a JSON STRING at
 * details.output. Returns { state, decided, remainderDue, invoice, invoices, reason }.
 */
export const INVOICE_FUNCTION = "WIDGET_Get_Deal_Invoices";
const money = (n) => (Number.isFinite(n) ? "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "$?");
export const invoiceLine = (inv) =>
  [str(inv?.number), str(inv?.status).replace(/_/g, " "), "total " + money(inv?.total), "balance " + money(inv?.balance)].filter(Boolean).join(" · ");

// A missing balance must never read as 0 ("paid in full") -- Number(null) is 0, so guard it.
const amount = (v) => (v === null || v === undefined || String(v).trim() === "" ? NaN : Number(v));

export function readInvoiceAnswer(raw) {
  const ask = (state, reason, invoices) => ({ state, decided: false, remainderDue: null, invoice: null, invoices: invoices || [], reason });
  let out = raw?.details?.output ?? raw?.output ?? raw;
  if (typeof out === "string") {
    try {
      out = JSON.parse(out);
    } catch (e) {
      return ask("error", "The invoice could not be read (the answer was not understood).");
    }
  }
  if (!out || typeof out !== "object" || out.status !== "ok" || !Array.isArray(out.invoices))
    return ask("error", "The invoice could not be read" + (has(out?.message) ? " (" + str(out.message) + ")" : "") + ".");
  const invoices = out.invoices.filter(Boolean).map((i) => ({
    number: str(i.number),
    status: str(i.status).toLowerCase(),
    total: amount(i.total),
    balance: amount(i.balance),
    lineItemsLoaded: i.line_items_loaded !== false,
    lineItems: (Array.isArray(i.line_items) ? i.line_items : []).filter(Boolean).map((l) => ({ name: str(l.name), description: str(l.description), quantity: l.quantity })),
  }));
  if (!invoices.length) return ask("none", "No invoice in Zoho Books is linked to this Deal.");
  if (invoices.length > 1) return ask("several", "This Deal has " + invoices.length + " invoices in Zoho Books — check which one applies.", invoices);
  const inv = invoices[0];
  const one = (state, reason) => ({ ...ask(state, reason, invoices), invoice: inv });
  if (inv.status === "draft") return one("draft", "The invoice is still a draft (never sent), so its balance says nothing about payment.");
  if (inv.status === "void") return one("void", "The invoice is void.");
  if (!Number.isFinite(inv.balance)) return one("error", "The invoice's balance could not be read.");
  return { state: "one", decided: true, remainderDue: inv.balance > 0, invoice: inv, invoices, reason: "" };
}

/* A Deal already waiting to ship passed QC earlier: the form is then only for adding the tracking. */
export const isShipOnly = (deal) => str(deal?.Stage) === STAGES.NEED_SHIP;

/* What stops a submit, in the agent's words. Empty = ready. */
export function problems(state, ctx) {
  const out = [];
  const shipOnly = isShipOnly(ctx?.deal);
  if (shipOnly) {
    if (!has(state.trackingNumber)) out.push("Enter the tracking number.");
    return out;
  }
  if (!state.result) return ["Choose the result."];
  if (state.result === RESULTS.PART) {
    if (!partialHasSomethingReady({ lines: state.partialLines, notes: state.partialNotes })) out.push("Mark what is ready now.");
    if (!(int(state.boxes) >= 1)) out.push("Enter how many boxes.");
    return out;
  }
  const passed = state.result !== RESULTS.FAILED;
  if (passed && !allApproved(state.approvals)) out.push("Tick all the approvals — or choose Failed.");
  if (state.result === RESULTS.PICKUP && state.remainderDue !== true && state.remainderDue !== false)
    out.push("Answer: is a remainder due on the invoice?");
  const needsBoxes = passed || state.partial === "yes";
  if (needsBoxes && !(int(state.boxes) >= 1)) out.push("Enter how many boxes.");
  if (state.result === RESULTS.FAILED) {
    if (state.partial !== "yes" && state.partial !== "no") out.push("Answer: is part of this order ready for the customer now?");
    if (state.partial === "yes" && !partialHasSomethingReady({ lines: state.partialLines, notes: state.partialNotes }))
      out.push("Nothing is marked ready — mark what is ready, or answer No.");
  }
  return out;
}

/*
 * THE PLAN: every write the form will make, in order, plus the same thing in plain words.
 *   ctx   = { deal, tasks, dateStr, who, invoice }   (invoice = readInvoiceAnswer(...) or undefined)
 *   state = { approvals, result, remainderDue, remainderSource ("invoice" | "agent"), boxes, addressee, trackingNumber, trackingUrl,
 *             partial ("yes" | "no"), partialLines, partialNotes, notes }
 */
export function buildPlan(state, ctx) {
  const deal = ctx?.deal || {};
  const shipOnly = isShipOnly(deal);
  const result = shipOnly ? RESULTS.SHIP : state.result;
  const hasTracking = has(state.trackingNumber);
  const fields = {};
  const summary = [];

  if (result === RESULTS.SHIP) {
    const addr = str(state.addressee);
    if (addr && addr !== str(deal.Addressee)) {
      fields.Addressee = addr;
      summary.push(
        has(deal.Addressee) ? "Change the Deal's Addressee to: " + addr + " (was: " + str(deal.Addressee) + ")" : "Save the ship-to on the Deal (Addressee): " + addr
      );
    }
    if (hasTracking) {
      fields.Tracking_Number = str(state.trackingNumber);
      fields.Tracking_URL = str(state.trackingUrl) || DEFAULT_TRACKING_URL;
      fields.Shipped = true;
      summary.push("Save tracking number " + fields.Tracking_Number + " and the tracking link, and tick Shipped.");
    } else if (shipOnly) {
      summary.push("Enter the tracking number — saving it is what marks this order shipped.");
    } else {
      summary.push("No tracking number yet — the Deal waits in " + STAGES.NEED_SHIP + ". Open this form again to add it.");
    }
  }

  let partialEntry = "";
  if ((result === RESULTS.FAILED && state.partial === "yes") || result === RESULTS.PART) {
    partialEntry = buildPartialEntry({ lines: state.partialLines, notes: state.partialNotes, dateStr: ctx.dateStr });
    fields.Partial_Pick_Up_Ready = true;
    fields.Partial_Ready_Details = appendDated(deal.Partial_Ready_Details, partialEntry);
    fields.Partial_Ready_Date = ctx.dateStr;
    summary.push("Tick Partial Pick-Up Ready on the Deal and record what is ready: " + partialEntry);
  }

  // Deluge thread, 2026-10-12 (zoho-deluge/docs/16): the failed-QC sales task reads this box, so a
  // tick left over from an earlier check must not survive a check that releases nothing new. The
  // Details and the Date stay -- they are the record (quality-check/04 section 2b).
  const releasing = (result === RESULTS.FAILED && state.partial === "yes") || result === RESULTS.PART;
  const settled = result === RESULTS.PICKUP || result === RESULTS.SHIP || (result === RESULTS.FAILED && state.partial === "no");
  if (!shipOnly && !releasing && settled && deal.Partial_Pick_Up_Ready === true) {
    fields.Partial_Pick_Up_Ready = false;
    summary.push("Un-tick Partial Pick-Up Ready — this check releases nothing new. What was released before stays written on the Deal.");
  }

  summary.push("Add a “" + QC_NOTE_TITLE + "” note to the Deal recording this check.");

  // A check was done whatever its result, so its task is closed on Failed too -- left open, the
  // Deal collects a second one when it comes back to Quality Check (seen on real deals).
  const closeTasks = shipOnly || result === RESULTS.PART ? [] : openQcTasks(ctx?.tasks);
  if (result === RESULTS.PART) {
    summary.push("Leave the Quality Check task open: the rest of the order still comes back here.");
  } else if (!shipOnly) {
    summary.push(
      closeTasks.length
        ? "Complete the open Quality Check task" + (closeTasks.length > 1 ? "s (" + closeTasks.length + ")" : "") + "."
        : "No open Quality Check task was found on this Deal — nothing to complete."
    );
  }

  const stage = targetStage({ result, remainderDue: state.remainderDue, hasTracking, currentStage: deal.Stage });
  if (stage.move) summary.push("Move the Deal to “" + stage.stage + "”. " + (STAGE_AUTOMATIONS[stage.stage] || ""));
  else if (stage.reason === "family")
    summary.push("This is a school / advertiser deal (stage “" + str(deal.Stage) + "”). The form will NOT move the stage — move it by hand after saving.");
  else if (stage.reason === "already")
    summary.push("The Deal is already in “" + stage.stage + "”, so the stage is not moved and CRM's stage automations do not run again.");
  else if (stage.reason === "part") summary.push("The Deal stays in Quality Check. Nothing is marked as failed.");

  // E-82: the sales person is told what is ready (the stage does not move, so no stage automation would do it).
  const salesTask =
    result === RESULTS.PART
      ? {
          subject: PART_TASK_SUBJECT,
          description: "Part of this order is ready for the customer: " + partialEntry + (has(ctx?.who) ? " (checked by " + str(ctx.who) + ")" : ""),
        }
      : null;
  if (salesTask) summary.push("Make a task for the Deal's Sales Person to tell the customer what is ready.");

  if (result === RESULTS.FAILED)
    summary.push("Then: mark the issues with the red stickers, and file the Revision / Correction form from the Deal — it records what failed and moves the Deal on.");

  const note = buildQcNote(state, ctx, { result, shipOnly, stage, partialEntry, closeTasks });
  return { result, shipOnly, fields, closeTasks, stage, note, summary, partialEntry, salesTask };
}

export const PART_TASK_SUBJECT = "SALES: Partial Pick-Up Ready / VENTAS: Recogida parcial lista";
/* The task's owner: the Deal's Sales Person when that name is an active user, else the Deal owner (as Deluge's sales tasks do). */
export function salesOwnerId(deal, users) {
  const name = str(deal?.Sales_Person).trim().toLowerCase();
  const u = name ? (users || []).find((x) => str(x.full_name).trim().toLowerCase() === name) : null;
  return u ? str(u.id) : str(deal?.Owner?.id);
}

/*
 * E-82 (David 10-29): recording what the customer picked up, by whoever hands it over. Lines = startPartialLines-style rows where
 * `ready` / `readyQty` mean "picked up". Appends a dated PICKED UP line to Partial_Pick_Up_Details, ticks Partial_Pick_Up, and clears
 * Partial_Pick_Up_Ready when nothing is left waiting. Returns { problems, fields, entry, note }.
 */
export function buildPickupPlan({ lines, notes, stillWaiting, deal, dateStr, who }) {
  const picked = [];
  (lines || []).forEach((l) => {
    const r = clampReady(l);
    if (l.qty == null ? l.ready : r > 0) picked.push(l.qty == null ? l.label : l.label + " " + r);
  });
  const problems = [];
  if (!picked.length && !has(notes)) problems.push("Tick what the customer took (or describe it).");
  if (stillWaiting !== "yes" && stillWaiting !== "no") problems.push("Answer: is anything from this order still waiting for pickup?");
  let entry = "[" + dateStr + "] PICKED UP: " + (picked.length ? picked.join(" · ") : "see notes") + ".";
  if (has(notes)) entry += " Notes: " + str(notes);
  if (has(who)) entry += " (handed over by " + str(who) + ")";
  const fields = { Partial_Pick_Up: true, Partial_Pick_Up_Details: appendDated(deal?.Partial_Pick_Up_Details, entry) };
  if (stillWaiting === "no") fields.Partial_Pick_Up_Ready = false;
  const note = ["Result: PARTIAL PICK-UP RECORDED", "Recorded: " + dateStr + (has(who) ? " by " + str(who) : ""), "", entry, "", "Still waiting for pickup: " + (stillWaiting === "yes" ? "Yes" : "No")].join(NL);
  return { problems, fields, entry, note };
}

const RESULT_WORDS = {
  [RESULTS.PICKUP]: "PASSED — pickup",
  [RESULTS.SHIP]: "PASSED — needs shipping",
  [RESULTS.FAILED]: "FAILED",
  [RESULTS.PART]: "PART READY - the rest is still in production",
};

/* The Deal note: the only place that records WHO checked, what they ticked and how many boxes. */
export function buildQcNote(state, ctx, plan) {
  const L = [];
  if (plan.shipOnly) L.push("Result: TRACKING ADDED (the order passed quality check earlier)");
  else L.push("Result: " + (RESULT_WORDS[plan.result] || ""));
  L.push("Checked: " + ctx.dateStr + (has(ctx.who) ? " by " + str(ctx.who) : ""));
  if (!plan.shipOnly) {
    L.push("");
    L.push("Approvals:");
    APPROVALS.forEach((a) => L.push((state.approvals?.[a.key] ? "[x] " : "[ ] ") + a.label));
  }
  const extra = [];
  if (plan.result === RESULTS.PICKUP) {
    const inv = ctx.invoice;
    const facts = inv?.invoice ? invoiceLine(inv.invoice) : "";
    const fromInvoice = inv?.decided && state.remainderSource === "invoice" && inv.remainderDue === state.remainderDue;
    extra.push(
      "Remainder due on the invoice: " +
        (state.remainderDue ? "Yes" : "No") +
        (fromInvoice
          ? " (read from the invoice: " + facts + ")"
          : " (answered by the agent" + (inv?.decided ? "; the invoice read: " + facts : inv?.reason ? "; " + inv.reason : "") + ")")
    );
  }
  if (int(state.boxes) >= 1 && (plan.result !== RESULTS.FAILED || state.partial === "yes")) extra.push("Boxes: " + int(state.boxes) + (plan.result === RESULTS.PART ? " (the ready part)" : ""));
  if (plan.result === RESULTS.SHIP) {
    if (has(state.addressee)) extra.push("Ship to: " + str(state.addressee));
    extra.push(has(state.trackingNumber) ? "Tracking: " + str(state.trackingNumber) : "Tracking: not entered yet");
  }
  if (plan.result === RESULTS.FAILED) extra.push("Part ready for the customer now: " + (state.partial === "yes" ? "Yes" : "No"));
  if (plan.partialEntry) extra.push(plan.partialEntry);
  if (has(state.notes)) extra.push("Notes: " + str(state.notes));
  if (extra.length) L.push("", ...extra);
  L.push("");
  if (plan.stage.move) L.push("Stage the form then moves the Deal to: " + plan.stage.stage + " (from " + str(ctx.deal?.Stage) + ")");
  else if (plan.stage.reason === "family") L.push("Stage NOT moved by the form (school / advertiser deal) — to be moved by hand.");
  else if (plan.stage.reason === "already") L.push("Stage left as it was: " + plan.stage.stage);
  else if (plan.stage.reason === "part") L.push("Stage left in Quality Check: the rest of the order is still in production.");
  return L.join(NL);
}
