import { onlinePoNumber } from "./onlinePo";
import { onlinePoNumber as fromBundle } from "./onlineOrder";

test("E-147: online order number -> E + (order - 1,000,000); never restarts", () => {
  expect(onlinePoNumber(1000259)).toBe("E259");
  expect(onlinePoNumber("1000260")).toBe("E260");
  expect(onlinePoNumber(" 1000999 ")).toBe("E999");
  expect(onlinePoNumber(1001000)).toBe("E1000");
  expect(onlinePoNumber(1001234)).toBe("E1234");
  expect(onlinePoNumber(1012345)).toBe("E12345");
  expect(onlinePoNumber(1000001)).toBe("E1");
});

test("E-147: anything that is not an online order number gives no PO (the robot then writes nothing)", () => {
  for (const bad of [undefined, null, "", "abc", "1000259A", 1000000, 999999, 4553, "-1000259", "1000259.5"]) expect(onlinePoNumber(bad)).toBe("");
});

test("E-147: the robot's bundle exports the same rule", () => {
  expect(fromBundle(1000259)).toBe("E259");
});
