import { buildForOrder, PROFILE_COUNT, BUNDLE_VERSION, PRODUCT_STYLES, PRODUCT_STYLES_PULLED } from "./index";
import pulled from "./productStyles.json";
import carried from "./productStylesCarried.json";
import { inksoftToFormData, dueDateFor, zonedMidnightISO, artBase, styleOf } from "./mapOrder";
import { structurePlacements } from "./structure";
import profiles from "./profiles.json";
import styles from "./styles.json";
import * as placements from "../placements";
import { applyGarmentSplits } from "../garmentSplit";
import { buildOnboardingNote } from "../onboardingNote";
import { buildColorMatches } from "../colorMatch";
import { buildProductionCards } from "../productionCards";
import { autoNoteLine } from "../submission";

// docs/48: the online-order mapping moved here from the InkSoft thread. A made-up order (no real customer) on a real
// store design: one Black polo, the Canyon Winds art on the front, picked up.
const quiet = jest.spyOn(console, "log").mockImplementation(() => {});
afterAll(() => quiet.mockRestore());
const order = (over = {}) => ({
  summary: {
    ID: 9000001, FirstName: "Test", LastName: "Buyer", Email: "buyer@example.com",
    EstimatedDeliveryDate_Max: "2026-11-13T18:00:00Z", ShippingVendorName: "Pickup", ShippingMethodName: "Store Pickup",
    ProductionCards: [{ ProductName: "Canyon Winds Polo", ProductStyleName: "Black", ProductSku: "8800MACCCW", ProductId: 1001768, DesignName: "PolosMusicAssociationCanyonWinds-100044", SideInternalName: "front" }],
    ...over.summary,
  },
  package: { Items: [{ FullName: "Canyon Winds Polo - Black - XL", Quantity: 1, ProductId: 1001768 }], ...over.package },
});
const deal = { Deal_Name: "9000001 - Test Buyer - Online Order" };
const AT = "2026-10-15T20:00:00.000Z";

// What the order-sync ran before the move (their lambda-entry.mjs at cc0ba64), step for step.
function theirBuild(o, d, submittedAt) {
  const mapped = inksoftToFormData(o, d, profiles, styles);
  const data = applyGarmentSplits(structurePlacements(mapped.data, placements));
  const { content, printFields, cardCounts } = buildOnboardingNote(data);
  const colorMatches = buildColorMatches(data) || [];
  const json = JSON.stringify({ ...data, ...(colorMatches.length ? { _colorMatches: colorMatches } : {}), _schemaVersion: 1, _submittedAt: submittedAt, _source: "online-order-auto", _inksoftOrderId: String(o.summary?.ID ?? "") });
  return { note: content, printFields, json, cards: buildProductionCards(data, cardCounts, {}) };
}

describe("buildForOrder gives what the order-sync's own copy gave, plus the agreed note line", () => {
  const ours = buildForOrder(order(), deal, { submittedAt: AT });
  const theirs = theirBuild(order(), deal, AT);
  test("it submits", () => {
    expect(ours.ok).toBe(true);
    expect(ours.held).toEqual([]);
  });
  test("note = theirs + the automatic-onboarding line; JSON and cards byte for byte; same print fields", () => {
    expect(ours.note).toBe(theirs.note + "\n\n" + autoNoteLine(9000001));
    expect(ours.json).toBe(theirs.json);
    expect(ours.cards).toEqual(theirs.cards);
    expect(ours.printFields).toEqual(theirs.printFields);
  });
  test("what the note says", () => {
    expect(ours.printFields.Embroidery_Department_Prints).toBe(1);
    expect(ours.note).toContain("Sales Person: Korie Byrd");
    expect(ours.note).toContain("Placement Location: Left Chest");
    expect(ours.note).toContain("Due Date: 2026-11-11"); // expected Fri 11-13, pickup -> 2 days earlier
    expect(JSON.parse(ours.json)._inksoftOrderId).toBe("9000001");
  });
});

describe("held for a person, never guessed", () => {
  test("a design no onboarding describes yet", () => {
    const o = order({ summary: { ProductionCards: [{ ...order().summary.ProductionCards[0], DesignName: "BrandNewArt" }] } });
    const r = buildForOrder(o, deal);
    expect(r.ok).toBe(false);
    expect(r.held.join(" ")).toMatch(/new design "BrandNewArt"/);
    expect(r.note).toBeUndefined();
  });
  test("a garment color the design was never described on: onboarded in its own department, see art file (E-90)", () => {
    const o = order({
      summary: { ProductionCards: [{ ...order().summary.ProductionCards[0], ProductStyleName: "White" }] },
      package: { Items: [{ FullName: "Canyon Winds Polo - White - XL", Quantity: 1, ProductId: 1001768 }] },
    });
    const r = buildForOrder(o, deal, { submittedAt: AT });
    expect(r.held).toEqual([]);
    expect(r.note).toContain("Product 1: Embroidery");
    expect(r.note).toMatch(/not yet described on White -- see art file/);
  });
  test("no production cards yet", () => {
    expect(buildForOrder(order({ summary: { ProductionCards: [] } }), deal).ok).toBe(false);
  });
});

