import { addVendor } from "./booksItems";

const zoho = (answer) => {
  const calls = [];
  window.ZOHO = { CRM: { FUNCTIONS: { execute: async (name, cfg) => (calls.push({ name, args: JSON.parse(cfg.arguments) }), { details: { output: JSON.stringify(answer) } }) } } };
  return calls;
};
afterEach(() => delete window.ZOHO);

test("E-126 B: one call to widget_add_vendor; Books' spelling is the name to write", async () => {
  const calls = zoho({ status: "ok", result: "already_there", name: "S&S Activewear", books_vendor_id: "77", message: "" });
  const a = await addVendor(" s&s activewear ");
  expect(calls).toEqual([{ name: "widget_add_vendor", args: { name: "s&s activewear", dry_run: "false", website: "", vendor_code: "" } }]);
  expect(a).toMatchObject({ done: true, result: "already_there", name: "S&S Activewear", vendorId: "77" });
});

test("partial is usable (with Deluge's message); refused and bad_request are not; not installed says so", async () => {
  zoho({ status: "ok", result: "partial", name: "Acme", message: "Add Unused Values on School Advertiser" });
  expect(await addVendor("Acme")).toMatchObject({ done: true, result: "partial", message: "Add Unused Values on School Advertiser" });
  zoho({ status: "error", result: "refused", message: "Books said no" });
  expect(await addVendor("Acme")).toMatchObject({ done: false, result: "refused", message: "Books said no" });
  delete window.ZOHO;
  expect(await addVendor("Acme")).toMatchObject({ done: false, message: "Adding vendors is not set up yet: ask David." });
});

test("A0h: the website goes to widget_add_vendor v2 trimmed, https:// added; the stored website and code come back", async () => {
  const { cleanWebsite, websiteProblem } = require("./booksItems");
  const calls = zoho({ status: "ok", result: "added", name: "Acme Supply", books_vendor_id: "9", website: "https://acmesupply.com", vendor_code: "", not_kept: [] });
  const a = await addVendor("Acme Supply", " acmesupply.com ");
  expect(calls[0].args).toEqual({ name: "Acme Supply", dry_run: "false", website: "https://acmesupply.com", vendor_code: "" });
  expect(a).toMatchObject({ done: true, website: "https://acmesupply.com", vendorCode: "", notKept: [] });
  expect(cleanWebsite("http://x.com")).toBe("http://x.com");
  expect(cleanWebsite("")).toBe("");
  expect(websiteProblem("printograph.com")).toBe("");
  expect(websiteProblem("https://www.stahls.com/patches")).toBe("");
  expect(websiteProblem("not a site")).not.toBe("");
  expect(websiteProblem("")).toBe("");
});

test("E-128: skusInBooks reads 'check' clashes, active AND inactive; a failed check is never 'free'", async () => {
  const { skusInBooks } = require("./booksItems");
  zoho({
    status: "ok",
    results: [
      { sku: "220", result: "refused", clash: "SKU already used by: Paragon - Bahama Hooded Tee - XS-XL (active)" },
      { sku: "RI220", result: "free", clash: "" },
      { sku: "OLD1", result: "refused", clash: "SKU already used by: DUP - Old Thing (inactive)" },
    ],
  });
  const r = await skusInBooks(["220", "ri220", "OLD1"]);
  expect(r.status).toBe("ok");
  expect(r.taken.get("220")).toEqual({ sku: "220", name: "Paragon - Bahama Hooded Tee - XS-XL", active: true });
  expect(r.taken.get("OLD1").active).toBe(false);
  expect(r.taken.has("RI220")).toBe(false);
  delete window.ZOHO;
  expect((await skusInBooks(["220"])).status).toBe("unavailable");
});
