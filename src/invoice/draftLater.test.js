import { canRetry, draftOffer, findOnboarding } from "./draftLater";

// E-151 (David 10-29): a reopened onboarding form offers only the draft; Try again when Zoho could not make it for now.
const json = (o) => async () => ({ text: JSON.stringify(o), shape: "text" });
const file = (id, at) => ({ File_Name: "onboarding-form.json", $file_id: id, Created_Time: at });

describe("E-151 findOnboarding", () => {
  test("nothing saved and no live note -> not onboarded (the normal form)", async () => {
    expect(await findOnboarding({ attachments: [{ File_Name: "art.png" }], notes: [{ Note_Title: "Call notes" }] })).toEqual({ onboarded: false });
  });
  test("a superseded note alone does not count; the live title does", async () => {
    expect((await findOnboarding({ attachments: [], notes: [{ Note_Title: "DEAL ONBOARDING FORM (SUPERSEDED 2026-10-01)" }] })).onboarded).toBe(false);
    expect(await findOnboarding({ attachments: [], notes: [{ Note_Title: "DEAL ONBOARDING FORM" }] })).toEqual({ onboarded: true, json: null, noteOnly: true });
  });
  test("the NEWEST onboarding-form.json is read (an amendment writes a newer one)", async () => {
    const reads = [];
    const readText = async (id) => {
      reads.push(id);
      return { text: JSON.stringify({ billingDocument: id === "new" ? "Estimate" : "Invoice" }), shape: "text" };
    };
    const found = await findOnboarding(
      { attachments: [file("old", "2026-10-29T09:34:33-06:00"), file("new", "2026-10-30T08:00:00-06:00")], notes: [] },
      readText
    );
    expect(reads).toEqual(["new"]);
    expect(found).toMatchObject({ onboarded: true, json: { billingDocument: "Estimate" }, savedAt: "2026-10-30T08:00:00-06:00", unreadable: false });
  });
  test("an unreadable file still counts as onboarded (the full form is never offered twice)", async () => {
    const found = await findOnboarding({ attachments: [file("x", "2026-10-29T09:00:00-06:00")], notes: [] }, async () => ({ text: "", shape: "empty" }));
    expect(found).toMatchObject({ onboarded: true, json: null, unreadable: true });
  });
});

describe("E-151 draftOffer", () => {
  const onboarded = { onboarded: true, json: { billingDocument: "Estimate", products: [] } };
  test("a saved Estimate answer -> the estimate can be made", () => {
    expect(draftOffer(onboarded)).toEqual({ can: true, document: "estimate", why: "" });
  });
  test("drafts switched off, or the Deal not in the pilot -> no button, no message", () => {
    expect(draftOffer(onboarded, { draftsOn: false })).toEqual({ can: false, document: "", why: "" });
    expect(draftOffer(onboarded, { billingOn: false })).toEqual({ can: false, document: "", why: "" });
  });
  test("note-only, unreadable, or Invoice or Estimate not answered -> told why, make it in Books", () => {
    expect(draftOffer({ onboarded: true, json: null, noteOnly: true }).why).toMatch(/before the form saved its answers/);
    expect(draftOffer({ onboarded: true, json: null, unreadable: true }).why).toMatch(/could not be read/);
    expect(draftOffer({ onboarded: true, json: { products: [] } }).why).toMatch(/Invoice or Estimate/);
  });
});

describe("E-151 canRetry", () => {
  test("Books slow, Books not checkable, Zoho no answer in time -> Try again", () => {
    expect(canRetry({ result: "too_slow", message: "Books was slow - nothing was created. Submit again in a minute." })).toBe(true);
    expect(canRetry({ result: "refused_by_books" })).toBe(true);
    expect(canRetry({ result: "not_sent", reason: "failed" })).toBe(true);
  });
  test("made, already there, no customer, online order, function missing, or the form's own refusal -> no Try again", () => {
    for (const a of [
      { result: "created" },
      { result: "exists" },
      { result: "no_customer" },
      { result: "online_order" },
      { result: "nothing_to_add" },
      { result: "not_sent", reason: "missing" },
      { result: "not_sent", message: 'Invoice or Estimate? was not answered, so no draft was made.' },
    ]) {
      expect(canRetry(a)).toBe(false);
    }
  });
});
