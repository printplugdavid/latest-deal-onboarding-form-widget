import {
  APPROVALS,
  RESULTS,
  STAGES,
  DEFAULT_TRACKING_URL,
  allApproved,
  appendDated,
  buildPartialEntry,
  buildPlan,
  criticalNotes,
  dealIdentity,
  isOnlineOrder,
  isQcTask,
  isRush,
  openQcTasks,
  orderLines,
  orderSnapshot,
  printMethodFor,
  problems,
  readInvoiceAnswer,
  splitAddress,
  startPartialLines,
  targetStage,
  buildPickupPlan,
  salesOwnerId,
  PART_TASK_SUBJECT,
} from "./qcRules";
import { LABEL_KINDS, MAX_BOXES, boxCount, buildLabelHtml } from "./qcLabel";

// The shape of a real saved order (fixtures/onboarding-form-HaileyAI-2026-07.json), without the
// client's contact details.
const fixture = {
  products: [
    {
      productName: "Embroidery",
      productType: "garment",
      numberOfGarmentTypes: "1",
      otherInformation: "",
      primaryBranches: [
        {
          garmentType: "Nike Polo NKDC1963",
          countColorSize: "NKDC1963 Black 1 Extra Large",
          numberOfGraphics: "1",
          garmentQuantity: "1",
          specialInstructions: "",
          secondaryBranches: [
            {
              graphicDescription: "Symbol with the two stars we have on file",
              numberOfColorsUsed: "1",
              colorsUsed: "White",
              tartiaryBranches: [{ placementLocation: "Left Chest", sizeAndDimensions: "2x2", placementSize: "Small" }],
            },
          ],
        },
      ],
    },
  ],
  specialInstructions: "",
  suppliesMaterialsNeeded: "",
  doProductsNeedShipped: "No",
  hardDueDate: "",
};

const ALL = Object.fromEntries(APPROVALS.map((a) => [a.key, true]));
const QC_TASK = { id: "t1", Subject: "PRODUCTION MANAGER: Quality Check / GERENTE DE PRODUCCIÓN: Control de calidad", Status: "Not Started" };
const DEAL = { id: "1", Deal_Name: "Deal 8 - H & S Company LLC - Screen Print", Stage: "Quality Check", PO_Number: "4291" };
const ctx = (over) => ({ deal: DEAL, tasks: [QC_TASK], dateStr: "2026-10-12", who: "Drew Byrd", ...over });

describe("E-52 which tasks are quality-check tasks", () => {
  test("the two real subjects, open", () => {
    expect(isQcTask(QC_TASK)).toBe(true);
    expect(isQcTask({ Subject: "QUALITY CHECK", Status: "In Progress" })).toBe(true);
  });
  test("the sales follow-up holds the same words and is never closed by a check", () => {
    expect(isQcTask({ Subject: "SALES: Failed Quality Check Follow-Up / VENTAS: Seguimiento de control de calidad fallido", Status: "Not Started" })).toBe(false);
  });
  test("a completed task and an unrelated task are left alone", () => {
    expect(isQcTask({ ...QC_TASK, Status: "Completed" })).toBe(false);
    expect(isQcTask({ Subject: "EMBROIDERY: Produce Order", Status: "Not Started" })).toBe(false);
  });
  test("a deal that re-entered Quality Check has two open ones -- both are returned", () => {
    expect(openQcTasks([QC_TASK, { ...QC_TASK, id: "t2" }, { ...QC_TASK, id: "t3", Status: "Completed" }, { Subject: "x", id: "t4" }]).map((t) => t.id)).toEqual(["t1", "t2"]);
  });
});

describe("E-52 what goes big on the label", () => {
  test("PO number, and the deal number parsed from the name", () => {
    expect(dealIdentity("Deal 8 - H & S Company LLC - Screen Print - Vests", "4291")).toEqual({ bigLabel: "PO #", big: "4291", dealNo: "8" });
    expect(dealIdentity("RUSH - Deal 3 - Eagle Tranz LLC - Vinyl - Decals", "4453").dealNo).toBe("3");
    expect(dealIdentity("RUSH - Deal 4- Mike Crowley - DTG Shirts", "4473").dealNo).toBe("4");
  });
  test("an online order has no PO: its own order number is shown, labelled as such", () => {
    expect(dealIdentity("1000230 - Lori Weber - Online Order", null)).toEqual({ bigLabel: "ORDER #", big: "1000230", dealNo: "Online order" });
  });
  test("neither: nothing is invented, the whole name stands in for the deal number", () => {
    expect(dealIdentity("test", null)).toEqual({ bigLabel: "", big: "", dealNo: "test" });
  });
  test("an online order is told from its name, and only when it has no PO", () => {
    expect(isOnlineOrder({ Deal_Name: "1000230 - Lori Weber - Online Order", PO_Number: null })).toBe(true);
    expect(isOnlineOrder({ Deal_Name: "Deal 8 - H & S Company LLC", PO_Number: "4291" })).toBe(false);
    expect(isOnlineOrder({ Deal_Name: "test" })).toBe(false);
  });
  test("rush from the field or from the name", () => {
    expect(isRush({ Rush_Order: true, Deal_Name: "Deal 1" })).toBe(true);
    expect(isRush({ Deal_Name: "RUSH - Deal 1 - Jeb Shippy" })).toBe(true);
    expect(isRush({ Deal_Name: "Deal 1 - Rushmore Co" })).toBe(false);
  });
});

