import { pendingNote, proofApprovals, proofItems, proofNote, proofStatus, proofWrites, testGarmentLabels } from "./proofs";
import { closeNote, closePlan, closeQuestionsFor, flowHistory, openAfterClose } from "./productionFlow";

const G = (garmentType, places) => ({ garmentType, secondaryBranches: places.map((p) => ({ graphicDescription: p + " art", tartiaryBranches: [{ placementLocation: p }] })) });
const ORDER = {
  products: [
    { productType: "garment", productName: "Embroidery", primaryBranches: [G("Nike Polo NKDC1963", ["Left Chest", "Upper Back"]), G("Richardson 112 Hat", ["Front"])] },
    { productType: "garment", productName: "Screen Printing", primaryBranches: [G("Gildan 5000\nGildan 5000L", ["Full Front"])] },
    { productType: "nongarment", productName: "Stickers", dimensions: '3" x 3"', quantityOrdered: "100" },
    { productType: "nongarment", productName: "Mugs", quantityOrdered: "12", isOutsourced: "Yes" },
  ],
};
const note = (content, t) => ({ Note_Title: "PRODUCTION FLOW", Note_Content: content, Created_Time: t });
const approve = (dept, labels, t = "2026-10-30T10:00:00-06:00", who = "Angela") => note(proofNote({ dept, who, when: "10/30/26, 10:00 AM", labels }), t);

describe("E-174 proof items: one per garment on the department's card", () => {
  it("garments carry all their graphics; non-garment items one each; other cards' products are not mine", () => {
    expect(proofItems(ORDER, "embroidery").map((i) => i.label)).toEqual(["Nike Polo NKDC1963 (Left Chest + Upper Back)", "Richardson 112 Hat (Front)"]);
    expect(proofItems(ORDER, "screen").map((i) => i.label)).toEqual(["Gildan 5000 (Full Front)"]);
    expect(proofItems(ORDER, "vinyl").map((i) => i.label)).toEqual(['Stickers (3" x 3")']);
    expect(proofItems(ORDER, "outsourced")).toEqual([]);
    expect(proofItems(ORDER, "graphicdesign")).toEqual([]);
  });
  it("a repeated garment gets its own approval", () => {
    const twice = { products: [{ productType: "garment", productName: "Embroidery", primaryBranches: [G("Hat", ["Front"]), G("Hat", ["Front"])] }] };
    expect(proofItems(twice, "embroidery").map((i) => i.key)).toEqual(["hat (front)", "hat (front) #2"]);
  });
  it("a gang sheet is one item", () => {
    expect(proofItems({ products: [{ productType: "gangsheet", productName: "DTF Gang Sheet" }] }, "vinyl").map((i) => i.label)).toEqual(["DTF Gang Sheet"]);
  });
});

describe("E-174 approvals are read back from the PRODUCTION FLOW notes", () => {
  it("who and when, per department; the first approval of an item wins; other departments' notes are ignored", () => {
    const notes = [
      approve("embroidery", ["Richardson 112 Hat (Front)"], "2026-10-30T09:00:00-06:00", "Desi"),
      approve("embroidery", ["Richardson 112 Hat (Front)"], "2026-10-30T11:00:00-06:00", "Angela"),
      approve("screen", ["Gildan 5000 (Full Front)"]),
      note("Embroidery - STARTED - x - y\nGarments counted? Yes", "2026-10-30T08:00:00-06:00"),
    ];
    const m = proofApprovals(notes, "embroidery");
    expect([...m.keys()]).toEqual(["richardson 112 hat (front)"]);
    expect(m.get("richardson 112 hat (front)")).toMatchObject({ who: "Desi", when: "10/30/26, 10:00 AM" });
    const st = proofStatus(ORDER, notes, "embroidery");
    expect(st.left).toEqual(["Nike Polo NKDC1963 (Left Chest + Upper Back)"]);
    expect(st.done).toBe(false);
  });
  it("reads notes that come back with <br> line breaks", () => {
    const n = note("Embroidery - PROOF APPROVED - 10/30/26 - Angela<br>Approved: Nike Polo NKDC1963 (Left Chest + Upper Back)", "t");
    expect(proofStatus(ORDER, [n], "embroidery").left).toEqual(["Richardson 112 Hat (Front)"]);
  });
});

