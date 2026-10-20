import {
  RULES,
  bandsFromSizes,
  booksBrandFor,
  buildName,
  ceilCent,
  checkItems,
  initialsSku,
  itemTypeFor,
  normalizeSku,
  priceFloor,
  productTypeFor,
  productWordsFromTitle,
  purchaseAccountFor,
  sizeToken,
  skusForBands,
  toBooksItem,
  unitFor,
  vendorCodeFor,
} from "./newProductRules";
import { readAnswer } from "./booksItems";
import { rankProducts, toProduct } from "./productSearch";

// Real SanMar case prices from the wholesale catalogue, 2026-10-19 (highest color price per size).
const PC54 = [
  { size: "S", cost: 3.0 }, { size: "M", cost: 3.0 }, { size: "L", cost: 3.0 }, { size: "XL", cost: 3.0 },
  { size: "2XL", cost: 4.96 }, { size: "3XL", cost: 6.14 }, { size: "4XL", cost: 6.14 }, { size: "5XL", cost: 6.14 }, { size: "6XL", cost: 6.14 },
];

describe("size bands and SKUs (docs/25 §1.2, §2a)", () => {
  test("sizes priced together are one band, smallest first", () => {
    expect(bandsFromSizes(PC54).map((b) => [b.label, b.cost])).toEqual([["S-XL", 3], ["2XL", 4.96], ["3XL-6XL", 6.14]]);
  });
  test("several colors of one size: the highest price wins (decision 6)", () => {
    const b = bandsFromSizes([{ size: "XS", cost: 11.94 }, { size: "XS", cost: 13.97 }, { size: "XL", cost: 13.97 }]);
    expect(b).toEqual([{ sizes: ["XS", "XL"], cost: 13.97, label: "XS-XL" }]);
  });
  test("order follows sizes, not the supplier's row order", () => {
    expect(bandsFromSizes([{ size: "XL", cost: 5 }, { size: "S", cost: 5 }, { size: "XXL", cost: 6 }]).map((b) => b.label)).toEqual(["S-XL", "2XL"]);
  });
  test("style bare, then style + 1, 2 ...", () => {
    expect(skusForBands("pc54", 3)).toEqual(["PC54", "PC541", "PC542"]);
  });
  test("SKU tokens: upper case, no spaces or dashes", () => {
    expect(normalizeSku(" bc-3001 cvc ")).toBe("BC3001CVC");
  });
  test("size tokens (ruling 8)", () => {
    expect([sizeToken("SM"), sizeToken("s/m"), sizeToken("XXL"), sizeToken("OS")]).toEqual(["S-M", "S-M", "2XL", "OSFA"]);
  });
});

describe("in-house and outsourced codes (docs/25 §2b, §2c)", () => {
  test("PP + initials", () => {
    expect(initialsSku("PP", "Custom Square Stickers")).toBe("PPCSS");
    expect(initialsSku("PP", "Screen Print Setup Fee")).toBe("PPSPSF");
  });
  test("vendor code + initials", () => {
    expect(vendorCodeFor("PRINTOGRAPH")).toBe("PRI");
    expect(initialsSku(vendorCodeFor("PRINTOGRAPH"), "Vinyl Banner")).toBe("PRIVB");
    expect(initialsSku(vendorCodeFor("Stahl's"), "Embroidered Patches")).toBe("STAEP");
    expect(vendorCodeFor("Someone New")).toBe("");
  });
});

describe("names (docs/25 §3)", () => {
  test("supplier title minus brand and trailing style code", () => {
    expect(productWordsFromTitle("Port & Co Youth Core Fleece Sweatpant PC78YP", ["Port & Co", "Port & Company"], "PC78YP")).toBe(
      "Youth Core Fleece Sweatpant"
    );
    expect(productWordsFromTitle("Port & Company® Core Cotton Tee. PC54", ["Port & Company"], "PC54")).toBe("Core Cotton Tee");
  });
  test("a maker's style number inside the title stays (ruling 7)", () => {
    expect(productWordsFromTitle("Richardson 112 Trucker Cap", ["Richardson"], "112")).toBe("112 Trucker Cap");
  });
  test("Brand - Product - Color/Style - Size - Quantity, empty parts left out", () => {
    expect(buildName({ brand: "Port & Company", product: "Youth Core Fleece Sweatpant", size: "XS-XL" })).toBe(
      "Port & Company - Youth Core Fleece Sweatpant - XS-XL"
    );
    expect(buildName({ product: "Vinyl Banner", colorStyle: "Full Color", size: "3x6'", quantity: "QTY: 1" })).toBe("Vinyl Banner - Full Color - 3x6' - 1");
    expect(buildName({ product: "Business  Cards", size: "2x3.5\"", quantity: "(250 - 499)" })).toBe('Business Cards - 2x3.5" - 250-499');
  });
  test("brands: the one Books spelling", () => {
    expect(booksBrandFor("Port & Co")).toBe("Port & Company");
    expect(booksBrandFor("Bella + Canvas")).toBe("BELLA+CANVAS");
    expect(booksBrandFor("JERZEES")).toBe("Jerzees");
    expect(booksBrandFor("Not A Brand")).toBe("");
  });
});

