import {
  categoriesFor,
  mergeCategories,
  outsourcedItemsText,
  readyCategories,
  outsourcingFields,
  sourcingOf,
  CATEGORY_FOR,
  OWNED,
  READY_OPTIONS,
  VD,
  OUT,
  IN_HOUSE,
  ORDERED_FINISH,
  ORDERED_READY,
} from "./dealCategory";

const GARMENT = new Set(["Screen Printing", "Embroidery", "Direct-to-Garment", "Direct-to-Film", "Heat-Transfer", "Vinyl"]);
const typeOf = (n) => (GARMENT.has(n) ? "garment" : n === "DTF Gang Sheet" ? "gangsheet" : n === "Graphic Design" ? "graphic" : /storefront/i.test(n) ? "onlinestorefront" : "nongarment");
const p = (...names) => names.map((productName) => ({ productName, productType: typeOf(productName) }));
const q = (productName, sourcing) => ({ productName, productType: typeOf(productName), sourcing });

test("D-55 mapping: garment methods, gang sheet, storefront (all made in house by default)", () => {
  expect(categoriesFor(p("Screen Printing"))).toEqual(["Screen Printing"]);
  expect(categoriesFor(p("Direct-to-Film"))).toEqual(["DTF (Direct-to-Film)", VD]);
  expect(categoriesFor(p("Heat-Transfer"))).toEqual(["HTV (Heat-Transfer-Vinyl)", VD]);
  expect(categoriesFor(p("Vinyl"))).toEqual(["HTV (Heat-Transfer-Vinyl)", VD]); // older orders: garment vinyl = HTV
  expect(categoriesFor(p("DTF Gang Sheet"))).toEqual(["DTF Gang Sheet", VD]); // not also DTF
  expect(categoriesFor(p("Online StoreFront"))).toEqual(["Online Storefront"]); // no Graphic Design unless selected
  expect(categoriesFor(p("Online StoreFront", "Graphic Design"))).toEqual(["Graphic Design", "Online Storefront"]);
  expect(categoriesFor(p("Screen Printing", "Embroidery", "Stickers"))).toEqual(["Embroidery", "Screen Printing", "Stickers", VD]);
});

test("E-115: Outsourced follows the answers, not a fixed list of products", () => {
  expect(categoriesFor(p("Banners"))).toEqual(["Banners", VD]); // default: made in house (D-55's fixed Outsourced is gone)
  expect(categoriesFor([q("Banners", ORDERED_READY)])).toEqual(["Banners", OUT, VD]); // keeps its tags as today (Deluge: the VD folder)
  expect(categoriesFor([q("Pressed Patches", ORDERED_FINISH)])).toEqual([OUT, "Patches", VD]); // bought in, pressed here
  expect(categoriesFor(p("Business Cards", "Flyers"))).toEqual([OUT]); // always bought: default ready to go
  expect(categoriesFor([q("Business Cards", IN_HOUSE)])).toEqual([]); // the rep said we make them
  expect(categoriesFor([q("Embroidery", ORDERED_READY)])).toEqual(["Embroidery", OUT]); // garment decoration sent out (rare)
  expect(categoriesFor([q("Banners", ORDERED_READY), q("Stickers", IN_HOUSE)])).toEqual(["Banners", OUT, "Stickers", VD]);
  expect(categoriesFor([q("Graphic Design", ORDERED_READY)])).toEqual(["Graphic Design"]); // never asked: a service
});

test("every mapped tag is one the form owns, every form product of today is mapped, the 13 ready options are categories", () => {
  Object.values(CATEGORY_FOR).flat().forEach((c) => expect(OWNED.has(c)).toBe(true));
  const today =
    "Screen Printing,Embroidery,Direct-to-Garment,Direct-to-Film,Heat-Transfer,Pressed Patches,DTF Gang Sheet,Patches,Stickers,Decals,Business Cards,Magnets,Flyers,Posters,Banners,Keychains,Tumblers,Name Tag,Pocket Schedules,Marketing Materials,Stationery + Promotion,Fridge Magnets,Outsourced,Graphic Design,Online StoreFront";
  today.split(",").forEach((n) => expect(CATEGORY_FOR[n]).toBeTruthy());
  expect(OWNED.has("School Advertiser") || OWNED.has("School Sponsorship") || OWNED.has("Unqualified")).toBe(false);
  expect(READY_OPTIONS).toHaveLength(13); // Deluge docs/48 §2 B, in their order
  READY_OPTIONS.forEach((c) => expect(OWNED.has(c)).toBe(true));
});

