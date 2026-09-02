/*
 * The point of these: a correction must cost only the placements actually
 * redone. A shirt with three placements where one needs fixing is one
 * placement's worth of work, not three -- and getting that wrong overstates
 * every correction the shop logs.
 */
import { placementsOf, syntheticProducts } from "./affected";
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
