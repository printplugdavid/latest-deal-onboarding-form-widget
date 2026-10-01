/*
 * These pin the port against the Deluge it replaces. If the form is going to
 * own Revision_Agent, it has to reach the same answer the function did --
 * including the parts that look like quirks.
 */
import { deriveAgents, orderTasksForTrace } from "./agentAssign";

const NAMES = [
  "Drew Byrd",
  "David Byrd",
  "Korie Byrd",
  "Ray Castaneda",
  "Desi Mastin",
  "Yefri Rivera",
  "David Rodriguez",
  "Rivelino Seva",
  "Angela Zervudakis",
];

const task = (Subject, name) => ({ Subject, Status: "Completed", Owner: { id: "1", name } });

const TASKS = [
  task("SCREEN PRINT: Produce Order / IMPRESIÓN: Producir pedido", "Yefri Rivera"),
  task("EMBROIDERY: Produce Order / BORDADO: Producir pedido", "Desi Mastin"),
  task("VINYL DEPARTMENT: Produce Order", "David Rodriguez"),
  task("ACCOUNT MANAGER: Order Garments / Reordenar", "Ray Castaneda"),
];

const run = (categories, departments, tasks = TASKS) =>
  deriveAgents({ categories, departments, tasks, allowedNames: NAMES });

describe("deriveAgents — matches the Deluge", () => {
  test("a standard revision takes the department's Produce Order owner", () => {
    expect(run(["Misprint (Wrong Colors)"], ["Screen Printing"]).agents).toEqual(["Yefri Rivera"]);
  });

  test("multiple departments each contribute their own owner", () => {
    expect(run(["Misprint (Placement)"], ["Screen Printing", "Embroidery"]).agents).toEqual([
      "Yefri Rivera",
      "Desi Mastin",
    ]);
  });

  test("Shipped Damaged alone assigns nobody", () => {
    const r = run(["Damaged Product (Shipped Damaged)"], ["Screen Printing"]);
    expect(r.agents).toEqual([]);
  });

  test("Missing Product alone assigns nobody — a lost garment is not traceable", () => {
    const r = run(["Missing Product"], ["Screen Printing"]);
    expect(r.agents).toEqual([]);
  });

  test("Missing Product does not pull the order-garments owner either", () => {
    // It is not a misorder; nobody demonstrably lost it.
    const r = run(["Missing Product"], ["Screen Printing", "Embroidery"]);
    expect(r.agents).toEqual([]);
  });

  test("Missing Product alongside a misprint still attributes the misprint", () => {
    const r = run(["Missing Product", "Misprint (Wrong Colors)"], ["Screen Printing"]);
    expect(r.agents).toEqual(["Yefri Rivera"]);
  });

  test("Shipped Damaged alongside another category still assigns", () => {
    const r = run(
      ["Damaged Product (Shipped Damaged)", "Misprint (Wrong Colors)"],
      ["Screen Printing"]
    );
    expect(r.agents).toEqual(["Yefri Rivera"]);
  });

  // D-26 (2026-10-01): this used to read ["Yefri Rivera", "Ray Castaneda"].
  test("a Misorder still names the producer; the orderer is returned separately", () => {
    const r = run(["Wrong Product Size (Misorder)"], ["Screen Printing"]);
    expect(r.agents).toEqual(["Yefri Rivera"]);
    expect(r.orderingIssue).toBe(true);
    expect(r.orderingAgent).toBe("Ray Castaneda");
  });

  test("pre-rename 'Vinyl & Digital Print' resolves the same as 'Vinyl Department'", () => {
    expect(run(["Misprint (Other)"], ["Vinyl & Digital Print"]).agents).toEqual(["David Rodriguez"]);
    expect(run(["Misprint (Other)"], ["Vinyl Department"]).agents).toEqual(["David Rodriguez"]);
  });

  test("Outsourced and Graphic Design always add their standing owner", () => {
    expect(run(["Misprint (Other)"], ["Outsourced"]).agents).toEqual(["Korie Byrd"]);
    expect(run(["Misprint (Other)"], ["Graphic Design"]).agents).toEqual(["Rivelino Seva"]);
  });

  test("Reproduce and Correct tasks are ignored, so a second revision does not self-assign", () => {
    const tasks = [
      task("SCREEN PRINT: Reproduce Order", "Drew Byrd"),
      task("SCREEN PRINT: Correct Order", "Angela Zervudakis"),
      task("SCREEN PRINT: Produce Order", "Yefri Rivera"),
    ];
    expect(run(["Misprint (Other)"], ["Screen Printing"], tasks).agents).toEqual(["Yefri Rivera"]);
  });

  test("no duplicates when two departments share an owner", () => {
    const tasks = [
      task("SCREEN PRINT: Produce Order", "Yefri Rivera"),
      task("EMBROIDERY: Produce Order", "Yefri Rivera"),
    ];
    expect(run(["Misprint (Other)"], ["Screen Printing", "Embroidery"], tasks).agents).toEqual([
      "Yefri Rivera",
    ]);
  });
});

