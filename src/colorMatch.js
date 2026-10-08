/*
 * colorMatch.js -- E-48. The best match for every color on an order, in the OTHER departments.
 *
 * David, 2026-10-07: "Across departments. Best colors matched." and, rather than more controls in
 * the form, "output a specific category on the json package that lets them look at a color matching
 * card in the Production Card windows."
 *
 * So: nothing new for the rep to do. For each color recognized in a "Colors Used" answer --
 * screen-print ink (house / Pantone / HEX), embroidery thread, cut vinyl -- this works out its
 * closest counterparts elsewhere:
 *     ink      -> thread, vinyl   (+ the house ink for a Pantone, the Pantone for a house ink)
 *     thread   -> Pantone, house ink, vinyl
 *     vinyl    -> Pantone, house ink, thread
 * buildColorMatches(data) is saved in the JSON as `_colorMatches` and printed as its own
 * production card ("Color Matching").
 *
 * Two kinds of match, always labeled:
 *   official  -- Madeira's own Pantone <-> thread pairs (published under Pantone license, 2014; 705
 *                pairs, judged on real thread). Outranks anything computed.
 *   computed  -- the closest swatch by Lab distance. Swatches are screen approximations, so this
 *                is a place to START, never a guarantee. Metallics are not matched at all.
 *
 * Pure: no React, no ZOHO.
 */
import PAIRS from "./colorData/threadPantone.json";
import { VINYL_COLORS, catalogFor, readColors } from "./colorCatalogs";
import {
  PANTONES, THREADS, THREAD_CATALOGS, colorDifference, colorModeFor, describeDifference, findThread, nearestHouseInk,
  nearestPantones, pantoneLabel, readInkText, readThreadText, threadLabel,
} from "./colorLibrary";

const PANTONE_BY_CODE = {};
PANTONES.forEach((p) => (PANTONE_BY_CODE[p.code] = p));
const THREADS_FOR_PANTONE = {}; // "186 C" -> [thread...]
const PANTONE_FOR_THREAD = {}; // "P:1821" -> pantone
PAIRS.forEach(([key, code, pantone]) => {
  const t = findThread(code).filter((x) => x.catalog === key)[0];
  const p = PANTONE_BY_CODE[pantone];
  if (!t || !p) return;
  (THREADS_FOR_PANTONE[pantone] = THREADS_FOR_PANTONE[pantone] || []).push(t);
  PANTONE_FOR_THREAD[key + ":" + code] = p;
});
export const officialThreadsForPantone = (code) => THREADS_FOR_PANTONE[code] || [];
export const officialPantoneForThread = (t) => (t ? PANTONE_FOR_THREAD[t.catalog + ":" + t.code] || null : null);

const nearest = (hex, list) => {
  let best = null;
  list.forEach((item) => {
    if (!item.hex) return;
    const difference = colorDifference(hex, item.hex);
    if (!best || difference < best.difference) best = { item, difference };
  });
  return best;
};
const SOLID_THREADS = THREADS.filter((t) => t.hex);
/* The closest thread in each catalogue (Polyneon, Classic Rayon, Marathon polyester). */
export function nearestThreads(hex) {
  return THREAD_CATALOGS.map((c) => nearest(hex, SOLID_THREADS.filter((t) => t.catalog === c.key))).filter(Boolean);
}
/* The closest stocked vinyl; and an order-in one too when it is clearly closer. */
export function nearestVinyls(hex) {
  const flat = VINYL_COLORS.filter((v) => !v.metallic);
  const stocked = nearest(hex, flat.filter((v) => v.stocked));
  const any = nearest(hex, flat);
  const out = [];
  if (stocked) out.push(stocked);
  if (any && stocked && any.item !== stocked.item && stocked.difference - any.difference >= 3) out.push(any);
  return out;
}

const m = (dept, label, hex, difference, basis, note) => ({
  dept,
  label,
  hex,
  basis, // "official" | "computed"
  quality: basis === "official" ? "official match" : describeDifference(difference),
  difference: basis === "official" ? null : Math.round(difference * 10) / 10,
  ...(note ? { note } : {}),
});
const threadMatches = (hex, officialThreads) => {
  const out = (officialThreads || []).map((t) => m("Embroidery", threadLabel(t), t.hex, 0, "official"));
  const have = (officialThreads || []).map((t) => t.catalog);
  nearestThreads(hex).forEach((n) => {
    if (have.indexOf(n.item.catalog) >= 0) return; // an official pair in that catalogue outranks it
    out.push(m("Embroidery", threadLabel(n.item), n.item.hex, n.difference, "computed"));
  });
  return out;
};
const vinylMatches = (hex) =>
  nearestVinyls(hex).map((n) =>
    m("Vinyl", `${n.item.name} (ORACAL 651-${n.item.code})`, n.item.hex, n.difference, "computed", n.item.stocked ? "in stock" : "order-in")
  );
