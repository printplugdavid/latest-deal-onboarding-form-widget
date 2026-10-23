import {
  buildBillingLines,
  priceLines,
  draftPayload,
  skusToFind,
  cannotSend,
  gridSku,
  gangSheetLine,
  flagsOf,
  HTV_FULL,
  clientGarmentText,
} from "./billingLines";
import GRID from "./billingGrid.json";

/* Real orders read by the Deluge thread (their docs/40 §1), rebuilt as form answers. */
const sku = (s, name, productSource = "books") => ({ sku: s, productId: "", productName: name, productSource });
const place = (pick, extra = {}) => ({ placementPick: pick, ...extra });
const garment = (productName, branches, extra = {}) => ({ productName, productType: "garment", primaryBranches: branches, ...extra });
const branch = (o) => ({ everyGraphicOnEveryGarment: "Yes", isUsedInOtherAppTypes: "No", ...o });
const order = (products, extra = {}) => ({ billingDocument: "Invoice", payingByCard: "No", hardDueDate: "No", products, ...extra });

const IND = "Independent Trading Co. - Heavyweight Hooded Pullover";
const treasureValley = () =>
  order([
    garment("Screen Printing", [
      branch({
        garmentType: "Independent IND4000 hoodie",
        garmentKind: "Hoodie / Crew / Zip",
        garmentQuantity: "32",
        garmentSkus: [sku("IND4000", `${IND} - XS-XL`), sku("IND40002", `${IND} - 3XL`)],
        countColorSize: "Black\n6- M\n6- L\n10- XL\n10- 3XL",
        secondaryBranches: [{ numberOfColorsUsed: "2", numberOfPlacements: "2", tartiaryBranches: [place("Left Chest"), place("Full Back")] }],
      }),
      branch({
        garmentType: "Independent IND4000Z zip",
        garmentKind: "Hoodie / Crew / Zip",
        garmentQuantity: "15",
        garmentSkus: [sku("IND4000Z", "Independent Trading Co. - Zip Hood - XS-XL"), sku("IND4000Z1", "Independent Trading Co. - Zip Hood - 2XL")],
        countColorSize: "Black\n9- L\n6- 2XL",
        secondaryBranches: [{ numberOfColorsUsed: "2", numberOfPlacements: "2", tartiaryBranches: [place("Left Chest"), place("Full Back")] }],
      }),
      branch({
        garmentType: "Gildan 18000 crew",
        garmentKind: "Hoodie / Crew / Zip",
        garmentQuantity: "1",
        garmentSkus: [sku("18000", "Gildan - Heavy Blend Crewneck Sweatshirt - S-XL")],
        countColorSize: "Black\n1- M",
        secondaryBranches: [{ numberOfColorsUsed: "2", numberOfPlacements: "2", tartiaryBranches: [place("Left Chest"), place("Full Back")] }],
      }),
    ]),
  ]);

test("Treasure Valley Granite rebuilds as invoiced: garment bands, PPSPH14 x48 left chest, PPSPH31 x48 back", () => {
  const b = buildBillingLines(treasureValley());
  expect(b.handList).toEqual([]);
  expect(b.lines.map((l) => [l.sku, l.quantity])).toEqual([
    ["IND4000", 22],
    ["IND40002", 10],
    ["IND4000Z", 9],
    ["IND4000Z1", 6],
    ["18000", 1],
    ["PPSPH14", 48],
    ["PPSPH31", 48],
  ]);
  expect(b.lines[0].description).toBe("Black\n\n6 Medium\n6 Large\n10 Extra Large");
  expect(b.lines[5].description).toBe("48 Left Chest Placements");
  expect(b.lines[6].description).toBe("48 Full Back Placements");
  expect(b.tiers).toEqual({ screen: 48 });
});

test("LB Foster: 300 tees, 5 colors, two placements -> PPSP29 + PPSP37", () => {
  const b = buildBillingLines(
    order([
      garment("Screen Printing", [
        branch({
          garmentType: "District DM130",
          garmentKind: "Tee / Long Sleeve / Tank / Button-up",
          garmentQuantity: "300",
          garmentSkus: [sku("DM130", "District - Perfect Tri Tee - XS-XL")],
          countColorSize: "Heathered Navy\n300- L",
          secondaryBranches: [{ numberOfColorsUsed: "5", numberOfPlacements: "2", tartiaryBranches: [place("Full Front"), place("Full Back")] }],
        }),
      ]),
    ])
  );
  expect(b.lines.filter((l) => l.group !== "garment").map((l) => [l.sku, l.quantity])).toEqual([["PPSP29", 300], ["PPSP37", 300]]);
});

