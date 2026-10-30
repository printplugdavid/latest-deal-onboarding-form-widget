import { CONTENTS_PREFIX, cardsForItem, formatContents, itemText, orderGarments, parseContents, sortBoxesForCard } from "./boxContents";
import { buildProductionCards, cardRouteOf } from "../productionCards";
import { buildCardsFromData } from "../cardBuild";
import { parseBoxOf, parseTracking } from "../tracking";

const ITEMS = [
  { style: "1717", color: "Granite", sizes: [{ size: "S", count: 5 }, { size: "M", count: 10 }] },
  { style: "112Y", color: "Heather Grey", sizes: [{ size: "OSFA", count: 5 }] },
  { style: "18000", color: "", sizes: [], count: 24 },
];
const LINE = "Contents: 1717 Granite: S 5, M 10 | 112Y Heather Grey: OSFA 5 | 18000: 24";

describe("E-172 Contents line (format owned here; the Deluge twin must write exactly this)", () => {
  test("format", () => {
    expect(formatContents(ITEMS)).toBe(LINE);
    expect(formatContents([])).toBe("");
    expect(formatContents([{ style: "pc-78 h", color: "Black", sizes: [{ size: "L", count: 2 }, { size: "XL", count: 0 }] }])).toBe(
      "Contents: PC78H Black: L 2",
    );
    // real S&S color names carry "/"; ":" "|" "," are taken out so the line always reads back
    const odd = [{ style: "AT104", color: "Medium Grey Heather/ Black", sizes: [{ size: "L", count: 3 }] }, { style: "X1", color: "Red: Hot|Pink", sizes: [{ size: "S, M", count: 1 }] }];
    expect(formatContents(odd)).toBe("Contents: AT104 Medium Grey Heather/ Black: L 3 | X1 Red Hot Pink: S M 1");
    expect(parseContents(formatContents(odd)).map((i) => [i.color, i.sizes[0].size])).toEqual([["Medium Grey Heather/ Black", "L"], ["Red Hot Pink", "S M"]]);
  });

  test("read it back", () => {
    expect(parseContents(LINE)).toEqual([
      { style: "1717", color: "Granite", sizes: [{ size: "S", count: 5 }, { size: "M", count: 10 }], count: 15 },
      { style: "112Y", color: "Heather Grey", sizes: [{ size: "OSFA", count: 5 }], count: 5 },
      { style: "18000", color: "", sizes: [], count: 24 },
    ]);
    expect(parseContents(formatContents(parseContents(LINE)))).toEqual(parseContents(LINE));
  });

  test("the box's place in its supplier order (S&S GLS boxes differ only in the last digits)", () => {
    const line = formatContents(ITEMS.slice(0, 1), { n: 2, of: 5 });
    expect(line).toBe("Contents (box 2 of 5): 1717 Granite: S 5, M 10");
    expect(parseBoxOf(line)).toEqual({ n: 2, of: 5 });
    expect(parseContents(line)).toEqual(parseContents("Contents: 1717 Granite: S 5, M 10"));
    expect(parseBoxOf("Contents: 1717 Granite: S 5")).toBeNull();
    expect(formatContents(ITEMS.slice(0, 1), { n: 3, of: 2 })).toBe("Contents: 1717 Granite: S 5, M 10"); // nonsense: left out
    const boxes = parseTracking("G172906104222002002\nContents (box 2 of 5): 1717 Granite: S 5");
    expect(boxes[0].boxOf).toEqual({ n: 2, of: 5 });
    expect(boxes[0].contents).toHaveLength(1);
  });

  test("anything unreadable is skipped, never guessed", () => {
    expect(parseContents("Shipped: 1717 Granite: S 5")).toEqual([]);
    expect(parseContents("Contents: garbage | 1717 Black: S 2 | : 4 | 5000 Navy: lots")).toEqual([
      { style: "1717", color: "Black", sizes: [{ size: "S", count: 2 }], count: 2 },
    ]);
  });

  test("the tracking reader keeps the line with the box above; it never makes a box or a number", () => {
    const text = [
      "1Z9432470300000001",
      "https://www.ups.com/track?loc=en_US&tracknum=1Z9432470300000001",
      LINE,
      "",
      "449780000900001",
      "https://gls-group.com/US/en/send-and-receive/track-a-parcel/?TrackingNumbers=449780000900001",
    ].join("\n");
    const boxes = parseTracking(text);
    expect(boxes.map((b) => b.number)).toEqual(["1Z9432470300000001", "449780000900001"]);
    expect(boxes[0].contents).toHaveLength(3);
    expect(boxes[1].contents).toBeUndefined();
    expect(parseTracking(`${CONTENTS_PREFIX} 123456789012345: 4`)).toEqual([]); // before any box: ignored
  });
});

