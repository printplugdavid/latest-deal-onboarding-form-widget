/*
 * graphicUpload.js -- E-162 (D-77, David 10-29): every graphic is uploaded through one step that NAMES the file and files it in the
 * Deal's WorkDrive. Piloted on the Production Cards' Graphic Design tab; the same step goes to onboarding, Amendment and revision later.
 *
 *   name   = PO_DEPARTMENT_GARMENT_PLACEMENT_FORMAT_vN.ext      e.g. 4523_EMB_K500-Navy_Left-Chest_DST_v1.dst
 *            parts are picked (never typed); underscores between parts, dashes inside a part; the version is worked out by the
 *            Deluge function's dry run (highest vN in the folder AND Rejected, + 1).
 *   folder = print-ready (VECTOR / PNG / DST) for SP / EMB / VIN -> Department Folders/<dept>; MOCKUP -> Mockups (the client's
 *            link); ORIGINAL (client art, renamed too) -> Art Assets; everything else (GD, OUT, PROOF, OTHER) -> Graphic Design.
 *   a new version moves the older one(s) of the same stem into the Deal's Rejected folder (Deluge; never deleted).
 *
 * The WorkDrive side is Deluge's WIDGET_Upload_Graphics (REST widget_upload_graphics, their docs/57): a dry run per upload, then one
 * real call per file with the note id. Pure: no React, no ZOHO. Tested in graphicUpload.test.js.
 */
import { locationsFor, OTHER } from "../placements";
import { parseSizeText } from "../sizeRows";
import { cardRouteOf } from "../productionCards";
import PRODUCTION_CONFIG from "./productionConfig.json";

const str = (v) => (v == null ? "" : String(v));

export const UPLOAD_FUNCTION = "widget_upload_graphics";
export const UPLOAD_NOTE_TITLE = "GRAPHIC UPLOAD";

export const UPLOAD_DEPARTMENTS = [
  { code: "SP", label: "Screen Print", folder: "dept:Screen Printing" },
  { code: "EMB", label: "Embroidery", folder: "dept:Embroidery" },
  { code: "VIN", label: "Vinyl", folder: "dept:Vinyl Department" },
  { code: "OUT", label: "Outsourced", folder: "graphic_design" },
  { code: "GD", label: "Graphic Design", folder: "graphic_design" },
];
export const UPLOAD_FORMATS = [
  { code: "VECTOR", label: "Vector (AI, EPS, SVG, PDF)", printReady: true },
  { code: "PNG", label: "PNG (print file)", printReady: true },
  { code: "DST", label: "DST (embroidery file)", printReady: true },
  { code: "MOCKUP", label: "Mock-up" },
  { code: "PROOF", label: "Proof" },
  { code: "ORIGINAL", label: "Original (as the client gave it)" },
  { code: "OTHER", label: "Other" },
];
export const FOLDER_LABELS = {
  "dept:Screen Printing": "Department Folders / Screen Printing",
  "dept:Embroidery": "Department Folders / Embroidery",
  "dept:Vinyl Department": "Department Folders / Vinyl Department",
  graphic_design: "Graphic Design",
  mockups: "Mockups (the client's link)",
  art_assets: "Art Assets",
};

/* One part of the name: letters and numbers, every other run of characters -> one dash. */
export const namePart = (v) =>
  str(v)
    .replace(/&/g, " and ")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export const extOf = (fileName) => {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(str(fileName).trim());
  return m ? m[1].toLowerCase() : "";
};

/* The Deal's PO (online orders: E259); none -> NOPO, so the name still sorts and the gap is visible. */
export const poPart = (deal) => namePart(deal && deal.PO_Number) || "NOPO";

export function folderFor(dept, format) {
  if (format === "MOCKUP") return "mockups";
  if (format === "ORIGINAL") return "art_assets";
  const d = UPLOAD_DEPARTMENTS.find((x) => x.code === dept);
  const f = UPLOAD_FORMATS.find((x) => x.code === format);
  if (d && f && f.printReady && d.folder.startsWith("dept:")) return d.folder;
  return "graphic_design";
}