describe("E-52 the ship-to is split on commas only", () => {
  test("real addressee with commas: each piece, and the last piece as state + zip", () => {
    const a = splitAddress("Willians Cruz, POWER TRANSPORTATION WB INC, 48 ALEXANDER ST, WILKES BARRE, PA 18702-3711");
    expect(a.parts.map((p) => p.value)).toEqual(["Willians Cruz", "POWER TRANSPORTATION WB INC", "48 ALEXANDER ST", "WILKES BARRE", "PA", "18702-3711"]);
    expect(a.parts.slice(-2).map((p) => p.label)).toEqual(["State", "ZIP"]);
  });
  test("no commas: one line, never guessed apart", () => {
    const a = splitAddress("Heidi Flores 1295 N TIMATHY LN BOISE ID 83713-7971");
    expect(a.parts).toEqual([]);
    expect(a.whole).toBe("Heidi Flores 1295 N TIMATHY LN BOISE ID 83713-7971");
  });
  test("a last piece that is not state + zip stays whole; blank is blank", () => {
    expect(splitAddress("Grayson Long, 5315 county rd, Pill campbell").parts.map((p) => p.label)).toEqual(["Line 1", "Line 2", "Line 3"]);
    expect(splitAddress("  ")).toEqual({ whole: "", parts: [] });
    expect(splitAddress(null)).toEqual({ whole: "", parts: [] });
  });
});

describe("E-52 the order's lines", () => {
  test("the real fixture: one garment type with its quantity, sizes, graphic and placement", () => {
    const l = orderLines(fixture);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ key: "0.0", product: "Embroidery", label: "Nike Polo NKDC1963", qty: 1, sizes: "NKDC1963 Black 1 Extra Large" });
    expect(l[0].graphics[0].colors).toBe("White");
    expect(l[0].graphics[0].placements[0]).toBe("Left Chest · Small · 2x2");
  });
  test("non-garment by the piece, gang sheets by the sheet, design-only products give no line", () => {
    const l = orderLines({
      products: [
        { productType: "nongarment", productName: "Stickers", quantityOrdered: "1,500", dimensions: "3x3", branches: [{ graphicDescription: "Logo" }] },
        { productType: "gangsheet", productName: "DTF Gang Sheet", numberOfGangSheets: "4", gangSheetWidth: "22", gangSheetHeight: "60", gangGraphics: [{ graphicDescription: "A", quantityPerSheet: "12" }] },
        { productType: "graphic", productName: "Graphic Design" },
        { productType: "onlinestorefront", productName: "Online Storefront" },
        null,
      ],
    });
    expect(l.map((x) => [x.label, x.qty])).toEqual([["Stickers", 1500], ["DTF Gang Sheet", 4]]);
    expect(l[1].sizes).toBe("22 × 60");
    expect(l[1].graphics[0].placements).toEqual(["12 per sheet"]);
  });
  test("a typed quantity that is not a number is unknown, not zero", () => {
    expect(orderLines({ products: [{ productType: "garment", primaryBranches: [{ garmentType: "Hats", garmentQuantity: "a dozen" }] }] })[0].qty).toBe(null);
    expect(orderLines(null)).toEqual([]);
  });
});

describe("E-52 the critical notes", () => {
  test("only what has text, customer notes first", () => {
    const n = criticalNotes(
      { specialInstructions: "Fold, do not bag", doProductsNeedShipped: "Yes", shippingContactAddress: "1 Main St", _amendment: { amendedAt: "2026-10-06", changes: ["Hats 24 -> 30"], story: "customer added six" } },
      { Customer_Notes: "old copy", Revision_Count: 1, Revision_Details: "Item 1 · Embroidery", Partial_Ready_Details: "[2026-10-01] READY: Hats 24 of 24." },
      "Does not want crooked designs"
    );
    expect(n.map((x) => x.title.split(" — ")[0].split(" (")[0])).toEqual([
      "Customer notes",
      "Special instructions",
      "This order ships",
      "What changed",
      "Previous revision on this deal",
      "Already released for partial pickup",
    ]);
    expect(n[0].text).toBe("Does not want crooked designs"); // the Account's text wins over the Deal's copy
    expect(n[3].text).toBe("• Hats 24 -> 30\ncustomer added six");
  });
  test("nothing to show is an empty list", () => {
    expect(criticalNotes(fixture, {}, "")).toEqual([]);
    expect(criticalNotes(null, {}, "")).toEqual([]);
  });
});

describe("E-52 which stage a result leads to", () => {
  const t = (o) => targetStage({ currentStage: "Quality Check", ...o });
  test("pickup follows the remainder answer -- and never moves without one", () => {
    expect(t({ result: RESULTS.PICKUP, remainderDue: true })).toEqual({ move: true, stage: "Production Complete - Remainder Due" });
    expect(t({ result: RESULTS.PICKUP, remainderDue: false })).toEqual({ move: true, stage: "Production Complete - No Remainder" });
    expect(t({ result: RESULTS.PICKUP, remainderDue: null })).toEqual({ move: false, reason: "undecided" });
  });
  test("shipping: waits without tracking, shipped with it", () => {
    expect(t({ result: RESULTS.SHIP, hasTracking: false }).stage).toBe("Products Need Shipping");
    expect(t({ result: RESULTS.SHIP, hasTracking: true }).stage).toBe("Products Shipped");
  });
  test("failed", () => expect(t({ result: RESULTS.FAILED })).toEqual({ move: true, stage: "Failed Quality Check" }));
  test("a stage the Deal is already in is not 'moved' (Zoho would fire nothing)", () => {
    expect(targetStage({ result: RESULTS.FAILED, currentStage: "Failed Quality Check" })).toEqual({ move: false, reason: "already", stage: "Failed Quality Check" });
  });
  test("school / advertiser deals are never guessed", () => {
    expect(targetStage({ result: RESULTS.PICKUP, remainderDue: false, currentStage: "SCHOOL: Quality Check" }).move).toBe(false);
    expect(targetStage({ result: RESULTS.SHIP, hasTracking: true, currentStage: "ADVERTISER: Commitment Made" }).reason).toBe("family");
    expect(targetStage({ result: RESULTS.FAILED, currentStage: "SCHOOL/ ADVERTISER something" }).reason).toBe("family");
  });
  test("no result is no move", () => expect(t({ result: "" }).move).toBe(false));
});

