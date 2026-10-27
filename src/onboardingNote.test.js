import { buildOnboardingNote } from "./onboardingNote";

/*
 * buildOnboardingNote was moved verbatim out of App.jsx (2026-10-01). No test imported App.jsx, so
 * the note text had NO coverage before the move. These pin the parts other code depends on.
 */
const data = () => ({
  contactInfo: { Account_Name: "Evergreen", Contact_Name: "Pat", Deal_Name: "Deal 4", Sales_Person: "Ray" },
  products: [
    {
      productName: "Embroidery",
      productType: "garment",
      numberOfGarmentTypes: "1",
      primaryBranches: [
        {
          garmentType: "Richardson 112",
          garmentQuantity: "12",
          countColorSize: "Black: OSFA ×12",
          numberOfGraphics: "1",
          secondaryBranches: [
            { numberOfPlacements: "1", tartiaryBranches: [{ placementLocation: "Front", placementSize: "Small" }] },
          ],
        },
      ],
    },
  ],
  hardDueDate: "No",
  typicalMockup: "Yes",
});

describe("buildOnboardingNote", () => {
  test("returns the note, the 18 print fields and the card counts", () => {
    const r = buildOnboardingNote(data());
    expect(typeof r.content).toBe("string");
    expect(Object.keys(r.printFields)).toHaveLength(18);
    expect(r.cardCounts.embroideryPrints).toBe(r.printFields.Embroidery_Department_Prints);
  });

  test("the labels the revision form's note parser reads are present", () => {
    const { content } = buildOnboardingNote(data());
    expect(content.startsWith("CONTACT INFO\n")).toBe(true);
    expect(content).toContain("Account Name: Evergreen");
    expect(content).toContain("PRODUCT INFORMATION");
    expect(content).toContain("PRINT COUNT SUMMARY");
    expect(content).toContain("ALL DEPARTMENTS");
  });

  test("the embroidery count in the note matches the Deal field", () => {
    const r = buildOnboardingNote(data());
    expect(r.printFields.Embroidery_Department_Prints).toBe(12);
    expect(r.content).toContain("Total: 12");
  });

  test("survives an empty submission", () => {
    expect(() => buildOnboardingNote({})).not.toThrow();
    expect(() => buildOnboardingNote({ products: [] })).not.toThrow();
  });
});

describe("E-69 the note prints the gang sheet's garment colors only when answered", () => {
  const { buildOnboardingNote } = require("./onboardingNote");
  const data = (extra) => ({ contactInfo: {}, products: [{ productName: "DTF Gang Sheet", productType: "gangsheet", numberOfGangSheets: "1", gangSheetWidth: "22", gangSheetHeight: "24", numberOfGraphics: "0", gangGraphics: [], ...extra }], productSelector: ["DTF Gang Sheet#gangsheet"] });
  test("answered -> one line; not answered -> the note is exactly what it was", () => {
    const withIt = buildOnboardingNote(data({ garmentColors: "Black, White" })).content;
    expect(withIt).toContain("Garment Colors (what the transfers go on): Black, White");
    const without = buildOnboardingNote(data({})).content;
    expect(without).not.toContain("Garment Colors");
    expect(withIt.replace("Garment Colors (what the transfers go on): Black, White\n\n", "")).toBe(without);
  });
});


test("E-115: 'Made:' under a product only when it is ordered in (no line = made in house, like every older note)", () => {
  const inHouse = buildOnboardingNote(data());
  expect(inHouse).not.toMatch(/Made: /);
  const d = data();
  d.products[0].sourcing = "Ordered in, ready to go";
  const out = buildOnboardingNote(d);
  expect(out).toMatch(/Product 1: Embroidery\n-{27}\n\nMade: Ordered in, ready to go\n\n/);
});
