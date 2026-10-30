import { MIXED, PROVIDED, garmentsProvidedOn, garmentsProvidedPlan, garmentsProvidedValue } from "./garmentsProvided";

// E-183 / E-114 (David 10-30): client-owned garments (PPCO) set the Deal's "Garments Provided" so no Order Garments task is made.
const garment = (...skuLists) => ({ productType: "garment", primaryBranches: skuLists.map((l) => ({ garmentSkus: l.map((sku) => ({ sku })) })) });
const order = (...products) => ({ products });

describe("E-183 Garments Provided follows the client-owned garments", () => {
  test("all client-owned -> Garments Provided from Client (Jacob Godina D1)", () => {
    expect(garmentsProvidedValue(order(garment(["PPCO"])))).toBe(PROVIDED);
    expect(garmentsProvidedValue(order(garment(["ppco"], ["PPCO"]), garment(["PPCO"])))).toBe(PROVIDED);
  });

  test("client-owned plus bought (same row or another row or another product) -> Purchased + Provided", () => {
    expect(garmentsProvidedValue(order(garment(["PPCO", "PC54"])))).toBe(MIXED);
    expect(garmentsProvidedValue(order(garment(["PPCO"], ["PC54"])))).toBe(MIXED);
    expect(garmentsProvidedValue(order(garment(["PPCO"]), garment(["C112"])))).toBe(MIXED);
  });

  test("a garment row with no SKU counts as bought (can't tell), so the Order Garments task still comes", () => {
    expect(garmentsProvidedValue(order(garment(["PPCO"], [])))).toBe(MIXED);
  });

  test("no client-owned garment -> nothing (non-garment products ignored)", () => {
    expect(garmentsProvidedValue(order(garment(["PC54"])))).toBe("");
    expect(garmentsProvidedValue(order({ productType: "nongarment" }))).toBe("");
    expect(garmentsProvidedValue({})).toBe("");
    expect(garmentsProvidedValue(null)).toBe("");
  });

  test("onboarding: a blank Deal is filled, with workflow (the inspect task rule), nothing to tell the rep", () => {
    expect(garmentsProvidedPlan({ Garments_Provided_1: null, Stage: "Mock-Up Needed" }, order(garment(["PPCO"])))).toEqual({
      change: true, value: PROVIDED, was: "", workflow: true, message: "",
    });
  });

  test("never cleared, never re-written when it already matches", () => {
    expect(garmentsProvidedPlan({ Garments_Provided_1: PROVIDED }, order(garment(["PC54"]))).change).toBe(false);
    expect(garmentsProvidedPlan({ Garments_Provided_1: MIXED }, order(garment(["PPCO", "PC54"]))).change).toBe(false);
  });

  test("a different value is replaced and the rep is told", () => {
    const p = garmentsProvidedPlan({ Garments_Provided_1: MIXED, Stage: "Mock-Up Needed" }, order(garment(["PPCO"])));
    expect(p.change).toBe(true);
    expect(p.value).toBe(PROVIDED);
    expect(p.message).toMatch(/was changed to "Garments Provided from Client".*it was "Garments Purchased \+ Provided From Client"/);
  });

  test("Order Needs Corrections (the rule that repeats on every save) -> written without workflow", () => {
    expect(garmentsProvidedPlan({ Stage: "Order Needs Corrections" }, order(garment(["PPCO"]))).workflow).toBe(false);
  });

  test("already in production: the rep is told an earlier Order Garments task stays", () => {
    expect(garmentsProvidedPlan({ Stage: "Mock-Up Approved / In Production" }, order(garment(["PPCO"]))).message).toMatch(/Order Garments task made earlier stays/);
  });

  test("Amendment Form: an amendment that did not change the client-owned picture leaves a hand-set value alone", () => {
    const deal = { Garments_Provided_1: MIXED };
    const same = order(garment(["PPCO"]));
    expect(garmentsProvidedPlan(deal, same, same).change).toBe(false);
    // ...but fills a blank one, and follows a real change
    expect(garmentsProvidedPlan({ Garments_Provided_1: "" }, same, same).change).toBe(true);
    expect(garmentsProvidedPlan({ Garments_Provided_1: PROVIDED }, order(garment(["PPCO"], ["PC54"])), same).value).toBe(MIXED);
  });

  test("switch", () => {
    expect(garmentsProvidedOn({ garmentsProvidedOn: true })).toBe(true);
    expect(garmentsProvidedOn({})).toBe(false);
    expect(garmentsProvidedOn(null)).toBe(false);
  });
});