const americanMuffler = (upcharge = "Yes") =>
  order([
    garment("Embroidery", [
      branch({
        garmentType: "Grey Quarter Zips (client's)",
        garmentKind: "Hoodie / Crew / Zip",
        garmentQuantity: "4",
        garmentSkus: [{ sku: "PPCO", productSource: "clientOwned" }],
        clientOwnedUpcharge: upcharge,
        clientOwnedUpchargePercent: 10,
        countColorSize: "Grey\n4- L",
        secondaryBranches: [{ numberOfPlacements: "2", tartiaryBranches: [place("Left Chest", { placementSize: "Small" }), place("Right Sleeve – Upper", { placementSize: "Small" })] }],
      }),
    ]),
  ]);

test("American Muffler: client garments get no garment line; PPFEE8 = 10% of the embroidery on them", () => {
  const b = buildBillingLines(americanMuffler());
  expect(b.lines.map((l) => [l.sku, l.quantity, l.clientQty])).toEqual([["PPEMB1", 4, 4], ["PPEMB21", 4, 4]]);
  expect(b.lines[0].description).toMatch(/^4 Left Chest Placements\nStitch count estimated/);
  const p = priceLines(b, {
    PPEMB1: { item_id: "i1", rate: 22 },
    PPEMB21: { item_id: "i21", rate: 7 },
    PPFEE8: { item_id: "i8", rate: 100 },
  });
  const fee = p.lines.find((l) => l.sku === "PPFEE8");
  expect(fee).toMatchObject({ quantity: 1, rate: 11.6, item_id: "i8" }); // Books docs/36: "American Muffler $11.60"
  expect(fee.description).toBe("Client-provided garments: 4 Grey Quarter Zips (client's)");
});

test("the onboarding form keeps the upcharge answer on the product (docs/06 E-101): read from there", () => {
  const o = americanMuffler();
  const b0 = o.products[0].primaryBranches[0];
  delete b0.clientOwnedUpcharge;
  delete b0.clientOwnedUpchargePercent;
  o.products[0].clientOwnedUpcharge = "Yes";
  o.products[0].clientOwnedUpchargePercent = 10;
  const b = buildBillingLines(o);
  expect(b.clientFee).toEqual([{ sku: "PPEMB1", quantity: 4, percent: 10 }, { sku: "PPEMB21", quantity: 4, percent: 10 }]);
  expect(b.clientGarments).toBe("Client-provided garments: 4 Grey Quarter Zips (client's)");
  o.products[0].clientOwnedUpcharge = "No";
  expect(buildBillingLines(o).clientFee).toEqual([]);
});

test("PPFEE8 description (Deluge pilot test B): never '0'; the count from the sizes, the garment type when given", () => {
  const client = (garmentType, garmentQuantity, countColorSize) =>
    branch({ garmentType, garmentQuantity, countColorSize, garmentSkus: [{ sku: "PPCO", productSource: "clientOwned" }] });
  const text = (...branches) => clientGarmentText([garment("Screen Printing", branches, { clientOwnedUpcharge: "Yes" })]);
  expect(text(client("", "", "Black\n4- L"))).toBe("4 client-provided garments");
  expect(text(client("", "1", ""))).toBe("1 client-provided garment");
  expect(text(client("", "", ""))).toBe("Client-provided garments (see the order)");
  expect(text(client("Nike Hoodies", "", ""))).toBe("Client-provided garments: Nike Hoodies");
  expect(text(client("Nike Hoodies", "2", ""), client("", "", "Grey\n3- M"))).toBe("Client-provided garments: 2 Nike Hoodies; 3 client-provided garments");
});

test("client garments with the upcharge answered No: no PPFEE8 line", () => {
  const b = buildBillingLines(americanMuffler("No"));
  expect(b.clientFee).toEqual([]);
  expect(priceLines(b, { PPEMB1: { item_id: "1", rate: 22 }, PPEMB21: { item_id: "2", rate: 7 } }).lines.map((l) => l.sku)).toEqual(["PPEMB1", "PPEMB21"]);
});

