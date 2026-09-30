/*
 * sizeRows.js -- structured size entry for "Total Count, Colors & Sizes".
 *
 * That field is ONE free-text box carrying FOUR dimensions -- style, colour, size
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
  "XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "OSFA",
];
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
     * "Deadwood Tree Camo:" -- a colour. Agents punctuate inconsistently, which is
     * precisely why this field needs structuring.
     *
     * The rule that separates them: a heading introduces a COLOUR, a colour
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
 *   - ⚠️ a colour containing a bare number would be summed as a count, so colours
 *     are emitted on their own line exactly as today. Digits in a colour name are a
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
