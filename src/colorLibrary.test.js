import {
  searchThreads, colorFamilies, THREAD_BRAND_COUNTS, THREAD_CATALOGS, THREAD_CATALOGS_MISSING, threadLabel,
  colorModeFor, THREADS, findThread, readThreadText, HOUSE_INKS, findHouseInk, PANTONES, findPantone,
  normalizeHex, findHexInText, colorDifference, describeDifference, nearestPantones, nearestHouseInk,
  houseInkHint, readInkText, addLine, readColorSwatches,
} from "./colorLibrary";
import { buildProductionCards } from "./productionCards";

describe("E-41 library data", () => {
  test("is what the color library handed back", () => {
    expect(THREADS).toHaveLength(1161);
    expect(HOUSE_INKS).toHaveLength(17);
    expect(PANTONES).toHaveLength(5355);
    expect(PANTONES.filter((p) => p.coated)).toHaveLength(3005);
    expect(new Set(PANTONES.map((p) => p.code)).size).toBe(5355);
    PANTONES.forEach((p) => expect(p.hex).toMatch(/^#[0-9a-f]{6}$/));
  });
  test("each product gets the right chart", () => {
    expect(colorModeFor("Embroidery")).toBe("thread");
    expect(colorModeFor("Screen Printing")).toBe("ink");
    ["Vinyl", "Heat-Transfer", "Decals"].forEach((p) => expect(colorModeFor(p)).toBe("vinyl"));
    ["Direct-to-Film", "Direct-to-Garment", "Stickers", "", undefined].forEach((p) => expect(colorModeFor(p)).toBe(null));
  });
});

describe("E-41 thread by number", () => {
  test("the shop's most-used numbers carry their official names", () => {
    expect(findThread("1821")[0]).toMatchObject({ name: "Terra Cotta", brand: "Madeira Polyneon", maker: "Madeira", line: "Polyneon" });
    expect(findThread("1771")[0].name).toBe("Whipped Butterscotch");
    expect(findThread("1982")[0].name).toBe("Sangria");
    expect(findThread("1652")[0].name).toBe("Mermaid");
    expect(findThread("1159")[0]).toMatchObject({ name: "Mustard", brand: "Madeira Classic Rayon" });
    expect(findThread("2302")[0]).toMatchObject({ brand: "Marathon Polyester", maker: "Marathon", line: "Polyester" });
    expect(findThread("0000")).toEqual([]);
  });
  test("reads real rep text; plain color words are left alone", () => {
    const r = readThreadText("White, Gold 1771, Maroon 1982\nred 1821 | 1652 teal");
    expect(r.matched.map((m) => m.code)).toEqual(["1771", "1982", "1821", "1652"]);
    expect(r.unknown).toEqual([]);
  });
  test("a four-digit number in no catalogue is reported", () => {
    expect(readThreadText("1821 and 9999").unknown).toEqual(["9999"]);
  });
  test("not thread numbers: Pantone codes, thread weights, decimals, long numbers, a repeat", () => {
    const r = readThreadText('Yellow 3955C\n#60 Black thread\n2.5" wide\n12345\n1821, 1821\n60# Gray');
    expect(r.matched.map((m) => m.code)).toEqual(["1821"]);
    expect(r.unknown).toEqual([]);
  });
  test("a number two brands share offers both, so the rep confirms the brand", () => {
    const r = readThreadText("2001");
    expect(r.matched[0].options.map((o) => o.brand).sort()).toEqual(["Madeira Classic Rayon", "Marathon Polyester"]);
  });
});

describe("E-41 house inks", () => {
  test("exact names only -- Bright Red and Ruby Red are different inks", () => {
    expect(findHouseInk("Bright Red").name).toBe("Bright Red");
    expect(findHouseInk("ruby red ink").name).toBe("Ruby Red");
    expect(findHouseInk("White").name).toBe("White");
    expect(findHouseInk("Red")).toBe(null);
    expect(findHouseInk("Dark Bright Red")).toBe(null);
  });
});

describe("E-41 Pantone the way reps write it", () => {
  const code = (s) => (findPantone(s) || {}).color?.code;
  test("every form seen on real orders", () => {
    expect(code("Pantone 187C")).toBe("187 C");
    expect(code("187 C")).toBe("187 C");
    expect(code("172C")).toBe("172 C");
    expect(code("PMS 187")).toBe("187 C");
    expect(code("Red Pantone 187C")).toBe("187 C");
    expect(code("2378C Navy Pantone")).toBe("2378 C");
    expect(code("Yellow 3955C")).toBe("3955 C");
    expect(code("Pantone Cool Grey 4 C")).toBe("Cool Gray 4 C");
    expect(code("Cool Gray 5C")).toBe("Cool Gray 5 C");
    expect(code("Copper Color Pantone 4266C")).toBe("4266 C");
    expect(code("pantone reflex blue")).toBe("Reflex Blue C");
    expect(code("239 U")).toBe("239 U");
  });
  test("no suffix + the word Pantone -> coated is assumed, and says so", () => {
    expect(findPantone("PMS 187")).toMatchObject({ assumed: true });
    expect(findPantone("187 C")).toMatchObject({ assumed: false });
  });
  test("not a Pantone: a bare number, a color word, a thread number, a note", () => {
    ["187", "Black", "White", "1821", "Gray TBD", "3 colors", "12 C-fold cards"].forEach((s) => expect(findPantone(s)).toBe(null));
  });
  test("looks like a Pantone but is not in the library -> flagged, never guessed", () => {
    expect(findPantone("Pantone 6164 C")).toEqual({ unknown: true });
    expect(findPantone("9999 C")).toEqual({ unknown: true });
  });
  test("the library agrees with a rep's own look-up (Copper Ridge: 4266C = 9A5F3A)", () => {
    expect(colorDifference(findPantone("4266 C").color.hex, "#9a5f3a")).toBeLessThan(1);
  });
});

describe("E-41 HEX <-> Pantone", () => {
  test("HEX is read strictly", () => {
    expect(normalizeHex("#AA1C2E")).toBe("#aa1c2e");
    expect(normalizeHex("aa1c2e")).toBe("#aa1c2e");
    expect(normalizeHex("#abc")).toBe(null);
    expect(normalizeHex("187 C")).toBe(null);
    expect(findHexInText("Hex Code 9A5F3A")).toBe("#9a5f3a");
    expect(findHexInText("and #BBBCBC")).toBe("#bbbcbc");
    expect(findHexInText("140000 shirts")).toBe(null);
  });
  test("a Pantone's own HEX comes back as that Pantone, first", () => {
    const hex = findPantone("187 C").color.hex;
    const near = nearestPantones(hex, 5);
    expect(near).toHaveLength(5);
    expect(near[0].color.code).toBe("187 C");
    expect(near[0].quality).toBe("same on screen");
    near.forEach((n) => expect(n.color.coated && !n.color.metallic).toBe(true));
    for (let i = 1; i < near.length; i++) expect(near[i].difference).toBeGreaterThanOrEqual(near[i - 1].difference);
  });
  test("an arbitrary HEX gets the closest coated Pantones with an honest quality word", () => {
    const near = nearestPantones("#9a5f3a", 3);
    expect(near[0].color.code).toBe("4266 C");
    expect(nearestPantones("not a color")).toEqual([]);
    expect(describeDifference(0.4)).toBe("same on screen");
    expect(describeDifference(2)).toBe("near-identical");
    expect(describeDifference(5)).toBe("close");
    expect(describeDifference(9)).toBe("visibly different");
    expect(describeDifference(30)).toBe("not close");
  });
  test("the saving the library found: 187 C is house Ruby Red", () => {
    const n = nearestHouseInk(findPantone("187 C").color.hex);
    expect(n.ink.name).toBe("Ruby Red");
    expect(n.difference).toBeLessThan(3);
    expect(houseInkHint(findPantone("187 C").color)).toMatch(/Ruby Red is a near-identical match/);
    expect(houseInkHint(findPantone("7509 C").color)).toBe("");
    expect(nearestHouseInk("#ffffff").ink.name).toBe("White");
  });
});

describe("E-41 reading the screen-print box", () => {
  test("real lines from orders", () => {
    const items = readInkText("Copper Color Pantone 4266C and Hex Code 9A5F3A\nBlack\nPantone Cool Grey 4 C and Hex Code BBBCBC\nGray TBD\nPantone 6164 C");
    expect(items.map((i) => i.type)).toEqual(["pantone", "hex", "house", "pantone", "hex", "other", "unknown-pantone"]);
    expect(items[0].color.code).toBe("4266 C");
    expect(items[2].ink.name).toBe("Black");
    expect(items[5].text).toBe("Gray TBD");
  });
  test("adding a line never duplicates and never rewrites what is there", () => {
    expect(addLine("", "Bright Red")).toBe("Bright Red");
    expect(addLine("White for the name\n", "Bright Red")).toBe("White for the name\nBright Red");
    expect(addLine("bright red, White", "Bright Red")).toBe("bright red, White");
    expect(addLine("Pantone 187 C", "Pantone 187 C")).toBe("Pantone 187 C");
  });
});

describe("E-41 swatches on the production cards", () => {
  const data = (productName, colorsUsed) => ({
    contactInfo: { Account_Name: "A", Deal_Name: "D" },
    products: [{ productName, productType: "garment", primaryBranches: [{ garmentType: "Tee", garmentQuantity: "2", secondaryBranches: [{ graphicDescription: "Logo", colorsUsed }] }] }],
  });
  const card = (d, which) => buildProductionCards(d, null).filter((f) => f.name.indexOf(which) >= 0)[0].html;
  test("embroidery: a swatch per thread number, with its official name", () => {
    const html = card(data("Embroidery", "White, Gold 1771, Maroon 1982"), "embroidery");
    expect((html.match(/class="swatch"/g) || []).length).toBe(2);
    expect(html).toMatch(/1771 Whipped Butterscotch/);
    expect(html).toMatch(/1982 Sangria/);
  });
  test("screen print: house inks and Pantones, Pantone with its HEX", () => {
    const html = card(data("Screen Printing", "Bright Red\nPantone 4266C\nGray TBD"), "screenprint");
    expect((html.match(/class="swatch"/g) || []).length).toBe(2);
    expect(html).toMatch(/House Bright Red/);
    expect(html).toMatch(/Pantone 4266 C \(#9a5f39\)/);
  });
  test("nothing recognized, or a product with no chart -> the card is exactly what it was", () => {
    expect(card(data("Embroidery", "see mockup"), "embroidery")).not.toMatch(/class="swatch"/);
    expect(card(data("Screen Printing", "Gray TBD"), "screenprint")).not.toMatch(/class="swatch"/);
    expect(readColorSwatches("Direct-to-Film", "Bright Red, 1821")).toEqual([]);
  });
  test("vinyl still works through the same reader", () => {
    expect(readColorSwatches("Heat-Transfer", "Red and White").map((s) => s.label)).toEqual(["Red", "White"]);
  });
});

describe("E-41 fix -- finding a thread: nothing hidden, and color words work", () => {
  test("an empty search is every thread in all three charts", () => {
    expect(searchThreads("")).toHaveLength(1161);
    expect(searchThreads("   ")).toHaveLength(1161);
    expect(THREAD_BRAND_COUNTS).toEqual({ "Madeira Polyneon": 433, "Madeira Classic Rayon": 422, "Marathon Polyester": 306 });
  });
  test("a plain color word finds threads by how they look, not just by official name", () => {
    const red = searchThreads("red");
    expect(red.length).toBeGreaterThan(60);
    expect(red.map((t) => t.code)).toContain("1821"); // "Terra Cotta" -- reps call it Red
    expect(searchThreads("gold").map((t) => t.code)).toContain("1771"); // "Whipped Butterscotch"
    expect(searchThreads("maroon").map((t) => t.code)).toContain("1982"); // "Sangria"
    expect(searchThreads("royal").map((t) => t.code)).toContain("1934");
    ["blue", "green", "navy", "purple", "pink", "orange", "yellow", "brown", "gray", "black", "white", "teal", "tan"].forEach((w) =>
      expect(searchThreads(w).length).toBeGreaterThan(10)
    );
  });
  test("Marathon has no names, so color words are the only way in -- and they work", () => {
    const m = searchThreads("marathon blue");
    expect(m.length).toBeGreaterThan(10);
    m.forEach((t) => expect(t.maker).toBe("Marathon"));
    expect(searchThreads("marathon")).toHaveLength(306);
    expect(searchThreads("rayon")).toHaveLength(422);
  });
  test("results stay grouped by brand (each brand appears as one block)", () => {
    ["red", "blue", "18", "gold", ""].forEach((q) => {
      const brands = searchThreads(q).map((t) => t.brand);
      const blocks = brands.filter((b, i) => i === 0 || b !== brands[i - 1]);
      expect(new Set(blocks).size).toBe(blocks.length);
    });
  });
  test("number and name searches still work, exact number first", () => {
    expect(searchThreads("1821")[0].code).toBe("1821");
    expect(searchThreads("18").every((t) => t.code.indexOf("18") === 0 || /18/.test(t.name))).toBe(true);
    expect(searchThreads("terra cotta").map((t) => t.code)).toContain("1821");
    expect(searchThreads("grey").length).toBe(searchThreads("gray").length);
    expect(searchThreads("zzzz")).toEqual([]);
  });
  test("color words for a few known swatches", () => {
    expect(colorFamilies("#000000")).toContain("black");
    expect(colorFamilies("#ffffff")).toContain("white");
    expect(colorFamilies("#12284c")).toEqual(expect.arrayContaining(["blue", "navy"]));
    expect(colorFamilies("#721e22")).toEqual(expect.arrayContaining(["red", "maroon"]));
    expect(colorFamilies(null)).toEqual(["multicolor"]);
  });
});

describe("E-41 -- thread organized by maker and line", () => {
  test("three catalogues today, each under its maker; the known gaps are listed, not hidden", () => {
    expect(THREAD_CATALOGS.map((c) => `${c.maker} / ${c.line}`)).toEqual(["Madeira / Polyneon", "Madeira / Classic Rayon", "Marathon / Polyester"]);
    expect(THREAD_CATALOGS_MISSING.map((c) => `${c.maker} / ${c.line}`)).toEqual(["Madeira / Frosted Matt", "Madeira / Metallics", "Marathon / Rayon"]);
  });
  test("searching inside one catalogue or one maker", () => {
    expect(searchThreads("", "P")).toHaveLength(433);
    expect(searchThreads("", "R")).toHaveLength(422);
    expect(searchThreads("", "M")).toHaveLength(306);
    expect(searchThreads("", "Madeira")).toHaveLength(855);
    expect(searchThreads("", "Marathon")).toHaveLength(306);
    searchThreads("red", "R").forEach((t) => expect(t.line).toBe("Classic Rayon"));
    expect(searchThreads("red", "P").length + searchThreads("red", "R").length + searchThreads("red", "M").length).toBe(searchThreads("red").length);
    expect(searchThreads("1821", "M")).toEqual([]);
  });
  test("a picked thread is written with its maker and line, and reads back as exactly that thread", () => {
    const rayon = findThread("2001").filter((t) => t.line === "Classic Rayon")[0];
    const marathon = findThread("2001").filter((t) => t.maker === "Marathon")[0];
    expect(threadLabel(findThread("1821")[0])).toBe("1821 Terra Cotta (Madeira Polyneon)");
    expect(threadLabel(marathon)).toBe("2001 (Marathon Polyester)");
    expect(readThreadText(threadLabel(marathon)).matched[0].options).toEqual([marathon]);
    expect(readThreadText(threadLabel(rayon)).matched[0].options).toEqual([rayon]);
  });
  test("a maker or line word typed beside a shared number settles it; without one, both are offered", () => {
    expect(readThreadText("2001 Marathon").matched[0].options.map((o) => o.brand)).toEqual(["Marathon Polyester"]);
    expect(readThreadText("Madeira rayon 2001").matched[0].options.map((o) => o.brand)).toEqual(["Madeira Classic Rayon"]);
    expect(readThreadText("2001").matched[0].options).toHaveLength(2);
    const r = readThreadText("2001 Marathon, 2002");
    expect(r.matched[0].options).toHaveLength(1);
    expect(r.matched[1].options).toHaveLength(2);
  });
});
