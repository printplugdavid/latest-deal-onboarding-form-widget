import { ON_GARMENT, SPLIT_OF, applyGarmentSplits, splitCopy, splitInfo } from "./garmentSplit";
import { computePrints } from "./printMath";
import { buildProductionCards } from "./productionCards";

// E-58 -- Jeb Shippy Deal 1 as onboarded 2026-09-23 (no contact details): two identical hoodies in
// ONE garment type, three graphics, each meant for one hoodie. Counted 6, real 3; the left chest was
// stitched onto both.
const cuffJS = { graphicDescription: "Left sleeve cuff: J.S. over 10/10", numberOfColorsUsed: "1", numberOfPlacements: "1", tartiaryBranches: [{ placementLocation: "Left Sleeve Cuff", placementSize: "Small" }] };
const cuffIP = { graphicDescription: "Left sleeve cuff: I P over 10/10", numberOfColorsUsed: "1", numberOfPlacements: "1", tartiaryBranches: [{ placementLocation: "Left Sleeve Cuff", placementSize: "Small" }] };
const chest = { graphicDescription: "Left chest: dragonfly", numberOfColorsUsed: "10", numberOfPlacements: "1", tartiaryBranches: [{ placementLocation: "Left Chest", placementSize: "Small" }] };
const JEB = {
  garmentType: "Client Owned Carhartt Quarter Zip Hoodies",
  garmentSkus: [{ sku: "CT100617" }],
  countColorSize: "Forest Green\n2- M",
  garmentQuantity: "2",
  numberOfGraphics: "3",
  vendorsUsed: "Client Owned",
  everyGraphicOnEveryGarment: "No",
  secondaryBranches: [cuffJS, cuffIP, chest],
};
const order = (branches) => ({ contactInfo: { Account_Name: "A", Deal_Name: "D" }, products: [{ productName: "Embroidery", productType: "garment", numberOfGarmentTypes: String(branches.length), primaryBranches: branches }], specialInstructions: "x" });
const ED = (data) => computePrints(data.products).ED;

describe("E-58 the copy a split adds", () => {
  test("same garment and graphics; quantity and sizes blank so nothing is counted twice; nothing shared with the original", () => {
    const copy = splitCopy(JEB, 1);
    expect(copy).toMatchObject({ garmentType: JEB.garmentType, garmentSkus: [{ sku: "CT100617" }], vendorsUsed: "Client Owned", numberOfGraphics: "3", garmentQuantity: "", countColorSize: "", [SPLIT_OF]: 1 });
    expect(copy.secondaryBranches).toEqual(JEB.secondaryBranches);
    expect(copy.everyGraphicOnEveryGarment).toBeUndefined(); // the copy has not been asked
    copy.secondaryBranches[0].tartiaryBranches[0].placementLocation = "changed";
    expect(JEB.secondaryBranches[0].tartiaryBranches[0].placementLocation).toBe("Left Sleeve Cuff");
    expect(ED(order([JEB, copy]))).toBe(6); // the blank copy adds no prints of its own
  });
});

describe("E-58 how a garment sits in a split", () => {
  test("original and copy know each other; quantities add up; the last copy can be undone", () => {
    const list = [{ ...JEB, garmentQuantity: "1" }, { garmentType: "Hats", garmentQuantity: "12" }, { ...splitCopy(JEB, 1), garmentQuantity: "1" }];
    expect(splitInfo(list, 0)).toEqual({ copies: [3], splitOf: null, group: [1, 3], quantities: [1, 1], total: 2, canUndo: true });
    expect(splitInfo(list, 2)).toMatchObject({ copies: [], splitOf: 1, group: [1, 3], total: 2, canUndo: false });
    expect(splitInfo(list, 1)).toEqual({ copies: [], splitOf: null, group: [], quantities: [], total: 0, canUndo: false });
  });
  test("a copy can be split again; undo is only offered for the last garment with no copies of its own", () => {
    const list = [JEB, splitCopy(JEB, 1), splitCopy(JEB, 2)];
    expect(splitInfo(list, 0)).toMatchObject({ copies: [2], group: [1, 2, 3], canUndo: false }); // its copy is not last
    expect(splitInfo(list, 1)).toMatchObject({ copies: [3], splitOf: 1, group: [1, 2, 3], canUndo: true });
    expect(splitInfo([JEB, splitCopy(JEB, 1), { garmentType: "Hats" }], 0).canUndo).toBe(false); // something was added after it
    expect(splitInfo([JEB, splitCopy(JEB, 1), splitCopy(JEB, 1)], 0)).toMatchObject({ copies: [2, 3], canUndo: false });
  });
  test("odd input is safe", () => {
    expect(splitInfo(null, 0)).toMatchObject({ copies: [], splitOf: null, group: [] });
    expect(splitInfo([{ [SPLIT_OF]: 1 }], 0)).toMatchObject({ splitOf: null, group: [] }); // cannot be split from itself
    expect(splitInfo([{ [SPLIT_OF]: 9 }], 0)).toMatchObject({ splitOf: null, group: [] }); // or from a garment that is gone
  });
});