describe("deriveAgents — what the Deluge swallowed", () => {
  test("ordering accountability comes from the category, not a department", () => {
    // A Misorder already identifies whoever ordered the garments, which is why an
    // "Ordering" department was redundant and was removed from the form. Since
    // D-26 that name lands on Ordering_Agent, not on the agent field.
    const r = run(["Wrong Product Type (Misorder)"], ["Screen Printing"]);
    expect(r.agents).toEqual(["Yefri Rivera"]);
    expect(r.orderingAgent).toBe("Ray Castaneda");
  });

  test("a genuinely unknown department is still reported", () => {
    const r = run(["Misprint (Other)"], ["Something New"]);
    expect(r.unmappedDepartments).toEqual(["Something New"]);
  });

  test("a department with no matching completed task is reported", () => {
    const r = run(["Misprint (Other)"], ["Screen Printing"], []);
    expect(r.agents).toEqual([]);
    expect(r.misses).toEqual(["Screen Printing"]);
  });

  test("Client Unhappy behaves as a standard revision", () => {
    expect(run(["Client Unhappy"], ["Embroidery"]).agents).toEqual(["Desi Mastin"]);
  });

  test("a name that is not on the picklist is dropped rather than rejected on write", () => {
    const tasks = [task("SCREEN PRINT: Produce Order", "Someone Who Left")];
    const r = run(["Misprint (Other)"], ["Screen Printing"], tasks);
    expect(r.agents).toEqual([]);
    expect(r.rejected).toEqual(["Someone Who Left"]);
  });

  test("falls back to the user map when Owner carries only an id", () => {
    const r = deriveAgents({
      categories: ["Misprint (Other)"],
      departments: ["Screen Printing"],
      tasks: [{ Subject: "SCREEN PRINT: Produce Order", Owner: { id: "77" } }],
      userNameById: { 77: "Drew Byrd" },
      allowedNames: NAMES,
    });
    expect(r.agents).toEqual(["Drew Byrd"]);
  });

  test("no categories means no agents", () => {
    expect(run([], ["Screen Printing"]).agents).toEqual([]);
  });
});

/*
 * D-21 -- the two embroidery revisions of 2026-09-22 that credited nobody.
 * Angela Zervudakis owned the EMBROIDERY: Produce Order task on both, and was
 * never a candidate because that task was still open when the form ran. The
 * ordering helper is the fix; these pin it.
 */
