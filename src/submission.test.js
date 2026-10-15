import { AUTO_SOURCE, autoNoteLine, buildSubmission, profileFromSubmission } from "./submission";
import { buildOnboardingNote } from "./onboardingNote";
import golden from "./__fixtures__/auto-1000248.json";

// docs/45: the one path from the form's answers to what Submit writes. The golden order is InkSoft 1000248,
// built by the order-sync with this form's own modules at cc0ba64 and approved by Korie (contact details faked).
const quiet = jest.spyOn(console, "log").mockImplementation(() => {});
afterAll(() => quiet.mockRestore());
const clone = (o) => JSON.parse(JSON.stringify(o));

describe("buildSubmission reproduces what Submit wrote before it existed", () => {
  const out = buildSubmission(clone(golden.form), golden.dealInfo);
  test("the note, byte for byte, plus the automatic-onboarding line at the end", () => {
    expect(out.note).toBe(golden.expected.note + "\n\n" + autoNoteLine("1000248"));
    expect(out.note.endsWith("Onboarded automatically from InkSoft order 1000248")).toBe(true);
  });
  test("the JSON: same keys, same values, same order -- stamped as an automatic onboarding", () => {
    const j = JSON.parse(out.json);
    expect(j).toEqual(golden.expected.json);
    expect(Object.keys(j)).toEqual(Object.keys(golden.expected.json));
    expect(j._source).toBe(AUTO_SOURCE);
    expect(j._inksoftOrderId).toBe("1000248");
    expect(j._schemaVersion).toBe(1);
  });
  test("the production cards, byte for byte", () => {
    const got = Object.fromEntries(out.cards.map((c) => [c.name, c.html]));
    expect(Object.keys(got).sort()).toEqual(Object.keys(golden.expected.cards).sort());
    Object.keys(golden.expected.cards).forEach((n) => expect(got[n]).toBe(golden.expected.cards[n]));
  });
  test("the print fields are the note builder's", () => {
    expect(out.printFields).toEqual(buildOnboardingNote(out.data).printFields);
    expect(out.printFields.Embroidery_Department_Prints).toBe(2);
    expect(out.printFields.Embroidery_Small_Prints).toBe(2);
  });
});

describe("a person's Submit is unchanged", () => {
  test("no source -> no _source, no _inksoftOrderId, no extra note line", () => {
    const out = buildSubmission(clone(golden.form), { submittedAt: "2026-10-15T00:00:00.000Z" });
    const j = JSON.parse(out.json);
    expect(j._source).toBeUndefined();
    expect(j._inksoftOrderId).toBeUndefined();
    expect(out.note).toBe(golden.expected.note);
    expect(j._submittedAt).toBe("2026-10-15T00:00:00.000Z");
  });
  test("only the automatic value is accepted -- 'note' means a lossy rebuild to every reader", () => {
    const out = buildSubmission(clone(golden.form), { source: "note", inksoftOrderId: "1" });
    expect(JSON.parse(out.json)._source).toBeUndefined();
    expect(out.note).toBe(golden.expected.note);
  });
  test("Customer Notes the caller saved reach the JSON and the cards, never the answers", () => {
    const form = clone(golden.form);
    const out = buildSubmission(form, { customerNotes: "[2026-10-15] Picky about placement" });
    expect(JSON.parse(out.json).customerNotes).toBe("[2026-10-15] Picky about placement");
    expect(out.cards.every((c) => c.html.includes("Picky about placement"))).toBe(true);
    expect(form.customerNotes).toBeUndefined();
  });
  test("the PO number and the folder link reach the cards", () => {
    const out = buildSubmission(clone(golden.form), { poNumber: "4291", workDriveLink: "https://workdrive.zoho.com/folder/x", workDriveLabel: "Open the Deal folder" });
    expect(out.cards[0].html).toContain("4291");
    expect(out.cards[0].html).toContain("Open the Deal folder");
  });
});

describe("E-78: a bare date prints as that day", () => {
  test("'2026-11-09' reads 2026-11-09 in the note, wherever the machine is", () => {
    const form = { ...clone(golden.form), dueDate: "2026-11-09" };
    expect(buildSubmission(form).note).toContain("Due Date: 2026-11-09");
  });
});

describe("profileFromSubmission", () => {
  test("one profile per graphic, with its placements, from the JSON or its string", () => {
    const out = buildSubmission(clone(golden.form), golden.dealInfo);
    const p = profileFromSubmission(out.json);
    expect(p).toEqual(profileFromSubmission(JSON.parse(out.json)));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ product: 0, garment: 0, graphic: 0, productName: "Embroidery", garmentKind: expect.any(String) });
    expect(p[0].answers).toMatchObject({ currentGraphicFormat: "DST", colorChange: "No" });
    expect(p[0].answers.colorsUsed).toContain("1645 Light Mint");
    expect(p[0].placements).toEqual([{ placementPick: "Left Chest", placementLocation: "Left Chest", widthIn: "3.5", sizeAndDimensions: '3.5" W × height in proportion', placementSize: "Small" }]);
  });
  test("nothing usable -> an empty list, never a throw", () => {
    [null, undefined, "", "not json", {}, { products: [{ productType: "nongarment" }] }].forEach((x) => expect(profileFromSubmission(x)).toEqual([]));
  });
});
