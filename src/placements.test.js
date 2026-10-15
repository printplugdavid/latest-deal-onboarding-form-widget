import {
  GARMENT_KINDS,
  OTHER,
  PRINT_ONLY,
  embroiderySizeFor,
  locationGroup,
  locationText,
  locationsFor,
  parseInches,
  shownPick,
  sizeOk,
  sizeText,
} from "./placements";

describe("locationsFor", () => {
  test("every kind ends with Other… and has no duplicates", () => {
    [...GARMENT_KINDS, ""].forEach((k) => {
      const list = locationsFor(k);
      expect(list[list.length - 1]).toBe(OTHER);
      expect(new Set(list).size).toBe(list.length);
    });
  });
  test("tops get chest, back and both sleeves; hats get hat spots only", () => {
    const tee = locationsFor("Tee / Long Sleeve / Tank");
    ["Left Chest", "Full Back", "Left Sleeve – Upper", "Right Sleeve – Lower / Cuff", "Over Right Pocket"].forEach((l) => expect(tee).toContain(l));
    expect(tee).not.toContain("Hood");
    const hat = locationsFor("Hat / Cap");
    expect(hat).toEqual(["Front", "Left Side Panel", "Right Side Panel", "Back (over strap / snapback)", "Top of Bill", "Under Bill", OTHER]);
  });
  test("hoodies add hood and pouch; pants get legs and pockets", () => {
    expect(locationsFor("Hoodie / Crew / Zip")).toEqual(expect.arrayContaining(["Hood", "Front Pouch Pocket", "Left Chest"]));
    expect(locationsFor("Pants / Shorts")).toEqual(expect.arrayContaining(["Left Leg – Upper (Thigh)", "Seat (Back)", "Back Right Pocket", "Front Right Pocket"]));
  });
  test("no kind picked offers every location once", () => {
    const all = locationsFor("");
    ["Left Chest", "Hood", "Under Bill", "Front (Cuff)", "Waistband", "Strap", PRINT_ONLY].forEach((l) => expect(all).toContain(l));
  });
  test("groups", () => {
    expect(locationGroup("Polo / Button-up", "Left Chest")).toBe("Front");
    expect(locationGroup("Polo / Button-up", "Nape (Back of Neck)")).toBe("Back");
    expect(locationGroup("Polo / Button-up", OTHER)).toBe("Other");
  });
});

describe("shownPick — old typed values open without being rewritten", () => {
  test("a saved pick wins", () => {
    expect(shownPick({ placementPick: OTHER, placementOther: "under left eye", placementLocation: "under left eye" }, "Beanie")).toEqual({ pick: OTHER, other: "under left eye" });
  });
  test("typed text matching an option (any case) shows as that option", () => {
    expect(shownPick({ placementLocation: "left chest" }, "Tee / Long Sleeve / Tank")).toEqual({ pick: "Left Chest", other: "" });
  });
  test("anything else shows as Other… with the text", () => {
    expect(shownPick({ placementLocation: "center of backpack below the nike sign" }, "Bag / Tote / Backpack")).toEqual({ pick: OTHER, other: "center of backpack below the nike sign" });
    expect(shownPick({ placementLocation: "back" }, "Tee / Long Sleeve / Tank")).toEqual({ pick: OTHER, other: "back" });
  });
  test("blank stays blank", () => expect(shownPick({}, "")).toEqual({ pick: "", other: "" }));
});

test("locationText", () => {
  expect(locationText("Left Chest", "ignored")).toBe("Left Chest");
  expect(locationText(OTHER, "  across shoulders ")).toBe("across shoulders");
});

describe("sizes", () => {
  test("parseInches reads how reps write inches", () => {
    expect(parseInches("3.5")).toBe(3.5);
    expect(parseInches('10"')).toBe(10);
    expect(parseInches("10 in")).toBe(10);
    expect(parseInches("10in")).toBe(10);
    expect(parseInches("12 inches")).toBe(12);
    expect(parseInches("3 1/2")).toBe(3.5);
    expect(parseInches("2 3/4”")).toBe(2.75);
    expect(parseInches("3/4")).toBe(0.75);
    expect(parseInches("")).toBeNaN();
    expect(parseInches("big")).toBeNaN();
    expect(parseInches("3/0")).toBeNaN();
  });
  test("sizeOk: blank or a positive size", () => {
    expect(sizeOk("")).toBe(true);
    expect(sizeOk("3 1/2")).toBe(true);
    expect(sizeOk("0")).toBe(false);
    expect(sizeOk("wide")).toBe(false);
  });
  test("sizeText: the line the note, cards and QC form read", () => {
    expect(sizeText("3.5", "3.5")).toBe('3.5" W × 3.5" H');
    expect(sizeText("10", "")).toBe('10" W × height in proportion');
    expect(sizeText("", '2.5"')).toBe('width in proportion × 2.5" H');
    expect(sizeText("3 1/2 in", "")).toBe('3 1/2" W × height in proportion');
    expect(sizeText("3", "", "3 in down from collar")).toBe('3" W × height in proportion · 3 in down from collar');
    expect(sizeText("", "", "centered on pocket")).toBe("centered on pocket");
    expect(sizeText("", "")).toBe("");
    expect(sizeText("wide", "")).toBe(""); // an unreadable size is never written
  });
});

describe("embroiderySizeFor — only where the survey is clear", () => {
  test("chest, sleeves and hat spots are Small; full front/back and center chest are Large", () => {
    expect(embroiderySizeFor("Left Chest", "Polo / Button-up")).toBe("Small");
    expect(embroiderySizeFor("Right Sleeve – Upper", "Tee / Long Sleeve / Tank")).toBe("Small");
    expect(embroiderySizeFor("Front", "Hat / Cap")).toBe("Small");
    expect(embroiderySizeFor("Full Back", "Hoodie / Crew / Zip")).toBe("Large");
    expect(embroiderySizeFor("Center Chest", "Tee / Long Sleeve / Tank")).toBe("Large");
  });
  test("no guess elsewhere", () => {
    expect(embroiderySizeFor("Front", "Bag / Tote / Backpack")).toBe("");
    expect(embroiderySizeFor("Upper Back (Yoke)", "Tee / Long Sleeve / Tank")).toBe("");
    expect(embroiderySizeFor(OTHER, "")).toBe("");
  });
});
