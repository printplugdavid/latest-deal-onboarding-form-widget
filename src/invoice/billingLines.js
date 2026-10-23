/*
 * E-108 (docs/63): the lines of the draft invoice / estimate, worked out from the onboarding form's answers. Pure: no React, no ZOHO.
 *
 * The plan is Books sku-audit/docs/39 (wins) + Deluge docs/41; the Zoho side is Deluge docs/43. The form decides every line (SKU,
 * quantity, description) and sends it; Zoho adds only rush (PPFEE1 +20 %), extended turnaround (PPETD -5 %) and the card fee from
 * three flags. We compute PPFEE8 (10 % of the decoration charged on client-provided garments) once Books' rates are known
 * (priceLines). Nothing is guessed: what the form cannot place goes to `handList`, which the rep sees before and after Submit.
 *
 *   buildBillingLines(formData) -> { lines, handList, clientFee, flags, tiers }
 *     lines:     [{ sku, quantity, description, group, clientQty }]   group: garment | decoration | extra | gangSheet | product | fee | other
 *     handList:  [{ what, quantity, reason }]
 *     clientFee: [{ sku, quantity, percent }]  -- per decoration line, the client garments it covers (-> PPFEE8)
 *     flags:     { document, rush, extendedTurnaround, payingByCard }
 */
import GRID from "./billingGrid.json";
import { parseSizeText, hasCode, SIZE_LABELS } from "../sizeRows";
import { bandOf, nameStem, familyBase } from "../products/garmentFromBooks";
import { isClientOwnedGarment, isClientOwnedSku, CLIENT_OWNED } from "../products/clientOwned";
import { canonicalKind, locationText, parseInches } from "../placements";
import RULES from "../products/newProductRules.json";

