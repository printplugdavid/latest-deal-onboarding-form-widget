/*
 * noteToForm.js -- rebuilds an onboarding from the "DEAL ONBOARDING FORM" NOTE, for deals that have
 * no onboarding-form.json (E-34). ~2,659 older deals carry only the note.
 *
 * The line-reading core (toPlainText / field / splitSections) is COPIED from the revision form's
 * noteParser.js -- that form lives on its own branch (D-19), so it cannot be imported. It parses a
 * frozen text format; if a label changes in onboardingNote.js, change it in BOTH parsers.
 * This one reads MORE than the revision form's: it has to fill the onboarding form's fields, not
 * just cost a reprint. The round-trip test (note -> parse -> same print counts) is what keeps it
 * honest: noteToForm.test.js feeds buildOnboardingNote()'s own output back in.
 *
 * ⚠️ It is still LOSSY, and the save path is built around that (AmendmentApp, "carry" mode):
 *   - the amended note keeps the ORIGINAL note text verbatim under the What Changed block -- the
 *     parse is never used to regenerate a "complete" note;
 *   - print-count fields are only rewritten when the parse REPRODUCES the Deal's current counts.
 */
import { sumSizeCounts } from "../quantityCheck";
import { EXTRA_WEEK_QUESTION, OLD_DISCOUNT_QUESTION } from "../turnaround";

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
const GANGSHEET_PRODUCTS = ["DTF Gang Sheet"];
const STOREFRONT_PRODUCTS = ["Online StoreFront", "Online Storefront"];

// `known` is the org's own "Name#type" list when available -- the authority on a product's type.
function productTypeFor(name, known) {
  const n = String(name || "").trim();
  const hit = (known || []).find((o) => String(o).split("#")[0].trim() === n);
  if (hit) return String(hit).split("#")[1];
  if (GARMENT_PRODUCTS.includes(n)) return "garment";
  if (GRAPHIC_PRODUCTS.includes(n)) return "graphic";
  if (GANGSHEET_PRODUCTS.includes(n)) return "gangsheet";
  if (STOREFRONT_PRODUCTS.includes(n)) return "onlinestorefront";
  return "nongarment";
}

