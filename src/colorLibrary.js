/*
 * colorLibrary.js -- E-41 phase 2. Thread by number, house inks, Pantone <-> HEX.
 *
 * Data: src/colorData/*.json, generated from ~/Projects/color-library/catalogs by
 * tools/color-data/build_color_data.py (in the knowledge-base folder). Never edit the JSON by hand.
 *
 * ⚠️ `colorsUsed` STAYS A STRING. Everything here either helps type into that box or reads it back.
 *
 * What a reader of this file must not forget (David, 2026-10-07 -- "flag anything like color
 * approximation, bridging limitation, color representation in the form"):
 *   - every swatch is an on-screen approximation;
 *   - the Pantone data is an UNOFFICIAL copy of ~2021 color books -- newer codes are missing;
 *   - HEX -> Pantone is "closest", almost never "equal";
 *   - the form offers the COATED book only (plastisol is matched to coated); an uncoated code a rep
 *     types is still recognized, and labeled;
 *   - metallics and neons cannot be shown faithfully.
 *
 * Pure: no React, no ZOHO.
 */
import THREAD_ROWS from "./colorData/thread.json";
import HOUSE_ROWS from "./colorData/houseInk.json";
import PANTONE_ROWS from "./colorData/pantone.json";
import { catalogFor, readColors, splitColorText, swatchBackground } from "./colorCatalogs";

// ---- which chart a product uses -----------------------------------------------------------------
export function colorModeFor(productName) {
  const p = String(productName || "");
  if (catalogFor(p)) return "vinyl";
  if (p === "Embroidery") return "thread";
  if (p === "Screen Printing") return "ink";
  return null;
}

// ---- thread ---------------------------------------------------------------------------------------
/*
 * Thread is organized the way the shop buys it: MAKER -> LINE (David, 2026-10-07: "a Madeira section
 * with sub catalogs, and the same for Marathon. That will help our staff orient around which is
 * which"). Each line is its own catalogue with its own numbering -- the same number can be a
 * different color in another line -- so a picked thread is written WITH its maker and line.
 */
export const THREAD_CATALOGS = [
  { key: "P", maker: "Madeira", line: "Polyneon" },
  { key: "R", maker: "Madeira", line: "Classic Rayon" },
  { key: "M", maker: "Marathon", line: "Polyester" },
];
// Known lines that are NOT in the library yet -- shown greyed out so staff know it is a gap in
// the library, not a thread that does not exist. Logged in ~/Projects/color-library/MISSING-CATALOGS.md.
export const THREAD_CATALOGS_MISSING = [
  { maker: "Madeira", line: "Frosted Matt" },
  { maker: "Madeira", line: "Metallics" },
  { maker: "Marathon", line: "Rayon" },
];
const CATALOG_BY_KEY = {};
THREAD_CATALOGS.forEach((c) => (CATALOG_BY_KEY[c.key] = c));
export const THREADS = THREAD_ROWS.map(([code, name, hex, key]) => {
  const c = CATALOG_BY_KEY[key] || { key, maker: key, line: "" };
  return { code, name, hex: hex || null, catalog: c.key, maker: c.maker, line: c.line, brand: `${c.maker} ${c.line}`.trim() };
});
const THREAD_BY_CODE = {};
THREADS.forEach((t) => (THREAD_BY_CODE[t.code] = THREAD_BY_CODE[t.code] || []).push(t));

export const findThread = (code) => THREAD_BY_CODE[String(code == null ? "" : code).trim()] || [];
/* What is written into the box for a picked thread: number, official name, and which catalogue. */
export const threadLabel = (t) => `${t.code}${t.name ? " " + t.name : ""} (${t.brand})`;

// Maker / line words a rep may write next to a number; used to tell two catalogues apart.
function narrowByWords(options, piece) {
  if (options.length < 2) return options;
  const p = String(piece || "").toLowerCase();
  let out = options;
  const keep = (fn) => {
    const f = out.filter(fn);
    if (f.length) out = f;
  };
  if (/\bmarathon\b/.test(p)) keep((t) => t.maker === "Marathon");
  if (/\bmadeira\b/.test(p)) keep((t) => t.maker === "Madeira");
  if (/\bpolyneon\b/.test(p)) keep((t) => t.line === "Polyneon");
  if (/\brayon\b/.test(p)) keep((t) => /rayon/i.test(t.line));
  if (/\bpolyester\b/.test(p)) keep((t) => t.line === "Polyester");
  return out;
}