const str = (v) => (v == null ? "" : String(v));
const int = (v) => {
  const n = parseInt(str(v).replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const yes = (v) => v === true || str(v).toLowerCase() === "yes" || str(v).toLowerCase() === "true";
const round2 = (n) => Math.round(n * 100) / 100;
const firstLine = (v) => str(v).split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "";
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const METHODS = {
  "Screen Printing": "screen",
  Embroidery: "embroidery",
  "Direct-to-Film": "dtf",
  "Direct-to-Garment": "dtg",
  "Heat-Transfer": "htv",
};
const METHOD_WORD = { screen: "Screen print", embroidery: "Embroidery", dtf: "DTF", dtg: "DTG", htv: "HTV" };
export const HTV_FULL = "Full color";
export const HTV_PLAIN = "Single color";
export const ETD_SKU = "PPETD";
export const MAX_LINES = 40;

/* ---------- sizes -> words, as reps write them on invoices today ("6 Medium", "10 Extra Large") ---------- */
const SIZE_WORDS = { XS: "Extra Small", S: "Small", M: "Medium", L: "Large", XL: "Extra Large" };
export const sizeWord = (s) => SIZE_WORDS[s] || SIZE_LABELS[s] || s;
const rank = (s) => RULES.sizeOrder.indexOf(s);

/* ---------- the price grids ---------- */
const inTier = (t, n) => n >= t[0] && (t[1] == null || n <= t[1]);
export function gridSku(method, row, count) {
  const g = GRID.grids;
  const pick = (rows, ok) => (rows || []).find((r) => ok(r) && inTier(r.tier, count));
  let hit = null;
  if (method === "screen") hit = pick(row.hoodie ? g.screenHoodie : g.screen, (r) => r.colors === row.colors);
  if (method === "embroidery") hit = pick(g.embroidery, (r) => r.band === row.band);
  if (method === "dtf") hit = pick(g.dtf, (r) => r.size === row.size);
  if (method === "dtg") hit = pick(g.dtg, (r) => r.size === row.size);
  if (method === "htv") hit = pick(g.htv, (r) => r.full === row.full && r.size === row.size);
  return hit ? hit.sku : "";
}
export function extraSku(method, row) {
  const e = GRID.extras;
  if (method === "screen") return row.hoodie ? e.screenHoodie : e.screen;
  if (method === "embroidery") return e.embroidery;
  if (method === "dtf") return e.dtf;
  if (method === "dtg") return row.size === "under5" ? e.dtgUnder5 : e.dtgOver5;
  if (method === "htv") return row.full ? e.htvFull : e.htvPlain;
  return "";
}

/* Print width (else height) in inches -> the size names each grid uses. */
function widthOf(p) {
  const w = parseInches(p && p.widthIn);
  if (w > 0) return w;
  const h = parseInches(p && p.heightIn);
  return h > 0 ? h : NaN;
}
const EMB_BAND = { Small: "small", Medium: "medium", Large: "large" };

/*
 * The grid row of one placement, or { why } when Books has no row for it. `row` also keys the line, so equal rows merge.
 */
export function placementRow(method, graphic, placement, kind) {
  const hoodie = canonicalKind(kind) === "Hoodie / Crew / Zip";
  const hat = ["Hat / Cap", "Beanie"].includes(canonicalKind(kind));
  if (method === "screen") {
    const colors = Math.max(1, int(graphic && graphic.numberOfColorsUsed));
    if (colors > 6) return { why: `${colors} colors: Books prices screen print up to 6 colors` };
    return { row: { hoodie, colors }, label: `${hoodie ? "hoodie, " : ""}${plural(colors, "color")}` };
  }
  if (method === "embroidery") {
    const size = hat ? "Small" : str(placement && placement.placementSize);
    const band = EMB_BAND[size];
    if (!band) return { why: "no placement size (Small / Medium / Large) to estimate the stitch count from" };
    return { row: { band }, label: `${size}${hat ? " (hat)" : ""}` };
  }
  const w = widthOf(placement);
  if (!(w > 0)) return { why: "no print width or height on the placement" };
  if (method === "dtf") return { row: { size: w < 5 ? "under5" : w <= 10 ? "5to10" : "over10" }, label: `${w}"` };
  if (method === "dtg") return { row: { size: w < 5 ? "under5" : "over5" }, label: `${w}"` };
  if (method === "htv") {
    const full = str(graphic && graphic.htvColorMode) === HTV_FULL;
    if (w > 15) return { why: `${w}" wide: Books prices HTV up to 15"` };
    return { row: { full, size: w < 5 ? "under5" : w <= 10 ? "5to10" : "10to15" }, label: `${full ? "full color, " : ""}${w}"` };
  }
  return { why: "no Books price grid for this method" };
}

/* ---------- garments: one line per Books band item per color ---------- */

/* The SKU rows of a garment type in families (one style's band items), smallest code first. */
function familiesOf(garmentSkus) {
  const fams = [];
  (garmentSkus || [])
    .filter((r) => r && str(r.sku).trim() && !isClientOwnedSku(r.sku))
    .forEach((r) => {
      const item = { sku: str(r.sku).trim().toUpperCase(), name: str(r.productName).trim(), source: str(r.productSource) };
      const key = item.name ? nameStem(item.name).toLowerCase() : item.sku;
      let f = fams.find((x) => x.key === key);
      if (!f) fams.push((f = { key, items: [] }));
      if (!f.items.some((i) => i.sku === item.sku)) f.items.push(item);
    });
  fams.forEach((f) => {
    f.codes = [...new Set(f.items.flatMap((i) => [i.sku, i.name ? familyBase(i) : i.sku]))];
  });
  return fams;
}

/* Which family a size line's style ("group") names. One family -> it. */
function familyFor(fams, group) {
  if (fams.length === 1) return fams[0];
  const hits = fams.filter((f) => f.codes.some((c) => hasCode(group, c)));
  return hits.length === 1 ? hits[0] : null;
}

/* The band item that covers a size (a youth size on an adult style is matched without its Y). */
function itemFor(fam, size) {
  const tries = [size, /^Y(XS|S|M|L|XL)$/.test(size) ? size.slice(1) : null].filter(Boolean);
  for (const t of tries) {
    const r = rank(t);
    const hit = fam.items.find((i) => {
      const b = bandOf(i.name);
      return b && r >= 0 && r >= b[0] && r <= b[1];
    });
    if (hit) return hit;
  }
  // An item whose name carries no band covers every size (OSFA, hats, a SKU typed without a name). A banded item never stretches.
  const unbanded = fam.items.filter((i) => !bandOf(i.name));
  return unbanded.length === 1 ? unbanded[0] : null;
}

const twinKey = (b) =>
  JSON.stringify([
    (b.garmentSkus || []).map((r) => str(r && r.sku).trim().toUpperCase()).filter(Boolean).sort(),
    parseSizeText(b.countColorSize).rows.map((r) => [r.group, r.color, r.size, r.count]),
  ]);

function garmentLines(products, handList) {
  const byKey = new Map(); // sku|color -> { sku, color, sizes: Map, quantity }
  // The same garments listed under a second method ("used with other application types: Yes" on either listing, same SKUs and
  // sizes) are billed once.
  const branches = (products || []).filter((p) => p && p.productType === "garment").flatMap((p) => (p.primaryBranches || []).filter(Boolean));
  const twinYes = new Set(branches.filter((b) => yes(b.isUsedInOtherAppTypes)).map(twinKey));
  const billed = new Set();
  (products || []).forEach((product) => {
    if (!product || product.productType !== "garment") return;
    (product.primaryBranches || []).forEach((b) => {
      if (!b) return;
      const what = firstLine(b.garmentType) || "garment type";
      if (isClientOwnedGarment(b)) return; // the client's own garments: no garment line (PPFEE8 carries them)
      const key = twinKey(b);
      if (twinYes.has(key) && (b.garmentSkus || []).length) {
        if (billed.has(key)) return;
        billed.add(key);
      }
      const qty = int(b.garmentQuantity);
      const { rows, unparsed } = parseSizeText(b.countColorSize);
      unparsed.forEach((t) => handList.push({ what: `${what}: "${t}"`, quantity: "", reason: "size line the form could not read" }));
      const fams = familiesOf(b.garmentSkus);
      if (!fams.length) {
        if (qty || rows.length) handList.push({ what, quantity: qty || rows.reduce((n, r) => n + r.count, 0), reason: "no Books SKU picked for this garment type" });
        return;
      }
      if (!rows.length) {
        if (qty) handList.push({ what, quantity: qty, reason: "no sizes entered, so the size items cannot be counted" });
        return;
      }
      rows.forEach((r) => {
        const count = Number(r.count) || 0;
        if (!count) return;
        const fam = familyFor(fams, r.group);
        const item = fam && itemFor(fam, r.size);
        if (!item) {
          handList.push({
            what: `${what}: ${[r.color, sizeWord(r.size)].filter(Boolean).join(" ")}`,
            quantity: count,
            reason: fam ? `no Books size item covers ${r.size}` : "the sizes do not say which style they are",
          });
          return;
        }
        const k = item.sku + "\u0000" + str(r.color);
        let line = byKey.get(k);
        if (!line) byKey.set(k, (line = { sku: item.sku, color: str(r.color), sizes: new Map(), quantity: 0 }));
        line.sizes.set(r.size, (line.sizes.get(r.size) || 0) + count);
        line.quantity += count;
      });
    });
  });
  return [...byKey.values()].map((l) => ({
    sku: l.sku,
    quantity: l.quantity,
    description: [l.color, [...l.sizes].map(([s, n]) => `${n} ${sizeWord(s)}`).join("\n")].filter(Boolean).join("\n\n"),
    group: "garment",
    clientQty: 0,
  }));
}

/*
 * The client-garment upcharge answer (E-101 / D-49, docs/06): the onboarding form keeps it on the PRODUCT
 * (products[].clientOwnedUpcharge + Percent); only the Amendment Form writes it per garment type. The garment's own answer wins.
 */
export function upchargeOf(product, branch) {
  const own = branch && branch.clientOwnedUpcharge != null && str(branch.clientOwnedUpcharge) !== "";
  const src = own ? branch : product || {};
  return { yes: yes(src.clientOwnedUpcharge), percent: Number(src.clientOwnedUpchargePercent) || CLIENT_OWNED.upchargePercent };
}

/* ---------- decoration: first placement per garment = grid line, every further placement = extra ---------- */

function placementsOf(graphic) {
  const rows = (graphic && graphic.tartiaryBranches) || [];
  const typed = parseInt(graphic && graphic.numberOfPlacements, 10);
  const n = Number.isFinite(typed) ? Math.max(0, typed) : rows.length; // printMath's rule (D-16)
  return Array.from({ length: n }, (_, j) => rows[j] || rows[0] || {});
}
const locationOf = (p) => locationText(p && p.placementPick, p && p.placementOther) || str(p && p.placementLocation).trim() || "Unnamed";

function decorationLines(products, handList, clientFee) {
  const groups = new Map(); // key -> { method, row, kind: first|extra, qty, clientQty, places: Map, label, percent }
  const decorated = {}; // method -> garments that get it (the tier count)
  const add = (key, base, qty, clientQty, loc, percent) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { ...base, qty: 0, clientQty: 0, places: new Map(), percents: [] }));
    g.qty += qty;
    g.clientQty += clientQty;
    g.places.set(loc, (g.places.get(loc) || 0) + qty);
    if (clientQty) g.percents.push({ clientQty, percent });
  };
  (products || []).forEach((product) => {
    if (!product || product.productType !== "garment") return;
    const method = METHODS[str(product.productName).trim()];
    (product.primaryBranches || []).forEach((b) => {
      if (!b) return;
      const what = firstLine(b.garmentType) || "garment type";
      const qty = int(b.garmentQuantity) || parseSizeText(b.countColorSize).rows.reduce((n, r) => n + (Number(r.count) || 0), 0);
      const graphics = (b.secondaryBranches || []).filter(Boolean);
      if (!qty || !graphics.length) return;
      if (!method) {
        handList.push({ what: `${str(product.productName)} on ${what}`, quantity: qty, reason: "no Books price grid for this method" });
        return;
      }
      const client = isClientOwnedGarment(b);
      const up = upchargeOf(product, b);
      const percent = client && up.yes ? up.percent : 0;
      const lumpedNo = str(b.everyGraphicOnEveryGarment) === "No";
      const covers = graphics.map((g) => (lumpedNo && int(g.garmentsWithThisGraphic) ? Math.min(qty, int(g.garmentsWithThisGraphic)) : qty));
      // Picked default (docs/63): graphics not on every garment go on different garments, so the garments decorated are
      // the smaller of the quantity and their sum.
      let left = lumpedNo ? Math.min(qty, covers.reduce((a, c) => a + c, 0)) : qty;
      decorated[method] = (decorated[method] || 0) + left;
      graphics.forEach((g, i) => {
        placementsOf(g).forEach((p, j) => {
          const firsts = j === 0 ? Math.min(covers[i], left) : 0;
          if (j === 0) left -= firsts;
          const extras = covers[i] - firsts;
          const r = placementRow(method, g, p, b.garmentKind);
          const loc = locationOf(p);
          if (r.why) {
            handList.push({ what: `${METHOD_WORD[method]}, ${loc} on ${what}`, quantity: covers[i], reason: r.why });
            return;
          }
          const cq = (n) => (client ? n : 0);
          if (firsts) add(`first|${method}|${JSON.stringify(r.row)}`, { method, row: r.row, kind: "first", label: r.label }, firsts, cq(firsts), loc, percent);
          if (extras) {
            const sku = extraSku(method, r.row);
            add(`extra|${sku}`, { method, row: r.row, kind: "extra", sku }, extras, cq(extras), loc, percent);
          }
        });
      });
    });
  });
  const lines = [];
  groups.forEach((g) => {
    const places = [...g.places].map(([loc, n]) => `${n} ${loc} Placement${n === 1 ? "" : "s"}`).join("\n");
    let sku = g.sku;
    if (g.kind === "first") {
      sku = gridSku(g.method, g.row, decorated[g.method]);
      if (!sku) {
        handList.push({
          what: `${METHOD_WORD[g.method]} (${g.label})`,
          quantity: g.qty,
          reason: `Books has no price for ${decorated[g.method]} pieces${g.row.hoodie ? " on hoodies (the hoodie grid starts at 12)" : ""}`,
        });
        return;
      }
    }
    const estimate = g.method === "embroidery" && g.kind === "first" ? "\nStitch count estimated from the placement size - the digitizer confirms it" : "";
    lines.push({ sku, quantity: g.qty, description: places + estimate, group: g.kind === "first" ? "decoration" : "extra", clientQty: g.clientQty });
    g.percents.forEach((p) => p.percent && clientFee.push({ sku, quantity: p.clientQty, percent: p.percent }));
  });
  return { lines, tiers: decorated };
}

