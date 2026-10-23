import { screenPrintShortfall, SCREEN_PRINT_MINIMUM } from "./minimums";

const sp = (...branches) => ({ productName: "Screen Printing", productType: "garment", primaryBranches: branches });
const order = (...products) => ({ products });

test("E-109 / D-53: screen print minimum is 12 per order (a flagged exception below it, 10-23)", () => {
  expect(SCREEN_PRINT_MINIMUM).toBe(12);
  expect(screenPrintShortfall(order(sp({ garmentQuantity: "12" })))).toBeNull();
  expect(screenPrintShortfall(order(sp({ garmentQuantity: "4" })))).toMatchObject({ count: 4, minimum: 12 });
  expect(screenPrintShortfall(order(sp({ garmentQuantity: "4" })))).toMatchObject({
    message:
      "Below the 12-piece screen print minimum: this order has 4 garments under Screen Printing. This is an exception, priced at the Under-12 rate. Confirm it with the customer before sending the invoice.",
  });
});

test("tees and hoodies (and client-provided) count together; blank quantity falls back to the sizes", () => {
  expect(screenPrintShortfall(order(sp({ garmentQuantity: "6" }, { garmentQuantity: "", countColorSize: "Black\n6- L" })))).toBeNull();
  expect(screenPrintShortfall(order(sp({ garmentQuantity: "", countColorSize: "Black\n1- XL\n1- 4XL" })))).toMatchObject({ count: 2 });
  expect(screenPrintShortfall(order(sp({})))).toMatchObject({ count: 0 });
});

test("other methods are not limited", () => {
  expect(screenPrintShortfall(order({ productName: "Embroidery", productType: "garment", primaryBranches: [{ garmentQuantity: "2" }] }))).toBeNull();
  expect(screenPrintShortfall(order({ productName: "Stickers", productType: "nongarment", quantityOrdered: "5" }))).toBeNull();
  expect(screenPrintShortfall({})).toBeNull();
});

/* E-123: the minimum follows each print (the pieces that get it), not the order. */
const gr = (graphicDescription, loc, extra = {}) => ({ graphicDescription, numberOfColorsUsed: "1", numberOfPlacements: "1", tartiaryBranches: [{ placementPick: loc }], ...extra });

test("an order of 20 with one print on only 8 is flagged for that print", () => {
  const s = screenPrintShortfall(
    order(sp({ garmentQuantity: "20", everyGraphicOnEveryGarment: "No", secondaryBranches: [gr("Logo", "Left Chest", { garmentsWithThisGraphic: "12" }), gr("Mascot", "Full Back", { garmentsWithThisGraphic: "8" })] }))
  );
  expect(s).toMatchObject({ count: 8, minimum: 12 });
  expect(s.message).toBe(
    "Below the 12-piece screen print minimum: the Full Back (Mascot) print is on 8 garments. Each print is priced by the garments that get it. This is an exception, priced at the Under-12 rate. Confirm it with the customer before sending the invoice."
  );
});

test("6 tees + 6 hoodies with the same print make 12 (no flag); different prints are each under 12", () => {
  const tee = (d) => ({ garmentQuantity: "6", garmentKind: "Tee / Long Sleeve / Tank / Button-up", secondaryBranches: [gr(d, "Left Chest")] });
  const hood = (d) => ({ garmentQuantity: "6", garmentKind: "Hoodie / Crew / Zip", secondaryBranches: [gr(d, "Left Chest")] });
  expect(screenPrintShortfall(order(sp(tee("Logo"), hood("logo"))))).toBeNull();
  expect(screenPrintShortfall(order(sp(tee("Logo"), hood("Mascot")))).message).toMatch(/: 2 prints are on fewer than 12 garments \(Left Chest \(Logo\) on 6; Left Chest \(Mascot\) on 6\)\./);
});
