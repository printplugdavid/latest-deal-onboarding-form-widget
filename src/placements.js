/*
 * placements.js -- E-74 (David, 2026-10-15): placement and size are PICKED, not typed.
 *
 *   "I want to remove the agents ability to manually type placement and size of graphics in a multi line.
 *    I want placement to be a drop down ... Some of these placements only pertain to certain garments ...
 *    Will also want an Other option, and if that is selected give them a single line option to fill in.
 *    Size will be proportionate: x by x. Sometimes they only have one side ... the output should read that
 *    the other side is 'by proportion' with the image."
 *
 * The lists come from a survey of 1,162 real placements (docs/44): 86% give one side only, always in inches,
 * and the embroidery Small/Medium/Large follows the location almost exactly.
 *
 * ⚠️ What is SAVED for everything downstream is unchanged: `placementLocation` and `sizeAndDimensions` stay
 * text, filled from the picks, so the note, the cards, the QC form, printMath and both note parsers read what
 * they always read. The picks themselves are saved alongside (garmentKind, placementPick, placementOther,
 * widthIn, heightIn, positionNote).
 *
 * Pure: no React, no ZOHO.
 */

export const OTHER = "Other…";
export const PRINT_ONLY = "Print Only (no garment)";

/* The Garment kind picked on each garment type. "" (not picked) offers every location. */
export const GARMENT_KINDS = [
  "Tee / Long Sleeve / Tank",
  "Hoodie / Crew / Zip",
  "Polo / Button-up",
  "Jacket / Vest",
  "Hat / Cap",
  "Beanie",
  "Pants / Shorts",
  "Bag / Tote / Backpack",
  "Apron",
  "Other item",
];

const sleeves = (side) => [
  side + " Sleeve – Upper",
  side + " Sleeve – Mid",
  side + " Sleeve – Lower / Cuff",
  side + " Sleeve – Full Length",
];

/* Locations in groups (the dropdown shows the group names as headings). */
const TOPS = [
  ["Front", ["Left Chest", "Right Chest", "Center Chest", "Full Front", "Left Pocket", "Right Pocket", "Over Left Pocket", "Over Right Pocket"]],
  ["Back", ["Full Back", "Upper Back (Yoke)", "Nape (Back of Neck)", "Mid Back", "Lower Back", "Name (Back)", "Number (Back)"]],
  ["Sleeves", [...sleeves("Left"), ...sleeves("Right"), "Left Shoulder", "Right Shoulder"]],
  ["Other", ["Inside Neck Label"]],
];
const HOODIE_EXTRA = ["Hoodie", ["Hood", "Front Pouch Pocket"]];

const BY_KIND = {
  "Tee / Long Sleeve / Tank": TOPS,
  "Hoodie / Crew / Zip": [...TOPS.slice(0, 3), HOODIE_EXTRA, TOPS[3]],
  "Polo / Button-up": TOPS,
  "Jacket / Vest": TOPS,
  "Hat / Cap": [["Hat", ["Front", "Left Side Panel", "Right Side Panel", "Back (over strap / snapback)", "Top of Bill", "Under Bill"]]],
  Beanie: [["Beanie", ["Front (Cuff)", "Back", "Left Side", "Right Side"]]],
  "Pants / Shorts": [
    ["Legs", ["Left Leg – Upper (Thigh)", "Left Leg – Lower", "Right Leg – Upper (Thigh)", "Right Leg – Lower", "Seat (Back)"]],
    ["Pockets & waist", ["Front Left Pocket", "Front Right Pocket", "Back Left Pocket", "Back Right Pocket", "Waistband"]],
  ],
  "Bag / Tote / Backpack": [["Bag", ["Front", "Back", "Front Pocket", "Flap", "Strap"]]],
  Apron: [["Apron", ["Center Chest", "Left Chest", "Front Pocket", "Full Front"]]],
  "Other item": [["Item", ["Center", "Left Side", "Right Side", "Full Coverage", PRINT_ONLY]]],
};

/* Every kind's groups, for a garment whose kind is not picked yet (old orders in the Amendment Form). */
const ALL_GROUPS = (() => {
  const seen = new Set();
  const out = [];
  const add = (name, list) => {
    const fresh = list.filter((l) => !seen.has(l));
    fresh.forEach((l) => seen.add(l));
    if (fresh.length) out.push([name, fresh]);
  };
  [...TOPS.slice(0, 3), HOODIE_EXTRA, TOPS[3]].forEach(([g, l]) => add("Shirts & tops · " + g, l));
  ["Hat / Cap", "Beanie", "Pants / Shorts", "Bag / Tote / Backpack", "Apron", "Other item"].forEach((k) =>
    BY_KIND[k].forEach(([g, l]) => add(k === "Pants / Shorts" ? "Pants · " + g : g, l))
  );
  return out;
})();