/*
 * Thread numbers written in the box. A thread number is four digits standing alone -- not part of a
 * longer number, a decimal, a "#60" weight or a Pantone code ("3955C").
 *   matched -- one entry per number: { code, options: [thread...] }. Two options = two catalogues
 *              use that number and the line does not say which (a maker / line word beside the
 *              number settles it: "2001 Marathon", "1159 (Madeira Classic Rayon)").
 *   unknown -- four-digit numbers that are in no thread catalogue
 */
export function readThreadText(text) {
  const matched = [];
  const unknown = [];
  const seen = {};
  // One written entry at a time (a line, or a comma / semicolon separated part), so the maker or
  // line named beside a number applies to that number only.
  String(text == null ? "" : text)
    .split(/\r?\n|,|;/)
    .forEach((s) => {
      const re = /\d+(?:\.\d+)?/g;
      let m;
      while ((m = re.exec(s))) {
        const tok = m[0];
        if (!/^\d{4}$/.test(tok)) continue;
        const before = s.charAt(m.index - 1);
        const after = s.slice(m.index + 4, m.index + 6);
        if (before === "#" || before === ".") continue;
        if (/^\s?[cu]\b/i.test(after)) continue; // "3955C" is a Pantone, not a thread
        if (seen[tok]) continue;
        seen[tok] = true;
        const options = narrowByWords(findThread(tok), s);
        if (options.length) matched.push({ code: tok, options });
        else unknown.push(tok);
      }
    });
  return { matched, unknown };
}

/*
 * Finding a thread (E-41 fix, 2026-10-07 -- David: "it looks like we're missing a ton of embroidery
 * color options"). The first version listed only the first 40 threads until the rep typed, and
 * searched official NAMES only -- but the names are "Terra Cotta", "Whipped Butterscotch",
 * "Sangria", and Marathon has no names at all, so typing "red" or "gold" found almost nothing.
 * Now: every thread is listed, and a plain color word finds threads by what they LOOK like.
 */
