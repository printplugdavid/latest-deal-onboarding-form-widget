import {
  deptOfTask,
  openDeptTasks,
  openWorkTasks,
  deptForCard,
  closeQuestionsFor,
  pantonesOf,
  pantoneSlots,
  pantoneFields,
  grams,
  orderGarments,
  missingLine,
  appendDated,
  reTick,
  closePlan,
  startNote,
  closeNote,
  deptStarted,
  pantoneCodeFields,
  writePantonesOn,
  isOrderProductsTask,
  openOrderTasks,
  openHoldTasks,
  flowDeptFor,
  hasStartSteps,
  outsourcedOn,
  needsOutsourcedTab,
  expectedFor,
  expectedCountsOn,
  COUNT_QUESTION_KEYS,
  START_STEPS,
  dueStatus,
  dueFlagsOn,
  lateLine,
  tabTasks,
  BLOCK_TEXT,
  FLOW_NOTE_TITLE,
} from "./productionFlow";

const T = (id, Subject, Status = "Not Started", owner = "Mastin") => ({ id, Subject, Status, Owner: { id: "u-" + owner, name: owner } });

test("work tasks by department, from the real subjects (RUSH, Reproduce, Correct, vinyl jobs)", () => {
  expect(deptOfTask("EMBROIDERY: Produce Order / BORDADO: Orden de producción")).toBe("embroidery");
  expect(deptOfTask("RUSH: SCREEN PRINTING: Produce Order / CORRER: PRODUCCIÓN: SERIGRAFÍA: Orden de producción")).toBe("screen");
  expect(deptOfTask("SCREEN PRINT: Reproduce Order / SERIGRAFÍA: Reproducir Orden")).toBe("screen");
  expect(deptOfTask("VINYL DEPARTMENT: Correct Order / DEPARTAMENTO DE VINILO: Corregir Orden")).toBe("vinyl");
  expect(deptOfTask("RUSH: VINYL DEPARTMENT: DTG: Produce Order / CORRER: PRODUCCIÓN: DTG: Orden de producción")).toBe("vinyl");
  // not work tasks
  expect(deptOfTask("SCREEN PRINT: Emulsion Screens / PRODUCCIÓN: SERIGRAFÍA: Pantallas de Emulsión")).toBe(null);
  expect(deptOfTask("PRODUCTION MANAGER: Quality Check / GERENTE DE PRODUCCIÓN: Control de calidad")).toBe(null);
  expect(deptOfTask("OUTSOURCED: Order Products / TERCERIZADA: Ordenar Productos")).toBe(null);
  const tasks = [
    T("1", "EMBROIDERY: Produce Order / BORDADO: Orden de producción"),
    T("2", "VINYL DEPARTMENT: DTF: Produce Order / x", "Completed"),
    T("3", "VINYL DEPARTMENT: STICKERS: Produce Order / x"),
  ];
  expect(openWorkTasks(tasks).map((t) => t.id)).toEqual(["1", "3"]);
  expect(openDeptTasks(tasks, "vinyl").map((t) => t.id)).toEqual(["3"]);
  expect(deptForCard("production-card-embroidery.html").key).toBe("embroidery");
  expect(deptForCard("production-card-colormatch.html")).toBe(null);
});

test("Close questions: David's four for everyone, the Pantone one for screen print", () => {
  expect(closeQuestionsFor("embroidery").map((q) => q.question)).toEqual([
    "Garments counted and sorted by size?",
    "Job completed according to mock-up, notes and standards, ensuring no drift from original artwork unless approved by client?",
    "Work space cleaned up and ready for next job?",
    "Products stocked, with any needs recorded for Inventory Ordering?",
  ]);
  expect(closeQuestionsFor("screen").pop().question).toBe("PANTONE amounts mixed and left over recorded in CRM?");
});