describe("E-58 what is submitted", () => {
  const split = () => {
    const a = { ...JEB, garmentQuantity: "1", countColorSize: "Forest Green\n1- M", secondaryBranches: [cuffJS, { ...cuffIP, [ON_GARMENT]: false }, { ...chest, [ON_GARMENT]: true }] };
    const b = { ...splitCopy(JEB, 1), garmentQuantity: "1", countColorSize: "Forest Green\n1- M" };
    b.secondaryBranches = [{ ...cuffJS, [ON_GARMENT]: false }, cuffIP, { ...chest, [ON_GARMENT]: false }];
    return order([a, b]);
  };
  test("the real order, split and ticked: 3 prints, each hoodie with exactly its own graphics", () => {
    expect(ED(order([JEB]))).toBe(6); // as it was entered
    const before = split();
    const snapshot = JSON.stringify(before);
    const out = applyGarmentSplits(before);
    expect(JSON.stringify(before)).toBe(snapshot); // never mutates what the form holds
    const [a, b] = out.products[0].primaryBranches;
    expect(a.secondaryBranches).toEqual([cuffJS, chest]);
    expect(a.numberOfGraphics).toBe("2");
    expect(b.secondaryBranches).toEqual([cuffIP]);
    expect(b.numberOfGraphics).toBe("1");
    expect(b[SPLIT_OF]).toBe(1);
    expect(JSON.stringify(out)).not.toContain(ON_GARMENT); // the screen-only tick is never saved
    expect(ED(out)).toBe(3);
    expect(computePrints(out.products)).toMatchObject({ ED: 3, SD: 0, VD: 0 });
    expect(out.specialInstructions).toBe("x");
  });
  test("the card shows two garments, each with only its own graphics", () => {
    const html = buildProductionCards(applyGarmentSplits(split()), {}).find((c) => c.name === "production-card-embroidery.html").html;
    const blocks = html.split('<div class="garment">').slice(1);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("J.S. over 10/10");
    expect(blocks[0]).toContain("dragonfly");
    expect(blocks[0]).not.toContain("I P over 10/10");
    expect(blocks[1]).toContain("I P over 10/10");
    expect(blocks[1]).not.toContain("dragonfly");
    expect(blocks[1]).not.toContain("J.S. over 10/10");
  });
  test("an order nobody split comes back exactly as it went in", () => {
    const plain = order([JEB]);
    expect(applyGarmentSplits(plain)).toEqual(plain);
    expect(applyGarmentSplits(plain).products[0].primaryBranches[0]).toBe(plain.products[0].primaryBranches[0]); // untouched objects are not even copied
    const allTicked = order([{ ...JEB, secondaryBranches: JEB.secondaryBranches.map((g) => ({ ...g, [ON_GARMENT]: true })) }]);
    expect(applyGarmentSplits(allTicked)).toEqual(plain); // ticks removed, nothing dropped, the count field left alone
    [null, undefined, {}, { products: null }, { products: [null, { productType: "nongarment" }, { productType: "garment" }] }].forEach((d) => expect(applyGarmentSplits(d)).toEqual(d));
  });
  test("unticking every graphic on a split garment leaves it with none (and no prints of its own), not a crash", () => {
    const none = { ...splitCopy(JEB, 1), garmentQuantity: "1", secondaryBranches: JEB.secondaryBranches.map((g) => ({ ...g, [ON_GARMENT]: false })) };
    const out = applyGarmentSplits(order([{ ...JEB, garmentQuantity: "1" }, none]));
    expect(out.products[0].primaryBranches[1]).toMatchObject({ secondaryBranches: [], numberOfGraphics: "0" });
    expect(ED(out)).toBe(3); // only the first garment's three
  });
  test("a tick left behind after the split was undone drops nothing -- a graphic is only left out where the tick can be seen", () => {
    const leftover = order([{ ...JEB, secondaryBranches: [cuffJS, { ...cuffIP, [ON_GARMENT]: false }, chest] }]);
    const out = applyGarmentSplits(leftover);
    expect(out.products[0].primaryBranches[0].secondaryBranches).toEqual([cuffJS, cuffIP, chest]);
    expect(out.products[0].primaryBranches[0].numberOfGraphics).toBe("3");
    expect(ED(out)).toBe(6);
  });
});
