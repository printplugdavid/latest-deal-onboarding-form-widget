/*
 * E-137 (David, 2026-10-28): every supplier shipment (a box of garments coming IN from SanMar, S&S, ...) goes in ONE multi-line Deal
 * field, `Production_Tracking`, in one set format -- David: "paste the number on one line, and the link underneath it, so it follows a
 * perfect and expectable format":
 *
 *   1Z9432470337501714
 *   https://www.ups.com/track?loc=en_US&tracknum=1Z9432470337501714
 *
 *   449780000997336
 *   https://gls-group.com/US/en/send-and-receive/track-a-parcel/?TrackingNumbers=449780000997336
 *
 * A blank line between boxes. The link is built from the number, so it always opens that package (only 48% of the old links did --
 * GLS ones opened the search page, S&S / SanMar ones an account page). The customer's own shipment is NOT here: it is Tracking_Number /
 * Tracking_URL, written by the QC form.
 *
 * Used by: the production card viewer (clickable list), the one-time move of the 8 old boxes (tools/tracking-move), and later the
 * Shipping Form (E-145). The automatic supplier job (E-146, a Zoho function) writes the same format -- keep its copy in step with
 * FORMAT_EXAMPLES in tracking.test.js.
 * No imports on purpose: the move tool loads this file straight into Node.
 */

export const TRACKING_FIELD = "Production_Tracking";
// The 8 old boxes (label "Production Tracking N" = the number, "Production Tracking URL N" = a link). Kept, hidden from the layout after the move.
export const OLD_NUMBER_FIELDS = ["Tracking_Link_1", "Tracking_Link_2", "Tracking_Link_3", "Tracking_Link_4"];
export const OLD_URL_FIELDS = ["Production_Tracking_URL_1", "Production_Tracking_URL_2", "Production_Tracking_URL_3", "Production_Tracking_URL_4"];

/*
 * Carriers, checked in this order. Patterns from the Deals (10-28: 177 UPS, 84 GLS "G…" from S&S, 53 GLS "4497…" from SanMar (GSO),
 * 6 twelve-digit FedEx) and the suppliers' shipment notices. GLS links checked in a browser 10-28 (both kinds open the parcel).
 */
const CARRIERS = [
  { name: "UPS", test: /^1Z[0-9A-Z]{16}$/, link: (n) => `https://www.ups.com/track?loc=en_US&tracknum=${n}` },
  { name: "GLS", test: /^G\d{17,18}$/, link: (n) => `https://gls-group.com/US/en/send-and-receive/track-a-parcel/?TrackingNumbers=${n}` },
  { name: "GLS", test: /^4497\d{11}$/, link: (n) => `https://gls-group.com/US/en/send-and-receive/track-a-parcel/?TrackingNumbers=${n}` },
  { name: "USPS", test: /^9[1-5]\d{18,24}$/, link: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}` },
  { name: "FedEx", test: /^(\d{12}|\d{15}|96\d{20})$/, link: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}` },
];

const str = (v) => (v == null ? "" : String(v));
const isUrl = (s) => /^https?:\/\//i.test(s);

// " 1z94 3247 0337 5017 14 " -> "1Z9432470337501714"
export function cleanNumber(text) {
  return str(text).replace(/[\s-]+/g, "").toUpperCase();
}

export function carrierOf(number) {
  const n = cleanNumber(number);
  const c = CARRIERS.find((x) => x.test.test(n));
  return c ? c.name : "";
}

// The one-click link for a number, or "" when the carrier is not known.
export function linkFor(number) {
  const n = cleanNumber(number);
  const c = CARRIERS.find((x) => x.test.test(n));
  return c ? c.link(n) : "";
}

/*
 * Every tracking number in a piece of text (a pasted line, a box holding several numbers, a link). Known carrier shapes only, so a PO,
 * a price or a date is never taken for a number. In order, no repeats.
 */
const FIND = /1Z[0-9A-Z]{16}|G\d{17,18}|\d{12,26}/gi;
export function findNumbers(text) {
  const out = [];
  for (const m of str(text).toUpperCase().matchAll(FIND)) {
    const n = m[0];
    if (carrierOf(n) && !out.includes(n)) out.push(n);
  }
  // One number typed in groups ("9405 5301 0935 5290 6451 62"): only when the text is nothing else, so a list of numbers is never glued.
  if (!out.length && /^[\d\s-]+$/.test(str(text).trim()) && carrierOf(str(text))) out.push(cleanNumber(text));
  return out;
}