const screenOrder = (colors1, colors2) => ({
  products: [
    {
      productName: "Screen Printing",
      productType: "garment",
      primaryBranches: [
        {
          garmentType: "Gildan 5000 tee\nextra line",
          countColorSize: "Black\n6- M\n6- L",
          secondaryBranches: [{ colorsUsed: colors1 }, { colorsUsed: colors2 }],
        },
      ],
    },
    { productName: "Embroidery", productType: "garment", primaryBranches: [{ garmentType: "Cap", countColorSize: "Navy\n4- OSFA", secondaryBranches: [{ colorsUsed: "Madeira 1800" }] }] },
  ],
});

test("Pantones come from screen print colors only, in order, no repeats; house inks and HEX left out", () => {
  const p = pantonesOf(screenOrder("Pantone 186 C, House Black", "PMS 286 C\nPantone 186 C, #FF0000"));
  expect(p.map((x) => x.code)).toEqual(["186 C", "286 C"]);
  expect(p[0].where).toEqual(["Garment 1 - Graphic 1", "Garment 1 - Graphic 2"]);
  expect(pantonesOf({ products: [] })).toEqual([]);
});

test("Pantone slots: a code already on the Deal keeps its slot; new codes take the first empty ones; 9th has none", () => {
  const deal = { PANTONE_1: "Black 6 C", PANTONE_2: "186 C", PANTONE_2_Mixed: 250 };
  const rows = pantoneSlots(deal, [{ code: "186 C" }, { code: "286 C" }]);
  expect(rows).toEqual([
    { code: "186 C", slot: 2, mixed: 250, left: null },
    { code: "286 C", slot: 3, mixed: null, left: null },
  ]);
  const many = pantoneSlots({}, Array.from({ length: 9 }, (_, i) => ({ code: `${100 + i} C` })));
  expect(many.map((r) => r.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, null]);
  expect(pantoneFields(rows, "Mixed", ["300", " 120.5 g"])).toEqual({ PANTONE_2: "186 C", PANTONE_2_Mixed: 300, PANTONE_3: "286 C", PANTONE_3_Mixed: 120.5 });
  expect(pantoneFields(many, "Left", Array(9).fill("5"))).not.toHaveProperty("PANTONE_9");
});

test("grams: numbers 0 or more, blank or nonsense = null", () => {
  expect(grams("0")).toBe(0);
  expect(grams("1,250")).toBe(1250);
  expect(grams("12.34g")).toBe(12.3);
  expect(grams("")).toBe(null);
  expect(grams("-3")).toBe(null);
  expect(grams("lots")).toBe(null);
});

test("missing garments: picked from the order, one dated line appended", () => {
  const g = orderGarments(screenOrder("", ""));
  expect(g[0].garment).toBe("Gildan 5000 tee");
  expect(g[0].rows.map((r) => [r.color, r.size, r.count])).toEqual([["Black", "M", 6], ["Black", "L", 6]]);
  const line = missingLine({ quantity: 2, garment: "Gildan 5000 tee", color: "Black", size: "L", reason: "Supplier shorted us", note: "box 2 of 3", who: "Mastin", date: "2026-10-29" });
  expect(line).toBe("[2026-10-29 Mastin] 2 x Gildan 5000 tee Black L - Supplier shorted us. box 2 of 3");
  expect(appendDated("old text  ", line)).toBe("old text\n" + line);
  expect(appendDated("", line)).toBe(line);
});

test("a box that fires on each tick: untick first only when already ticked", () => {
  expect(reTick("Reorder_Needed", false)).toEqual([{ fields: { Reorder_Needed: true }, workflow: true }]);
  expect(reTick("Call_Client", true)).toEqual([
    { fields: { Call_Client: false }, workflow: false },
    { fields: { Call_Client: true }, workflow: true },
  ]);
});

const allYes = (dept) => Object.fromEntries(closeQuestionsFor(dept).map((q) => [q.key, "yes"]));

