/*
 * Golden fixtures for the note parser, taken verbatim from live CRM notes.
 *
 * The strongest assertion here: parse a real note, supply the garment quantity
 * the note implies, run the SAME calculation the onboarding form used, and get
 * back the print count the note itself printed in its summary. That closes the
 * loop -- parser and math together reproduce the original job.
 */
import { parseOnboardingNote, toPlainText } from "./noteParser";
import { computePrints } from "./printMath";

// Note 5249739000122607751 -- "Season 2 - Putnam Valley High School- Volleyball"
// Plain-text form (real newlines). Its own summary reads:
//   Screen Print  Actual: 200 | Projected: 200 | Total: 400
// Garment quantity is 100 (40 Medium + 40 Large + 20 Extra Large).
const putnamValley = `CONTACT INFO
---------------------------

Account Name: Putnam Valley High School

Deal Name: Season 2 - Putnam Valley High School- Volleyball


PRODUCT INFORMATION
---------------------------

Selected Product Types: Screen Printing

Product 1: Screen Printing
---------------------------

Garment &amp; Graphic Information
---------------------------

Number of Garment Types: 1

Premium Iron Pass?: No

Garment 1:
---------------------------

Garment Type (Brand / Style): Port and Company Shirt PC43

Total Count, Colors &amp; Sizes: Navy 40 Medium, 40 Large, 20 Extra Large

Graphic &amp; Placement Information
---------------------------

Number of Graphics: 2

Graphic 1:
---------------------------

Graphic Description: Tigers Volleyball Logo

Number Of Colors Used: 1

Underbase Needed?: Single-pass

Colors Used (Threads / PANTONES): White

Number Of Placements: 1

Placement 1:
---------------------------

Placement Location: Front of Shirt

Sizes &amp; Dimensions: 10 inches tall

Placement Size: Large

Graphic 2:
---------------------------

Graphic Description: Sponsors on the back. Same as last year

Number Of Colors Used: 1

Underbase Needed?: Single-pass

Colors Used (Threads / PANTONES): White

Number Of Placements: 1

Placement 1:
---------------------------

Placement Location: Back

Sizes &amp; Dimensions: 12 inches tall

Placement Size: Large

Is This Garment Used With Other Application Types?: undefined

Vendors Used: SanMar

Special Instructions / Considerations:

Other Information:


OTHER INFORMATION
---------------------------

How Did You Hear About Us?: Previous Customer

Outsourced Products Ordered: 0

PRINT COUNT SUMMARY
---------------------------

Screen Print
   Actual: 200  |  Projected: 200  |  Total: 400`;

// The HTML form Zoho serves for some notes: <br> line breaks, escaped
// ampersands, and an auto-linkified email address.
const htmlForm =
  "CONTACT INFO<br>---------------------------<br><br>" +
  'Contact Email: <a target="_blank" href="http://x@y.com" style="">x@y.com</a><br><br>' +
  "PRODUCT INFORMATION<br>---------------------------<br><br>" +
  "Product 1: Embroidery<br>---------------------------<br><br>" +
  "Garment &amp; Graphic Information<br>---------------------------<br><br>" +
  "Number of Garment Types: 1<br><br>" +
  "Garment 1:<br>---------------------------<br><br>" +
  "Garment Type (Brand / Style): Nike Polo NKDC1963<br><br>" +
  "Total Count, Colors &amp; Sizes: NKDC1963 Black 1 Extra Large<br><br>" +
  "Number of Graphics: 1<br><br>" +
  "Graphic 1:<br>---------------------------<br><br>" +
  "Graphic Description: HaileyAI symbol<br><br>" +
  "Number Of Colors Used: 1<br><br>" +
  "Underbase Needed?: None<br><br>" +
  "Number Of Placements: 1<br><br>" +
  "Placement 1:<br>---------------------------<br><br>" +
  "Placement Location: Left Chest<br><br>" +
  "Sizes &amp; Dimensions: 2x2<br><br>" +
  "Placement Size: Small<br><br>" +
  "OTHER INFORMATION<br>---------------------------<br><br>" +
  "Is This a Repeat Order?: No";