function hexToHsl(hex) {
  const r = parseInt(hex.substr(1, 2), 16) / 255;
  const g = parseInt(hex.substr(3, 2), 16) / 255;
  const b = parseInt(hex.substr(5, 2), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}
/* The everyday color words a swatch answers to: "#9b3320" -> ["red", "brown", ...]. Generous on purpose. */
export function colorFamilies(hex) {
  if (!hex) return ["multicolor"];
  const [h, s, l] = hexToHsl(hex);
  const out = [];
  const add = (w) => out.indexOf(w) < 0 && out.push(w);
  if (l < 0.13) add("black");
  if (l > 0.9 && s < 0.35) add("white");
  if (s < 0.14) {
    if (l >= 0.13 && l <= 0.9) add("gray");
    if (l > 0.6) add("silver");
    if (l < 0.3) add("charcoal");
    if (out.length) return out;
  }
  const inH = (a, b) => (a <= b ? h >= a && h < b : h >= a || h < b);
  if (inH(345, 18)) add(l > 0.72 ? "pink" : "red");
  if (inH(10, 42)) add(l < 0.42 || s < 0.45 ? "brown" : "orange");
  if (inH(36, 68)) add("yellow");
  if (inH(68, 165)) add("green");
  if (inH(160, 200)) { add("teal"); add("turquoise"); }
  if (inH(190, 258)) add("blue");
  if (inH(255, 295)) { add("purple"); add("violet"); }
  if (inH(290, 348)) { add("pink"); if (l < 0.45) add("purple"); if (s > 0.5) add("magenta"); }
  if (inH(340, 20) && l < 0.33) { add("maroon"); add("burgundy"); }
  if (inH(200, 258) && l < 0.27) add("navy");
  if (inH(190, 258) && l > 0.42 && s > 0.45) add("royal");
  if (inH(28, 58) && s > 0.4 && l > 0.3 && l < 0.62) add("gold");
  if (inH(18, 58) && s < 0.55 && l > 0.5 && l < 0.86) { add("tan"); add("beige"); add("khaki"); }
  if (inH(20, 70) && l >= 0.82) { add("cream"); add("ivory"); }
  if (inH(55, 110) && s < 0.6 && l < 0.42) add("olive");
  if (inH(68, 165) && l > 0.6) add("mint");
  if (!out.length) add("gray");
  return out;
}
const FAMILY_ALIASES = { grey: "gray", burgandy: "burgundy", turqoise: "turquoise", aqua: "teal", lavender: "purple", lilac: "purple", fuchsia: "magenta", crimson: "red", scarlet: "red", lime: "green", forest: "green", kelly: "green", sky: "blue", copper: "brown", bronze: "brown", rust: "brown", peach: "orange", coral: "orange", mustard: "gold", sand: "tan", offwhite: "cream" };
const THREAD_SEARCH = THREADS.map((t) => ({
  t,
  name: t.name.toLowerCase(),
  brand: t.brand.toLowerCase(),
  fam: colorFamilies(t.hex),
}));
/*
 * Threads matching what the rep typed. Every word must match one of: the number (from its start),
 * the official name, the brand, or a color word the swatch answers to. An empty search is ALL of them.
 * A color-word search is sorted so the purest matches come first.
 * `scope` limits it: a catalogue key ("P", "R", "M") or a maker ("Madeira", "Marathon").
 */
export function searchThreads(query, scope) {
  const inScope = (t) => !scope || t.catalog === scope || t.maker === scope;
  const words = String(query == null ? "" : query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => FAMILY_ALIASES[w] || w);
  if (!words.length) return scope ? THREADS.filter(inScope) : THREADS;
  const hits = THREAD_SEARCH.filter((e) =>
    inScope(e.t) &&
    words.every(
      (w) => e.t.code.indexOf(w) === 0 || e.name.indexOf(w) >= 0 || e.brand.indexOf(w) >= 0 || e.fam.indexOf(w) >= 0
    )
  );
  const rank = (e) => {
    let r = 3;
    words.forEach((w) => {
      if (e.t.code === w) r = Math.min(r, 0);
      else if (e.t.code.indexOf(w) === 0 || e.name.indexOf(w) >= 0) r = Math.min(r, 1);
      else if (e.fam[0] === w) r = Math.min(r, 2);
    });
    return r;
  };
  // Brand first (the list is shown grouped by brand, and a group must stay in one piece), then the
  // best matches within each brand.
  const brandOrder = Object.keys(THREAD_BRAND_COUNTS);
  return hits
    .map((e, i) => ({ e, i, r: rank(e), b: brandOrder.indexOf(e.t.brand) }))
    .sort((x, y) => x.b - y.b || x.r - y.r || x.i - y.i)
    .map((x) => x.e.t);
}
export const THREAD_BRAND_COUNTS = THREADS.reduce((m, t) => ((m[t.brand] = (m[t.brand] || 0) + 1), m), {});

// ---- house inks -----------------------------------------------------------------------------------
export const HOUSE_INKS = HOUSE_ROWS.map(([name, hex, metallic]) => ({ name, hex, metallic: !!metallic }));
const norm = (s) =>
  String(s == null ? "" : s)
    .toLowerCase()
    .replace(/grey/g, "gray")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const HOUSE_BY_NORM = {};
HOUSE_INKS.forEach((h) => (HOUSE_BY_NORM[norm(h.name)] = h));
export function findHouseInk(piece) {
  const n = norm(piece).replace(/\b(ink|plastisol)\b/g, " ").replace(/\s+/g, " ").trim();
  return HOUSE_BY_NORM[n] || null;
}

// ---- Pantone --------------------------------------------------------------------------------------
export const PANTONES = PANTONE_ROWS.map(([code, hex, kind]) => ({
  code,
  hex,
  metallic: kind === "m",
  neon: kind === "n",
  coated: / C$/.test(code),
}));
const pkey = (s) => norm(s).replace(/\s+/g, "");
const PANTONE_BY_KEY = {};
PANTONES.forEach((p) => (PANTONE_BY_KEY[pkey(p.code)] = p));
export const pantoneLabel = (p) => "Pantone " + p.code;

/*
 * Find a Pantone code in something a rep typed: "187C", "PMS 187", "Pantone 187 C", "Cool Grey 4 C",
 * "Red Pantone 187C", "2378C Navy Pantone".
 *   - a C or U suffix makes it a Pantone on its own ("172 C");
 *   - with the word Pantone / PMS and NO suffix, coated is assumed (`assumed: true`);
 *   - a bare number with neither is NOT a Pantone -- it could be anything.
 * Returns { color, assumed } | { unknown: true } (looks like a Pantone, not in the library) | null.
 */
export function findPantone(raw) {
  const lower = String(raw == null ? "" : raw).toLowerCase();
  const hasWord = /\b(pantone|pms)\b/.test(lower);
  const words = lower
    .replace(/\b(pantone|pms)\b/g, " ")
    .replace(/grey/g, "gray")
    .replace(/(\d)([cu])\b/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let assumedHit = null;
  for (let len = Math.min(4, words.length); len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const cand = words.slice(i, i + len);
      const last = cand[cand.length - 1];
      const key = cand.join("");
      if ((last === "c" || last === "u") && len >= 2 && PANTONE_BY_KEY[key]) {
        return { color: PANTONE_BY_KEY[key], assumed: false };
      }
      if (hasWord && !assumedHit && last !== "c" && last !== "u" && PANTONE_BY_KEY[key + "c"]) {
        assumedHit = { color: PANTONE_BY_KEY[key + "c"], assumed: true };
      }
    }
  }
  if (assumedHit) return assumedHit;
  if ((hasWord && /\d{3,5}/.test(lower)) || /\b\d{3,5}\s*[cu]\b/.test(lower)) return { unknown: true };
  return null;
}

// ---- HEX ------------------------------------------------------------------------------------------
/* "#AA1C2E", "aa1c2e", "Hex Code 9A5F3A" -> "#aa1c2e"; anything else -> null. */
export function normalizeHex(raw) {
  const m = /^\s*#?([0-9a-f]{6})\s*$/i.exec(String(raw == null ? "" : raw));
  return m ? "#" + m[1].toLowerCase() : null;
}
/* A HEX written inside a longer line needs a "#" or the word "hex" beside it -- "140000 shirts" is not a color. */
export function findHexInText(raw) {
  const m = /(?:#|\bhex(?:\s*code)?\s*:?\s*#?)\s*([0-9a-f]{6})\b/i.exec(String(raw == null ? "" : raw));
  return m ? "#" + m[1].toLowerCase() : null;
}

// ---- color distance -------------------------------------------------------------------------------
export function hexToLab(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  const lin = [1, 3, 5].map((i) => {
    const v = parseInt(h.substr(i, 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const x = (lin[0] * 0.4124564 + lin[1] * 0.3575761 + lin[2] * 0.1804375) / 0.95047;
  const y = lin[0] * 0.2126729 + lin[1] * 0.7151522 + lin[2] * 0.072175;
  const z = (lin[0] * 0.0193339 + lin[1] * 0.119192 + lin[2] * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
export function colorDifference(hexA, hexB) {
  const a = hexToLab(hexA);
  const b = hexToLab(hexB);
  if (!a || !b) return Infinity;
  return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2));
}
/* Plain words for a difference (CIE76 Lab distance: under ~3 is hard to see, over ~10 is obvious). */
export function describeDifference(d) {
  if (d < 1) return "same on screen";
  if (d < 3) return "near-identical";
  if (d < 6) return "close";
  if (d < 12) return "visibly different";
  return "not close";
}

let coatedLab = null; // coated, non-metallic Pantones with their Lab, built on first use
const coatedPool = () => {
  if (!coatedLab) {
    coatedLab = PANTONES.filter((p) => p.coated && !p.metallic).map((p) => ({ p, lab: hexToLab(p.hex) }));
  }
  return coatedLab;
};
/* The `count` closest COATED, non-metallic Pantones to a HEX. [{ color, difference, quality }] */
export function nearestPantones(hex, count) {
  const t = hexToLab(hex);
  if (!t) return [];
  return coatedPool()
    .map(({ p, lab }) => ({
      color: p,
      difference: Math.sqrt(Math.pow(t[0] - lab[0], 2) + Math.pow(t[1] - lab[1], 2) + Math.pow(t[2] - lab[2], 2)),
    }))
    .sort((a, b) => a.difference - b.difference)
    .slice(0, count || 5)
    .map((r) => ({ ...r, quality: describeDifference(r.difference) }));
}
/* The closest non-metallic house ink to a HEX. { ink, difference, quality } */
export function nearestHouseInk(hex) {
  let best = null;
  HOUSE_INKS.filter((h) => !h.metallic).forEach((ink) => {
    const difference = colorDifference(hex, ink.hex);
    if (!best || difference < best.difference) best = { ink, difference };
  });
  return best ? { ...best, quality: describeDifference(best.difference) } : null;
}
/* For a Pantone the rep chose: is a house ink close enough to print without mixing? (text, or "") */
export function houseInkHint(pantone) {
  if (!pantone || pantone.metallic || pantone.neon) return "";
  const n = nearestHouseInk(pantone.hex);
  if (!n) return "";
  if (n.difference < 3) return `House ${n.ink.name} is a near-identical match on screen - likely no mixing needed.`;
  if (n.difference < 6) return `House ${n.ink.name} is close - check the book before mixing.`;
  return "";
}

// ---- reading the screen-print box -----------------------------------------------------------------
/*
 * One item per thing written: { type, text, ... }
 *   house    { ink }                     a stocked FN-INK color, by its exact name
 *   pantone  { color, assumed }          assumed = no C/U was written, coated taken
 *   unknown-pantone                      looks like a Pantone, not in the library
 *   hex      { hex }
 *   other                                anything else -- a note, "TBD", a color word
 */
export function readInkText(text) {
  return splitColorText(text).map((piece) => {
    const p = findPantone(piece);
    if (p && p.color) return { type: "pantone", text: piece, color: p.color, assumed: p.assumed };
    const hex = findHexInText(piece) || normalizeHex(piece);
    if (hex) return { type: "hex", text: piece, hex };
    if (p && p.unknown) return { type: "unknown-pantone", text: piece };
    const ink = findHouseInk(piece);
    if (ink) return { type: "house", text: piece, ink };
    return { type: "other", text: piece };
  });
}

/* Add a line to the box unless that exact entry is already written. */
export function addLine(text, line) {
  const cur = String(text == null ? "" : text);
  const want = norm(line);
  if (!want) return cur;
  if (cur.split(/\r?\n|,|;/).some((p) => norm(p) === want)) return cur;
  const base = cur.replace(/\s+$/, "");
  return base ? base + "\n" + line : line;
}

// ---- one reader for the production cards ----------------------------------------------------------
/* Every recognized color in a Colors Used answer, as { label, background } -- whatever the product. */
export function readColorSwatches(productName, text) {
  const mode = colorModeFor(productName);
  if (mode === "vinyl") {
    return readColors(text, catalogFor(productName)).matched.map((c) => ({ label: c.name, background: swatchBackground(c) }));
  }
  if (mode === "thread") {
    const out = [];
    readThreadText(text).matched.forEach(({ options }) =>
      options.forEach((t) => {
        if (t.hex) out.push({ label: threadLabel(t), background: t.hex });
      })
    );
    return out;
  }
  if (mode === "ink") {
    const out = [];
    readInkText(text).forEach((it) => {
      if (it.type === "house") out.push({ label: "House " + it.ink.name, background: it.ink.hex });
      else if (it.type === "pantone") out.push({ label: `${pantoneLabel(it.color)} (${it.color.hex})`, background: it.color.hex });
      else if (it.type === "hex") out.push({ label: it.hex, background: it.hex });
    });
    return out;
  }
  return [];
}

/* The caveats the form prints wherever these swatches appear. */
export const COLOR_CAVEATS = {
  thread:
    "Thread swatches are approximations of the maker's color chart - a check against the wrong number, not a color match. Each maker and line has its own numbering, so the same number can be a different color in another line. Marathon numbers have no official names.",
  ink:
    "Screen colors are approximations: a monitor cannot show ink exactly. Pantone swatches come from an unofficial reference copy of the Coated book that may not include the newest colors. A HEX or picked color is matched to the CLOSEST Pantone, which is rarely an exact equal - the match quality is shown. Metallic and neon inks cannot be shown faithfully. Always confirm against the physical Pantone book.",
};