describe("E-52 partial pickup record", () => {
  const lines = [
    { key: "0.0", label: "Hoodies", qty: 24, ready: true, readyQty: 23 },
    { key: "0.1", label: "Hats", qty: 24, ready: true, readyQty: 24 },
    { key: "1", label: "Polos", qty: 10, ready: false, readyQty: 10 },
  ];
  test("every line starts ready", () => {
    expect(startPartialLines([{ key: "a", label: "Hats", qty: 24 }, { key: "b", label: "Signs", qty: null }])).toEqual([
      { key: "a", label: "Hats", qty: 24, ready: true, readyQty: 24 },
      { key: "b", label: "Signs", qty: null, ready: true, readyQty: null },
    ]);
  });
  test("the dated READY / HELD line", () => {
    expect(buildPartialEntry({ lines, notes: " all but one 2XL ", dateStr: "2026-10-12" })).toBe(
      "[2026-10-12] READY: Hoodies 23 of 24 · Hats 24 of 24. HELD: Hoodies 1 · Polos 10. Notes: all but one 2XL"
    );
  });
  test("a ready quantity above the order is capped; blank is zero; unknown quantities go whole", () => {
    expect(
      buildPartialEntry({
        lines: [
          { label: "Hats", qty: 5, ready: true, readyQty: "9" },
          { label: "Mugs", qty: 5, ready: true, readyQty: "" },
          { label: "Signs", qty: null, ready: true },
          { label: "Flags", qty: null, ready: false },
        ],
        notes: "",
        dateStr: "2026-10-12",
      })
    ).toBe("[2026-10-12] READY: Hats 5 of 5 · Signs. HELD: Mugs 5 · Flags.");
  });
  test("no order lines: the notes carry it", () => {
    expect(buildPartialEntry({ lines: [], notes: "the decals", dateStr: "2026-10-12" })).toBe("[2026-10-12] READY: see notes. Notes: the decals");
  });
  test("appended under the earlier text, which is kept verbatim (D-23)", () => {
    expect(appendDated("[2026-10-01] READY: Hats 24 of 24.\n", "[2026-10-12] READY: Polos 10 of 10.")).toBe(
      "[2026-10-01] READY: Hats 24 of 24.\n\n[2026-10-12] READY: Polos 10 of 10."
    );
    expect(appendDated(null, "x")).toBe("x");
  });
});

describe("E-52 what stops a submit", () => {
  const base = { approvals: ALL, result: RESULTS.PICKUP, remainderDue: false, boxes: "2" };
  test("a complete pickup has no problems", () => expect(problems(base, ctx())).toEqual([]));
  test("no result; a missing approval; no remainder answer; no boxes", () => {
    expect(problems({ approvals: ALL }, ctx())).toEqual(["Choose the result."]);
    expect(problems({ ...base, approvals: { ...ALL, quality: false } }, ctx())[0]).toMatch(/Tick all the approvals/);
    expect(problems({ ...base, remainderDue: null }, ctx())[0]).toMatch(/remainder due/);
    expect(problems({ ...base, boxes: "0" }, ctx())).toEqual(["Enter how many boxes."]);
  });
  test("failed needs no approvals and no boxes -- only the partial answer", () => {
    expect(problems({ approvals: {}, result: RESULTS.FAILED }, ctx())[0]).toMatch(/part of this order ready/);
    expect(problems({ approvals: {}, result: RESULTS.FAILED, partial: "no" }, ctx())).toEqual([]);
  });
  test("failed with part ready needs boxes and something actually ready", () => {
    const s = { approvals: {}, result: RESULTS.FAILED, partial: "yes", partialLines: [{ label: "Hats", qty: 5, ready: false }], partialNotes: "" };
    expect(problems(s, ctx())).toEqual(["Enter how many boxes.", "Nothing is marked ready — mark what is ready, or answer No."]);
    expect(problems({ ...s, boxes: 1, partialNotes: "the decals" }, ctx())).toEqual([]);
  });
  test("a Deal already waiting to ship only needs the tracking number", () => {
    const c = ctx({ deal: { ...DEAL, Stage: "Products Need Shipping" } });
    expect(problems({}, c)).toEqual(["Enter the tracking number."]);
    expect(problems({ trackingNumber: "9434 6301" }, c)).toEqual([]);
  });
});

