import { prepareDraft, sendDraft, billingRecord, billingOnFor } from "./billingDraft";
import CONFIG from "./billingConfig.json";

test("the pilot: listed Deals only while the list has any (Lil Jon Deal 1 first)", () => {
  expect(CONFIG.pilotDeals).toEqual(["5249739000127793103"]);
  expect(billingOnFor("5249739000127793103")).toBe(true);
  expect(billingOnFor("5249739000123007161")).toBe(false);
  expect(billingOnFor(undefined)).toBe(false);
});

/* E-108: the two Zoho calls, with a fake ZOHO that answers like Deluge docs/43. */
const order = {
  billingDocument: "Estimate",
  payingByCard: "Yes",
  hardDueDate: "Yes",
  upchargedForRushTurnaround: true,
  products: [
    {
      productName: "Direct-to-Film",
      productType: "garment",
      primaryBranches: [
        {
          garmentType: "PC54 tees",
          garmentQuantity: "30",
          everyGraphicOnEveryGarment: "Yes",
          garmentSkus: [{ sku: "PC54", productName: "Port & Company - Core Cotton Tee - S-XL", productSource: "books" }],
          countColorSize: "Black\n30- M",
          secondaryBranches: [{ numberOfPlacements: "1", tartiaryBranches: [{ placementPick: "Full Front", widthIn: "11" }] }],
        },
      ],
    },
  ],
};

function fakeZoho(draftAnswer) {
  const calls = [];
  window.ZOHO = {
    CRM: {
      FUNCTIONS: {
        execute: async (name, cfg) => {
          const a = JSON.parse(cfg.arguments);
          calls.push({ name, a });
          if (name === "widget_books_items") {
            const skus = JSON.parse(a.payload).skus;
            return { details: { output: JSON.stringify({ status: "ok", partial: false, results: skus.map((s) => ({ item_id: "id-" + s, sku: s, rate: 7 })) }) } };
          }
          if (typeof draftAnswer === "function") return draftAnswer();
          return { details: { output: JSON.stringify(draftAnswer) } };
        },
      },
    },
  };
  return calls;
}
afterEach(() => {
  delete window.ZOHO;
});

test("created: one search, one draft call with item_id + rate and the three flags; the answer comes back as is", async () => {
  const calls = fakeZoho({ status: "ok", result: "created", number: "EST-000300", id: "5", link: "https://books.zoho.com/app/774544002#/estimates/5", not_added: [], notes: ["PPFEE6 added"] });
  const prepared = await prepareDraft(order);
  const answer = await sendDraft("123", prepared, { submittedBy: "Ray" });
  expect(answer).toMatchObject({ result: "created", number: "EST-000300", link: "https://books.zoho.com/app/774544002#/estimates/5", notes: ["PPFEE6 added"] });
  expect(calls.map((c) => c.name)).toEqual(["widget_books_items", "widget_create_billing_draft"]);
  expect(calls[1].a.deal_id).toBe("123");
  const p = JSON.parse(calls[1].a.payload);
  expect(p).toMatchObject({ document: "estimate", dry_run: false, submitted_by: "Ray", rush: true, extended_turnaround: false, paying_by_card: true });
  expect(p.lines).toEqual([
    { sku: "PC54", quantity: 30, description: "Black\n\n30 Medium", item_id: "id-PC54", rate: 7 },
    { sku: "PPDTF13", quantity: 30, description: "30 Full Front Placements", item_id: "id-PPDTF13", rate: 7 },
  ]);
  expect(billingRecord(prepared, answer).result).toEqual({ result: "created", number: "EST-000300", link: "https://books.zoho.com/app/774544002#/estimates/5", message: "" });
});

test("exists: David's wording and the link to the existing document are passed through", async () => {
  fakeZoho({ status: "ok", result: "exists", message: "This Deal already has INV-004545 - For all future deals, please create the invoice through the onboarding form process.", link: "L" });
  const answer = await sendDraft("1", await prepareDraft(order));
  expect(answer).toMatchObject({ result: "exists", link: "L" });
  expect(answer.message).toMatch(/^This Deal already has INV-004545/);
});

test("function missing / Zoho too slow: nothing is retried, and the rep is told what to check", async () => {
  fakeZoho(() => {
    throw new Error("function not found");
  });
  expect((await sendDraft("1", await prepareDraft(order))).message).toMatch(/not switched on/);
  const calls = fakeZoho(() => {
    throw new Error("Internal Server Error");
  });
  const a = await sendDraft("1", await prepareDraft(order));
  expect(a.message).toMatch(/may or may not have been made/);
  expect(calls.filter((c) => c.name === "widget_create_billing_draft")).toHaveLength(1);
});

test("no document chosen: no call at all", async () => {
  const calls = fakeZoho({ status: "ok", result: "created" });
  const a = await sendDraft("1", await prepareDraft({ ...order, billingDocument: "" }));
  expect(a.result).toBe("not_sent");
  expect(calls.some((c) => c.name === "widget_create_billing_draft")).toBe(false);
});
