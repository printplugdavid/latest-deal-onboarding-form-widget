import { VINYL_COLORS, VINYL_CATALOG, catalogFor, splitColorText, readColors, addColorToText, swatchBackground } from "./colorCatalogs";
import { buildProductionCards } from "./productionCards";

const names = (list) => list.map((c) => c.name);

describe("E-41 vinyl chart", () => {
  test("is David's chart: 30 colors, 28 with a HEX, Gold and Silver metallic, spelling fixed", () => {
    expect(VINYL_COLORS).toHaveLength(30);
    expect(VINYL_COLORS.filter((c) => c.hex)).toHaveLength(28);
    expect(names(VINYL_COLORS.filter((c) => c.metallic))).toEqual(["Gold", "Silver"]);
    expect(names(VINYL_COLORS)).toContain("Turquoise");
    expect(names(VINYL_COLORS)).not.toContain("Turqoise");
    VINYL_COLORS.filter((c) => c.hex).forEach((c) => expect(c.hex).toMatch(/^#[0-9a-f]{6}$/));
    expect(new Set(names(VINYL_COLORS)).size).toBe(30);
  });
  test("only the cut-vinyl products get it", () => {
    ["Vinyl", "Heat-Transfer", "Decals"].forEach((p) => expect(catalogFor(p)).toBe(VINYL_CATALOG));
    ["Embroidery", "Screen Printing", "Direct-to-Film", "Stickers", "Banners", "", undefined].forEach((p) =>
      expect(catalogFor(p)).toBe(null)
    );
  });
});

describe("E-41 reading the Colors Used box", () => {
  test("splits on lines, commas, 'and', '&', slashes", () => {
    expect(splitColorText("Red and White\nBlack, Gold & Silver / Pink")).toEqual(["Red", "White", "Black", "Gold", "Silver", "Pink"]);
    expect(splitColorText("  \n ")).toEqual([]);
    expect(splitColorText(null)).toEqual([]);
  });
  test("matches whole names only -- Dark Red is not Red", () => {
    const r = readColors("Dark Red\nlight blue", VINYL_CATALOG);
    expect(names(r.matched)).toEqual(["Dark Red", "Light Blue"]);
    expect(r.unmatched).toEqual([]);
  });
  test("accepts matte/matt, gray/grey, the old Turqoise spelling, any case", () => {
    const r = readColors("MATTE WHITE, matt black, Gray, dark gray, turqoise", VINYL_CATALOG);
    expect(names(r.matched)).toEqual(["Matt White", "Matte Black", "Grey", "Dark Grey", "Turquoise"]);
  });
  test("anything not on the chart is reported as typed, never guessed", () => {
    const r = readColors("Red\nRoyal Bleu\nWhite for the business name", VINYL_CATALOG);
    expect(names(r.matched)).toEqual(["Red"]);
    expect(r.unmatched).toEqual(["Royal Bleu", "White for the business name"]);
  });
  test("a repeated color counts once; no catalogue means nothing to say", () => {
    expect(names(readColors("Red, red, RED", VINYL_CATALOG).matched)).toEqual(["Red"]);
    expect(readColors("Red", null)).toEqual({ matched: [], unmatched: [] });
  });
});

describe("E-41 picking a color", () => {
  test("adds it on its own line and keeps what was typed", () => {
    expect(addColorToText("", "Red", VINYL_CATALOG)).toBe("Red");
    expect(addColorToText("White for the name\n", "Red", VINYL_CATALOG)).toBe("White for the name\nRed");
  });
  test("does not add a color already there, however it was spelled", () => {
    expect(addColorToText("matte black", "Matte Black", VINYL_CATALOG)).toBe("matte black");
    expect(addColorToText("Red and White", "White", VINYL_CATALOG)).toBe("Red and White");
  });
  test("ignores a name that is not on the chart", () => {
    expect(addColorToText("Red", "Chartreuse", VINYL_CATALOG)).toBe("Red");
  });
  test("metallics get a sheen instead of a flat color", () => {
    expect(swatchBackground(VINYL_COLORS.filter((c) => c.name === "Gold")[0])).toMatch(/gradient/);
    expect(swatchBackground(VINYL_COLORS.filter((c) => c.name === "Red")[0])).toBe("#b82c35");
  });
});

describe("E-41 swatches on the production card", () => {
  const data = (productName, colorsUsed) => ({
    contactInfo: { Account_Name: "A", Deal_Name: "D" },
    products: [{ productName, productType: "garment", primaryBranches: [{ garmentType: "Tee", garmentQuantity: "2", secondaryBranches: [{ graphicDescription: "Logo", colorsUsed }] }] }],
  });
  const vinylCard = (d) => buildProductionCards(d, null).filter((f) => /vinyl|embroidery|screenprint/.test(f.name))[0].html;
  test("a vinyl job with chart colors shows a swatch per color", () => {
    const html = vinylCard(data("Heat-Transfer", "Red and White\nGold"));
    expect(html).toMatch(/class="swatch"/);
    expect((html.match(/class="swatch"/g) || []).length).toBe(3);
    expect(html).toMatch(/#b82c35/);
  });
  test("no chart colors written -> the card is exactly what it was", () => {
    const plain = vinylCard(data("Heat-Transfer", "see mockup"));
    expect(plain).not.toMatch(/class="swatch"/);
  });
  test("other departments never get vinyl swatches, even if the word matches", () => {
    expect(vinylCard(data("Embroidery", "Red and White"))).not.toMatch(/class="swatch"/);
    expect(vinylCard(data("Screen Printing", "Red"))).not.toMatch(/class="swatch"/);
  });
});
