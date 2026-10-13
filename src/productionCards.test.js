import { DEAL_FOLDER_FIELD, buildProductionCards, workDriveTarget } from "./productionCards";
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

// E-55 -- the WorkDrive button opens the DEAL's folder (David, 2026-10-13). WorkDrive_Link is the Mock Up folder.
describe("E-55 which WorkDrive folder the button opens", () => {
  const DEAL_FOLDER = "https://workdrive.zoho.com/folder/dealfolder1";
  test("the Deal folder when the Deal carries its link; otherwise the Mock Up folder, named as that; otherwise nothing", () => {
    expect(DEAL_FOLDER_FIELD).toBe("Deal_Folder_Link");
    expect(workDriveTarget({ Deal_Folder_Link: DEAL_FOLDER, WorkDrive_Link: FOLDER })).toEqual({ kind: "deal", href: DEAL_FOLDER, label: "Open the Deal folder" });
    expect(workDriveTarget({ WorkDrive_Link: FOLDER })).toEqual({ kind: "mockup", href: FOLDER, label: "Open the Mock Up folder" });
    expect(workDriveTarget({ Deal_Folder_Link: "  ", WorkDrive_Link: " " + FOLDER + " " }).href).toBe(FOLDER);
    [{}, null, undefined, { WorkDrive_Link: null }].forEach((d) => expect(workDriveTarget(d)).toEqual({ kind: "", href: "", label: "" }));
  });
  test("only an https address is ever a link -- a bad Deal-folder value falls back, it does not run", () => {
    expect(workDriveTarget({ Deal_Folder_Link: "javascript:alert(1)", WorkDrive_Link: FOLDER }).kind).toBe("mockup");
    expect(workDriveTarget({ Deal_Folder_Link: "http://x.test/a", WorkDrive_Link: "data:text/html,x" }).href).toBe("");
  });
  test("the cards say which folder they open, and point at the Deal folder when there is one", () => {
    const mock = buildCardsFromData(DATA, { WorkDrive_Link: FOLDER });
    const deal = buildCardsFromData(DATA, { WorkDrive_Link: FOLDER, Deal_Folder_Link: DEAL_FOLDER });
    expect(mock.size).toBeGreaterThanOrEqual(2);
    mock.forEach((html) => expect(html).toContain(`href="${FOLDER}" target="_blank" rel="noopener noreferrer">Open the Mock Up folder`));
    deal.forEach((html) => {
      expect(html).toContain(`href="${DEAL_FOLDER}" target="_blank" rel="noopener noreferrer">Open the Deal folder`);
      expect(html).not.toContain(FOLDER);
    });
    buildCardsFromData(DATA, {}).forEach((html) => expect(html).not.toContain('class="wd"'));
  });
});
