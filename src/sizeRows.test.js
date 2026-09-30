/*
 * Fixtures are REAL production text, copied from the DEAL ONBOARDING FORM note on
 * deal 5249739000125555192 (Deal 2 - Highlight Tint), submitted 2026-09-29.
 * That deal is why this module exists: its note carries the sizes-vs-total warning
 * twice, and one line reads "12- Small" where every sibling reads "1-".
 */
import { parseSizeText, formatSizeRows, sumRows, normalizeSize, SIZE_OPTIONS } from "./sizeRows";
import { sumSizeCounts } from "./quantityCheck";

// Garment 1, abridged to three colour blocks but otherwise verbatim -- trailing
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

  test("returns null rather than guessing at something unknown", () => {
    expect(normalizeSize("Tall")).toBeNull();
    expect(normalizeSize("")).toBeNull();
    expect(normalizeSize(null)).toBeNull();
  });
});

describe("parseSizeText — real production text", () => {
  const { rows, unparsed } = parseSizeText(REAL_GARMENT_1);

  test("every size line is captured", () => {
    expect(rows).toHaveLength(21);          // 3 colours x 7 sizes
    expect(unparsed).toEqual([]);
  });

  test("⭐ COLOUR is preserved — losing it would be a regression", () => {
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

  test("a heading ending in ':' does not become a colour", () => {
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