// A house ink is only worth naming when it is at least in the neighborhood: "House Ruby Red - not
// close" beside a brown is noise. No entry means "this is a custom mix".
const houseMatch = (hex) => {
  const h = nearestHouseInk(hex);
  return h && h.difference < 12 ? [m("Screen Print", "House " + h.ink.name, h.ink.hex, h.difference, "computed", "in stock, no mixing")] : [];
};
const pantoneMatch = (hex, official) => {
  if (official) return [m("Screen Print", pantoneLabel(official), official.hex, 0, "official")];
  const p = nearestPantones(hex, 1)[0];
  return p ? [m("Screen Print", pantoneLabel(p.color), p.color.hex, p.difference, "computed")] : [];
};

/* Every recognized color in one "Colors Used" answer, as a source: { label, hex, metallic, ... }. */
function sourcesIn(productName, text) {
  const mode = colorModeFor(productName);
  const out = [];
  if (mode === "ink") {
    readInkText(text).forEach((it) => {
      if (it.type === "house") out.push({ dept: "Screen Print", label: "House " + it.ink.name, hex: it.ink.hex, metallic: it.ink.metallic, kind: "house" });
      else if (it.type === "pantone") out.push({ dept: "Screen Print", label: pantoneLabel(it.color), hex: it.color.hex, metallic: it.color.metallic, kind: "pantone", pantone: it.color });
      else if (it.type === "hex") out.push({ dept: "Screen Print", label: it.hex, hex: it.hex, metallic: false, kind: "hex" });
    });
  } else if (mode === "thread") {
    readThreadText(text).matched.forEach(({ options }) => {
      if (options.length !== 1) return; // the catalogue is not settled -- nothing honest to match
      const t = options[0];
      if (t.hex) out.push({ dept: "Embroidery", label: threadLabel(t), hex: t.hex, metallic: false, kind: "thread", thread: t });
    });
  } else if (mode === "vinyl") {
    readColors(text, catalogFor(productName)).matched.forEach((c) => {
      if (c.hex) out.push({ dept: "Vinyl", label: `${c.name}${c.code ? ` (ORACAL 651-${c.code})` : ""}`, hex: c.hex, metallic: c.metallic, kind: "vinyl" });
    });
  }
  return out;
}

/* The counterparts of one source color in the other departments. */
export function matchesFor(src) {
  if (!src || !src.hex || src.metallic) return [];
  if (src.kind === "pantone") {
    return [...houseMatch(src.hex), ...threadMatches(src.hex, officialThreadsForPantone(src.pantone.code)), ...vinylMatches(src.hex)];
  }
  if (src.kind === "house") return [...pantoneMatch(src.hex), ...threadMatches(src.hex), ...vinylMatches(src.hex)];
  if (src.kind === "hex") return [...houseMatch(src.hex), ...pantoneMatch(src.hex), ...threadMatches(src.hex), ...vinylMatches(src.hex)];
  if (src.kind === "thread") {
    return [...pantoneMatch(src.hex, officialPantoneForThread(src.thread)), ...houseMatch(src.hex), ...vinylMatches(src.hex)];
  }
  if (src.kind === "vinyl") return [...pantoneMatch(src.hex), ...houseMatch(src.hex), ...threadMatches(src.hex)];
  return [];
}

/*
 * The whole order: one entry per distinct color per department.
 * [{ dept, color: { label, hex, metallic }, where: ["Screen Printing - Garment 1 - Graphic 2", ...], matches: [...] }]
 * Returns [] when no color on the order is recognized -- then no card is made and nothing is saved.
 */
export function buildColorMatches(data) {
  const byKey = {};
  const order = [];
  const add = (productName, where, text) => {
    sourcesIn(productName, text).forEach((src) => {
      const key = src.dept + "|" + src.label;
      if (!byKey[key]) {
        byKey[key] = {
          dept: src.dept,
          color: { label: src.label, hex: src.hex, metallic: !!src.metallic },
          where: [],
          matches: matchesFor(src),
        };
        order.push(key);
      }
      if (byKey[key].where.indexOf(where) < 0) byKey[key].where.push(where);
    });
  };
  ((data && data.products) || []).forEach((p) => {
    if (!p) return;
    if (p.productType === "garment") {
      (p.primaryBranches || []).forEach((g, gi) =>
        ((g && g.secondaryBranches) || []).forEach((gr, si) => add(p.productName, `${p.productName} - Garment ${gi + 1} - Graphic ${si + 1}`, gr && gr.colorsUsed))
      );
    } else if (p.productType === "nongarment") {
      (p.branches || []).forEach((gr, si) => add(p.productName, `${p.productName} - Graphic ${si + 1}`, gr && gr.colorsUsed));
    }
  });
  return order.map((k) => byKey[k]);
}

export const COLOR_MATCH_CAVEAT =
  "Matches are a place to start, not a guarantee. \"Official match\" is Madeira's own published Pantone-to-thread pair. Everything else is computed from on-screen swatches, which are approximations of the maker's charts - check the physical book, cone or roll before production. Pantone values come from an unofficial reference copy of the Coated book. Metallic colors are not matched.";
