import { artFees, artQuestionsOpen, suggestCharges } from "./otherCharges";
import { familyOf, sqftCalc } from "./sqft";
import { buildBillingLines } from "./billingLines";

// E-154 (David 10-29): art fees per graphic, from that graphic's answers.
const g = (o) => ({ graphicDescription: "Logo", ...o });
const garment = (productName, graphics) => ({ productName, productType: "garment", primaryBranches: [{ garmentQuantity: "12", secondaryBranches: graphics }] });
const fees = (d) => artFees(d).map((f) => [f.sku, f.quantity, f.on]);

describe("E-154 art fees", () => {
  test("screen print: not print ready -> design half hour; no vector -> vector fee; both can apply, per graphic", () => {
    const d = {
      products: [
        garment("Screen Printing", [
          g({ isGraphicPrintReady: false, hasPrintReadyVector: "No", graphicDescription: "Chest" }),
          g({ isGraphicPrintReady: true, hasPrintReadyVector: "No", graphicDescription: "Back" }),
          g({ isGraphicPrintReady: true, hasPrintReadyVector: "Yes" }),
        ]),
      ],
    };
    expect(fees(d)).toEqual([
      ["PPGD1", 1, true],
      ["PPFEE3", 2, true],
    ]);
    expect(artFees(d)[1].description).toBe("Vector Fee - Screen print graphic 1: Chest; Screen print graphic 2: Back");
  });
  test("embroidery: no DST -> digitizing; DTF / DTG / heat transfer: not ready -> design half hour, never a vector fee", () => {
    const d = {
      products: [
        garment("Embroidery", [g({ hasDigitizedFile: "No", isGraphicPrintReady: false }), g({ hasDigitizedFile: "Yes" })]),
        garment("Direct-to-Film", [g({ isGraphicPrintReady: false, hasPrintReadyVector: "No" })]),
        garment("Heat-Transfer", [g({ isGraphicPrintReady: "Yes" })]),
      ],
    };
    expect(fees(d)).toEqual([
      ["PPGD1", 1, true],
      ["PPEDF", 1, true],
    ]);
  });
  test("older / robot data with the words Yes / No reads the same as the tick box", () => {
    expect(fees({ products: [garment("Direct-to-Garment", [g({ isGraphicPrintReady: "No" }), g({ isGraphicPrintReady: "Yes" })])] })).toEqual([["PPGD1", 1, true]]);
  });
  test("switched off by the rep, or already added by hand -> not on (never twice)", () => {
    const base = { products: [garment("Screen Printing", [g({ isGraphicPrintReady: false, hasPrintReadyVector: "No" })])] };
    expect(fees({ ...base, artFeesOff: ["PPGD1"] })).toEqual([["PPGD1", 1, false], ["PPFEE3", 1, true]]);
    const hand = artFees({ ...base, otherCharges: [{ sku: "PPFEE3", quantity: "1" }] }).find((f) => f.sku === "PPFEE3");
    expect(hand).toMatchObject({ on: false, byHand: true });
  });
  test("blank answers add nothing and are counted for the rep", () => {
    const d = { products: [garment("Screen Printing", [g({ isGraphicPrintReady: true })]), garment("Embroidery", [g({}), g({})])] };
    expect(fees(d)).toEqual([]);
    expect(artQuestionsOpen(d)).toEqual({ vector: 1, digitized: 2 });
  });
  test("the art fees land on the draft lines; vector / digitizing are no longer suggestions", () => {
    const d = {
      billingDocument: "Invoice",
      isRepeatOrder: "No",
      products: [garment("Embroidery", [g({ hasDigitizedFile: "No" })]), garment("Screen Printing", [g({ isGraphicPrintReady: true, hasPrintReadyVector: "No" })])],
    };
    const lines = buildBillingLines(d).lines.filter((l) => ["PPGD1", "PPFEE3", "PPEDF"].includes(l.sku)).map((l) => [l.sku, l.quantity]);
    expect(lines).toEqual([["PPFEE3", 1], ["PPEDF", 1]]);
    expect(suggestCharges(d).map((s) => s.sku)).not.toEqual(expect.arrayContaining(["PPEDF"]));
    expect(suggestCharges(d).map((s) => s.sku)).not.toEqual(expect.arrayContaining(["PPFEE3"]));
  });
});

// E-156 (David 10-29): the square-foot calculator.
describe("E-156 square feet", () => {
  test("the family comes from any tier the rep picked", () => {
    expect(familyOf(["PPSCD3"])).toBe("decalSingle");
    expect(familyOf(["ppmcd"])).toBe("decalMulti");
    expect(familyOf(["PPVS2"])).toBe("stencil");
    expect(familyOf(["PRIVB"])).toBe("banner");
    expect(familyOf(["PRIVB3"])).toBe(""); // a standard-size banner stays per piece
    expect(familyOf(["PPCM5"])).toBe(""); // magnets stay per piece
  });
  test("decals: tier by NUMBER of decals, billed by total square feet (David's example: 8 x 12x18 = 12 sq ft, 1-10 tier)", () => {
    const c = sqftCalc({ skus: ["PPSCD5"], count: "8", widthIn: "12", heightIn: "18" });
    expect(c).toMatchObject({ family: "decalSingle", each: 1.5, total: 12, sku: "PPSCD" });
    expect(c.line).toMatchObject({ sku: "PPSCD", quantity: 12 });
    expect(sqftCalc({ skus: ["PPSCD"], count: 60, widthIn: 6, heightIn: 6 }).sku).toBe("PPSCD6"); // 50-75 decals
    expect(sqftCalc({ skus: ["PPMCD"], count: 150, widthIn: 3, heightIn: 3 }).sku).toBe("PPMCD8"); // 101+
  });
  test("stencils: tier by TOTAL square feet (9.5 sq ft stays in the first tier, 12 sq ft is 10-14)", () => {
    expect(sqftCalc({ skus: ["PPVS"], count: 1, widthIn: 36, heightIn: 38 }).sku).toBe("PPVS"); // 9.5 sq ft
    expect(sqftCalc({ skus: ["PPVS"], count: 2, widthIn: 24, heightIn: 36 })).toMatchObject({ total: 12, sku: "PPVS1" });
  });
  test("custom banner: PRIVB x total square feet", () => {
    expect(sqftCalc({ skus: ["PRIVB"], count: 2, widthIn: 36, heightIn: 72 })).toMatchObject({ total: 36, sku: "PRIVB" });
  });
  test("missing size or quantity -> told what to enter, no line", () => {
    expect(sqftCalc({ skus: ["PPSCD"], count: 5 })).toEqual({ family: "decalSingle", why: "enter the width and height in inches" });
    expect(sqftCalc({ skus: ["PPSCD"], widthIn: 2, heightIn: 2 })).toEqual({ family: "decalSingle", why: "enter the quantity" });
  });
  test("on the draft: a decal product becomes tier x sq ft; without a size it goes to the hand list, never x pieces", () => {
    const decal = (o) => ({ productName: "Decals", productType: "nongarment", productSkus: [{ sku: "PPSCD" }], quantityOrdered: "8", ...o });
    const b = buildBillingLines({ billingDocument: "Invoice", products: [decal({ sqftWidthIn: "12", sqftHeightIn: "18" })] });
    expect(b.lines.map((l) => [l.sku, l.quantity])).toEqual([["PPSCD", 12]]);
    const none = buildBillingLines({ billingDocument: "Invoice", products: [decal({})] });
    expect(none.lines).toEqual([]);
    expect(none.handList[0]).toMatchObject({ what: "Decals", reason: "square-foot item: enter the width and height in inches" });
  });
});
