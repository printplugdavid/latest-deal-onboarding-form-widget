import { buildOnboardingNote } from "../onboardingNote";
import { computePrints } from "../printMath";
import { parseNoteToForm, toPlainText } from "./noteToForm";
import { toFormValues, diffValues } from "./amendmentDiff";

/*
 * The honest test of a note parser: feed it the note the form itself writes and see whether the
 * order comes back. buildOnboardingNote() is the real builder, so a label changed there breaks here.
 */
const order = () => ({
  contactInfo: { Account_Name: "Evergreen", Contact_Name: "Pat Doe", Contact_Phone: "208-555-0100", Contact_Email: "p@x.com", Deal_Name: "Deal 4", Sales_Person: "Ray" },
  howDidYouHearAboutUs: "Google",
  doProductsNeedShipped: "Yes",
  shippingContactAddress: "1 Main St\nBoise ID",
  otherShippingDetails: "Leave at dock",
  hardDueDate: "Yes",
  dueDate: "2026-10-10T12:00:00",
  upchargedForRushTurnaround: true,
  typicalMockup: "Yes",
  specialInstructions: "Call first",
  products: [
    {
      productName: "Screen Printing", productType: "garment", numberOfGarmentTypes: "2", premiumIronPass: "Yes", otherInformation: "top note",
      primaryBranches: [
        {
          garmentType: "Gildan 64000", garmentQuantity: "24", countColorSize: "Navy: L ×12, XL ×12", numberOfSkus: "1", garmentSkus: [{ sku: "G640" }],
          vendorsUsed: "SSactivewear", specialInstructions: "fold", isUsedInOtherAppTypes: "No", numberOfGraphics: "2",
          secondaryBranches: [
            { graphicDescription: "Logo", fineDetail: "Yes", upchargeAcknowledged: true, numberOfColorsUsed: "3", underbase: "Single-pass", colorsUsed: "PMS 1", colorChange: "Yes", detailsOfColorChange: "swap red", fontsUsed: "Arial", numberOfPlacements: "2",
              tartiaryBranches: [{ placementLocation: "Front", sizeAndDimensions: "10in" }, { placementLocation: "Back", sizeAndDimensions: "12in" }] },
            { graphicDescription: "Name", numberOfColorsUsed: "1", underbase: "None", numberOfPlacements: "1", tartiaryBranches: [{ placementLocation: "Sleeve" }] },
          ],
        },
        { garmentType: "Hoodie 18500", garmentQuantity: "6", countColorSize: "Black: M ×6", numberOfGraphics: "1",
          secondaryBranches: [{ graphicDescription: "Logo", numberOfColorsUsed: "2", underbase: "None", numberOfPlacements: "1", tartiaryBranches: [{ placementLocation: "Front" }] }] },
      ],
    },
    {
      productName: "Embroidery", productType: "garment", numberOfGarmentTypes: "1",
      primaryBranches: [{ garmentType: "Richardson 112", garmentQuantity: "12", countColorSize: "Black: OSFA ×12", numberOfGraphics: "1",
        secondaryBranches: [{ graphicDescription: "Crest", numberOfColorsUsed: "4", numberOfPlacements: "1", tartiaryBranches: [{ placementLocation: "Front", placementSize: "Small" }] }] }],
    },
    { productName: "Stickers", productType: "nongarment", quantityOrdered: "50", dimensions: "3x3", numberOfSides: "1", isOutsourced: false, vendorsUsed: "StickerCo", numberOfGraphics: "1",
      branches: [{ graphicDescription: "Round logo", numberOfColorsUsed: "2" }] },
  ],
});

const KNOWN = ["Screen Printing#garment", "Embroidery#garment", "Stickers#nongarment", "DTF Gang Sheet#gangsheet"];
const roundTrip = (o) => parseNoteToForm(buildOnboardingNote(o).content, KNOWN);

