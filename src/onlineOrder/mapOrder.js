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
};

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
 * @returns { data, held: string[], notes: string[], due }
 */
export function inksoftToFormData(order, deal, profiles, styles, rules = RULES, productStyles = null) {
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
  for (const c of cards) {
    const key = `${c.ProductName}|${c.ProductStyleName}`;
    if (!artFor.has(key)) artFor.set(key, new Map());
    artFor.get(key).set(artBase(c.DesignName), String(c.SideInternalName || c.Side || '').toLowerCase());
    skuFor.set(c.ProductName, c.ProductSku);
    if (c.ProductId != null) pidFor.set(c.ProductName, String(c.ProductId));
  }

  // 3 · group lines that carry the same art into one garment entry, as staff do
  const groups = new Map();     // signature -> { arts: Map(art->side), styles: Map(code -> {label, rows}) , colors:Set }
  for (const l of lines) {
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
    const sig = [...arts.keys()].sort().join('+');
    if (!groups.has(sig)) groups.set(sig, { arts, styles: new Map(), colors: new Set() });
    const g = groups.get(sig);
    if (!g.styles.has(style.code)) g.styles.set(style.code, { label: `${style.code} ${style.name}`, vendor: style.vendor, kind: style.kind, rows: [] });
    g.styles.get(style.code).rows.push({ color: l.color, size: l.size, qty: l.qty });
    g.colors.add(l.color);
  }

  // 4 · each group -> a garment; its art -> graphics from the profiles
  const byProduct = new Map();  // form product -> primaryBranches[]
  for (const [, g] of groups) {
    const graphics = [];
    let product = null;
    const arts = [...g.arts].sort((a, b) => (SIDE_ORDER[a[1]] ?? 9) - (SIDE_ORDER[b[1]] ?? 9));
    for (const [art] of arts) {
      const p = profiles[art];
      if (!p) { held.push(`new design "${art}" -- no onboarding describes it yet`); continue; }
      const uncovered = [...g.colors].filter((c) => !p.colors.includes(c));
      if (uncovered.length) held.push(`"${art}" has only been described on ${p.colors.join(' / ')} garments, not ${uncovered.join(' / ')}`);
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

  // 5 · supplies: DTF is fixed; embroidery = the threads the graphics use
  const supplies = [];
  for (const p of products) {
    if (p.productName === 'Direct-to-Film') supplies.push(rules.dtfSupplies);
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