/* ---------- gang sheets, other products, fees from form answers ---------- */

export function gangSheetLine(product) {
  const sheets = int(product && product.numberOfGangSheets) || 1;
  const w = parseInches(product && product.gangSheetWidth);
  const h = parseInches(product && product.gangSheetHeight);
  if (!(w > 0 && h > 0)) return { why: "no sheet width and length" };
  const feet = (h * sheets) / 12;
  const rows = [...GRID.grids.gangSheet].sort((a, b) => a.feet[0] - b.feet[0]);
  const row = rows.filter((r) => feet >= r.feet[0]).pop() || rows[0];
  return {
    line: {
      sku: row.sku,
      quantity: round2((w * h * sheets) / 144),
      description: `${plural(sheets, "Gang Sheet")} ${w} x ${h} inches`,
      group: "gangSheet",
      clientQty: 0,
    },
  };
}

function productLines(products, handList) {
  const lines = [];
  (products || []).forEach((p) => {
    if (!p) return;
    const name = str(p.productName).trim();
    if (p.productType === "gangsheet") {
      const g = gangSheetLine(p);
      if (g.line) lines.push(g.line);
      else handList.push({ what: name || "DTF Gang Sheet", quantity: int(p.numberOfGangSheets), reason: g.why });
    }
    if (p.productType === "nongarment") {
      const qty = int(p.quantityOrdered);
      const skus = (p.productSkus || []).map((r) => str(r && r.sku).trim().toUpperCase()).filter(Boolean);
      if (!qty) return;
      if (skus.length === 1) lines.push({ sku: skus[0], quantity: qty, description: name, group: "product", clientQty: 0 });
      else handList.push({ what: name, quantity: qty, reason: skus.length ? "several SKUs: the form does not say how many of each" : "no Books SKU picked" });
    }
    if (p.productType === "garment" && yes(p.premiumIronPass)) {
      const n = (p.primaryBranches || []).reduce((s, b) => s + int(b && b.garmentQuantity), 0);
      if (n) lines.push({ sku: GRID.fees.premiumIronPass, quantity: n, description: `Premium Iron Pass - ${name}`, group: "fee", clientQty: 0 });
    }
  });
  return lines;
}

