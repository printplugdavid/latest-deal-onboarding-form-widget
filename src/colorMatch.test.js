import { buildColorMatches, matchesFor, nearestThreads, nearestVinyls, officialThreadsForPantone, officialPantoneForThread, COLOR_MATCH_CAVEAT } from "./colorMatch";
import { findThread, findPantone } from "./colorLibrary";
import { buildProductionCards } from "./productionCards";

const garment = (productName, ...colors) => ({
  productName,
  productType: "garment",
  primaryBranches: [{ garmentType: "Tee", garmentQuantity: "2", secondaryBranches: colors.map((c) => ({ graphicDescription: "Logo", colorsUsed: c })) }],
});
const order = (...products) => ({ contactInfo: { Account_Name: "A", Deal_Name: "D" }, products });

describe("E-48 Madeira's official Pantone <-> thread pairs", () => {
  test("load, and work in both directions", () => {
    const t = findThread("1007").filter((x) => x.line === "Classic Rayon")[0];
    expect(officialPantoneForThread(t).code).toBe("426 C");
    expect(officialThreadsForPantone("426 C").map((x) => x.code)).toContain("1007");
    expect(officialThreadsForPantone("not a code")).toEqual([]);
    expect(officialPantoneForThread(null)).toBe(null);
  });
});

describe("E-48 closest counterparts", () => {
  test("one thread per catalogue, closest first within each", () => {
    const n = nearestThreads("#aa182c");
    expect(n.map((x) => x.item.brand)).toEqual(["Madeira Polyneon", "Madeira Classic Rayon", "Marathon Polyester"]);
    n.forEach((x) => expect(x.difference).toBeLessThan(15));
  });
  test("vinyl: the closest STOCKED color always; an order-in one only when clearly closer", () => {
    const v = nearestVinyls("#b0000d"); // ORACAL Red, stocked
    expect(v[0].item.name).toBe("Red");
    expect(v[0].item.stocked).toBe(true);
    expect(v).toHaveLength(1);
    nearestVinyls("#123456").forEach((x, i) => expect(i === 0 ? x.item.stocked : !x.item.stocked).toBe(true));
  });
});

describe("E-48 a color's matches in the other departments", () => {
  const src = (kind, extra) => ({ kind, metallic: false, ...extra });
  test("a Pantone ink -> house ink, thread in each catalogue, vinyl", () => {
    const p = findPantone("187 C").color;
    const ms = matchesFor(src("pantone", { hex: p.hex, pantone: p }));
    expect(ms.filter((x) => x.dept === "Screen Print")[0]).toMatchObject({ label: "House Ruby Red", quality: "near-identical", basis: "computed" });
    expect(ms.filter((x) => x.dept === "Embroidery").length).toBeGreaterThanOrEqual(3);
    expect(ms.filter((x) => x.dept === "Vinyl")[0].note).toBe("in stock");
  });
  test("an official pair outranks the computed thread for that catalogue", () => {
    const p = findPantone("426 C").color;
    const emb = matchesFor(src("pantone", { hex: p.hex, pantone: p })).filter((x) => x.dept === "Embroidery");
    const official = emb.filter((x) => x.basis === "official");
    expect(official.length).toBeGreaterThanOrEqual(1);
    expect(official[0].quality).toBe("official match");
    // no computed Classic Rayon entry once an official Classic Rayon pair exists
    expect(emb.filter((x) => x.basis === "computed" && /Classic Rayon/.test(x.label))).toEqual([]);
  });
  test("a thread -> Pantone (official when Madeira publishes one), house ink, vinyl", () => {
    const t = findThread("1007").filter((x) => x.line === "Classic Rayon")[0];
    const ms = matchesFor(src("thread", { hex: t.hex, thread: t }));
    expect(ms[0]).toMatchObject({ dept: "Screen Print", label: "Pantone 426 C", basis: "official" });
    expect(ms.some((x) => x.dept === "Vinyl")).toBe(true);
    expect(ms.some((x) => x.dept === "Embroidery")).toBe(false);
    // a house ink is named only when one is in the neighborhood: a red thread gets one...
    const red = findThread("1839")[0]; // Christmas Red
    expect(matchesFor(src("thread", { hex: red.hex, thread: red })).some((x) => /^House /.test(x.label))).toBe(true);
  });
  test("a house ink that is nowhere near is not suggested", () => {
    const p = findPantone("4266 C").color; // a brown; the closest house ink is a red
    expect(matchesFor(src("pantone", { hex: p.hex, pantone: p })).some((x) => /^House /.test(x.label))).toBe(false);
  });
  test("metallic or colorless sources are not matched", () => {
    expect(matchesFor(src("vinyl", { hex: "#756232", metallic: true }))).toEqual([]);
    expect(matchesFor(src("thread", { hex: null }))).toEqual([]);
    expect(matchesFor(null)).toEqual([]);
  });
});