/*
 * D-79 (David 10-30, "Yes, use it"): a client-provided file (format ORIGINAL) is named PO_ORIGINAL_ARTNAME (e.g. 4523_ORIGINAL_Company-
 * Logo) -- no department, garment or placement: client art is not yet one use, and one file can serve several graphics ("Also used by").
 * ARTNAME = the graphic's typed description, shortened. Every other format keeps PO_DEPARTMENT_GARMENT_PLACEMENT_FORMAT.
 */
export const stemFor = ({ po, dept, garment, placement, format, artName }) =>
  format === "ORIGINAL"
    ? [po, "ORIGINAL", namePart(artName) || "Graphic"].map(namePart).join("_")
    : [po, dept, garment, placement, format].map(namePart).join("_");
/* The art name for a client file: the graphic's description (shortened to 4 words), else "Graphic-<n>" from its label. */
export const artNameFor = (description, label) => {
  const words = str(description).replace(/[^A-Za-z0-9& ]+/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (words.length) return namePart(words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" "));
  const n = /Graphic (\d+)$/.exec(str(label).trim()) || /Graphic (\d+)/.exec(str(label));
  return "Graphic-" + (n ? n[1] : "1");
};
export const fileName = (stem, version, ext) => `${stem}_v${Number(version) || 1}${ext ? "." + ext : ""}`;
/* Every part chosen? (the PO always is) */
export const partsReady = (p) => !!(p && p.format && (p.format === "ORIGINAL" ? namePart(p.artName) : p.dept && p.garment && p.placement));
/*
 * E-177 (David 10-30): "Other" asks what kind of file it is; the answer goes on the upload note (its own line, "  other file type: ..."),
 * so the common ones can be added to the list later. The file name keeps OTHER and the folder rules do not change.
 */
export const otherTyped = (p) => String((p && p.otherWhat) || "").replace(/\s+/g, " ").trim().slice(0, 60);
export const otherReady = (p, on) => !on || !p || p.format !== "OTHER" || otherTyped(p).length >= 2;

/* The garments / items of the order, for the Garment picker: ALL first, then each style + color, then each non-garment item. */
export function garmentOptions(data) {
  const out = [{ value: "ALL", label: "All (the whole order)" }];
  const seen = new Set(["ALL"]);
  const add = (value, label, kind) => {
    const v = namePart(value);
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push({ value: v, label, kind: kind || "" });
  };
  ((data && data.products) || []).forEach((p) => {
    if (!p) return;
    if (p.productType === "garment")
      (p.primaryBranches || []).forEach((b) => {
        if (!b) return;
        const type = str(b.garmentType).split("\n")[0].trim();
        const sku = str(((b.garmentSkus || []).find((r) => r && str(r.sku).trim()) || {}).sku).trim();
        const style = sku || type; // no garment typed yet -> only ALL (never the product name: "Embroidery" is not a garment)
        if (!style) return;
        const colors = [...new Set(parseSizeText(b.countColorSize).rows.map((r) => str(r.color).trim()).filter(Boolean))];
        if (!colors.length) add(style, type || style, b.garmentKind);
        colors.forEach((c) => add(`${style}-${c}`, `${type || style} - ${c}`, b.garmentKind));
      });
    else if (p.productName) add(p.productName, str(p.productName));
  });
  return out;
}

/*
 * The Placement picker: the order's own placements first (what the graphics on that garment actually use), then the form's
 * standard list for that garment's kind (E-74, the same list the onboarding form offers), then "Whole item (no placement)".
 */
export function placementOptions(data, garmentValue) {
  const kindOf = garmentOptions(data).find((o) => o.value === garmentValue);
  const fromOrder = [];
  ((data && data.products) || []).forEach((p) =>
    ((p && p.primaryBranches) || []).forEach((b) =>
      ((b && b.secondaryBranches) || []).forEach((g) =>
        ((g && g.tartiaryBranches) || []).forEach((t) => {
          const loc = str(t && t.placementLocation).trim();
          if (loc && !fromOrder.includes(loc)) fromOrder.push(loc);
        })
      )
    )
  );
  const standard = locationsFor(kindOf ? kindOf.kind : "").filter((l) => l !== OTHER && !fromOrder.includes(l));
  const out = [];
  const seen = new Set();
  [...fromOrder.map((l) => ({ l, from: "order" })), ...standard.map((l) => ({ l, from: "standard" })), { l: "Whole item", from: "none" }].forEach(
    ({ l, from }) => {
      const v = namePart(l);
      if (v && !seen.has(v)) {
        seen.add(v);
        out.push({ value: v, label: from === "none" ? "Whole item (no placement)" : l, fromOrder: from === "order" });
      }
    }
  );
  return out;
}

