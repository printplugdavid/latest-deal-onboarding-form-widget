import { countFieldForTask, planTaskRestamp, restampLine } from "./taskRestamp";

// Every subject that carried a Print_Count between 2026-08-15 and 2026-10-08, verbatim from the CRM.
const REAL = [
  ["EMBROIDERY: Produce Order / BORDADO: Orden de producción", "Embroidery_Department_Prints"],
  ["RUSH: EMBROIDERY: Produce Order / CORRER: BORDADO: Orden de producción", "Embroidery_Department_Prints"],
  ["SCREEN PRINT: Produce Order / SERIGRAFÍA: Orden de producción", "Screen_Print_Prints"],
  ["RUSH: SCREEN PRINTING: Produce Order / CORRER: PRODUCCIÓN: SERIGRAFÍA: Orden de producción", "Screen_Print_Prints"],
  ["OUTSOURCED: Order Products / TERCERIZADA: Ordenar Productos", "Outsourced_Prints"],
  ["RUSH: OUTSOURCED: Order Products / CORRER: TERCERIZADA: Ordenar Productos", "Outsourced_Prints"],
  ["VINYL DEPARTMENT: DTF: Produce Order / DEPARTAMENTO DE VINILO: DTF: Orden de producción", "DTF_Prints"],
  ["RUSH: VINYL DEPARTMENT: DTF: Produce Order / CORRER: DEPARTAMENTO DE VINILO: DTF: Orden de producción", "DTF_Prints"],
  ["VINYL DEPARTMENT: DTG: Produce Order / DEPARTAMENTO DE VINILO: DTG: Orden de producción", "DTG_Prints"],
  ["RUSH: VINYL DEPARTMENT: DTG: Produce Order / CORRER: PRODUCCIÓN: DTG: Orden de producción", "DTG_Prints"],
  ["VINYL DEPARTMENT: HTV: Produce Order / DEPARTAMENTO DE VINILO: HTV: Orden de producción", "HTV_Prints"],
  ["VINYL DEPARTMENT: DECALS: Produce Order / DEPARTAMENTO DE VINILO: CALCOMANÍAS: Orden de producción", "Decals_Prints"],
  ["VINYL DEPARTMENT: STICKERS: Produce Order / DEPARTAMENTO DE VINILO: PEGATINAS: Orden de producción", "Stickers_Prints"],
  ["VINYL DEPARTMENT: MAGNETS: Produce Order / DEPARTAMENTO DE VINILO: IMANES: Orden de producción", "Magnets_Prints"],
  ["VINYL DEPARTMENT: BANNERS: Produce Order / DEPARTAMENTO DE VINILO: BANNERS: Orden de producción", "Banners_Prints"],
  ["VINYL DEPARTMENT: PATCHES: Produce Order / DEPARTAMENTO DE VINILO: PARCHES: Orden de producción", "Patches_Prints"],
  ["RUSH: VINYL DEPARTMENT: DTF GANG SHEET: Produce Order / CORRER: DEPARTAMENTO DE VINILO: HOJA DE GANG DTF: Orden de producción", "DTF_Gang_Sheet_Prints"],
];
const NEVER = [
  "EMBROIDERY: Reproduce Order / BORDADO: Reproducir Orden",
  "SCREEN PRINT: Reproduce Order / SERIGRAFÍA: Reproducir Orden",
  "VINYL DEPARTMENT: Reproduce Order / DEPARTAMENTO DE VINILO: Reproducir Orden",
  "SCREEN PRINT: Correct Order / SERIGRAFÍA: Corregir Orden",
  "VINYL DEPARTMENT: Correct Order / DEPARTAMENTO DE VINILO: Corregir Orden",
  "SCREEN PRINT: 4- more shirts added see notes Correct Order / SERIGRAFÍA: Corregir Orden",
  "RUSH: VINYL DEPARTMENT: Produce Order / CORRER: DEPARTAMENTO DE VINILO: Orden de producción", // which job? not knowable
  "ACCOUNT MANAGER: Re-Order Garments",
  "EMBROIDERY: Digitize Artwork / BORDADO: Digitalización de ilustraciones",
  "SCREEN PRINT: Burn Screens / SERIGRAFÍA: Quemar pantallas",
  "GRAPHIC DESIGN: EMBROIDERY: Artwork & Mock-Up",
  "VINYL DEPARTMENT: SOMETHING NEW: Produce Order",
  "",
  undefined,
];

describe("which count a task holds (E-43)", () => {
  test.each(REAL)("%s", (subject, field) => expect(countFieldForTask(subject)).toBe(field));
  test("tasks that are never re-stamped", () => NEVER.forEach((s) => expect(countFieldForTask(s)).toBeNull()));
});

describe("planning the re-stamp (E-43)", () => {
  const WHEN = "2026-10-08 10:30";
  const counts = { Embroidery_Department_Prints: 1800, Screen_Print_Prints: 2950, DTF_Prints: 0 };
  // Ammo Squared Deal 12 as it stood on 2026-10-08: two generations of produce tasks.
  const AMMO = [
    { id: "t1", Subject: REAL[0][0], Status: "In Progress", Print_Count: 2400, Description: "Hats" },
    { id: "t2", Subject: REAL[0][0], Status: "Not Started", Print_Count: 3000, Description: null },
    { id: "t3", Subject: REAL[2][0], Status: "Not Started", Print_Count: 2950 },
    { id: "t4", Subject: "EMBROIDERY: Digitize Artwork / BORDADO", Status: "Not Started", Print_Count: null },
  ];

  test("open embroidery tasks move to the new count; the unchanged screen-print task is left alone", () => {
    const plan = planTaskRestamp(AMMO, counts, WHEN);
    expect(plan.map((p) => [p.id, p.from, p.to])).toEqual([
      ["t1", 2400, 1800],
      ["t2", 3000, 1800],
    ]);
    expect(plan[0].description).toBe("Hats\n\n" + restampLine(2400, 1800, WHEN));
    expect(plan[1].description).toBe(restampLine(3000, 1800, WHEN));
  });

  test("a completed task keeps its count", () => {
    expect(planTaskRestamp([{ ...AMMO[0], Status: "Completed" }], counts, WHEN)).toEqual([]);
  });

  test("an in-progress task IS re-stamped (David, 2026-10-08)", () => {
    expect(planTaskRestamp([AMMO[0]], counts, WHEN)).toHaveLength(1);
  });

  test("a product removed by the amendment drops its task to 0, and says so", () => {
    const plan = planTaskRestamp([{ id: "d", Subject: REAL[6][0], Status: "Not Started", Print_Count: 40 }], counts, WHEN);
    expect(plan[0].to).toBe(0);
    expect(plan[0].description).toContain("40 -> 0");
  });

  test("nothing is written blind: an unreadable count or a missing field is skipped", () => {
    expect(planTaskRestamp([{ id: "x", Subject: REAL[0][0], Status: "Not Started" }], counts, WHEN)).toEqual([]);
    expect(planTaskRestamp([{ id: "y", Subject: REAL[8][0], Status: "Not Started", Print_Count: 5 }], counts, WHEN)).toEqual([]);
    expect(planTaskRestamp(null, counts, WHEN)).toEqual([]);
  });

  test("a blank count on an open task is filled", () => {
    const plan = planTaskRestamp([{ id: "b", Subject: REAL[0][0], Status: "Not Started", Print_Count: null }], counts, WHEN);
    expect(plan[0].from).toBeNull();
    expect(plan[0].description).toContain("(blank) -> 1800");
  });
});
