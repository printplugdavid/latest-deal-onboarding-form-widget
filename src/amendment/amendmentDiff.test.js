import dayjs from "dayjs";
import {
  appendAmended,
  applyAppendRule,
  describePath,
  diffValues,
  summariseDiff,
  toFormValues,
} from "./amendmentDiff";

const payload = () => ({
  _schemaVersion: 1,
  _submittedAt: "2026-09-30T18:00:00.000Z",
  productSelector: ["T-Shirts#garment"],
  contactInfo: { Deal_Name: "Evergreen", Contact_Phone: "" },
  hardDueDate: "Yes",
  dueDate: "2026-10-10T06:00:00.000Z",
  specialInstructions: "Rush",
  products: [
    {
      productName: "T-Shirts",
      productType: "garment",
      numberOfGarmentTypes: "1",
      primaryBranches: [
        {
          garmentType: "Gildan 64000",
          garmentQuantity: "24",
          countColorSize: "Navy: L ×12, XL ×12",
          vendorsUsed: "SSactivewear",
          secondaryBranches: [
            { numberOfPlacements: "1", tartiaryBranches: [{ placementLocation: "Front" }] },
          ],
        },
      ],
    },
    { productName: "Logo design", productType: "graphic", dateNeededBy: "" },
  ],
});

describe("toFormValues", () => {
  test("strips the _ stamps and keeps productSelector for the form", () => {
    const v = toFormValues(payload());
    expect(v._schemaVersion).toBeUndefined();
    expect(v._submittedAt).toBeUndefined();
    expect(v.productSelector).toEqual(["T-Shirts#garment"]);
  });

  test("revives every date field to dayjs, empty to null -- a string would crash the DatePicker", () => {
    const v = toFormValues(payload());
    expect(dayjs.isDayjs(v.dueDate)).toBe(true);
    expect(v.products[1].dateNeededBy).toBeNull();
    const s = toFormValues({ products: [{ storefrontLiveDate: "2026/10/01", storefrontEndDate: "junk" }] });
    expect(s.products[0].storefrontLiveDate.format("YYYY-MM-DD")).toBe("2026-10-01");
    expect(s.products[0].storefrontEndDate).toBeNull();
  });

  test("does not touch non-date strings that look like dates", () => {
    const v = toFormValues({ specialInstructions: "2026-10-10" });
    expect(v.specialInstructions).toBe("2026-10-10");
  });

  test("survives an empty or missing payload", () => {
    expect(toFormValues(null)).toEqual({});
    expect(toFormValues({})).toEqual({});
  });
});

describe("diffValues", () => {
  test("an unedited prefill is NOT a change", () => {
    const v = toFormValues(payload());
    expect(diffValues(v, toFormValues(payload()))).toEqual([]);
  });

  test("undefined, null and '' are the same answer (Controller defaultValue on a key the payload lacked)", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.contactInfo.Contact_Phone = undefined;
    after.howDidYouHearAboutUs = "";
    after.products[0].primaryBranches[0].fineDetail = null;
    expect(diffValues(before, after)).toEqual([]);
  });

  test("an unticked checkbox the payload never had is not a change; ticking it reads Yes", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.products[0].isOutsourced = false;
    after.upchargedForRushTurnaround = false;
    expect(diffValues(before, after)).toEqual([]);
    after.upchargedForRushTurnaround = true;
    expect(diffValues(before, after)).toEqual([{ path: "upchargedForRushTurnaround", before: "", after: "Yes" }]);
  });

  test("a Yes/No default of No on a question the payload never had is not a change", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.products[0].primaryBranches[0].isUsedInOtherAppTypes = "No";
    expect(diffValues(before, after)).toEqual([]);
    after.products[0].primaryBranches[0].isUsedInOtherAppTypes = "Yes";
    expect(diffValues(before, after)).toHaveLength(1);
  });

  test("numbers and numeric strings agree; whitespace is not a change", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.products[0].primaryBranches[0].garmentQuantity = 24;
    after.products[0].primaryBranches[0].garmentType = "  Gildan 64000 ";
    expect(diffValues(before, after)).toEqual([]);
  });

  test("a date is compared as a date, not as an object", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.dueDate = dayjs("2026-10-17T06:00:00.000Z");
    expect(diffValues(before, after)).toEqual([
      { path: "dueDate", before: before.dueDate.format("YYYY-MM-DD"), after: after.dueDate.format("YYYY-MM-DD") },
    ]);
  });

  test("finds a quantity change deep in a garment", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.products[0].primaryBranches[0].garmentQuantity = "36";
    expect(diffValues(before, after)).toEqual([
      { path: "products.0.primaryBranches.0.garmentQuantity", before: "24", after: "36" },
    ]);
  });

  test("new keys in the edited values are reported", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.products[0].primaryBranches[0].secondaryBranches[0].tartiaryBranches.push({ placementLocation: "Back" });
    expect(diffValues(before, after)).toEqual([
      {
        path: "products.0.primaryBranches.0.secondaryBranches.0.tartiaryBranches.1.placementLocation",
        before: "",
        after: "Back",
      },
    ]);
  });

  test("productSelector bookkeeping is ignored", () => {
    const before = toFormValues(payload());
    const after = { ...toFormValues(payload()), productSelector: [] };
    expect(diffValues(before, after)).toEqual([]);
  });
});