describe("orderTasksForTrace — open tasks must survive (D-21)", () => {
  const open = (Subject, name) => ({ Subject, Status: "In Progress", Owner: { id: "9", name } });
  const notStarted = (Subject, name) => ({ Subject, Status: "Not Started", Owner: { id: "8", name } });

  test("an OPEN produce-order task still yields the producing agent", () => {
    // Honor Plumbing 5249739000123698131: task In Progress, revision filed anyway.
    const tasks = orderTasksForTrace([], [
      open("EMBROIDERY: Produce Order / BORDADO: Orden de producción", "Angela Zervudakis"),
    ]);
    expect(run(["Misprint (Malfunction)"], ["Embroidery"], tasks).agents).toEqual([
      "Angela Zervudakis",
    ]);
  });

  // D-22 put both on the agent field. D-26 (2026-10-01) moved the orderer to its own field.
  test("a Misorder names the producer on the agent field and the orderer on orderingAgent", () => {
    // Honor Plumbing again: produce task open, Order Garments completed.
    const tasks = orderTasksForTrace(
      [task("ACCOUNT MANAGER: Order Garments & Materials", "Korie Byrd")],
      [open("EMBROIDERY: Produce Order / BORDADO: Orden de producción", "Angela Zervudakis")]
    );
    const r = run(["Wrong Product Type (Misorder)"], ["Embroidery"], tasks);
    expect(r.agents).toEqual(["Angela Zervudakis"]);
    expect(r.orderingIssue).toBe(true);
    expect(r.orderingAgent).toBe("Korie Byrd");
  });

  test("a COMPLETED task still wins over an open one for the same department", () => {
    const tasks = orderTasksForTrace(
      [task("EMBROIDERY: Produce Order", "Desi Mastin")],
      [open("EMBROIDERY: Produce Order", "Angela Zervudakis")]
    );
    expect(run(["Misprint (Other)"], ["Embroidery"], tasks).agents).toEqual(["Desi Mastin"]);
  });

  test("ordering puts completed first regardless of which list they arrived in", () => {
    const out = orderTasksForTrace(
      [open("A", "x"), task("B", "y")],
      [task("C", "z"), open("D", "w")]
    );
    expect(out.map((t) => t.Subject)).toEqual(["B", "C", "A", "D"]);
  });

  test("tolerates missing lists", () => {
    expect(orderTasksForTrace()).toEqual([]);
    expect(orderTasksForTrace(null, null)).toEqual([]);
  });

  /*
   * The latent trap found 2026-09-29: live task names spell the reorder task
   * BOTH ways -- "ACCOUNT MANAGER: Re-Order Garments" (Evergreen) and
   * "ACCOUNT MANAGER: Reorder Needed" (Honor Plumbing). The old guard tested for
   * the hyphenated spelling only, so the unhyphenated one was one rename away
   * from being mistaken for the original order task.
   */
  describe("remediation tasks are excluded whichever way they are spelled", () => {
    test("Re-Order and Reorder are both excluded from the ordering trace", () => {
      for (const subject of [
        "ACCOUNT MANAGER: Re-Order Garments / GERENTE DE CUENTAS: Reordenar prendas",
        "ACCOUNT MANAGER: Reorder Garments",
        "ACCOUNT MANAGER: REORDER GARMENTS",
      ]) {
        const r = run(["Wrong Product Type (Misorder)"], ["Embroidery"], [task(subject, "Korie Byrd")]);
        expect(r.agents).toEqual([]);
        expect(r.orderOwnerMissing).toBe(true);
      }
    });

    test("a genuine Order Garments task is NOT excluded", () => {
      const r = run(
        ["Wrong Product Type (Misorder)"],
        ["Embroidery"],
        [task("ACCOUNT MANAGER: Order Garments & Materials", "Korie Byrd")]
      );
      expect(r.agents).toEqual([]);
      expect(r.orderingAgent).toBe("Korie Byrd");
      expect(r.orderOwnerMissing).toBe(false);
    });

    test("\"Pre-Order\" is NOT swallowed by the reorder guard", () => {
      // Guarding the guard: stripping hyphens would turn PRE-ORDER into PREORDER,
      // which contains REORDER. The \\b anchor is what prevents that.
      const r = run(
        ["Wrong Product Type (Misorder)"],
        ["Embroidery"],
        [task("ACCOUNT MANAGER: Pre-Order Garments", "Korie Byrd")]
      );
      expect(r.orderingAgent).toBe("Korie Byrd");
    });

    test("Reproduce and Correct Order are excluded from the producing trace", () => {
      for (const subject of [
        "EMBROIDERY: Reproduce Order / BORDADO: Reproducir Orden",
        "EMBROIDERY: Re-Produce Order",
        "EMBROIDERY: Correct Order",
      ]) {
        const r = run(["Misprint (Other)"], ["Embroidery"], [notStarted(subject, "Angela Zervudakis")]);
        expect(r.agents).toEqual([]);
        expect(r.misses).toEqual(["Embroidery"]);
      }
    });
  });
});

/*
 * D-26 (David, 2026-10-01): "We are just moving them from Revision_Agent to
 * Ordering_Agent basically. Same with the graphic design issue." The producer
 * is traced exactly as before; the orderer and the designer get their own fields.
 */