// An order: Screen Printing on 1717 Granite + Black, Embroidery on 112Y caps and on 1717 Black (the same tee, a second department).
const ORDER = {
  products: [
    {
      productName: "Screen Printing",
      productType: "garment",
      primaryBranches: [
        { garmentType: "Comfort Colors 1717", garmentSkus: [{ sku: "1717" }], countColorSize: "Granite\n5- S\n10- M\nBlack\n5- S" },
      ],
    },
    {
      productName: "Embroidery",
      productType: "garment",
      primaryBranches: [
        { garmentType: "Richardson Trucker (112Y)", garmentSkus: [], countColorSize: "Heather Grey\n5- OSFA" },
        { garmentType: "Comfort Colors 1717", garmentSkus: [{ sku: "1717" }], countColorSize: "Black\n5- S" },
      ],
    },
  ],
};

describe("E-172 sorting boxes by department", () => {
  const garments = orderGarments(ORDER, cardRouteOf);

  test("the order's garments with styles (SKU rows + a code in brackets) and colors", () => {
    expect(garments).toEqual([
      { card: "screenprint", name: "Comfort Colors 1717", styles: ["1717"], colors: ["granite", "black"] },
      { card: "embroidery", name: "Richardson Trucker (112Y)", styles: ["112Y"], colors: ["heathergray"] },
      { card: "embroidery", name: "Comfort Colors 1717", styles: ["1717"], colors: ["black"] },
    ]);
  });

  test("one garment line with several styles: every style is read, and each section keeps its own colors", () => {
    const multi = {
      products: [
        {
          productName: "Screen Printing",
          productType: "garment",
          primaryBranches: [
            {
              garmentType: "Comfort Colors - Heavyweight Ring Spun Tee (1717)\nMen's Pregame Long Sleeve T-Shirt (AT104)",
              garmentSkus: [{ sku: "1717" }, { sku: "17171" }],
              countColorSize: "Comfort Colors - Heavyweight Ring Spun Tee (1717):\nGranite\n5- S\n\nMen's Pregame Long Sleeve T-Shirt (AT104):\nMedium Grey Heather/ Black\n4- L\n\nnl6211:\nRoyal\n2- S",
            },
          ],
        },
      ],
    };
    const g = orderGarments(multi, cardRouteOf);
    expect(g[0].styles).toEqual(["1717", "17171", "AT104", "NL6211"]);
    expect(g.slice(1).map((x) => [x.styles, x.colors])).toEqual([
      [["1717"], ["granite"]],
      [["AT104"], ["mediumgrayheatherblack"]],
      [["NL6211"], ["royal"]],
    ]);
    // S&S writes the maker's style ("6211", from styleName); our SKU carries the brand letters: NL6211.
    expect(cardsForItem({ style: "6211", color: "Royal" }, g)).toEqual(["screenprint"]);
    expect(cardsForItem({ style: "AT104", color: "Medium Grey Heather/ Black" }, g)).toEqual(["screenprint"]);
  });

  test("an item goes to the department(s) by style, narrowed by color", () => {
    expect(cardsForItem({ style: "1717", color: "Granite" }, garments)).toEqual(["screenprint"]);
    expect(cardsForItem({ style: "1717", color: "Black" }, garments)).toEqual(["screenprint", "embroidery"]);
    expect(cardsForItem({ style: "1717", color: "Orchid" }, garments)).toEqual(["screenprint", "embroidery"]); // color unknown here: both
    expect(cardsForItem({ style: "112Y", color: "Heather Gray" }, garments)).toEqual(["embroidery"]);
    expect(cardsForItem({ style: "5000", color: "Navy" }, garments)).toEqual([]);
    expect(cardsForItem({ style: "220", color: "" }, [{ card: "embroidery", styles: ["RI220"], colors: [] }])).toEqual(["embroidery"]);
  });

  test("each card gets its boxes, with the other departments' garments flagged", () => {
    const boxes = [
      { number: "A", contents: parseContents("Contents: 1717 Granite: S 5, M 10 | 112Y Heather Grey: OSFA 5") },
      { number: "B", contents: parseContents("Contents: 112Y Heather Grey: OSFA 5") },
      { number: "C" },
      { number: "D", contents: parseContents("Contents: 5000 Navy: L 3 | 1717 Black: S 10") },
    ];
    const sp = sortBoxesForCard(boxes, garments, "screenprint");
    expect(sp.mine.map((m) => m.box.number)).toEqual(["A", "D"]);
    expect(sp.mine[0].others).toEqual([{ item: boxes[0].contents[1], cards: ["embroidery"] }]);
    expect(sp.mine[1].items[0].sharedWith).toEqual(["embroidery"]); // 1717 Black: both departments use it
    expect(sp.mine[1].unmatched.map((i) => i.style)).toEqual(["5000"]);
    expect(sp.elsewhere.map((e) => e.box.number)).toEqual(["B"]);
    expect(sp.unknown.map((b) => b.number)).toEqual(["C"]);

    const em = sortBoxesForCard(boxes, garments, "embroidery");
    expect(em.mine.map((m) => m.box.number)).toEqual(["A", "B", "D"]);
    expect(em.mine[0].others.map((o) => o.cards)).toEqual([["screenprint"]]);
  });

  test("item text for the card", () => {
    expect(itemText(parseContents(LINE)[0])).toBe("1717 Granite: S 5, M 10 (15)");
    expect(itemText(parseContents(LINE)[2])).toBe("18000: 24 pcs");
    // the dry run's real order (10-30): notice order -> shop order; an unknown size keeps its place at the end
    expect(itemText(parseContents("Contents (box 1 of 1): 1717 Granite: S 5, XL 5, L 10, M 10, 2XL 5")[0])).toBe("1717 Granite: S 5, M 10, L 10, XL 5, 2XL 5 (35)");
    expect(itemText(parseContents("Contents: 112Y Heather Grey/ White: Adjustable 5, OSFA 1")[0])).toBe("112Y Heather Grey/ White: OSFA 1, Adjustable 5 (6)");
  });
});