test("merge: owned tags replaced (not add-only), school / unqualified / unknown kept", () => {
  const r = mergeCategories(["Screen Printing", "DTF (Direct-to-Film)", "School Sponsorship", "Fridge Magnets"], p("Embroidery"));
  expect(r).toEqual({ value: ["School Sponsorship", "Fridge Magnets", "Embroidery"], changed: true });
});

test("merge: already right -> no write; no known product -> nothing touched", () => {
  expect(mergeCategories([VD, "DTF (Direct-to-Film)"], p("Direct-to-Film"))).toEqual({ value: ["DTF (Direct-to-Film)", VD], changed: false });
  expect(mergeCategories(["Screen Printing"], [])).toEqual({ value: ["Screen Printing"], changed: false });
  expect(mergeCategories(["Screen Printing"], p("Something New"))).toEqual({ value: ["Screen Printing"], changed: false, unknown: ["Something New"] });
  // one unknown product among known ones: still hands off (its tag would otherwise be dropped)
  expect(mergeCategories(["Embroidery", "DTF (Direct-to-Film)"], p("Embroidery", "Embroidery - DTF")).changed).toBe(false);
  expect(mergeCategories(null, p("Stickers"))).toEqual({ value: ["Stickers", VD], changed: true });
  expect(mergeCategories("Screen Printing;Unqualified", p("Screen Printing"))).toEqual({ value: ["Unqualified", "Screen Printing"], changed: false }); // same tags, other order: no write
});

describe("E-115 (Deluge docs/48): the two outsourcing fields", () => {
  test("an older / online order with no answer: garments in house, always-bought products ready to go", () => {
    expect(sourcingOf({ productName: "Banners", productType: "nongarment" })).toBe(IN_HOUSE);
    expect(sourcingOf({ productName: "Business Cards", productType: "nongarment" })).toBe(ORDERED_READY);
    expect(sourcingOf({ productName: "Screen Printing", productType: "garment", sourcing: "something else" })).toBe(IN_HOUSE);
  });

  test("Outsourced Items: one line per ordered-in product, in-house ones left out, blank when none", () => {
    const order = [q("Banners", IN_HOUSE), q("Patches", ORDERED_FINISH), q("Business Cards", ORDERED_READY), ...p("Graphic Design")];
    expect(outsourcedItemsText(order)).toBe("Patches - Ordered in, finished in house\nBusiness Cards - Ordered in, ready to go");
    expect(outsourcedItemsText(p("Screen Printing", "Banners"))).toBe("");
  });

  test("Ordered In - Ready To Go: a category only when EVERY product under it is ready to go", () => {
    expect(readyCategories([q("Banners", ORDERED_READY), q("Stickers", IN_HOUSE)])).toEqual(["Banners"]);
    // David's case: in-house banner + outsourced patches -> the banner keeps its task; the patches' task goes
    expect(readyCategories([q("Banners", IN_HOUSE), q("Patches", ORDERED_READY)])).toEqual(["Patches"]);
    // mixed under one category (bought-ready patches + patches pressed here) -> not listed, the task is still made
    expect(readyCategories([q("Patches", ORDERED_READY), q("Pressed Patches", IN_HOUSE)])).toEqual([]);
    expect(readyCategories([q("Magnets", ORDERED_READY), q("Fridge Magnets", ORDERED_READY)])).toEqual(["Magnets"]);
    expect(readyCategories(p("Business Cards"))).toEqual([]); // no in-house task to skip
    expect(readyCategories([q("Stationery + Promotion", ORDERED_READY), q("Embroidery", ORDERED_READY)])).toEqual(["Embroidery", "Stationery + Promotional"]); // Deluge's order
  });

  test("the write: both fields replaced; no write when the Deal already says the same; blanked when nothing is ordered in", () => {
    const order = [q("Banners", ORDERED_READY)];
    const out = outsourcingFields({}, order);
    expect(out).toEqual({ fields: { Outsourced_Items: "Banners - Ordered in, ready to go", Ordered_In_Ready_To_Go: ["Banners"] }, changed: true });
    expect(outsourcingFields({ Outsourced_Items: "Banners - Ordered in, ready to go", Ordered_In_Ready_To_Go: ["Banners"] }, order).changed).toBe(false);
    const cleared = outsourcingFields({ Outsourced_Items: "Banners - Ordered in, ready to go", Ordered_In_Ready_To_Go: ["Banners"] }, p("Banners"));
    expect(cleared).toEqual({ fields: { Outsourced_Items: "", Ordered_In_Ready_To_Go: [] }, changed: true });
    expect(outsourcingFields({ Outsourced_Items: null, Ordered_In_Ready_To_Go: null }, p("Banners")).changed).toBe(false);
  });
});