const groupsFor = (kind) => BY_KIND[kind] || ALL_GROUPS;

/* The options for a garment kind, in order, ending with "Other…". */
export function locationsFor(kind) {
  return [...groupsFor(kind).flatMap(([, list]) => list), OTHER];
}

/* The heading an option sits under (for the dropdown's groups). */
export function locationGroup(kind, label) {
  if (label === OTHER) return "Other";
  const hit = groupsFor(kind).find(([, list]) => list.includes(label));
  return hit ? hit[0] : "Other";
}

const str = (v) => String(v == null ? "" : v).trim();

/*
 * What the dropdown shows for a placement, from what is saved. A placement saved by this form carries its pick;
 * an older one only has the typed text -- shown as the matching option when it is one (case-insensitive), else as
 * "Other…" with the text in the Other box. Nothing is written: opening an old order must not count as a change.
 */
export function shownPick(placement, kind) {
  const pick = str(placement && placement.placementPick);
  const other = str(placement && placement.placementOther);
  if (pick) return { pick, other };
  const typed = str(placement && placement.placementLocation);
  if (!typed) return { pick: "", other: "" };
  const match = locationsFor(kind).find((l) => l !== OTHER && l.toLowerCase() === typed.toLowerCase());
  return match ? { pick: match, other: "" } : { pick: OTHER, other: typed };
}

/* The saved `placementLocation` text for a pick: the option itself, or the Other line as typed. */
export const locationText = (pick, other) => (pick === OTHER ? str(other) : str(pick));

/* The number part only: quote marks and a trailing in / inch / inches removed. */
const unitless = (v) =>
  str(v)
    .replace(/[”"″]/g, "")
    .replace(/\s*(inches|inch|in)\.?\s*$/i, "")
    .trim();

/*
 * Inches as reps write them: 3.5 · 3 1/2 · 2 3/4 · 3/4 · 10" · 10 in · 10 inches. Returns the number, or NaN when
 * it is not a size (blank is NaN too -- callers check blank first).
 */
export function parseInches(v) {
  const s = unitless(v);
  if (!s) return NaN;
  let m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]);
  m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m && Number(m[3]) > 0) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m && Number(m[2]) > 0) return Number(m[1]) / Number(m[2]);
  return NaN;
}

/* A size box is fine when blank or a positive size. */
export const sizeOk = (v) => !str(v) || parseInches(v) > 0;

/* How a side is written back: as the rep typed the number (keeps "3 1/2"), without any unit they added. */
const side = (v) => unitless(v);

/*
 * The size line the note, cards and QC form read:
 *   both   -> 3.5" W × 3.5" H
 *   width  -> 10" W × height in proportion
 *   height -> width in proportion × 2.5" H
 * A position note (an offset like "3 in down from collar") follows after " · ". Blank when nothing is entered.
 */
export function sizeText(width, height, note) {
  const w = sizeOk(width) && str(width) ? side(width) : "";
  const h = sizeOk(height) && str(height) ? side(height) : "";
  const size = w && h ? `${w}" W × ${h}" H` : w ? `${w}" W × height in proportion` : h ? `width in proportion × ${h}" H` : "";
  // Placement details may run over several lines; the size line stays one line (the note parsers read it as one).
  const n = str(note).split(/\s*\n\s*/).filter(Boolean).join(" / ");
  return [size, n].filter(Boolean).join(" · ");
}

/*
 * Embroidery Small / Medium / Large from the location, only where the survey is clear (left chest was Small 275
 * of 278 times, back Large 212 of 227, hats Small 109 of 115). Everything else: no suggestion.
 */
const SMALL = new Set([
  "Left Chest", "Right Chest", "Left Pocket", "Right Pocket", "Over Left Pocket", "Over Right Pocket",
  ...sleeves("Left"), ...sleeves("Right"), "Left Shoulder", "Right Shoulder", "Nape (Back of Neck)",
  "Front", "Left Side Panel", "Right Side Panel", "Back (over strap / snapback)", "Top of Bill", "Under Bill",
  "Front (Cuff)", "Left Side", "Right Side",
]);
const LARGE = new Set(["Full Front", "Full Back", "Center Chest"]);
export function embroiderySizeFor(pick, kind) {
  // "Front" / "Back" / "Left Side" mean small spots only on hats and beanies; on a bag they are big.
  const headwear = kind === "Hat / Cap" || kind === "Beanie";
  if (["Front", "Back", "Left Side", "Right Side"].includes(pick) && !headwear) return "";
  if (SMALL.has(pick)) return "Small";
  if (LARGE.has(pick)) return "Large";
  return "";
}
