/*
 * noteParser.js -- reconstructs the product tree from a "DEAL ONBOARDING FORM"
 * note, for deals onboarded before the JSON payload existed.
 *
 * 2,659 deals carry this note; only a handful carry onboarding-form.json. This
 * is what makes the revision form usable on the back catalogue.
 *
 * The note omits garmentQuantity -- and that does not matter here. A revision's
 * quantity is the number of garments being redone, which the agent types. The
 * original order quantity is never used by the calculation.
 *
 * Note formatting is NOT consistent: some notes come back as plain text with
 * real newlines, others as HTML with <br>, escaped entities, and email
 * addresses auto-wrapped in <a> tags. Both are handled.
 */

// From the CRM org variable "products". Type is not recorded in the note, so it
// is derived from the name -- the same split the onboarding form uses.
const GARMENT_PRODUCTS = [
  "Screen Printing",
  "Embroidery",
  "Direct-to-Garment",
  "Direct-to-Film",
  "Heat-Transfer",
  "Pressed Patches",
  "Vinyl",
];
const GRAPHIC_PRODUCTS = ["Graphic Design"];
const STOREFRONT_PRODUCTS = ["Online StoreFront"];

function productTypeFor(name) {
  const n = String(name || "").trim();
  if (GARMENT_PRODUCTS.includes(n)) return "garment";
  if (GRAPHIC_PRODUCTS.includes(n)) return "graphic";
  if (STOREFRONT_PRODUCTS.includes(n)) return "onlinestorefront";
  return "nongarment";
}

export function toPlainText(raw) {
  let t = String(raw || "");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/(p|div|li)>/gi, "\n");
  t = t.replace(/<[^>]+>/g, ""); // strips <a href=...> wrappers, keeps their text
  t = t
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&"); // last, so &amp;lt; does not double-decode
  return t;
}

const splitList = (v) =>
  String(v || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/*
 * Checkbox fields switched from `true`/`false` to `Yes`/`No` in the note on
 * 2026-09-01, so the catalogue carries both. Normalise on read -- any later
 * `=== "true"` would work on old deals and silently fail on new ones.
 */
export function yesNo(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  if (s === "yes" || s === "true") return "Yes";
  if (s === "no" || s === "false") return "No";
  return "";
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DIVIDER = /^[ \t]*-{3,}[ \t]*$/;
/*
 * A line that starts a new field: some text, then a colon followed by a space
 * or end-of-line. Requiring the space is what stops a value like `2.5" at 2:30`
 * from being mistaken for a label.
 */
const NEXT_LABEL = /^[ \t]*[^:\n]{1,70}:(?:[ \t]|$)/;

/*
 * Value of a "Label: value" field. Returns "" when absent.
 *
 * Values are frequently MULTI-LINE: agents type into textareas, and when their
 * text begins with a newline the note reads
 *
 *     Garment Type (Brand / Style):
 *     Client Owned Infant Hat
 *     1- White
 *
 * so an end-of-line capture returns "" and the garment loses its label. Read
 * on until the next field, a divider, or a section heading (headings are always
 * the line directly above a divider).
 */
function field(block, label) {
  const lines = String(block || "").split("\n");
  const head = new RegExp("^[ \\t]*" + escapeRe(label) + "[ \\t]*:[ \\t]*(.*)$", "i");

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(head);
    if (!m) continue;

    const parts = [m[1]];
    for (let j = i + 1; j < lines.length; j++) {
      if (DIVIDER.test(lines[j])) break;
      if (NEXT_LABEL.test(lines[j])) break;
      if (DIVIDER.test(lines[j + 1] || "")) break; // a heading sitting above its rule
      parts.push(lines[j]);
    }

    const v = parts.join("\n").trim();
    return v === "undefined" || v === "null" ? "" : v;
  }
  return "";
}

/*
 * Slice a block into sections introduced by a numbered header, e.g.
 * "Garment 1:" / "Graphic 2:" / "Product 1: Screen Printing".
 * Returns [{ n, rest, body }] in document order.
 */
function splitSections(text, word) {
  const re = new RegExp("^[ \\t]*" + word + "[ \\t]+(\\d+)[ \\t]*:[ \\t]*(.*)$", "gim");
  const marks = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    marks.push({ n: parseInt(m[1], 10), rest: (m[2] || "").trim(), start: m.index, end: re.lastIndex });
  }
  return marks.map((mark, i) => ({
    n: mark.n,
    rest: mark.rest,
    body: text.slice(mark.end, i + 1 < marks.length ? marks[i + 1].start : text.length),
  }));
}