describe("appendAmended (D-23: never destroy)", () => {
  const D = "2026-09-30";
  test("unchanged stays exactly as it was", () => {
    expect(appendAmended("SSactivewear", "SSactivewear", D)).toBe("SSactivewear");
  });
  test("typed after the original: only the addition goes under the separator", () => {
    expect(appendAmended("SSactivewear", "SSactivewear\nSanmar", D)).toBe(
      "SSactivewear\n--- amended 2026-09-30 ---\nSanmar"
    );
  });
  test("rewritten: the original is kept, the new text goes underneath", () => {
    expect(appendAmended("SSactivewear", "Sanmar", D)).toBe("SSactivewear\n--- amended 2026-09-30 ---\nSanmar");
  });
  test("cleared: the original is kept and the clearing is recorded", () => {
    expect(appendAmended("SSactivewear", "", D)).toBe(
      "SSactivewear\n--- amended 2026-09-30 ---\n(cleared in this amendment)"
    );
  });
  test("nothing to preserve: the new value stands alone", () => {
    expect(appendAmended("", "Sanmar", D)).toBe("Sanmar");
    expect(appendAmended(undefined, "Sanmar", D)).toBe("Sanmar");
  });
});

describe("applyAppendRule", () => {
  test("merges changed append fields at every depth and leaves everything else as edited", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.specialInstructions = "Rush\nShip to the school";
    after.products[0].primaryBranches[0].vendorsUsed = "Sanmar";
    after.products[0].primaryBranches[0].garmentQuantity = "36";
    const saved = applyAppendRule(before, after, "2026-09-30");
    expect(saved.specialInstructions).toBe("Rush\n--- amended 2026-09-30 ---\nShip to the school");
    expect(saved.products[0].primaryBranches[0].vendorsUsed).toBe(
      "SSactivewear\n--- amended 2026-09-30 ---\nSanmar"
    );
    expect(saved.products[0].primaryBranches[0].garmentQuantity).toBe("36");
    // does not mutate its input
    expect(after.products[0].primaryBranches[0].vendorsUsed).toBe("Sanmar");
  });
});

describe("labels", () => {
  test("paths read the way the form reads", () => {
    const v = toFormValues(payload());
    expect(describePath("products.0.primaryBranches.0.countColorSize", v)).toBe(
      "T-Shirts › Garment 1 › Total Count, Colors & Sizes"
    );
    expect(
      describePath("products.0.primaryBranches.0.secondaryBranches.0.tartiaryBranches.1.placementLocation", v)
    ).toBe("T-Shirts › Garment 1 › Graphic 1 › Placement 2 › Placement location");
    expect(describePath("contactInfo.Contact_Phone", v)).toBe("Contact › Contact phone");
    expect(describePath("dueDate", v)).toBe("Due Date");
  });

  test("summary lines: one-liners inline, multi-line values split into was/now", () => {
    const v = toFormValues(payload());
    const lines = summariseDiff(
      [
        { path: "products.0.primaryBranches.0.garmentQuantity", before: "24", after: "36" },
        { path: "specialInstructions", before: "", after: "a\nb" },
      ],
      v
    );
    expect(lines[0]).toBe("T-Shirts › Garment 1 › Garment Quantity: 24 → 36");
    expect(lines[1]).toBe("Special Instructions / Considerations:\n  was: (empty)\n  now: a\n       b");
  });
});

