import dayjs from "dayjs";
import { addWeekdays, dueDateProblem, extendedRange, toYmd, turnaroundOf, turnaroundPlan, turnaroundWriteOn, denverToday } from "./turnaround";

// E-144 (David 10-27; Deluge docs/49): Turnaround + Closing Date from the turnaround answers.
describe("E-144 dates", () => {
  test("standard = today + 14 weekdays, like Zoho's addBusinessDay(14) (Ignite: 10-27 -> 11-16)", () => {
    expect(addWeekdays("2026-10-27", 14)).toBe("2026-11-16");
    expect(addWeekdays("2026-10-31", 1)).toBe("2026-11-02"); // a Saturday: the next weekday
  });

  test("the Extended calendar runs standard + 1 to + 7 days, default + 7", () => {
    expect(extendedRange("2026-10-27")).toEqual({ standard: "2026-11-16", min: "2026-11-17", max: "2026-11-23", dflt: "2026-11-23" });
  });

  test("Denver's date, not UTC's (late evening in Idaho is already tomorrow in UTC)", () => {
    expect(denverToday(new Date("2026-10-28T03:30:00Z"))).toBe("2026-10-27");
  });

  test("picker values of every shape become YYYY-MM-DD", () => {
    expect(toYmd(dayjs("2026-10-29"))).toBe("2026-10-29");
    expect(toYmd("2026/10/29")).toBe("2026-10-29");
    expect(toYmd("2026-10-29")).toBe("2026-10-29");
    expect(toYmd(new Date(2026, 9, 29))).toBe("2026-10-29");
    expect(toYmd("")).toBe("");
    expect(toYmd(null)).toBe("");
  });

  test("the due date is required and not in the past", () => {
    expect(dueDateProblem("", "2026-10-27")).toBe("Required");
    expect(dueDateProblem("2026-10-26", "2026-10-27")).toMatch(/past/);
    expect(dueDateProblem("2026-10-27", "2026-10-27")).toBe("");
  });
});

describe("E-144 Turnaround from the answers", () => {
  test("the four kinds", () => {
    expect(turnaroundOf({ hardDueDate: "Yes", dueDate: "2026/10/29", upchargedForRushTurnaround: true })).toEqual({ turnaround: "Rush", closingDate: "2026-10-29" });
    expect(turnaroundOf({ hardDueDate: "Yes", dueDate: "2026/10/29", upchargedForRushTurnaround: false })).toEqual({ turnaround: "Hard Due Date", closingDate: "2026-10-29" });
    expect(turnaroundOf({ hardDueDate: "No", discountsForExtendedTurnaround: "Yes", extendedClosingDate: "2026/11/23" })).toEqual({ turnaround: "Extended", closingDate: "2026-11-23" });
    expect(turnaroundOf({ hardDueDate: "No", discountsForExtendedTurnaround: "No" })).toEqual({ turnaround: "Standard", closingDate: "" });
    expect(turnaroundOf({ hardDueDate: "" })).toEqual({ turnaround: "", closingDate: "" });
  });

  test("early stage: writes only what differs; Standard never writes a Closing Date", () => {
    const deal = { Stage: "Prospect - Invoice Sent", Closing_Date: "2026-11-05", Turnaround: null };
    expect(turnaroundPlan(deal, { hardDueDate: "Yes", dueDate: "2026/10/29", upchargedForRushTurnaround: true }).fields).toEqual({ Turnaround: "Rush", Closing_Date: "2026-10-29" });
    expect(turnaroundPlan(deal, { hardDueDate: "No", discountsForExtendedTurnaround: "No" }).fields).toEqual({ Turnaround: "Standard" });
    expect(turnaroundPlan({ ...deal, Turnaround: "Standard" }, { hardDueDate: "No", discountsForExtendedTurnaround: "No" })).toEqual({ fields: {}, blocked: false, message: "" });
  });

  test("past the early stages: nothing written, the rep is told", () => {
    const p = turnaroundPlan({ Stage: "Mock-Up Approved / In Production" }, { hardDueDate: "Yes", dueDate: "2026/10/29" });
    expect(p.fields).toEqual({});
    expect(p.blocked).toBe(true);
    expect(p.message).toMatch(/Hard Due Date.*2026-10-29.*production manager/);
  });

  test("switched off until the Deluge master is pasted", () => {
    expect(turnaroundWriteOn()).toBe(false);
  });
});

describe("E-144 note line", () => {
  const { buildOnboardingNote } = require("./onboardingNote");
  const { parseNoteToForm } = require("./amendment/noteToForm");
  const order = (extra) => ({
    contactInfo: { Account_Name: "Evergreen", Contact_Name: "Pat", Deal_Name: "Deal 4", Sales_Person: "Ray" },
    products: [{ productName: "Embroidery", productType: "garment", numberOfGarmentTypes: "1", primaryBranches: [{ garmentType: "Richardson 112", garmentQuantity: "12", countColorSize: "Black: OSFA ×12", numberOfGraphics: "1", secondaryBranches: [{ numberOfPlacements: "1", tartiaryBranches: [{ placementLocation: "Front", placementSize: "Small" }] }] }] }],
    typicalMockup: "Yes",
    ...extra,
  });

  test("the picked Extended date is in the note, and the extra-week answer still reads back", () => {
    const { content } = buildOnboardingNote(order({ hardDueDate: "No", discountsForExtendedTurnaround: "Yes", extendedClosingDate: "2026/11/23" }));
    expect(content).toContain("Extended Closing Date: 2026-11-23");
    expect(parseNoteToForm(content).values.discountsForExtendedTurnaround).toBe("Yes");
  });

  test("no date picked (calendar off) -> no line", () => {
    const { content } = buildOnboardingNote(order({ hardDueDate: "No", discountsForExtendedTurnaround: "Yes" }));
    expect(content).not.toContain("Extended Closing Date");
  });
});
