import { EXTRA_WEEK_QUESTION, takesExtraWeekDiscount } from "./turnaround";
import { flagsOf } from "./invoice/billingLines";
import { parseNoteToForm } from "./amendment/noteToForm";
import { buildOnboardingNote } from "./onboardingNote";

// E-133 (David 2026-10-27): no hard due date -> "Add one week to turnaround time for an additional 5% off the invoice?"
describe("E-133 extra week for 5% off", () => {
  test("David's exact wording", () => {
    expect(EXTRA_WEEK_QUESTION).toBe("Add one week to turnaround time for an additional 5% off the invoice?");
  });

  test("only a Yes with no hard due date gives the discount", () => {
    expect(takesExtraWeekDiscount({ hardDueDate: "No", discountsForExtendedTurnaround: "Yes" })).toBe(true);
    expect(takesExtraWeekDiscount({ hardDueDate: "No", discountsForExtendedTurnaround: "No" })).toBe(false);
    expect(takesExtraWeekDiscount({ hardDueDate: "No", discountsForExtendedTurnaround: "" })).toBe(false);
    expect(takesExtraWeekDiscount({ hardDueDate: "Yes", discountsForExtendedTurnaround: "Yes" })).toBe(false); // a stale answer after switching to a hard date
    expect(takesExtraWeekDiscount({ hardDueDate: "", discountsForExtendedTurnaround: "Yes" })).toBe(false);
    expect(takesExtraWeekDiscount(null)).toBe(false);
  });

  test("the old 10-14 day tick no longer sends the discount flag (4 drafts did, 10-22 to 10-27)", () => {
    expect(flagsOf({ hardDueDate: "No", discountsForExtendedTurnaround: "No", tenFourteenBusinessDayTurnaround: true }).extendedTurnaround).toBe(false);
    expect(flagsOf({ hardDueDate: "No", discountsForExtendedTurnaround: "Yes" }).extendedTurnaround).toBe(true);
  });
});

const order = (extra) => ({
  contactInfo: { Account_Name: "Evergreen", Contact_Name: "Pat", Deal_Name: "Deal 4", Sales_Person: "Ray" },
  products: [
    {
      productName: "Embroidery",
      productType: "garment",
      numberOfGarmentTypes: "1",
      primaryBranches: [
        {
          garmentType: "Richardson 112",
          garmentQuantity: "12",
          countColorSize: "Black: OSFA ×12",
          numberOfGraphics: "1",
          secondaryBranches: [{ numberOfPlacements: "1", tartiaryBranches: [{ placementLocation: "Front", placementSize: "Small" }] }],
        },
      ],
    },
  ],
  typicalMockup: "Yes",
  ...extra,
});

describe("E-133 in the note and back (Amendment Form)", () => {
  test("the note prints the one question and its answer, and no old tick-box lines", () => {
    const { content } = buildOnboardingNote(order({ hardDueDate: "No", discountsForExtendedTurnaround: "Yes" }));
    expect(content).toContain(EXTRA_WEEK_QUESTION + ": Yes");
    expect(content).not.toMatch(/Discounts for Extended Turnaround Time\?|Add 1 Week To Production Time\?|10-14 Business Day Turnaround\?/);
    expect(parseNoteToForm(content).values.discountsForExtendedTurnaround).toBe("Yes");
  });

  test("a hard due date prints no discount line", () => {
    const { content } = buildOnboardingNote(order({ hardDueDate: "Yes", dueDate: "2026/11/02", discountsForExtendedTurnaround: "Yes" }));
    expect(content).not.toContain(EXTRA_WEEK_QUESTION);
  });

  test("a note from before E-133 still reads: old Yes = Yes, old No + 10-14 days = No", () => {
    const base = buildOnboardingNote(order({ hardDueDate: "No", discountsForExtendedTurnaround: "No" })).content;
    const oldYes = base.replace(EXTRA_WEEK_QUESTION + ": No", "Discounts for Extended Turnaround Time?: Yes\n\nAdd 1 Week To Production Time?: Yes");
    const oldNo = base.replace(EXTRA_WEEK_QUESTION + ": No", "Discounts for Extended Turnaround Time?: No\n\n10-14 Business Day Turnaround?: Yes");
    expect(oldYes).not.toContain(EXTRA_WEEK_QUESTION);
    expect(parseNoteToForm(oldYes).values.discountsForExtendedTurnaround).toBe("Yes");
    expect(parseNoteToForm(oldNo).values.discountsForExtendedTurnaround).toBe("No");
    expect(flagsOf(parseNoteToForm(oldNo).values).extendedTurnaround).toBe(false);
  });
});