export function toPlainText(raw) {
  let t = String(raw || "");
  t = t.replace(/\r\n?/g, "\n");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/(p|div|li)>/gi, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = t
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
  return t;
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const DIVIDER = /^[ \t]*-{3,}[ \t]*$/;
// E-77: where a field's value ends. Every label the note builder writes (onboardingNote.js; a test keeps this
// list in step with it) ends a value. So does any other "Label: value" line, which keeps notes from older
// versions of the form reading as before. A bare line ending in a colon that is NOT one of ours -- the way staff
// head their own lines ("Navy Garment:", or E-57's style headings "PC78 Port & Company …:") -- is part of the
// value. It used to end it, which emptied Color Change details and cut sizes short on note-only Deals.
export const NOTE_LABELS = [
  "Made", // E-115: a product ordered in ("Made: Ordered in, ready to go")
  "Account Name",
  "Add 1 Week To Production Time?",
  "Add one week to turnaround time for an additional 5% off the invoice?", // E-133
  "Are There Any Custom Fields or Notes You Would Like on Your Page?",
  "Are Your Graphics Print-Ready?",
  "Areas They Would Like to Design",
  "Color Change?",
  "Colors Used",
  "Colors Used (Threads / PANTONES)",
  "Company Address for Storefront",
  "Contact Email",
  "Contact Email for Storefront",
  "Contact Name",
  "Contact Phone",
  "Contact Phone # for Storefront",
  "Current Graphic Format",
  "Custmer Acknowledged 24-48 Hour Mock-Up?",
  "Custom Product Titles",
  "Custom Product Titles for the Storefront?",
  "Customer Consents to Email and Text?",
  "Date Needed By",
  "Deal Name",
  "Design Assets Provided?",
  "Design Service Needed?",
  "Desired Graphic Application",
  "Detail Lead Source",
  "Dimensions",
  "Discounts for Extended Turnaround Time?",
  "Display Contact Info on the Storefront?",
  "Do Products Need Shipped?",
  "Do You Have a Desired Live Date?",
  "Do You Have any Banners or Graphics You Want Displayed on Your Website?",
  "Do You Want Your Products to Be Customizable?",
  "Does Customer Have A Hard Due Date?",
  "Due Date",
  "Estimated Design Hours",
  "Estimated Prints",
  "Fine Detail?",
  "Fonts Used",
  "Gang Sheet Size",
  "Garment Colors (what the transfers go on)",
  "Garment Type (Brand / Style)",
  "Graphic Description",
  "Graphic Size",
  "How Did You Hear About Us?",
  "How Many Per Sheet",
  "How Would You Like To Fulfill Orders?",
  "Is Graphic Print Ready?",
  "Is Outsourced?",
  "Is This Garment Used With Other Application Types?",
  "Is This a Repeat Order?",
  "Is the Header Banner Print-Ready?",
  "Is the Logo Print-Ready?",
  "Is the Storefront Temporary or Evergreen?",
  "Mark Up Products?",
  "Number Of Colors Used",
  "Number Of Placements",
  "Number of Colors Used",
  "Number of Gang Sheets",
  "Number of Garment Types",
  "Number of Graphics",
  "Number of Graphics on the Sheet",
  "Other Information",
  "Other Shipping Details",
  "Outsourced Products Ordered",
  "Percentage to Mark Up",
  "Placement Location",
  "Placement Size",
  "Please Choose Application Type",
  "Please List Special Fields",
  "Please Provide Details Of Color Change",
  "Please Provide Links",
  "Preferred Online Suffix",
  "Premium Iron Pass?",
  "Print Applications for Products",
  "Quantity Ordered",
  "Round up for Charity?",
  "SKU(s)",
  "Sales Person",
  "Selected Product Types",
  "Service Cost Acknowledged?",
  "Shipping Contact & Address",
  "Size by Garment Size",
  "Sizes & Dimensions",
  "Special Instructions",
  "Special Instructions / Considerations",
  "Specific Product Base Pricing",
  "Specific Products on Storefront",
  "Storefront End Date",
  "Storefront Live Date",
  "Supplies / Materials Needed",
  "Total Count, Colors & Sizes",
  "Total Garment Quantity",
  "Underbase Needed?",
  "Upcharge Acknowledged?",
  "Upcharge for Graphic Design?",
  "Upcharged For Rush Turnaround Time?",
  "Vendors Used",
  "Would You Like To Include Any Other Links On Your Storefront?"
];
const KNOWN_LABEL = new Set(NOTE_LABELS.map((l) => l.toLowerCase()));
const LABEL_WITH_VALUE = /^[ \t]*[^:\n]{1,70}:[ \t]/;
const BARE_LABEL = /^[ \t]*([^:\n]{1,70}):$/; // nothing after the colon, not even a space (the builder writes "Label: ")
const NEXT_LABEL = {
  test(line) {
    const bare = String(line).match(BARE_LABEL);
    if (bare) return KNOWN_LABEL.has(bare[1].trim().toLowerCase());
    if (LABEL_WITH_VALUE.test(line)) return true;
    const head = String(line).match(/^[ \t]*([^:\n]{1,70}):/);
    return !!head && KNOWN_LABEL.has(head[1].trim().toLowerCase());
  },
};

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
      if (DIVIDER.test(lines[j + 1] || "")) break;
      parts.push(lines[j]);
    }
    const v = parts.join("\n").trim();
    return v === "undefined" || v === "null" ? "" : v;
  }
  return "";
}

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

