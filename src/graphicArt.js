/*
 * E-95 (David, 2026-10-19): art is attached PER GRAPHIC, and "Find colors in this file" reads that graphic's own art.
 *
 * Pure helpers (no React, no ZOHO) shared by the graphic row (components/GraphicArt.jsx), the Submit upload and the
 * production cards. What a graphic saves is `artFiles: [{ name, size, key }]` -- names only; the files themselves are
 * uploaded to the onboarding note on Submit exactly like the "Other files" box (and copied to Art Assets by E-72).
 */
import { addLine, colorFamilies, colorModeFor } from "./colorLibrary";
import { addColorToText, catalogFor } from "./colorCatalogs";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // the form's total for every file on the note (art + other files)

/* Which chart a graphic's colors are written in. DTF / DTG / printable vinyl have no chart: HEX codes, as Korie types them. */
export const finderModeFor = (productName) => colorModeFor(productName) || "hex";

/* "#a23b32" -> "Red #A23B32": a plain color word and the HEX code (the way staff write DTF / DTG colors). */
export function hexLine(hex) {
  const h = String(hex || "").toUpperCase();
  const word = (colorFamilies(h)[0] || "color").replace(/^./, (c) => c.toUpperCase());
  return `${word} ${h}`;
}

/* The Colors Used text after adding picks from the finder: one line per pick, in the graphic's own chart. */
export function writePicks(text, picks, productName) {
  const mode = finderModeFor(productName);
  const catalog = catalogFor(productName);
  return (picks || []).reduce((t, p) => {
    if (mode === "vinyl") return addColorToText(t, p.match.name, catalog);
    if (p.kind === "house") return addLine(t, p.match.name);
    return addLine(t, p.match.label);
  }, String(text == null ? "" : text));
}

/* A picked file's stable key (the same file picked twice is one file). */
export const artKey = (f) => `${f.name}|${f.size}|${f.lastModified || 0}`;

/* Files a browser can draw (the color finder reads these); design files (.ai, .eps, .pdf, .dst …) are attached only. */
export const isPicture = (name) => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(String(name || ""));

/* Every art file referenced by any graphic in the form values, once each: [{ name, size, key }]. */
export function collectArtFiles(products) {
  const out = new Map();
  const take = (gr) => (Array.isArray(gr?.artFiles) ? gr.artFiles : []).forEach((a) => a && a.key && !out.has(a.key) && out.set(a.key, a));
  (products || []).forEach((p) => {
    (p?.primaryBranches || []).forEach((g) => (g?.secondaryBranches || []).forEach(take));
    (p?.branches || []).forEach(take);
  });
  return [...out.values()];
}

/* "logo.png, back.dst" -- for the production cards. */
export const artNames = (gr) => (Array.isArray(gr?.artFiles) ? gr.artFiles.map((a) => a && a.name).filter(Boolean).join(", ") : "");
