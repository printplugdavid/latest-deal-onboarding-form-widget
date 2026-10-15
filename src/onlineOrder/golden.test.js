import fs from "fs";
import path from "path";
import { buildForOrder } from "./index";
import { autoNoteLine } from "../submission";

// docs/48, ask 1 -- THE release test for the InkSoft order-sync. Four real online orders, anonymized by the InkSoft
// thread (src/__fixtures__/online/README-from-inksoft.md), with what their bundle at cc0ba64 produced in AWS. Ours
// must match byte for byte; the only agreed difference is the note's new last line.
const DIR = path.join(__dirname, "..", "__fixtures__", "online");
const read = (...p) => fs.readFileSync(path.join(DIR, ...p), "utf8");
const deals = JSON.parse(read("inputs", "deals.json"));
const AT = "2026-10-15T00:00:00.000Z";
const quiet = jest.spyOn(console, "log").mockImplementation(() => {});
afterAll(() => quiet.mockRestore());

describe.each(["1000247", "1000248", "1000249", "1000250"])("InkSoft order %s", (id) => {
  const want = JSON.parse(read("expected", id, "result.json"));
  const got = buildForOrder(JSON.parse(read("inputs", id + ".json")), deals[id], { submittedAt: AT });

  test("submits or is held, as before, for the same reasons, with the same due date", () => {
    expect(got.ok).toBe(want.ok);
    expect(got.held).toEqual(want.held);
    expect(got.due).toEqual(want.due);
  });

  if (want.ok) {
    test("the print fields", () => expect(got.printFields).toEqual(want.printFields));
    test("the note, byte for byte, plus the agreed last line", () => {
      expect(got.note).toBe(read("expected", id, "note.txt") + "\n\n" + autoNoteLine(id));
    });
    test("the JSON, byte for byte", () => expect(got.json).toBe(read("expected", id, "onboarding-form.json")));
    test("the cards, byte for byte and in the same order", () => {
      expect(got.cards.map((c) => c.name)).toEqual(want.cards);
      got.cards.forEach((c) => expect(c.html).toBe(read("expected", id, c.name)));
    });
  } else {
    test("nothing is built for a held order", () => {
      expect(got.note).toBeUndefined();
      expect(got.json).toBeUndefined();
    });
  }
});
