import { SIZE_GROUPS, cleanVariants, formatSizeVariants } from "./sizeVariants";
import { buildOnboardingNote } from "./onboardingNote";
import { buildProductionCards, FILE_NEEDED } from "./productionCards";
import { orderLines } from "./qc/qcRules";

// E-67 -- a placement at a different size on some garment sizes; E-65 -- the file each print method needs.
const order = (variants, productName) => ({
  contactInfo: {},
  productSelector: [(productName || "Screen Printing") + "#garment"],
  products: [{ productName: productName || "Screen Printing", productType: "garment", numberOfGarmentTypes: "1", primaryBranches: [{ garmentType: "Gildan 5000", garmentQuantity: "30", countColorSize: "Black\n10- YM\n20- L", numberOfGraphics: "1", secondaryBranches: [{ graphicDescription: "Front logo", numberOfColorsUsed: "1", numberOfPlacements: "1", tartiaryBranches: [{ placementLocation: "Full Front", sizeAndDimensions: "10 in wide", placementSize: "", ...(variants ? { sizeVariants: variants } : {}) }] }] }] }],
});

describe("E-67 different size on some garment sizes", () => {
  test("groups to pick from; half-filled rows are ignored; one readable line", () => {
    expect(SIZE_GROUPS).toContain("Youth");
    expect(cleanVariants([{ sizes: "Youth", dimensions: "8 in wide" }, { sizes: "2XL and up", dimensions: "" }, null])).toEqual([{ sizes: "Youth", dimensions: "8 in wide" }]);
    expect(formatSizeVariants([{ sizes: "Youth", dimensions: "8 in wide" }, { sizes: "2XL and up", dimensions: "12 in wide" }])).toBe("Youth: 8 in wide · 2XL and up: 12 in wide");
    expect(formatSizeVariants(undefined)).toBe("");
  });
  test("the note gets one line only when given -- otherwise it is exactly what it was", () => {
    const withIt = buildOnboardingNote(order([{ sizes: "Youth", dimensions: "8 in wide" }])).content;
    const without = buildOnboardingNote(order(null)).content;
    expect(withIt).toContain("Size by Garment Size: Youth: 8 in wide");
    expect(without).not.toContain("Size by Garment Size");
    expect(withIt.replace("Size by Garment Size: Youth: 8 in wide\n\n", "")).toBe(without);
    expect(buildOnboardingNote(order([{ sizes: "Youth", dimensions: "" }])).content).toBe(without); // half-filled = nothing
  });
  test("the card's placement tag and the QC snapshot carry it", () => {
    const html = buildProductionCards(order([{ sizes: "Youth", dimensions: "8 in wide" }]), {}).find((c) => c.name === "production-card-screenprint.html").html;
    expect(html).toContain("<b>by garment size:</b> Youth: 8 in wide");
    expect(orderLines(order([{ sizes: "Youth", dimensions: "8 in wide" }]))[0].graphics[0].placements[0]).toBe("Full Front · 10 in wide · by garment size: Youth: 8 in wide");
  });
});

describe("E-65 the Graphic Design card says what file each graphic needs", () => {
  const gd = (name) => buildProductionCards(order(null, name), {}).find((c) => c.name === "production-card-graphicdesign.html").html;
  test("David's list, per print method", () => {
    expect(gd("Embroidery")).toContain("DST - a digitized embroidery file");
    expect(gd("Screen Printing")).toContain("color-separated - or run through Action Seps");
    expect(gd("Direct-to-Film")).toContain("PNG - transparent background");
    expect(gd("Direct-to-Garment")).toContain("PNG - transparent background");
    expect(gd("Heat-Transfer")).toContain("Vector cut file");
  });
  test("a method not on the list shows no line rather than a guess", () => {
    expect(FILE_NEEDED.Vinyl).toBeUndefined();
    expect(gd("Vinyl")).not.toContain("File needed");
  });
});

// E-66 -- the onboarding note edited by hand after the saved order (Jeb Shippy Deal 1: 3:20 PM saved, 3:50 PM edited).
describe("E-66 note edited after the order was saved", () => {
  const { noteEditedAfterSave } = require("./zohoFiles");
  const saved = { Created_Time: "2026-09-23T15:20:30-06:00" };
  test("Jeb Shippy's real times -> warned, with the edit time", () => {
    const d = noteEditedAfterSave({ Created_Time: "2026-09-23T15:20:49-06:00", Modified_Time: "2026-09-23T15:50:16-06:00" }, saved);
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe("2026-09-23T21:50:16.000Z");
  });
  test("written once by the form, or touched within the grace minutes -> nothing", () => {
    expect(noteEditedAfterSave({ Created_Time: "2026-09-23T15:20:49-06:00", Modified_Time: "2026-09-23T15:20:49-06:00" }, saved)).toBe(null);
    expect(noteEditedAfterSave({ Created_Time: "2026-09-23T15:20:49-06:00", Modified_Time: "2026-09-23T15:23:00-06:00" }, saved)).toBe(null);
    expect(noteEditedAfterSave(null, saved)).toBe(null);
    expect(noteEditedAfterSave({ Modified_Time: "2026-09-23T15:50:16-06:00" }, null)).toBe(null);
  });
  test("an amendment's newer note does not trip it -- the saved order is newer too", () => {
    expect(noteEditedAfterSave({ Created_Time: "2026-10-06T10:00:00-06:00", Modified_Time: "2026-10-06T10:00:05-06:00" }, { Created_Time: "2026-10-06T10:00:01-06:00" })).toBe(null);
  });
});