describe("D-26 — the orderer and the designer have their own fields", () => {
  const GTASKS = TASKS.concat([
    task("GRAPHIC DESIGN: EMBROIDERY: Artwork & Mock-Up / DISEÑO GRÁFICO", "Rivelino Seva"),
    task("GRAPHIC DESIGN: Finalize Graphics & Artwork", "Rivelino Seva"),
    task("GRAPHIC DESIGN: Mock-Up Revision", "Desi Mastin"),
  ]);

  test("a plain misprint raises neither", () => {
    const r = run(["Misprint (Wrong Colors)"], ["Screen Printing"], GTASKS);
    expect(r.agents).toEqual(["Yefri Rivera"]);
    expect(r.orderingIssue).toBe(false);
    expect(r.orderingAgent).toBe("");
    expect(r.graphicIssue).toBe(false);
    expect(r.graphicAgents).toEqual([]);
  });

  test("Misorder with no order task: flagged, orderer left empty, producer still named", () => {
    const r = run(["Wrong Product Type (Misorder)"], ["Embroidery"], [
      task("EMBROIDERY: Produce Order", "Angela Zervudakis"),
    ]);
    expect(r.orderingIssue).toBe(true);
    expect(r.orderingAgent).toBe("");
    expect(r.orderOwnerMissing).toBe(true);
    expect(r.agents).toEqual(["Angela Zervudakis"]);
  });

  test("an OUTSOURCED: Order Products owner counts as the orderer", () => {
    const r = run(["Wrong Product Type (Misorder)"], ["Outsourced"], [
      task("OUTSOURCED: Order Products", "Korie Byrd"),
    ]);
    expect(r.orderingAgent).toBe("Korie Byrd");
  });

  test("the orderer is checked against Ordering_Agent's OWN option list", () => {
    // Live 2026-10-01: Ordering_Agent has Brad Byfield and has no Yefri Rivera.
    const ordering = ["Korie Byrd", "Brad Byfield"];
    const ok = deriveAgents({
      categories: ["Wrong Product Type (Misorder)"],
      departments: ["Embroidery"],
      tasks: [task("ACCOUNT MANAGER: Order Garments & Materials", "Brad Byfield")],
      allowedNames: NAMES,
      allowedOrderingNames: ordering,
    });
    expect(ok.orderingAgent).toBe("Brad Byfield");
    const no = deriveAgents({
      categories: ["Wrong Product Type (Misorder)"],
      departments: ["Embroidery"],
      tasks: [task("ACCOUNT MANAGER: Order Garments & Materials", "Yefri Rivera")],
      allowedNames: NAMES,
      allowedOrderingNames: ordering,
    });
    expect(no.orderingAgent).toBe("");
    expect(no.rejected).toEqual(["Yefri Rivera"]);
  });

  test("Wrong Graphic names every designer once, and still names the producer", () => {
    const r = run(["Misprint (Wrong Graphic)"], ["Screen Printing"], GTASKS);
    expect(r.graphicIssue).toBe(true);
    expect(r.graphicAgents).toEqual(["Rivelino Seva", "Desi Mastin"]);
    expect(r.agents).toEqual(["Yefri Rivera"]);
    expect(r.orderingIssue).toBe(false);
  });

  test("Design Issues (Poor Graphics) names the designers", () => {
    const r = run(["Design Issues (Poor Graphics)"], ["Embroidery"], GTASKS);
    expect(r.graphicIssue).toBe(true);
    expect(r.graphicAgents).toEqual(["Rivelino Seva", "Desi Mastin"]);
  });

  test("a graphic fault with no GRAPHIC DESIGN task: flagged, nobody named", () => {
    const r = run(["Design Issues (Poor Graphics)"], ["Embroidery"]);
    expect(r.graphicIssue).toBe(true);
    expect(r.graphicAgents).toEqual([]);
  });

  test("a Misorder and a graphic fault together fill all three", () => {
    const r = run(["Wrong Product Type (Misorder)", "Misprint (Wrong Graphic)"], ["Screen Printing"], GTASKS);
    expect(r.agents).toEqual(["Yefri Rivera"]);
    expect(r.orderingAgent).toBe("Ray Castaneda");
    expect(r.graphicAgents).toEqual(["Rivelino Seva", "Desi Mastin"]);
  });

  test("Missing Product alone still flags nothing at all", () => {
    const r = run(["Missing Product"], ["Screen Printing"], GTASKS);
    expect(r.agents).toEqual([]);
    expect(r.orderingIssue).toBe(false);
    expect(r.graphicIssue).toBe(false);
  });
});
