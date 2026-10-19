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
  test("a garment color the design was never described on", () => {
    const o = order({
      summary: { ProductionCards: [{ ...order().summary.ProductionCards[0], ProductStyleName: "White" }] },
      package: { Items: [{ FullName: "Canyon Winds Polo - White - XL", Quantity: 1, ProductId: 1001768 }] },
    });
    expect(buildForOrder(o, deal).held.join(" ")).toMatch(/only been described on Black/);
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
  test("a color no description covers is still held, naming every color described", () => {
    expect(run(["Red"]).held).toContain('"Art" has only been described on Navy / White garments, not Red');
  });
});