/* ---------- Graphic Design tasks ---------- */
const englishHalf = (subject) =>
  str(subject).split(" / ")[0].trim().toUpperCase().replace(/^RUSH:\s*/, "");
export const isDesignTask = (subject) => /^GRAPHIC DESIGN:/.test(englishHalf(subject));
const VINYL_JOBS = ["DTF", "DTG", "HTV", "PATCHES", "DECALS", "STICKERS", "MAGNETS", "BANNERS", "POSTERS", "VINYL", "DTF GANG SHEET"];
/* The upload department a design task is for: "GRAPHIC DESIGN: EMBROIDERY: Artwork & Mock-Up" -> EMB; no department -> "". */
export function deptOfDesignTask(subject) {
  const parts = englishHalf(subject).split(":").map((s) => s.trim());
  if (parts[0] !== "GRAPHIC DESIGN" || parts.length < 3) return "";
  const d = parts[1];
  if (/^SCREEN PRINT/.test(d)) return "SP";
  if (d === "EMBROIDERY") return "EMB";
  if (d === "OUTSOURCED") return "OUT";
  if (VINYL_JOBS.includes(d)) return "VIN";
  return "";
}

/* ---------- calls ---------- */
export const dryRunPayload = ({ files, who, source }) => ({
  dry_run: "true",
  submitted_by: str(who),
  source: str(source) || "cards",
  files: files.map((f) => ({ name: f.name, stem: f.stem, ext: f.ext, folder: f.folder })),
});
export const realPayload = ({ file, noteId, who }) => ({
  dry_run: "false",
  submitted_by: str(who),
  source: "cards",
  note_id: str(noteId),
  files: [{ name: file.name, stem: file.stem, ext: file.ext, folder: file.folder }],
});
export const callArguments = (dealId, payload) => ({ arguments: JSON.stringify({ deal_id: str(dealId), payload: JSON.stringify(payload) }) });

/* The function's reply in one shape (details.output is a JSON string); never throws. */
export function readUploadAnswer(response) {
  try {
    const raw = response && response.details ? response.details.output : response && response.output;
    const out = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!out || typeof out !== "object") return { status: "unavailable", result: "", files: [] };
    return {
      status: str(out.status) || "unavailable",
      result: str(out.result),
      message: str(out.message),
      files: Array.isArray(out.files) ? out.files : [],
      created: Array.isArray(out.created_folders) ? out.created_folders : [],
    };
  } catch (e) {
    return { status: "unavailable", result: "", files: [] };
  }
}
/* From a dry run: the next version for a stem (1 when the answer does not say) and the files that would move to Rejected. */
export function versionFrom(answer, stem) {
  const hit = ((answer && answer.files) || []).find((f) => f && (str(f.stem) === stem || str(f.name).startsWith(stem + "_v")));
  return {
    version: hit && Number(hit.next_version) > 0 ? Number(hit.next_version) : 1,
    wouldMove: hit && Array.isArray(hit.would_move) ? hit.would_move.map(str) : [],
  };
}

/* Deluge docs/58 §6 (10-30): the form keeps ONLY the dry run; filing (and its retries) runs in the CRM right after (instant rule, docs/58 §11). */
export const FILING_FIELD = "Graphics_Filing";
export const filingOn = (config) => !!config && config.graphicFilingOn === true;

/* ---------- E-170 (D-78): one upload per graphic, linked to that graphic ---------- */
/* A graphic's permanent id, saved in the order the first time the graphic is shown ("G" + 6 letters / digits). */
export const newGraphicId = () => "G" + (Date.now().toString(36).slice(-3) + Math.random().toString(36).slice(2, 5)).toUpperCase();

