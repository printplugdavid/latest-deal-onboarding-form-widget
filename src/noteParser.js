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

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* Value of a "Label: value" line inside a block. Returns "" when absent. */
function field(block, label) {
  const m = block.match(new RegExp("^[ \\t]*" + escapeRe(label) + "[ \\t]*:[ \\t]*(.*)$", "mi"));
  if (!m) return "";
  const v = m[1].trim();
  return v === "undefined" || v === "null" ? "" : v;
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
      otherInformation: field(p.body, "Other Information"),
      _source: "note",
    };

    const iron = field(p.body, "Premium Iron Pass?");
    if (iron) product.premiumIronPass = iron;

    if (productType === "garment") {
      product.primaryBranches = splitSections(p.body, "Garment").map((g) => ({
        garmentType: field(g.body, "Garment Type (Brand / Style)"),
        countColorSize: field(g.body, "Total Count, Colors & Sizes"),
        numberOfGraphics: field(g.body, "Number of Graphics"),
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
      product.isOutsourced = field(p.body, "Is Outsourced?");
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
