/*
 * Fixtures are REAL production text, copied from the DEAL ONBOARDING FORM note on
 * deal 5249739000125555192 (Deal 2 - Highlight Tint), submitted 2026-09-29.
 * That deal is why this module exists: its note carries the sizes-vs-total warning
 * twice, and one line reads "12- Small" where every sibling reads "1-".
 */
import {
  parseSizeText, formatSizeRows, sumRows, normalizeSize, SIZE_OPTIONS,
  countColorBlocks, setColorCount, insertSizeBelow, isBlankRow,
} from "./sizeRows";
import { sumSizeCounts } from "./quantityCheck";

// Garment 1, abridged to three color blocks but otherwise verbatim -- trailing
// spaces, "1- medium" lower case and the "Mdeium" typo are all real.
const REAL_GARMENT_1 = `Hoodies:
Snow Camo 
1- XS
1- Small
1- Medium 
1- Large
1- XL
1- 2XL
1- 3XL 

Maroon 
1- XS 
1- Small
1- medium 
1- Large 
1- XL 
1- 2Xl 
1- 3XL 

Deadwood Tree Camo:
1- XS
1- Small
1- Mdeium 
1- Large
1- XL
1- 2XL 
1- 3XL `;

// Garment 2's Oxblood Black block -- the fat-finger that started this.
const REAL_TYPO = `Oxblood Black 
1- XS
12- Small
1- Medium 
1- Large
1- XL `;

describe("normalizeSize — the spellings agents actually type", () => {
  test("canonical options pass through", () => {
    SIZE_OPTIONS.forEach((s) => expect(normalizeSize(s)).toBe(s));
  });

  test("real production spellings and typos", () => {
    expect(normalizeSize("Small")).toBe("S");
    expect(normalizeSize("small")).toBe("S");
    expect(normalizeSize("medium")).toBe("M");
    expect(normalizeSize("Mdeium")).toBe("M");   // real typo, Highlight Tint
    expect(normalizeSize("2Xl")).toBe("2XL");    // real, Highlight Tint
    expect(normalizeSize("Large ")).toBe("L");
    expect(normalizeSize("XXL")).toBe("2XL");
    expect(normalizeSize("One Size")).toBe("OSFA");
  });

  test("⭐ youth sizes — all over real data, absent from the revision form's list", () => {
    // Deal 5249739000123007161 read "2- Youth Large" / "2- Youth XL".
    expect(normalizeSize("Youth Large")).toBe("YL");
    expect(normalizeSize("Youth XL")).toBe("YXL");
    expect(normalizeSize("youth small")).toBe("YS");
    expect(normalizeSize("YL")).toBe("YL");
    const { rows, unparsed } = parseSizeText("Black\n2- Youth Large\n2- Youth XL");
    expect(unparsed).toEqual([]);
    expect(rows.map((r) => r.size)).toEqual(["YL", "YXL"]);
    expect(sumRows(rows)).toBe(4);
  });

  test("returns null rather than guessing at something unknown", () => {
    expect(normalizeSize("Tall")).toBeNull();
    expect(normalizeSize("")).toBeNull();
    expect(normalizeSize(null)).toBeNull();
  });
});

describe("parseSizeText — real production text", () => {
  const { rows, unparsed } = parseSizeText(REAL_GARMENT_1);

  test("every size line is captured", () => {
    expect(rows).toHaveLength(21);          // 3 colors x 7 sizes
    expect(unparsed).toEqual([]);
  });

  test("⭐ COLOR is preserved — losing it would be a regression", () => {
    expect([...new Set(rows.map((r) => r.color))]).toEqual([
      "Snow Camo",
      "Maroon",
      "Deadwood Tree Camo",
    ]);
  });

  test("the style heading is kept as the group", () => {
    expect(rows[0].group).toBe("Hoodies");
  });

  test("typos are normalised, counts are read", () => {
    const maroon = rows.filter((r) => r.color === "Maroon");
    expect(maroon.map((r) => r.size)).toEqual(["XS", "S", "M", "L", "XL", "2XL", "3XL"]);
    expect(maroon.every((r) => r.count === 1)).toBe(true);
  });

  test("a heading ending in ':' does not become a color", () => {
    expect(rows.some((r) => r.color === "Hoodies")).toBe(false);
  });

  test("unrecognisable lines are reported, never guessed", () => {
    const out = parseSizeText("Black\n1- XS\n2 pallets of something\nTall - 4");
    expect(out.rows).toHaveLength(1);
    expect(out.unparsed).toEqual(["2 pallets of something", "Tall - 4"]);
  });
});