describe("E-174 what an approval writes", () => {
  const deal = { Stage: "Mock-Up Approved / In Production", Test_Garments_Approved: ["Outsourced"] };
  const allEmb = approve("embroidery", ["Nike Polo NKDC1963 (Left Chest + Upper Back)", "Richardson 112 Hat (Front)"]);
  it("a department done -> its label added (others kept); the stage waits for the other departments", () => {
    const w = proofWrites({ deal, data: ORDER, notes: [pendingNote(allEmb.Note_Content)], dept: "embroidery" });
    expect(w.fields).toEqual({ Test_Garments_Approved: ["Outsourced", "Embroidery"] });
    expect(w.stage).toMatchObject({ move: false, reason: "waiting for the proofs of Screen Print, Vinyl" });
    expect(w.deptDone).toBe(true);
  });
  it("the last proof on the order moves the Deal to Test Garment Approved", () => {
    const notes = [allEmb, approve("screen", ["Gildan 5000 (Full Front)"]), pendingNote(proofNote({ dept: "vinyl", who: "A", when: "w", labels: ['Stickers (3" x 3")'] }))];
    const w = proofWrites({ deal, data: ORDER, notes, dept: "vinyl" });
    expect(w.stage).toEqual({ move: true, to: "Test Garment Approved", reason: "" });
    expect(w.fields).toEqual({ Test_Garments_Approved: ["Outsourced", "Stickers"] });
  });
  it("only from In Production; from a revision stage or already there the stage stays", () => {
    const notes = [allEmb, approve("screen", ["Gildan 5000 (Full Front)"]), approve("vinyl", ['Stickers (3" x 3")'])];
    expect(proofWrites({ deal: { Stage: "Order Needs Revisions" }, data: ORDER, notes, dept: "vinyl" }).stage.move).toBe(false);
    expect(proofWrites({ deal: { Stage: "Test Garment Approved" }, data: ORDER, notes, dept: "vinyl" }).stage.reason).toBe("already at Test Garment Approved");
    expect(proofWrites({ deal: { Stage: "Online Purchase / In Production" }, data: ORDER, notes, dept: "vinyl" }).stage.move).toBe(true);
  });
  it("a label already on the Deal is not written again; a department not done writes nothing", () => {
    expect(proofWrites({ deal: { ...deal, Test_Garments_Approved: ["Embroidery"] }, data: ORDER, notes: [allEmb], dept: "embroidery" }).fields).toEqual({});
    expect(proofWrites({ deal, data: ORDER, notes: [], dept: "embroidery" }).fields).toEqual({});
  });
  it("department labels: vinyl by its jobs; HTV has none", () => {
    expect(testGarmentLabels(ORDER, "screen")).toEqual(["Screen Print"]);
    expect(testGarmentLabels({ products: [{ productName: "Direct-to-Film", productType: "garment" }, { productName: "Heat-Transfer", productType: "garment" }, { productName: "Decals", productType: "nongarment" }] }, "vinyl")).toEqual(["DTF", "Decals"]);
  });
});

