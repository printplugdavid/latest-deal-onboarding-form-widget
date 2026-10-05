import { appendCustomerNote, overLimitBy, CUSTOMER_NOTES_LIMIT, saveCustomerNotes, loadAccountNotes } from "./customerNotes";
import { buildProductionCards } from "./productionCards";

const TS = "Customer wants to be sure all garments are dry before pickup\n\nCustomer does not want crooked designs";

describe("E-38 customer notes -- append, never replace", () => {
  test("appends a dated line under the existing text, which is kept verbatim", () => {
    const out = appendCustomerNote(TS, "  Prefers a soft-hand print  ", "2026-10-05");
    expect(out.startsWith(TS)).toBe(true);
    expect(out).toBe(TS + "\n\n[2026-10-05] Prefers a soft-hand print");
  });
  test("first note on an empty account has no leading blank line", () => {
    expect(appendCustomerNote("", "Picky about placement", "2026-10-05")).toBe("[2026-10-05] Picky about placement");
    expect(appendCustomerNote(null, "x", "2026-10-05")).toBe("[2026-10-05] x");
  });
  test("a blank entry changes nothing", () => {
    expect(appendCustomerNote(TS, "   ", "2026-10-05")).toBe(TS);
    expect(appendCustomerNote(TS + "\n\n", "", "2026-10-05")).toBe(TS);
  });
  test("knows when the Account field would overflow", () => {
    expect(overLimitBy(TS, "short", "2026-10-05")).toBe(0);
    expect(overLimitBy("a".repeat(1990), "this will not fit", "2026-10-05")).toBeGreaterThan(0);
    expect(overLimitBy("", "b".repeat(CUSTOMER_NOTES_LIMIT - 13), "2026-10-05")).toBe(0);
  });
});

