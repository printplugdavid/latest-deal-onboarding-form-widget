import { findImageColors, imageColorMatches, rgbToHex, IMAGE_COLOR_CAVEAT } from "./imageColors";
import { colorDifference } from "./colorLibrary";

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16));
// A test picture: paint(x, y) -> "#rrggbb" | null (transparent) | [r, g, b].
const picture = (width, height, paint) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = paint(x, y);
      const i = (y * width + x) * 4;
      if (c == null) continue; // alpha stays 0
      const [r, g, b] = Array.isArray(c) ? c : hexRgb(c);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
};
const RED = "#c8102e";
const NAVY = "#1f2a44";
const WHITE = "#ffffff";
const GOLD = "#ffb81c";

describe("E-87 finding the main colors of a picture", () => {
  test("a two-color logo gives back exactly its two colors, most-used first", () => {
    const img = picture(60, 40, (x) => (x < 40 ? RED : NAVY));
    const out = findImageColors(img);
    expect(out.map((c) => c.hex)).toEqual([RED, NAVY]);
    expect(out[0].share).toBeCloseTo(2 / 3, 1);
  });

  test("anti-aliased edges do not show up as extra in-between colors", () => {
    // Red | a 2-pixel blended seam | white, like a soft-edged logo.
    const img = picture(80, 40, (x) => {
      if (x < 39) return RED;
      if (x > 40) return WHITE;
      const t = x === 39 ? 0.33 : 0.66;
      const [r1, g1, b1] = hexRgb(RED);
      return [r1 + (255 - r1) * t, g1 + (255 - g1) * t, b1 + (255 - b1) * t];
    });
    const out = findImageColors(img);
    expect(out.map((c) => c.hex).sort()).toEqual([RED, WHITE].sort()); // equal areas: order not asserted
  });

  test("transparent pixels are ignored and a transparent PNG has no 'background'", () => {
    const img = picture(50, 50, (x, y) => (x > 10 && x < 40 && y > 10 && y < 40 ? (y < 25 ? GOLD : NAVY) : null));
    const out = findImageColors(img);
    expect(out.map((c) => c.hex).sort()).toEqual([NAVY, GOLD].sort());
    expect(out.every((c) => !c.background)).toBe(true);
  });

  test("the color filling the border is flagged as probably the background", () => {
    const img = picture(60, 60, (x, y) => (x > 15 && x < 45 && y > 15 && y < 45 ? RED : WHITE));
    const out = findImageColors(img);
    expect(out.map((c) => [c.hex, c.background])).toEqual([
      [WHITE, true],
      [RED, false],
    ]);
  });

  test("a small tagline on a big background still counts: shares are of the art, not the paper", () => {
    // 200 x 100 white sheet; a navy block (the logo) and a thin red line (the tagline, ~0.4% of the picture)
    const img = picture(200, 100, (x, y) => {
      if (x >= 20 && x < 60 && y >= 20 && y < 60) return NAVY;
      if (x >= 20 && x < 140 && y >= 80 && y < 85) return RED;
      return WHITE;
    });
    const out = findImageColors(img);
    expect(out.map((c) => [c.hex, c.background])).toEqual([
      [WHITE, true],
      [NAVY, false],
      [RED, false],
    ]);
    expect(out[0].share).toBeGreaterThan(0.8); // the background: of the whole picture
    expect(out[1].share + out[2].share).toBeCloseTo(1, 2); // the art's colors: of the art
  });

  test("a soft, darker rim around lettering joins the letter color; a thin anti-aliased line still counts", () => {
    // White sheet; purple letter block with a 2 px darker rim (JPEG blur); a 2 px black rule with blended sides.
    const PURPLE = "#5c2d91";
    const img = picture(200, 100, (x, y) => {
      if (x >= 20 && x < 80 && y >= 20 && y < 60) return x < 22 || x >= 78 || y < 22 || y >= 58 ? "#55357f" : PURPLE;
      if (x >= 20 && x < 160 && y >= 75 && y < 77) return "#000000";
      if (x >= 20 && x < 160 && (y === 74 || y === 77)) return "#808080";
      return WHITE;
    });
    expect(findImageColors(img).map((c) => c.hex)).toEqual([WHITE, PURPLE, "#000000"]);
  });

  test("JPEG-style noise is merged into the color it belongs to", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 10; // +/- 5 per channel
    const img = picture(60, 60, (x) => {
      const [r, g, b] = hexRgb(x < 30 ? RED : GOLD);
      return [r + rnd(), g + rnd(), b + rnd()];
    });
    const out = findImageColors(img);
    expect(out).toHaveLength(2);
    expect(colorDifference(out.find((c) => c.share && colorDifference(c.hex, RED) < 5).hex, RED)).toBeLessThan(3);
    expect(out.some((c) => colorDifference(c.hex, GOLD) < 3)).toBe(true);
  });

  test("a thin detail over 0.5% is kept; a speck under it is left out; the count is capped", () => {
    // a thin navy line, 2 px x 40 px on 100 x 100 (0.8%) -- a line is not a blend of its sides
    const line = picture(100, 100, (x, y) => (x >= 20 && x < 22 && y >= 30 && y < 70 ? NAVY : RED));
    expect(findImageColors(line).map((c) => c.hex)).toEqual([RED, NAVY]);
    // a 3 x 3 speck on 80 x 80 (0.14% of the picture)
    const speck = picture(80, 80, (x, y) => (x >= 10 && x < 13 && y >= 10 && y < 13 ? NAVY : RED));
    expect(findImageColors(speck).map((c) => c.hex)).toEqual([RED]);
    // 12 well-separated stripes -> at most MAX_COLORS (8) back
    const stripes = ["#000000", WHITE, RED, NAVY, GOLD, "#00843d", "#7c2855", "#00a3e0", "#ff6a13", "#6d2077", "#a7a8aa", "#4e3629"];
    const many = picture(120, 20, (x) => stripes[Math.floor(x / 10)]);
    const got = findImageColors(many);
    expect(got.length).toBe(8);
    got.forEach((c) => expect(stripes.some((s) => colorDifference(s, c.hex) < 3)).toBe(true));
  });

  test("the same picture always gives the same answer; empty input gives nothing", () => {
    const img = picture(40, 40, (x, y) => ((x + y) % 20 < 10 ? RED : NAVY));
    expect(findImageColors(img)).toEqual(findImageColors(img));
    expect(findImageColors(picture(10, 10, () => null))).toEqual([]);
    expect(findImageColors(null)).toEqual([]);
    expect(findImageColors({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toEqual([]);
  });

  test("a photo-like gradient still gives a short list", () => {
    const img = picture(64, 64, (x, y) => [x * 4, y * 4, 128 + ((x * y) % 7) * 18]);
    const out = findImageColors(img);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(8);
  });

  test("rgbToHex", () => {
    expect(rgbToHex(200, 16, 46)).toBe(RED);
    expect(rgbToHex(-3, 300, 15.6)).toBe("#00ff10");
  });
});

describe("E-87 each found color matched in every chart", () => {
  test("Pantone (Coated only), house ink when close, one thread per line, an ORACAL vinyl", () => {
    const m = imageColorMatches(RED);
    expect(m.pantone).toHaveLength(3);
    m.pantone.forEach((p) => expect(p.label).toMatch(/^Pantone .+ C$/));
    expect(m.pantone[0].difference).toBeLessThan(3); // #c8102e is Pantone 186 C on screen
    expect(m.threads.map((t) => t.brand)).toEqual(["Madeira Polyneon", "Madeira Classic Rayon", "Marathon Polyester"]);
    expect(m.vinyls[0].label).toMatch(/\(ORACAL 651-\d+\)$/);
    expect(["in stock", "order-in"]).toContain(m.vinyls[0].note);
    expect(m.house === null || m.house.difference < 12).toBe(true);
  });
  test("a color no house ink is near gets no house ink (a custom mix)", () => {
    expect(imageColorMatches("#7c2855").house).toBe(null);
  });
  test("the caveat says nothing leaves the computer", () => {
    expect(IMAGE_COLOR_CAVEAT).toMatch(/not uploaded/);
  });
});
