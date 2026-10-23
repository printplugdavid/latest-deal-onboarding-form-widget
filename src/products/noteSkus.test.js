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

/* E-101 / D-49: a client-owned garment prints the upcharge answer after Vendors Used; any other garment reads as before. */
const garmentDeal = (branch) => ({
  contactInfo: { Account_Name: "Evergreen", Contact_Name: "Pat", Deal_Name: "Deal 4", Sales_Person: "Ray" },
  products: [
    {
      productName: "Embroidery",
      productType: "garment",
      numberOfGarmentTypes: "1",
      primaryBranches: [{ garmentType: "Carhartt quarter zip (client's)", garmentQuantity: "2", numberOfGraphics: "0", vendorsUsed: "Client Owned", ...branch }],
    },
  ],
  hardDueDate: "No",
  typicalMockup: "Yes",
});

test("client-owned garment: the upcharge line follows Vendors Used", () => {
  const c = buildOnboardingNote(garmentDeal({ garmentSkus: [{ sku: "PPCO", productSource: "clientOwned" }], clientOwnedUpcharge: "Yes", clientOwnedUpchargePercent: 10 })).content;
  expect(c).toMatch(/Vendors Used: Client Owned\n\n10% Client-Owned Garment Upcharge Added\?: Yes\n\nSpecial Instructions/);
});

test("the percent recorded on the order is the one printed (the rule may change later)", () => {
  const c = buildOnboardingNote(garmentDeal({ garmentSkus: [{ sku: "ppco" }], clientOwnedUpcharge: "No", clientOwnedUpchargePercent: 12 })).content;
  expect(c).toMatch(/12% Client-Owned Garment Upcharge Added\?: No/);
});

test("a garment we supply: no upcharge line", () => {
  const c = buildOnboardingNote(garmentDeal({ garmentSkus: [{ sku: "CT100617" }], vendorsUsed: "San Mar" })).content;
  expect(c).not.toMatch(/Client-Owned/);
});

test("mixed product: one client-provided garment type + one we order; asked once under the product", () => {
  const d = garmentDeal({ garmentSkus: [{ sku: "PPCO", productSource: "clientOwned" }] });
  d.products[0] = { ...d.products[0], numberOfGarmentTypes: "2", clientOwnedUpcharge: "Yes", clientOwnedUpchargePercent: 10 };
  d.products[0].primaryBranches.push({ garmentType: "Port & Company Core Cotton Tee", garmentQuantity: "6", numberOfGraphics: "0", vendorsUsed: "San Mar", garmentSkus: [{ sku: "PC54" }] });
  const c = buildOnboardingNote(d).content;
  expect(c).toMatch(/Number of Garment Types: 2\n\n10% Client-Owned Garment Upcharge Added\?: Yes\n\n/);
  expect(c.match(/Client-Owned Garment Upcharge Added/g)).toHaveLength(1);
  expect(c).toMatch(/SKU\(s\): PPCO/);
  expect(c).toMatch(/SKU\(s\): PC54/);
});

test("E-122: no answer stored (the form no longer asks) -> the line says Yes, once per product", () => {
  const c = buildOnboardingNote(garmentDeal({ garmentSkus: [{ sku: "PPCO", productSource: "clientOwned" }] })).content;
  expect(c).toMatch(/Number of Garment Types: 1\n\n10% Client-Owned Garment Upcharge Added\?: Yes\n\n/);
  expect(c.match(/Client-Owned Garment Upcharge Added/g)).toHaveLength(1);
});