describe("sumRows — the total without parsing anything", () => {
  test("matches the count of the real block", () => {
    const { rows } = parseSizeText(REAL_GARMENT_1);
    expect(sumRows(rows)).toBe(21);
  });

  test("⭐ catches the real 12- Small fat-finger", () => {
    const { rows } = parseSizeText(REAL_TYPO);
    expect(sumRows(rows)).toBe(16);                       // 1+12+1+1+1
    const small = rows.find((r) => r.size === "S");
    expect(small.count).toBe(12);                          // surfaced, not hidden
  });
});

describe("⭐ THE CONTRACT — serialising must not change what downstream reads", () => {
  test("round-trip preserves the total quantityCheck computes", () => {
    const { rows } = parseSizeText(REAL_GARMENT_1);
    const before = sumSizeCounts(REAL_GARMENT_1).sum;
    const after = sumSizeCounts(formatSizeRows(rows)).sum;
    expect(after).toBe(before);
    expect(after).toBe(21);
  });

  test("round-trip holds on the typo block too", () => {
    const { rows } = parseSizeText(REAL_TYPO);
    expect(sumSizeCounts(formatSizeRows(rows)).sum).toBe(sumSizeCounts(REAL_TYPO).sum);
  });

  test("sumRows and sumSizeCounts agree on the serialised form", () => {
    const { rows } = parseSizeText(REAL_GARMENT_1);
    expect(sumSizeCounts(formatSizeRows(rows)).sum).toBe(sumRows(rows));
  });

  test("the serialised form still reads like the note it replaces", () => {
    const rows = [
      { group: "Hoodies", color: "Snow Camo", size: "XS", count: 1 },
      { group: "Hoodies", color: "Snow Camo", size: "2XL", count: 3 },
      { group: "Hoodies", color: "Maroon", size: "L", count: 2 },
    ];
    expect(formatSizeRows(rows)).toBe(
      "Hoodies:\nSnow Camo\n1- XS\n3- 2XL\nMaroon\n2- L"
    );
  });

  test("parse -> format -> parse is stable", () => {
    const once = parseSizeText(REAL_GARMENT_1).rows;
    const twice = parseSizeText(formatSizeRows(once)).rows;
    expect(twice).toEqual(once);
  });

  test("empty and junk input never throw", () => {
    expect(formatSizeRows([])).toBe("");
    expect(formatSizeRows(null)).toBe("");
    expect(sumRows(null)).toBe(0);
    expect(parseSizeText(null).rows).toEqual([]);
    expect(parseSizeText("").rows).toEqual([]);
  });
});

