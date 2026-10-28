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
    expect(workDriveTarget({ WorkDrive_Link: FOLDER })).toEqual({ kind: "mockup", href: FOLDER, label: "Open the Mockups folder" });
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
    mock.forEach((html) => expect(html).toContain(`href="${FOLDER}" target="_blank" rel="noopener noreferrer">Open the Mockups folder`));
    deal.forEach((html) => {
      expect(html).toContain(`href="${DEAL_FOLDER}" target="_blank" rel="noopener noreferrer">Open the Deal folder`);
      expect(html).not.toContain(FOLDER);
    });
    buildCardsFromData(DATA, {}).forEach((html) => expect(html).not.toContain('class="wd"'));
  });
});

// E-57 -- the size breakdown on the cards, laid out so a color and its sizes say which garment they are.
describe("E-57 sizes on the production cards", () => {
  const order = (garment, productName) => ({ contactInfo: { Account_Name: "A", Deal_Name: "D" }, products: [{ productName: productName || "Screen Printing", productType: "garment", primaryBranches: [garment] }] });
  const card = (data, name) => buildProductionCards(data, {}).find((c) => c.name === name).html;
  const KC = { garmentType: "Gildan Long Sleeve\nGildan Hoodie", garmentQuantity: "73", garmentSkus: [{ sku: "G2400" }, { sku: "18500" }], secondaryBranches: [] };
  test("each style is a heading; each color is one line with its sizes and its count", () => {
    const html = card(order({ ...KC, countColorSize: "Gildan Long Sleeve G2400:\nSafety Green\n10- M\n30- L\n\nGildan Hoodie 18500:\nSafety Green\n3- M\nBlack\n1- 2XL" }), "production-card-screenprint.html");
    expect(html).toContain('<span class="gname">Gildan Long Sleeve / Gildan Hoodie</span>');
    expect(html).toContain('<div class="szg">Gildan Long Sleeve G2400<span class="szgt" style="float:right;background:#1a1a1a;color:#fff;border-radius:3px;padding:0 6px;-webkit-print-color-adjust:exact;print-color-adjust:exact">40 pcs / pzas</span></div><div class="szc"><span class="szn">Safety Green</span><span class="sz">M <b>10</b></span><span class="sz">L <b>30</b></span><span class="szt">= 40</span></div>');
    expect(html).toContain('<div class="szg">Gildan Hoodie 18500<span class="szgt" style="float:right;background:#1a1a1a;color:#fff;border-radius:3px;padding:0 6px;-webkit-print-color-adjust:exact;print-color-adjust:exact">4 pcs / pzas</span></div><div class="szc"><span class="szn">Safety Green</span><span class="sz">M <b>3</b></span><span class="szt">= 3</span></div><div class="szc"><span class="szn">Black</span><span class="sz">2XL <b>1</b></span><span class="szt">= 1</span></div>');
    expect(html).not.toContain('class="szw"');
  });
  test("several styles with unmarked sizes: the card says so (in both languages on the screen-print card)", () => {
    const lumped = { ...KC, countColorSize: "Safety Green\n10- M\n30- L\n3- M\n10- L" };
    const sp = card(order(lumped), "production-card-screenprint.html");
    expect(sp).toContain('class="szw"');
    expect(sp).toContain("2 styles on this garment type");
    expect(sp).toContain("2 estilos");
    const emb = card(order(lumped, "Embroidery"), "production-card-embroidery.html");
    expect(emb).toContain("2 styles on this garment type");
    expect(emb).not.toContain("estilos");
  });
  test("an ordinary one-style garment gets the layout and no warning; free text keeps its line breaks and nothing is dropped", () => {
    const plain = card(order({ garmentType: "Next Level Shirts", garmentQuantity: "29", garmentSkus: [{ sku: "NL6210" }], countColorSize: "Red\n6- S\n23- M", secondaryBranches: [] }), "production-card-screenprint.html");
    expect(plain).toContain('<span class="szn">Red</span><span class="sz">S <b>6</b></span><span class="sz">M <b>23</b></span><span class="szt">= 29</span>');
    expect(plain).not.toContain('class="szw"');
    const free = card(order({ garmentType: "Hats", garmentQuantity: "400", countColorSize: "112T \n200- Green \n200- Black <b>", secondaryBranches: [] }), "production-card-screenprint.html");
    expect(free).toContain('<span class="val" style="white-space:pre-line">112T \n200- Green \n200- Black &lt;b&gt;</span>');
    const mixed = card(order({ garmentType: "Tees", garmentQuantity: "5", countColorSize: "Red\n5- M\nship 2 to the Boise office", secondaryBranches: [] }), "production-card-screenprint.html");
    expect(mixed).toContain('<div class="szu">ship 2 to the Boise office</div>');
    expect(card(order({ garmentType: "Tees", garmentQuantity: "5", countColorSize: "", secondaryBranches: [] }), "production-card-screenprint.html")).not.toContain("Count / Colors / Sizes");
  });
});

describe("E-69 a gang sheet says what color garments it goes on", () => {
  const sheet = (extra) => ({ contactInfo: {}, products: [{ productName: "DTF Gang Sheet", productType: "gangsheet", numberOfGangSheets: "2", gangSheetWidth: "22", gangSheetHeight: "24", numberOfGraphics: "1", gangGraphics: [{ graphicDescription: "Logo", graphicWidth: "4", graphicHeight: "4" }], ...extra }] });
  test("on the vinyl card when answered, and not at all when not", () => {
    const withIt = buildProductionCards(sheet({ garmentColors: "Black, Heather Gray" }), {}).find((c) => c.name === "production-card-vinyl.html").html;
    expect(withIt).toContain("Goes on garments");
    expect(withIt).toContain("Black, Heather Gray");
    const without = buildProductionCards(sheet({}), {}).find((c) => c.name === "production-card-vinyl.html").html;
    expect(without).not.toContain("Goes on garments");
  });
});