/*
 * Returns a products[] array shaped like the JSON payload's, so the same
 * calculation and the same UI work against either source.
 */
export function parseOnboardingNote(rawContent) {
  const text = toPlainText(rawContent);
  if (!text.trim()) return [];

  // Bound to the product section so "OTHER INFORMATION" and the print-count
  // summary cannot be mistaken for product data.
  const startIdx = text.search(/^\s*PRODUCT INFORMATION\s*$/m);
  const endIdx = text.search(/^\s*OTHER INFORMATION\s*$/m);
  const section = text.slice(
    startIdx >= 0 ? startIdx : 0,
    endIdx > (startIdx >= 0 ? startIdx : 0) ? endIdx : text.length
  );

  return splitSections(section, "Product").map((p) => {
    const productName = p.rest.trim();
    const productType = productTypeFor(productName);

    const product = {
      productName,
      productType,
      numberOfGarmentTypes: field(p.body, "Number of Garment Types"),
      // Relabelled 2026-09-01 on non-garment/graphic products; older deals of
      // those types carry the same text under "Special Instructions".
      otherInformation:
        field(p.body, "Other Information") || field(p.body, "Special Instructions"),
      _source: "note",
    };

    const iron = field(p.body, "Premium Iron Pass?");
    if (iron) product.premiumIronPass = iron;

    if (productType === "garment") {
      product.primaryBranches = splitSections(p.body, "Garment").map((g) => ({
        garmentType: field(g.body, "Garment Type (Brand / Style)"),
        countColorSize: field(g.body, "Total Count, Colors & Sizes"),
        numberOfGraphics: field(g.body, "Number of Graphics"),
        // Added to the note 2026-09-01. Shaped like the JSON payload's key so a
        // note-sourced deal and a JSON-sourced one look the same to consumers.
        garmentSkus: splitList(field(g.body, "SKU(s)")).map((sku) => ({ sku })),
        // Not recorded in the note. The agent supplies the affected count, and
        // the calculation overrides this anyway.
        garmentQuantity: "",
        vendorsUsed: field(g.body, "Vendors Used"),
        specialInstructions: field(g.body, "Special Instructions / Considerations"),
        secondaryBranches: splitSections(g.body, "Graphic").map((gr) => ({
          graphicDescription: field(gr.body, "Graphic Description"),
          currentGraphicFormat: field(gr.body, "Current Graphic Format"),
          numberOfColorsUsed: field(gr.body, "Number Of Colors Used"),
          underbase: field(gr.body, "Underbase Needed?"),
          colorsUsed: field(gr.body, "Colors Used (Threads / PANTONES)"),
          fontsUsed: field(gr.body, "Fonts Used"),
          numberOfPlacements: field(gr.body, "Number Of Placements"),
          tartiaryBranches: splitSections(gr.body, "Placement").map((pl) => ({
            placementLocation: field(pl.body, "Placement Location"),
            sizeAndDimensions: field(pl.body, "Sizes & Dimensions"),
            placementSize: field(pl.body, "Placement Size"),
          })),
        })),
      }));
    } else if (productType === "nongarment") {
      product.quantityOrdered = field(p.body, "Quantity Ordered");
      product.dimensions = field(p.body, "Dimensions");
      product.numberOfSides = field(p.body, "# Of Sides");
      product.isOutsourced = yesNo(field(p.body, "Is Outsourced?"));
      product.vendorsUsed = field(p.body, "Vendors Used");
      product.branches = splitSections(p.body, "Graphic").map((gr) => ({
        graphicDescription: field(gr.body, "Graphic Description"),
        numberOfColorsUsed: field(gr.body, "Number of Colors Used"),
        colorsUsed: field(gr.body, "Colors Used"),
        currentGraphicFormat: field(gr.body, "Current Graphic Format"),
        fontsUsed: field(gr.body, "Fonts Used"),
      }));
    }

    return product;
  });
}
