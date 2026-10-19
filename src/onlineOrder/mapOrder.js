// (Moved from ~/Projects/inksoft-store/inksoft-zoho-sync/auto-onboard/map-order.mjs, 2026-10-15; owned here since -- docs/48.)
// InkSoft order -> the onboarding form's `data` object (M-14). Pure: no network, no Zoho.
//
// The output is what a person would have typed into the Deal Onboarding Form. It is handed, unchanged,
// to the form's own buildOnboardingNote() / buildProductionCards(), so the note, the 18 print fields,
// the JSON and the cards come from the SAME code as a human Submit.
//
// Three sources, in order of trust:
//   1. the order itself      -- who, what styles / colours / sizes, which art on which side, pickup/ship,
//                               the customer's "expected by" date
//   2. design profiles       -- what InkSoft does not know: inches, ink / thread colours, colour change,
//                               format. Built from onboardings staff already filled in (build-profiles.mjs)
//   3. fixed rules           -- owner rulings and the shop's constant answers (RULES below)
//
// It never guesses. Anything a profile does not cover -- an art file never described, or a garment
// colour the description was not written for -- is returned in `held`, and the caller must not submit.

export const RULES = {
  salesPerson: 'Korie Byrd',                        // owner, 2026-10-15: "Korie for now"
  howDidYouHear: 'Online Order',
  pickupLeadDays: 2,                                // owner, 2026-10-15: 1-2 days before pickup ...
  shipLeadDays: 6,                                  // ... 5-6 before with shipping; the earlier end, for buffer
  timeZone: 'America/Denver',
  // Answers staff give on every online-order onboarding seen so far (1000240/41/44/49).
  constants: {
    isRepeatOrder: 'No',
    customerConsentsToEmailAndText: 'Yes',
    roundUpForCharity: 'No',
    hardDueDate: 'Yes',
    typicalMockup: 'No',
    upchargedForRushTurnaround: false,
    detailLeadSource: '',
    discountsForExtendedTurnaround: '',
    addOneWeekToProductionTime: false,
    tenFourteenBusinessDayTurnaround: false,
  },
  dtfSupplies: 'DTF Powder\nDTF Ink\nDTF Film',
  stickerSupplies: 'Printable sticker vinyl\nDie-cut\nVinyl ink',  // Korie's 1000203 (D-46)
  // E-90 / D-47 (owner, 2026-10-19): the department for a design no staff onboarding describes on these garments, by
  // InkSoft StoreId. Shirts and sweaters -> DTG. Hats wait on the team (E-94): the main store embroiders hats by
  // default, Woman to Woman prints them DTF. A store not listed here keeps such designs for a person.
  designMethodByStore: {
    563840: { name: 'Woman to Woman', hat: 'Direct-to-Film', other: 'Direct-to-Garment' },
    432983: { name: 'The Print Plug', hat: null, other: 'Direct-to-Garment' },
  },
};

const HAT_KINDS = ['Hat / Cap', 'Beanie'];
const SEE_ART = 'See art file';

/** A garment colour InkSoft gives as hex ("1D1D1D") -> dark? null when unknown (D-45: DTG underbase by garment colour). */
export function isDark(hex) {
  const m = String(hex || '').replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

const SIDE_ORDER = { front: 0, back: 1, sleeveleft: 2, sleeveright: 3 };

/** InkSoft adds "-100044" to the copy of an art file it makes for another garment colour. */
export const artBase = (designName) => String(designName || '').replace(/-\d{5,}$/, '');

export function styleOf(sku, styles) {
  const s = String(sku || '').toUpperCase();
  const code = Object.keys(styles).filter((k) => !k.startsWith('_') && s.startsWith(k.toUpperCase()))
    .sort((a, b) => b.length - a.length)[0];
  return code ? { code, ...styles[code] } : null;
}

/** "BCA Short Sleeve T-Shirt - Navy - 4XL" -> { product, color, size } */
function splitFullName(fullName) {
  const parts = String(fullName || '').split(' - ');
  if (parts.length < 3) return { product: fullName, color: '', size: '' };
  return { product: parts.slice(0, -2).join(' - '), color: parts[parts.length - 2], size: parts[parts.length - 1] };
}

function denverDate(iso, tz) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
}
const ymd = (d) => d.toISOString().slice(0, 10);

/**
 * Midnight of that calendar day in the shop's time zone, as an ISO instant -- the shape the form's
 * date picker stores. ⚠️ A bare "2026-10-30" is NOT safe: the form's note code formats it with local
 * getters (onboardingNote.js customDate), and JS reads a bare date as UTC midnight, which is the
 * 29th in Mountain time. Measured 2026-10-15: the note printed 2026-10-29 for a due date of the 30th.
 */