/*
 * The number a LINK is for: the UPS / FedEx / USPS / GLS parameter, or the highlighted number of a supplier page link
 * ("…orders#:~:text=%24404.58-,G142134103922445001,-Yes" -> G142134103922445001). "" when the link names none (the GLS search page).
 * A supplier page link also shows its neighbours in the order (`-,A,-B`), so only the highlighted one is taken.
 */
export function numberInLink(url) {
  const u = str(url).trim();
  if (!isUrl(u)) return "";
  const param = u.match(/[?&](?:tracknum|trackNums|trknbr|tLabels|TrackingNumbers)=([^&#]+)/i);
  if (param) {
    const n = findNumbers(decodeURIComponent(param[1]).split("/")[0])[0];
    if (n) return n;
  }
  const frag = u.match(/#:~:text=(?:[^,]*-,)?([^,&]+)(?:,-|$)/);
  if (frag) {
    const n = findNumbers(decodeURIComponent(frag[1]))[0];
    if (n) return n;
  }
  return "";
}

/*
 * Read the field back: [{ number, link, carrier }]. Tolerant of what people type: a line with a number starts a box; a link line under
 * it is that box's link; a link line naming a NEW number is a box of its own; other text is ignored.
 */
export function parseTracking(text) {
  const boxes = [];
  for (const raw of str(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (isUrl(line)) {
      const n = numberInLink(line);
      const last = boxes[boxes.length - 1];
      if (n && !boxes.some((b) => b.number === n)) boxes.push({ number: n, link: line, carrier: carrierOf(n) });
      else if (last && !last.typedLink && (!n || n === last.number)) { last.link = line; last.typedLink = true; }
      continue;
    }
    for (const n of findNumbers(line)) {
      if (!boxes.some((b) => b.number === n)) boxes.push({ number: n, link: "", carrier: carrierOf(n) });
    }
  }
  // The built link wins for a known carrier (a typed GLS search page or supplier account page never opens the package);
  // a typed link is used only for a carrier we do not know.
  return boxes.map((b) => ({ number: b.number, link: linkFor(b.number) || b.link, carrier: b.carrier }));
}

// One box in David's format: the number, the link underneath -- the built one for a known carrier, else the link given (no link line
// when the carrier is unknown and none was given).
export function formatBox(number, link) {
  const n = cleanNumber(number);
  const l = linkFor(n) || str(link).trim();
  return l ? `${n}\n${l}` : n;
}

export function formatTracking(boxes) {
  return (boxes || []).map((b) => formatBox(b.number, b.link)).join("\n\n");
}

/*
 * Add boxes to what the field holds now. What is there is never changed or removed; a number already in it is not added again.
 * -> { text, added: [numbers] }
 */
export function addBoxes(current, boxes) {
  const have = new Set(parseTracking(current).map((b) => b.number));
  const added = [];
  const blocks = [];
  for (const b of boxes || []) {
    const n = cleanNumber(b.number);
    if (!n || have.has(n)) continue;
    have.add(n);
    added.push(n);
    blocks.push(formatBox(n, b.link));
  }
  const base = str(current).replace(/\s+$/, "");
  const text = blocks.length ? (base ? base + "\n\n" : "") + blocks.join("\n\n") : str(current);
  return { text, added };
}

/*
 * The 8 old boxes of a Deal as boxes. Numbers come from the number boxes (some hold a link, or several numbers in one box); a link box
 * adds only the number it is for, if that number is not already listed. The link kept is the one-click link we build; an old link is kept
 * only for a carrier we do not know.
 */
export function boxesFromOld(deal) {
  const boxes = [];
  const push = (n, oldLink) => {
    if (!n || boxes.some((b) => b.number === n)) return;
    const built = linkFor(n);
    const keep = !built && isUrl(str(oldLink).trim()) && numberInLink(oldLink) === n ? str(oldLink).trim() : "";
    boxes.push({ number: n, link: built || keep, carrier: carrierOf(n) });
  };
  OLD_NUMBER_FIELDS.forEach((f, i) => {
    const numText = str(deal?.[f]);
    const url = str(deal?.[OLD_URL_FIELDS[i]]);
    const inBox = isUrl(numText.trim()) ? [numberInLink(numText)].filter(Boolean) : findNumbers(numText);
    inBox.forEach((n) => push(n, url));
  });
  OLD_URL_FIELDS.forEach((f) => {
    const n = numberInLink(deal?.[f]);
    if (n) push(n, deal?.[f]);
  });
  return boxes;
}

// What the cards show: the new field when it has anything, else the old boxes (until the one-time move is done).
export function dealShipments(deal) {
  const now = parseTracking(deal?.[TRACKING_FIELD]);
  return now.length ? now : boxesFromOld(deal);
}
