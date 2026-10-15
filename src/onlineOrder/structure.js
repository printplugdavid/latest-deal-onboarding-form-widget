// (Moved from the InkSoft thread's auto-onboard/structure.mjs, 2026-10-15 -- docs/48.)
// Placements in the form's structured shape (E-74), using the form's OWN helpers from src/placements.js.
//
// Profiles come from onboardings typed before E-74, so a placement is free text: "Left chest", "3.5\" wide".
// The form today stores a pick from its list plus width / height boxes, and derives the text from them. This does
// the same, conservatively, exactly as the form treats an older order (shownPick): a typed location that matches
// one of the options for the garment kind becomes that pick; anything else becomes "Other…" with the text kept.
// Sizes: "N\" wide" -> widthIn, "N\" tall|high" -> heightIn; anything else is left as typed.
export function structurePlacements(data, P) {
  for (const prod of data.products || []) {
    for (const g of prod.primaryBranches || []) {
      for (const gr of g.secondaryBranches || []) {
        for (const pl of gr.tartiaryBranches || []) {
          if (pl.placementPick) continue;                       // already structured
          const { pick, other } = P.shownPick(pl, g.garmentKind);
          if (pick) {
            pl.placementPick = pick;
            pl.placementOther = other;
            pl.placementLocation = P.locationText(pick, other);
          }
          const m = String(pl.sizeAndDimensions || '').trim().match(/^(\d+(?:\.\d+)?)\s*(?:"|in(?:ch(?:es)?)?)?\s*(wide|w|tall|high|h)\s*$/i);
          if (m) {
            const wide = /^w/i.test(m[2]);
            pl.widthIn = wide ? m[1] : '';
            pl.heightIn = wide ? '' : m[1];
            pl.positionNote = '';
            pl.sizeAndDimensions = P.sizeText(pl.widthIn, pl.heightIn, '');
          }
        }
      }
    }
  }
  return data;
}