describe("E-172 on the cards (switch boxContentsOn)", () => {
  const deal = {
    PO_Number: "4523",
    Production_Tracking: [
      "1Z9432470300000001",
      "https://www.ups.com/track?loc=en_US&tracknum=1Z9432470300000001",
      "Contents: 1717 Granite: S 5, M 10 | 112Y Heather Grey: OSFA 5",
      "",
      "449780000900001",
    ].join("\n"),
  };

  test("the cards read the switch from productionConfig.json (ON since 10-30): a Deal's boxes sorted per card", () => {
    const html = buildCardsFromData(ORDER, deal).get("production-card-screenprint.html");
    expect(html).toContain("boxes with this card's garments");
    expect(html).toContain("Also in this box: 5 pcs that are not for this card");
  });

  test("on: each card lists its own boxes, flags the shared one, folds away the rest", () => {
    const dealInfo = { poNumber: "4523", shipments: parseTracking(deal.Production_Tracking + "\n\n1Z9432470300000002\nContents: 112Y Heather Grey: OSFA 5"), boxContents: true };
    const cards = new Map(buildProductionCards(ORDER, {}, dealInfo).map((c) => [c.name, c.html]));
    const sp = cards.get("production-card-screenprint.html");
    expect(sp).toContain("boxes with this card's garments");
    expect(sp).toContain("1717 Granite: S 5, M 10 (15)");
    expect(sp).toContain('label ends <b style="font-size:16px">0001</b>');
    expect(sp).toContain("Also in this box: 5 pcs that are not for this card");
    expect(sp).toContain("112Y Heather Grey: OSFA 5 (5) &rarr; <b>Embroidery</b>");
    expect(sp).toContain("1 other box has none of this card's garments");
    expect(sp).toMatch(/Contents not listed:<\/span> <a [^>]+>449780000900001<\/a>/);
    const em = cards.get("production-card-embroidery.html");
    expect(em).toContain("112Y Heather Grey: OSFA 5 (5)");
    expect(em).toContain("&rarr; <b>Screen Print</b>");
    expect(em).not.toContain("none of this card's garments");
  });

  test("on: a box with its place in the supplier order says Box 2 of 5", () => {
    const info = { shipments: parseTracking("G172906104222002002\nContents (box 2 of 5): 1717 Granite: S 5"), boxContents: true };
    const sp = new Map(buildProductionCards(ORDER, {}, info).map((c) => [c.name, c.html])).get("production-card-screenprint.html");
    expect(sp).toContain('<b>Box 2 of 5</b> &middot; label ends <b style="font-size:16px">2002</b>');
  });

  test("on, but no box lists contents: the plain line, as before", () => {
    const plain = { poNumber: "4523", shipments: parseTracking("449780000900001"), boxContents: true };
    const sp = new Map(buildProductionCards(ORDER, {}, plain).map((c) => [c.name, c.html])).get("production-card-screenprint.html");
    expect(sp).toContain("Garment shipments (from the Deal):</b> ");
  });
});
