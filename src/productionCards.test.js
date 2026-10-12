import { buildProductionCards } from "./productionCards";
import { buildCardsFromData } from "./cardBuild";

// E-53 -- the Deal's PO number and WorkDrive folder on every production card.
const DATA = {
  contactInfo: { Account_Name: "Power Landscape", Deal_Name: "Deal 6 - Power Landscape - Embroidery - Hats" },
  products: [
    {
      productName: "Embroidery",
      productType: "garment",
      primaryBranches: [
        { garmentType: "Richardson Hat", garmentQuantity: "70", countColorSize: "Red/Black 20", secondaryBranches: [{ graphicDescription: "P logo", colorsUsed: "Black", tartiaryBranches: [{ placementLocation: "Front Center" }] }] },
      ],
    },
  ],
};
const COUNTS = { embroideryPrints: 70 };
const FOLDER = "https://workdrive.zohoexternal.com/folder/abc123";

describe("E-53 PO number and WorkDrive folder on the production cards", () => {
  test("both appear on EVERY card of the deal", () => {
    const cards = buildProductionCards(DATA, COUNTS, { poNumber: "4377", workDriveLink: FOLDER });
    expect(cards.length).toBeGreaterThanOrEqual(2); // embroidery + graphic design
    cards.forEach((c) => {
      expect(c.html).toContain('<span class="po">PO # <b>4377</b></span>');
      expect(c.html).toContain(`<a class="wd" href="${FOLDER}" target="_blank" rel="noopener noreferrer">Open WorkDrive folder`);
    });
  });
  test("without them a card carries neither -- nothing is invented, nothing is left blank", () => {
    [undefined, {}, { poNumber: null, workDriveLink: "" }, { poNumber: "  ", workDriveLink: "   " }].forEach((info) => {
      buildProductionCards(DATA, COUNTS, info).forEach((c) => {
        expect(c.html).not.toContain('class="po"');
        expect(c.html).not.toContain('class="wd"');
      });
    });
  });
  test("the old two-argument call still works and builds the same cards", () => {
    const a = buildProductionCards(DATA, COUNTS);
    const b = buildProductionCards(DATA, COUNTS, {});
    expect(a.map((c) => c.name)).toEqual(b.map((c) => c.name));
    expect(a.map((c) => c.html)).toEqual(b.map((c) => c.html));
  });
  test("one without the other", () => {
    const po = buildProductionCards(DATA, COUNTS, { poNumber: 4377 })[0].html; // a number is fine too
    expect(po).toContain("PO # <b>4377</b>");
    expect(po).not.toContain('class="wd"');
    const wd = buildProductionCards(DATA, COUNTS, { workDriveLink: FOLDER })[0].html;
    expect(wd).toContain('class="wd"');
    expect(wd).not.toContain('class="po"');
  });
  test("only an https address becomes a link, and text from the Deal cannot break out of the card", () => {
    ["javascript:alert(1)", "data:text/html,x", "http://workdrive.zoho.com/folder/x", "workdrive.zoho.com/folder/x"].forEach((bad) => {
      expect(buildProductionCards(DATA, COUNTS, { workDriveLink: bad })[0].html).not.toContain('class="wd"');
    });
    const html = buildProductionCards(DATA, COUNTS, { poNumber: '<b>"x"</b>', workDriveLink: 'https://x.test/a"><script>alert(1)</script>' })[0].html;
    expect(html).toContain("PO # <b>&lt;b&gt;\"x\"&lt;/b&gt;</b>");
    expect(html).toContain('href="https://x.test/a&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(html).not.toContain("<script>");
  });
  test("the viewer and the Quality Check form pass the Deal's CURRENT values", () => {
    const built = buildCardsFromData(DATA, { PO_Number: "4377", WorkDrive_Link: FOLDER, Embroidery_Department_Prints: 70, Closing_Date: "2026-10-13" });
    const html = built.get("production-card-embroidery.html");
    expect(html).toContain("PO # <b>4377</b>");
    expect(html).toContain(`href="${FOLDER}"`);
    expect(html).toContain("2026-10-13"); // the live due date still works beside them
    // a Deal that has neither yet (onboarded before the invoice / the folder existed)
    expect(buildCardsFromData(DATA, {}).get("production-card-embroidery.html")).not.toContain('class="po"');
  });
});
