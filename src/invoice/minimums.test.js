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