describe("E-52 the plan -- what is written, in what order", () => {
  test("passed, pickup: no Deal fields, the QC task closed, the stage from the remainder answer", () => {
    const p = buildPlan({ approvals: ALL, result: RESULTS.PICKUP, remainderDue: true, boxes: "2" }, ctx());
    expect(p.fields).toEqual({});
    expect(p.closeTasks.map((t) => t.id)).toEqual(["t1"]);
    expect(p.stage).toEqual({ move: true, stage: STAGES.REMAINDER });
    expect(p.summary.join("\n")).toMatch(/emails the customer the Production Complete email/);
    expect(p.note).toMatch(/Result: PASSED — pickup/);
    expect(p.note).toMatch(/Checked: 2026-10-12 by Drew Byrd/);
    expect(p.note).toMatch(/Remainder due on the invoice: Yes \(answered by the agent\)/);
    expect(p.note).toMatch(/Boxes: 2/);
    expect(p.note.match(/\[x\]/g)).toHaveLength(APPROVALS.length);
  });
  test("the form never writes a date stamp or the stage among the Deal fields", () => {
    [
      { approvals: ALL, result: RESULTS.PICKUP, remainderDue: false, boxes: 1 },
      { approvals: ALL, result: RESULTS.SHIP, boxes: 1, addressee: "A, B", trackingNumber: "1" },
      { approvals: {}, result: RESULTS.FAILED, partial: "yes", partialLines: [{ label: "Hats", qty: 5, ready: true, readyQty: 5 }], boxes: 1 },
    ].forEach((s) => {
      const keys = Object.keys(buildPlan(s, ctx()).fields);
      expect(keys).not.toContain("Stage");
      expect(keys.filter((k) => /Date_Time|DATE_TIME|^Needs_Shipping$|^Products_Shipped$/.test(k))).toEqual([]);
    });
  });
  test("needs shipping, no tracking yet: the ship-to is saved, Shipped is NOT ticked, the Deal waits", () => {
    const p = buildPlan({ approvals: ALL, result: RESULTS.SHIP, boxes: 1, addressee: " Ring Plan, Attn: Lane Blackmer, 12585 Kirkham Ct., Poway, CA 92064 " }, ctx());
    expect(p.fields).toEqual({ Addressee: "Ring Plan, Attn: Lane Blackmer, 12585 Kirkham Ct., Poway, CA 92064" });
    expect(p.stage.stage).toBe(STAGES.NEED_SHIP);
    expect(p.note).toMatch(/Tracking: not entered yet/);
  });
  test("needs shipping with tracking: tracking, the USPS link by default, Shipped, and Products Shipped", () => {
    const p = buildPlan({ approvals: ALL, result: RESULTS.SHIP, boxes: 1, addressee: "same", trackingNumber: " 9434 6301 0935 ", trackingUrl: "" }, ctx({ deal: { ...DEAL, Addressee: "same" } }));
    expect(p.fields).toEqual({ Tracking_Number: "9434 6301 0935", Tracking_URL: DEFAULT_TRACKING_URL, Shipped: true });
    expect(p.stage).toEqual({ move: true, stage: STAGES.SHIPPED });
    expect(p.summary.join("\n")).toMatch(/Shipping Confirmation email/);
  });
  test("an Addressee the agent did not change is not rewritten", () => {
    expect(buildPlan({ approvals: ALL, result: RESULTS.SHIP, addressee: "A, B" }, ctx({ deal: { ...DEAL, Addressee: "A, B" } })).fields).toEqual({});
  });
  test("failed, nothing ready: no fields; the QC task is closed; Failed Quality Check; the revision form is named", () => {
    const p = buildPlan({ approvals: { count: true }, result: RESULTS.FAILED, partial: "no" }, ctx());
    expect(p.fields).toEqual({});
    expect(p.closeTasks).toHaveLength(1);
    expect(p.stage.stage).toBe(STAGES.FAILED);
    expect(p.summary[p.summary.length - 1]).toMatch(/Revision \/ Correction form/);
    expect(p.note).toMatch(/Result: FAILED/);
    expect(p.note).toMatch(/\[x\] Count is accurate/);
    expect(p.note).toMatch(/\[ \] Print quality/);
  });
  test("failed with part ready: the three Ready fields, appended to what was there", () => {
    const p = buildPlan(
      { approvals: {}, result: RESULTS.FAILED, partial: "yes", boxes: 1, partialLines: [{ label: "Hats", qty: 24, ready: true, readyQty: 20 }], partialNotes: "" },
      ctx({ deal: { ...DEAL, Partial_Ready_Details: "[2026-10-01] READY: Polos 4 of 4." } })
    );
    expect(p.fields).toEqual({
      Partial_Pick_Up_Ready: true,
      Partial_Ready_Details: "[2026-10-01] READY: Polos 4 of 4.\n\n[2026-10-12] READY: Hats 20 of 24. HELD: Hats 4.",
      Partial_Ready_Date: "2026-10-12",
    });
    // "took it" is a different fact, recorded by whoever hands the order over -- never written here
    expect(Object.keys(p.fields)).not.toContain("Partial_Pick_Up");
    expect(p.note).toMatch(/Boxes: 1/);
  });
  test("a school deal: everything is saved, the stage is left for a person", () => {
    const p = buildPlan({ approvals: ALL, result: RESULTS.PICKUP, remainderDue: false, boxes: 1 }, ctx({ deal: { ...DEAL, Stage: "SCHOOL: Quality Check" } }));
    expect(p.stage.move).toBe(false);
    expect(p.summary.join("\n")).toMatch(/will NOT move the stage/);
    expect(p.note).toMatch(/Stage NOT moved by the form/);
  });
  test("no open QC task is said plainly; the sales follow-up is not touched", () => {
    const p = buildPlan({ approvals: ALL, result: RESULTS.PICKUP, remainderDue: false, boxes: 1 }, ctx({ tasks: [{ id: "s", Subject: "SALES: Failed Quality Check Follow-Up", Status: "Not Started" }] }));
    expect(p.closeTasks).toEqual([]);
    expect(p.summary.join("\n")).toMatch(/No open Quality Check task was found/);
  });
  test("a Deal already in Products Need Shipping: tracking only -- no approvals, no task, on to Products Shipped", () => {
    const p = buildPlan({ approvals: {}, result: "", trackingNumber: "9400 1", trackingUrl: DEFAULT_TRACKING_URL, addressee: "X, Y" }, ctx({ deal: { ...DEAL, Stage: "Products Need Shipping", Addressee: "X, Y" } }));
    expect(p.shipOnly).toBe(true);
    expect(p.fields).toEqual({ Tracking_Number: "9400 1", Tracking_URL: DEFAULT_TRACKING_URL, Shipped: true });
    expect(p.closeTasks).toEqual([]);
    expect(p.stage).toEqual({ move: true, stage: STAGES.SHIPPED });
    expect(p.note).toMatch(/TRACKING ADDED/);
    expect(p.note).not.toMatch(/Approvals:/);
    const waiting = buildPlan({ approvals: {}, result: "", trackingNumber: "", addressee: "X, Y" }, ctx({ deal: { ...DEAL, Stage: "Products Need Shipping", Addressee: "X, Y" } }));
    expect(waiting.fields).toEqual({});
    expect(waiting.stage).toEqual({ move: false, reason: "already", stage: STAGES.NEED_SHIP });
    expect(waiting.summary[0]).toMatch(/Enter the tracking number/);
  });
  test("allApproved follows the list", () => {
    expect(allApproved(ALL)).toBe(true);
    expect(allApproved({ ...ALL, placement: false })).toBe(false);
    expect(allApproved(undefined)).toBe(false);
  });
});