// Text up to the first nested section header, so a garment-level label is not read from a graphic.
const before = (body, word) => {
  const m = new RegExp("^[ \\t]*" + word + "[ \\t]+\\d+[ \\t]*:", "im").exec(body);
  return m ? body.slice(0, m.index) : body;
};
// ...and the tail AFTER the last nested section, where garment-level answers also sit.
// A Yes/No answer is its FIRST line. "Fine Detail?: Yes" is followed by a sentence longer than
// the 70-character label limit, which field() therefore reads as a continuation of the value.
const firstLine = (v) => String(v == null ? "" : v).split("\n")[0].trim();
const yes = (v) => /^(yes|true)$/i.test(firstLine(v));
const yesNo = (v) => (yes(v) ? "Yes" : /^(no|false)$/i.test(firstLine(v)) ? "No" : "");
const THREAD_LINE = /specialty thread:[ \t]*(yes|no|true|false)/i;
const list = (v) =>
  String(v || "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
const count = (arr) => (arr.length ? String(arr.length) : "");

/*
 * Returns { values, warnings }. `values` is shaped like the form's own data (what reset() takes).
 * `warnings` are plain sentences for the agent about what could not be read.
 */
export function parseNoteToForm(rawContent, knownProducts) {
  const text = toPlainText(rawContent);
  const warnings = [];
  if (!text.trim()) return { values: { products: [] }, warnings: ["The onboarding note is empty."] };

  // An already-amended note carries the original underneath the What Changed block.
  const contactAt = text.search(/^\s*CONTACT INFO\s*$/m);
  const body = contactAt > 0 ? text.slice(contactAt) : text;

  const pAt = body.search(/^\s*PRODUCT INFORMATION\s*$/m);
  const oAt = body.search(/^\s*OTHER INFORMATION\s*$/m);
  const sAt = body.search(/^\s*PRINT COUNT SUMMARY\s*$/m);
  const head = body.slice(0, pAt >= 0 ? pAt : body.length);
  const productText = body.slice(pAt >= 0 ? pAt : 0, oAt > pAt ? oAt : body.length);
  const other = oAt >= 0 ? body.slice(oAt, sAt > oAt ? sAt : body.length) : "";

  const values = {
    contactInfo: {
      Account_Name: field(head, "Account Name"),
      Contact_Name: field(head, "Contact Name"),
      Contact_Phone: field(head, "Contact Phone"),
      Contact_Email: field(head, "Contact Email"),
      Deal_Name: field(head, "Deal Name"),
      Sales_Person: field(head, "Sales Person"),
    },
    howDidYouHearAboutUs: field(other, "How Did You Hear About Us?"),
    detailLeadSource: field(other, "Detail Lead Source"),
    suppliesMaterialsNeeded: field(other, "Supplies / Materials Needed"),
    specialInstructions: field(other, "Special Instructions"),
    isRepeatOrder: field(other, "Is This a Repeat Order?"),
    doProductsNeedShipped: yesNo(field(other, "Do Products Need Shipped?")),
    shippingContactAddress: field(other, "Shipping Contact & Address"),
    otherShippingDetails: field(other, "Other Shipping Details"),
    customerConsentsToEmailAndText: field(other, "Customer Consents to Email and Text?"),
    roundUpForCharity: field(other, "Round up for Charity?"),
    hardDueDate: yesNo(field(other, "Does Customer Have A Hard Due Date?")),
    dueDate: field(other, "Due Date"),
    upchargedForRushTurnaround: yes(field(other, "Upcharged For Rush Turnaround Time?")),
    // E-133: the one question; a note from before 10-27 carries the old "Discounts …?" line instead (its Yes = the discount).
    discountsForExtendedTurnaround: yesNo(field(other, EXTRA_WEEK_QUESTION) || field(other, OLD_DISCOUNT_QUESTION)),
    addOneWeekToProductionTime: yes(field(other, "Add 1 Week To Production Time?")),
    tenFourteenBusinessDayTurnaround: yes(field(other, "10-14 Business Day Turnaround?")),
    typicalMockup: field(other, "Custmer Acknowledged 24-48 Hour Mock-Up?"),
    _source: "note",
  };

  values.products = splitSections(productText, "Product").map((p) => {
    const productName = p.rest.trim();
    const productType = productTypeFor(productName, knownProducts);
    const product = { productName, productType, _source: "note" };

    if (productType === "garment") {
      const garments = splitSections(p.body, "Garment");
      product.primaryBranches = garments.map((g, gi) => {
        const top = before(g.body, "Graphic");
        const graphics = splitSections(g.body, "Graphic");
        // Garment-level answers printed AFTER the graphics: read them from the whole garment body.
        const countColorSize = field(top, "Total Count, Colors & Sizes");
        let garmentQuantity = field(g.body, "Total Garment Quantity");
        if (!garmentQuantity) {
          // Notes before 2026-09-22 did not print the quantity; the size breakdown usually adds up to it.
          const { sum, parsed } = sumSizeCounts(countColorSize);
          if (parsed && sum > 0) garmentQuantity = String(sum);
          else warnings.push(`${productName} › Garment ${gi + 1}: no garment quantity in the note — enter it.`);
        }
        const skus = list(field(top, "SKU(s)")).map((sku) => ({ sku }));
        const used = yesNo(field(g.body, "Is This Garment Used With Other Application Types?"));
        return {
          garmentType: field(top, "Garment Type (Brand / Style)"),
          countColorSize,
          garmentQuantity,
          numberOfSkus: count(skus),
          garmentSkus: skus,
          numberOfGraphics: count(graphics),
          isUsedInOtherAppTypes: used,
          chooseApplicationType: used === "Yes" ? list(field(g.body, "Please Choose Application Type")) : undefined,
          vendorsUsed: field(g.body, "Vendors Used"),
          specialInstructions: field(g.body, "Special Instructions / Considerations"),
          secondaryBranches: graphics.map((gr) => {
            const gTop = before(gr.body, "Placement");
            const placements = splitSections(gr.body, "Placement");
            return {
              graphicDescription: field(gTop, "Graphic Description"),
              isGraphicPrintReady: yes(field(gTop, "Is Graphic Print Ready?")),
              currentGraphicFormat: firstLine(field(gTop, "Current Graphic Format")) || field(gTop, "Current Graphic Format"),
              fineDetail: yesNo(field(gTop, "Fine Detail?")),
              specialtyThread: yes((THREAD_LINE.exec(gTop) || [])[1]),
              upchargeAcknowledged: yes(field(gTop, "Upcharge Acknowledged?")),
              numberOfColorsUsed: field(gTop, "Number Of Colors Used"),
              underbase: field(gTop, "Underbase Needed?"),
              colorsUsed: field(gTop, "Colors Used (Threads / PANTONES)"),
              colorChange: yesNo(field(gTop, "Color Change?")),
              detailsOfColorChange: field(gTop, "Please Provide Details Of Color Change"),
              fontsUsed: field(gTop, "Fonts Used"),
              numberOfPlacements: count(placements),
              tartiaryBranches: placements.map((pl) => ({
                placementLocation: field(pl.body, "Placement Location"),
                sizeAndDimensions: field(pl.body, "Sizes & Dimensions"),
                placementSize: field(pl.body, "Placement Size"),
              })),
            };
          }),
        };
      });
      product.numberOfGarmentTypes = count(product.primaryBranches);
      const iron = yesNo(field(p.body, "Premium Iron Pass?"));
      if (iron) product.premiumIronPass = iron;
      // "Other Information" sits after the last garment.
      const tail = p.body.slice(p.body.lastIndexOf("Other Information:"));
      product.otherInformation = /^Other Information:/.test(tail) ? field(tail, "Other Information") : "";
    } else if (productType === "nongarment") {
      const top = before(p.body, "Graphic");
      const graphics = splitSections(p.body, "Graphic");
      product.quantityOrdered = field(top, "Quantity Ordered") || field(p.body, "Quantity Ordered");
      product.dimensions = field(top, "Dimensions") || field(p.body, "Dimensions");
      product.numberOfSides = field(p.body, "# Of Sides");
      product.isOutsourced = yes(field(p.body, "Is Outsourced?"));
      product.vendorsUsed = field(p.body, "Vendors Used");
      product.specialInstructions = field(p.body, "Special Instructions");
      product.otherInformation = field(p.body, "Other Information");
      product.numberOfGraphics = count(graphics);
      product.branches = graphics.map((gr) => ({
        graphicDescription: field(gr.body, "Graphic Description"),
        numberOfColorsUsed: field(gr.body, "Number of Colors Used"),
        colorsUsed: field(gr.body, "Colors Used"),
        currentGraphicFormat: field(gr.body, "Current Graphic Format"),
        fontsUsed: field(gr.body, "Fonts Used"),
      }));
    } else if (productType === "graphic") {
      product.dateNeededBy = field(p.body, "Date Needed By");
      product.estimatedDesignHours = field(p.body, "Estimated Design Hours");
      product.graphicDescription = field(p.body, "Graphic Description");
      product.specialInstructions = field(p.body, "Special Instructions");
      product.otherInformation = field(p.body, "Other Information");
    } else {
      // Gang sheets and storefronts: the note does not carry enough to rebuild their forms
      // (a gang sheet's geometry is printed as one "22 x 60" label, a storefront has ~30 answers).
      product.otherInformation = field(p.body, "Other Information");
      if (productType === "gangsheet") {
        // The same facts the revision form's own note parser keeps, under the same keys, so a JSON
        // written from this parse costs a gang-sheet reprint exactly as the note did.
        product.numberOfGangSheets = field(p.body, "Number of Gang Sheets");
        product.gangSheetSize = field(p.body, "Gang Sheet Size");
        product.numberOfGraphics =
          field(p.body, "Number of Graphics on the Sheet") || field(p.body, "Number of Graphics");
        const est = field(p.body, "Estimated Prints").match(/(\d+)\s*per sheet/i);
        if (est) product.estimatedPrintsPerSheet = est[1];
      }
      product._unparsed = true;
      warnings.push(
        `${productName}: this product type cannot be rebuilt from the note. It is kept exactly as it was — ` +
          "describe any change to it in your own words."
      );
    }
    return product;
  });

  if (!values.products.length) warnings.push("No products could be read from the onboarding note.");
  return { values, warnings };
}
