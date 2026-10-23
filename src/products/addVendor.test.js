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
  expect(calls).toEqual([{ name: "widget_add_vendor", args: { name: "s&s activewear", dry_run: "false" } }]);
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
