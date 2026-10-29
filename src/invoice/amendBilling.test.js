import {
  countsOf,
  pairKey,
  billingDiff,
  newHandItems,
  priceBeforeAfter,
  amendArgs,
  amendmentIdOf,
  readAmendAnswer,
  outcomeLine,
  amendBillingOn,
} from "./amendBilling";

/* Priced lines as priceLines() returns them. */
const L = (sku, quantity, description, group, rate = 10, item_id = "id-" + sku) => ({ sku, quantity, description, group, rate, item_id, clientQty: 0 });

test("the switch is off until David's yes", () => {
  expect(amendBillingOn()).toBe(false);
});

test("countsOf reads sizes and placements, singular and plural alike", () => {
  const c = countsOf("Black\n\n3 Medium\n2 Large");
  expect(c.head).toEqual(["Black"]);
  expect([...c.counts]).toEqual([["Medium", 3], ["Large", 2]]);
  expect([...countsOf("1 Front Placement\n6 Front Placements").counts]).toEqual([["Front Placement", 7]]);
});

test("garments pair by SKU + color, prints by SKU, the rest by SKU + text + rate", () => {
  expect(pairKey(L("PC54", 5, "Black\n\n3 Medium\n2 Large", "garment"))).toBe("PC54|Black");
  expect(pairKey(L("PPSP2", 5, "5 Left Chest Placements", "decoration"))).toBe("PPSP2|decoration");
  expect(pairKey(L("PPFEE8", 1, "Client-provided garments: 4 Hoodies", "fee", 6.4))).toBe("PPFEE8|Client-provided garments: 4 Hoodies|6.4");
});

test("nothing changed -> nothing sent", () => {
  const lines = [L("PC54", 5, "Black\n\n3 Medium\n2 Large", "garment"), L("PPSP2", 5, "5 Left Chest Placements", "decoration")];
  const d = billingDiff(lines, lines.map((l) => ({ ...l })));
  expect(d.add).toEqual([]);
  expect(d.lower).toEqual([]);
  expect(d.money).toBe(0);
});

test("a garment that gains sizes = one add line for what was added (item_id + rate, as Deluge needs)", () => {
  const d = billingDiff(
    [L("PC54", 5, "Black\n\n3 Medium\n2 Large", "garment", 4)],
    [L("PC54", 7, "Black\n\n5 Medium\n2 Large", "garment", 4)]
  );
  expect(d.lower).toEqual([]);
  expect(d.add.map((x) => x.line)).toEqual([{ sku: "PC54", quantity: 2, description: "Black\n\nAdded:\n2 Medium", item_id: "id-PC54", rate: 4 }]);
  expect(d.add[0].plain).toBe("Add 2 x PC54 Black");
  expect(d.money).toBe(8);
});

test("a garment that loses sizes = one lower on the OLD text, with what it should read now", () => {
  const d = billingDiff(
    [L("PC54", 5, "Black\n\n3 Medium\n2 Large", "garment", 4)],
    [L("PC54", 4, "Black\n\n3 Medium\n1 Large", "garment", 4)]
  );
  expect(d.add).toEqual([]);
  expect(d.lower.map((x) => x.line)).toEqual([
    { sku: "PC54", quantity: 1, description: "Black\n\n3 Medium\n2 Large", item_id: "id-PC54", new_description: "Black\n\n3 Medium\n1 Large" },
  ]);
  expect(d.money).toBe(-4);
});

test("colors stay apart: removing Black never touches Navy", () => {
  const d = billingDiff(
    [L("PC54", 2, "Black\n\n2 Large", "garment"), L("PC54", 3, "Navy\n\n3 Large", "garment")],
    [L("PC54", 3, "Navy\n\n3 Large", "garment")]
  );
  expect(d.add).toEqual([]);
  expect(d.lower.map((x) => [x.line.description, x.line.quantity])).toEqual([["Black\n\n2 Large", 2]]);
  expect(d.lower[0].plain).toBe("Remove 2 x PC54 Black");
});

test("a print whose tier changes = the old SKU taken off, the new SKU added", () => {
  const d = billingDiff(
    [L("PPSP12", 20, "20 Left Chest Placements", "decoration", 5)],
    [L("PPSP25", 26, "26 Left Chest Placements", "decoration", 4)]
  );
  expect(d.lower.map((x) => [x.line.sku, x.line.quantity])).toEqual([["PPSP12", 20]]);
  expect(d.add.map((x) => [x.line.sku, x.line.quantity, x.line.description])).toEqual([["PPSP25", 26, "26 Left Chest Placements"]]);
  expect(d.money).toBe(4); // 104 - 100
});

test("the same print on more pieces = an add for the extra placements, worded the same way", () => {
  const d = billingDiff(
    [L("PPSP2", 20, "20 Left Chest Placements", "decoration", 5)],
    [L("PPSP2", 21, "21 Left Chest Placements", "decoration", 5)]
  );
  expect(d.add.map((x) => x.line.description)).toEqual(["Added:\n1 Left Chest Placement"]);
});

test("a fee whose amount changes (PPFEE8) = the old one off, the new one on", () => {
  const d = billingDiff(
    [L("PPFEE8", 1, "Client-provided garments: 4 Hoodies", "fee", 6.4)],
    [L("PPFEE8", 1, "Client-provided garments: 6 Hoodies", "fee", 9.6)]
  );
  expect(d.lower.map((x) => x.line.quantity)).toEqual([1]);
  expect(d.add.map((x) => [x.line.quantity, x.line.rate])).toEqual([[1, 9.6]]);
  expect(d.money).toBe(3.2);
});