describe("price, type and accounts (docs/25 §4, §7)", () => {
  test("garment floor: greater of cost x 1.10 and the next whole dollar", () => {
    expect(priceFloor(6.15, "Garment - Youth")).toBe(7);
    expect(priceFloor(13.97, "Garment - Youth")).toBe(15.37);
    expect(priceFloor(3.39, "Garment - Tops")).toBe(4);
    expect(priceFloor(5, "Garment - Tops")).toBe(5.5);
    expect(ceilCent(6.765)).toBe(6.77);
  });
  test("outsourced non-garments x 1.30; in-house never below cost; no cost no floor", () => {
    expect(priceFloor(10, "Product - Signage", "outsourced")).toBe(13);
    expect(priceFloor(2.5, "Product - Stickers/Decals", "inHouse")).toBe(2.5);
    expect(priceFloor(0, "Garment - Tops")).toBe(0);
  });
  test("cost account by category; Korie's open rows are null", () => {
    expect(purchaseAccountFor("Garment - Hats")).toEqual({ name: "COG Garments", id: "3165330000044287197" });
    expect(purchaseAccountFor("Product - Stickers/Decals", "inHouse").name).toBe("COG Vinyl");
    expect(purchaseAccountFor("Product - Stickers/Decals", "outsourced").name).toBe("COG Outsourced");
    expect(purchaseAccountFor("Product - Specials")).toBeNull();
  });
  test("types and units", () => {
    expect([productTypeFor("Garment - Tops"), productTypeFor("Service - DTF"), productTypeFor("Fee")]).toEqual(["goods", "service", "service"]);
    expect([itemTypeFor("Fee"), itemTypeFor("Service - Embroidery", "inHouse"), itemTypeFor("Garment - Tops", "supplier")]).toEqual([
      "sales",
      "sales",
      "sales_and_purchases",
    ]);
    expect([unitFor("Garment - Tops"), unitFor("Product - Print")]).toEqual(["Pieces", "Quantity"]);
  });
});

const PC78YP = {
  kind: "supplier",
  sku: "PC78YP",
  name: "Port & Company - Youth Core Fleece Sweatpant - XS-XL",
  brand: "Port & Company",
  vendorId: RULES.suppliers.sanmar.vendorId,
  category: "Garment - Youth",
  unit: "Pieces",
  cost: 6.15,
  price: 7,
  productType: "goods",
  itemType: "sales_and_purchases",
  purchaseAccountId: "3165330000044287197",
};

describe("checks before Books (docs/30 steps 5-13)", () => {
  test("the docs/57 test item passes", () => {
    expect(checkItems([PC78YP])).toEqual([[]]);
  });
  test("each hard stop is named", () => {
    const [p] = checkItems([{ ...PC78YP, vendorId: "", price: 6.5, brand: "Nobody", name: "Port & Company - Tee (QTY: 5)" }]);
    expect(p).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/no vendor/),
        expect.stringMatching(/below the floor of \$7\.00/),
        expect.stringMatching(/not in Books yet/),
        expect.stringMatching(/QTY/),
        expect.stringMatching(/parentheses/),
      ])
    );
  });
  test("our own code in a name is refused; a maker's style number is not", () => {
    expect(checkItems([{ ...PC78YP, kind: "outsourced", sku: "PRIVB", name: "PRIVB Vinyl Banner" }])[0]).toContain("name: our SKU must not be in the name");
    expect(checkItems([{ ...PC78YP, sku: "112", name: "Richardson - 112 Trucker Cap - OSFA", brand: "Richardson" }])[0]).toEqual([]);
  });
  test("two bands with one SKU or one name are caught", () => {
    const p = checkItems([PC78YP, { ...PC78YP }]);
    expect(p[0]).toEqual(expect.arrayContaining(["two items in this batch have the same SKU", "two items in this batch have the same name"]));
  });
  test("sell-only items need no vendor, cost or cost account", () => {
    const fee = { ...PC78YP, kind: "inHouse", sku: "PPEDF", name: "Embroidery - Digitizing Fee", brand: "The Print Plug", category: "Fee", itemType: "sales", vendorId: "", cost: 0, purchaseAccountId: "", price: 25 };
    expect(checkItems([fee])).toEqual([[]]);
  });
  test("what the create action receives", () => {
    expect(toBooksItem(PC78YP)).toEqual({
      sku: "PC78YP",
      name: "Port & Company - Youth Core Fleece Sweatpant - XS-XL",
      brand: "Port & Company",
      unit: "Pieces",
      vendor_id: "3165330000000569041",
      category: "Garment - Youth",
      rate: 7,
      purchase_rate: 6.15,
      product_type: "goods",
      item_type: "sales_and_purchases",
      account_id: "3165330000000000388",
      purchase_account_id: "3165330000044287197",
      is_taxable: true,
      product_url: "",
    });
  });
});