test("Columbia: beanies (always Small) + 2 hoodies count as ONE embroidery tier of 19; DTF 10\"+ at 23", () => {
  const b = buildBillingLines(
    order([
      garment("Embroidery", [
        branch({
          garmentType: "CP90 beanie",
          garmentKind: "Beanie",
          garmentQuantity: "17",
          garmentSkus: [sku("CP90", "Port & Company - Knit Cap - OSFA")],
          countColorSize: "Navy\n17- OSFA",
          secondaryBranches: [{ numberOfPlacements: "1", tartiaryBranches: [place("Front", { placementSize: "Large" })] }],
        }),
        branch({
          garmentType: "Nike hoodies (client's)",
          garmentKind: "Hoodie / Crew / Zip",
          garmentQuantity: "2",
          garmentSkus: [{ sku: "PPCO", productSource: "clientOwned" }],
          clientOwnedUpcharge: "Yes",
          countColorSize: "Grey\n2- L",
          secondaryBranches: [{ numberOfPlacements: "1", tartiaryBranches: [place("Right Chest", { placementSize: "Small" })] }],
        }),
      ]),
      garment("Direct-to-Film", [
        branch({
          garmentType: "PC78H hoodie",
          garmentKind: "Hoodie / Crew / Zip",
          garmentQuantity: "23",
          garmentSkus: [sku("PC78H", "Port & Company - Core Fleece Pullover Hooded Sweatshirt - S-XL")],
          countColorSize: "Navy\n23- L",
          secondaryBranches: [{ numberOfPlacements: "1", tartiaryBranches: [place("Full Back", { widthIn: "11" })] }],
        }),
      ]),
    ])
  );
  expect(b.lines.filter((l) => l.group === "decoration").map((l) => [l.sku, l.quantity, l.description.split("\n").slice(0, 2)])).toEqual([
    ["PPEMB5", 19, ["17 Front Placements", "2 Right Chest Placements"]],
    ["PPDTF12", 23, ["23 Full Back Placements"]],
  ]);
  expect(b.lines.filter((l) => l.group === "garment").map((l) => l.sku)).toEqual(["CP90", "PC78H"]);
  expect(b.clientFee).toEqual([{ sku: "PPEMB5", quantity: 2, percent: 10 }]);
  const p = priceLines(b, { CP90: { item_id: "a", rate: 2 }, PC78H: { item_id: "b", rate: 10 }, PPEMB5: { item_id: "c", rate: 13 }, PPDTF12: { item_id: "d", rate: 18 }, PPFEE8: { item_id: "e", rate: 100 } });
  expect(p.lines.find((l) => l.sku === "PPFEE8").rate).toBe(2.6); // Books docs/36: "Columbia ≈ $2.60"
});

test("Maria Rojas: one gang sheet 12 x 36 inches = 3 square feet of PPDTFGS", () => {
  expect(gangSheetLine({ numberOfGangSheets: "1", gangSheetWidth: "12", gangSheetHeight: "36" }).line).toMatchObject({ sku: "PPDTFGS", quantity: 3 });
  expect(gangSheetLine({ numberOfGangSheets: "4", gangSheetWidth: "22", gangSheetHeight: "36" }).line).toMatchObject({ sku: "PPDTFGS1", quantity: 22 });
  expect(gangSheetLine({ numberOfGangSheets: "1", gangSheetWidth: "22" }).why).toMatch(/width and length/);
});

test("the grids: DTG 1-5 / 6-10 / 11+, HTV plain vs full, hoodie grid has no row under 12", () => {
  expect([1, 5, 6, 10, 11, 400].map((n) => gridSku("dtg", { size: "over5" }, n))).toEqual(["PPDTG1", "PPDTG1", "PPDTG4", "PPDTG4", "PPDTG2", "PPDTG2"]);
  expect(gridSku("dtg", { size: "under5" }, 12)).toBe("PPDTG21");
  expect(gridSku("htv", { full: true, size: "5to10" }, 30)).toBe("PPHTV18");
  expect(gridSku("htv", { full: false, size: "5to10" }, 30)).toBe("PPHTV9");
  expect(gridSku("screen", { hoodie: true, colors: 1 }, 8)).toBe("");
  expect(gridSku("screen", { hoodie: false, colors: 1 }, 8)).toBe("PPSP2");
  expect(gridSku("embroidery", { band: "large" }, 100)).toBe("PPEMB19");
});

