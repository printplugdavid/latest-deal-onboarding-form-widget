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