describe("E-48 the whole order", () => {
  test("one entry per distinct color per department, with every place it is used", () => {
    const out = buildColorMatches(order(garment("Screen Printing", "Ruby Red\nPantone 4266C", "Ruby Red"), garment("Embroidery", "1821 Terra Cotta")));
    expect(out.map((e) => `${e.dept}: ${e.color.label}`)).toEqual([
      "Screen Print: House Ruby Red",
      "Screen Print: Pantone 4266 C",
      "Embroidery: 1821 Terra Cotta (Madeira Polyneon)",
    ]);
    expect(out[0].where).toEqual(["Screen Printing - Garment 1 - Graphic 1", "Screen Printing - Garment 1 - Graphic 2"]);
    out.forEach((e) => {
      expect(e.matches.length).toBeGreaterThan(0);
      e.matches.forEach((x) => {
        expect(x.dept).not.toBe(e.dept === "Embroidery" ? "Embroidery" : e.dept === "Vinyl" ? "Vinyl" : "none");
        expect(["official", "computed"]).toContain(x.basis);
        expect(x.hex).toMatch(/^#[0-9a-f]{6}$/);
      });
    });
  });
  test("non-garment products (Decals) are read too", () => {
    const out = buildColorMatches(order({ productName: "Decals", productType: "nongarment", branches: [{ colorsUsed: "Black" }] }));
    expect(out[0]).toMatchObject({ dept: "Vinyl", where: ["Decals - Graphic 1"] });
    expect(out[0].color.label).toBe("Black (ORACAL 651-070)");
  });
  test("a thread number two catalogues share is not matched until the catalogue is named", () => {
    expect(buildColorMatches(order(garment("Embroidery", "2001")))).toEqual([]);
    expect(buildColorMatches(order(garment("Embroidery", "2001 Marathon")))).toHaveLength(1);
  });
  test("nothing recognized, no chart for the product, or junk -> empty, never a throw", () => {
    expect(buildColorMatches(order(garment("Screen Printing", "Gray TBD")))).toEqual([]);
    expect(buildColorMatches(order(garment("Direct-to-Film", "Ruby Red")))).toEqual([]);
    [undefined, null, {}, { products: [null, {}] }].forEach((d) => expect(buildColorMatches(d)).toEqual([]));
  });
});

describe("E-48 the Color Matching production card", () => {
  const cardOf = (d) => buildProductionCards(d, null).filter((f) => f.name === "production-card-colormatch.html")[0];
  test("is made when the order has a recognized color, and lists the matches with their basis", () => {
    const html = cardOf(order(garment("Screen Printing", "Pantone 426 C\nRuby Red"))).html;
    expect(html).toMatch(/COLOR MATCHING/);
    expect(html).toMatch(/Pantone 426 C/);
    expect(html).toMatch(/official match/);
    expect(html).toMatch(/House Ruby Red/);
    expect(html).toMatch(/in stock/);
    expect(html).toContain(COLOR_MATCH_CAVEAT.slice(0, 40));
  });
  test("is NOT made when nothing is recognized -- every other card is exactly what it was", () => {
    const plain = order(garment("Screen Printing", "see mockup"));
    expect(cardOf(plain)).toBeUndefined();
    const names = (d) => buildProductionCards(d, null).map((f) => f.name);
    expect(names(plain)).toEqual(["production-card-screenprint.html", "production-card-graphicdesign.html"]);
    const withColor = order(garment("Screen Printing", "Ruby Red"));
    expect(names(withColor)).toEqual(["production-card-screenprint.html", "production-card-graphicdesign.html", "production-card-colormatch.html"]);
  });
  test("text is escaped", () => {
    const html = cardOf(order({ ...garment("Screen Printing", "Ruby Red"), productName: "Screen Printing" })).html;
    expect(html).not.toMatch(/<script/i);
  });
});
