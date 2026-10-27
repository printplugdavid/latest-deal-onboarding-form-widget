import { rankProducts, searchProducts, categoriesForProductType } from "./productSearch";

const P = (sku, name, category, extra) => ({ id: sku, sku, name, brand: "", vendor: "", category, active: true, ...extra });
const STK = "Product - Stickers/Decals";

describe("E-139 product search: a broad word still finds the right item", () => {
  test("names holding every typed word come before other name matches", () => {
    const list = [P("PPCSS3", "Custom Square Stickers - White - 3x3\"", STK), P("PPCDCS3", "Custom Die-Cut Stickers - 3x3\"", STK), P("PPCDCS4", "Custom Die-Cut Stickers - 4x4\"", STK)];
    expect(rankProducts(list, "die cut 3x3").map((p) => p.sku)).toEqual(["PPCDCS3", "PPCDCS4", "PPCSS3"]);
  });

  test("the row's own product type is listed first, nothing is hidden", () => {
    const list = [P("BB33", "Vinyl Banner 3x3", "Product - Signage"), P("PPCDCS3", "Custom Die-Cut Stickers - 3x3\"", STK)];
    expect(rankProducts(list, "3x3", [STK]).map((p) => p.sku)).toEqual(["PPCDCS3", "BB33"]);
    expect(rankProducts(list, "3x3").map((p) => p.sku)).toEqual(["BB33", "PPCDCS3"]); // no type: code order, as before
  });

  test("a code typed exactly still wins over the product type", () => {
    const list = [P("PPCSS3", "Custom Square Stickers", STK), P("BB3", "Banner", "Product - Signage")];
    expect(rankProducts(list, "bb3", [STK])[0].sku).toBe("BB3");
  });

  test("form product names map to Books categories; unknown or garment products map to none", () => {
    expect(categoriesForProductType("Stickers")).toEqual([STK]);
    expect(categoriesForProductType("Banners")).toEqual(["Product - Signage"]);
    expect(categoriesForProductType("Keychains")).toEqual(["Product - Promotional"]);
    expect(categoriesForProductType("Screen Printing")).toEqual([]);
    expect(categoriesForProductType(undefined)).toEqual([]);
  });
});

describe("E-139 searchProducts asks Zoho for the full page of word matches", () => {
  const realZoho = window.ZOHO;
  afterEach(() => {
    window.ZOHO = realZoho;
  });

  test("word search per_page 200, then ranked and cut to 30, own type first", async () => {
    const calls = [];
    // 40 newer square stickers + the die-cut one: Zoho returns newest first, so the die-cut item is last.
    const square = Array.from({ length: 40 }, (_, i) => ({ id: String(900 - i), Product_Code: `PPCSS${i + 10}`, Product_Name: `Custom Square Stickers - ${i + 10}x${i + 10}"`, Item_Category: STK, Product_Active: true }));
    const dieCut = { id: "100", Product_Code: "PPCDCS3", Product_Name: "Custom Die-Cut Stickers - 3x3\"", Item_Category: STK, Product_Active: true };
    window.ZOHO = {
      CRM: {
        API: {
          searchRecord: async (c) => {
            calls.push(c);
            if (c.Type === "word") return { data: [...square, dieCut].slice(0, c.per_page) };
            return { data: [] };
          },
        },
      },
    };
    const r = await searchProducts("die cut", { preferCategories: [STK] });
    const word = calls.find((c) => c.Type === "word");
    expect(word.per_page).toBe(200);
    expect(r.status).toBe("ok");
    expect(r.products.length).toBeLessThanOrEqual(30);
    expect(r.products[0].sku).toBe("PPCDCS3");
  });
});
