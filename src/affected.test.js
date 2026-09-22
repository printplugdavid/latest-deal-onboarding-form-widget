/*
 * The point of these: a correction must cost only the placements actually
 * redone. A shirt with three placements where one needs fixing is one
 * placement's worth of work, not three -- and getting that wrong overstates
 * every correction the shop logs.
 */
import {
  costItem,
  gangPerSheet,
  isGangSheet,
  placementsOf,
  syntheticProducts,
  embroiderySizes,
  effectiveQty,
  formatSizes,
  SIZE_OPTIONS,
  OTHER_SIZE,
} from "./affected";
import { computePrints } from "./printMath";

// One screen-print garment: 2 graphics, 2 placements each, 1 colour, no underbase.
const PRODUCTS = [
  {
    productName: "Screen Printing",
    productType: "garment",
    primaryBranches: [
      {
        garmentType: "Gildan 5000 Black",
        garmentQuantity: "100",
        secondaryBranches: [
          {
            graphicDescription: "Front logo",
            numberOfColorsUsed: "1",
            numberOfPlacements: "2",
            tartiaryBranches: [{ placementLocation: "Front" }, { placementLocation: "Left Sleeve" }],
          },
          {
            graphicDescription: "Back sponsors",
            numberOfColorsUsed: "1",
            numberOfPlacements: "2",
            tartiaryBranches: [{ placementLocation: "Back" }, { placementLocation: "Right Sleeve" }],
          },
        ],
      },
    ],
  },
];

const branch = PRODUCTS[0].primaryBranches[0];
const cost = (item, formType) => computePrints(syntheticProducts(PRODUCTS, item, formType));

describe("placementsOf", () => {
  test("flattens every placement across every graphic", () => {
    const all = placementsOf(branch);
    expect(all.map((x) => x.key)).toEqual(["0:0", "0:1", "1:0", "1:1"]);
    expect(all[2].placement.placementLocation).toBe("Back");
    expect(all[2].gi).toBe(1);
  });

  test("a graphic with a placement count but no detail still offers slots", () => {
    const sparse = { secondaryBranches: [{ numberOfPlacements: "3" }] };
    const all = placementsOf(sparse);
    expect(all).toHaveLength(3);
    expect(all[0].placement).toBeNull();
  });

  test("no graphics means no placements, not a crash", () => {
    expect(placementsOf(null)).toEqual([]);
    expect(placementsOf({})).toEqual([]);
  });
});

describe("a correction costs only the placements ticked", () => {
  test("one placement of three-plus is one placement's work", () => {
    const r = cost({ productIndex: 0, garmentIndex: 0, placementKeys: ["0:0"], affected: "5" }, "Correction");
    expect(r.SD).toBe(5); // 5 garments x 1 colour x 1 placement
  });

  test("two placements on the same graphic double it", () => {
    const r = cost(
      { productIndex: 0, garmentIndex: 0, placementKeys: ["0:0", "0:1"], affected: "5" },
      "Correction"
    );
    expect(r.SD).toBe(10);
  });

  test("placements spanning two graphics are counted against each graphic", () => {
    const r = cost(
      { productIndex: 0, garmentIndex: 0, placementKeys: ["0:0", "1:1"], affected: "5" },
      "Correction"
    );
    expect(r.SD).toBe(10); // 5x1x1 for each of the two graphics
  });

  test("a graphic with nothing ticked drops out entirely", () => {
    const synth = syntheticProducts(
      PRODUCTS,
      { productIndex: 0, garmentIndex: 0, placementKeys: ["1:0"], affected: "5" },
      "Correction"
    );
    expect(synth[0].primaryBranches[0].secondaryBranches).toHaveLength(1);
    expect(synth[0].primaryBranches[0].secondaryBranches[0].graphicDescription).toBe(
      "Back sponsors"
    );
  });

  test("nothing ticked costs nothing rather than silently costing everything", () => {
    expect(syntheticProducts(PRODUCTS, { productIndex: 0, garmentIndex: 0, placementKeys: [], affected: "5" }, "Correction")).toEqual([]);
  });
});

