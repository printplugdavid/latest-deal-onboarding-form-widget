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
