import { refileAfterFolders, uploadGraphicFile, withCap } from "./graphicUploader";

/* A stand-in for the Zoho SDK that records every call and answers like Zoho / Deluge docs/58. */
const fakeZoho = (dryAnswer = { status: "ok", result: "dry_run", files: [{ stem: "4523_EMB_K500-Navy_Left-Chest_DST", next_version: 2, would_move: ["4523_EMB_K500-Navy_Left-Chest_DST_v1.dst"] }] }) => {
  const calls = [];
  return {
    calls,
    CRM: {
      FUNCTIONS: { execute: async (name, cfg) => (calls.push(["execute", name, JSON.parse(JSON.parse(cfg.arguments).payload)]), { details: { output: JSON.stringify(dryAnswer) } }) },
      API: {
        addNotes: async (c) => (calls.push(["addNotes", c.Title, c.Content]), { data: [{ code: "SUCCESS", details: { id: "n1" } }] }),
        attachFile: async (c) => (calls.push(["attachFile", c.Entity, c.RecordID, c.File.Name]), { data: [{ code: "SUCCESS" }] }),
        updateRecord: async (c) => (calls.push(["updateRecord", c.APIData, c.Trigger]), { data: [{ code: "SUCCESS" }] }),
      },
    },
  };
};
const file = { name: "Logo FINAL final.DST", type: "", arrayBuffer: async () => new ArrayBuffer(4) };
const parts = { dept: "EMB", garment: "K500-Navy", placement: "Left-Chest", format: "DST" };

test("E-162 / E-170: one upload = dry run only, then the note, the renamed file on it, then untick + tick Graphics_Filing", async () => {
  const z = fakeZoho();
  const res = await uploadGraphicFile(z, {
    entity: "Deals",
    recordId: "D1",
    deal: { PO_Number: "4523", Graphics_Filing: false },
    who: "Desi",
    source: "onboarding",
    file,
    parts,
    graphic: { key: "GAB12CD", label: "Garment 1 - Graphic 1" },
    startFiling: true,
  });
  expect(res).toMatchObject({ name: "4523_EMB_K500-Navy_Left-Chest_DST_v2.dst", folder: "dept:Embroidery", noteId: "n1", filingStarted: true });
  expect(z.calls.map((c) => c[0])).toEqual(["execute", "addNotes", "attachFile", "updateRecord", "updateRecord"]);
  expect(z.calls[0][1]).toBe("widget_upload_graphics");
  expect(z.calls[0][2]).toMatchObject({ dry_run: "true", source: "onboarding" }); // the form never calls the real run (Deluge docs/58 §6)
  expect(z.calls[1][1]).toBe("GRAPHIC UPLOAD");
  expect(z.calls[1][2]).toMatch(/\(graphic GAB12CD: Garment 1 - Graphic 1\) \(was: Logo FINAL final\.DST\)/);
  expect(z.calls[1][2]).toMatch(/FILING JSON: \{"files":\[\{"name":"4523_EMB_K500-Navy_Left-Chest_DST_v2\.dst"/);
  expect(z.calls[2]).toEqual(["attachFile", "Notes", "n1", "4523_EMB_K500-Navy_Left-Chest_DST_v2.dst"]);
  expect(z.calls[3]).toEqual(["updateRecord", { id: "D1", Graphics_Filing: false }, []]);
  expect(z.calls[4]).toEqual(["updateRecord", { id: "D1", Graphics_Filing: true }, ["workflow"]]);
});

test("E-162: filing switch off -> no box writes; a failed dry run attaches nothing", async () => {
  const z = fakeZoho();
  const res = await uploadGraphicFile(z, { entity: "Deals", recordId: "D1", deal: {}, who: "", file, parts, graphic: null, startFiling: false });
  expect(res.name).toBe("NOPO_EMB_K500-Navy_Left-Chest_DST_v1.dst"); // stem not in the answer -> v1
  expect(z.calls.map((c) => c[0])).toEqual(["execute", "addNotes", "attachFile"]);
  const bad = fakeZoho({ status: "error", result: "no_deal_folder", message: "this Deal has no folder" });
  await expect(uploadGraphicFile(bad, { entity: "Deals", recordId: "D1", deal: {}, file, parts })).rejects.toThrow("this Deal has no folder");
  expect(bad.calls.map((c) => c[0])).toEqual(["execute"]);
});

test("E-162 (Deluge docs/59 §2.0): once Submit's folders exist, the filing box is ticked once more; not when the folders failed", async () => {
  const z = fakeZoho();
  expect(await refileAfterFolders(z, { entity: "Deals", recordId: "D1", folders: Promise.resolve({ status: "ok" }) })).toBe(true);
  expect(z.calls).toEqual([
    ["updateRecord", { id: "D1", Graphics_Filing: false }, []],
    ["updateRecord", { id: "D1", Graphics_Filing: true }, ["workflow"]],
  ]);
  const z2 = fakeZoho();
  expect(await refileAfterFolders(z2, { entity: "Deals", recordId: "D1", folders: Promise.resolve({ status: "skipped" }) })).toBe(true); // folder already there
  const z3 = fakeZoho();
  expect(await refileAfterFolders(z3, { entity: "Deals", recordId: "D1", folders: Promise.resolve({ status: "unavailable" }) })).toBe(false);
  expect(z3.calls).toEqual([]);
  expect(await withCap(new Promise(() => {}), 10)).toBe("timeout");
  expect(await withCap(Promise.resolve(true), 1000)).toBe(true);
});