describe("a revision still reprints the whole garment", () => {
  test("every graphic and every placement, regardless of what was ticked", () => {
    const r = cost({ productIndex: 0, garmentIndex: 0, placementKeys: ["0:0"], affected: "5" }, "Revision");
    // 2 graphics x 2 placements x 1 colour x 5 garments
    expect(r.SD).toBe(20);
  });

  test("which is four times the cost of correcting one placement", () => {
    const rev = cost({ productIndex: 0, garmentIndex: 0, placementKeys: [], affected: "5" }, "Revision");
    const corr = cost(
      { productIndex: 0, garmentIndex: 0, placementKeys: ["0:0"], affected: "5" },
      "Correction"
    );
    expect(rev.SD).toBe(20);
    expect(corr.SD).toBe(5);
  });
});

describe("the quantity the agent types is what gets costed", () => {
  test("affected count replaces the original order quantity", () => {
    const six = cost({ productIndex: 0, garmentIndex: 0, placementKeys: ["0:0"], affected: "6" }, "Correction");
    expect(six.SD).toBe(6);
    // the original garment was 100 -- that number is never used
    expect(branch.garmentQuantity).toBe("100");
  });
});

describe("embroiderySizes", () => {
  const emb = [
    {
      productName: "Embroidery",
      productType: "garment",
      primaryBranches: [
        {
          garmentQuantity: "50",
          secondaryBranches: [
            {
              numberOfPlacements: "2",
              tartiaryBranches: [
                { placementLocation: "Left Chest", placementSize: "Small" },
                { placementLocation: "Back", placementSize: "Large" },
              ],
            },
            {
              numberOfPlacements: "1",
              tartiaryBranches: [{ placementLocation: "Sleeve" }], // no size recorded
            },
          ],
        },
      ],
    },
  ];

  test("a revision attributes every placement at the affected quantity", () => {
    const s = embroiderySizes(emb, { productIndex: 0, garmentIndex: 0, affected: "5" }, "Revision");
    expect(s).toEqual({ Small: 5, Medium: 0, Large: 5, Unsized: 5 });
  });

  test("the breakdown sums to the embroidery total", () => {
    const item = { productIndex: 0, garmentIndex: 0, affected: "5" };
    const s = embroiderySizes(emb, item, "Revision");
    const total = computePrints(syntheticProducts(emb, item, "Revision")).ED;
    expect(s.Small + s.Medium + s.Large + s.Unsized).toBe(total); // 3 placements x 5
    expect(total).toBe(15);
  });

  test("a correction only attributes the placements ticked", () => {
    const s = embroiderySizes(
      emb,
      { productIndex: 0, garmentIndex: 0, placementKeys: ["0:1"], affected: "4" },
      "Correction"
    );
    expect(s).toEqual({ Small: 0, Medium: 0, Large: 4, Unsized: 0 });
  });

  test("an unsized placement is never guessed into a bucket", () => {
    const s = embroiderySizes(
      emb,
      { productIndex: 0, garmentIndex: 0, placementKeys: ["1:0"], affected: "4" },
      "Correction"
    );
    expect(s.Unsized).toBe(4);
    expect(s.Small + s.Medium + s.Large).toBe(0);
  });

  test("non-embroidery work has no size split", () => {
    const s = embroiderySizes(PRODUCTS, { productIndex: 0, garmentIndex: 0, affected: "5" }, "Revision");
    expect(s).toEqual({ Small: 0, Medium: 0, Large: 0, Unsized: 0 });
  });
});

describe("sizes", () => {
  test("the sizes ARE the count when the agent breaks it down", () => {
    const item = { affected: "99", sizes: [{ size: "M", qty: "3" }, { size: "L", qty: "2" }] };
    expect(effectiveQty(item)).toBe(5); // the stale typed 99 is ignored
  });

  test("without sizes, the typed total stands", () => {
    expect(effectiveQty({ affected: "7", sizes: [] })).toBe(7);
    expect(effectiveQty({ affected: "7" })).toBe(7);
  });

  test("blank, zero and junk quantities count as nothing", () => {
    const item = { sizes: [{ size: "S", qty: "" }, { size: "M", qty: "0" }, { size: "L", qty: "-2" }, { size: "XL", qty: "x" }] };
    expect(effectiveQty(item)).toBe(0);
  });

  test("the size breakdown drives the print count", () => {
    const item = {
      productIndex: 0,
      garmentIndex: 0,
      placementKeys: ["0:0"],
      sizes: [{ size: "M", qty: "3" }, { size: OTHER_SIZE, other: "3T", qty: "2" }],
    };
    expect(cost(item, "Correction").SD).toBe(5);
  });

  test("formats for the note and the reorder, Other shows what was typed", () => {
    expect(
      formatSizes([
        { size: "M", qty: "3" },
        { size: "L", qty: "2" },
        { size: OTHER_SIZE, other: " 3T ", qty: "1" },
        { size: "XL", qty: "" },
      ])
    ).toBe("M ×3, L ×2, 3T ×1");
  });

  test("an Other row left blank still reads as Other rather than vanishing", () => {
    expect(formatSizes([{ size: OTHER_SIZE, other: "", qty: "2" }])).toBe("Other ×2");
  });

  test("the picker covers XXS to 5XL plus OSFA", () => {
    expect(SIZE_OPTIONS[0]).toBe("XXS");
    expect(SIZE_OPTIONS).toContain("5XL");
    expect(SIZE_OPTIONS).toContain("OSFA");
  });
});

