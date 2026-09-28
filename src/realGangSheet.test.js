/*
 * GOLDEN FIXTURE -- the first REAL gang sheet, captured verbatim from the live
 * note on deal 5249739000124864707 ("RUSH - Deal 3 - Rachel Nash - DTF Prints
 * Only", onboarded 2026-09-23). Until this landed, every gang-sheet test in this
 * repo ran on a fixture we wrote ourselves, which can only prove we are
 * self-consistent. This one proves we read what the onboarding form actually
 * emits.
 *
 * Its own PRINT COUNT SUMMARY says Vinyl 12, and the Deal holds
 * DTF_Gang_Sheet_Prints 12 / DTF_Prints 0 / Vinyl_Department_Prints 12 -- so a
 * full one-sheet reprint must cost 12, and the note is its own answer key.
 *
 * Note the shape: THREE graphics, each "How Many Per Sheet: 4", no width/height
 * geometry we can pack -- a note-only deal, so the per-sheet figure has to come
 * from the "Estimated Prints: 12 per sheet x 1 = 12" line.
 */
import { parseOnboardingNote } from "./noteParser";
import { costItem, gangPerSheet, isGangSheet } from "./affected";

const REAL_GANG_SHEET_NOTE = "CONTACT INFO\n---------------------------\n\nAccount Name: Rachel Nash\n\nContact Name: Rachel Nash\n\nContact Phone: 2083536544\n\nContact Email: rachelnash36@yahoo.com\n\nDeal Name: RUSH - Deal 3 - Rachel Nash - DTF Prints Only\n\nSales Person: Ray Castaneda\n\n\nPRODUCT INFORMATION\n---------------------------\n\nSelected Product Types: DTF Gang Sheet\n\nProduct 1: DTF Gang Sheet\n---------------------------\n\nGang Sheet Information\n---------------------------\n\nNumber of Gang Sheets: 1\n\nGang Sheet Size: 12\" wide x 80\" tall\n\nNumber of Graphics on the Sheet: 3\n\nGraphic 1: \n---------------------------\n\nGraphic Description: Out with it with Truck logo\n\nGraphic Size: 11\" wide x 12\" tall\n\nHow Many Per Sheet: 4\n\nIs Graphic Print Ready?: No\n\nNumber of Colors Used: \n\nColors Used: Full Color DTF\n\nCurrent Graphic Format: PNG\n\nUpcharge Acknowledged?: No\n\nFonts Used: IDK\n\nGraphic 2: \n---------------------------\n\nGraphic Description: OUt with it with truck logo, but it will be smaller\n\nGraphic Size: 2\" wide x 2.5\" tall\n\nHow Many Per Sheet: 4\n\nIs Graphic Print Ready?: No\n\nNumber of Colors Used: \n\nColors Used: Full Color DTF\n\nCurrent Graphic Format: PNG\n\nUpcharge Acknowledged?: No\n\nFonts Used: IDK\n\nGraphic 3: \n---------------------------\n\nGraphic Description: OutWithIt Text\n\nGraphic Size: 4\" wide x 2\" tall\n\nHow Many Per Sheet: 4\n\nIs Graphic Print Ready?: No\n\nNumber of Colors Used: \n\nColors Used: Full Color DTF\n\nCurrent Graphic Format: PNG\n\nUpcharge Acknowledged?: No\n\nFonts Used: IDK\n\nEstimated Prints: 12 per sheet x 1 = 12\n\nOther Information: \n\n\nOTHER INFORMATION\n---------------------------\n\nHow Did You Hear About Us?: Previous Customer\n\nSupplies / Materials Needed: \n\nOutsourced Products Ordered: 0\n\nSpecial Instructions: \n\nIs This a Repeat Order?: No\n\nDo Products Need Shipped?: No\n\nCustomer Consents to Email and Text?: Yes\n\nRound up for Charity?: No\n\n\nTURNAROUND TIME\n---------------------------\n\nDoes Customer Have A Hard Due Date?: Yes\n\nDue Date: 2026-09-25\n\nUpcharged For Rush Turnaround Time?: No\n\nCustmer Acknowledged 24-48 Hour Mock-Up?: Yes\n\nPRINT COUNT SUMMARY\n---------------------------\n\nActual = base design prints. Projected = extra prints from process steps (underbase, premium iron, heat press). Total = Actual + Projected.\n\nScreen Print\n   Actual: 0  |  Projected: 0  |  Total: 0\n\nVinyl\n   Actual: 12  |  Projected: 0  |  Total: 12\n\nEmbroidery\n   Actual: 0  |  Projected: 0  |  Total: 0\n   Placement sizes \u2014 Small: 0  |  Medium: 0  |  Large: 0\n\n---------------------------\n\nALL DEPARTMENTS\n   Actual: 12  |  Projected: 0  |  Total: 12";

