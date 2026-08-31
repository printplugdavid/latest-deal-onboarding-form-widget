/*
 * Golden fixtures for the print calculation.
 *
 * Each fixture is a REAL onboarding payload paired with the print counts CRM
 * actually stored for that deal. If anyone changes the calculation without
 * meaning to, these fail.
 *
 * Keep this file identical in the onboarding form and the revision form. It is
 * what stops the two from drifting apart.
 */
import { computePrints, departmentFor } from "./printMath";

// Deal 5249739000122719481 -- "Deal 6 - HaileyAI - Embroidery - Polo - A"
// CRM stored: Embroidery_Department_Prints 1, all others 0.
const haileyAI = [
  {
    productName: "Embroidery",
    productType: "garment",
    numberOfGarmentTypes: "1",
    primaryBranches: [
      {
        garmentType: "Nike Polo NKDC1963",
        countColorSize: "NKDC1963 Black 1 Extra Large",
        numberOfGraphics: "1",
        garmentQuantity: "1",
        secondaryBranches: [
          {
            numberOfColorsUsed: "1",
            underbase: "None",
            numberOfPlacements: "1",
            tartiaryBranches: [{ placementLocation: "Left Chest" }],
          },
        ],
      },
    ],
  },
];

describe("computePrints — golden fixtures", () => {
  test("HaileyAI embroidery polo matches the count CRM stored", () => {
    const r = computePrints(haileyAI);
    expect(r.ED).toBe(1);
    expect(r.SD).toBe(0);
    expect(r.VD).toBe(0);
  });

  test("a revision reuses the same rules with a different quantity", () => {
    // Same garment, but 4 of them being redone.
    const synth = JSON.parse(JSON.stringify(haileyAI));
    synth[0].primaryBranches[0].garmentQuantity = "4";
    expect(computePrints(synth).ED).toBe(4);
  });

  test("screen print counts colors, placements, underbase and iron pass", () => {
    const r = computePrints([
      {
        productName: "Screen Printing",
        productType: "garment",
        premiumIronPass: "Yes",
        primaryBranches: [
          {
            garmentQuantity: "48",
            secondaryBranches: [
              { numberOfColorsUsed: "3", numberOfPlacements: "2", underbase: "Single-pass" },
            ],
          },
        ],
      },
    ]);
    // actual 48*3*2 = 288, projected 48*(1+1) = 96
    expect(r.actual.SD).toBe(288);
    expect(r.projected.SD).toBe(96);
    expect(r.SD).toBe(384);
  });

  test("heat-press applications double", () => {
    const dtf = computePrints([
      {
        productName: "Direct-to-Film",
        productType: "garment",
        primaryBranches: [
          { garmentQuantity: "10", secondaryBranches: [{ numberOfPlacements: "1" }] },
        ],
      },
    ]);
    expect(dtf.VD).toBe(20);
  });

  test("unrecognised nongarment products fall to Outsourced", () => {
    const r = computePrints([
      { productName: "Business Cards", productType: "nongarment", quantityOrdered: "250" },
    ]);
    expect(r.outsourced).toBe(250);
    expect(r.VD).toBe(0);
  });
});

describe("departmentFor", () => {
  test("maps applications to the department that owns the reprint", () => {
    expect(departmentFor("Screen Printing", "garment")).toBe("Screen Printing");
    expect(departmentFor("Embroidery", "garment")).toBe("Embroidery");
    expect(departmentFor("Direct-to-Film", "garment")).toBe("Vinyl & Digital Print");
    expect(departmentFor("Stickers", "nongarment")).toBe("Vinyl & Digital Print");
    expect(departmentFor("Business Cards", "nongarment")).toBe("Outsourced");
    expect(departmentFor("Graphic Design", "graphic")).toBe("Graphic Design");
  });

  test("tolerates the legacy leading space on historical Vinyl payloads", () => {
    expect(departmentFor(" Vinyl", "garment")).toBe("Vinyl & Digital Print");
  });
});