// E-83 -- Angela: with two garments in one entry, each garment's count beside its name.
describe("E-83 count per garment on the card", () => {
  const order = (garment) => ({ contactInfo: { Account_Name: "A", Deal_Name: "D" }, products: [{ productName: "Embroidery", productType: "garment", primaryBranches: [garment] }] });
  const card = (data) => buildProductionCards(data, {}).find((c) => c.name === "production-card-embroidery.html").html;
  const twoPolos = { garmentType: "Adidas Polo\nTravis Mathew Polo", garmentQuantity: "10", garmentSkus: [{ sku: "A514" }, { sku: "TM1MU410" }], secondaryBranches: [] };
  test("two polos, sizes entered per polo: each heading shows its own count", () => {
    const html = card(order({ ...twoPolos, countColorSize: "Adidas Polo A514:\nBlack\n3- M\n2- L\n1- XL\n\nTravis Mathew Polo TM1MU410:\nBlack\n2- XL\n2- 2XL" }));
    expect(html).toMatch(/Adidas Polo A514<span class="szgt"[^>]*>6 pcs( \/ pzas)?<\/span>/);
    expect(html).toMatch(/Travis Mathew Polo TM1MU410<span class="szgt"[^>]*>4 pcs( \/ pzas)?<\/span>/);
  });
  test("one style: no extra count (its color total already says it)", () => {
    const html = card(order({ garmentType: "Adidas Polo", garmentQuantity: "5", secondaryBranches: [], countColorSize: "Adidas Polo:\nBlack\n5- M" }));
    expect(html).not.toContain('class="szgt"');
  });
  test("Mountain West Roofing as entered 10-02 (sizes not tied to a polo): no counts invented, the warning stays", () => {
    const html = card(order({ ...twoPolos, countColorSize: "Black\n3- M\n2- L\n3- XL\n2- XL" }));
    expect(html).not.toContain('class="szgt"');
    expect(html).toContain('class="szw"');
  });
});


test("E-117a: the Deal's Garments Ordered Notes show on the cards (viewer); nothing changes without them", () => {
  const { buildCardsFromData } = require("./cardBuild");
  const data = {
    contactInfo: { Account_Name: "Seneca Foods", Deal_Name: "Deal 4" },
    products: [
      {
        productName: "Embroidery",
        productType: "garment",
        primaryBranches: [{ garmentType: "Hoodies", garmentQuantity: "12", vendorsUsed: "SanMar, Richardson", countColorSize: "Black\n12- L", secondaryBranches: [] }],
      },
    ],
  };
  const withNotes = [...buildCardsFromData(data, { Garments_Ordered_Notes: "All from SanMar\nPO 4471" }).values()].join("");
  expect(withNotes).toContain("Garments ordered (from the Deal):</b><br>All from SanMar<br>PO 4471");
  expect(withNotes).toContain("SanMar, Richardson"); // Vendors Used stays as typed (label unchanged: the robot's cards are byte-for-byte)
  const without = [...buildCardsFromData(data, {}).values()].join("");
  expect(without).not.toContain("Garments ordered (from the Deal)");
});

test("E-137: the Deal's garment shipments show on the cards as one-click links (viewer); nothing changes without them", () => {
  const { buildCardsFromData } = require("./cardBuild");
  const data = {
    contactInfo: { Account_Name: "Seneca Foods", Deal_Name: "Deal 4" },
    products: [{ productName: "Embroidery", productType: "garment", primaryBranches: [{ garmentType: "Hoodies", garmentQuantity: "12", countColorSize: "Black\n12- L", secondaryBranches: [] }] }],
  };
  // the new field wins
  const fresh = [...buildCardsFromData(data, { Production_Tracking: "1Z9432470300000001\nhttps://www.ups.com/track?loc=en_US&tracknum=1Z9432470300000001\n\nG172906100000000001", Tracking_Link_1: "449780000900001" }).values()].join("");
  expect(fresh).toContain("Garment shipments (from the Deal):</b> ");
  expect(fresh).toContain('<a href="https://www.ups.com/track?loc=en_US&amp;tracknum=1Z9432470300000001" target="_blank" rel="noopener noreferrer">1Z9432470300000001</a> <span class="omute">UPS</span>');
  expect(fresh).toContain("TrackingNumbers=G172906100000000001");
  expect(fresh).not.toContain("449780000900001");
  // until the move, the old boxes show (the GLS search page replaced by the parcel's own link)
  const old = [...buildCardsFromData(data, { Tracking_Link_1: "449780000900001", Production_Tracking_URL_1: "https://www.gls-us.com/track-and-trace" }).values()].join("");
  expect(old).toContain("TrackingNumbers=449780000900001");
  expect(old).not.toContain("gls-us.com/track-and-trace");
  // none -> no block; a javascript: link is never made clickable
  expect([...buildCardsFromData(data, {}).values()].join("")).not.toContain("Garment shipments");
  const { buildProductionCards } = require("./productionCards");
  const bad = buildProductionCards(data, {}, { shipments: [{ number: "ABC123", link: "javascript:alert(1)", carrier: "" }] }).map((c) => c.html).join("");
  expect(bad).toContain("Garment shipments (from the Deal):</b> ABC123</div>");
  // cards attached at Submit carry no dealInfo.shipments: unchanged
  expect(buildProductionCards(data, {}, {}).map((c) => c.html).join("")).not.toContain("Garment shipments");
});
