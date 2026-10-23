import { familyOf, familySearchCodes, garmentFill, kindFromBooks, nameStem } from "./garmentFromBooks";

// Real CRM search results for "PC54" (10-20): the tee family, plus look-alikes that must not join it.
const PC54 = [
  { id: "1", sku: "PC54", name: "Port & Company - Core Cotton Tee - S-XL", category: "Garment - Tops" },
  { id: "2", sku: "PC541", name: "Port & Company - Core Cotton Tee - 2XL" },
  { id: "3", sku: "PC542", name: "Port & Company - Core Cotton Tee - 3XL-6XL" },
  { id: "4", sku: "PC54LS", name: "Port & Company - Long Sleeve Core Cotton Tee - S-XL" },
  { id: "5", sku: "PC54TT1", name: "Port & Company - Core Cotton Tank Top - 2XL" },
  { id: "6", sku: "PC54T", name: "Port & Company - Tall Core Cotton Tee - LT-XLT" },
];

test("name without its size band", () => {
  expect(nameStem("Port & Company - Core Cotton Tee - 3XL-6XL")).toBe("Port & Company - Core Cotton Tee");
  expect(nameStem("Richardson - 112 Trucker Cap - OSFM")).toBe("Richardson - 112 Trucker Cap");
});

test("the codes a family is searched by", () => {
  expect(familySearchCodes("PC541")).toEqual(["PC541", "PC54"]);
  expect(familySearchCodes("ST2631")).toEqual(["ST2631", "ST263"]);
  expect(familySearchCodes("PC54LS")).toEqual(["PC54LS"]);
});

test("picking any band brings the whole family, smallest first, and nothing else", () => {
  expect(familyOf(PC54[1], PC54).map((p) => p.sku)).toEqual(["PC54", "PC541", "PC542"]);
  expect(familyOf(PC54[0], PC54).map((p) => p.sku)).toEqual(["PC54", "PC541", "PC542"]);
  expect(familyOf(PC54[3], PC54).map((p) => p.sku)).toEqual(["PC54LS"]);
});

test("what the garment type gets", () => {
  const f = garmentFill(familyOf(PC54[0], PC54), "Garment - Tops");
  expect(f.garmentType).toBe("Port & Company - Core Cotton Tee (PC54)");
  expect(f.garmentKind).toBe("Tee / Long Sleeve / Tank / Button-up");
  expect(f.garmentSkus.map((r) => r.sku)).toEqual(["PC54", "PC541", "PC542"]);
  expect(f.garmentSkus[0]).toEqual({ sku: "PC54", productId: "1", productName: "Port & Company - Core Cotton Tee - S-XL", productSource: "books" });
});

test("garment kind from the Books category, and from the name where the category does not say", () => {
  expect(kindFromBooks("Garment - Hoodies & Sweatshirts", "x")).toBe("Hoodie / Crew / Zip");
  expect(kindFromBooks("Garment - Hats", "Port Authority - Knit Cap Beanie")).toBe("Beanie");
  expect(kindFromBooks("Garment - Hats", "Richardson - 112 Trucker Cap")).toBe("Hat / Cap");
  expect(kindFromBooks("Garment - Youth", "Port & Company - Youth Core Fleece Pullover Hooded Sweatshirt - XS-XL")).toBe("Hoodie / Crew / Zip");
  expect(kindFromBooks("Garment - Youth", "Port & Company - Youth Core Cotton Tee - XS-XL")).toBe("Tee / Long Sleeve / Tank / Button-up");
  expect(kindFromBooks("Garment - Accessories", "Port Authority - Core Cotton Tote")).toBe("Bag / Tote / Backpack");
  expect(kindFromBooks("Product - Signage", "Vinyl Banner")).toBe("");
});

import { bandOf, familyBase, skusForSizes } from "./garmentFromBooks";

const ST290 = [
  { sku: "ST290", name: "Sport-Tek - Repel Fleece Hooded Pullover - XS-XL" },
  { sku: "ST2901", name: "Sport-Tek - Repel Fleece Hooded Pullover - 2XL" },
  { sku: "ST2902", name: "Sport-Tek - Repel Fleece Hooded Pullover - 3XL" },
  { sku: "ST2903", name: "Sport-Tek - Repel Fleece Hooded Pullover - 4XL" },
];