describe("whole-product add / remove", () => {
  const { effectiveValues, summariseAmendment } = require("./amendmentDiff");
  const D = "2026-10-01";

  test("removing the FIRST product is one line, and later products are not reported as rewritten", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    expect(summariseAmendment(before, after, [0])).toEqual(["Product removed: T-Shirts (garment)"]);
    const saved = effectiveValues(before, after, [0], D);
    expect(saved.products.map((p) => p.productName)).toEqual(["Logo design"]);
    expect(saved.productSelector).toEqual(["Logo design#graphic"]);
  });

  test("edits made to a product before removing it are not news", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.products[0].primaryBranches[0].garmentQuantity = "99";
    expect(summariseAmendment(before, after, [0])).toEqual(["Product removed: T-Shirts (garment)"]);
  });

  test("an added product is named once, then its answers are listed", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.products.push({ productName: "Stickers", productType: "nongarment", quantityOrdered: "50" });
    expect(summariseAmendment(before, after, [])).toEqual([
      "Product added: Stickers (nongarment)",
      "Stickers › Quantity Ordered: (empty) → 50",
    ]);
    const saved = effectiveValues(before, after, [], D);
    expect(saved.productSelector).toEqual(["T-Shirts#garment", "Logo design#graphic", "Stickers#nongarment"]);
  });

  test("added then removed again leaves no trace", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.products.push({ productName: "Stickers", productType: "nongarment", quantityOrdered: "50" });
    expect(summariseAmendment(before, after, [2])).toEqual([]);
    expect(effectiveValues(before, after, [2], D).products).toHaveLength(2);
  });

  test("nothing added or removed: productSelector is left exactly as the payload had it", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.productSelector = ["T-Shirts#garment"];
    after.dueDate = dayjs("2026-10-20");
    const saved = effectiveValues(before, after, [], D);
    expect(saved.productSelector).toEqual(["T-Shirts#garment"]);
    expect(summariseAmendment(before, after, [])).toHaveLength(1);
  });

  test("the append rule still applies in the saved values", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.specialInstructions = "Rush\nNew address";
    expect(effectiveValues(before, after, [], D).specialInstructions).toBe(
      "Rush\n--- amended 2026-10-01 ---\nNew address"
    );
  });
});

describe("what Save writes", () => {
  const {
    appendUpdateResults,
    buildAmendmentNote,
    buildUpdateResultsEntry,
    SUPERSEDED_TITLE,
  } = require("./amendmentDiff");

  test("the amended note is the What Changed block followed by the COMPLETE note, untouched", () => {
    const content = "CONTACT INFO\n---------------------------\n\nAccount Name: Evergreen";
    const note = buildAmendmentNote({
      content,
      lines: ["T-Shirts › Garment 1 › Garment Quantity: 24 → 36"],
      story: "Client added 12.",
      when: "2026-10-01 11:40",
      previousWhen: "Sep 30, 2026",
    });
    expect(note.startsWith("ONBOARDING AMENDED 2026-10-01 11:40\n")).toBe(true);
    expect(note).toContain("• T-Shirts › Garment 1 › Garment Quantity: 24 → 36");
    expect(note).toContain("IN THE AGENT'S WORDS\nClient added 12.");
    expect(note).toContain("replaces the onboarding note submitted Sep 30, 2026.");
    expect(note.endsWith(content)).toBe(true); // every parser label is exactly where it was
  });

  test("the update-results entry is the auto diff, then the agent's words", () => {
    expect(buildUpdateResultsEntry({ lines: ["a: 1 → 2"], story: " why ", when: "2026-10-01 11:40" })).toBe(
      "--- amended 2026-10-01 11:40 ---\nWhat changed:\n• a: 1 → 2\nIn the agent's words:\nwhy"
    );
  });

  test("update results append, never replace", () => {
    expect(appendUpdateResults("", "E1")).toBe("E1");
    expect(appendUpdateResults(null, "E1")).toBe("E1");
    expect(appendUpdateResults("E1", "E2")).toBe("E1\n\nE2");
  });

  test("over the cap the OLDEST text is trimmed and marked; the newest entry survives whole", () => {
    const out = appendUpdateResults("x".repeat(100), "NEWEST-ENTRY", 60);
    expect(out.length).toBe(60);
    expect(out.startsWith("[earlier history trimmed to fit]\n")).toBe(true);
    expect(out.endsWith("NEWEST-ENTRY")).toBe(true);
  });

  test("superseded title carries the date", () => {
    expect(SUPERSEDED_TITLE("2026-10-01")).toBe("DEAL ONBOARDING FORM (SUPERSEDED 2026-10-01)");
  });
});