describe("E-38 customer notes -- what gets written to Zoho", () => {
  let calls;
  const mock = ({ accountNotes, accountFails, readFails }) => {
    calls = [];
    window.ZOHO = {
      CRM: {
        API: {
          getRecord: async (c) => {
            if (readFails) throw new Error("no access");
            return { data: [{ Customer_Specific_Notes: accountNotes }] };
          },
          updateRecord: async (c) => {
            calls.push(c);
            if (c.Entity === "Accounts" && accountFails) return { data: [{ code: "NO_PERMISSION" }] };
            return { data: [{ code: "SUCCESS" }] };
          },
        },
      },
    };
  };
  const deal = { Account_Name: { id: "A1", name: "Tractor Supply Co" }, Customer_Notes: null };
  const args = (over) => ({ entity: "Deals", recordId: "D1", deal, entry: "Soft-hand print", dateStr: "2026-10-05", ...over });

  test("appends to the Account (with the workflow trigger), then writes the Deal with no trigger", async () => {
    mock({ accountNotes: TS });
    const r = await saveCustomerNotes(args());
    expect(r.accountWritten).toBe(true);
    expect(r.dealWritten).toBe(true);
    expect(r.combined).toBe(TS + "\n\n[2026-10-05] Soft-hand print");
    expect(calls[0]).toEqual({ Entity: "Accounts", APIData: { id: "A1", Customer_Specific_Notes: r.combined }, Trigger: ["workflow"] });
    expect(calls[1]).toEqual({ Entity: "Deals", APIData: { id: "D1", Customer_Notes: r.combined }, Trigger: [] });
  });
  test("no new note: the Account is NOT written; a blank Deal inherits the Account's notes", async () => {
    mock({ accountNotes: TS });
    const r = await saveCustomerNotes(args({ entry: "" }));
    expect(r.accountWritten).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].Entity).toBe("Deals");
    expect(calls[0].APIData.Customer_Notes).toBe(TS);
  });
  test("no new note and nothing on the Account: nothing is written at all", async () => {
    mock({ accountNotes: null });
    const r = await saveCustomerNotes(args({ entry: "" }));
    expect(calls).toHaveLength(0);
    expect(r.combined).toBe("");
  });
  test("Deal already matches the Account: no Deal write", async () => {
    mock({ accountNotes: TS });
    await saveCustomerNotes(args({ entry: "", deal: { ...deal, Customer_Notes: TS } }));
    expect(calls).toHaveLength(0);
  });
  test("text typed straight onto the Deal that the Account does not carry is not overwritten", async () => {
    mock({ accountNotes: TS });
    const r = await saveCustomerNotes(args({ deal: { ...deal, Customer_Notes: "Can these be QC'd by the 2nd?" } }));
    expect(r.accountWritten).toBe(true);
    expect(calls.filter((c) => c.Entity === "Deals")).toHaveLength(0);
    expect(r.dealKept).toBe(true);
  });
  test("would overflow 2,000 characters: Account untouched, and the caller is told", async () => {
    mock({ accountNotes: "a".repeat(1995) });
    const r = await saveCustomerNotes(args());
    expect(r.tooLong).toBe(true);
    expect(r.accountWritten).toBe(false);
    expect(calls.filter((c) => c.Entity === "Accounts")).toHaveLength(0);
    expect(r.combined).toBe("a".repeat(1995)); // old text only -- nothing trimmed, nothing added
  });
  test("the Account cannot be READ: it is never written (we would be replacing text we did not see)", async () => {
    mock({ readFails: true });
    const r = await saveCustomerNotes(args());
    expect(calls.filter((c) => c.Entity === "Accounts")).toHaveLength(0);
    expect(calls[0].APIData.Customer_Notes).toBe("[2026-10-05] Soft-hand print");
    expect(r.problem).toMatch(/Deal only/);
  });
  test("the Account refuses the write: the note still reaches the Deal", async () => {
    mock({ accountNotes: TS, accountFails: true });
    const r = await saveCustomerNotes(args());
    expect(r.accountWritten).toBe(false);
    expect(r.dealWritten).toBe(true);
    expect(r.problem).toMatch(/Deal only/);
  });
  test("a deal with no Account keeps the note on the Deal", async () => {
    mock({});
    const r = await saveCustomerNotes(args({ deal: { Customer_Notes: "old" } }));
    expect(calls).toHaveLength(1);
    expect(calls[0].APIData.Customer_Notes).toBe("old\n\n[2026-10-05] Soft-hand print");
    expect((await loadAccountNotes({})).accountId).toBe(null);
  });
  test("never throws, whatever Zoho does", async () => {
    window.ZOHO = { CRM: { API: { getRecord: async () => ({ data: [{}] }), updateRecord: async () => { throw new Error("boom"); } } } };
    const r = await saveCustomerNotes(args());
    expect(r.problem).toBeTruthy();
  });
});

describe("E-38 customer notes -- on the production cards", () => {
  const data = (extra) => ({
    contactInfo: { Account_Name: "Tractor Supply Co", Deal_Name: "Deal 15" },
    products: [
      { productName: "Embroidery", productType: "garment", primaryBranches: [{ garmentType: "Polo", garmentQuantity: "2" }] },
      { productName: "Stickers", productType: "nongarment", quantityOrdered: "10" },
    ],
    ...extra,
  });
  test("with no customer notes the cards are byte-for-byte what they were", () => {
    const a = buildProductionCards(data(), null);
    const b = buildProductionCards(data({ customerNotes: "" }), null);
    const c = buildProductionCards(data({ customerNotes: "   " }), null);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    a.forEach((f) => expect(f.html).not.toMatch(/Customer Notes/));
  });
  test("with notes, EVERY card carries them, escaped, line breaks kept", () => {
    const cards = buildProductionCards(data({ customerNotes: TS + "\n\n[2026-10-05] <b>soft</b> hand" }), null);
    expect(cards.length).toBeGreaterThanOrEqual(3); // embroidery, outsourced, graphic design
    cards.forEach((f) => {
      expect(f.html).toMatch(/Customer Notes/);
      expect(f.html).toMatch(/dry before pickup<br><br>Customer does not want crooked designs/);
      expect(f.html).toMatch(/&lt;b&gt;soft&lt;\/b&gt; hand/);
    });
  });
});