describe("E-174 / E-176 Close: waits for proofs, last-task notice, send anyway, open tasks", () => {
  const T = (id, Subject, Status = "Not Started", owner = "Mastin") => ({ id, Subject, Status, Owner: { id: "u-" + owner, name: owner } });
  const allYes = (dept) => Object.fromEntries(closeQuestionsFor(dept).map((q) => [q.key, "yes"]));
  const tasks = [
    T("1", "EMBROIDERY: Produce Order / BORDADO: Orden de producción"),
    T("2", "SCREEN PRINT: Produce Order"),
    T("3", "ACCOUNT MANAGER: Update Tracking for Garments & Supplies", "Not Started", "Korie"),
  ];
  const base = { dept: "embroidery", tasks, closing: ["1"], answers: allYes("embroidery"), stage: "Test Garment Approved" };
  it("Close waits for the card's proofs", () => {
    const p = closePlan({ ...base, proofsLeft: ["Richardson 112 Hat (Front)"] });
    expect(p.problems).toContain("Approve the test garment (proof print) first: Richardson 112 Hat (Front)");
    expect(closePlan({ ...base, proofsLeft: [] }).problems).toEqual([]);
  });
  it("another department's open task holds the Deal unless the agent sends it anyway", () => {
    const held = closePlan(base);
    expect(held.stage.move).toBe(false);
    expect(held.forced).toEqual([]);
    const sent = closePlan({ ...base, sendAnyway: true });
    expect(sent.stage).toMatchObject({ move: true, to: "Quality Check" });
    expect(sent.forced.map((t) => t.id)).toEqual(["2"]);
    // never from a stage that is not a production stage
    expect(closePlan({ ...base, stage: "Design Mock-Up Sent", sendAnyway: true }).stage.move).toBe(false);
  });
  it("the Account Manager's task never holds the Deal; it is listed as still open after the move", () => {
    const last = closePlan({ ...base, tasks: [tasks[0], tasks[2]] });
    expect(last.stage.move).toBe(true);
    expect(openAfterClose([tasks[0], tasks[2]], ["1"]).map((t) => t.id)).toEqual(["3"]);
    const n = closeNote({ dept: "embroidery", who: "Angela", when: "w", tasks, closing: ["1"], answers: allYes("embroidery"), stage: last.stage, forced: [], openAfter: [tasks[2]] });
    expect(n).toMatch(/Deal moved to Quality Check\.\nStill open on the Deal: ACCOUNT MANAGER: Update Tracking for Garments & Supplies \(Korie\)$/);
  });
  it("the note says what was sent past", () => {
    const sent = closePlan({ ...base, sendAnyway: true });
    const n = closeNote({ dept: "embroidery", who: "A", when: "w", tasks, closing: ["1"], answers: allYes("embroidery"), stage: sent.stage, forced: sent.forced, openAfter: [] });
    expect(n).toMatch(/Sent to Quality Check anyway, with these production task\(s\) still open: SCREEN PRINT: Produce Order/);
  });
  it("without the new arguments Close works exactly as before", () => {
    const p = closePlan({ ...base, tasks: [tasks[0]] });
    expect(p.problems).toEqual([]);
    expect(p.stage.move).toBe(true);
  });
});

describe("E-176 the flow's history stays visible", () => {
  it("this department's notes, oldest first", () => {
    const notes = [
      note("Embroidery - CLOSED - 10/30 3:00 PM - Angela\nClosed: EMBROIDERY: Produce Order\nDeal moved to Quality Check.", "2026-10-30T15:00:00-06:00"),
      note("Embroidery - STARTED - 10/30 9:00 AM - Angela\nGarments counted? Yes", "2026-10-30T09:00:00-06:00"),
      note("Screen Print - STARTED - x", "2026-10-30T09:30:00-06:00"),
      { Note_Title: "DEAL ONBOARDING FORM", Note_Content: "Embroidery - nothing", Created_Time: "2026-10-30T09:10:00-06:00" },
    ];
    const h = flowHistory(notes, "embroidery");
    expect(h.map((e) => e.head)).toEqual(["Embroidery - STARTED - 10/30 9:00 AM - Angela", "Embroidery - CLOSED - 10/30 3:00 PM - Angela"]);
    expect(h[1].lines).toEqual(["Closed: EMBROIDERY: Produce Order", "Deal moved to Quality Check."]);
  });
});
