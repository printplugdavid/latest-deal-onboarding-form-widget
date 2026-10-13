import { lumpedSignals, lumpedExplanation, lumpedConcerns, LUMPED_NOTE_LINE } from "./lumpedOrder";
import { buildOnboardingNote } from "./onboardingNote";
import { parseNoteToForm } from "./amendment/noteToForm";
import { sumSizeCounts, checkGarmentQuantity } from "./quantityCheck";

// Ammo Squared Deal 12, embroidery garment, as onboarded (docs/03 2026-10-06 (3)).
const AMMO = {
  garmentType: "112T Richardson Tactical Hats (no button on top) \n112PT Printed Richardson Tactical Hats (no button on top) ",
  garmentSkus: [{ sku: "112T" }, { sku: "112PT" }],
  countColorSize: "112T \n200- Green \n200- Black \n\n112PT\n200- Multicam tropic/loden ",
  garmentQuantity: "600",
  numberOfGraphics: "4",
  secondaryBranches: [
    { graphicDescription: "Black box snake logo 2.5\" wide on Left panel of:\n200- Green 112T\n200- Multicam tropic/Loden 112PT", numberOfPlacements: "1", tartiaryBranches: [{ placementSize: "Small" }] },
    { graphicDescription: "Left Side/Bottom of hat ammo squared URL in Black Thread 2\" wide", numberOfPlacements: "1", tartiaryBranches: [{ placementSize: "Small" }] },
    { graphicDescription: "Gray box snake logo on Left panel 2.5\" wide on:\n200- Black 112T", numberOfPlacements: "1", tartiaryBranches: [{ placementSize: "Small" }] },
    { graphicDescription: "Left Side/Bottom of hat ammo squared URL 2\" wide", numberOfPlacements: "1", tartiaryBranches: [{ placementSize: "Small" }] },
  ],
};
// Flute Summit Deal 2: seven styles, seven logos, "Logo #7 on: DT6100 Hoodie Olive XL ..."
const FLUTE = {
  garmentType: "DT6100 District Hoodies\nDT6104 District Crewnecks\nPC340 Port & Co Shirts",
  garmentSkus: [{ sku: "DT6100" }, { sku: "DT6104" }, { sku: "PC340" }],
  countColorSize: "",
  numberOfGraphics: "3",
  secondaryBranches: [
    { graphicDescription: "Logo #7 on: DT6100 Hoodie Olive XL, DT6104 Crewneck Olive XL" },
    { graphicDescription: "Logo #8 on: PC54LS Long Sleeve XL" },
    { graphicDescription: "Logo #1 on: PC340 T-Shirt Black XL" },
  ],
};
// The ordinary case: one shirt style, front and back.
const PLAIN = {
  garmentType: "Port and Company Shirt PC43",
  garmentSkus: [{ sku: "PC43" }],
  countColorSize: "Navy\n40- M\n40- L\n20- XL",
  numberOfGraphics: "2",
  secondaryBranches: [{ graphicDescription: "Tigers Volleyball Logo" }, { graphicDescription: "Sponsors on the back" }],
};

describe("E-42 -- spotting an order lumped into one garment type", () => {
  test("Ammo Squared and Flute Summit are both flagged, strongly", () => {
    const a = lumpedSignals(AMMO);
    expect(a.suspect).toBe(true);
    expect(a.strong).toBe(true);
    expect(a.graphics).toBe(4);
    expect(a.scoped).toEqual(expect.arrayContaining([1, 3]));
    expect(lumpedExplanation(a)).toMatch(/2 SKUs/);
    const f = lumpedSignals(FLUTE);
    expect(f.strong).toBe(true);
    expect(f.scoped).toEqual([1, 2, 3]);
  });
  test("one style, one color, front + back: not asked at all", () => {
    const p = lumpedSignals(PLAIN);
    expect(p.suspect).toBe(false);
    expect(lumpedExplanation(p)).toBe("");
  });
  test("one graphic is never a concern, however many styles", () => {
    expect(lumpedSignals({ ...FLUTE, numberOfGraphics: "1", secondaryBranches: [FLUTE.secondaryBranches[0]] }).suspect).toBe(false);
  });
  test("two colors + two graphics: asked, but gently (nothing scopes itself)", () => {
    const s = lumpedSignals({ ...PLAIN, countColorSize: "Navy\n40- M\nRed\n20- XL" });
    expect(s.suspect).toBe(true);
    expect(s.strong).toBe(false);
    expect(lumpedExplanation(s)).toMatch(/2 colors and 2 graphics/);
  });
  test("ink color in a description does not count as scoping when the garments are one color", () => {
    const s = lumpedSignals({ ...PLAIN, garmentSkus: [{ sku: "PC43" }, { sku: "PC43Y" }], secondaryBranches: [{ graphicDescription: "White logo, left chest" }, { graphicDescription: "Back" }] });
    expect(s.suspect).toBe(true);
    expect(s.strong).toBe(false);
  });
  test("empty and odd input is safe", () => {
    [undefined, null, {}, { secondaryBranches: "x", garmentSkus: null }].forEach((g) => expect(lumpedSignals(g).suspect).toBe(false));
    expect(lumpedConcerns(undefined)).toEqual([]);
  });
});