test("what the form cannot price goes to the hand list, never guessed", () => {
  const b = buildBillingLines(
    order([
      garment("Screen Printing", [
        branch({
          garmentType: "Hoodies",
          garmentKind: "Hoodie / Crew / Zip",
          garmentQuantity: "8",
          garmentSkus: [sku("PC78H", "Port & Company - Core Fleece Pullover Hooded Sweatshirt - S-XL")],
          countColorSize: "Black\n6- L\n2- 5XL\nBlue 3 large",
          secondaryBranches: [{ numberOfColorsUsed: "1", numberOfPlacements: "1", tartiaryBranches: [place("Left Chest")] }],
        }),
      ]),
      garment("Heat-Transfer", [
        branch({
          garmentType: "Tees",
          garmentQuantity: "5",
          garmentSkus: [],
          countColorSize: "White\n5- M",
          secondaryBranches: [{ htvColorMode: HTV_FULL, numberOfPlacements: "1", tartiaryBranches: [place("Full Back", { widthIn: "16" })] }],
        }),
      ]),
      garment("Vinyl", [branch({ garmentType: "Bags", garmentQuantity: "3", secondaryBranches: [{ numberOfPlacements: "1" }] })]),
      { productName: "Stickers", productType: "nongarment", quantityOrdered: "100", productSkus: [{ sku: "ST1" }, { sku: "ST2" }] },
    ])
  );
  const reasons = b.handList.map((h) => h.reason);
  expect(reasons).toEqual(
    expect.arrayContaining([
      "no Books size item covers 5XL",
      "size line the form could not read",
      "no Books SKU picked for this garment type",
      '16" wide: Books prices HTV up to 15"',
      "no Books price grid for this method",
      "several SKUs: the form does not say how many of each",
      "Books has no price for 8 pieces on hoodies (the hoodie grid starts at 12)",
    ])
  );
  expect(b.lines.map((l) => [l.sku, l.quantity])).toEqual([["PC78H", 6]]);
});

test("Lil Jon test (10-22): a blank graphic, no graphic, or no colors is listed for the rep, never skipped or guessed", () => {
  const tee = (secondaryBranches) =>
    branch({
      garmentType: "Port & Company - Core Blend Tee (PC55)",
      garmentQuantity: "",
      garmentSkus: [sku("PC55", "Port & Company - Core Blend Tee - S-XL"), sku("PC552", "Port & Company - Core Blend Tee - 3XL-6XL")],
      countColorSize: "Black\n1- XL\n1- 4XL",
      secondaryBranches,
    });
  // the real test order: one graphic, no colors, no placements
  const blank = buildBillingLines(order([garment("Screen Printing", [tee([{ isGraphicPrintReady: "No", numberOfColorsUsed: "", numberOfPlacements: "" }])])]));
  expect(blank.lines.map((l) => [l.sku, l.quantity])).toEqual([["PC55", 1], ["PC552", 1]]);
  expect(blank.handList).toEqual([{ what: "Screen print graphic 1 on Port & Company - Core Blend Tee (PC55)", quantity: 2, reason: "no placements entered, so no print line" }]);
  expect(buildBillingLines(order([garment("Screen Printing", [tee([])])])).handList[0].reason).toBe("no graphic entered, so no print line");
  const noColors = buildBillingLines(order([garment("Screen Printing", [tee([{ numberOfColorsUsed: "", numberOfPlacements: "1", tartiaryBranches: [place("Left Chest")] }])])]));
  expect(noColors.handList.map((h) => h.reason)).toEqual(["number of colors not entered (it picks the screen print price)"]);
  expect(noColors.lines.some((l) => l.group === "decoration")).toBe(false);
});

test("a graphic not on every garment (not split) covers only its garments; the rest are extras", () => {
  const b = buildBillingLines(
    order([
      garment("Direct-to-Film", [
        branch({
          garmentType: "Tees",
          garmentQuantity: "20",
          everyGraphicOnEveryGarment: "No",
          garmentSkus: [sku("PC54", "Port & Company - Core Cotton Tee - S-XL")],
          countColorSize: "Black\n20- L",
          secondaryBranches: [
            { garmentsWithThisGraphic: "12", numberOfPlacements: "1", tartiaryBranches: [place("Left Chest", { widthIn: "3.5" })] },
            { garmentsWithThisGraphic: "8", numberOfPlacements: "2", tartiaryBranches: [place("Full Front", { widthIn: "11" }), place("Full Back", { widthIn: "11" })] },
          ],
        }),
      ]),
    ])
  );
  expect(b.lines.filter((l) => l.group !== "garment").map((l) => [l.sku, l.quantity])).toEqual([
    ["PPDTF2", 12], // under 5", tier 12-24 (20 decorated)
    ["PPDTF12", 8], // 10"+
    ["PPDTF16", 8], // the back of those 8
  ]);
});

test("the same garments listed under two methods are billed once; decoration counts in both", () => {
  const g = (method, yes) =>
    garment(method, [
      branch({
        garmentType: "PC54 tees",
        garmentQuantity: "24",
        isUsedInOtherAppTypes: yes,
        garmentSkus: [sku("PC54", "Port & Company - Core Cotton Tee - S-XL")],
        countColorSize: "Black\n24- L",
        secondaryBranches: [{ numberOfColorsUsed: "1", numberOfPlacements: "1", tartiaryBranches: [place("Left Chest", { placementSize: "Small", widthIn: "4" })] }],
      }),
    ]);
  const b = buildBillingLines(order([g("Embroidery", "No"), g("Direct-to-Film", "Yes")]));
  expect(b.lines.map((l) => [l.sku, l.quantity])).toEqual([["PC54", 24], ["PPEMB5", 24], ["PPDTF2", 24]]);
});