describe("product search and function answers", () => {
  test("exact code first, then codes that start with it, then names; inactive dropped", () => {
    const list = [
      { sku: "PC541", name: "x", active: true },
      { sku: "PC54", name: "y", active: true },
      { sku: "BC1", name: "PC54 lookalike", active: true },
      { sku: "PC542", name: "z", active: false },
      { sku: "PC54", name: "dup", active: true },
    ];
    expect(rankProducts(list, "pc54").map((p) => p.sku)).toEqual(["PC54", "PC541", "BC1"]);
  });
  test("a CRM product record", () => {
    expect(toProduct({ id: "9", Product_Code: "PC54 ", Product_Name: "Port & Company - Core Cotton Tee - S-XL", Brand: "Port & Company", Item_Category: "Garment - Tops", Product_Active: true })).toEqual({
      id: "9",
      sku: "PC54",
      name: "Port & Company - Core Cotton Tee - S-XL",
      brand: "Port & Company",
      category: "Garment - Tops",
      active: true,
    });
  });
  test("a function's answer arrives as a JSON string; anything else is 'unavailable'", () => {
    expect(readAnswer({ details: { output: JSON.stringify({ status: "ok", results: [1] }) } }, "f")).toEqual({ status: "ok", message: "", results: [1] });
    expect(readAnswer({ details: { output: "<html>" } }, "f").status).toBe("unavailable");
    expect(readAnswer(null, "f").status).toBe("unavailable");
  });
});

describe("supplier lookup answers (wholesale thread doc 08)", () => {
  test("a style number two brands share asks which brand", () => {
    const a = readAnswer({ details: { output: JSON.stringify({ status: "choose_brand", message: "", candidates: ["Bayside", "Gildan"] }) } }, "f");
    expect(a.status).toBe("choose_brand");
    expect(a.candidates).toEqual(["Bayside", "Gildan"]);
  });
  test("an S&S title has no brand in front; the trademark sign goes", () => {
    expect(productWordsFromTitle("Unisex Heavy Cotton™ T-Shirt", ["Gildan"], "5000")).toBe("Unisex Heavy Cotton T-Shirt");
  });
  test("SanMar's XXL and 2XL are one size", () => {
    expect(bandsFromSizes([{ size: "XXL", cost: 6.68 }, { size: "2XL", cost: 6.68 }, { size: "XL", cost: 5.68 }]).map((b) => b.label)).toEqual(["XL", "2XL"]);
  });
});

describe("calling the CRM functions by name (Deluge docs/38 §3)", () => {
  const { call } = require("./booksItems");
  const ok = { details: { output: JSON.stringify({ status: "ok", message: "", results: [] }) } };
  afterEach(() => {
    delete window.ZOHO;
  });
  test("the name as written first; the lower-case API name when that is not found", async () => {
    const names = [];
    window.ZOHO = { CRM: { FUNCTIONS: { execute: async (n) => { names.push(n); if (n !== n.toLowerCase()) throw new Error("function not found"); return ok; } } } };
    expect((await call("WIDGET_Books_Items", {})).status).toBe("ok");
    expect(names).toEqual(["WIDGET_Books_Items", "widget_books_items"]);
  });
  test("a function that answered is never called a second time (a create cannot run twice)", async () => {
    const names = [];
    window.ZOHO = { CRM: { FUNCTIONS: { execute: async (n) => { names.push(n); return { details: { output: JSON.stringify({ status: "error", message: "Books refused" }) } }; } } } };
    expect((await call("WIDGET_Books_Items", {})).status).toBe("error");
    expect(names).toEqual(["WIDGET_Books_Items"]);
  });
  test("neither name installed: one 'not installed' answer with both reasons", async () => {
    window.ZOHO = { CRM: { FUNCTIONS: { execute: async () => { throw new Error("api is inactive"); } } } };
    const a = await call("WIDGET_Books_Items", {});
    expect(a.status).toBe("unavailable");
    expect(a.message).toMatch(/WIDGET_Books_Items.*widget_books_items/);
  });
});
