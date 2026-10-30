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
import { normalizeSize, parseSizeText } from "../sizeRows";
import { CONTENTS_PREFIX, cleanStyle, formatContents, parseContents } from "../tracking";

export { CONTENTS_PREFIX, cleanStyle, formatContents, parseContents };

const str = (v) => (v == null ? "" : String(v));
// Colors are compared loosely: "Heather Grey" = "heather gray" = "HeatherGrey".
const colorKey = (c) => str(c).toLowerCase().replace(/grey/g, "gray").replace(/[^a-z0-9]/g, "");

/*
 * The order's garments, each with its card: [{ card, name, styles: [..], colors: [colorKey..] }]. Styles = the garment's SKU rows plus a
 * code in brackets at the end of its Garment Type, like the E-146 run reads them. routeOf(product) -> { card } (productionCards' pcRoute).
 */
export function orderGarments(data, routeOf) {
  const out = [];
  ((data && data.products) || []).forEach((p) => {
    if (!p || p.productType !== "garment") return;
    const route = routeOf(p);
    if (!route) return;
    (p.primaryBranches || []).forEach((b) => {
      if (!b) return;
      const styles = [];
      const add = (s) => {
        const c = cleanStyle(s);
        if (c && /^[A-Z0-9]+$/.test(c) && !styles.includes(c)) styles.push(c);
      };
      (b.garmentSkus || []).forEach((r) => add(r && r.sku));
      const type = str(b.garmentType).split(/\r?\n/)[0].trim();
      const br = /\(([^()]+)\)\s*$/.exec(type) || /\[([^[\]]+)\]\s*$/.exec(type);
      if (br && /\d/.test(br[1]) && cleanStyle(br[1]).length >= 3) add(br[1]);
      const colors = [];
      parseSizeText(b.countColorSize).rows.forEach((r) => {
        const k = colorKey(r.color);
        if (k && !colors.includes(k)) colors.push(k);
      });
      out.push({ card: route.card, name: type || str(p.productName), styles, colors });
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
export function itemText(it) {
  const head = str(it.color).trim() ? `${it.style} ${str(it.color).trim()}` : it.style;
  const sizes = (it.sizes || []).map((s) => `${normalizeSize(s.size) || s.size} ${s.count}`).join(", ");
  return sizes ? `${head}: ${sizes} (${it.count})` : `${head}: ${it.count} pcs`;
}