describe("E-52 the Books invoice -- decide only when it is safe to", () => {
  const answer = (invoices, extra) => ({ code: "success", details: { output: JSON.stringify({ status: "ok", message: "", count: invoices.length, invoices, ...extra }) } });
  const inv = (o) => ({ invoice_id: "1", number: "INV-004403", status: "paid", date: "2026-09-24", total: 214.3, balance: 0, line_items_loaded: true, line_items: [{ name: "Table cloth", description: "6 ft", quantity: 2 }], ...o });
  test("one issued invoice, balance 0: paid in full", () => {
    const a = readInvoiceAnswer(answer([inv()]));
    expect(a).toMatchObject({ state: "one", decided: true, remainderDue: false });
    expect(a.invoice.lineItems).toEqual([{ name: "Table cloth", description: "6 ft", quantity: 2 }]);
  });
  test("one issued invoice with a balance: remainder due (a deposit is a partial payment on it)", () => {
    expect(readInvoiceAnswer(answer([inv({ status: "partially_paid", total: 111, balance: 61 })]))).toMatchObject({ decided: true, remainderDue: true });
    expect(readInvoiceAnswer(answer([inv({ status: "sent", total: 64.31, balance: 64.31 })])).remainderDue).toBe(true);
  });
  test("no invoice (every online order) -- ask", () => {
    expect(readInvoiceAnswer(answer([]))).toMatchObject({ state: "none", decided: false, remainderDue: null });
  });
  test("several invoices -- ask, and show them all", () => {
    const a = readInvoiceAnswer(answer([inv(), inv({ number: "INV-004404" })]));
    expect(a).toMatchObject({ state: "several", decided: false });
    expect(a.invoices).toHaveLength(2);
  });
  test("a draft or a void invoice decides nothing (a draft's balance is just its total)", () => {
    expect(readInvoiceAnswer(answer([inv({ status: "draft", balance: 957.18 })]))).toMatchObject({ state: "draft", decided: false, remainderDue: null });
    expect(readInvoiceAnswer(answer([inv({ status: "void" })])).decided).toBe(false);
  });
  test("a balance that is not a number decides nothing", () => {
    expect(readInvoiceAnswer(answer([inv({ balance: null })])).decided).toBe(false); // Number(null) is 0 -- must not read as "paid"
    expect(readInvoiceAnswer(answer([inv({ balance: "" })])).decided).toBe(false);
    expect(readInvoiceAnswer(answer([inv({ balance: "0" })]))).toMatchObject({ decided: true, remainderDue: false });
    expect(readInvoiceAnswer(answer([inv({ balance: "abc" })])).decided).toBe(false);
    expect(readInvoiceAnswer(answer([inv({ balance: undefined })])).decided).toBe(false);
  });
  test("an error, a refusal, a function that is not installed, a timeout -- all ask", () => {
    expect(readInvoiceAnswer({ details: { output: JSON.stringify({ status: "error", message: "Books list call failed", count: 0, invoices: [] }) } })).toMatchObject({ state: "error", decided: false });
    expect(readInvoiceAnswer({ code: "INVALID_DATA", message: "no such function" }).decided).toBe(false);
    expect(readInvoiceAnswer({ details: { output: "not json" } }).decided).toBe(false);
    expect(readInvoiceAnswer(null).decided).toBe(false);
    expect(readInvoiceAnswer(undefined).state).toBe("error");
  });
  test("the answer may arrive already parsed", () => {
    expect(readInvoiceAnswer({ details: { output: { status: "ok", invoices: [inv()] } } }).decided).toBe(true);
  });
  test("the note says whether the answer was read from the invoice or given by the agent", () => {
    const paid = readInvoiceAnswer(answer([inv()]));
    const base = { approvals: ALL, result: RESULTS.PICKUP, boxes: 1 };
    expect(buildPlan({ ...base, remainderDue: false, remainderSource: "invoice" }, ctx({ invoice: paid })).note).toMatch(
      /Remainder due on the invoice: No \(read from the invoice: INV-004403 · paid · total \$214\.30 · balance \$0\.00\)/
    );
    // the agent overrode it: both are on record
    expect(buildPlan({ ...base, remainderDue: true, remainderSource: "agent" }, ctx({ invoice: paid })).note).toMatch(
      /Remainder due on the invoice: Yes \(answered by the agent; the invoice read: INV-004403/
    );
    // a stale "invoice" source can never be recorded against a different answer
    expect(buildPlan({ ...base, remainderDue: true, remainderSource: "invoice" }, ctx({ invoice: paid })).note).toMatch(/answered by the agent/);
    expect(buildPlan({ ...base, remainderDue: true, remainderSource: "agent" }, ctx({ invoice: readInvoiceAnswer(answer([])) })).note).toMatch(
      /answered by the agent; No invoice in Zoho Books is linked to this Deal\.\)/
    );
    expect(buildPlan({ ...base, remainderDue: true }, ctx()).note).toMatch(/Remainder due on the invoice: Yes \(answered by the agent\)/);
  });
});