describe("per-garment add / remove", () => {
  const { effectiveValuesWithGarments, summariseAmendmentWithGarments } = require("./amendmentDiff");
  const D = "2026-10-01";
  const two = () => {
    const p = payload();
    p.products[0].numberOfGarmentTypes = "2";
    p.products[0].primaryBranches.push({
      garmentType: "Bella 3001",
      garmentQuantity: "10",
      countColorSize: "Red: M ×10",
      vendorsUsed: "Sanmar",
    });
    return p;
  };

  test("removing the FIRST garment is one line; the second is not reported as rewritten", () => {
    const before = toFormValues(two());
    const after = toFormValues(two());
    expect(summariseAmendmentWithGarments(before, after, [], ["0.0"])).toEqual([
      "Garment removed: T-Shirts › Garment 1 (Gildan 64000, 24 pcs)",
    ]);
    const saved = effectiveValuesWithGarments(before, after, [], ["0.0"], D);
    expect(saved.products[0].primaryBranches.map((g) => g.garmentType)).toEqual(["Bella 3001"]);
    expect(saved.products[0].numberOfGarmentTypes).toBe("1");
    expect(saved.products).toHaveLength(2);
  });

  test("an added garment is named once and its answers listed; the count line is not repeated", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.products[0].primaryBranches.push({ garmentType: "Hoodie", garmentQuantity: "6" });
    after.products[0].numberOfGarmentTypes = "2";
    const lines = summariseAmendmentWithGarments(before, after, [], []);
    expect(lines[0]).toBe("Garment added: T-Shirts › Garment 2 (Hoodie, 6 pcs)");
    expect(lines.some((l) => /Number of garment types/i.test(l))).toBe(false);
    expect(effectiveValuesWithGarments(before, after, [], [], D).products[0].numberOfGarmentTypes).toBe("2");
  });

  test("the append rule survives a garment removal ahead of it", () => {
    const before = toFormValues(two());
    const after = toFormValues(two());
    after.products[0].primaryBranches[1].vendorsUsed = "Sanmar\nAlphaBroder";
    const saved = effectiveValuesWithGarments(before, after, [], ["0.0"], D);
    expect(saved.products[0].primaryBranches[0].vendorsUsed).toBe("Sanmar\n--- amended 2026-10-01 ---\nAlphaBroder");
  });

  test("with nothing removed it matches the product-level functions exactly", () => {
    const before = toFormValues(payload());
    const after = toFormValues(payload());
    after.products[0].primaryBranches[0].garmentQuantity = "36";
    after.specialInstructions = "Rush\nmore";
    const { effectiveValues, summariseAmendment } = require("./amendmentDiff");
    expect(effectiveValuesWithGarments(before, after, [], [], D)).toEqual(effectiveValues(before, after, [], D));
    expect(summariseAmendmentWithGarments(before, after, [], [])).toEqual(summariseAmendment(before, after, []));
  });

  test("removing a whole product swallows its garment removals", () => {
    const before = toFormValues(two());
    const after = toFormValues(two());
    expect(summariseAmendmentWithGarments(before, after, [0], ["0.1"])).toEqual(["Product removed: T-Shirts (garment)"]);
  });
});