describe("E-107: SKU rows follow the sizes", () => {
  test("a band from the name", () => {
    expect(bandOf("X - S-XL")).not.toBeNull();
    expect(bandOf("Richardson - 112 Trucker Cap - OSFM")).toBeNull();
    expect(bandOf("No band here")).toBeNull();
  });
  test("only the bands the size lines need", () => {
    expect(skusForSizes(ST290, "Black\n4- M\n6- L").items.map((p) => p.sku)).toEqual(["ST290"]);
    expect(skusForSizes(ST290, "Black\n4- M\n2- 2XL\n1- 4XL").items.map((p) => p.sku)).toEqual(["ST290", "ST2901", "ST2903"]);
  });
  test("no sizes yet: the standard band only", () => {
    expect(skusForSizes(ST290, "").items.map((p) => p.sku)).toEqual(["ST290"]);
  });
  test("a size no band covers is reported, not guessed", () => {
    expect(skusForSizes(ST290, "Navy\n1- 5XL")).toEqual({ items: [], unmatched: ["5XL"] });
  });
  test("youth sizes on a style whose band reads XS-XL", () => {
    const youth = [{ sku: "PC78YH", name: "Port & Company - Youth Core Fleece Pullover Hooded Sweatshirt - XS-XL" }];
    expect(skusForSizes(youth, "Red\n3- Youth M\n2- Youth L").items.map((p) => p.sku)).toEqual(["PC78YH"]);
  });
  test("one item for every size (hats)", () => {
    const hat = [{ sku: "112", name: "Richardson - 112 Trucker Cap - OSFM" }];
    expect(skusForSizes(hat, "Black\n12- OSFA").items.map((p) => p.sku)).toEqual(["112"]);
  });
});

describe("E-106: Books lookup by exact SKU (search action since 10-22; check text as the fallback)", () => {
  const { findSkusInBooks, searchBooks } = require("./booksItems");
  const zoho = (answer) => {
    const calls = [];
    window.ZOHO = {
      CRM: {
        FUNCTIONS: {
          execute: async (name, cfg) => {
            const a = JSON.parse(cfg.arguments);
            calls.push({ name, action: a.action, payload: JSON.parse(a.payload || "{}") });
            return { details: { output: JSON.stringify(answer(a.action, JSON.parse(a.payload || "{}"))) } };
          },
        },
      },
    };
    return calls;
  };
  const ST = { item_id: "316", sku: "ST290", name: "Sport-Tek - Repel Fleece Hooded Pullover - XS-XL", rate: 30.5, brand: "Sport-Tek", unit: "Pieces", category: "Garment - Outerwear" };
  afterEach(() => {
    delete window.ZOHO;
  });
  test("search answers the item with its id and rate; codes Books lacks are simply absent", async () => {
    const calls = zoho((action) => (action === "search" ? { status: "ok", partial: false, results: [ST] } : { status: "error" }));
    expect(await findSkusInBooks(["st290", "ST2904"])).toEqual([{ ...ST, active: true }]);
    expect(calls).toEqual([{ name: "widget_books_items", action: "search", payload: { skus: ["ST290", "ST2904"] } }]);
  });
  test("search not answering: the check action's 'SKU already used by' text, word for word", async () => {
    zoho((action) =>
      action === "search"
        ? { status: "error", message: "unknown action" }
        : {
            status: "ok",
            results: [
              { sku: "ST290", result: "refused", clash: "SKU already used by: Sport-Tek - Repel Fleece Hooded Pullover - XS-XL (active)" },
              { sku: "ST2904", result: "free", clash: "" },
            ],
          }
    );
    expect(await findSkusInBooks(["ST290", "ST2904"])).toEqual([{ sku: "ST290", name: "Sport-Tek - Repel Fleece Hooded Pullover - XS-XL", active: true }]);
  });
  test("searchBooks: 5 codes per call, and a partial answer is asked again for what is missing", async () => {
    const codes = ["A1", "A2", "A3", "A4", "A5", "A6", "A7"];
    const calls = zoho((action, p) => {
      const got = p.skus.filter((c) => c !== "A5" || p.skus.length === 1).map((c) => ({ item_id: "id" + c, sku: c, rate: 1 }));
      return { status: "ok", partial: p.skus.includes("A5") && p.skus.length > 1, results: got };
    });
    const s = await searchBooks(codes);
    expect(s.status).toBe("ok");
    expect(Object.keys(s.items).sort()).toEqual(codes);
    expect(calls.map((c) => c.payload.skus)).toEqual([["A1", "A2", "A3", "A4", "A5"], ["A6", "A7"], ["A5"]]);
  });
});

test("E-106: the family base -- the standard band is the base, an upcharge band drops its digit", () => {
  expect(familyBase(ST290[0])).toBe("ST290");
  expect(familyBase(ST290[1])).toBe("ST290");
  expect(familyBase({ sku: "PC54", name: "Port & Company - Core Cotton Tee - S-XL" })).toBe("PC54");
  expect(familyBase({ sku: "112", name: "Richardson - 112 Trucker Cap - OSFM" })).toBe("112");
});