export function flagsOf(data) {
  const d = data || {};
  const doc = str(d.billingDocument).toLowerCase();
  return {
    document: doc === "invoice" || doc === "estimate" ? doc : "",
    rush: d.hardDueDate === "Yes" && yes(d.upchargedForRushTurnaround),
    // David 10-20 (Books docs/39 §2 row 2): either option -> PPETD.
    extendedTurnaround: d.hardDueDate === "No" && (yes(d.addOneWeekToProductionTime) || yes(d.tenFourteenBusinessDayTurnaround)),
    payingByCard: d.payingByCard === "Yes",
  };
}

/* Lines with the same SKU and description merge (a fee picked twice, one color in two size sections). */
function merge(lines) {
  const out = [];
  lines.forEach((l) => {
    const same = out.find((o) => o.sku === l.sku && o.description === l.description && o.rate === l.rate);
    if (same) {
      same.quantity = round2(same.quantity + l.quantity);
      same.clientQty += l.clientQty || 0;
    } else out.push({ ...l });
  });
  return out.filter((l) => l.quantity > 0);
}

export function buildBillingLines(data) {
  const d = data || {};
  const handList = [];
  const clientFee = [];
  const products = d.products || [];
  const garments = garmentLines(products, handList);
  const { lines: deco, tiers } = decorationLines(products, handList, clientFee);
  const other = (d.otherCharges || [])
    .filter((c) => c && str(c.sku).trim() && Number(c.quantity) > 0)
    .map((c) => ({
      sku: str(c.sku).trim().toUpperCase(),
      quantity: round2(Number(c.quantity)),
      description: str(c.note).trim() || ((GRID.items[str(c.sku).trim().toUpperCase()] || {}).name || ""),
      group: "other",
      clientQty: 0,
    }));
  const fees = yes(d.roundUpForCharity) ? [{ sku: GRID.fees.roundUp, quantity: 1, description: "Faces Of Hope Round-Up Donation", group: "fee", clientQty: 0 }] : [];
  const lines = merge([...garments, ...deco, ...productLines(products, handList), ...other, ...fees]).filter(
    (l) => !GRID.fees.addedByZoho.includes(l.sku) // Zoho adds rush, extended turnaround and the card fee itself
  );
  return { lines, handList, clientFee, flags: flagsOf(d), tiers, clientGarments: clientGarmentText(products) };
}

