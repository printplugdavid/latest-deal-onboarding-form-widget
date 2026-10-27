import { customerNotesEntry, customerNotesNoteLines, customerNotesWarningKey } from "./revisionCustomerNotes";
import { makeT } from "./i18n";

const DIV = "-----";

describe("E-132 revision form customer notes", () => {
  test("nothing is saved unless the answer is Yes and something was typed", () => {
    expect(customerNotesEntry("No", "Picky about placement")).toBe("");
    expect(customerNotesEntry("Yes", "   ")).toBe("");
    expect(customerNotesEntry("Yes", null)).toBe("");
    expect(customerNotesEntry("Yes", "  Picky about placement \n")).toBe("Picky about placement");
  });

  test("no entry: the revision note is exactly as before (no section, no warning)", () => {
    expect(customerNotesNoteLines("", null, DIV)).toEqual([]);
    expect(customerNotesWarningKey("", null)).toBe("");
  });

  test("added to the account: a section with the text, line breaks kept, no warning", () => {
    const r = { accountWritten: true, dealWritten: true, tooLong: false };
    expect(customerNotesNoteLines("Check placement\nwith the client", r, DIV)).toEqual([
      "",
      "CUSTOMER NOTES (added to the account)",
      DIV,
      "  Check placement",
      "  with the client",
    ]);
    expect(customerNotesWarningKey("x", r)).toBe("");
  });

  test("account field full: the note keeps the text and says it was NOT added", () => {
    const r = { accountWritten: false, dealWritten: false, tooLong: true };
    expect(customerNotesNoteLines("x", r, DIV)[1]).toMatch(/NOT added/);
    expect(customerNotesNoteLines("x", r, DIV)[3]).toBe("  x");
    expect(customerNotesWarningKey("x", r)).toBe("cn.warnFull");
  });

  test("no Account / account refused: saved on the deal only", () => {
    const r = { accountWritten: false, dealWritten: true, tooLong: false };
    expect(customerNotesNoteLines("x", r, DIV)[1]).toMatch(/deal only/);
    expect(customerNotesWarningKey("x", r)).toBe("cn.warnDealOnly");
  });

  test("nothing could be saved", () => {
    const r = { accountWritten: false, dealWritten: false, tooLong: false };
    expect(customerNotesNoteLines("x", r, DIV)[1]).toMatch(/could not be saved/);
    expect(customerNotesWarningKey("x", r)).toBe("cn.warnFailed");
  });

  test("every new screen string exists in English and Spanish", () => {
    const keys = [
      "sec.customerNotes", "cn.existing", "cn.ask", "cn.question", "cn.yes", "cn.no", "cn.label",
      "cn.tooltip", "cn.tooLong", "cn.warnFull", "cn.warnDealOnly", "cn.warnFailed", "need.notes",
    ];
    const en = makeT("en");
    const es = makeT("es");
    keys.forEach((k) => {
      expect(en(k)).not.toBe(k);
      expect(es(k)).not.toBe(k);
      if (k !== "cn.no") expect(es(k)).not.toBe(en(k));
    });
    expect(en("cn.tooLong", { n: 12, max: 2000 })).toMatch(/Too long by 12 characters.*2000/);
  });
});
