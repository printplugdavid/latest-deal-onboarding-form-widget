import { ADDRESSEE_MAX, addresseeLine, addresseePlan, shipToChanged } from "./addressee";

// E-130 / D-66 (2026-10-28): every order that ships fills the Deal's Addressee (one line, commas); "Shipped?" is never touched.
const ships = (shippingContactAddress) => ({ doProductsNeedShipped: "Yes", shippingContactAddress });

describe("E-130 the ship-to becomes the Deal's one-line Addressee", () => {
  test("lines become comma pieces; extra spaces, blank lines and doubled commas drop out", () => {
    expect(addresseeLine("Jane Doe\n123 Main St\nBoise, ID 83702")).toBe("Jane Doe, 123 Main St, Boise, ID 83702");
    expect(addresseeLine("  Jane  Doe \r\n\n 123 Main St,, \nBoise ,  ID 83702\n")).toBe("Jane Doe, 123 Main St, Boise, ID 83702");
    expect(addresseeLine("")).toBe("");
    expect(addresseeLine(null)).toBe("");
  });

  test("the robot's InkSoft address (name / street / city, ST ZIP lines) reads the same way", () => {
    expect(addresseeLine("Sam Lee\n55 W Elm Ave\nSuite 2\nMeridian, ID 83642")).toBe("Sam Lee, 55 W Elm Ave, Suite 2, Meridian, ID 83642");
  });

  test("a blank Addressee is filled, with nothing to tell the rep", () => {
    expect(addresseePlan({ Addressee: null }, ships("Jane Doe\n123 Main St\nBoise, ID 83702"))).toEqual({
      change: true, value: "Jane Doe, 123 Main St, Boise, ID 83702", was: "", cut: false, message: "",
    });
    expect(addresseePlan(null, ships("Jane Doe")).change).toBe(true);
  });

  test("a different Addressee is replaced, and the rep is told what it was", () => {
    const p = addresseePlan({ Addressee: "Old Name 9 Oak St BOISE , ID 83702" }, ships("Jane Doe\n123 Main St\nBoise, ID 83702"));
    expect(p.change).toBe(true);
    expect(p.value).toBe("Jane Doe, 123 Main St, Boise, ID 83702");
    expect(p.message).toMatch(/was changed.*\n\(It was: Old Name 9 Oak St BOISE , ID 83702\)/s);
  });

  test("the same address (any line breaks, commas or capitals) is left alone", () => {
    expect(addresseePlan({ Addressee: "Jane Doe, 123 Main St, Boise, ID 83702" }, ships("jane doe\n123 Main St\nBoise, ID 83702")))
      .toMatchObject({ change: false, message: "" });
    expect(addresseePlan({ Addressee: "Jane Doe\n123 Main St, Boise, ID 83702" }, ships("Jane Doe, 123 Main St, Boise, ID 83702")).change).toBe(false);
  });

  test("a pickup, an unanswered question or an empty address never blanks or changes it", () => {
    const deal = { Addressee: "Jane Doe, 123 Main St, Boise, ID 83702" };
    expect(addresseePlan(deal, { doProductsNeedShipped: "No", shippingContactAddress: "Somebody Else" }).change).toBe(false);
    expect(addresseePlan(deal, { shippingContactAddress: "Somebody Else" }).change).toBe(false);
    expect(addresseePlan(deal, ships("   \n ")).change).toBe(false);
    expect(addresseePlan(deal, null).change).toBe(false);
  });

  test("longer than the field holds: cut to fit and the rep is told", () => {
    const long = "A".repeat(200) + "\n" + "B".repeat(100);
    const p = addresseePlan({}, ships(long));
    expect(p.change).toBe(true);
    expect(p.cut).toBe(true);
    expect(p.value.length).toBeLessThanOrEqual(ADDRESSEE_MAX);
    expect(p.value.endsWith(",")).toBe(false);
    expect(p.message).toMatch(/cut off/);
    expect(addresseePlan({ Addressee: p.value }, ships(long)).change).toBe(false); // saved once, not again
  });

  test("never names the Shipped? box", () => {
    expect(Object.keys(addresseePlan({}, ships("Jane Doe")))).not.toContain("Shipped");
  });

  test("Amendment Form: only an amendment that changes the ship-to touches the Addressee", () => {
    const before = ships("Jane Doe\n123 Main St\nBoise, ID 83702");
    expect(shipToChanged(before, ships("Jane Doe, 123 Main St, Boise, ID 83702"))).toBe(false); // same address, other changes
    expect(shipToChanged(before, ships("Jane Doe\n9 Oak St\nBoise, ID 83702"))).toBe(true);
    expect(shipToChanged({ doProductsNeedShipped: "No" }, before)).toBe(true); // turned to shipping
    expect(shipToChanged(before, { doProductsNeedShipped: "No", shippingContactAddress: "" })).toBe(false); // turned to pickup: left alone
    expect(shipToChanged(null, null)).toBe(false);
  });
});
