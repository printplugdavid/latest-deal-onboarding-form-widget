import { productLabel } from "./productLabels";

test("E-121: Heat-Transfer reads as HTV on screen; every other name is unchanged", () => {
  expect(productLabel("Heat-Transfer")).toBe("HTV (Heat-Transfer Vinyl)");
  expect(productLabel(" Heat-Transfer ")).toBe("HTV (Heat-Transfer Vinyl)");
  expect(productLabel("Screen Printing")).toBe("Screen Printing");
  expect(productLabel("Vinyl")).toBe("Vinyl"); // older orders still show what they were
  expect(productLabel(undefined)).toBe("");
});
