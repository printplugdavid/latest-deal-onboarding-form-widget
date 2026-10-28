import {
  OLD_NUMBER_FIELDS, OLD_URL_FIELDS, TRACKING_FIELD, addBoxes, boxesFromOld, carrierOf, cleanNumber, dealShipments, findNumbers,
  formatBox, formatTracking, linkFor, numberInLink, parseTracking,
} from "./tracking";

// E-137 (David 10-28): one Production_Tracking field, "the number on one line, and the link underneath it". Numbers below are made up
// in the shapes seen on real Deals and in the SanMar / S&S shipment notices (10-28).
const UPS = "1Z9432470300000001";
const UPS2 = "1Z7580FA0300000002";
const GLS_SS = "G172906100000000001"; // S&S ships GLS: "G" + 18 digits
const GLS_SM = "449780000900001"; // SanMar ships GSO = GLS: 4497 + 11 digits
const FEDEX = "877897700001";
const UPS_LINK = (n) => `https://www.ups.com/track?loc=en_US&tracknum=${n}`;
const GLS_LINK = (n) => `https://gls-group.com/US/en/send-and-receive/track-a-parcel/?TrackingNumbers=${n}`;

/*
 * THE FORMAT. The automatic supplier job (E-146, a Zoho function) must write exactly these strings for these inputs -- its tests use
 * this same list. Change both or neither.
 */
const FORMAT_EXAMPLES = [
  { boxes: [{ number: UPS }], text: `${UPS}\n${UPS_LINK(UPS)}` },
  { boxes: [{ number: GLS_SM }, { number: GLS_SS }], text: `${GLS_SM}\n${GLS_LINK(GLS_SM)}\n\n${GLS_SS}\n${GLS_LINK(GLS_SS)}` },
  { boxes: [{ number: FEDEX }], text: `${FEDEX}\nhttps://www.fedex.com/fedextrack/?trknbr=${FEDEX}` },
  { boxes: [{ number: "ABC123XYZ" }], text: "ABC123XYZ" }, // carrier unknown, no link given: the number alone
];

describe("E-137 the format David asked for", () => {
  test.each(FORMAT_EXAMPLES)("example %#", ({ boxes, text }) => {
    expect(formatTracking(boxes)).toBe(text);
    expect(parseTracking(text).map((b) => b.number)).toEqual(boxes.map((b) => cleanNumber(b.number)));
  });

  test("a known carrier always gets the built link, even when another link is handed in", () => {
    expect(formatBox(UPS, "https://www.ssactivewear.com/myaccount/orders")).toBe(`${UPS}\n${UPS_LINK(UPS)}`);
    expect(formatBox("ABC123XYZ", "https://example.com/t/ABC123XYZ")).toBe("ABC123XYZ\nhttps://example.com/t/ABC123XYZ");
  });
});

describe("carriers and one-click links", () => {
  test("carrier from the number", () => {
    expect(carrierOf(UPS)).toBe("UPS");
    expect(carrierOf(" 1z94 3247 0300 0000 01 ")).toBe("UPS");
    expect(carrierOf(GLS_SS)).toBe("GLS");
    expect(carrierOf(GLS_SM)).toBe("GLS");
    expect(carrierOf(FEDEX)).toBe("FedEx");
    expect(carrierOf("9400111899223100000001")).toBe("USPS");
    expect(carrierOf("4553")).toBe("");
    expect(carrierOf("SO-162886187")).toBe("");
  });

  test("the link opens that package (GLS: both kinds checked in a browser 10-28)", () => {
    expect(linkFor(UPS)).toBe(UPS_LINK(UPS));
    expect(linkFor(GLS_SS)).toBe(GLS_LINK(GLS_SS));
    expect(linkFor(GLS_SM)).toBe(GLS_LINK(GLS_SM));
    expect(linkFor("nonsense")).toBe("");
  });

  test("findNumbers takes tracking numbers only, never a PO, price or date", () => {
    expect(findNumbers(`${GLS_SM} ${GLS_SM.slice(0, -1)}2 ${GLS_SM.slice(0, -1)}3`)).toEqual([GLS_SM, GLS_SM.slice(0, -1) + "2", GLS_SM.slice(0, -1) + "3"]);
    expect(findNumbers("PO 4553 4401R paid $404.58 on 10/22/26")).toEqual([]);
    expect(findNumbers(`ship ${UPS}, again ${UPS}`)).toEqual([UPS]);
  });

  test("numberInLink: the carrier parameter, or the highlighted number of a supplier page", () => {
    expect(numberInLink(`https://www.ups.com/track?loc=en_US&requester=QUIC&tracknum=${UPS}/trackdetails`)).toBe(UPS);
    expect(numberInLink(`https://www.ups.com/track?track=yes&trackNums=${UPS}&loc=en_US&requester=ST/trackdetails`)).toBe(UPS);
    expect(numberInLink(`https://www.ssactivewear.com/myaccount/orders#:~:text=%24127.70-,${GLS_SS},-Yes`)).toBe(GLS_SS);
    // a SanMar order page highlights one box and shows its neighbours: only the highlighted one
    expect(numberInLink(`https://www.sanmar.com/mysanmar/sales-orders/order-details?salesOrderNumber=SO-1#:~:text=${UPS2}-,${UPS},-1Z426E600300000009`)).toBe(UPS);
    expect(numberInLink("https://www.gls-us.com/track-and-trace")).toBe(""); // the search page names no box
    expect(numberInLink(UPS)).toBe(""); // not a link
  });
});

