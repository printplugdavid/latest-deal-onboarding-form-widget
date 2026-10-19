/*
 * imageColors.js -- E-87. Upload a logo / art file -> its main colors -> the closest Pantone (Coated),
 * house ink, thread and ORACAL vinyl for each.
 *
 * David, 2026-10-19: "Would it be possible to ... upload an image and automatically detect pantones and
 * colors from the image?"
 *
 * Everything happens in the rep's browser: the picture is drawn on a canvas and read back as pixels.
 * Nothing is uploaded, saved or attached -- the picture is gone when the panel closes. Like every other
 * color helper, the only thing this can change is the text in the "Colors Used" box (the rep clicks Add).
 *
 * How the main colors are found (findImageColors, pure, tested):
 *   1. Pixels that are mostly transparent are skipped (the empty part of a PNG logo).
 *   2. Blended edge pixels are skipped: anti-aliasing makes in-between colors where two colors meet ("a
 *      little pink between the red and the white"). A pixel is skipped when it lies BETWEEN the colors on
 *      its two sides (left / right, or above / below). A thin line is darker or lighter than both its
 *      sides, not between them, so thin lettering still counts.
 *   3. Similar pixels are grouped (5 bits per channel), then clustered (k-means in Lab, the same color
 *      space the matching uses, started from the most common color so the result is the same every time).
 *   4. Colors closer than MERGE_BELOW are merged, a small cluster close to a much bigger one joins it; colors covering under MIN_SHARE of the art are dropped
 *      (0.5% for clean art, so a thin tagline still counts; 2% for a photo -- thousands of shades -- whose
 *      small clusters are noise), and so is a speck under ABS_MIN of the whole picture.
 *   5. The color that fills most of the picture's border is flagged as "probably the background", and shares
 *      are measured against the art without it.
 *
 * Limits, said in the panel too: photos and gradients give many colors (only the main ones are kept);
 * vector files (.ai, .eps, .pdf) must be exported to PNG / JPG / SVG first; every match is "closest on
 * screen", never a guarantee.
 *
 * findImageColors and imageColorMatches are pure (no React, no DOM). readImageFile is the one browser part.
 */
import { colorDifference, describeDifference, hexToLab, nearestHouseInk, nearestPantones, pantoneLabel, threadLabel } from "./colorLibrary";
import { nearestThreads, nearestVinyls } from "./colorMatch";

export const MAX_COLORS = 8;
export const MIN_SHARE = 0.005; // clean art: a color must cover 0.5% of it to be listed
export const MIN_SHARE_PHOTO = 0.02; // a photo: 2%
const ABS_MIN = 0.002; // and 0.2% of the whole picture, whatever the background
export const MERGE_BELOW = 10; // Lab distance: closer than this is "the same color" for a logo
const ABSORB_BELOW = 18; // ... and a cluster a third the size of a neighbor this close is its shading
const BLEND_MIN = 40; // two sides this far apart (RGB distance) can make a blend between them
const PHOTO_SHADES = 1500; // more distinct shades than this (5 bits per channel): a photo, not logo art
const ALPHA_MIN = 128;

const hex2 = (v) => ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
export const rgbToHex = (r, g, b) => "#" + hex2(r) + hex2(g) + hex2(b);
const dist2 = (a, b) => (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2]);

/* One k-means step: every point joins its nearest center; the totals of each group come back. */
function assignToCenters(points, centers) {
  const groups = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0, edge: 0, L: 0, A: 0, B: 0 }));
  points.forEach((p) => {
    let bi = 0;
    let bd = Infinity;
    centers.forEach((c, ci) => {
      const d = dist2(p.lab, c);
      if (d < bd) {
        bd = d;
        bi = ci;
      }
    });
    const g = groups[bi];
    g.r += p.r;
    g.g += p.g;
    g.b += p.b;
    g.n += p.n;
    g.edge += p.edge;
    g.L += p.lab[0] * p.n;
    g.A += p.lab[1] * p.n;
    g.B += p.lab[2] * p.n;
  });
  return groups;
}

/*
 * The main colors of an image.
 *   image -- { data, width, height }: RGBA bytes, as a canvas's getImageData returns them
 * Returns [{ hex, share, background }]: the background (if any) first, then the art's colors most-used first.
 * share is 0..1 -- of the ART (background left out) for an art color, of the whole picture for the background.
 */