export function zonedMidnightISO(ymdStr, tz = RULES.timeZone) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  for (const h of [5, 6, 7, 8]) {                    // Mountain is UTC-6 or UTC-7
    const t = new Date(Date.UTC(y, m - 1, d, h));
    const hour = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(t);
    if (Number(hour) === 0) return t.toISOString();
  }
  return `${ymdStr}T12:00:00.000Z`;                    // noon UTC is the same calendar day everywhere in the US
}
const longDate = (d) => d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });

/** Due date = the customer's expected-by date minus the lead days, never on a weekend. */
export function dueDateFor(summary, rules = RULES) {
  const expected = denverDate(summary?.EstimatedDeliveryDate_Max || summary?.EstimatedShipDate, rules.timeZone);
  if (!expected) return null;
  const pickup = isPickup(summary);
  const due = new Date(expected);
  due.setUTCDate(due.getUTCDate() - (pickup ? rules.pickupLeadDays : rules.shipLeadDays));
  while (due.getUTCDay() === 0 || due.getUTCDay() === 6) due.setUTCDate(due.getUTCDate() - 1);   // back to Friday
  return { expected: ymd(expected), expectedLong: longDate(expected), due: ymd(due), pickup };
}

export function isPickup(summary) {
  const v = `${summary?.ShippingVendorName || ''} ${summary?.ShippingMethodName || ''}`.toLowerCase();
  return /pick-?up/.test(v);
}

function countColorSize(styleRows) {
  // Korie's format: one style -> "Navy\n1- XL"; several -> a "CODE Name:" heading per style.
  const block = (rows) => {
    const byColor = new Map();
    for (const r of rows) {
      if (!byColor.has(r.color)) byColor.set(r.color, []);
      byColor.get(r.color).push(`${r.qty}- ${r.size}`);
    }
    return [...byColor].map(([c, lines]) => `${c}\n${lines.join('\n')}`).join('\n');
  };
  if (styleRows.length === 1) return block(styleRows[0].rows);
  return styleRows.map((s) => `${s.label}:\n${block(s.rows)}`).join('\n\n');
}

/**
 * @param order    { summary, package } as InkSoft returns them (GetOrderSummaries with cards, GetOrderPackage)
 * @param deal     { Deal_Name, Account_Name, Contact_Name } from the CRM Deal
 * @param profiles profiles.json   @param styles styles.json
 * @param productStyles  E-89: InkSoft ProductId -> style (productStyles.json + productStylesCarried.json). When given,
 *                       a product's style is looked up by its id ONLY -- the SKU-prefix rule (styleOf) is not used, and
 *                       a product not in the table is held. Without it (old callers, tests), the prefix rule applies.
 * @param nonGarments    E-90: InkSoft ProductId -> { product: "Stickers" } or { skip: "why" } (nonGarments.json).
 * @returns { data, held: string[], notes: string[], due }
 */