/* The upload department for a product: the card it lands on (same routing as the cards); answered outsourced -> OUT. */
export function deptForProduct(p) {
  if (!p) return "";
  if (p.isOutsourced === true || /^yes$/i.test(str(p.isOutsourced).trim())) return "OUT";
  const card = (cardRouteOf(p) || {}).card;
  return { screenprint: "SP", embroidery: "EMB", vinyl: "VIN", outsourced: "OUT" }[card] || "GD";
}

/* The products / garment / graphic a form path points at: "products.0.primaryBranches.1.secondaryBranches.2" or "products.3.branches.0". */
/*
 * A graphic's name on screen and on the upload notes. Small follow-up (David 10-30, "Yes, do that next"): it names the product and the
 * garment ("Embroidery: Nike Polo NKDC1963 - Graphic 1"), because "Garment 1 - Graphic 1" repeated across products. Brackets and ";"
 * are left out: the upload note's "(graphic KEY: label; ...)" part is read back up to the first ")". Switch graphicLabelsOn; off = as before.
 */
let namedLabels = PRODUCTION_CONFIG.graphicLabelsOn === true; // tests flip it with setNamedGraphicLabels
export const setNamedGraphicLabels = (on) => {
  namedLabels = on === true;
};
const labelSafe = (v) => str(v).replace(/[();]/g, " ").replace(/\s+/g, " ").trim();
const shortName = (v, n) => (v.length > n ? v.slice(0, n - 1).trim() + "…" : v);
export function graphicLabel(product, branch, gi, si) {
  if (!namedLabels) return `Garment ${gi + 1} - Graphic ${si + 1}`;
  const kind = labelSafe(product && product.productName);
  const garment = shortName(labelSafe(str(branch && branch.garmentType).split("\n")[0]), 40) || `Garment ${gi + 1}`;
  return `${kind ? kind + ": " : ""}${garment} - Graphic ${si + 1}`;
}
export function graphicAt(products, base) {
  const m = /^products\.(\d+)\.(?:primaryBranches\.(\d+)\.secondaryBranches\.(\d+)|branches\.(\d+))$/.exec(str(base));
  if (!m) return null;
  const pi = Number(m[1]);
  const product = (products || [])[pi];
  if (!product) return null;
  if (m[2] != null) {
    const gi = Number(m[2]);
    const si = Number(m[3]);
    const branch = (product.primaryBranches || [])[gi];
    const graphic = branch && (branch.secondaryBranches || [])[si];
    return graphic ? { product, branch, graphic, label: graphicLabel(product, branch, gi, si), position: `p${pi}-g${gi}-s${si}` } : null;
  }
  const bi = Number(m[4]);
  const graphic = (product.branches || [])[bi];
  return graphic ? { product, branch: null, graphic, label: `${(namedLabels ? labelSafe(product.productName) : str(product.productName)) || "Item"} - Graphic ${bi + 1}`, position: `p${pi}-b${bi}` } : null;
}
/* The id the uploads of a graphic are filed under: its saved id, else (older orders) its position in the order. */
export const graphicKey = (at) => (at ? str(at.graphic.graphicId).trim() || at.position : "");

/* What an upload for one graphic is named from: department, garment and placement taken from the graphic, each still changeable. */
export function graphicDefaults(products, base) {
  const at = graphicAt(products, base);
  if (!at) return null;
  const only = { products: [{ ...at.product, primaryBranches: at.branch ? [at.branch] : [] }] };
  const garments = at.branch ? garmentOptions(only) : [{ value: "ALL", label: "All (the whole order)" }, ...garmentOptions({ products: [at.product] }).slice(1)];
  const specific = garments.filter((g) => g.value !== "ALL");
  const placementsHere = (at.graphic.tartiaryBranches || []).map((t) => str(t && t.placementLocation).trim()).filter(Boolean);
  /* only this graphic's placements first, then the standard list for this garment's kind */
  const own = at.branch
    ? { products: [{ ...at.product, primaryBranches: [{ ...at.branch, secondaryBranches: [at.graphic] }] }] }
    : { products: [{ primaryBranches: [{ secondaryBranches: [at.graphic] }] }] };
  const placements = placementOptions(own, specific[0] ? specific[0].value : "");
  return {
    key: graphicKey(at),
    label: at.label,
    description: str(at.graphic.graphicDescription).trim(),
    dept: deptForProduct(at.product),
    garments,
    garment: specific.length === 1 ? specific[0].value : "ALL",
    placements,
    placement: placementsHere.length ? namePart(placementsHere[0]) : "Whole-item",
    artName: artNameFor(at.graphic.graphicDescription, at.label),
  };
}

