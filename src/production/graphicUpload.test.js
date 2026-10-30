import {
  namePart,
  extOf,
  poPart,
  folderFor,
  stemFor,
  fileName,
  partsReady,
  garmentOptions,
  placementOptions,
  isDesignTask,
  deptOfDesignTask,
  dryRunPayload,
  realPayload,
  callArguments,
  readUploadAnswer,
  versionFrom,
  uploadNote,
  uploadedNames,
  hasUploadFor,
  graphicFlowOn,
  uploadsOn,
  UPLOAD_NOTE_TITLE,
} from "./graphicUpload";

test("E-162: David's example name, part by part", () => {
  const stem = stemFor({ po: poPart({ PO_Number: "4523" }), dept: "EMB", garment: "K500-Navy", placement: "Left Chest", format: "DST" });
  expect(stem).toBe("4523_EMB_K500-Navy_Left-Chest_DST");
  expect(fileName(stem, 1, extOf("Logo FINAL final.DST"))).toBe("4523_EMB_K500-Navy_Left-Chest_DST_v1.dst");
  expect(fileName(stem, 3, "ai")).toBe("4523_EMB_K500-Navy_Left-Chest_DST_v3.ai");
  expect(poPart({ PO_Number: "E259" })).toBe("E259");
  expect(poPart({})).toBe("NOPO");
  expect(namePart("Upper Back (Yoke)")).toBe("Upper-Back-Yoke");
  expect(namePart("Left Sleeve – Upper")).toBe("Left-Sleeve-Upper");
  expect(namePart("Tees & Hoodies")).toBe("Tees-and-Hoodies");
  expect(extOf("no extension")).toBe("");
  expect(partsReady({ dept: "EMB", garment: "ALL", placement: "Left-Chest", format: "DST" })).toBe(true);
  expect(partsReady({ dept: "EMB", garment: "ALL", placement: "", format: "DST" })).toBe(false);
});

test("E-162: folders (D-77) -- print-ready by department, mock-ups to the client's folder, client art to Art Assets, the rest to Graphic Design", () => {
  expect(folderFor("EMB", "DST")).toBe("dept:Embroidery");
  expect(folderFor("SP", "VECTOR")).toBe("dept:Screen Printing");
  expect(folderFor("VIN", "PNG")).toBe("dept:Vinyl Department");
  expect(folderFor("OUT", "VECTOR")).toBe("graphic_design");
  expect(folderFor("GD", "PNG")).toBe("graphic_design");
  expect(folderFor("EMB", "PROOF")).toBe("graphic_design");
  expect(folderFor("EMB", "OTHER")).toBe("graphic_design");
  expect(folderFor("SP", "MOCKUP")).toBe("mockups");
  expect(folderFor("SP", "ORIGINAL")).toBe("art_assets");
});

const order = {
  products: [
    {
      productType: "garment",
      productName: "Embroidery",
      primaryBranches: [
        {
          garmentType: "Port Authority K500 Polo",
          garmentKind: "Polo",
          garmentSkus: [{ sku: "K500" }],
          countColorSize: "Navy\n4- S\nWhite\n2- L",
          secondaryBranches: [{ tartiaryBranches: [{ placementLocation: "Left Chest" }, { placementLocation: "Full Back" }] }],
        },
      ],
    },
    { productType: "nongarment", productName: "Business Cards", quantityOrdered: "250" },
  ],
};

test("E-162: the Garment picker lists ALL, each style + color, then non-garment items", () => {
  expect(garmentOptions(order).map((o) => o.value)).toEqual(["ALL", "K500-Navy", "K500-White", "Business-Cards"]);
  expect(garmentOptions(order)[1].label).toBe("Port Authority K500 Polo - Navy");
  expect(garmentOptions({ products: [] }).map((o) => o.value)).toEqual(["ALL"]);
});

test("E-162: the Placement picker -- the order's placements first, then the standard list for that kind, then Whole item", () => {
  const p = placementOptions(order, "K500-Navy");
  expect(p.slice(0, 2).map((o) => [o.value, o.fromOrder])).toEqual([["Left-Chest", true], ["Full-Back", true]]);
  expect(p.map((o) => o.value)).toContain("Right-Chest"); // from the E-74 list for polos
  expect(p.filter((o) => o.value === "Left-Chest")).toHaveLength(1); // not listed twice
  expect(p[p.length - 1]).toEqual({ value: "Whole-item", label: "Whole item (no placement)", fromOrder: false });
});

