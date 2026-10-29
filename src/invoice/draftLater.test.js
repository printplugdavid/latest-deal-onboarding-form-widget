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

// E-158 (David 10-29): instant first; on a slow answer, hand the draft to the background (file, then the hidden box with workflow on).
import { BACKGROUND_MESSAGE, DRAFTING_FIELD, REQUEST_FILE, draftOrBackground, handToBackground, requestFile } from "./draftLater";

const fakeZoho = (ok = { attach: true, update: true }) => {
  const calls = [];
  return {
    calls,
    CRM: {
      API: {
        attachFile: async (c) => {
          calls.push(["attach", c.File.Name, c.File.Content instanceof Blob]);
          return { data: [{ code: ok.attach ? "SUCCESS" : "ERROR" }] };
        },
        updateRecord: async (c) => {
          calls.push(["update", c.APIData, c.Trigger]);
          return { data: [{ code: ok.update ? "SUCCESS" : "ERROR" }] };
        },
      },
    },
  };
};
const payload = { document: "estimate", dry_run: true, submitted_by: "Rep", lines: [{ sku: "PC43", quantity: 60, description: "Tee" }], rush: true };
const slow = { result: "too_slow", message: "Books was slow - nothing was created. Submit again in a minute." };

describe("E-158 requestFile", () => {
  test("the same payload the form sent, never a dry run, with who / when / the first answer", () => {
    const j = JSON.parse(requestFile("123", payload, { submittedBy: "Rep", firstAnswer: slow, now: new Date("2026-10-29T17:00:00Z") }));
    expect(j).toEqual({
      deal_id: "123",
      requested_at: "2026-10-29T17:00:00.000Z",
      requested_by: "Rep",
      first_answer: { result: "too_slow", message: slow.message },
      payload: { ...payload, dry_run: false },
    });
  });
});

describe("E-158 handToBackground", () => {
  test("attaches the request FIRST, then ticks Invoice_Drafting WITH workflow on", async () => {
    const z = fakeZoho();
    const a = await handToBackground(z, "Deals", "123", payload, { submittedBy: "Rep", firstAnswer: slow });
    expect(a).toMatchObject({ result: "background", message: BACKGROUND_MESSAGE });
    expect(z.calls.map((c) => c[0])).toEqual(["attach", "update"]);
    expect(z.calls[0][1]).toBe(REQUEST_FILE);
    expect(z.calls[1][1]).toEqual({ id: "123", [DRAFTING_FIELD]: true });
    expect(z.calls[1][2]).toEqual(["workflow"]);
  });
  test("a failed attach never ticks the box; any failure returns null (the rep keeps Try again)", async () => {
    const z = fakeZoho({ attach: false, update: true });
    expect(await handToBackground(z, "Deals", "123", payload)).toBeNull();
    expect(z.calls.map((c) => c[0])).toEqual(["attach"]);
    expect(await handToBackground(fakeZoho({ attach: true, update: false }), "Deals", "123", payload)).toBeNull();
  });
});

describe("E-158 draftOrBackground", () => {
  const run = (answer, backgroundOn, zoho = fakeZoho()) =>
    draftOrBackground({ zoho, entity: "Deals", dealId: "123", prepared: { flags: {} }, submittedBy: "Rep", backgroundOn, send: async () => answer, payloadOf: () => payload });
  test("a made draft is shown as is; nothing is handed off", async () => {
    const z = fakeZoho();
    expect(await run({ result: "created", number: "EST-1" }, true, z)).toMatchObject({ result: "created" });
    expect(z.calls).toEqual([]);
  });
  test("Books slow + switch on -> the background answer", async () => {
    expect((await run(slow, true)).result).toBe("background");
  });
  test("Books slow + switch OFF -> the slow answer as before (Try again)", async () => {
    const z = fakeZoho();
    expect(await run(slow, false, z)).toBe(slow);
    expect(z.calls).toEqual([]);
  });
  test("a refusal (no customer, exists) is never handed off", async () => {
    expect((await run({ result: "no_customer" }, true)).result).toBe("no_customer");
    expect((await run({ result: "exists" }, true)).result).toBe("exists");
  });
  test("the hand-off itself failing -> the slow answer, so Try again still shows", async () => {
    expect(await run(slow, true, fakeZoho({ attach: false, update: true }))).toBe(slow);
  });
  test("the background answer gets no Try again", () => {
    expect(canRetry({ result: "background" })).toBe(false);
  });
});