// ---------------------------------------------------------------------------
// Gang sheet revisions. The unit reprinted is a SHEET, and a sheet ships
// unpressed, so there is no heat-press doubling. Prints land in the Vinyl
// Department slot, matching where the original job rolls up.
// ---------------------------------------------------------------------------
describe("gang sheet costing", () => {
  // 22 x 12.5 sheet of 3.5 x 3.5 graphics = 15 per sheet (onboarding's example).
  const jsonSheet = [
    {
      productName: "DTF Gang Sheet",
      productType: "gangsheet",
      numberOfGangSheets: "3",
      gangSheetWidth: "22",
      gangSheetHeight: "12.5",
      gangGraphics: [{ graphicWidth: "3.5", graphicHeight: "3.5" }],
    },
  ];
  const noteSheet = [
    {
      productName: "DTF Gang Sheet",
      productType: "gangsheet",
      numberOfGangSheets: "3",
      estimatedPrintsPerSheet: "15", // all a note can give us
    },
  ];

  test("re-runs the onboarding packing from the JSON", () => {
    expect(gangPerSheet(jsonSheet[0])).toBe(15);
    expect(isGangSheet(jsonSheet[0])).toBe(true);
  });

  test("falls back to the per-sheet figure the note printed", () => {
    expect(gangPerSheet(noteSheet[0])).toBe(15);
  });

  test("costs the sheets REPRINTED, not the sheets ordered", () => {
    // The trap: gangSheetPrints().total is 15 x 3 = 45, the whole original
    // order. Reprinting one sheet is 15, not 45.
    const one = costItem(jsonSheet, { productIndex: 0, affected: "1" }, "Revision");
    expect(one.VD).toBe(15);
    const two = costItem(jsonSheet, { productIndex: 0, affected: "2" }, "Revision");
    expect(two.VD).toBe(30);
  });

  test("lands in Vinyl, all actual, with no heat-press doubling", () => {
    const r = costItem(jsonSheet, { productIndex: 0, affected: "1" }, "Revision");
    expect(r).toMatchObject({ SD: 0, ED: 0, VD: 15 });
    expect(r.actual.VD).toBe(15);
    expect(r.projected.VD).toBe(0); // a sheet ships unpressed
  });

  test("a note-sourced sheet costs the same as the JSON one", () => {
    expect(costItem(noteSheet, { productIndex: 0, affected: "2" }, "Revision").VD).toBe(30);
  });

  test("correction and revision cost a sheet identically", () => {
    const item = { productIndex: 0, affected: "2" };
    expect(costItem(jsonSheet, item, "Correction").VD).toBe(
      costItem(jsonSheet, item, "Revision").VD
    );
  });

  test("no sheets, or an unmeasurable sheet, costs nothing rather than guessing", () => {
    expect(costItem(jsonSheet, { productIndex: 0, affected: "" }, "Revision").VD).toBe(0);
    expect(costItem([{ productName: "DTF Gang Sheet", productType: "gangsheet" }],
      { productIndex: 0, affected: "2" }, "Revision").VD).toBe(0);
  });

  test("garment items still go through the onboarding calculation", () => {
    const r = costItem(PRODUCTS, { productIndex: 0, garmentIndex: 0, placementKeys: ["0:0"], affected: "5" }, "Correction");
    expect(r.SD).toBe(5);
    expect(isGangSheet(PRODUCTS[0])).toBe(false);
  });
});
