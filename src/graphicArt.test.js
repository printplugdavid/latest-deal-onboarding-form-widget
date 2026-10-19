import { artKey, artNames, collectArtFiles, finderModeFor, hexLine, isPicture, writePicks } from "./graphicArt";
import { buildProductionCards } from "./productionCards";

// E-95: art attached per graphic, and the color finder writing in the graphic's own chart.
describe("E-95 which chart a graphic's colors are written in", () => {
  test("screen print -> ink, embroidery -> thread, DTF / DTG -> HEX codes", () => {
    expect(finderModeFor("Screen Printing")).toBe("ink");
    expect(finderModeFor("Embroidery")).toBe("thread");
    expect(finderModeFor("Direct-to-Film")).toBe("hex");
    expect(finderModeFor("Direct-to-Garment")).toBe("hex");
  });
  test("a HEX line is a plain color word and the code, as staff type it", () => {
    expect(hexLine("#a23b32")).toBe("Red #A23B32");
    expect(hexLine("#1d1d1d")).toBe("Black #1D1D1D");
  });
});

describe("E-95 Add writes one line per pick into the graphic's Colors Used", () => {
  test("HEX picks, without repeating a line", () => {
    const picks = [{ kind: "hex", match: { label: "Red #A23B32" } }, { kind: "hex", match: { label: "Red #A23B32" } }];
    expect(writePicks("", picks, "Direct-to-Garment")).toBe("Red #A23B32");
    expect(writePicks("Beige #F4ECD9", picks, "Direct-to-Film")).toBe("Beige #F4ECD9\nRed #A23B32");
  });
  test("screen print: a house ink is written by its name, a Pantone by its label", () => {
    const t = writePicks("", [{ kind: "house", match: { name: "Gold" } }, { kind: "pantone", match: { label: "Pantone 186 C" } }], "Screen Printing");
    expect(t).toBe("Gold\nPantone 186 C");
  });
  test("embroidery: the thread label", () => {
    expect(writePicks("", [{ kind: "thread", match: { label: "1508 Cherry Pie (Madeira Polyneon)" } }], "Embroidery")).toBe("1508 Cherry Pie (Madeira Polyneon)");
  });
});

describe("E-95 the art files a form references", () => {
  const products = [
    { productType: "garment", primaryBranches: [{ secondaryBranches: [
      { artFiles: [{ name: "logo.png", size: 10, key: "logo.png|10|1" }] },
      { artFiles: [{ name: "logo.png", size: 10, key: "logo.png|10|1" }, { name: "back.dst", size: 5, key: "back.dst|5|2" }] },
    ] }] },
    { productType: "nongarment", branches: [{ artFiles: [{ name: "decal.svg", size: 3, key: "decal.svg|3|3" }] }] },
    { productType: "garment", primaryBranches: [{ secondaryBranches: [{ graphicDescription: "no art" }] }] },
  ];
  test("each file once, from garment and non-garment graphics", () => {
    expect(collectArtFiles(products).map((a) => a.name)).toEqual(["logo.png", "back.dst", "decal.svg"]);
    expect(collectArtFiles(undefined)).toEqual([]);
  });
  test("names for the card; pictures vs design files; a stable key", () => {
    expect(artNames(products[0].primaryBranches[0].secondaryBranches[1])).toBe("logo.png, back.dst");
    expect(artNames({})).toBe("");
    expect(isPicture("Logo.PNG")).toBe(true);
    expect(isPicture("hat.dst")).toBe(false);
    expect(artKey({ name: "a.png", size: 9, lastModified: 7 })).toBe("a.png|9|7");
  });
});

describe("E-95 the production card names each graphic's art file", () => {
  const data = (artFiles) => ({
    contactInfo: { Deal_Name: "Deal 1" },
    products: [{ productName: "Embroidery", productType: "garment", primaryBranches: [
      { garmentType: "Hat", garmentQuantity: "2", secondaryBranches: [{ graphicDescription: "P logo", artFiles, tartiaryBranches: [] }] },
    ] }],
  });
  const html = (d) => buildProductionCards(d, { embroideryPrints: 2 }).map((c) => c.html).join("");
  test("shown when the graphic has art", () => {
    expect(html(data([{ name: "p-logo.dst", size: 1, key: "k" }]))).toContain("p-logo.dst");
  });
  test("a graphic with no art file prints exactly as before", () => {
    expect(html(data(undefined))).toBe(html(data([])));
    expect(html(data(undefined))).not.toContain("Art File");
  });
});
