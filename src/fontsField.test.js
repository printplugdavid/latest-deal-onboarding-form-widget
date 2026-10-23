import { fontsView, fontsValues, resizeLines } from "./fontsField";

test("E-116: Yes + lines -> fontsUsed joined; No -> 'None'; blank -> nothing", () => {
  expect(fontsValues("Yes", ["Bebas Neue", " Montserrat Bold ", ""])).toEqual({
    fontsAdded: "Yes",
    fontLines: ["Bebas Neue", " Montserrat Bold ", ""],
    fontsUsed: "Bebas Neue; Montserrat Bold",
  });
  expect(fontsValues("No", ["x"])).toEqual({ fontsAdded: "No", fontLines: [], fontsUsed: "None" });
  expect(fontsValues("", [])).toEqual({ fontsAdded: "", fontLines: [], fontsUsed: "" });
});

test("an order saved before E-116 opens as Yes with its lines, without writing anything", () => {
  expect(fontsView(undefined, undefined, "Bebas Neue\nMontserrat")).toEqual({ added: "Yes", lines: ["Bebas Neue", "Montserrat"] });
  expect(fontsView(undefined, undefined, "")).toEqual({ added: "", lines: [] });
  expect(fontsView("No", [], "None")).toEqual({ added: "No", lines: [] });
  expect(fontsView("Yes", ["A", ""], "A")).toEqual({ added: "Yes", lines: ["A", ""] });
});

test("how many fonts sets the number of lines and keeps what was typed (max 10)", () => {
  expect(resizeLines(["A"], 3)).toEqual(["A", "", ""]);
  expect(resizeLines(["A", "B", "C"], 1)).toEqual(["A"]);
  expect(resizeLines([], 40)).toHaveLength(10);
  expect(resizeLines(["A"], "")).toEqual([]);
});
