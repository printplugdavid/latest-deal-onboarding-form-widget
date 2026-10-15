import fs from "fs";
import path from "path";
import { NOTE_LABELS, parseNoteToForm } from "./noteToForm";
import korie from "../__fixtures__/note-1000249-korie.json";

// E-77: a value ends at a label the note builder writes (or any "Label: value" line), never at a staff line
// such as "Navy Garment:". Found by the InkSoft thread on Korie's Buhler note (contact details faked).
const KNOWN = ["Direct-to-Film#garment", "Embroidery#garment"];

describe("E-77 the label list stays in step with the note builder", () => {
  test("every 'Label: ' the builder writes is in NOTE_LABELS", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "onboardingNote.js"), "utf8");
    const written = [...src.matchAll(/"([A-Za-z][^"\n]{0,80}): *"/g)].map((m) => m[1]).filter((l) => l !== "NOTE");
    expect(written.length).toBeGreaterThan(80);
    const missing = [...new Set(written)].filter((l) => !NOTE_LABELS.includes(l));
    expect(missing).toEqual([]);
  });
});

describe("E-77 Korie's note: staff-headed lines stay inside their value", () => {
  const { values } = parseNoteToForm(korie.note, KNOWN);
  const gar = values.products[0].primaryBranches[0];
  test("Color Change details come back whole, both graphics", () => {
    gar.secondaryBranches.forEach((g) => {
      expect(g.detailsOfColorChange).toBe("Navy Garment:\nGold #BF8B28\nWhite #FEFEFE\n\nWhite Garments:\nNavy #010161\nGold #BF8B28");
      expect(g.fontsUsed).toBe("NA");
    });
  });
  test("the E-57 style headings no longer cut the sizes short", () => {
    expect(gar.countColorSize).toContain("PC78 Port & Company Adult Crew Neck Sweater:\nWhite\n1- L");
    expect(gar.garmentQuantity).toBe("3");
  });
  test("the fields around them are untouched", () => {
    expect(values.products[0].primaryBranches[0].secondaryBranches).toHaveLength(2);
    expect(gar.secondaryBranches[1].tartiaryBranches[0].placementLocation).toBe("Center Upper Back");
    expect(values.specialInstructions).toBe("Due for PICK UP NOVEMEBR 3, 2026");
  });
  test("a 'Label: ' line from an older form still ends a value; a staff 'Navy: Gold' line still does too (as before)", () => {
    const note = "CONTACT INFO\n---------------------------\n\nOTHER INFORMATION\n---------------------------\n\nSpecial Instructions: call first\nOld Form Label: \n\nIs This a Repeat Order?: No";
    expect(parseNoteToForm(note, KNOWN).values.specialInstructions).toBe("call first");
  });
});