export function findImageColors(image, opts) {
  const o = opts || {};
  const maxColors = o.maxColors || MAX_COLORS;
  const { data, width, height } = image || {};
  if (!data || !width || !height) return [];

  const opaque = (i) => data[i + 3] >= ALPHA_MIN;
  const dist = (i, j) => Math.sqrt((data[i] - data[j]) ** 2 + (data[i + 1] - data[j + 1]) ** 2 + (data[i + 2] - data[j + 2]) ** 2);
  // Is pixel i a blend of a and b, the pixels on either side of it? Clearly apart from both, and on the
  // way from one to the other.
  const between = (i, a, b) => {
    if (!opaque(a) || !opaque(b)) return false;
    const ab = dist(a, b);
    if (ab < BLEND_MIN) return false;
    const ai = dist(a, i);
    const ib = dist(i, b);
    return ai > ab * 0.15 && ib > ab * 0.15 && ai + ib <= ab * 1.2;
  };
  const isBlend = (x, y) => {
    const i = (y * width + x) * 4;
    if (x > 0 && x < width - 1 && between(i, i - 4, i + 4)) return true;
    if (y > 0 && y < height - 1 && between(i, i - width * 4, i + width * 4)) return true;
    return false;
  };

  const collect = (skipBlends) => {
    const bins = {};
    let total = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (!opaque(i)) continue;
        if (skipBlends && isBlend(x, y)) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        const bin = bins[key] || (bins[key] = { r: 0, g: 0, b: 0, n: 0, edge: 0 });
        bin.r += r;
        bin.g += g;
        bin.b += b;
        bin.n++;
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) bin.edge++;
        total++;
      }
    }
    return { bins: Object.keys(bins).map((k) => bins[k]), total };
  };

  let opaqueCount = 0;
  for (let i = 0; i < data.length; i += 4) if (opaque(i)) opaqueCount++;
  if (!opaqueCount) return [];
  let { bins, total } = collect(true);
  if (total < opaqueCount * 0.25) ({ bins, total } = collect(false)); // nearly all blends: count every pixel
  const photo = bins.length > PHOTO_SHADES;
  const minShare = o.minShare != null ? o.minShare : photo ? MIN_SHARE_PHOTO : MIN_SHARE;
  if (!total) return [];

  const points = bins.map((b) => ({ ...b, lab: hexToLab(rgbToHex(b.r / b.n, b.g / b.n, b.b / b.n)) }));

  // k-means, seeded deterministically: the most common color, then each time the point that is
  // farthest from every center so far, weighted by how much of the picture it covers.
  const k = Math.min(points.length, maxColors + 4);
  const centers = [];
  points.slice().sort((a, b) => b.n - a.n).slice(0, 1).forEach((p) => centers.push(p.lab.slice()));
  while (centers.length < k) {
    let best = null;
    let bestScore = 0;
    points.forEach((p) => {
      const d = Math.min(...centers.map((c) => dist2(p.lab, c)));
      const score = d * p.n;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    });
    if (!best) break;
    centers.push(best.lab.slice());
  }
  let groups = [];
  for (let iter = 0; iter < 12; iter++) {
    groups = assignToCenters(points, centers);
    groups.forEach((g, gi) => {
      if (g.n) centers[gi] = [g.L / g.n, g.A / g.n, g.B / g.n];
    });
  }

  // The center of a group is the average of its real pixels (in RGB), so a flat logo color comes back exact.
  let colors = groups.filter((g) => g.n).map((g) => ({ r: g.r, g: g.g, b: g.b, n: g.n, edge: g.edge, hex: rgbToHex(g.r / g.n, g.g / g.n, g.b / g.n) }));
  // Merge colors a person would call the same.
  for (;;) {
    let pair = null;
    let pd = MERGE_BELOW;
    for (let a = 0; a < colors.length; a++) {
      for (let b = a + 1; b < colors.length; b++) {
        const d = colorDifference(colors[a].hex, colors[b].hex);
        if (d < pd) {
          pd = d;
          pair = [a, b];
        }
      }
    }
    if (!pair) break;
    const [a, b] = pair;
    const m = { r: colors[a].r + colors[b].r, g: colors[a].g + colors[b].g, b: colors[a].b + colors[b].b, n: colors[a].n + colors[b].n, edge: colors[a].edge + colors[b].edge };
    m.hex = rgbToHex(m.r / m.n, m.g / m.n, m.b / m.n);
    colors = colors.filter((_, i) => i !== a && i !== b).concat([m]);
  }
  // A small cluster next to a much bigger one of nearly the same color is that color's shading (JPEG blur
  // around lettering, a soft edge) -- it joins the big one, which keeps its own color.
  colors.sort((x, y) => y.n - x.n);
  for (let s = colors.length - 1; s > 0; s--) {
    const small = colors[s];
    const big = colors.slice(0, s).filter((c) => c.n >= small.n * 3 && colorDifference(c.hex, small.hex) < ABSORB_BELOW)[0];
    if (!big) continue;
    big.n += small.n;
    big.edge += small.edge;
    colors.splice(s, 1);
  }

  // "Probably the background": the color filling most of the picture's border -- when the border is mostly
  // solid (a transparent PNG has no background to flag) and there is something else in the picture.
  const border = 2 * (width + height) - 4;
  const edgeTotal = colors.reduce((s, c) => s + c.edge, 0);
  const bg = colors.length > 1 && edgeTotal >= border * 0.25 ? colors.filter((c) => c.edge > edgeTotal * 0.6)[0] || null : null;
  // Shares are of the ART, the background not counted: a small tagline on a big white sheet still counts.
  // A speck is still a speck (ABS_MIN of the whole picture).
  const art = total - (bg ? bg.n : 0);
  const kept = colors
    .filter((c) => c !== bg && c.n / total >= ABS_MIN)
    .map((c) => ({ hex: c.hex, share: c.n / art, background: false }))
    .filter((c) => c.share >= minShare)
    .sort((x, y) => y.share - x.share)
    .slice(0, bg ? maxColors - 1 : maxColors);
  const out = bg ? [{ hex: bg.hex, share: bg.n / total, background: true }].concat(kept) : kept;
  return out.map((c) => ({ ...c, share: Math.round(c.share * 1000) / 1000 }));
}