test("form answers that are lines: other charges, round-up, premium iron pass, non-garment SKU; Zoho's three are never sent", () => {
  const b = buildBillingLines(
    order(
      [
        { productName: "Stickers", productType: "nongarment", quantityOrdered: "250", productSkus: [{ sku: "stk3" }] },
        garment("Screen Printing", [branch({ garmentQuantity: "0" })], { premiumIronPass: "Yes" }),
      ],
      { roundUpForCharity: "Yes", otherCharges: [{ sku: "PPFEE2", quantity: 2 }, { sku: "PPFEE1", quantity: 1 }, { sku: "PPEDF", quantity: 0 }] }
    )
  );
  expect(b.lines.map((l) => [l.sku, l.quantity, l.description])).toEqual([
    ["STK3", 250, "Stickers"],
    ["PPFEE2", 2, "Screen Print Setup Fee - per Color"],
    ["PPFEE10", 1, "Faces Of Hope Round-Up Donation"],
  ]);
});

test("flags: rush needs a hard due date; either extended option; card; document", () => {
  expect(flagsOf({ hardDueDate: "Yes", upchargedForRushTurnaround: true, billingDocument: "Estimate", payingByCard: "Yes" })).toEqual({
    document: "estimate",
    rush: true,
    extendedTurnaround: false,
    payingByCard: true,
  });
  expect(flagsOf({ hardDueDate: "No", upchargedForRushTurnaround: true, tenFourteenBusinessDayTurnaround: true }).rush).toBe(false);
  expect(flagsOf({ hardDueDate: "No", discountsForExtendedTurnaround: "Yes", addOneWeekToProductionTime: true }).extendedTurnaround).toBe(true);
  expect(flagsOf({ hardDueDate: "No", tenFourteenBusinessDayTurnaround: true }).extendedTurnaround).toBe(true);
  expect(flagsOf({}).document).toBe("");
});

test("pricing: every line gets item_id + rate; a SKU Books lacks moves to the hand list; the payload is Deluge docs/43's", () => {
  const b = buildBillingLines(treasureValley());
  expect(skusToFind(b)).toEqual(["IND4000", "IND40002", "IND4000Z", "IND4000Z1", "18000", "PPSPH14", "PPSPH31"]);
  const found = Object.fromEntries(skusToFind(b).filter((s) => s !== "18000").map((s, i) => [s, { item_id: "id" + i, rate: 10 + i }]));
  const p = priceLines(b, found);
  expect(p.handList).toEqual([{ what: "18000 Black", quantity: 1, reason: "not an active item in Books" }]);
  const payload = draftPayload(p, { submittedBy: "Ray" });
  expect(Object.keys(payload)).toEqual(["document", "dry_run", "submitted_by", "lines", "rush", "extended_turnaround", "paying_by_card"]);
  expect(payload.lines[0]).toEqual({ sku: "IND4000", quantity: 22, description: "Black\n\n6 Medium\n6 Large\n10 Extra Large", item_id: "id0", rate: 10 });
  expect(payload.lines).toHaveLength(6);
  expect(payload.document).toBe("invoice");
  // Books not reachable: lines go without item_id / rate (Zoho looks them up)
  expect(draftPayload(priceLines(b, null)).lines[0]).toEqual({ sku: "IND4000", quantity: 22, description: "Black\n\n6 Medium\n6 Large\n10 Extra Large" });
});

test("cannotSend: no answer, nothing priced, over 40 lines", () => {
  expect(cannotSend({ flags: { document: "" }, lines: [1] })).toMatch(/Invoice or Estimate/);
  expect(cannotSend({ flags: { document: "invoice" }, lines: [] })).toMatch(/Nothing on this order/);
  expect(cannotSend({ flags: { document: "invoice" }, lines: Array(41).fill(1) })).toMatch(/at most 40/);
  expect(cannotSend({ flags: { document: "invoice" }, lines: [1] })).toBe("");
});

test("the grid file is the generated one (never hand-edited) and names its source", () => {
  expect(GRID._source).toMatch(/build-grid\.py from pull-/);
  expect(GRID.fees.addedByZoho).toEqual(["PPFEE1", "PPETD", "PPFEE6"]);
});