describe("E-36 -- how many colors, then that many lines", () => {
  const filled = [
    { group: "", color: "Black", size: "S", count: 2 },
    { group: "", color: "Black", size: "M", count: 3 },
    { group: "", color: "Red", size: "L", count: 1 },
  ];

  test("counts runs of one color as one block; each blank line is its own", () => {
    expect(countColorBlocks([])).toBe(0);
    expect(countColorBlocks(filled)).toBe(2);
    const blank = { group: "", color: "", size: "", count: "" };
    expect(countColorBlocks([...filled, blank, blank])).toBe(4);
    expect(isBlankRow({ group: "Hoodies", color: "", size: "", count: "" })).toBe(true);
    expect(isBlankRow({ color: "", size: "", count: 0 })).toBe(false);
  });

  test("from empty: 3 colors lays out 3 blank lines, and the saved string is unchanged", () => {
    const r = setColorCount([], 3);
    expect(r.rows).toHaveLength(3);
    expect(r.blocks).toBe(3);
    expect(formatSizeRows(r.rows)).toBe("");
    expect(sumRows(r.rows)).toBe(0);
  });

  test("growing keeps every existing row and does not change the saved string", () => {
    const before = formatSizeRows(filled);
    const r = setColorCount(filled, 5);
    expect(r.rows.slice(0, 3)).toEqual(filled);
    expect(r.rows).toHaveLength(6);
    expect(formatSizeRows(r.rows)).toBe(before);
  });

  test("shrinking removes only untouched lines, never one with something typed", () => {
    const grown = setColorCount(filled, 5).rows;
    const back = setColorCount(grown, 2);
    expect(back.rows).toEqual(filled);
    const refused = setColorCount(filled, 1);
    expect(refused.rows).toEqual(filled);
    expect(refused.blocks).toBe(2); // > 1: the caller says the typed lines were kept
    const typed = [...filled, { group: "", color: "Navy", size: "", count: "" }];
    expect(setColorCount(typed, 0).rows).toEqual(typed);
  });

  test("blank, junk and huge numbers are safe", () => {
    expect(setColorCount(filled, "").rows).toEqual(filled);
    expect(setColorCount(filled, "abc").rows).toEqual(filled);
    expect(setColorCount(filled, -4).rows).toEqual(filled);
    expect(setColorCount([], 9999).rows).toHaveLength(50);
  });

  test("new lines inherit the style heading so the saved string keeps one heading", () => {
    const styled = [{ group: "Hoodies", color: "Maroon", size: "S", count: 1 }];
    const r = setColorCount(styled, 2).rows;
    r[1] = { ...r[1], color: "Navy", size: "M", count: 2 };
    expect(formatSizeRows(r)).toBe("Hoodies:\nMaroon\n1- S\nNavy\n2- M");
  });

  test("another size for a color goes directly under it, same color", () => {
    const r = insertSizeBelow(filled, 1);
    expect(r).toHaveLength(4);
    expect(r[2]).toEqual({ group: "", color: "Black", size: "", count: "" });
    expect(r[3]).toEqual(filled[2]);
    expect(formatSizeRows(r)).toBe(formatSizeRows(filled));
    expect(countColorBlocks(r)).toBe(2);
  });
});

describe("E-45 -- tall sizes", () => {
  const TALL = ["LT", "XLT", "2XLT", "3XLT", "4XLT"];
  test("are offered, and every size is still offered once", () => {
    TALL.forEach((t) => expect(SIZE_OPTIONS).toContain(t));
    expect(new Set(SIZE_OPTIONS).size).toBe(SIZE_OPTIONS.length);
    ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "OSFA", "YXS", "YS", "YM", "YL", "YXL"].forEach((s) =>
      expect(SIZE_OPTIONS).toContain(s)
    );
  });
  test("what reps type is recognized -- and regular sizes are not mistaken for tall", () => {
    expect(normalizeSize("LT")).toBe("LT");
    expect(normalizeSize("Large Tall")).toBe("LT");
    expect(normalizeSize("XL Tall")).toBe("XLT");
    expect(normalizeSize("2xlt")).toBe("2XLT");
    expect(normalizeSize("2X Tall")).toBe("2XLT");
    expect(normalizeSize("XXXLT")).toBe("3XLT");
    expect(normalizeSize("4XLT")).toBe("4XLT");
    expect(normalizeSize("L")).toBe("L");
    expect(normalizeSize("XL")).toBe("XL");
    expect(normalizeSize("2XL")).toBe("2XL");
    expect(normalizeSize("Tall")).toBe(null);
  });
  test("rows round-trip through the saved text, and the total is the row total", () => {
    const rows = [
      { group: "", color: "Navy", size: "LT", count: 3 },
      { group: "", color: "Navy", size: "2XLT", count: 3 },
      { group: "", color: "Navy", size: "4XLT", count: 1 },
      { group: "", color: "Navy", size: "2XL", count: 2 },
    ];
    const text = formatSizeRows(rows);
    expect(text).toBe("Navy\n3- LT\n3- 2XLT\n1- 4XLT\n2- 2XL");
    expect(parseSizeText(text).rows).toEqual(rows);
    expect(parseSizeText(text).unparsed).toEqual([]);
    // ⚠️ the sizes-vs-total check must not count the 2 and the 4 in "2XLT" / "4XLT" as garments
    expect(sumSizeCounts(text).sum).toBe(9);
    expect(sumRows(rows)).toBe(9);
  });
  test("the sizes check still strips ordinary digit sizes and still counts real numbers", () => {
    expect(sumSizeCounts("Black 5- Small, 5- Medium, 7- Large, 6- XL, 1- 4XL").sum).toBe(24);
    expect(sumSizeCounts("2- 3XLT, 1- 3XL, 4- XLT").sum).toBe(7);
    expect(sumSizeCounts("12 Large Tall").sum).toBe(12);
  });
});