describe("helpers", () => {
  test("art names, styles, dates", () => {
    expect(artBase("PolosMusicAssociationCanyonWinds-100044")).toBe("PolosMusicAssociationCanyonWinds");
    expect(styleOf("8800MACCCW", styles).code).toBe("8800");
    expect(zonedMidnightISO("2026-11-11")).toBe("2026-11-11T07:00:00.000Z"); // MST
    expect(zonedMidnightISO("2026-07-01")).toBe("2026-07-01T06:00:00.000Z"); // MDT
    expect(dueDateFor({ EstimatedDeliveryDate_Max: "2026-11-16T18:00:00Z", ShippingVendorName: "UPS" })).toMatchObject({ due: "2026-11-10", pickup: false }); // Mon - 6 days
  });
  test("data and version", () => {
    expect(PROFILE_COUNT).toBe(Object.keys(profiles).length);
    expect(BUNDLE_VERSION).toBe("dev");
    Object.entries(styles).filter(([k]) => !k.startsWith("_")).forEach(([, s]) => expect(placements.GARMENT_KINDS).toContain(s.kind));
  });
});

// E-88 (InkSoft M-15, 2026-10-19): the store SKU prefix picked the ADULT polo for MACC's youth polo.
describe("E-88 the youth polo 8800B is its own style", () => {
  test("8800B… reads as the youth polo; 8800… stays the adult polo", () => {
    expect(styleOf("8800BMACCY", styles)).toMatchObject({ code: "8800B", name: "Gildan Youth Polo", kind: "Polo" });
    expect(styleOf("8800BMACC25", styles).code).toBe("8800B");
    expect(styleOf("8800MACCCW", styles).code).toBe("8800");
  });
  test("a youth-polo order is onboarded as the youth polo", () => {
    const o = order({
      summary: { ProductionCards: [{ ...order().summary.ProductionCards[0], ProductName: "Canyon Winds Youth Polo", ProductSku: "8800BMACC_16656618_2", ProductId: 1000191 }] },
      package: { Items: [{ FullName: "Canyon Winds Youth Polo - Black - YM", Quantity: 1, ProductId: 1000191 }] },
    });
    const r = buildForOrder(o, deal, { submittedAt: AT });
    expect(r.ok).toBe(true);
    expect(r.note).toContain("Garment Type (Brand / Style): 8800B Gildan Youth Polo");
    expect(r.note).not.toContain("8800 Gildan Polo");
  });
});

// E-89 (InkSoft M-15): a product's style comes from its InkSoft ProductId, never from the store SKU.
describe("E-89 match by product, not by SKU prefix", () => {
  const withProduct = (pid, sku, name) => order({
    summary: { ProductionCards: [{ ...order().summary.ProductionCards[0], ProductName: name, ProductSku: sku, ProductId: pid }] },
    package: { Items: [{ FullName: name + " - Black - XL", Quantity: 1, ProductId: pid }] },
  });
  test("the table is the InkSoft pull, plus only our carried rows, which never override it", () => {
    expect(PRODUCT_STYLES_PULLED).toBe("2026-10-19");
    const pulledIds = Object.keys(pulled).filter((k) => !k.startsWith("_"));
    const carriedIds = Object.keys(carried).filter((k) => !k.startsWith("_"));
    expect(pulledIds.length).toBe(708); // 693 + the 15 sunset products, keyed to the style they are on now (D-42)
    carriedIds.forEach((id) => expect(pulled[id]).toBeUndefined());
    carriedIds.forEach((id) => expect(carried["_" + id]).toMatch(/Drop when/)); // every carried row says why
    expect(Object.keys(PRODUCT_STYLES).length).toBe(pulledIds.length + carriedIds.length);
  });
  test("every style in the catalogue is reachable from a product, except the 11 waiting on InkSoft's brand fix (D5)", () => {
    const reachable = new Set(Object.values(PRODUCT_STYLES));
    const unreachable = Object.keys(styles).filter((k) => !k.startsWith("_") && !reachable.has(k)).sort();
    expect(unreachable).toEqual(["1566", "1567", "B0750", "B100", "B400", "BG85", "BG970", "BG980", "CP90", "CP91", "CP91L"]);
  });
  test("a product missing from the table is held, even when its SKU would match by prefix", () => {
    const r = buildForOrder(withProduct(9999999, "8800MACCCW", "Mystery Polo"), deal);
    expect(r.ok).toBe(false);
    expect(r.held.join(" ")).toMatch(/InkSoft product 9999999\) is not in the style table/);
  });
  test("a listed product whose style is not in the catalogue is held, naming the style", () => {
    const { PC78H, ...without } = styles; // eslint-disable-line no-unused-vars
    const r = inksoftToFormData(withProduct(1000035, "PC78H", "Core Fleece Hoodie"), deal, profiles, without, undefined, PRODUCT_STYLES);
    expect(r.held.join(" ")).toMatch(/style PC78H of "Core Fleece Hoodie" is not in styles.json yet/);
  });
  test("the PC78H hoodie reads as PC78H (not the PC78 crewneck), a hoodie, from SanMar", () => {
    const r = buildForOrder(withProduct(1000035, "PC78H", "Core Fleece Hoodie"), deal, { submittedAt: AT });
    expect(r.held).toEqual([]);
    expect(r.note).toContain("Garment Type (Brand / Style): PC78H ");
    expect(r.json).toContain('"garmentKind":"Hoodie / Crew / Zip"');
    expect(r.note).toContain("Vendors Used: Sanmar");
  });
  test("the product decides, whatever the SKU says", () => {
    const r = buildForOrder(withProduct(1000191, "8800MACCCW", "Odd SKU Youth Polo"), deal, { submittedAt: AT });
    expect(r.ok).toBe(true);
    expect(r.note).toContain("8800B Gildan Youth Polo");
  });
});


