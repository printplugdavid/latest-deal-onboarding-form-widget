import { buildForOrder, PROFILE_COUNT, BUNDLE_VERSION } from "./index";
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
    ProductionCards: [{ ProductName: "Canyon Winds Polo", ProductStyleName: "Black", ProductSku: "8800MACCCW", DesignName: "PolosMusicAssociationCanyonWinds-100044", SideInternalName: "front" }],
    ...over.summary,
  },
  package: { Items: [{ FullName: "Canyon Winds Polo - Black - XL", Quantity: 1 }], ...over.package },
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
      package: { Items: [{ FullName: "Canyon Winds Polo - White - XL", Quantity: 1 }] },
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