/* Every graphic of the order, for the Graphic Design tab: [{ base, key, label, description, placements[], artFiles[] }]. */
export function graphicsOf(data) {
  const out = [];
  ((data && data.products) || []).forEach((p, pi) => {
    if (!p) return;
    (p.primaryBranches || []).forEach((b, gi) =>
      ((b && b.secondaryBranches) || []).forEach((g, si) => out.push(`products.${pi}.primaryBranches.${gi}.secondaryBranches.${si}`))
    );
    (p.branches || []).forEach((g, bi) => out.push(`products.${pi}.branches.${bi}`));
  });
  return out
    .map((base) => {
      const at = graphicAt(data.products, base);
      return at
        ? {
            base,
            key: graphicKey(at),
            label: at.label,
            description: str(at.graphic.graphicDescription).trim(),
            placements: (at.graphic.tartiaryBranches || []).map((t) => str(t && t.placementLocation).trim()).filter(Boolean),
            artFiles: Array.isArray(at.graphic.artFiles) ? at.graphic.artFiles : [],
          }
        : null;
    })
    .filter(Boolean);
}

/*
 * D-79: is this stem already used by ANOTHER graphic (so uploading would make it a new version and move that file to Rejected)?
 * taken = [{ name, key, label }] of files already uploaded on the order; mine = the keys this upload belongs to. Returns the labels.
 */
export function stemTakenBy(stem, taken, mine) {
  const own = new Set((mine || []).map(str));
  const labels = [];
  (taken || []).forEach((f) => {
    if (str(f.name).startsWith(stem + "_v") && !own.has(str(f.key)) && f.label && !labels.includes(f.label)) labels.push(f.label);
  });
  return labels;
}

/* ---------- the note ---------- */
/* "GRAPHIC UPLOAD" note: one line per file, with where it goes, which graphic it belongs to, and the name it came in with. */
/* The graphics an item belongs to: [{ key, label }] from `links`, or the single `graphic` / `graphicLabel` (D-79: one file, several graphics). */
const linksOf = (it) =>
  Array.isArray(it.links) && it.links.length ? it.links.filter((l) => l && l.key) : it.graphic ? [{ key: it.graphic, label: it.graphicLabel || "" }] : [];
export function uploadNote({ who, when, items }) {
  const lines = [`Graphic upload - ${str(when)}${who ? " - " + str(who) : ""}`];
  (items || []).forEach((it) => {
    const links = linksOf(it);
    lines.push(
      `${it.name} -> ${FOLDER_LABELS[it.folder] || it.folder}${links.length ? " (" + links.map((l) => "graphic " + l.key + (l.label ? ": " + l.label : "")).join("; ") + ")" : ""}${
        it.original && it.original !== it.name ? " (was: " + it.original + ")" : ""
      }`
    );
    if (it.other) lines.push(`  other file type: ${it.other}`);
    (it.wouldMove || []).forEach((m) => lines.push(`  replaces ${m} (moved to Rejected)`));
  });
  /* Deluge docs/58 §4: one machine line for the background filing run (people read the lines above; the run reads only this). */
  lines.push(
    "FILING JSON: " +
      JSON.stringify({
        files: (items || []).map((it) => {
          const ids = linksOf(it).map((l) => l.key);
          return { name: it.name, stem: it.stem || "", ext: it.ext || "", folder: it.folder, graphic_id: ids[0] || "", graphic_ids: ids };
        }),
      })
  );
  return lines.join("\n");
}
/* The file names on the Deal's GRAPHIC UPLOAD notes. */
export function uploadedNames(notes) {
  const out = [];
  (notes || [])
    .filter((n) => n && /^GRAPHIC UPLOAD/.test(str(n.Note_Title)))
    .forEach((n) =>
      str(n.Note_Content)
        .split(/\n|<br\s*\/?>/i)
        .forEach((l) => {
          const m = /^([^\s]+_v\d+(?:\.[A-Za-z0-9]+)?) -> /.exec(l.trim());
          if (m) out.push(m[1]);
        })
    );
  return out;
}
/* The uploads of each graphic, from the GRAPHIC UPLOAD notes: { <graphic key>: [{ name, folder, original, filed }] }. */
export function uploadsByGraphic(notes) {
  const out = {};
  (notes || [])
    .filter((n) => n && /^GRAPHIC UPLOAD/.test(str(n.Note_Title)))
    .forEach((n) => {
      const filedNote = /FILED/i.test(str(n.Note_Title));
      const content = str(n.Note_Content);
      str(content)
        .split(/\n|<br\s*\/?>/i)
        .forEach((l) => {
          const m = /^([^\s]+_v\d+(?:\.[A-Za-z0-9]+)?) -> (.+?)(?: \((graphic [^)]*)\))?(?: \(was: (.+)\))?$/.exec(l.trim());
          if (!m) return;
          const keys = m[3] ? m[3].split("; ").map((g) => (/^graphic ([A-Za-z0-9-]+)/.exec(g) || [])[1]).filter(Boolean) : [""];
          const esc = m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const notFiled = new RegExp("Not filed[^<\\n]*?: " + esc + " - ([^<\\n]*)").exec(content);
          const entry = {
            name: m[1],
            folder: m[2],
            original: m[4] || "",
            filed: filedNote || new RegExp("(^|[\\n>])Filed[^\\n<]*" + esc).test(content),
            notFiled: notFiled ? notFiled[1].trim() : "",
          };
          keys.forEach((key) => (out[key] = out[key] || []).push(entry));
        });
    });
  return out;
}