// E-79: an art described separately per set of garment colors uses the most specific description that covers the order.
describe("E-79 descriptions per garment color", () => {
  const graphic = (d) => ({ graphicDescription: d, tartiaryBranches: [] });
  const profs = {
    Art: { variants: [
      { product: "Direct-to-Film", colors: ["Navy"], graphic: graphic("navy only"), from: "onboarding of order 1" },
      { product: "Direct-to-Film", colors: ["White", "Navy"], graphic: graphic("white and navy"), from: "onboarding of order 2" },
    ] },
  };
  const card = (color) => ({ ProductName: "Tee", ProductStyleName: color, DesignName: "Art", SideInternalName: "front", ProductSku: "PC55", ProductId: 1 });
  const ord = (colors) => ({
    summary: { ID: 1, ProductionCards: colors.map(card), EstimatedDeliveryDate_Max: "2026-11-02T12:00:00Z", ShippingMethodName: "Pick-up" },
    package: { Items: colors.map((c) => ({ FullName: `Tee - ${c} - L`, Quantity: 1, ProductId: 1 })) },
  });
  const run = (colors) => inksoftToFormData(ord(colors), deal, profs, { PC55: { name: "Tee", vendor: "Sanmar", kind: "Polo" } }, undefined, { 1: "PC55" });
  const desc = (r) => r.data.products[0].primaryBranches[0].secondaryBranches[0].graphicDescription;
  test("navy alone keeps the navy-only description", () => expect(desc(run(["Navy"]))).toBe("navy only"));
  test("white uses the description that covers white", () => expect(desc(run(["White"]))).toBe("white and navy"));
  test("white and navy together use the one that covers both", () => expect(desc(run(["White", "Navy"]))).toBe("white and navy"));
  test("a color no description covers: the art's own department, see art file (E-90)", () => {
    const r = run(["Red"]);
    expect(r.held).toEqual([]);
    expect(r.data.products[0].productName).toBe("Direct-to-Film");
    expect(desc(r)).toMatch(/not yet described on Red -- see art file/);
  });
});