// E-57 -- "can't see which color goes to which garment" (the graphic designer, 2026-10-13).
// KC is a real block from 2026-10-13 (Kc Steel Erectors Deal 6): two styles, two codes, one color,
// and eight size lines with nothing saying where the long sleeves end and the hoodies begin.
describe("E-57 which garment a color and its sizes belong to", () => {
  const { sizeBlocks, stylesNotMarked, styleOptionsFor, rowsMissingStyle } = require("./sizeRows");
  const KC = { garmentType: "Gildan Long Sleeve\nGildan Hoodie", garmentSkus: [{ sku: "G2400" }, { sku: "18500" }], countColorSize: "Safety Green\n10- M\n30- L\n10- XL\n4- 2XL\n3- M\n10- L\n5- XL\n1- 2XL" };
  const MARKED = "Gildan Long Sleeve G2400:\nSafety Green\n10- M\n30- L\n10- XL\n4- 2XL\n\nGildan Hoodie 18500:\nSafety Green\n3- M\n10- L\n5- XL\n1- 2XL";

  test("the options a rep picks from: each Garment Type line, then any SKU not already named in one", () => {
    expect(styleOptionsFor(KC.garmentType, KC.garmentSkus)).toEqual(["Gildan Long Sleeve", "Gildan Hoodie", "G2400", "18500"]);
    expect(styleOptionsFor("PC55Y Port & Co youth t-shirts\nPC55 Port & Co Adult T- Shirts", [{ sku: "PC55Y" }, { sku: "PC55" }])).toEqual(["PC55Y Port & Co youth t-shirts", "PC55 Port & Co Adult T- Shirts"]);
    expect(styleOptionsFor("Next Level Shirts", [{ sku: "NL6210" }, { sku: "" }])).toEqual(["Next Level Shirts", "NL6210"]);
    expect(styleOptionsFor(null, null)).toEqual([]);
  });
  test("rows with a style are written under a heading, and read back exactly", () => {
    const rows = [
      ...[["M", 10], ["L", 30], ["XL", 10], ["2XL", 4]].map(([size, count]) => ({ group: "Gildan Long Sleeve G2400", color: "Safety Green", size, count })),
      ...[["M", 3], ["L", 10], ["XL", 5], ["2XL", 1]].map(([size, count]) => ({ group: "Gildan Hoodie 18500", color: "Safety Green", size, count })),
    ];
    expect(formatSizeRows(rows)).toBe(MARKED);
    expect(parseSizeText(MARKED)).toEqual({ rows, unparsed: [] });
    expect(rowsMissingStyle(rows)).toBe(0);
    expect(rowsMissingStyle([{ group: "", color: "Black", size: "M", count: 1 }, { group: "", color: "", size: "", count: "" }])).toBe(1); // a blank line is not "missing"
  });
  test("for the reader: style, then each color with its sizes and its piece count", () => {
    expect(sizeBlocks(MARKED)).toEqual({
      blocks: [
        { group: "Gildan Long Sleeve G2400", color: "Safety Green", sizes: [{ size: "M", count: 10 }, { size: "L", count: 30 }, { size: "XL", count: 10 }, { size: "2XL", count: 4 }], total: 54 },
        { group: "Gildan Hoodie 18500", color: "Safety Green", sizes: [{ size: "M", count: 3 }, { size: "L", count: 10 }, { size: "XL", count: 5 }, { size: "2XL", count: 1 }], total: 19 },
      ],
      unparsed: [],
      total: 73,
    });
    // as it was actually saved: ONE block of eight lines -- the boundary is not in the data
    const lumped = sizeBlocks(KC.countColorSize);
    expect(lumped.blocks).toHaveLength(1);
    expect(lumped.blocks[0].sizes).toHaveLength(8);
    expect(lumped.total).toBe(73);
    // older free text is not forced into the shape
    expect(sizeBlocks("NKDC1963 Black 1 Extra Large")).toEqual({ blocks: [], unparsed: ["NKDC1963 Black 1 Extra Large"], total: 0 });
    expect(sizeBlocks("")).toEqual({ blocks: [], unparsed: [], total: 0 });
  });
  test("says so when several styles are listed and the sizes are not tied to one -- and only then", () => {
    expect(stylesNotMarked(KC)).toBe(2);
    expect(stylesNotMarked({ ...KC, countColorSize: MARKED })).toBe(0);
    expect(stylesNotMarked({ garmentType: "Nike Polo\nNike Long Sleeve Polo\nWomen's Cardigan", garmentSkus: [{ sku: "NKDC1963" }, { sku: "NKDC2104" }, { sku: "MM3023" }], countColorSize: "Black\n3- L\n4- XL\n2- L\n1- XL\n1- M\n1- L" })).toBe(3);
    expect(stylesNotMarked({ garmentType: "Next Level Shirts", garmentSkus: [{ sku: "NL6210" }], countColorSize: "Red\n6- S\n23- M" })).toBe(0); // one style: nothing to mark
    expect(stylesNotMarked({ garmentType: "A\nB", garmentSkus: [], countColorSize: "" })).toBe(0); // no sizes typed: nothing to read wrong
    expect(stylesNotMarked({ garmentType: "PC55", garmentSkus: [{ sku: "PC55" }, { sku: "pc55" }], countColorSize: "Black\n1- L" })).toBe(0); // the same code twice is one style
    expect(stylesNotMarked(null)).toBe(0);
  });
});