export function inksoftToFormData(order, deal, profiles, styles, rules = RULES, productStyles = null, nonGarments = null) {
  const s = order.summary || {};
  const pkg = order.package?.Orders?.[0] || order.package || {};
  const cards = s.ProductionCards || [];
  const held = [];
  const notes = [];

  if (!cards.length) held.push('InkSoft has not created production cards for this order yet -- nothing says which art goes where');

  // 1 · what was bought: product + colour -> sizes
  const lines = [];
  for (const it of pkg.Items || pkg.LineItems || []) {
    const n = splitFullName(it.FullName || it.Name);
    lines.push({ ...n, qty: Number(it.Quantity) || 1, productId: it.ProductId });
  }

  // 2 · which art goes on which product + colour, from the production cards
  const artFor = new Map();     // `${product}|${color}` -> Map(art -> side)
  const skuFor = new Map();     // product -> card ProductSku
  const pidFor = new Map();     // product -> card ProductId (E-89)
  const cardsFor = new Map();   // `${product}|${color}|${art}` -> every card (one per side) -- E-90 "see art file"
  const hexFor = new Map();     // `${product}|${color}` -> InkSoft's garment colour hex (D-45)
  for (const c of cards) {
    const key = `${c.ProductName}|${c.ProductStyleName}`;
    if (!artFor.has(key)) artFor.set(key, new Map());
    artFor.get(key).set(artBase(c.DesignName), String(c.SideInternalName || c.Side || '').toLowerCase());
    skuFor.set(c.ProductName, c.ProductSku);
    if (c.ProductId != null) pidFor.set(c.ProductName, String(c.ProductId));
    const ck = `${key}|${artBase(c.DesignName)}`;
    if (!cardsFor.has(ck)) cardsFor.set(ck, []);
    cardsFor.get(ck).push(c);
    if (c.ProductHtmlColor) hexFor.set(key, c.ProductHtmlColor);
  }
  const storeRule = rules.designMethodByStore?.[s.StoreId] || null;
  const stickerLines = [];

  // 3 · group lines that carry the same art into one garment entry, as staff do
  const groups = new Map();     // signature -> { arts: Map(art->side), styles: Map(code -> {label, rows}) , colors:Set }
  for (const l of lines) {
    // E-90: non-garments by InkSoft product -- USDOT decals / magnets are left to the team on purpose (D-44), die-cut
    // stickers onboard as Korie does them (D-46).
    const ng = nonGarments?.[String(l.productId ?? pidFor.get(l.product) ?? '')];
    if (ng?.skip) { held.push(`"${l.product}" is ${ng.skip} -- not onboarded automatically, by design (D-44); the team handles it as today`); continue; }
    if (ng?.product) { stickerLines.push({ ...l, ng }); continue; }
    const arts = artFor.get(`${l.product}|${l.color}`);
    if (!arts) { if (cards.length) held.push(`no production card for "${l.product}" in ${l.color}`); continue; }
    let style;
    if (productStyles) {
      // E-89 (InkSoft M-15): the product says its style; a store SKU is never read as one (8800BMACC… is not 8800).
      const pid = String(l.productId ?? pidFor.get(l.product) ?? '');
      const code = pid ? productStyles[pid] : undefined;
      if (!code) { held.push(`"${l.product}" (InkSoft product ${pid || '?'}) is not in the style table -- a person onboards it; re-run the M-15 pull if it is new`); continue; }
      if (!styles[code]) { held.push(`style ${code} of "${l.product}" is not in styles.json yet (its name / garment kind are not approved)`); continue; }
      style = { code, ...styles[code] };
    } else {
      style = styleOf(skuFor.get(l.product), styles);
      if (!style) { held.push(`style of "${l.product}" (SKU ${skuFor.get(l.product)}) is not in styles.json`); continue; }
    }
    // E-93: one garment entry per garment kind -- a hoodie and a tee carrying the same art are two garment types.
    const sig = [...arts.keys()].sort().join('+') + '#' + style.kind;
    if (!groups.has(sig)) groups.set(sig, { arts, styles: new Map(), colors: new Set(), keys: new Set(), kind: style.kind });
    const g = groups.get(sig);
    if (!g.styles.has(style.code)) g.styles.set(style.code, { label: `${style.code} ${style.name}`, vendor: style.vendor, kind: style.kind, rows: [] });
    g.styles.get(style.code).rows.push({ color: l.color, size: l.size, qty: l.qty });
    g.colors.add(l.color);
    g.keys.add(`${l.product}|${l.color}`);
  }

  // E-90: a graphic for an art no staff onboarding describes on these garments. Returns { product, graphic, from } or
  // { held }. The held messages for a store without a rule are the ones the robot always gave.
  function seeArtFile(art, g, variants) {
    const products = [...new Set(variants.map((v) => v.product))];
    const known = [...new Set(variants.flatMap((v) => v.colors))];
    const asBefore = variants.length
      ? `"${art}" has only been described on ${known.join(' / ')} garments, not ${[...g.colors].filter((c) => !known.includes(c)).join(' / ') || [...g.colors].join(' / ')}`
      : `new design "${art}" -- no onboarding describes it yet`;
    const hat = HAT_KINDS.includes(g.kind);
    let product = products.length === 1 ? products[0] : null;
    if (!product && products.length > 1) return { held: asBefore };
    if (!product) {
      if (!storeRule) return { held: asBefore };
      product = hat ? storeRule.hat : storeRule.other;
      if (!product) return { held: `"${art}" on a hat has no description yet -- ${storeRule.name} hats wait on the team's print-method rule (E-94)` };
    }
    const sideCards = [];
    for (const k of g.keys) for (const c of cardsFor.get(`${k}|${art}`) || []) {
      const where = c.RegionName || c.Side || '';
      if (!sideCards.some((x) => (x.RegionName || x.Side || '') === where)) sideCards.push(c);
    }
    let underbase = 'None';
    if (product === 'Direct-to-Garment') {                 // D-45: dark garments get a double-pass underbase
      const dark = [...g.keys].map((k) => isDark(hexFor.get(k)));
      if (dark.some((d) => d === null)) return { held: `"${art}": InkSoft gave no garment colour code -- a person sets the DTG underbase` };
      if (new Set(dark).size > 1) return { held: `"${art}": light and dark garments in one entry -- a person sets the DTG underbase` };
      underbase = dark[0] ? 'Double-pass' : 'None';
    }
    const customer = sideCards.some((c) => c.DesignType === 'Design');
    const what = customer ? `Customer's own design "${art}"`
      : variants.length ? `Store design "${art}", not yet described on ${[...g.colors].join(' / ')}`
      : `Store design "${art}", not yet described by staff`;
    return {
      product,
      from: customer ? 'customer design (see art file)' : 'store design not described on these colours (see art file)',
      graphic: {
        graphicDescription: `${what} -- see art file for print size and ink colors`,
        isGraphicPrintReady: false,
        currentGraphicFormat: SEE_ART,
        fineDetail: '',
        specialtyThread: false,
        upchargeAcknowledged: false,
        numberOfColorsUsed: SEE_ART,
        underbase,
        colorsUsed: SEE_ART,
        colorChange: 'No',
        detailsOfColorChange: '',
        fontsUsed: '',
        numberOfPlacements: String(sideCards.length),
        tartiaryBranches: sideCards.map((c) => ({ placementLocation: c.RegionName || c.Side || '', sizeAndDimensions: SEE_ART, placementSize: '' })),
      },
    };
  }

  // 4 · each group -> a garment; its art -> graphics from the profiles
  const byProduct = new Map();  // form product -> primaryBranches[]
  for (const [, g] of groups) {
    const graphics = [];
    let product = null;
    const arts = [...g.arts].sort((a, b) => (SIDE_ORDER[a[1]] ?? 9) - (SIDE_ORDER[b[1]] ?? 9));
    for (const [art] of arts) {
      const found = profiles[art];
      // E-79: an art may be described separately per set of garment colors (navy only; white + navy). Use the most
      // specific description that covers every color in this garment entry.
      const variants = found ? found.variants || [found] : [];
      const fits = variants.filter((v) => [...g.colors].every((c) => v.colors.includes(c)))
        .sort((a, b) => a.colors.length - b.colors.length);
      let p = fits[0];
      if (!p) {
        // E-90 (owner, 2026-10-19): no staff description covers these garments -> onboard anyway with "See art file"
        // for print size and ink colours, in the design's own department when it has one, else the store's rule.
        const a = seeArtFile(art, g, variants);
        if (a.held) { held.push(a.held); continue; }
        p = a;
      }
      if (product && product !== p.product) held.push(`one garment mixes ${product} and ${p.product} art`);
      product = product || p.product;
      graphics.push(JSON.parse(JSON.stringify(p.graphic))); // a copy; was structuredClone, which the test runner lacks (plain JSON, same result)
      notes.push(`"${art}": ${p.graphic.graphicDescription} (from the ${p.from})`);
    }
    const styleRows = [...g.styles.values()];
    const qty = styleRows.reduce((n, s) => n + s.rows.reduce((m, r) => m + r.qty, 0), 0);
    const kinds = [...new Set(styleRows.map((s) => s.kind))];
    if (kinds.length !== 1 || !kinds[0]) held.push(`garment kind unclear for ${styleRows.map((s) => s.label).join(' + ')}: ${kinds.join(' / ') || 'none in styles.json'}`);
    const garment = {
      garmentKind: kinds[0] || '',                 // required on the form since E-74 (2026-10-15)
      garmentType: styleRows.map((s) => s.label).join('\n'),
      countColorSize: countColorSize(styleRows),
      garmentQuantity: String(qty),
      numberOfSkus: String(styleRows.length),
      garmentSkus: styleRows.map((s) => ({ sku: s.label.split(' ')[0] })),
      numberOfGraphics: String(graphics.length),
      isUsedInOtherAppTypes: 'No',
      vendorsUsed: [...new Set(styleRows.map((s) => s.vendor))].join(', '),
      // The form's lumped-order question (LUMPED_FIELD, forms thread docs/47). "Yes" is PROVEN here, not
      // assumed: a garment entry only ever groups lines whose production cards carry the identical art set
      // (the `sig` above), so every graphic is on every garment in it.
      everyGraphicOnEveryGarment: 'Yes',
      specialInstructions: '',
      secondaryBranches: graphics,
    };
    if (!product) continue;
    if (!byProduct.has(product)) byProduct.set(product, []);
    byProduct.get(product).push(garment);
  }

  const products = [...byProduct].map(([productName, garments]) => ({
    productName, productType: 'garment', primaryBranches: garments,
    numberOfGarmentTypes: String(garments.length), otherInformation: '',
  }));

  // E-90 / D-46: die-cut stickers, as Korie onboarded 1000203 ("Custom Die-Cut Stickers - White - 2 x 2", 100).
  if (stickerLines.length) {
    const sizes = [...new Set(stickerLines.map((l) => l.size))];
    const m = sizes.length === 1 && String(sizes[0]).match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)$/i);
    if (!m) held.push(`stickers in ${sizes.length === 1 ? `a size not read as W x H ("${sizes[0]}")` : 'several sizes'} -- a person onboards them`);
    else {
      const qty = stickerLines.reduce((n, l) => n + l.qty, 0);
      const dims = `${m[1]}" by ${m[2]}"`;
      const arts = [...new Set(stickerLines.flatMap((l) => [...(artFor.get(`${l.product}|${l.color}`) || new Map()).keys()]))].filter(Boolean);
      const material = [...new Set(stickerLines.map((l) => l.color))].join(' / ');
      products.push({
        productName: stickerLines[0].ng.product, productType: 'nongarment',
        numberOfGraphics: '1', quantityOrdered: String(qty), dimensions: dims, numberOfSides: '1',
        specialInstructions: '', isOutsourced: false, vendorsUsed: 'In house', otherInformation: '',
        branches: [{
          graphicDescription: `${qty}- Die cut ${dims} stickers on ${material} -- customer art ${arts.map((a) => `"${a}"`).join(', ') || '(no file name)'}, see art file`,
          isGraphicPrintReady: false, numberOfColorsUsed: '1', colorsUsed: 'Full color printable vinyl',
          currentGraphicFormat: SEE_ART, upchargedAcknowledged: false, fontsUsed: 'NA',
        }],
      });
      notes.push(`stickers: ${qty} at ${dims} (D-46)`);
    }
  }

  // 5 · supplies: DTF is fixed; embroidery = the threads the graphics use
  const supplies = [];
  for (const p of products) {
    if (p.productName === 'Direct-to-Film') supplies.push(rules.dtfSupplies);
    if (p.productName === 'Stickers') supplies.push(rules.stickerSupplies);
    if (p.productName === 'Embroidery') {
      const threads = new Set();
      for (const g of p.primaryBranches) for (const gr of g.secondaryBranches)
        for (const t of String(gr.colorsUsed || '').split('\n')) if (t.trim()) threads.add(t.replace(/\s*\(Madeira Polyneon\)\s*/i, '').trim());
      supplies.push([...threads].join('\n'));
    }
  }

  // 6 · dates, shipping, contact
  const due = dueDateFor(s, rules);
  if (!due) held.push('InkSoft gave no expected pickup / delivery date');
  const ship = !isPickup(s);
  const addr = pkg.ShippingAddress;
  const phone = pkg.User?.Phone || pkg.BillingAddress?.Phone || '';
  if (ship && !addr) held.push('order ships but has no shipping address');
  if (pkg.Notes) notes.push(`customer's order note copied into Special Instructions`);

  const data = {
    contactInfo: {
      Account_Name: deal.Account_Name || `${s.FirstName || ''} ${s.LastName || ''}`.trim(),
      Contact_Name: deal.Contact_Name || `${s.FirstName || ''} ${s.LastName || ''}`.trim(),
      Contact_Phone: phone,
      Contact_Email: s.Email || '',
      Deal_Name: deal.Deal_Name || '',
      Sales_Person: rules.salesPerson,
    },
    howDidYouHearAboutUs: rules.howDidYouHear,
    suppliesMaterialsNeeded: supplies.join('\n'),
    specialInstructions: [
      due ? `Due for ${due.pickup ? 'PICK UP' : 'delivery'} by ${due.expectedLong} (InkSoft order ${s.ID})` : '',
      pkg.Notes ? `Customer note: ${pkg.Notes}` : '',
    ].filter(Boolean).join('\n'),
    doProductsNeedShipped: ship ? 'Yes' : 'No',
    shippingContactAddress: ship && addr
      ? [addr.FirstName && `${addr.FirstName} ${addr.LastName || ''}`.trim(), addr.Street1, addr.Street2,
         `${addr.City || ''}, ${addr.StateCode || addr.State || ''} ${addr.PostCode || addr.ZipCode || ''}`.trim()].filter(Boolean).join('\n')
      : '',
    otherShippingDetails: ship ? `${s.ShippingVendorName || ''} ${s.ShippingMethodName || ''}`.trim() : '',
    dueDate: due ? zonedMidnightISO(due.due, rules.timeZone) : '',
    ...rules.constants,
    products,
  };
  return { data, held: [...new Set(held)], notes, due };
}