test("E-162: Graphic Design tasks and the department they are for (real subjects)", () => {
  expect(isDesignTask("GRAPHIC DESIGN: EMBROIDERY: Artwork & Mock-Up / DISEÑO GRÁFICO: BORDADO: Arte y Maqueta")).toBe(true);
  expect(isDesignTask("RUSH: GRAPHIC DESIGN: Finalize Graphics & Artwork / x")).toBe(true);
  expect(isDesignTask("EMBROIDERY: Produce Order / x")).toBe(false);
  expect(deptOfDesignTask("GRAPHIC DESIGN: EMBROIDERY: Artwork & Mock-Up / x")).toBe("EMB");
  expect(deptOfDesignTask("GRAPHIC DESIGN: SCREEN PRINT: Artwork & Mock-Up / x")).toBe("SP");
  expect(deptOfDesignTask("GRAPHIC DESIGN: DTF: Artwork & Mock-Up / x")).toBe("VIN");
  expect(deptOfDesignTask("GRAPHIC DESIGN: PATCHES: Artwork & Mock-Up / x")).toBe("VIN");
  expect(deptOfDesignTask("GRAPHIC DESIGN: OUTSOURCED: Artwork & Mock-Up / x")).toBe("OUT");
  expect(deptOfDesignTask("GRAPHIC DESIGN: Finalize Graphics & Artwork / x")).toBe("");
  expect(deptOfDesignTask("GRAPHIC DESIGN: Mock-Up Revision / x")).toBe("");
});

test("E-162: the calls to Deluge's widget_upload_graphics (docs/57) and reading the answer", () => {
  const f = { name: "4523_EMB_K500-Navy_Left-Chest_DST_v1.dst", stem: "4523_EMB_K500-Navy_Left-Chest_DST", ext: "dst", folder: "dept:Embroidery" };
  expect(dryRunPayload({ files: [f], who: "Desi" })).toEqual({ dry_run: "true", submitted_by: "Desi", source: "cards", files: [f] });
  expect(realPayload({ file: f, noteId: "77", who: "Desi" })).toEqual({ dry_run: "false", submitted_by: "Desi", source: "cards", note_id: "77", files: [f] });
  const args = JSON.parse(callArguments("123", { a: 1 }).arguments);
  expect(args).toEqual({ deal_id: "123", payload: '{"a":1}' });
  const ans = readUploadAnswer({ details: { output: JSON.stringify({ status: "ok", result: "dry_run", files: [{ stem: f.stem, next_version: 2, would_move: ["4523_EMB_K500-Navy_Left-Chest_DST_v1.dst"] }] }) } });
  expect(versionFrom(ans, f.stem)).toEqual({ version: 2, wouldMove: ["4523_EMB_K500-Navy_Left-Chest_DST_v1.dst"] });
  expect(versionFrom(ans, "other")).toEqual({ version: 1, wouldMove: [] });
  expect(readUploadAnswer({ details: { output: "not json" } }).status).toBe("unavailable");
  expect(readUploadAnswer(null).status).toBe("unavailable");
});

test("E-162: the GRAPHIC UPLOAD note keeps the client's own name, and the Close check reads it back", () => {
  const text = uploadNote({
    who: "Desi",
    when: "10/29/26, 7:00 PM",
    items: [
      { name: "4523_EMB_K500-Navy_Left-Chest_ORIGINAL_v1.ai", folder: "art_assets", original: "Logo FINAL final.ai" },
      { name: "4523_EMB_K500-Navy_Left-Chest_DST_v2.dst", folder: "dept:Embroidery", original: "x.dst", wouldMove: ["4523_EMB_K500-Navy_Left-Chest_DST_v1.dst"] },
    ],
  });
  expect(text.split("\n")).toEqual([
    "Graphic upload - 10/29/26, 7:00 PM - Desi",
    "4523_EMB_K500-Navy_Left-Chest_ORIGINAL_v1.ai -> Art Assets (was: Logo FINAL final.ai)",
    "4523_EMB_K500-Navy_Left-Chest_DST_v2.dst -> Department Folders / Embroidery (was: x.dst)",
    "  replaces 4523_EMB_K500-Navy_Left-Chest_DST_v1.dst (moved to Rejected)",
  ]);
  const notes = [{ Note_Title: UPLOAD_NOTE_TITLE, Note_Content: text.replace(/\n/g, "<br>") }, { Note_Title: "PRODUCTION FLOW", Note_Content: "4523_SP_x_y_PNG_v1.png -> z" }];
  expect(uploadedNames(notes)).toEqual(["4523_EMB_K500-Navy_Left-Chest_ORIGINAL_v1.ai", "4523_EMB_K500-Navy_Left-Chest_DST_v2.dst"]);
  expect(hasUploadFor(notes, "EMB")).toBe(true);
  expect(hasUploadFor(notes, "SP")).toBe(false);
  expect(hasUploadFor(notes, "")).toBe(true);
  expect(hasUploadFor([], "")).toBe(false);
});

test("E-162: both switches are OFF until Deluge's function is in Zoho", () => {
  const cfg = require("./productionConfig.json");
  expect(graphicFlowOn(cfg)).toBe(false);
  expect(uploadsOn(cfg)).toBe(false);
  expect(graphicFlowOn({ graphicFlowOn: true })).toBe(true);
});
