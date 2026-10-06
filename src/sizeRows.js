/*
 * sizeRows.js -- structured size entry for "Total Count, Colors & Sizes".
 *
 * That field is ONE free-text box carrying FOUR dimensions -- style, color, size
 * and count -- which is why agents mistype it. A real production note reads:
 *
 *     Hoodies:
 *     Snow Camo
 *     1- XS
 *     1- Small
 *     IND4000Z Hoodies:
 *     Maroon
 *     1- XS
 *
 * On 2026-09-30 one such box read "12- Small" where every sibling line read "1-",
 * and the order went out with a quantity the form itself had flagged as wrong
 * (docs/03 2026-09-30 (5)). Structured rows make that untypeable.
 *
 * ⚠️ THE CONTRACT: `countColorSize` stays a STRING in the payload, the note and the
 * production card. This module is the bridge -- the UI edits rows, `format()`
 * serialises them back to a string that `quantityCheck.sumSizeCounts` parses to
 * exactly the same number. Nothing downstream changes shape, so no 06 amendment
 * and no risk to noteParser.js on the ~2,659 note-only deals.
 *
 * Pure: no React, no ZOHO.
 */

// The sizes offered as choices. Matches the revision form's affected.js so the two
// forms speak the same vocabulary. OTHER lets an agent type anything we missed.
export const SIZE_OPTIONS = [
  "XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL",
  // Tall sizes (E-45, sales request 2026-10-06). Like youth, NOT in the revision form's list.
  "LT", "XLT", "2XLT", "3XLT", "4XLT",
  "OSFA",
  // ⚠️ Youth sizes are NOT in the revision form's affected.js list, but they are
  // all over real onboarding data -- "2- Youth Large" / "2- Youth XL" on deal
  // 5249739000123007161. Without them every youth line would fall to `unparsed`.
  // The two lists have deliberately diverged here; the revision form should catch
  // up rather than this one being trimmed back. Recorded in docs/04 E-29.
  "YXS", "YS", "YM", "YL", "YXL",
];

// How a youth size reads on screen; the stored value stays the short form.
export const SIZE_LABELS = {
  YXS: "Youth XS", YS: "Youth S", YM: "Youth M", YL: "Youth L", YXL: "Youth XL",
  OSFA: "OSFA (one size)",
  LT: "LT (Large Tall)", XLT: "XLT (XL Tall)", "2XLT": "2XLT (2XL Tall)", "3XLT": "3XLT (3XL Tall)", "4XLT": "4XLT (4XL Tall)",
};
export const OTHER_SIZE = "__other__";

// What agents actually type, mapped to the canonical option. Lower-cased, trimmed,
// punctuation-free on lookup -- real notes contain "Small", "small", "2Xl", "Mdeium".
const SIZE_ALIASES = {
  xxs: "XXS", xxsmall: "XXS", "2xs": "XXS",
  xs: "XS", xsmall: "XS", extrasmall: "XS",
  s: "S", sm: "S", small: "S",
  m: "M", med: "M", medium: "M", mdeium: "M", mediun: "M",
  l: "L", lg: "L", large: "L", lrg: "L",
  xl: "XL", xlarge: "XL", extralarge: "XL",
  "2xl": "2XL", xxl: "2XL", "2x": "2XL",
  "3xl": "3XL", xxxl: "3XL", "3x": "3XL",
  "4xl": "4XL", xxxxl: "4XL", "4x": "4XL",
  "5xl": "5XL", "5x": "5XL",
  osfa: "OSFA", os: "OSFA", onesize: "OSFA", onesizefitsall: "OSFA",
  // Youth. Agents write "Youth Large", "YLarge", "YL", "Y-L".
  yxs: "YXS", youthxs: "YXS", youthxsmall: "YXS", youthextrasmall: "YXS",
  ys: "YS", youths: "YS", youthsmall: "YS", ysmall: "YS",
  ym: "YM", youthm: "YM", youthmedium: "YM", ymedium: "YM", ymed: "YM",
  yl: "YL", youthl: "YL", youthlarge: "YL", ylarge: "YL",
  yxl: "YXL", youthxl: "YXL", youthxlarge: "YXL", youthextralarge: "YXL",
  y2xl: "YXL",
  // Tall. Agents write "LT", "Large Tall", "Tall Large", "XL Tall", "2XLT", "2X Tall", "XXLT".
  lt: "LT", largetall: "LT", ltall: "LT", talllarge: "LT", talll: "LT",
  xlt: "XLT", xltall: "XLT", xlargetall: "XLT", extralargetall: "XLT", tallxl: "XLT",
  "2xlt": "2XLT", "2xltall": "2XLT", "2xtall": "2XLT", xxlt: "2XLT", xxltall: "2XLT", tall2xl: "2XLT",
  "3xlt": "3XLT", "3xltall": "3XLT", "3xtall": "3XLT", xxxlt: "3XLT", xxxltall: "3XLT", tall3xl: "3XLT",
  "4xlt": "4XLT", "4xltall": "4XLT", "4xtall": "4XLT", xxxxlt: "4XLT", tall4xl: "4XLT",
};

/* "Small" -> "S", "2Xl" -> "2XL", "Mdeium" -> "M", "Tall 3" -> null (unrecognised) */
export function normalizeSize(raw) {
  const key = String(raw == null ? "" : raw).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key) return null;
  return SIZE_ALIASES[key] || (SIZE_OPTIONS.indexOf(String(raw).toUpperCase()) >= 0 ? String(raw).toUpperCase() : null);
}

const COUNT_LINE = /^\s*(\d+)\s*[-–—:.]?\s*(.+?)\s*$/;
const TRAILING_COUNT = /^\s*(.+?)\s*[-–—:x×]\s*(\d+)\s*$/i;

