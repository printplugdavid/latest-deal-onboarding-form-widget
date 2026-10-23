import { currentDealVendors, setDealVendors, vendorChoicesFrom, DEAL_VENDORS, dealVendor, vendorsOf, withVendor, dealVendorsFrom, mergeDealVendors, notOnDealList, vendorsText } from "./vendors";

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

test("E-126: the live list from CRM field metadata -- unused (old) spellings and -None- left out; it replaces the built-in list", () => {
  const resp = { fields: [{ api_name: "Stage" }, { api_name: "Vendors", pick_list_values: [
    { display_value: "-None-", type: "used" }, { display_value: "San Mar", type: "used" }, { display_value: "S & S", type: "unused" },
    { display_value: "Brand New Supply", type: "used" },
  ] }] };
  expect(vendorChoicesFrom(resp)).toEqual(["San Mar", "Brand New Supply"]);
  expect(vendorChoicesFrom({ fields: [] })).toEqual([]);
  expect(currentDealVendors()).toBe(DEAL_VENDORS); // not read yet: the built-in 38
  setDealVendors(vendorChoicesFrom(resp));
  expect(currentDealVendors()).toEqual(["San Mar", "Brand New Supply"]);
  expect(dealVendor("brand new supply")).toBe("Brand New Supply"); // added in Setup -> written to the Deal, no forms push
  expect(dealVendor("Stahl's")).toBe(""); // gone from Zoho -> not written
  setDealVendors([]); // an empty answer never wipes the list: back to the built-in one
  expect(currentDealVendors()).toBe(DEAL_VENDORS);
});

test("E-126 B: new vendor name rules (Deluge) and the near-match warning", () => {
  const { newVendorProblem, nearVendor } = require("./vendors");
  expect(newVendorProblem("A")).toMatch(/2 to 100/);
  expect(newVendorProblem("Acme, Inc")).toMatch(/comma/);
  expect(newVendorProblem("Acme Supply")).toBe("");
  expect(nearVendor("Sanmar")).toBe("San Mar"); // same letters
  expect(nearVendor("Stahls Inc")).toBe("Stahl's"); // starts with an existing name
  expect(nearVendor("Pacfic Headwear")).toBe("Pacific Headwear"); // one typo
  expect(nearVendor("Acme Supply")).toBe("");
  expect(nearVendor("Acme", ["Acme Supply Co"])).toBe("Acme Supply Co"); // a list of Books vendors in the New Product form
});

test("vendor codes (docs/25 §2c) are found in any letter case: Books' Printograph rename (step 073) keeps PRI", () => {
  const { vendorCodeFor } = require("./newProductRules");
  expect(vendorCodeFor("Printograph")).toBe("PRI");
  expect(vendorCodeFor("PRINTOGRAPH")).toBe("PRI");
  expect(vendorCodeFor("stahl's")).toBe("STA");
  expect(vendorCodeFor("Acme Supply")).toBe(""); // a new vendor: no code yet
});

test("E-126: a new vendor's code = first 3 letters (docs/25 §2c); taken by another vendor or another vendor's products, never its own", () => {
  const { suggestVendorCode, vendorCodeTaken } = require("./newProductRules");
  expect(suggestVendorCode("Acme Supply")).toBe("ACM");
  expect(suggestVendorCode("3M Company")).toBe("3MC");
  expect(suggestVendorCode("Stahl's")).toBe("STA");
  expect(vendorCodeTaken("STA", "Stahl's Inc", [])).toEqual({ taken: true, why: "STA is already Stahl's's code" });
  expect(vendorCodeTaken("STA", "Stahl's", []).taken).toBe(false); // its own registry code
  expect(vendorCodeTaken("BRO", "Brother Supply", [{ sku: "BRO180072", vendor: "San Mar" }])).toMatchObject({ taken: true });
  expect(vendorCodeTaken("ACM", "Acme Supply", [{ sku: "ACMVB", vendor: "Acme Supply" }]).taken).toBe(false); // its own items
  expect(vendorCodeTaken("ACM", "Acme Supply", [{ sku: "ACM100", vendor: "" }]).taken).toBe(true); // unknown owner: ask David
});

test("E-127: a new brand -- cleaned, checked, near matches (aliases first) sent to the Books spelling", () => {
  const { cleanBrand, newBrandProblem, nearBrand } = require("./newProductRules");
  const books = ["Port & Company", "BELLA+CANVAS", "Gildan", "Comfort Wash"];
  expect(cleanBrand("  Comfort  Colors® ")).toBe("Comfort Colors");
  expect(newBrandProblem("X")).toMatch(/2 to 60/);
  expect(newBrandProblem("123")).toMatch(/letters/);
  expect(newBrandProblem("Comfort Colors")).toBe("");
  expect(nearBrand("Port & Co", books)).toBe("Port & Company"); // alias
  expect(nearBrand("Bella Canvas", books)).toBe("BELLA+CANVAS"); // same letters
  expect(nearBrand("Gildian", books)).toBe("Gildan"); // a typo
  expect(nearBrand("Comfort Colors", books)).toBe(""); // really new
});

test("E-127 (Books 10-23): no dead-end near matches -- short prefixes never match, look-alike but different brands stay apart", () => {
  const { nearBrand } = require("./newProductRules");
  const books = ["The North Face", "Port Authority", "Port & Company", "Gildan", "OGIO"];
  expect(nearBrand("The Game", books)).toBe("");
  expect(nearBrand("Port", books)).toBe(""); // 4 letters: no prefix match
  expect(nearBrand("Port Auth", books)).toBe("Port Authority"); // 8 letters, a real prefix
  expect(nearBrand("OGO", books)).toBe(""); // too short for a typo match
  expect(nearBrand("Gildian", books)).toBe("Gildan");
});