describe("E-52 Partial Pick-Up Ready is un-ticked by a later check that releases nothing new", () => {
  const ticked = { ...DEAL, Partial_Pick_Up_Ready: true, Partial_Ready_Details: "[2026-10-09] READY: Hats 24 of 24.", Partial_Ready_Date: "2026-10-09" };
  test("a pass un-ticks it; the details and the date are not touched", () => {
    const p = buildPlan({ approvals: ALL, result: RESULTS.PICKUP, remainderDue: false, boxes: 1 }, ctx({ deal: ticked }));
    expect(p.fields).toEqual({ Partial_Pick_Up_Ready: false });
    expect(p.summary.join("\n")).toMatch(/Un-tick Partial Pick-Up Ready/);
  });
  test("a second failure with nothing ready un-ticks it, so the sales task is not labelled partial again", () => {
    expect(buildPlan({ approvals: {}, result: RESULTS.FAILED, partial: "no" }, ctx({ deal: ticked })).fields).toEqual({ Partial_Pick_Up_Ready: false });
  });
  test("a second failure that releases more keeps it ticked, appends, and re-dates it", () => {
    const p = buildPlan({ approvals: {}, result: RESULTS.FAILED, partial: "yes", boxes: 1, partialLines: [{ label: "Polos", qty: 4, ready: true, readyQty: 4 }] }, ctx({ deal: ticked }));
    expect(p.fields.Partial_Pick_Up_Ready).toBe(true);
    expect(p.fields.Partial_Ready_Date).toBe("2026-10-12");
    expect(p.fields.Partial_Ready_Details).toBe("[2026-10-09] READY: Hats 24 of 24.\n\n[2026-10-12] READY: Polos 4 of 4.");
  });
  test("never written when the box is not ticked, and not by the add-tracking mode", () => {
    expect(buildPlan({ approvals: ALL, result: RESULTS.PICKUP, remainderDue: false, boxes: 1 }, ctx()).fields).toEqual({});
    expect(buildPlan({ trackingNumber: "1" }, ctx({ deal: { ...ticked, Stage: "Products Need Shipping" } })).fields.Partial_Pick_Up_Ready).toBeUndefined();
    // the partial question not answered yet: nothing is decided, so nothing is un-ticked
    expect(buildPlan({ approvals: {}, result: RESULTS.FAILED }, ctx({ deal: ticked })).fields).toEqual({});
  });
});