describe("parseNoteToForm — round trip through the real note builder", () => {
  test("the print counts come back IDENTICAL — this is what gates rewriting the Deal's count fields", () => {
    const { values } = roundTrip(order());
    expect(computePrints(values.products)).toEqual(computePrints(order().products));
  });

  test("garments, quantities, sizes, graphics and placements survive", () => {
    const { values, warnings } = roundTrip(order());
    const g = values.products[0].primaryBranches;
    expect(values.products.map((p) => [p.productName, p.productType])).toEqual([
      ["Screen Printing", "garment"], ["Embroidery", "garment"], ["Stickers", "nongarment"],
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].garmentType).toBe("Gildan 64000");
    expect(g[0].garmentQuantity).toBe("24");
    expect(g[0].countColorSize).toBe("Navy: L ×12, XL ×12");
    expect(g[0].vendorsUsed).toBe("SSactivewear");
    expect(g[0].garmentSkus).toEqual([{ sku: "G640" }]);
    expect(g[0].secondaryBranches).toHaveLength(2);
    expect(g[0].secondaryBranches[0].tartiaryBranches.map((t) => t.placementLocation)).toEqual(["Front", "Back"]);
    expect(g[0].secondaryBranches[0].underbase).toBe("Single-pass");
    expect(g[0].secondaryBranches[0].fineDetail).toBe("Yes");
    expect(g[1].garmentType).toBe("Hoodie 18500");
    expect(values.products[1].primaryBranches[0].secondaryBranches[0].tartiaryBranches[0].placementSize).toBe("Small");
    expect(values.products[2].quantityOrdered).toBe("50");
    expect(warnings).toEqual([]);
  });

  test("every number-of field equals its row count, so the form's watchers add or remove nothing", () => {
    const { values } = roundTrip(order());
    const p = values.products[0];
    expect(p.numberOfGarmentTypes).toBe("2");
    expect(p.primaryBranches[0].numberOfGraphics).toBe("2");
    expect(p.primaryBranches[0].secondaryBranches[0].numberOfPlacements).toBe("2");
    expect(p.primaryBranches[0].numberOfSkus).toBe("1");
  });

  test("contact, shipping and dates come back for the deal-level sections", () => {
    const { values } = roundTrip(order());
    expect(values.contactInfo.Contact_Name).toBe("Pat Doe");
    expect(values.contactInfo.Contact_Phone).toBe("208-555-0100");
    expect(values.doProductsNeedShipped).toBe("Yes");
    expect(values.shippingContactAddress).toBe("1 Main St\nBoise ID");
    expect(values.hardDueDate).toBe("Yes");
    expect(toFormValues(values).dueDate.format("YYYY-MM-DD")).toBe("2026-10-10");
    expect(values.upchargedForRushTurnaround).toBe(true);
  });

  test("an unedited note-sourced prefill shows no changes", () => {
    const v = toFormValues(roundTrip(order()).values);
    expect(diffValues(v, toFormValues(roundTrip(order()).values))).toEqual([]);
  });
});

describe("parseNoteToForm — the rough edges", () => {
  test("an older note with no Total Garment Quantity: the quantity is the sum of the size breakdown", () => {
    const note = buildOnboardingNote(order()).content.replace(/^Total Garment Quantity:.*$/gm, "");
    const { values, warnings } = parseNoteToForm(note, KNOWN);
    expect(values.products[0].primaryBranches[0].garmentQuantity).toBe("24");
    expect(values.products[1].primaryBranches[0].garmentQuantity).toBe("12");
    expect(warnings).toEqual([]);
    expect(computePrints(values.products)).toEqual(computePrints(order().products));
  });

  test("no quantity AND an unreadable size breakdown: left blank, and the agent is told", () => {
    const o = order();
    o.products[1].primaryBranches[0].countColorSize = "see attached";
    const note = buildOnboardingNote(o).content.replace(/^Total Garment Quantity:.*$/gm, "");
    const { values, warnings } = parseNoteToForm(note, KNOWN);
    expect(values.products[1].primaryBranches[0].garmentQuantity).toBe("");
    expect(warnings.join(" ")).toMatch(/Embroidery › Garment 1: no garment quantity/);
  });

  test("HTML notes (<br>, entities, linked emails) read the same as plain ones", () => {
    const plain = buildOnboardingNote(order()).content;
    const html = plain.replace(/&/g, "&amp;").replace(/p@x\.com/, '<a href="mailto:p@x.com">p@x.com</a>').replace(/\n/g, "<br>");
    expect(parseNoteToForm(html, KNOWN).values).toEqual(parseNoteToForm(plain, KNOWN).values);
    expect(toPlainText("a<br/>b&amp;c")).toBe("a\nb&c");
  });

  test("a gang sheet is kept but flagged — its geometry is not in the note", () => {
    const o = order();
    o.products.push({ productName: "DTF Gang Sheet", productType: "gangsheet", gangSheetWidth: "22", gangSheetHeight: "60", numberOfGangSheets: "3", numberOfGraphics: "1", gangGraphics: [{ graphicWidth: "10", graphicHeight: "10", quantityPerSheet: "6" }] });
    const { values, warnings } = roundTrip(o);
    expect(values.products[3]._unparsed).toBe(true);
    expect(warnings.join(" ")).toMatch(/DTF Gang Sheet: this product type cannot be rebuilt/);
  });

  test("an already-amended note is parsed from its original body, not the What Changed block", () => {
    const amended = "ONBOARDING AMENDED 2026-10-01 11:40\n---------------------------\n\nWHAT CHANGED\n• Garment Quantity: 24 → 36\n\n" + buildOnboardingNote(order()).content;
    expect(parseNoteToForm(amended, KNOWN).values.products).toHaveLength(3);
  });

  test("empty and garbage notes do not throw", () => {
    expect(parseNoteToForm("", KNOWN).values.products).toEqual([]);
    expect(() => parseNoteToForm("just some text", KNOWN)).not.toThrow();
    expect(parseNoteToForm("just some text", KNOWN).warnings.length).toBeGreaterThan(0);
  });
});