/*
 * Best-effort read of an existing free-text breakdown into rows. Used to PRE-FILL the
 * structured editor when amending, and to migrate a deal onboarded before this existed.
 *
 * Deliberately conservative: anything it cannot classify is returned in `unparsed`
 * rather than guessed at, so the UI can show it verbatim and let a human decide.
 * A wrong guess here would silently change an order.
 */
export function parseSizeText(text) {
  const rows = [];
  const unparsed = [];
  let group = "";
  let color = "";

  const lines = String(text == null ? "" : text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

  // Does this line carry a count? Used both to classify it and to look ahead.
  const countOf = (t) => {
    let m = t.match(COUNT_LINE);
    if (m) {
      const size = normalizeSize(m[2]);
      if (size) return { size, count: parseInt(m[1], 10) };
    }
    m = t.match(TRAILING_COUNT);
    if (m) {
      const size = normalizeSize(m[1]);
      if (size) return { size, count: parseInt(m[2], 10) };
    }
    return null;
  };

  lines.forEach((t, i) => {
    const counted = countOf(t);
    if (counted) {
      rows.push({ group, color, size: counted.size, count: counted.count });
      return;
    }

    /*
     * ⚠️ A trailing colon does NOT reliably mean "style heading". Real production
     * text (deal 5249739000125555192) contains BOTH "Hoodies:" -- a style -- and
     * "Deadwood Tree Camo:" -- a color. Agents punctuate inconsistently, which is
     * precisely why this field needs structuring.
     *
     * The rule that separates them: a heading introduces a COLOR, a color
     * introduces COUNTS. So look at what comes next.
     */
    if (/\d/.test(t) && !/:\s*$/.test(t)) {
      unparsed.push(t);
      return;
    }

    const label = t.replace(/:\s*$/, "").trim();
    const next = lines[i + 1];
    const nextIsCount = next ? !!countOf(next) : false;

    if (nextIsCount) {
      color = label;
    } else {
      group = label;
      color = "";
    }
  });

  return { rows, unparsed };
}

/*
 * Serialise rows back to the string the payload, note and card already expect.
 *
 * ⚠️ Chosen so quantityCheck.sumSizeCounts() reaches the SAME total:
 *   - counts are written as a leading "<n>- ", the dominant shape in live notes;
 *   - size names starting with a digit (2XL) are stripped by its SIZE_TOKEN rule;
 *   - ⚠️ a color containing a bare number would be summed as a count, so colors
 *     are emitted on their own line exactly as today. Digits in a color name are a
 *     pre-existing hazard in that parser, NOT introduced here -- and for structured
 *     submissions the sum is taken from the rows, never from re-parsing this string.
 */
export function formatSizeRows(rows) {
  const out = [];
  let group = null;
  let color = null;

  (rows || []).forEach((r) => {
    if (!r || !r.size) return;
    const g = r.group || "";
    const c = r.color || "";
    if (g !== group) {
      if (out.length) out.push("");
      if (g) out.push(g + ":");
      group = g;
      color = null;
    }
    if (c !== color) {
      if (c) out.push(c);
      color = c;
    }
    out.push(`${Number(r.count) || 0}- ${r.size}`);
  });

  return out.join("\n").trim();
}

/* The true total, straight from the rows -- no parsing, so no parse bugs. */
export function sumRows(rows) {
  return (rows || []).reduce((n, r) => n + (r && r.size ? Number(r.count) || 0 : 0), 0);
}

/*
 * E-36 -- "How many colors?" first, then that many lines.
 *
 * A "color block" is what the rep thinks of as one color: a run of consecutive rows
 * sharing a style + color. An untouched blank line is its own block (it is a color
 * waiting to be typed).
 *
 * ⚠️ Blank lines never reach the saved string -- formatSizeRows() skips any row with
 * no size -- so laying lines out ahead of time cannot change `countColorSize`.
 */
const hasCount = (r) => r.count === 0 || (r.count !== "" && r.count != null);
export const isBlankRow = (r) => !r || (!r.color && !r.size && !hasCount(r));

export function countColorBlocks(rows) {
  let blocks = 0;
  let prev = null; // key of the previous non-blank row; null after a blank line
  (rows || []).forEach((r) => {
    if (isBlankRow(r)) {
      blocks += 1;
      prev = null;
      return;
    }
    const key = (r.group || "") + "\u0000" + (r.color || "");
    if (key !== prev) blocks += 1;
    prev = key;
  });
  return blocks;
}

export const MAX_COLOR_LINES = 50;

/*
 * Grow or shrink to `n` color blocks. Growing appends blank lines (inheriting the
 * last row's style heading). Shrinking removes ONLY untouched blank lines from the
 * end -- a line with anything typed in it is never dropped; the caller is told via
 * `blocks > n` so it can say so.
 */
export function setColorCount(rows, n) {
  const want = Math.max(0, Math.min(MAX_COLOR_LINES, parseInt(n, 10) || 0));
  const next = (rows || []).slice();
  let blocks = countColorBlocks(next);
  while (blocks < want) {
    const last = next[next.length - 1];
    next.push({ group: (last && last.group) || "", color: "", size: "", count: "" });
    blocks += 1;
  }
  while (blocks > want && next.length && isBlankRow(next[next.length - 1])) {
    next.pop();
    blocks -= 1;
  }
  return { rows: next, blocks };
}

/* A new size line directly under row `i`, for the same style + color. */
export function insertSizeBelow(rows, i) {
  const src = (rows || [])[i] || {};
  const next = (rows || []).slice();
  next.splice(i + 1, 0, { group: src.group || "", color: src.color || "", size: "", count: "" });
  return next;
}
