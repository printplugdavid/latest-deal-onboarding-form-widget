import { DEAL_VENDORS, dealVendor, vendorsOf, withVendor, dealVendorsFrom, mergeDealVendors, notOnDealList, vendorsText } from "./vendors";

test("the Deal list is Books' 38 spellings (docs/47); a name matches in any case", () => {
  expect(DEAL_VENDORS).toHaveLength(38);
  expect(dealVendor("s&s activewear")).toBe("S&S Activewear");
  expect(dealVendor("Stahl's")).toBe("Stahl's");
  expect(dealVendor("SanMar")).toBe("San Mar"); // hand-typed on older orders
  expect(dealVendor("SSactivewear")).toBe("S&S Activewear");
  expect(dealVendor("Stahls")).toBe("Stahl's");
  expect(dealVendor("BannerBuzz")).toBe("Banner Buzz");
  expect(dealVendor("Richardson")).toBe(""); // not the same name: left as typed
  expect(dealVendor("The Print Plug")).toBe("");
});

test("vendorsOf: the saved list wins; older text is read (separators of amended text dropped)", () => {
  expect(vendorsOf({ vendorsList: ["San Mar"], vendorsUsed: "anything" })).toEqual(["San Mar"]);
  expect(vendorsOf({ vendorsUsed: "san mar, SSactivewear" })).toEqual(["San Mar", "S&S Activewear"]);
  expect(vendorsOf({ vendorsUsed: "San Mar\n--- amended 2026-10-23 ---\nS&S Activewear" })).toEqual(["San Mar", "S&S Activewear"]);
  expect(vendorsOf({})).toEqual([]);
});

test("withVendor: fills an empty box, grows a list of Deal choices, never touches hand-typed text, skips our own items", () => {
  expect(withVendor([], "San Mar")).toEqual(["San Mar"]);
  expect(withVendor(["San Mar"], "S&S Activewear")).toEqual(["San Mar", "S&S Activewear"]);
  expect(withVendor(["San Mar"], "san mar")).toBeNull();
  expect(withVendor(["Client Owned"], "San Mar")).toBeNull(); // the rep's own entry: leave it
  expect(withVendor([], "The Print Plug")).toBeNull();
  expect(withVendor([], "")).toBeNull();
  expect(withVendor([], "New Supplier Co")).toEqual(["New Supplier Co"]); // not a Deal choice: kept as text, flagged
  expect(notOnDealList(["San Mar", "New Supplier Co"])).toEqual(["New Supplier Co"]);
  expect(vendorsText(["San Mar", "S&S Activewear"])).toBe("San Mar, S&S Activewear");
});

test("Deal Vendors: every Deal choice on the order, in list order; the form owns it but never blanks it", () => {
  const order = [
    { productName: "Screen Printing", primaryBranches: [{ vendorsList: ["San Mar"] }, { vendorsUsed: "S&S Activewear, Client Owned" }] },
    { productName: "Banners", vendorsList: ["Banner Buzz", "Somebody New"] },
  ];
  expect(dealVendorsFrom(order)).toEqual(["Banner Buzz", "S&S Activewear", "San Mar"]);
  expect(mergeDealVendors(["Richardsons Sports"], order)).toEqual({ value: ["Banner Buzz", "S&S Activewear", "San Mar"], changed: true });
  expect(mergeDealVendors(["San Mar", "S&S Activewear", "Banner Buzz"], order).changed).toBe(false);
  expect(mergeDealVendors(["San Mar"], [{ productName: "Stickers", vendorsUsed: "In house" }])).toEqual({ value: ["San Mar"], changed: false });
  expect(mergeDealVendors(null, [])).toEqual({ value: [], changed: false });
});