test("only hand-list items the amendment added are shown to add by hand", () => {
  const old = [{ what: "PC61 White XS", quantity: 2, reason: "no Books size item covers XS" }];
  expect(newHandItems(old, old)).toEqual([]);
  expect(newHandItems(old, [{ ...old[0], quantity: 3 }])).toHaveLength(1);
  expect(newHandItems([], [{ what: "X", quantity: 1, reason: "r" }])).toHaveLength(1);
});

test("both orders are priced with ONE Books search and the same rates", async () => {
  const sku = (s, name) => ({ sku: s, productId: "", productName: name, productSource: "books" });
  const order = (sizes) => ({
    billingDocument: "Invoice",
    payingByCard: "No",
    hardDueDate: "No",
    artFeesOff: ["PPGD1", "PPFEE3", "PPEDF"],
    products: [
      {
        productName: "Screen Printing",
        productType: "garment",
        primaryBranches: [
          {
            everyGraphicOnEveryGarment: "Yes",
            isUsedInOtherAppTypes: "No",
            garmentType: "Port & Company PC54",
            garmentKind: "T-Shirt",
            garmentSkus: [sku("PC54", "Port & Company - Core Cotton Tee - S-XL")],
            countColorSize: sizes,
            secondaryBranches: [{ numberOfColorsUsed: "1", numberOfPlacements: "1", tartiaryBranches: [{ placementPick: "Left Chest" }] }],
          },
        ],
      },
    ],
  });
  const calls = [];
  const search = async (skus) => {
    calls.push(skus);
    const items = {};
    skus.forEach((s) => (items[s] = { item_id: "b-" + s, rate: 3 }));
    return { status: "ok", items };
  };
  const p = await priceBeforeAfter(order("Black\n12- L"), order("Black\n14- L"), search);
  expect(calls).toHaveLength(1);
  expect(p.found).toBe(true);
  const d = billingDiff(p.before.lines, p.after.lines);
  expect(d.add.map((x) => [x.line.sku, x.line.quantity, x.line.rate])).toEqual([
    ["PC54", 2, 3],
    [p.after.lines.find((l) => l.group === "decoration").sku, 2, 3],
  ]);
  expect(d.lower).toEqual([]);
});

test("amendArgs: Deluge's shape, the amendment id in the reason and as its own key", () => {
  const id = amendmentIdOf("5249", "2026-10-29T15:30:12.345Z");
  expect(id).toBe("5249-2026-10-29T15:30:12.345Z");
  const a = amendArgs("5249", {
    add: [{ line: { sku: "PC54", quantity: 2, description: "x", item_id: "1", rate: 3 } }],
    lower: [],
    flags: { rush: true, extendedTurnaround: false, payingByCard: true },
    dryRun: true,
    submittedBy: "Ray",
    reason: "Added 2 Large",
    amendmentId: id,
  });
  expect(a.deal_id).toBe("5249");
  const p = JSON.parse(a.payload);
  expect(p).toEqual({
    dry_run: true,
    submitted_by: "Ray",
    reason: "Added 2 Large [5249-2026-10-29T15:30:12.345Z]",
    add: [{ sku: "PC54", quantity: 2, description: "x", item_id: "1", rate: 3 }],
    lower: [],
    rush: true,
    extended_turnaround: false,
    paying_by_card: true,
    amendment_id: id,
  });
});

test("an answer: not matched lines read plainly, credit note summarised", () => {
  const a = readAmendAnswer(
    {
      status: "ok",
      result: "credit_note",
      message: "Done.",
      document: "invoice",
      number: "INV-004600",
      doc_status: "paid",
      old_total: 100,
      not_matched: [{ action: "lower", sku: "PC54", quantity: 1, why: "no line with that text" }],
      changes: ["credit 1.0 x PC54"],
      credit: { number: "CN-00040", total: 10.6, applied: 0, left_as_credit: 10.6 },
    },
    { dryRun: false }
  );
  expect(a.ok).toBe(true);
  expect(a.notMatched).toEqual(["Take off 1 x PC54 - no line with that text"]);
  expect(a.summary).toEqual([
    "invoice INV-004600 (paid)",
    "Total now $100.00",
    "Credit note CN-00040: $10.60, $0.00 applied to the invoice, $10.60 left as the customer's credit",
  ]);
  expect(outcomeLine(a)).toMatch(/^invoice updated in Books: /);
});

test("a real call that does not answer: unknown, check Books before submitting again (never retried)", () => {
  const a = readAmendAnswer({ status: "unavailable", reason: "failed", message: "timeout" }, { dryRun: false });
  expect(a.ok).toBe(false);
  expect(a.unknown).toBe(true);
  expect(a.message).toMatch(/Check the invoice in Books before submitting again/);
  const dry = readAmendAnswer({ status: "unavailable", reason: "failed", message: "timeout" }, { dryRun: true });
  expect(dry.unknown).toBe(false);
  expect(dry.message).toMatch(/Nothing was changed/);
  const missing = readAmendAnswer({ status: "unavailable", reason: "missing", message: "x" }, { dryRun: false });
  expect(missing.unknown).toBe(false);
});