describe("E-57 a style heading is a name, not a count", () => {
  test("a heading carrying a bare style number does not inflate the sizes check", () => {
    const marked = "Gildan Long Sleeve G2400:\nSafety Green\n10- M\n30- L\n10- XL\n4- 2XL\n\nGildan Hoodie 18500:\nSafety Green\n3- M\n10- L\n5- XL\n1- 2XL";
    expect(sumSizeCounts(marked).sum).toBe(73); // was 18,573 before the heading rule
    expect(sumSizeCounts("112:\nBlack\n15- OSFA").sum).toBe(15);
    expect(sumSizeCounts("Richardson 112:\nBlack\n15- OSFA\n8800 Gildan Polo:\nBlack\n1- L").sum).toBe(16);
  });
  test("what counted before still counts", () => {
    expect(sumSizeCounts("Black 5- Small, 5- Medium, 7- Large, 6- XL, 1- 4XL").sum).toBe(24);
    expect(sumSizeCounts("Black: OSFA ×12").sum).toBe(12); // a colon inside a line is not a heading
    expect(sumSizeCounts("Navy: L ×12, XL ×12").sum).toBe(24);
    expect(sumSizeCounts("Hoodies:\nSnow Camo\n1- XS\n1- Small\nIND4000Z Hoodies:\nMaroon\n1- XS").sum).toBe(3);
  });
});