/*
 * Small follow-up (David 10-30): a reopened onboarding shows whether each uploaded file was filed. Map(file name -> { filed, notFiled,
 * folder }) from the Deal's GRAPHIC UPLOAD notes (folder = the folder's name as written on the note). A file not on any note yet -> absent.
 */
export function filingByName(notes) {
  const out = new Map();
  Object.values(uploadsByGraphic(notes)).forEach((list) =>
    list.forEach((f) => {
      const had = out.get(f.name);
      out.set(f.name, { filed: !!(f.filed || (had && had.filed)), notFiled: f.notFiled || (had && had.notFiled) || "", folder: f.folder });
    })
  );
  return out;
}

/*
 * Small follow-up (David 10-30, "Yes, build that"): an onboarding opened again before Submit starts blank, but files uploaded on the
 * first visit are already on the Deal. Every uploaded file, oldest first: [{ name, folder, filed, notFiled, labels }] (labels = the
 * graphics it was uploaded for, as written on its note). The form lists them and counts them in the "art name already used" warning.
 */
export function earlierUploads(notes) {
  const status = filingByName(notes);
  const out = [];
  (notes || [])
    .filter((n) => n && /^GRAPHIC UPLOAD/.test(str(n.Note_Title)))
    .sort((a, b) => (str(a.Created_Time) < str(b.Created_Time) ? -1 : 1))
    .forEach((n) =>
      str(n.Note_Content)
        .split(/\n|<br\s*\/?>/i)
        .forEach((l) => {
          const m = /^([^\s]+_v\d+(?:\.[A-Za-z0-9]+)?) -> (.+?)(?: \((graphic [^)]*)\))?(?: \(was: (.+)\))?$/.exec(l.trim());
          if (!m || out.some((x) => x.name === m[1])) return;
          const labels = m[3] ? m[3].split("; ").map((g) => (/^graphic [A-Za-z0-9-]+: (.+)$/.exec(g) || [])[1]).filter(Boolean) : [];
          const st = status.get(m[1]) || {};
          out.push({ name: m[1], folder: m[2], original: m[4] || "", filed: !!st.filed, notFiled: st.notFiled || "", labels });
        })
    );
  return out;
}

/* Has anything been uploaded for this department ("" = any department)? Gates the Graphic Design Close Task. */
export const hasUploadFor = (notes, dept) => uploadedNames(notes).some((n) => !dept || n.split("_")[1] === dept);

export const graphicFlowOn = (config) => !!config && config.graphicFlowOn === true;
export const uploadsOn = (config) => !!config && config.graphicUploadsOn === true;