describe("reading the field back (what people type)", () => {
  test("number line + link line pairs, any link kept only for an unknown carrier", () => {
    const text = `${UPS}\nhttps://www.gls-us.com/track-and-trace\n\n${GLS_SS}\n${GLS_LINK(GLS_SS)}`;
    expect(parseTracking(text)).toEqual([
      { number: UPS, link: UPS_LINK(UPS), carrier: "UPS" },
      { number: GLS_SS, link: GLS_LINK(GLS_SS), carrier: "GLS" },
    ]);
  });

  test("a pasted link alone is a box; a line with several numbers is several boxes; other words are ignored", () => {
    const text = `${UPS_LINK(UPS)}\nfrom SanMar Reno: ${GLS_SM}, ${UPS2}\nchecked 10/22 KB`;
    expect(parseTracking(text).map((b) => b.number)).toEqual([UPS, GLS_SM, UPS2]);
  });

  test("empty or blank is nothing", () => {
    expect(parseTracking("")).toEqual([]);
    expect(parseTracking(null)).toEqual([]);
    expect(parseTracking("\n \n")).toEqual([]);
  });
});

describe("adding boxes never changes or removes what is there", () => {
  test("appends in the format after a blank line; a number already there is not added again", () => {
    const now = `${UPS}\nhttps://www.ups.com/track?some-typed-link\n\nnote from Korie`;
    const r = addBoxes(now, [{ number: UPS }, { number: GLS_SS }]);
    expect(r.added).toEqual([GLS_SS]);
    expect(r.text).toBe(`${now}\n\n${GLS_SS}\n${GLS_LINK(GLS_SS)}`);
    expect(r.text.startsWith(now)).toBe(true);
  });

  test("into an empty field; nothing new -> the field unchanged", () => {
    expect(addBoxes("", [{ number: UPS }]).text).toBe(`${UPS}\n${UPS_LINK(UPS)}`);
    expect(addBoxes(`${UPS}\n${UPS_LINK(UPS)}\n`, [{ number: UPS }])).toEqual({ text: `${UPS}\n${UPS_LINK(UPS)}\n`, added: [] });
  });
});

describe("the 8 old boxes (what the one-time move reads)", () => {
  const deal = (pairs) => {
    const d = {};
    pairs.forEach(([n, u], i) => { d[OLD_NUMBER_FIELDS[i]] = n; d[OLD_URL_FIELDS[i]] = u; });
    return d;
  };

  test("number + link pairs become boxes with one-click links (the old GLS search page is replaced)", () => {
    expect(boxesFromOld(deal([[UPS, UPS_LINK(UPS)], [GLS_SM, "https://www.gls-us.com/track-and-trace"]]))).toEqual([
      { number: UPS, link: UPS_LINK(UPS), carrier: "UPS" },
      { number: GLS_SM, link: GLS_LINK(GLS_SM), carrier: "GLS" },
    ]);
  });

  test("a box holding five numbers, a box holding a link (March 2026 Deals), a number with no link", () => {
    const five = ["1", "2", "3", "4", "5"].map((x) => GLS_SM.slice(0, -1) + x);
    const got = boxesFromOld(deal([[five.join(" "), null], [UPS_LINK(UPS), null], [FEDEX, null]]));
    expect(got.map((b) => b.number)).toEqual([...five, UPS, FEDEX]);
  });

  test("a link naming a different box than its number box adds that box too; repeats across slots are listed once", () => {
    const got = boxesFromOld(deal([[UPS, UPS_LINK(UPS2)], [UPS, UPS_LINK(UPS)]]));
    expect(got.map((b) => b.number)).toEqual([UPS, UPS2]);
  });

  test("an empty Deal has none", () => {
    expect(boxesFromOld({})).toEqual([]);
    expect(boxesFromOld(null)).toEqual([]);
  });

  test("dealShipments: the new field when it has boxes, else the old boxes", () => {
    const old = deal([[UPS, null]]);
    expect(dealShipments(old).map((b) => b.number)).toEqual([UPS]);
    expect(dealShipments({ ...old, [TRACKING_FIELD]: `${GLS_SS}\n${GLS_LINK(GLS_SS)}` }).map((b) => b.number)).toEqual([GLS_SS]);
    expect(dealShipments({ ...old, [TRACKING_FIELD]: "  " }).map((b) => b.number)).toEqual([UPS]);
  });
});

describe("shapes found in the 746 Deals' old boxes (dry run 10-28)", () => {
  test("older S&S GLS numbers are one digit shorter (G + 17); they open on the GLS page too (checked 10-28)", () => {
    expect(carrierOf("G14531400000000001")).toBe("GLS");
    expect(linkFor("G14531400000000001")).toBe(GLS_LINK("G14531400000000001"));
  });

  test("one USPS number typed in groups is read; separate numbers on one line are never glued together", () => {
    expect(findNumbers("9405 5301 0900 0000 0000 01")).toEqual(["9405530109000000000001"]);
    expect(carrierOf("9405530109000000000001")).toBe("USPS");
    expect(findNumbers(`${GLS_SM} ${GLS_SM.slice(0, -1)}2`)).toEqual([GLS_SM, GLS_SM.slice(0, -1) + "2"]);
    expect(findNumbers("4553 4401 4528")).toEqual([]);
  });

  test("boxes with no number in them move nothing (S&S 'javascript:' links, an order page, a note, the GLS search page)", () => {
    const d = {
      Tracking_Link_1: "javascript:%20openWindow('/myaccount/trackold?OrderGUID=ac7260cf-f9b1-45d4-9e10-2b7dbe924471&popup=true','840','800');",
      Tracking_Link_2: "https://www.momentecbrands.com/TrackOrderStatus?catalogId=10601&langId=-1&storeId=10251",
      Tracking_Link_3: "Many tracking numbers see notes",
      Tracking_Link_4: "https://www.gls-us.com/track-and-trace",
    };
    expect(boxesFromOld(d)).toEqual([]);
  });
});