describe("a real gang sheet note (Rachel Nash, 2026-09-23)", () => {
  const products = parseOnboardingNote(REAL_GANG_SHEET_NOTE);

  test("is recognised as a gang sheet, not a nongarment", () => {
    expect(products).toHaveLength(1);
    expect(products[0].productName).toBe("DTF Gang Sheet");
    expect(products[0].productType).toBe("gangsheet");
    expect(isGangSheet(products[0])).toBe(true);
  });

  test("reads the sheet facts the agent will see on the card", () => {
    expect(products[0].numberOfGangSheets).toBe("1");
    expect(products[0].gangSheetSize).toBe('12" wide x 80" tall');
    expect(products[0].numberOfGraphics).toBe("3");
  });

  test("takes the per-sheet figure from the Estimated Prints line", () => {
    // 3 graphics x 4 per sheet = 12. No geometry in a note, so this line is it.
    expect(products[0].estimatedPrintsPerSheet).toBe("12");
    expect(gangPerSheet(products[0])).toBe(12);
  });

  test("a full reprint of the one sheet costs what the note printed: 12", () => {
    const r = costItem(products, { productIndex: 0, affected: "1" }, "Revision");
    expect(r.VD).toBe(12);            // matches Vinyl_Department_Prints on the Deal
    expect(r.actual.VD).toBe(12);     // a sheet ships unpressed
    expect(r.projected.VD).toBe(0);
    expect([r.SD, r.ED]).toEqual([0, 0]);
  });

  test("reprinting 2 sheets of a 1-sheet order costs 24, not the ordered total", () => {
    // The agent can reprint more sheets than were ordered -- the count they type
    // is the truth, never numberOfGangSheets.
    expect(costItem(products, { productIndex: 0, affected: "2" }, "Revision").VD).toBe(24);
  });
});

/*
 * Second real one, and a different shape: deal 5249739000124759087
 * ("RUSH - Deal 1 - Stitchit - DTF - Prints Only", 2026-09-22) -- ONE graphic
 * with an explicit "How Many Per Sheet: 1000", and the OVERFLOW line the
 * onboarding form prints when the request does not physically fit:
 *
 *     NOTE: the requested graphics do not all fit on one sheet at these sizes.
 *
 * That line sits between "Estimated Prints" and "Other Information", so it is
 * exactly where a label-anchored parser could swallow it into the wrong field.
 * It is also the largest real job seen (1000 prints on one sheet), which is what
 * makes getting its per-sheet figure right worth pinning.
 */
const STITCHIT_NOTE = "CONTACT INFO\n---------------------------\n\nAccount Name: Stitchit\n\nContact Name: Todd Banta\n\nContact Phone: 2085732651\n\nContact Email: stitchittodd@gmail.com\n\nDeal Name: RUSH - Deal 1 - Stitchit - DTF - Prints Only\n\nSales Person: Ray Castaneda\n\n\nPRODUCT INFORMATION\n---------------------------\n\nSelected Product Types: DTF Gang Sheet\n\nProduct 1: DTF Gang Sheet\n---------------------------\n\nGang Sheet Information\n---------------------------\n\nNumber of Gang Sheets: 1\n\nGang Sheet Size: 12\" wide x 108\" tall\n\nNumber of Graphics on the Sheet: 1\n\nGraphic 1: \n---------------------------\n\nGraphic Description: Cross with circle guy in the middle. \n\nGraphic Size: .8\" wide x .8\" tall\n\nHow Many Per Sheet: 1000\n\nIs Graphic Print Ready?: No\n\nNumber of Colors Used: 0\n\nColors Used: Full Color DTF\n\nCurrent Graphic Format: PDF\n\nUpcharge Acknowledged?: No\n\nFonts Used: N/A\n\nEstimated Prints: 1000 per sheet x 1 = 1000\n\nNOTE: the requested graphics do not all fit on one sheet at these sizes.\n\nOther Information: \n\n\nOTHER INFORMATION\n---------------------------\n\nHow Did You Hear About Us?: Google\n\nSupplies / Materials Needed: \n\nOutsourced Products Ordered: 0\n\nSpecial Instructions: \n\nIs This a Repeat Order?: No\n\nDo Products Need Shipped?: No\n\nCustomer Consents to Email and Text?: Yes\n\nRound up for Charity?: No\n\n\nTURNAROUND TIME\n---------------------------\n\nDoes Customer Have A Hard Due Date?: Yes\n\nDue Date: 2026-09-23\n\nUpcharged For Rush Turnaround Time?: Yes\n\nCustmer Acknowledged 24-48 Hour Mock-Up?: Yes\n\nPRINT COUNT SUMMARY\n---------------------------\n\nActual = base design prints. Projected = extra prints from process steps (underbase, premium iron, heat press). Total = Actual + Projected.\n\nScreen Print\n   Actual: 0  |  Projected: 0  |  Total: 0\n\nVinyl\n   Actual: 1000  |  Projected: 0  |  Total: 1000\n\nEmbroidery\n   Actual: 0  |  Projected: 0  |  Total: 0\n   Placement sizes \u2014 Small: 0  |  Medium: 0  |  Large: 0\n\n---------------------------\n\nALL DEPARTMENTS\n   Actual: 1000  |  Projected: 0  |  Total: 1000";

describe("a real gang sheet with an overflow warning (Stitchit, 2026-09-22)", () => {
  const products = parseOnboardingNote(STITCHIT_NOTE);

  test("parses despite the overflow NOTE line", () => {
    expect(products).toHaveLength(1);
    expect(products[0].productType).toBe("gangsheet");
    expect(products[0].gangSheetSize).toBe('12" wide x 108" tall');
    expect(products[0].numberOfGraphics).toBe("1");
  });

  test("the overflow line does not corrupt the fields around it", () => {
    // "Other Information" follows the NOTE line and is genuinely empty here --
    // it must not pick up the warning text.
    expect(String(products[0].otherInformation || "").trim()).toBe("");
    expect(products[0].estimatedPrintsPerSheet).toBe("1000");
  });

  test("a one-sheet reprint costs the 1000 the note printed", () => {
    const r = costItem(products, { productIndex: 0, affected: "1" }, "Revision");
    expect(r.VD).toBe(1000);        // matches Vinyl_Department_Prints on the Deal
    expect(r.actual.VD).toBe(1000);
    expect(r.projected.VD).toBe(0);
  });
});
