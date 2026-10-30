import { booksInvoiceLink, dealHead, englishSubject, invoiceStatusText, openActivities, readInvoices, readSendMockup } from "./dealBar";
import { buildProductionCards } from "../productionCards";
import ORDER from "../__fixtures__/online/expected/1000247/onboarding-form.json";

const answer = (o) => ({ code: "success", details: { output: typeof o === "string" ? o : JSON.stringify(o) } });

describe("E-173 Deal bar: status and salesperson", () => {
  it("reads Stage and Sales Person; falls back to the owner", () => {
    expect(dealHead({ Stage: "In Production", Sales_Person: "Ray Castaneda", Owner: { name: "Korie" } })).toEqual({ stage: "In Production", salesPerson: "Ray Castaneda" });
    expect(dealHead({ Stage: "Quality Check", Owner: { name: "Korie Byrd" } }).salesPerson).toBe("Korie Byrd");
    expect(dealHead(null)).toEqual({ stage: "", salesPerson: "" });
  });
});

describe("E-173 Deal bar: open activities", () => {
  const T = (id, Subject, Due_Date, Status = "Not Started", owner = "Mastin") => ({ id, Subject, Due_Date, Status, Owner: { name: owner } });
  it("keeps open tasks only, soonest first, undated last, English half of the subject", () => {
    const list = openActivities(
      [
        T("1", "EMBROIDERY: Produce Order / BORDADO: Orden de producción", "2026-11-02"),
        T("2", "GRAPHIC DESIGN: Create Mock-Up", "2026-10-29"),
        T("3", "SALES: Call", null),
        T("4", "QC", "2026-10-30", "Completed"),
        T("5", "PRODUCTION MANAGER: Package", "2026-10-30", "In Progress", "Angela"),
      ],
      "2026-10-30"
    );
    expect(list.map((a) => a.id)).toEqual(["2", "5", "1", "3"]);
    expect(list[0]).toMatchObject({ subject: "GRAPHIC DESIGN: Create Mock-Up", late: true, today: false });
    expect(list[1]).toMatchObject({ who: "Angela", today: true, late: false });
    expect(list[2].subject).toBe("EMBROIDERY: Produce Order");
    expect(list[3]).toMatchObject({ due: "", late: false });
  });
  it("copes with nothing", () => {
    expect(openActivities(null, "2026-10-30")).toEqual([]);
    expect(englishSubject("")).toBe("");
  });
});

describe("E-173 Deal bar: the invoice, without money (David: \"Leave money off\")", () => {
  const inv = (o) => Object.assign({ invoice_id: "5249739000001234567", number: "INV-004291", status: "partially_paid", date: "2026-09-24", total: 376.3, balance: 150, line_items_loaded: true, line_items: [{ name: "Nike Polo NKDC1963", description: "Embroidery left chest", quantity: 24, rate: 31.5 }] }, o);
  it("returns number, plain status, a Books link and the items -- never a total, balance or rate", () => {
    const r = readInvoices(answer({ status: "ok", message: "", count: 1, invoices: [inv({})] }));
    expect(r.state).toBe("ok");
    expect(r.invoices[0]).toEqual({
      id: "5249739000001234567",
      number: "INV-004291",
      status: "partially_paid",
      statusText: "Partly paid",
      link: "https://books.zoho.com/app/774544002#/invoices/5249739000001234567",
      itemsLoaded: true,
      items: [{ name: "Nike Polo NKDC1963", description: "Embroidery left chest", quantity: "24" }],
    });
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/376|150|31\.5|total|balance|rate/);
  });
  it("keeps a long id exact even when it comes back unquoted", () => {
    const raw = '{"status":"ok","count":1,"invoices":[{"invoice_id":5249739000001234567,"number":"INV-1","status":"paid","line_items":[]}]}';
    expect(readInvoices(answer(raw)).invoices[0].id).toBe("5249739000001234567");
  });
  it("no invoice, an error, nonsense", () => {
    expect(readInvoices(answer({ status: "ok", count: 0, invoices: [] })).state).toBe("none");
    expect(readInvoices(answer({ status: "error", message: "Books list call failed", invoices: [] }))).toMatchObject({ state: "error", message: "The invoice could not be read (Books list call failed)." });
    expect(readInvoices(answer("not json")).state).toBe("error");
    expect(readInvoices(null).state).toBe("error");
  });
  it("status words and links", () => {
    expect(invoiceStatusText("draft")).toBe("Draft (not sent yet)");
    expect(invoiceStatusText("some_new_state")).toBe("some new state");
    expect(booksInvoiceLink("javascript:alert(1)")).toBe("");
    expect(booksInvoiceLink("")).toBe("");
  });
});

describe("E-173 Send Mockup answer", () => {
  it("dry run and sent are ok; anything else is not", () => {
    expect(readSendMockup(answer({ status: "ok", result: "dry_run", to: ["a@b.com"], contact: "Shani Hustad", subject: "Your mock-up" }))).toMatchObject({ ok: true, result: "dry_run", to: ["a@b.com"], contact: "Shani Hustad", stageAfter: "Design Mock-Up Sent" });
    expect(readSendMockup(answer({ status: "ok", result: "sent", to: "a@b.com" }))).toMatchObject({ ok: true, to: ["a@b.com"] });
    expect(readSendMockup(answer({ status: "ok", result: "no_link", message: "The Deal has no WorkDrive Link." }))).toMatchObject({ ok: false, result: "no_link", message: "The Deal has no WorkDrive Link." });
    expect(readSendMockup(answer("garbage")).ok).toBe(false);
    expect(readSendMockup(null).ok).toBe(false);
  });
});

describe("E-173 cards: Color Change + the designer's details under each artwork (switch via dealInfo.artDetails)", () => {
  const files = (dealInfo) => Object.fromEntries(buildProductionCards(ORDER, null, dealInfo).map((f) => [f.name, f.html]));
  it("switch off (or no dealInfo) -> every card byte-identical to before", () => {
    const before = files(undefined);
    const off = files({ artDetails: false });
    expect(off).toEqual(before);
    Object.values(before).forEach((h) => expect(h).not.toMatch(/Color Change|Garment Colors|Brand \/ Style/));
  });
  it("switch on -> the department card shows Color Change with its lines; the Graphic Design card the garment, placements, vendors", () => {
    const on = files({ artDetails: true });
    const dept = Object.entries(on).find(([n]) => /screenprint|embroidery|vinyl/.test(n))[1];
    expect(dept).toMatch(/Color Change \/ Cambio de Color|>Color Change</);
    expect(dept).toMatch(/Navy Garment gets the white\/gold and black ink/);
    const gd = on["production-card-graphicdesign.html"];
    expect(gd).toMatch(/Brand \/ Style/);
    expect(gd).toMatch(/Color Change/);
    expect(gd).toMatch(/Placement/);
    expect(gd).toMatch(/Center Chest/);
  });
  it("a plain No adds nothing", () => {
    const data = JSON.parse(JSON.stringify(ORDER));
    data.products.forEach((p) => (p.primaryBranches || []).forEach((g) => (g.secondaryBranches || []).forEach((gr) => { gr.colorChange = "No"; gr.detailsOfColorChange = ""; })));
    buildProductionCards(data, null, { artDetails: true }).forEach((f) => expect(f.html).not.toMatch(/Color Change/));
  });
});