/* "4 Grey Quarter Zips; 2 Nike Hoodies" -- the client's garments that carry the PPFEE8 upcharge. */
function clientGarmentText(products) {
  const parts = [];
  (products || []).forEach((p) =>
    ((p && p.primaryBranches) || []).forEach((b) => {
      if (b && isClientOwnedGarment(b) && upchargeOf(p, b).yes) {
        const t = `${int(b.garmentQuantity)} ${firstLine(b.garmentType)}`.trim();
        if (!parts.includes(t)) parts.push(t);
      }
    })
  );
  return parts.join("; ");
}

/*
 * With Books' answers ({ SKU: { item_id, rate } } from widget_books_items `search`): every line gets item_id + rate; a SKU Books does not
 * have moves to the hand list; PPFEE8 = the client garments' share of each decoration line × its rate × the percent.
 * `found` null = Books could not be asked: lines go without item_id / rate (Zoho looks them up) and PPFEE8 uses the grid's snapshot.
 */
export function priceLines(built, found) {
  const handList = [...built.handList];
  const rateOf = (sku) => {
    if (found) return found[sku] ? Number(found[sku].rate) || 0 : null;
    const snap = GRID.items[sku];
    return snap ? Number(snap.rate) || 0 : null;
  };
  const lines = [];
  built.lines.forEach((l) => {
    if (found && !found[l.sku]) {
      handList.push({ what: `${l.sku} ${firstLine(l.description)}`.trim(), quantity: l.quantity, reason: "not an active item in Books" });
      return;
    }
    lines.push(found ? { ...l, item_id: str(found[l.sku].item_id), rate: Number(found[l.sku].rate) || 0 } : { ...l });
  });
  const fee = round2(
    built.clientFee.reduce((s, c) => {
      const r = lines.some((l) => l.sku === c.sku) ? rateOf(c.sku) : 0;
      return s + (r || 0) * c.quantity * (c.percent / 100);
    }, 0)
  );
  if (fee > 0) {
    const sku = GRID.fees.clientGarment;
    const f = found && found[sku];
    if (found && !f) handList.push({ what: `${sku} client-provided garment fee`, quantity: 1, reason: "not an active item in Books" });
    else
      lines.push({
        sku,
        quantity: 1,
        rate: fee,
        ...(f ? { item_id: str(f.item_id) } : {}),
        description: `Client-provided garments: ${built.clientGarments || "see the order"}`,
        group: "fee",
        clientQty: 0,
      });
  }
  return { ...built, lines, handList, clientFeeAmount: fee };
}