describe("E-42 -- what is still open on an order", () => {
  const order = (answer) => [
    { productName: "Screen Printing", productType: "garment", primaryBranches: [PLAIN] },
    { productName: "Embroidery", productType: "garment", primaryBranches: [{ ...AMMO, everyGraphicOnEveryGarment: answer }] },
    { productName: "Stickers", productType: "nongarment" },
  ];
  test("unanswered and No are both listed; Yes clears it", () => {
    expect(lumpedConcerns(order(undefined)).map((c) => [c.label, c.answer, c.strong])).toEqual([["Embroidery - Garment 1", "", true]]);
    expect(lumpedConcerns(order("No"))[0].answer).toBe("No");
    expect(lumpedConcerns(order("Yes"))).toEqual([]);
  });
});

describe("E-42 -- the note", () => {
  const data = (answer) => ({
    contactInfo: {},
    products: [{ productName: "Embroidery", productType: "garment", numberOfGarmentTypes: "1", primaryBranches: [{ ...AMMO, everyGraphicOnEveryGarment: answer }] }],
  });
  test("a No is printed as a NOTE line; Yes and unanswered leave the note exactly as it was", () => {
    const base = buildOnboardingNote(data(undefined)).content;
    expect(buildOnboardingNote(data("Yes")).content).toBe(base);
    expect(base).not.toContain(LUMPED_NOTE_LINE);
    const no = buildOnboardingNote(data("No")).content;
    expect(no).toContain(LUMPED_NOTE_LINE);
    expect(no.replace(LUMPED_NOTE_LINE + "\n\n", "")).toBe(base);
  });
  test("the counts are not touched by the answer", () => {
    expect(buildOnboardingNote(data("No")).printFields).toEqual(buildOnboardingNote(data(undefined)).printFields);
  });
  test("the amendment's note reader still rebuilds the same order from a note carrying the line", () => {
    const opts = ["Embroidery#garment"];
    const a = parseNoteToForm(buildOnboardingNote(data(undefined)).content, opts).values;
    const b = parseNoteToForm(buildOnboardingNote(data("No")).content, opts).values;
    expect(b.products[0].primaryBranches[0].garmentQuantity).toBe(a.products[0].primaryBranches[0].garmentQuantity);
    expect(b.products[0].primaryBranches[0].secondaryBranches.length).toBe(4);
    expect(JSON.stringify(b.products)).toBe(JSON.stringify(a.products));
  });
});

describe("E-44 -- a typed subtotal is not a quantity", () => {
  test("Ammo Squared's '(200 total)' no longer doubles the sum", () => {
    const text = "Military Green (200 total) \n5- Small\n19- Medium \n58- Large \n53- XL\n40- 2XL\n25- 3XL ";
    expect(sumSizeCounts(text).sum).toBe(200);
    expect(checkGarmentQuantity(text, "200")).toBe(null);
    expect(sumSizeCounts("Black (75 total)\n50- XL\n25- 3XL").sum).toBe(75);
  });
  test("other ways of writing a total", () => {
    expect(sumSizeCounts("Total: 30\n10- S\n20- M").sum).toBe(30);
    expect(sumSizeCounts("10- S\n20- M\n30 total").sum).toBe(30);
    expect(sumSizeCounts("10- S, 20- M (total of 30)").sum).toBe(30);
    expect(sumSizeCounts("12 pcs total\n6- L\n6- XL").sum).toBe(12);
  });
  test("real counts are still counted, and a real mismatch still warns", () => {
    expect(sumSizeCounts("Black 5- Small, 5- Medium, 7- Large, 6- XL, 1- 4XL").sum).toBe(24);
    expect(checkGarmentQuantity("Black (200 total)\n50- XL\n25- 3XL", "200").sum).toBe(75);
    expect(sumSizeCounts("200- Green\n200- Black").sum).toBe(400);
  });
});
