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

export const stemFor = ({ po, dept, garment, placement, format }) =>
  [po, dept, garment, placement, format].map(namePart).join("_");
export const fileName = (stem, version, ext) => `${stem}_v${Number(version) || 1}${ext ? "." + ext : ""}`;
/* Every part chosen? (the PO always is) */
export const partsReady = (p) => !!(p && p.dept && p.garment && p.placement && p.format);

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
        const style = sku || type || str(p.productName);
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
export const dryRunPayload = ({ files, who }) => ({
  dry_run: "true",
  submitted_by: str(who),
  source: "cards",
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

/*
 * David 10-30 (relayed, Deluge docs/57 §9, "Yes, both"): a file attached a moment ago is slow to download, so the first real call often
 * answers `too_slow` with nothing written. The form waits ~30 s and calls again by itself, up to 3 times; after that it tells the
 * designer to try again in a minute. Only `too_slow` is retried (a repeat of a finished file is `skipped`, never doubled).
 */
export const RETRY_WAIT_MS = 30000;
export const RETRIES = 3;
/* What to do with one real-call answer: "done" (copied / skipped), "retry" (too_slow, tries left), "slow" (too_slow, none left), "problem". */
export function afterCall(answer, retriesUsed) {
  const r = str(answer && answer.result);
  if (r === "copied" || r === "skipped") return "done";
  if (r === "too_slow") return retriesUsed < RETRIES ? "retry" : "slow";
  return "problem";
}

/* ---------- the note ---------- */
/* "GRAPHIC UPLOAD" note: one line per file, with where it went and the name it came in with. */
export function uploadNote({ who, when, items }) {
  const lines = [`Graphic upload - ${str(when)}${who ? " - " + str(who) : ""}`];
  (items || []).forEach((it) => {
    lines.push(`${it.name} -> ${FOLDER_LABELS[it.folder] || it.folder}${it.original && it.original !== it.name ? " (was: " + it.original + ")" : ""}`);
    (it.wouldMove || []).forEach((m) => lines.push(`  replaces ${m} (moved to Rejected)`));
  });
  return lines.join("\n");
}
/* The file names on the Deal's GRAPHIC UPLOAD notes. */
export function uploadedNames(notes) {
  const out = [];
  (notes || [])
    .filter((n) => n && n.Note_Title === UPLOAD_NOTE_TITLE)
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
/* Has anything been uploaded for this department ("" = any department)? Gates the Graphic Design Close Task. */
export const hasUploadFor = (notes, dept) => uploadedNames(notes).some((n) => !dept || n.split("_")[1] === dept);

export const graphicFlowOn = (config) => !!config && config.graphicFlowOn === true;
export const uploadsOn = (config) => !!config && config.graphicUploadsOn === true;
