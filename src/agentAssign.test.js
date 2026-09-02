/*
 * These pin the port against the Deluge it replaces. If the form is going to
 * own Revision_Agent, it has to reach the same answer the function did --
 * including the parts that look like quirks.
 */
import { deriveAgents } from "./agentAssign";

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

const run = (categories, departments, completedTasks = TASKS) =>
  deriveAgents({ categories, departments, completedTasks, allowedNames: NAMES });

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

  test("Shipped Damaged alongside another category still assigns", () => {
    const r = run(
      ["Damaged Product (Shipped Damaged)", "Misprint (Wrong Colors)"],
      ["Screen Printing"]
    );
    expect(r.agents).toEqual(["Yefri Rivera"]);
  });

  test("a Misorder also pulls in whoever ordered the garments", () => {
    expect(run(["Wrong Product Size (Misorder)"], ["Screen Printing"]).agents).toEqual([
      "Yefri Rivera",
      "Ray Castaneda",
    ]);
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
    // A Misorder already pulls in whoever ordered the garments, which is why an
    // "Ordering" department was redundant and was removed from the form.
    const r = run(["Wrong Product Type (Misorder)"], ["Screen Printing"]);
    expect(r.agents).toEqual(["Yefri Rivera", "Ray Castaneda"]);
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
      completedTasks: [{ Subject: "SCREEN PRINT: Produce Order", Owner: { id: "77" } }],
      userNameById: { 77: "Drew Byrd" },
      allowedNames: NAMES,
    });
    expect(r.agents).toEqual(["Drew Byrd"]);
  });

  test("no categories means no agents", () => {
    expect(run([], ["Screen Printing"]).agents).toEqual([]);
  });
});