/* Every SKU Books must be asked about (lines + PPFEE8 when it may be needed). */
export function skusToFind(built) {
  const s = new Set(built.lines.map((l) => l.sku));
  if (built.clientFee.length) s.add(GRID.fees.clientGarment);
  return [...s];
}

/* What widget_create_billing_draft takes (Deluge docs/43 §1). */
export function draftPayload(priced, { submittedBy = "", dryRun = false } = {}) {
  return {
    document: priced.flags.document,
    dry_run: !!dryRun,
    submitted_by: str(submittedBy),
    lines: priced.lines.map((l) => {
      const out = { sku: l.sku, quantity: l.quantity, description: l.description };
      if (l.item_id) out.item_id = l.item_id;
      if (l.rate != null && (l.item_id || l.sku === GRID.fees.clientGarment)) out.rate = l.rate;
      return out;
    }),
    rush: priced.flags.rush,
    extended_turnaround: priced.flags.extendedTurnaround,
    paying_by_card: priced.flags.payingByCard,
  };
}

/* Why no draft can be asked for, or "" when it can. */
export function cannotSend(priced) {
  if (!priced.flags.document) return "Invoice or Estimate? was not answered, so no draft was made.";
  if (!priced.lines.length) return "Nothing on this order has a Books price, so no draft was made. Make it in Books if one is needed.";
  if (priced.lines.length > MAX_LINES)
    return `This order has ${priced.lines.length} lines; the automatic draft takes at most ${MAX_LINES}. Please make the invoice in Books.`;
  return "";
}

export const itemName = (sku) => (GRID.items[sku] || {}).name || "";
export const snapshotRate = (sku) => (GRID.items[sku] || {}).rate;