test("Close: every answer must be Yes; a No blocks with David's words", () => {
  const tasks = [T("1", "EMBROIDERY: Produce Order / x")];
  const ok = closePlan({ dept: "embroidery", tasks, closing: ["1"], answers: allYes("embroidery"), stage: "Mock-Up Approved / In Production" });
  expect(ok.problems).toEqual([]);
  const no = closePlan({ dept: "embroidery", tasks, closing: ["1"], answers: { ...allYes("embroidery"), clean: "no" }, stage: "x" });
  expect(no.problems).toEqual([`Work space cleaned up and ready for next job? - ${BLOCK_TEXT}`]);
  const blank = closePlan({ dept: "embroidery", tasks, closing: [], answers: {}, stage: "x" });
  expect(blank.problems).toHaveLength(5);
});

test("Close: screen print needs grams left for every Pantone, written to the Left fields", () => {
  const rows = [{ code: "186 C", slot: 2 }, { code: "286 C", slot: 3 }];
  const tasks = [T("1", "SCREEN PRINT: Produce Order / x")];
  const p = closePlan({ dept: "screen", tasks, closing: ["1"], answers: allYes("screen"), rows, inkLeft: ["40", ""], stage: "Mock-Up Approved / In Production" });
  expect(p.problems).toEqual(["Grams of ink left for Pantone 286 C."]);
  const p2 = closePlan({ dept: "screen", tasks, closing: ["1"], answers: allYes("screen"), rows, inkLeft: ["40", "0"], stage: "Mock-Up Approved / In Production" });
  expect(p2.problems).toEqual([]);
  expect(p2.fields).toEqual({ PANTONE_2: "186 C", PANTONE_2_Left: 40, PANTONE_3: "286 C", PANTONE_3_Left: 0 });
});

test("Close: the Deal moves to Quality Check only when no work task is left open, from a production stage", () => {
  const tasks = [T("1", "EMBROIDERY: Produce Order / x"), T("2", "SCREEN PRINT: Produce Order / x"), T("3", "SCREEN PRINT: Emulsion Screens / x")];
  const first = closePlan({ dept: "embroidery", tasks, closing: ["1"], answers: allYes("embroidery"), stage: "Mock-Up Approved / In Production" });
  expect(first.stage.move).toBe(false);
  expect(first.stage.reason).toBe("1 production task(s) still open: SCREEN PRINT: Produce Order");
  const last = closePlan({ dept: "screen", tasks: [tasks[0], tasks[1]].map((t, i) => (i === 0 ? { ...t, Status: "Completed" } : t)), closing: ["2"], answers: allYes("screen"), rows: [], stage: "Test Garment Approved" });
  expect(last.stage).toEqual({ move: true, to: "Quality Check", reason: "" });
  const notProd = closePlan({ dept: "embroidery", tasks: [tasks[0]], closing: ["1"], answers: allYes("embroidery"), stage: "Needs Pickup" });
  expect(notProd.stage.move).toBe(false);
  expect(notProd.stage.reason).toMatch(/not a production stage/);
});