describe("toPlainText", () => {
  test("unwraps <br>, entities and auto-linkified emails", () => {
    const t = toPlainText(htmlForm);
    expect(t).toContain("Garment & Graphic Information");
    expect(t).toContain("Contact Email: x@y.com");
    expect(t).not.toContain("<a ");
    expect(t).not.toContain("&amp;");
  });
});

describe("parseOnboardingNote — plain-text note", () => {
  const products = parseOnboardingNote(putnamValley);

  test("finds the product and types it from its name", () => {
    expect(products).toHaveLength(1);
    expect(products[0].productName).toBe("Screen Printing");
    expect(products[0].productType).toBe("garment");
    expect(products[0].premiumIronPass).toBe("No");
  });

  test("finds the garment and both graphics", () => {
    const g = products[0].primaryBranches[0];
    expect(products[0].primaryBranches).toHaveLength(1);
    expect(g.garmentType).toBe("Port and Company Shirt PC43");
    expect(g.countColorSize).toBe("Navy 40 Medium, 40 Large, 20 Extra Large");
    expect(g.secondaryBranches).toHaveLength(2);
  });

  test("reads the terms the calculation depends on", () => {
    const [g1, g2] = products[0].primaryBranches[0].secondaryBranches;
    expect(g1.numberOfColorsUsed).toBe("1");
    expect(g1.underbase).toBe("Single-pass");
    expect(g1.numberOfPlacements).toBe("1");
    expect(g1.tartiaryBranches[0].placementLocation).toBe("Front of Shirt");
    expect(g2.graphicDescription).toBe("Sponsors on the back. Same as last year");
    expect(g2.tartiaryBranches[0].placementLocation).toBe("Back");
  });

  test("does not mistake garment-level trailing fields for placement data", () => {
    const g = products[0].primaryBranches[0];
    expect(g.vendorsUsed).toBe("SanMar");
  });

  test("garmentQuantity is absent, as the note never carries it", () => {
    expect(products[0].primaryBranches[0].garmentQuantity).toBe("");
  });

  test("REPRODUCES THE NOTE'S OWN PRINT COUNT once quantity is supplied", () => {
    const withQty = JSON.parse(JSON.stringify(products));
    withQty[0].primaryBranches[0].garmentQuantity = "100"; // 40 + 40 + 20
    const r = computePrints(withQty);
    expect(r.actual.SD).toBe(200);
    expect(r.projected.SD).toBe(200);
    expect(r.SD).toBe(400); // matches the note's own summary
  });

  test("a revision of 6 shirts costs the same way the original did", () => {
    const withQty = JSON.parse(JSON.stringify(products));
    withQty[0].primaryBranches[0].garmentQuantity = "6";
    // 2 graphics x (6*1*1 actual + 6*1 underbase) = 12 + 12 = 24
    expect(computePrints(withQty).SD).toBe(24);
  });
});

describe("parseOnboardingNote — HTML note", () => {
  const products = parseOnboardingNote(htmlForm);

  test("parses identically once unwrapped", () => {
    expect(products).toHaveLength(1);
    expect(products[0].productName).toBe("Embroidery");
    const g = products[0].primaryBranches[0];
    expect(g.garmentType).toBe("Nike Polo NKDC1963");
    expect(g.secondaryBranches[0].numberOfPlacements).toBe("1");
  });

  test("matches the JSON payload's math for the same deal", () => {
    const withQty = JSON.parse(JSON.stringify(products));
    withQty[0].primaryBranches[0].garmentQuantity = "1";
    expect(computePrints(withQty).ED).toBe(1); // same as CRM stored
  });
});

describe("parseOnboardingNote — robustness", () => {
  test("empty or junk content yields no products rather than throwing", () => {
    expect(parseOnboardingNote("")).toEqual([]);
    expect(parseOnboardingNote(null)).toEqual([]);
    expect(parseOnboardingNote("hello")).toEqual([]);
  });

  test("stops at OTHER INFORMATION so the summary is never read as product data", () => {
    expect(parseOnboardingNote(putnamValley)).toHaveLength(1);
  });
});