describe("E-57 the entry screen: one section per style, sizes under it", () => {
  const { tagSections, sectionsOf, nextUnusedStyle } = require("./sizeRows");
  const MARKED = "Gildan Long Sleeve G2400:\nSafety Green\n10- M\n30- L\n\nGildan Hoodie 18500:\nSafety Green\n3- M\nBlack\n1- 2XL";
  test("read from text: a section starts wherever the style changes", () => {
    const rows = tagSections(parseSizeText(MARKED).rows);
    expect(rows.map((r) => r.sec)).toEqual([0, 0, 1, 1]);
    expect(sectionsOf(rows)).toEqual([
      { sec: 0, group: "Gildan Long Sleeve G2400", indexes: [0, 1], total: 40 },
      { sec: 1, group: "Gildan Hoodie 18500", indexes: [2, 3], total: 4 },
    ]);
    expect(tagSections(parseSizeText("Red\n6- S\n23- M").rows).map((r) => r.sec)).toEqual([0, 0]); // one style: one section
    expect(tagSections(null)).toEqual([]);
    expect(sectionsOf(null)).toEqual([]);
  });
  test("the screen tag keeps two sections apart while their styles are blank or equal -- and is never saved", () => {
    const rows = [
      { group: "", color: "Safety Green", size: "M", count: 10, sec: 0 },
      { group: "", color: "Safety Green", size: "M", count: 3, sec: 1 },
    ];
    expect(sectionsOf(rows).map((x) => [x.sec, x.indexes, x.total])).toEqual([[0, [0], 10], [1, [1], 3]]);
    expect(formatSizeRows(rows)).toBe("Safety Green\n10- M\n3- M"); // nothing about `sec` in the string
    const named = rows.map((r) => ({ ...r, group: r.sec ? "Gildan Hoodie" : "Gildan Long Sleeve" }));
    expect(formatSizeRows(named)).toBe("Gildan Long Sleeve:\nSafety Green\n10- M\n\nGildan Hoodie:\nSafety Green\n3- M");
    expect(sumRows(named)).toBe(13);
  });
  test("a new section starts on the first listed style nothing uses yet", () => {
    const opts = ["Gildan Long Sleeve", "Gildan Hoodie", "G2400", "18500"];
    expect(nextUnusedStyle([], opts)).toBe("Gildan Long Sleeve");
    expect(nextUnusedStyle([{ group: "gildan long sleeve " }], opts)).toBe("Gildan Hoodie");
    expect(nextUnusedStyle(opts.map((group) => ({ group })), opts)).toBe("");
    expect(nextUnusedStyle([{ group: "x" }], [])).toBe("");
  });
});

// The Zoho Books thread, 2026-10-14: match SKUs EXACTLY -- 6400 / 64000 and 146 / 1466 are different real styles.
describe("SKUs are matched as whole codes", () => {
  const { hasCode, styleOptionsFor } = require("./sizeRows");
  const { lumpedSignals } = require("./lumpedOrder");
  test("a code inside a longer code is not that code", () => {
    expect(hasCode("Gildan 64000", "6400")).toBe(false);
    expect(hasCode("Bella+Canvas 6400", "6400")).toBe(true);
    expect(hasCode("Richardson 1466", "146")).toBe(false);
    expect(hasCode("PC55Y youth", "PC55")).toBe(false);
    expect(hasCode("PC55 adult", "pc55")).toBe(true);
    expect(hasCode("(PC54) tee", "PC54")).toBe(true);
    expect(hasCode("anything", "")).toBe(false);
  });
  test("the style options keep a SKU that only looks like part of another style", () => {
    expect(styleOptionsFor("Gildan 64000", [{ sku: "6400" }])).toEqual(["Gildan 64000", "6400"]);
    expect(styleOptionsFor("Bella+Canvas 6400", [{ sku: "6400" }])).toEqual(["Bella+Canvas 6400"]);
  });
  test("the lumped-order signal does not mistake 64000 in a description for SKU 6400", () => {
    const g = (desc) => ({ garmentSkus: [{ sku: "6400" }, { sku: "PC54" }], garmentType: "Tees", garmentQuantity: "20", secondaryBranches: [{ graphicDescription: desc }, { graphicDescription: "Back" }] });
    expect(lumpedSignals(g("Front on the Gildan 64000 only")).scoped).toEqual([]);
    expect(lumpedSignals(g("Front on the 6400 only")).scoped).toEqual([1]);
  });
});

