import { buildOnboardingNote } from "../onboardingNote";

/* E-100: a non-garment line prints "SKU(s):" only when a Books product was picked, so every older note reads as before. */
const deal = (extra) => ({
  contactInfo: { Account_Name: "Evergreen", Contact_Name: "Pat", Deal_Name: "Deal 4", Sales_Person: "Ray" },
  products: [{ productName: "Decals", productType: "nongarment", numberOfGraphics: "0", quantityOrdered: "50", vendorsUsed: "In house", ...extra }],
  hardDueDate: "No",
  typicalMockup: "Yes",
});

test("no Books product picked: the non-garment block is unchanged", () => {
  const a = buildOnboardingNote(deal({})).content;
  const b = buildOnboardingNote(deal({ productSkus: [{ sku: "" }] })).content;
  expect(a).toBe(b);
  expect(a).not.toMatch(/SKU\(s\)/);
});

test("picked products follow Vendors Used as one line", () => {
  const c = buildOnboardingNote(deal({ productSkus: [{ sku: "PPCSS", productId: "1", productName: "Custom Square Stickers - White - 3x3\"", productSource: "books" }, { sku: "PPCSS1" }] })).content;
  expect(c).toMatch(/Vendors Used: In house\n\nSKU\(s\): PPCSS, PPCSS1\n\n/);
});
