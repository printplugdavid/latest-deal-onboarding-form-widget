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
  isQcTask,
  isRush,
  openQcTasks,
  orderLines,
  problems,
  splitAddress,
  startPartialLines,
  targetStage,
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
    expect(p.note).toMatch(/Remainder due on the invoice \(answered by the agent\): Yes/);
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
  });
  test("allApproved follows the list", () => {
    expect(allApproved(ALL)).toBe(true);
    expect(allApproved({ ...ALL, placement: false })).toBe(false);
    expect(allApproved(undefined)).toBe(false);
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