/*
 * The closest color in each chart, for one detected color:
 *   { pantone: [up to 3], house (or null when not even close), threads: [one per thread line], vinyls: [1-2] }
 * Each entry: { label, hex, quality, difference, note? }. Same matching as the Color Matching card (E-48).
 */
const q = (difference) => ({ quality: describeDifference(difference), difference: Math.round(difference * 10) / 10 });
export function imageColorMatches(hex) {
  const house = nearestHouseInk(hex);
  return {
    pantone: nearestPantones(hex, 3).map((p) => ({ label: pantoneLabel(p.color), hex: p.color.hex, ...q(p.difference) })),
    house: house && house.difference < 12 ? { label: "House " + house.ink.name, name: house.ink.name, hex: house.ink.hex, ...q(house.difference) } : null,
    threads: nearestThreads(hex).map((n) => ({ label: threadLabel(n.item), hex: n.item.hex, brand: n.item.brand, ...q(n.difference) })),
    vinyls: nearestVinyls(hex).map((n) => ({
      label: `${n.item.name} (ORACAL 651-${n.item.code})`,
      name: n.item.name,
      hex: n.item.hex,
      note: n.item.stocked ? "in stock" : "order-in",
      ...q(n.difference),
    })),
  };
}

export const IMAGE_COLOR_CAVEAT =
  "Colors are read from the picture on this screen and matched to the CLOSEST swatch in each chart - a place to start, not a guarantee. " +
  "Photos, gradients and soft edges give extra in-between colors; only the main ones are kept. Very small details (under about 1% of the art) can be missed - add those by hand. " +
  "Vector files (.ai, .eps, .pdf) need exporting to PNG, JPG or SVG first. The picture stays on this computer - it is not uploaded or attached.";

/* Browser only: a picked file -> { data, width, height, preview } scaled to at most `max` pixels a side. */
export function readImageFile(file, max) {
  const side = max || 400;
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        // An SVG without a size reports 0 x 0; draw it at a sensible size.
        const w0 = img.naturalWidth || 300;
        const h0 = img.naturalHeight || 300;
        const scale = Math.min(1, side / Math.max(w0, h0));
        const width = Math.max(1, Math.round(w0 * scale));
        const height = Math.max(1, Math.round(h0 * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const { data } = ctx.getImageData(0, 0, width, height);
        resolve({ data, width, height, preview: url });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file could not be read as a picture."));
    };
    img.src = url;
  });
}
