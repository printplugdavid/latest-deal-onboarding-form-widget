/*
 * boxContents.js -- E-172 (production via David, 2026-10-30): which supplier boxes each department's job needs, and a flag on a box that
 * also holds another department's garments (click -> which garments, whose).
 *
 * The contents come from the supplier's shipment notice: Zoho's twice-a-day supplier run (E-146, Deluge `SCHEDULE_Supplier_Tracking`)
 * writes one line under each box it adds to the Deal's Production Tracking (D-67 format + this line):
 *
 *   1Z9432470300000001
 *   https://www.ups.com/track?loc=en_US&tracknum=1Z9432470300000001
 *   Contents: 1717 Granite: S 5, M 10, L 10 | 1717 Black: S 5 | 112Y Black: OSFA 5
 *
 * One item = STYLE (no spaces), then the color (may have spaces; may be missing), a colon, then "SIZE COUNT" pairs; when the size is not
 * known, just the count ("18000: 24"). Items are separated by " | ". This file owns the format (us, SHARED-SOURCES row 20); the Deluge
 * twin must produce exactly `formatContents`. Boxes typed by hand, other suppliers and older boxes have no Contents line: they are
 * listed as "contents not listed", as before.
 *
 * Pure: no ZOHO, no React. The card route function is passed in (productionCards.js imports this file).
 */
import { SIZE_OPTIONS, normalizeSize, parseSizeText } from "../sizeRows";
import { CONTENTS_PREFIX, cleanStyle, formatContents, parseContents } from "../tracking";

export { CONTENTS_PREFIX, cleanStyle, formatContents, parseContents };

const str = (v) => (v == null ? "" : String(v));
// Colors are compared loosely: "Heather Grey" = "heather gray" = "HeatherGrey".
const colorKey = (c) => str(c).toLowerCase().replace(/grey/g, "gray").replace(/[^a-z0-9]/g, "");

/*
 * The order's garments, each with its card: [{ card, name, styles: [..], colors: [colorKey..] }]. Styles = the garment's SKU rows plus a
 * code in brackets at the end of ANY line of its Garment Type, like the E-146 run reads them. One garment line often holds several styles
 * (real orders 10-30: "Comfort Colors ... (1717)" + "Men's Pregame Long Sleeve T-Shirt (AT104)" in one garment), each with its own
 * section in the sizes ("... (AT104):" or "nl6211:" then its colors): each such section is also an entry of its own, so its colors
 * stay with its style. routeOf(product) -> { card } (productionCards' pcRoute).
 */
const codeOf = (label) => {
  const t = str(label).trim();
  const br = /\(([^()]+)\)\s*$/.exec(t) || /\[([^[\]]+)\]\s*$/.exec(t);
  const c = cleanStyle(br ? br[1] : t);
  return /^[A-Z0-9]{3,}$/.test(c) && /\d/.test(c) ? c : "";
};
export function orderGarments(data, routeOf) {
  const out = [];
  ((data && data.products) || []).forEach((p) => {
    if (!p || p.productType !== "garment") return;
    const route = routeOf(p);
    if (!route) return;
    (p.primaryBranches || []).forEach((b) => {
      if (!b) return;
      const styles = [];
      const add = (list, s) => {
        const c = cleanStyle(s);
        if (c && /^[A-Z0-9]+$/.test(c) && !list.includes(c)) list.push(c);
      };
      (b.garmentSkus || []).forEach((r) => add(styles, r && r.sku));
      const typeLines = str(b.garmentType).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      typeLines.forEach((l) => add(styles, codeOf(/\)\s*$|\]\s*$/.test(l) ? l : "")));
      const branchColors = [];
      const sections = new Map(); // style code -> colors
      parseSizeText(b.countColorSize).rows.forEach((r) => {
        const k = colorKey(r.color);
        const code = codeOf(r.group);
        if (code) {
          add(styles, code);
          if (!sections.has(code)) sections.set(code, []);
          if (k && !sections.get(code).includes(k)) sections.get(code).push(k);
        } else if (k && !branchColors.includes(k)) branchColors.push(k);
      });
      const name = typeLines[0] || str(p.productName);
      out.push({ card: route.card, name, styles, colors: branchColors });
      sections.forEach((colors, code) => out.push({ card: route.card, name, styles: [code], colors }));
    });
  });
  return out;
}

// A box style matches a garment SKU when equal, or when the SKU is the style with 2-4 brand letters in front (D-61 clash SKUs: RI220).
const styleMatches = (boxStyle, sku) => sku === boxStyle || (sku.endsWith(boxStyle) && /^[A-Z]{2,4}$/.test(sku.slice(0, sku.length - boxStyle.length)));

/* Which cards an item belongs to: by style, narrowed by color when that tells them apart. [] = no garment on this order matches. */
export function cardsForItem(item, garments) {
  const byStyle = (garments || []).filter((g) => g.styles.some((s) => styleMatches(item.style, s)));
  const ck = colorKey(item.color);
  const byColor = ck ? byStyle.filter((g) => g.colors.some((c) => c === ck || c.includes(ck) || ck.includes(c))) : [];
  const pick = byColor.length ? byColor : byStyle;
  return [...new Set(pick.map((g) => g.card))];
}

/*
 * Sort the boxes for one card. boxes: parseTracking() output (each may carry `contents` items).
 * -> { mine: [{ box, items: [..mine], others: [{ item, cards: [..] }], unmatched: [..] }], elsewhere: [{ box, others }], unknown: [box] }
 *   mine      = boxes with at least one of this card's garments (others = the other departments' garments in the same box)
 *   elsewhere = boxes with contents listed but none for this card
 *   unknown   = boxes with no contents listed (typed by hand, other suppliers, older boxes)
 */
export function sortBoxesForCard(boxes, garments, card) {
  const mine = [];
  const elsewhere = [];
  const unknown = [];
  (boxes || []).forEach((box) => {
    const items = (box && box.contents) || [];
    if (!items.length) {
      unknown.push(box);
      return;
    }
    const me = [];
    const others = [];
    const unmatched = [];
    items.forEach((it) => {
      const cards = cardsForItem(it, garments);
      if (cards.includes(card)) me.push({ ...it, sharedWith: cards.filter((c) => c !== card) });
      else if (cards.length) others.push({ item: it, cards });
      else unmatched.push(it);
    });
    if (me.length) mine.push({ box, items: me, others, unmatched });
    else elsewhere.push({ box, others, unmatched });
  });
  return { mine, elsewhere, unknown };
}

/* "1717 Granite: S 5, M 10 (15)" for a card line. */
// Sizes come in the supplier's notice order ("S 5, XL 5, L 10, M 10"); the card reads them in the shop's order (Deluge 10-30, dry run).
// A size the form does not know (SanMar "Adjustable") keeps its place after the known ones.
const sizeRank = (size) => {
  const i = SIZE_OPTIONS.indexOf(normalizeSize(size) || "");
  return i < 0 ? SIZE_OPTIONS.length : i;
};
export function itemText(it) {
  const head = str(it.color).trim() ? `${it.style} ${str(it.color).trim()}` : it.style;
  const ordered = (it.sizes || []).map((s, i) => ({ s, i })).sort((a, b) => sizeRank(a.s.size) - sizeRank(b.s.size) || a.i - b.i).map((x) => x.s);
  const sizes = ordered.map((s) => `${normalizeSize(s.size) || s.size} ${s.count}`).join(", ");
  return sizes ? `${head}: ${sizes} (${it.count})` : `${head}: ${it.count} pcs`;
}