test("notes: what was answered and done, and how a reopened card knows a department started", () => {
  const s = startNote({ dept: "screen", who: "Mastin", when: "2026-10-29 16:30", answers: { count: "yes", artwork: "yes", tools: "yes" }, rows: [{ code: "186 C", slot: 2 }, { code: "999 C", slot: null }], inkMixed: ["300", "20"] });
  expect(s.split("\n")[0]).toBe("Screen Print - STARTED - 2026-10-29 16:30 - Mastin");
  expect(s).toMatch(/Pantone 186 C: 300 g mixed/);
  expect(s).toMatch(/Pantone 999 C: 20 g mixed \(no free PANTONE slot/);
  const tasks = [T("1", "SCREEN PRINT: Produce Order / SERIGRAFÍA: x")];
  const c = closeNote({ dept: "screen", who: "Mastin", when: "w", tasks, closing: ["1"], answers: allYes("screen"), rows: [], inkLeft: [], feedback: { 1: "Screens held up" }, stage: { move: true, to: "Quality Check" } });
  expect(c).toMatch(/Closed: SCREEN PRINT: Produce Order \(Mastin\)\n  Feedback: Screens held up/);
  expect(c).toMatch(/Deal moved to Quality Check\./);
  const n = (t, content) => ({ Note_Title: FLOW_NOTE_TITLE, Created_Time: t, Note_Content: content });
  expect(deptStarted([], "screen")).toBe(false);
  expect(deptStarted([n("2026-10-29T10:00:00-06:00", s)], "screen")).toBe(true);
  expect(deptStarted([n("2026-10-29T10:00:00-06:00", s), n("2026-10-29T12:00:00-06:00", c)], "screen")).toBe(false);
  expect(deptStarted([n("2026-10-29T10:00:00-06:00", s)], "embroidery")).toBe(false);
});

test("E-159: the order's Pantone codes onto the Deal, only what changes, never blanked; off unless switched on", () => {
  const data = screenOrder("Pantone 186 C", "Pantone 286 C");
  expect(pantoneCodeFields({}, data)).toEqual({ PANTONE_1: "186 C", PANTONE_2: "286 C" });
  expect(pantoneCodeFields({ PANTONE_1: "186 C", PANTONE_2: "Black 6 C" }, data)).toEqual({ PANTONE_3: "286 C" });
  expect(pantoneCodeFields({ PANTONE_1: "186 C", PANTONE_2: "286 C" }, data)).toEqual({});
  expect(writePantonesOn({ writePantones: false })).toBe(false);
  expect(writePantonesOn({ writePantones: true })).toBe(true);
});

/* ---------- E-164 (D-75): outsourced work holds Quality Check; the Outsourced tab closes the Package task ---------- */
const ORDER = "OUTSOURCED: Order Products / TERCERIZADA: Ordenar Productos";
const ORDER_RUSH = "RUSH: OUTSOURCED: Order Products / CORRER: TERCERIZADA: Ordenar Productos";
const PACKAGE = "PRODUCTION MANAGER: Package Outsourced Products / GERENTE DE PRODUCCIÓN: Empaquetar Productos Tercerizados";
const AM = "ACCOUNT MANAGER: OUTSOURCED: Order Outsourced Product / GERENTE DE CUENTAS: TERCERIZADA: Orden Producto Subcontratado";
const DESIGN = "GRAPHIC DESIGN: OUTSOURCED: Artwork & Mock-Up / DISEÑO GRÁFICO: TERCERIZADA: Arte y Maqueta";

test("E-164: the real outsourced subjects (COQL 10-29): Package is the Outsourced tab's task, Order Products holds, the AM duplicate does not", () => {
  expect(deptOfTask(PACKAGE)).toBe("outsourced");
  expect(deptOfTask(ORDER)).toBe(null);
  expect(isOrderProductsTask(ORDER)).toBe(true);
  expect(isOrderProductsTask(ORDER_RUSH)).toBe(true);
  expect(isOrderProductsTask("OUTSOURCED: PATCHES: Order Products / x")).toBe(true);
  expect(isOrderProductsTask(AM)).toBe(false);
  expect(isOrderProductsTask(DESIGN)).toBe(false);
  expect(isOrderProductsTask("Order Outsourced product")).toBe(false);
  // E-165: the role-first names (Deluge 10-29) match too; old names stay matched while old tasks are open
  expect(isOrderProductsTask("ACCOUNT MANAGER: OUTSOURCED: Order Products / GERENTE DE CUENTAS: TERCERIZADA: Ordenar Productos")).toBe(true);
  expect(isOrderProductsTask("RUSH: ACCOUNT MANAGER: OUTSOURCED: Order Products / CORRER: GERENTE DE CUENTAS: TERCERIZADA: Ordenar Productos")).toBe(true);
  expect(deptOfTask("ACCOUNT MANAGER: OUTSOURCED: Order Products / x")).toBe(null);
  expect(deptOfTask(AM)).toBe(null);
  expect(deptOfTask(DESIGN)).toBe(null);
  const tasks = [T("1", ORDER), T("2", PACKAGE), T("3", AM), T("4", DESIGN), T("5", ORDER_RUSH, "Completed"), T("6", "EMBROIDERY: Produce Order / x")];
  expect(openOrderTasks(tasks).map((t) => t.id)).toEqual(["1"]);
  expect(openHoldTasks(tasks, true).map((t) => t.id)).toEqual(["2", "6", "1"]);
  // switch off = round 1 exactly: only the department work tasks
  expect(openHoldTasks(tasks, false).map((t) => t.id)).toEqual(["6"]);
  expect(openWorkTasks(tasks).map((t) => t.id)).toEqual(["6"]);
  expect(openDeptTasks(tasks, "outsourced").map((t) => t.id)).toEqual(["2"]);
});

test("E-164: the Outsourced tab has a flow only with the switch on; no start steps; David's two questions only", () => {
  expect(flowDeptFor("production-card-outsourced.html", { outsourcedOn: true }).key).toBe("outsourced");
  expect(flowDeptFor("production-card-outsourced.html", { outsourcedOn: false })).toBe(null);
  expect(flowDeptFor("production-card-outsourced.html", {})).toBe(null);
  expect(flowDeptFor("production-card-embroidery.html", {}).key).toBe("embroidery");
  expect(flowDeptFor("production-card-graphicdesign.html", { outsourcedOn: true })).toBe(null);
  expect(outsourcedOn(require("./productionConfig.json"))).toBe(true);
  expect(hasStartSteps("outsourced")).toBe(false);
  expect(hasStartSteps("screen")).toBe(true);
  expect(closeQuestionsFor("outsourced").map((q) => q.question)).toEqual([
    "Products counted and verified against mock-up, notes and original artwork?",
    "Products removed from supplier boxes and put into Print Plug / unbranded boxes?",
  ]);
  expect(closeQuestionsFor("outsourced", "package")).toEqual(closeQuestionsFor("outsourced"));
  expect(closeQuestionsFor("outsourced", "order").map((q) => q.question)).toEqual([
    "Mock-up verified against notes and client-provided artwork?",
    "Double-checked total count and variables of products ordered?",
  ]);
  expect(closeQuestionsFor("embroidery")).toHaveLength(4);
});

test("E-164: production finishing first waits for the outsourced order and packing; the Package close then moves the Deal", () => {
  const stage = "Mock-Up Approved / In Production";
  // embroidery closes last of production, but the order is not placed yet
  let tasks = [T("1", "EMBROIDERY: Produce Order / x"), T("2", ORDER, "Not Started", "Korie"), T("3", AM, "Not Started", "Korie")];
  let p = closePlan({ dept: "embroidery", tasks, closing: ["1"], answers: allYes("embroidery"), stage, withOutsourced: true });
  expect(p.stage.move).toBe(false);
  expect(p.stage.reason).toBe("1 production or outsourced task(s) still open: OUTSOURCED: Order Products");
  // the same with the switch off: moves, as round 1 did
  p = closePlan({ dept: "embroidery", tasks, closing: ["1"], answers: allYes("embroidery"), stage });
  expect(p.stage.move).toBe(true);
  // order placed (Order Products done, AM duplicate still open), Package open, production done -> held by Package only
  tasks = [T("1", "EMBROIDERY: Produce Order / x", "Completed"), T("2", ORDER, "Completed"), T("3", AM), T("4", PACKAGE, "Not Started", "Kris")];
  p = closePlan({ dept: "embroidery", tasks: [...tasks, T("5", "EMBROIDERY: Reproduce Order / x")], closing: ["5"], answers: allYes("embroidery"), stage, withOutsourced: true });
  expect(p.stage.reason).toBe("1 production or outsourced task(s) still open: PRODUCTION MANAGER: Package Outsourced Products");
  // the Production Manager closes Package on the Outsourced tab: two Yes -> the Deal moves (the AM duplicate is not counted)
  const ans = { verified: "yes", boxed: "yes" };
  p = closePlan({ dept: "outsourced", tasks, closing: ["4"], answers: ans, stage, withOutsourced: true });
  expect(p.problems).toEqual([]);
  expect(p.stage).toEqual({ move: true, to: "Quality Check", reason: "" });
  expect(p.fields).toEqual({});
  // a No blocks with David's words; blank asks for the answer
  p = closePlan({ dept: "outsourced", tasks, closing: ["4"], answers: { verified: "yes", boxed: "no" }, stage, withOutsourced: true });
  expect(p.problems).toEqual([`Products removed from supplier boxes and put into Print Plug / unbranded boxes? - ${BLOCK_TEXT}`]);
  // packing done before production: Package closes, the Deal waits for the embroidery task
  tasks = [T("1", "EMBROIDERY: Produce Order / x"), T("4", PACKAGE)];
  p = closePlan({ dept: "outsourced", tasks, closing: ["4"], answers: ans, stage, withOutsourced: true });
  expect(p.stage.move).toBe(false);
  expect(p.stage.reason).toBe("1 production task(s) still open: EMBROIDERY: Produce Order");
});

test("E-164: the Outsourced close notes (packing, order)", () => {
  const tasks = [T("4", PACKAGE, "Not Started", "Kris")];
  const c = closeNote({ dept: "outsourced", step: "package", who: "Kris", when: "w", tasks, closing: ["4"], answers: { verified: "yes", boxed: "yes" }, rows: [], inkLeft: [], feedback: {}, stage: { move: true, to: "Quality Check" } });
  expect(c.split("\n")).toEqual([
    "Outsourced packing - CLOSED - w - Kris",
    "Closed: PRODUCTION MANAGER: Package Outsourced Products (Kris)",
    "Products counted and verified against mock-up, notes and original artwork? Yes",
    "Products removed from supplier boxes and put into Print Plug / unbranded boxes? Yes",
    "Deal moved to Quality Check.",
  ]);
});

test("E-164: the Order step closes the order task with workflow (Zoho makes the Package task) and never moves the Deal", () => {
  const stage = "Mock-Up Approved / In Production";
  const ans = { mockup: "yes", ordered: "yes" };
  // nothing else open: still no move -- the Package task follows
  let p = closePlan({ dept: "outsourced", step: "order", tasks: [T("2", ORDER, "Not Started", "Korie")], closing: ["2"], answers: ans, stage, withOutsourced: true });
  expect(p.problems).toEqual([]);
  expect(p.close).toEqual(["2"]);
  expect(p.workflowOnClose).toBe(true);
  expect(p.stage).toEqual({ move: false, to: "Quality Check", reason: "the Package Outsourced Products task comes next" });
  // the package step and the work tabs close without workflow, as before
  expect(closePlan({ dept: "outsourced", step: "package", tasks: [T("4", PACKAGE)], closing: ["4"], answers: { verified: "yes", boxed: "yes" }, stage, withOutsourced: true }).workflowOnClose).toBe(false);
  expect(closePlan({ dept: "embroidery", tasks: [T("1", "EMBROIDERY: Produce Order / x")], closing: ["1"], answers: allYes("embroidery"), stage }).workflowOnClose).toBe(false);
  // a No blocks; the package questions are not asked here
  p = closePlan({ dept: "outsourced", step: "order", tasks: [T("2", ORDER_RUSH)], closing: ["2"], answers: { mockup: "yes", ordered: "no" }, stage, withOutsourced: true });
  expect(p.problems).toEqual([`Double-checked total count and variables of products ordered? - ${BLOCK_TEXT}`]);
  const c = closeNote({ dept: "outsourced", step: "order", who: "Korie", when: "w", tasks: [T("2", ORDER, "Not Started", "Korie")], closing: ["2"], answers: ans, rows: [], inkLeft: [], feedback: {}, stage: p.stage });
  expect(c.split("\n")).toEqual([
    "Outsourced order - CLOSED - w - Korie",
    "Closed: OUTSOURCED: Order Products (Korie)",
    "Mock-up verified against notes and client-provided artwork? Yes",
    "Double-checked total count and variables of products ordered? Yes",
    "Stage not moved: the Package Outsourced Products task comes next.",
  ]);
});

test("notes wording (David 10-29): the start artwork step mentions the notes", () => {
  expect(START_STEPS.find((s) => s.key === "artwork").question).toBe(
    "Print-ready artwork and placement verified with the mock-up, the notes and the original art, with a critical eye (no errors, no drift from the original)?"
  );
});

test("E-164: an Outsourced tab is needed while outsourced work is open (patches orders have no Outsourced card)", () => {
  const on = { outsourcedOn: true };
  expect(needsOutsourcedTab([T("1", ORDER)], on)).toBe(true);
  expect(needsOutsourcedTab([T("4", PACKAGE)], on)).toBe(true);
  expect(needsOutsourcedTab([T("1", ORDER, "Completed"), T("3", AM)], on)).toBe(false);
  expect(needsOutsourcedTab([T("1", ORDER)], { outsourcedOn: false })).toBe(false);
});

/* ---------- E-166: the expected total for each tab's job ---------- */
const mixedOrder = {
  products: [
    {
      productType: "garment",
      productName: "Embroidery",
      primaryBranches: [{ garmentType: "Port Authority K500 Polo\nnavy", countColorSize: "Navy\n4- S\n6- M\nWhite\n2- L", garmentQuantity: "12" }],
    },
    { productType: "garment", productName: "Screen Printing", primaryBranches: [{ garmentType: "Gildan 5000", countColorSize: "Black\n10- M", garmentQuantity: "10" }] },
    { productType: "nongarment", productName: "Business Cards", quantityOrdered: "250" },
    { productType: "nongarment", productName: "Patches", quantityOrdered: "24", isOutsourced: "Yes" },
    { productType: "gangsheet", productName: "DTF Gang Sheet", numberOfGangSheets: "3" },
  ],
};

test("E-166: each tab expects what its card shows, with colors and sizes; outsourced adds anything answered outsourced", () => {
  const emb = expectedFor(mixedOrder, "embroidery");
  expect(emb.total).toBe(12);
  expect(emb.items).toEqual([
    {
      item: "Port Authority K500 Polo",
      count: 12,
      colors: [
        { color: "Navy", count: 10, sizes: [{ size: "S", count: 4 }, { size: "M", count: 6 }] },
        { color: "White", count: 2, sizes: [{ size: "L", count: 2 }] },
      ],
      typed: "",
      unit: "pieces",
    },
  ]);
  expect(expectedFor(mixedOrder, "screen").total).toBe(10);
  const vinyl = expectedFor(mixedOrder, "vinyl");
  expect(vinyl.items.map((i) => [i.item, i.count, i.unit])).toEqual([["Patches", 24, "pieces"], ["DTF Gang Sheet", 3, "sheets"]]);
  expect(vinyl.total).toBe(24); // gang sheets are listed, not added to the pieces
  const out = expectedFor(mixedOrder, "outsourced");
  expect(out.items.map((i) => [i.item, i.count])).toEqual([["Business Cards", 250], ["Patches", 24]]);
  expect(out.total).toBe(274);
});

test("E-166: sizes that can't be read are shown as typed; no products -> nothing to show; switch and question keys", () => {
  const odd = { products: [{ productType: "garment", productName: "Embroidery", primaryBranches: [{ garmentType: "Cap", countColorSize: "see mock-up", garmentQuantity: "6" }] }] };
  expect(expectedFor(odd, "embroidery").items[0]).toMatchObject({ count: 6, colors: [], typed: "see mock-up" });
  expect(expectedFor({ products: [] }, "screen")).toEqual({ total: 0, items: [] });
  expect(expectedFor(null, "screen")).toEqual({ total: 0, items: [] });
  expect(expectedCountsOn(require("./productionConfig.json"))).toBe(true);
  expect(expectedCountsOn({})).toBe(false);
  // every key names a real count question
  const keys = [...START_STEPS, ...closeQuestionsFor("screen"), ...closeQuestionsFor("outsourced", "order"), ...closeQuestionsFor("outsourced", "package")]
    .filter((q) => COUNT_QUESTION_KEYS.includes(q.key))
    .map((q) => q.key);
  expect(keys).toEqual(["count", "sorted", "ordered", "verified"]);
});

/* ---------- E-168: past due / due today, this tab's tasks only ---------- */
const D = (id, Subject, Due_Date, Status = "Not Started") => ({ ...T(id, Subject, Status), Due_Date });
test("E-168: only this tab's open tasks, late (most late first) and due today; no date or completed = neither", () => {
  const tasks = [
    D("1", "SCREEN PRINT: Produce Order / x", "2026-10-27"),
    D("2", "SCREEN PRINT: Reproduce Order / x", "2026-10-29"),
    D("3", "EMBROIDERY: Produce Order / x", "2026-10-20"), // another tab
    D("4", "SCREEN PRINT: Correct Order / x", "2026-10-01", "Completed"),
    D("5", "SCREEN PRINT: Produce Order / y", ""),
    D("6", "SCREEN PRINT: Produce Order / z", "2026-10-30"),
    D("7", "SCREEN PRINT: Produce Order / w", "2026-10-25"),
  ];
  const s = dueStatus(tasks, "screen", "2026-10-29");
  expect(s.late.map((l) => [l.task.id, l.days])).toEqual([["7", 4], ["1", 2]]);
  expect(s.today.map((x) => x.task.id)).toEqual(["2"]);
  expect(lateLine(s.late[1])).toBe("SCREEN PRINT: Produce Order, due Oct 27, 2 days late");
  expect(lateLine({ task: T("9", "VINYL DEPARTMENT: Produce Order / x"), due: "2026-10-28", days: 1 })).toBe(
    "VINYL DEPARTMENT: Produce Order, due Oct 28, 1 day late"
  );
  expect(dueStatus(tasks, "embroidery", "2026-10-29").late.map((l) => l.task.id)).toEqual(["3"]);
  expect(dueStatus(tasks, "screen", "")).toEqual({ late: [], today: [] });
});

test("E-168: the Outsourced tab watches its order and packing tasks; the switch", () => {
  const tasks = [D("1", ORDER, "2026-10-28"), D("2", PACKAGE, "2026-10-29"), D("3", AM, "2026-10-01"), D("4", "EMBROIDERY: Produce Order / x", "2026-10-01")];
  expect(tabTasks(tasks, "outsourced").map((t) => t.id)).toEqual(["1", "2"]);
  const s = dueStatus(tasks, "outsourced", "2026-10-29");
  expect(s.late.map((l) => l.task.id)).toEqual(["1"]);
  expect(s.today.map((x) => x.task.id)).toEqual(["2"]);
  expect(dueFlagsOn(require("./productionConfig.json"))).toBe(true);
  expect(dueFlagsOn({})).toBe(false);
});

test("E-167 / D-76: the cards' Revision / Correction button is switched on, and the revision form lives in main", () => {
  expect(require("./productionConfig.json").revisionInCardsOn).toBe(true);
  expect(typeof require("../revision/RevisionApp").default).toBe("function");
});