// E-90 (D-44 … D-47) and E-93: what the robot does when no staff description covers an order.
describe("E-90 see art file, stickers, USDOT; E-93 one garment type per kind", () => {
  const W2W = 563840, MAIN = 432983, OTHER = 502240;
  const card = (o) => ({ ProductName: "P", ProductStyleName: "Black", DesignName: "NewArt", DesignType: "Art", Side: "Front", RegionName: "Full Front", ProductSku: "X", ProductId: 1, ProductHtmlColor: "000000", ...o });
  const ord = (storeId, cards, items) => ({
    summary: { ID: 9, StoreId: storeId, ProductionCards: cards, EstimatedDeliveryDate_Max: "2026-11-02T12:00:00Z", ShippingMethodName: "Pick-up" },
    package: { Items: items },
  });
  const item = (product, color, size, qty, id) => ({ FullName: `${product} - ${color} - ${size}`, Quantity: qty, ProductId: id });
  const styles2 = { TEE: { name: "Tee", vendor: "Sanmar", kind: "Tee / Long Sleeve / Tank / Button-up" },
    HOOD: { name: "Hoodie", vendor: "Sanmar", kind: "Hoodie / Crew / Zip" }, CAP: { name: "Cap", vendor: "Sanmar", kind: "Hat / Cap" } };
  const ps = { 1: "TEE", 2: "HOOD", 3: "CAP" };
  const ng = { 50: { product: "Stickers" }, 51: { skip: "a USDOT decal" } };
  const run = (o, profs = {}) => inksoftToFormData(o, deal, profs, styles2, undefined, ps, ng);
  const prod = (r, name) => r.data.products.find((p) => p.productName === name);

  test("a customer's design on a black tee: DTG, double-pass, every side a placement, see art file", () => {
    const o = ord(MAIN, [card({ DesignType: "Design" }), card({ DesignType: "Design", Side: "Back", RegionName: "Back" })], [item("P", "Black", "M", 1, 1)]);
    const r = run(o);
    expect(r.held).toEqual([]);
    const gr = prod(r, "Direct-to-Garment").primaryBranches[0].secondaryBranches[0];
    expect(gr.underbase).toBe("Double-pass");
    expect(gr.colorsUsed).toBe("See art file");
    expect(gr.numberOfPlacements).toBe("2");
    expect(gr.tartiaryBranches.map((t) => [t.placementLocation, t.sizeAndDimensions])).toEqual([["Full Front", "See art file"], ["Back", "See art file"]]);
    expect(gr.graphicDescription).toMatch(/^Customer's own design "NewArt"/);
  });
  test("a light garment gets no underbase; light and dark in one entry is held", () => {
    expect(prod(run(ord(MAIN, [card({ ProductHtmlColor: "FFFFFF", ProductStyleName: "White" })], [item("P", "White", "M", 1, 1)])), "Direct-to-Garment")
      .primaryBranches[0].secondaryBranches[0].underbase).toBe("None");
    const mixed = run(ord(MAIN, [card(), card({ ProductStyleName: "White", ProductHtmlColor: "FFFFFF" })], [item("P", "Black", "M", 1, 1), item("P", "White", "M", 1, 1)]));
    expect(mixed.held.join(" ")).toMatch(/light and dark garments/);
  });
  test("hats: Woman to Woman -> DTF; the main store waits on the team (E-94)", () => {
    const cap = (store) => run(ord(store, [card({ ProductName: "C", ProductId: 3 })], [item("C", "Black", "OSFA", 1, 3)]));
    expect(cap(W2W).data.products.map((p) => p.productName)).toEqual(["Direct-to-Film"]);
    expect(cap(MAIN).held.join(" ")).toMatch(/hats wait on the team's print-method rule \(E-94\)/);
  });
  test("a store with no rule keeps the old hold; a design described on other colours keeps its own department", () => {
    expect(run(ord(OTHER, [card()], [item("P", "Black", "M", 1, 1)])).held).toContain('new design "NewArt" -- no onboarding describes it yet');
    const profs = { NewArt: { product: "Embroidery", colors: ["Navy"], graphic: { graphicDescription: "x", tartiaryBranches: [] }, from: "onboarding of order 1" } };
    const r = run(ord(OTHER, [card()], [item("P", "Black", "M", 1, 1)]), profs);
    expect(r.held).toEqual([]);
    expect(r.data.products[0].productName).toBe("Embroidery");
    expect(r.data.products[0].primaryBranches[0].secondaryBranches[0].graphicDescription).toMatch(/not yet described on Black/);
  });
  test("E-93: a hoodie and a tee with the same art are two garment types, not a hold", () => {
    const o = ord(W2W, [card(), card({ ProductName: "H", ProductId: 2 })], [item("P", "Black", "M", 1, 1), item("H", "Black", "L", 1, 2)]);
    const r = run(o);
    expect(r.held).toEqual([]);
    expect(prod(r, "Direct-to-Garment").primaryBranches.map((g) => g.garmentKind)).toEqual(["Tee / Long Sleeve / Tank / Button-up", "Hoodie / Crew / Zip"]);
  });
  test("stickers onboard as Korie does (D-46); USDOT decals are left to the team (D-44)", () => {
    const r = run(ord(MAIN, [card({ ProductName: "S", ProductId: 50, ProductStyleName: "White", DesignName: "Logo" })], [item("S", "White", "2 x 2", 100, 50)]));
    expect(r.held).toEqual([]);
    expect(prod(r, "Stickers")).toMatchObject({ productType: "nongarment", quantityOrdered: "100", dimensions: '2" by 2"', vendorsUsed: "In house" });
    expect(r.data.suppliesMaterialsNeeded).toMatch(/Printable sticker vinyl/);
    const u = run(ord(MAIN, [card({ ProductName: "U", ProductId: 51, DesignName: null })], [item("U", "Blue", "2 Line", 2, 51)]));
    expect(u.held.join(" ")).toMatch(/is a USDOT decal -- not onboarded automatically, by design \(D-44\)/);
  });
});
