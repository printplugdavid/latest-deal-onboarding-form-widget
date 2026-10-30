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
  newGraphicId,
  deptForProduct,
  graphicAt,
  graphicKey,
  graphicDefaults,
  graphicsOf,
  uploadsByGraphic,
  filingOn,
  FILING_FIELD,
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
  // a garment with nothing typed yet (onboarding, early): only ALL -- never the product name as a garment
  expect(garmentOptions({ products: [{ productType: "garment", productName: "Embroidery", primaryBranches: [{ garmentType: "" }] }] }).map((o) => o.value)).toEqual(["ALL"]);
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

test("E-162 / E-170: the GRAPHIC UPLOAD note -- people's lines, the graphic it belongs to, the client's name, and the FILING JSON line", () => {
  const text = uploadNote({
    who: "Desi",
    when: "10/30/26, 9:00 AM",
    items: [
      {
        name: "4523_EMB_K500-Navy_Left-Chest_DST_v2.dst",
        stem: "4523_EMB_K500-Navy_Left-Chest_DST",
        ext: "dst",
        folder: "dept:Embroidery",
        original: "Logo FINAL final.DST",
        graphic: "GAB12CD",
        graphicLabel: "Garment 1 - Graphic 1",
        wouldMove: ["4523_EMB_K500-Navy_Left-Chest_DST_v1.dst"],
      },
    ],
  });
  const lines = text.split("\n");
  expect(lines.slice(0, 3)).toEqual([
    "Graphic upload - 10/30/26, 9:00 AM - Desi",
    "4523_EMB_K500-Navy_Left-Chest_DST_v2.dst -> Department Folders / Embroidery (graphic GAB12CD: Garment 1 - Graphic 1) (was: Logo FINAL final.DST)",
    "  replaces 4523_EMB_K500-Navy_Left-Chest_DST_v1.dst (moved to Rejected)",
  ]);
  expect(lines[3].startsWith("FILING JSON: ")).toBe(true);
  expect(JSON.parse(lines[3].slice("FILING JSON: ".length))).toEqual({
    files: [{ name: "4523_EMB_K500-Navy_Left-Chest_DST_v2.dst", stem: "4523_EMB_K500-Navy_Left-Chest_DST", ext: "dst", folder: "dept:Embroidery", graphic_id: "GAB12CD" }],
  });
  // read back for the cards and the Close check (Zoho turns line breaks into <br>)
  const pending = { Note_Title: UPLOAD_NOTE_TITLE, Note_Content: text.replace(/\n/g, "<br>") };
  expect(uploadsByGraphic([pending])).toEqual({
    GAB12CD: [{ name: "4523_EMB_K500-Navy_Left-Chest_DST_v2.dst", folder: "Department Folders / Embroidery", original: "Logo FINAL final.DST", filed: false, notFiled: "" }],
  });
  expect(hasUploadFor([pending], "EMB")).toBe(true);
  expect(hasUploadFor([pending], "SP")).toBe(false);
  // Deluge docs/58 §3: a "Filed" line, then the note retitled "GRAPHIC UPLOAD - FILED"; a "Not filed" line carries the reason
  const filedLine = { ...pending, Note_Content: pending.Note_Content + "<br>Filed 10-30 09:05: 4523_EMB_K500-Navy_Left-Chest_DST_v2.dst -> Department Folders / Embroidery" };
  expect(uploadsByGraphic([filedLine]).GAB12CD[0].filed).toBe(true);
  expect(uploadsByGraphic([{ ...pending, Note_Title: "GRAPHIC UPLOAD - FILED" }]).GAB12CD[0].filed).toBe(true);
  const notFiled = { ...pending, Note_Content: pending.Note_Content + "<br>Not filed 10-30 09:05: 4523_EMB_K500-Navy_Left-Chest_DST_v2.dst - no_deal_folder" };
  expect(uploadsByGraphic([notFiled]).GAB12CD[0]).toMatchObject({ filed: false, notFiled: "no_deal_folder" });
  expect(uploadedNames([{ ...pending, Note_Title: "GRAPHIC UPLOAD - FILED" }])).toEqual(["4523_EMB_K500-Navy_Left-Chest_DST_v2.dst"]);
  expect(uploadsByGraphic([{ Note_Title: "PRODUCTION FLOW", Note_Content: "x_v1.png -> y" }])).toEqual({});
});

test("E-170: graphics of the order, their permanent ids, and what an upload for one graphic is named from", () => {
  expect(newGraphicId()).toMatch(/^G[0-9A-Z]{6}$/);
  expect(newGraphicId()).not.toBe(newGraphicId());
  const withId = JSON.parse(JSON.stringify(order));
  withId.products[0].primaryBranches[0].secondaryBranches[0].graphicDescription = "Company logo";
  withId.products[0].primaryBranches[0].secondaryBranches[0].graphicId = "GAB12CD";
  const list = graphicsOf(withId);
  expect(list.map((g) => [g.base, g.key, g.label])).toEqual([["products.0.primaryBranches.0.secondaryBranches.0", "GAB12CD", "Garment 1 - Graphic 1"]]);
  expect(list[0]).toMatchObject({ description: "Company logo", placements: ["Left Chest", "Full Back"] });
  const at = graphicAt(order.products, "products.0.primaryBranches.0.secondaryBranches.0");
  expect(graphicKey(at)).toBe("p0-g0-s0"); // an older order with no id: its position
  expect(graphicAt(order.products, "products.9.branches.0")).toBe(null);
  const d = graphicDefaults(withId.products, "products.0.primaryBranches.0.secondaryBranches.0");
  expect(d).toMatchObject({ key: "GAB12CD", dept: "EMB", garment: "ALL", placement: "Left-Chest" }); // two colors -> ALL
  expect(d.garments.map((g) => g.value)).toEqual(["ALL", "K500-Navy", "K500-White"]);
  expect(d.placements[0]).toMatchObject({ value: "Left-Chest", fromOrder: true });
  expect(d.placements.map((p) => p.value)).toContain("Right-Chest");
  expect(deptForProduct({ productName: "Screen Printing", productType: "garment" })).toBe("SP");
  expect(deptForProduct({ productName: "Direct-to-Film", productType: "garment" })).toBe("VIN");
  expect(deptForProduct({ productName: "Patches", productType: "nongarment", isOutsourced: "Yes" })).toBe("OUT");
  expect(deptForProduct({ productName: "Business Cards", productType: "nongarment" })).toBe("OUT");
});

test("E-162: every switch is OFF until David says go (and the filing field + rule exist)", () => {
  const cfg = require("./productionConfig.json");
  expect(graphicFlowOn(cfg)).toBe(false);
  expect(uploadsOn(cfg)).toBe(false);
  expect(filingOn(cfg)).toBe(false);
  expect(FILING_FIELD).toBe("Graphics_Filing");
  expect(graphicFlowOn({ graphicFlowOn: true })).toBe(true);
});