describe("E-52 the package label", () => {
  const d = { kind: LABEL_KINDS.PICKUP, bigLabel: "PO #", big: "4291", account: "H & S Company LLC", contactName: "Shani Hustad", phone: "(986) 229-7373", dealNo: "8", salesAgent: "Ray Castaneda", qcDate: "Oct 9, 2026", boxes: 2, logoUrl: "logo.png", qrUrl: "qr.png" };
  test("one page per box, numbered", () => {
    const html = buildLabelHtml(d);
    expect(html.match(/class="label"/g)).toHaveLength(2);
    expect(html).toContain("1 of 2");
    expect(html).toContain("2 of 2");
    expect(html).toContain("size: 4in 6in");
    expect(html).toContain("<span>PO #</span>4291");
    expect(html).toContain("H &amp; S Company LLC");
    expect(html).toContain("Pickup for <b>Shani Hustad</b> · (986) 229-7373");
    expect(html).not.toContain("PARTIAL");
  });
  test("a partial pickup says so; a shipped order says who it ships to", () => {
    expect(buildLabelHtml({ ...d, kind: LABEL_KINDS.PARTIAL })).toContain("PARTIAL — MORE TO FOLLOW");
    expect(buildLabelHtml({ ...d, kind: LABEL_KINDS.SHIP })).toContain("Shipping to <b>Shani Hustad</b>");
  });
  test("no PO: the Deal name stands in; text from the Deal cannot break the page", () => {
    const html = buildLabelHtml({ ...d, big: "", bigLabel: "", dealName: 'test <b>"x"</b>', account: "<script>" });
    expect(html).toContain('class="po name">test &lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  test("box count: at least one page, capped against a typo", () => {
    expect(boxCount("3")).toBe(3);
    expect(boxCount("")).toBe(0);
    expect(boxCount("-2")).toBe(0);
    expect(boxCount("500")).toBe(MAX_BOXES);
    expect(buildLabelHtml({ ...d, boxes: "" }).match(/class="label"/g)).toHaveLength(1);
  });
});

// E-54 -- "a snapshot of what the order should have on it" (David, 2026-10-13).
// DECAL is the order that prompted it (Alex Adams Deal 2), as its onboarding note reads, no contact details.
const DECAL = {
  products: [
    {
      productName: "Decals",
      productType: "nongarment",
      quantityOrdered: "100",
      dimensions: '3" wide by 2.5" tall',
      numberOfSides: "1",
      specialInstructions: "",
      isOutsourced: false,
      vendorsUsed: "In house",
      branches: [{ graphicDescription: 'Image at 3" wide - die cut', isGraphicPrintReady: true, numberOfColorsUsed: "1", colorsUsed: "Full color printable vinyl", currentGraphicFormat: "PNG", fontsUsed: "NA" }],
    },
  ],
  suppliesMaterialsNeeded: "Printable vinyl",
  specialInstructions: "",
  doProductsNeedShipped: "No",
};
const MIXED = {
  products: [
    {
      productName: "Embroidery",
      productType: "garment",
      otherInformation: "Match the thread to last year's hats",
      primaryBranches: [
        {
          garmentType: "Richardson 112",
          garmentQuantity: "70",
          countColorSize: "Red/Black 20\nLoden 50",
          garmentSkus: [{ sku: "112" }, { sku: "" }],
          vendorsUsed: "S&S",
          isUsedInOtherAppTypes: "Yes",
          chooseApplicationType: ["Direct-to-Film"],
          specialInstructions: "Keep the stickers on the brims",
          secondaryBranches: [
            { graphicDescription: "P logo", numberOfColorsUsed: "2", colorsUsed: "1800 Black, 1810 Silver", underbase: "None", fontsUsed: "IDK", tartiaryBranches: [{ placementLocation: "Front Center of Hat", placementSize: "Small", sizeAndDimensions: "2.5 in tall" }, { placementLocation: "Left Side", placementSize: "Small", sizeAndDimensions: "" }] },
            { graphicDescription: "Flag", numberOfColorsUsed: "3", colorsUsed: "", tartiaryBranches: [] },
          ],
        },
      ],
    },
    {
      productName: "Screen Printing",
      productType: "garment",
      premiumIronPass: "Yes",
      primaryBranches: [{ garmentType: "Gildan 5000", garmentQuantity: "24", countColorSize: "Black\n12- M\n12- L", secondaryBranches: [{ graphicDescription: "Back print", numberOfColorsUsed: "1", colorsUsed: "White", underbase: "Single-pass", fontsUsed: "Impact", tartiaryBranches: [{ placementLocation: "Full Back", placementSize: "Large", sizeAndDimensions: "12 in wide" }] }] }],
    },
    { productName: "Direct-to-Film", productType: "garment", primaryBranches: [{ garmentType: "Richardson 112", garmentQuantity: "70", secondaryBranches: [] }] },
    DECAL.products[0],
    { productName: "Banners", productType: "nongarment", quantityOrdered: "2", dimensions: "3 x 6 ft", numberOfSides: "2", isOutsourced: true, vendorsUsed: "B2Sign", specialInstructions: "Grommets every 2 ft", branches: [] },
    { productName: "Pens", productType: "nongarment", quantityOrdered: "250", isOutsourced: true, branches: [] },
    { productName: "DTF Gang Sheet", productType: "gangsheet", numberOfGangSheets: "4", gangSheetWidth: "22", gangSheetHeight: "60", otherInformation: "Cut apart", gangGraphics: [{ graphicDescription: "A", quantityPerSheet: "12", graphicWidth: "4", graphicHeight: "4" }] },
    { productName: "Graphic Design", productType: "graphic", specialInstructions: "Vectorize the logo" },
    null,
  ],
  suppliesMaterialsNeeded: "",
};

describe("E-54 the print method a product sits under", () => {
  test("the method, with the department in front when the two differ", () => {
    expect(MIXED.products.filter(Boolean).map(printMethodFor)).toEqual([
      "Embroidery",
      "Screen Printing",
      "Vinyl Department · Direct-to-Film",
      "Vinyl Department · Decals",
      "Vinyl Department · Banners",
      "Outsourced · Pens",
      "Vinyl Department · DTF Gang Sheet",
      "Graphic Design",
    ]);
    expect(printMethodFor({ productType: "nongarment", productName: "Pens", isOutsourced: false })).toBe("Pens"); // never called outsourced on a guess
  });
});

describe("E-54 the order snapshot", () => {
  test("the decal order that prompted it: the method, the piece count, sides, in-house, the graphic and its colors", () => {
    const snap = orderSnapshot(DECAL);
    expect(snap.groups).toHaveLength(1);
    expect(snap.groups[0].method).toBe("Vinyl Department · Decals");
    const l = snap.groups[0].lines[0];
    expect(l).toMatchObject({ key: "0", label: "Decals", qty: 100, sizes: '3" wide by 2.5" tall', placementAsked: false });
    expect(l.facts).toEqual(["1 side", "Made in house"]); // "In house" as the vendor adds nothing
    expect(l.graphics[0]).toMatchObject({ description: 'Image at 3" wide - die cut', colorCount: "1", colors: "Full color printable vinyl", placements: [] });
    expect(l.graphics[0].facts).toEqual([]); // fonts "NA" says nothing
    expect(l.callouts).toEqual([]);
    expect(snap.alsoOnOrder).toEqual([]);
  });
  test("a mixed order: grouped by method in the order entered, every garment detail QC checks", () => {
    const snap = orderSnapshot(MIXED);
    expect(snap.groups.map((g) => [g.method, g.lines.map((l) => l.label + " " + l.qty)])).toEqual([
      ["Embroidery", ["Richardson 112 70"]],
      ["Screen Printing", ["Gildan 5000 24"]],
      ["Vinyl Department · Direct-to-Film", ["Richardson 112 70"]],
      ["Vinyl Department · Decals", ["Decals 100"]],
      ["Vinyl Department · Banners", ["Banners 2"]],
      ["Outsourced · Pens", ["Pens 250"]],
      ["Vinyl Department · DTF Gang Sheet", ["DTF Gang Sheet 4"]],
    ]);
    const hat = snap.groups[0].lines[0];
    expect(snap.groups[0].notes).toEqual(["Match the thread to last year's hats"]); // the product's own note, on its group
    expect(hat.facts).toEqual(["SKU 112", "Vendor: S&S"]);
    expect(hat.callouts).toEqual([
      { label: "This garment ALSO gets", text: "Direct-to-Film" },
      { label: "Special instructions", text: "Keep the stickers on the brims" },
    ]);
    expect(hat.graphics[0]).toMatchObject({ colorCount: "2", colors: "1800 Black, 1810 Silver", placements: ["Front Center of Hat · Small · 2.5 in tall", "Left Side · Small"] });
    expect(hat.graphics[0].facts).toEqual([]); // underbase "None" and fonts "IDK" say nothing
    expect(hat.graphics[1].placements).toEqual([]);
    const tee = snap.groups[1].lines[0];
    expect(tee.facts).toEqual(["Premium iron pass"]);
    expect(tee.graphics[0].facts).toEqual(["Underbase: Single-pass", "Fonts: Impact"]);
    const banner = snap.groups[4].lines[0];
    expect(banner.facts).toEqual(["2 sides", "Outsourced", "Vendor: B2Sign"]);
    expect(banner.callouts).toEqual([{ label: "Other information", text: "Grommets every 2 ft" }]);
    const sheet = snap.groups[6].lines[0];
    expect(sheet.graphics[0].placements).toEqual(["12 per sheet"]);
    expect(sheet.graphics[0].facts).toEqual(['Size: 4" × 4"']);
    expect(sheet.callouts).toEqual([{ label: "Other information", text: "Cut apart" }]);
    expect(snap.alsoOnOrder).toEqual(["Graphic Design"]);
  });
  test("the snapshot's lines ARE the count lines -- same keys, labels and quantities as a partial pickup chooses from", () => {
    const flat = orderSnapshot(MIXED).groups.flatMap((g) => g.lines);
    expect(flat.map((l) => [l.key, l.label, l.qty])).toEqual(orderLines(MIXED).map((l) => [l.key, l.label, l.qty]));
    expect(orderSnapshot(fixture).groups[0].lines[0]).toMatchObject({ key: "0.0", label: "Nike Polo NKDC1963", qty: 1 });
  });
  test("two products of one method share a heading; a garment note with no garments still shows; nothing is nothing", () => {
    const two = orderSnapshot({ products: [DECAL.products[0], { ...DECAL.products[0], quantityOrdered: "50" }] });
    expect(two.groups).toHaveLength(1);
    expect(two.groups[0].lines.map((l) => [l.key, l.qty])).toEqual([["0", 100], ["1", 50]]);
    const lone = orderSnapshot({ products: [{ productName: "Embroidery", productType: "garment", otherInformation: "Call before starting", primaryBranches: [] }] });
    expect(lone.groups).toEqual([{ method: "Embroidery", lines: [], notes: ["Call before starting"] }]);
    expect(orderSnapshot(null)).toEqual({ groups: [], alsoOnOrder: [] });
  });
  test("notes shown against their product are not repeated in the notes list -- and nothing is dropped", () => {
    const all = criticalNotes(MIXED, {}, "").map((n) => n.title);
    const rest = criticalNotes(MIXED, {}, "", { skipPlaced: true }).map((n) => n.title);
    expect(all).toEqual(["Embroidery — other information", "Banners — special instructions", "DTF Gang Sheet — other information", "Graphic Design — special instructions"]);
    expect(rest).toEqual(["Graphic Design — special instructions"]); // a design-only product has no line to sit on
    expect(criticalNotes(DECAL, {}, "", { skipPlaced: true }).map((n) => [n.title, n.text])).toEqual([["Supplies / materials needed", "Printable vinyl"]]);
  });
});

describe("E-82 part of the order ready - nothing failed, stays in Quality Check", () => {
  const lines = [
    { key: "a", label: "Hoodies", qty: 24, ready: true, readyQty: 20 },
    { key: "b", label: "Hats", qty: 6, ready: false, readyQty: 0 },
  ];
  test("needs something marked ready and the boxes; approvals are not asked", () => {
    expect(problems({ result: RESULTS.PART, partialLines: lines.map((l) => ({ ...l, ready: false })), boxes: "" }, ctx())).toEqual([
      "Mark what is ready now.",
      "Enter how many boxes.",
    ]);
    expect(problems({ result: RESULTS.PART, partialLines: lines, boxes: "1" }, ctx())).toEqual([]);
  });
  test("writes the partial fields, leaves the QC task open, never moves the stage, and makes the sales task", () => {
    const p = buildPlan({ result: RESULTS.PART, partialLines: lines, boxes: "1" }, ctx());
    expect(p.fields.Partial_Pick_Up_Ready).toBe(true);
    expect(p.fields.Partial_Ready_Details).toBe("[2026-10-12] READY: Hoodies 20 of 24. HELD: Hoodies 4 · Hats 6.");
    expect(p.closeTasks).toEqual([]);
    expect(p.stage).toEqual({ move: false, reason: "part" });
    expect(p.salesTask.subject).toBe(PART_TASK_SUBJECT);
    expect(p.salesTask.description).toMatch(/READY: Hoodies 20 of 24/);
    expect(p.note).toMatch(/Result: PART READY - the rest is still in production/);
    expect(p.note).toMatch(/Stage left in Quality Check/);
    expect(targetStage({ result: RESULTS.PART, currentStage: "Quality Check" })).toEqual({ move: false, reason: "part" });
  });
  test("the sales task goes to the Sales Person's user, else the Deal owner", () => {
    const users = [{ id: "u1", full_name: "Korie Byrd" }];
    expect(salesOwnerId({ Sales_Person: "korie byrd ", Owner: { id: "o1" } }, users)).toBe("u1");
    expect(salesOwnerId({ Sales_Person: "Ray Castaneda", Owner: { id: "o1" } }, users)).toBe("o1");
  });
});

describe("E-82 recording what the customer picked up", () => {
  const lines = [
    { key: "a", label: "Hoodies", qty: 24, ready: true, readyQty: 20 },
    { key: "b", label: "Hats", qty: 6, ready: false, readyQty: 0 },
  ];
  test("asks what was taken and whether anything still waits", () => {
    expect(buildPickupPlan({ lines: lines.map((l) => ({ ...l, ready: false })), stillWaiting: "", deal: {}, dateStr: "d" }).problems).toHaveLength(2);
  });
  test("appends a dated PICKED UP line, ticks Partial Pick-Up, clears the Ready box only when nothing is left", () => {
    const p = buildPickupPlan({ lines, notes: "", stillWaiting: "yes", deal: { Partial_Pick_Up_Details: "old" }, dateStr: "2026-10-29", who: "Ray" });
    expect(p.problems).toEqual([]);
    expect(p.entry).toBe("[2026-10-29] PICKED UP: Hoodies 20. (handed over by Ray)");
    expect(p.fields).toEqual({ Partial_Pick_Up: true, Partial_Pick_Up_Details: "old\n\n[2026-10-29] PICKED UP: Hoodies 20. (handed over by Ray)" });
    const done = buildPickupPlan({ lines, stillWaiting: "no", deal: {}, dateStr: "2026-10-29" });
    expect(done.fields.Partial_Pick_Up_Ready).toBe(false);
    expect(done.note).toMatch(/Still waiting for pickup: No/);
  });
});
