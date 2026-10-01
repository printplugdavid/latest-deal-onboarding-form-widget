import { targetStage } from "./stageMove";

describe("targetStage (D-27)", () => {
  test("a standard deal moves to the matching Order Needs stage", () => {
    expect(targetStage("Revision", "Quality Check")).toEqual({ move: true, stage: "Order Needs Revisions" });
    expect(targetStage("Correction", "Failed Quality Check")).toEqual({
      move: true,
      stage: "Order Needs Corrections",
    });
    expect(targetStage("Revision", "Mock-Up Approved / In Production").stage).toBe("Order Needs Revisions");
  });

  test("a school deal uses the school pair", () => {
    expect(targetStage("Revision", "SCHOOL: Quality Check")).toEqual({ move: true, stage: "SCHOOL: Order Revisions" });
    expect(targetStage("Correction", "SCHOOL: Failed Quality Check")).toEqual({
      move: true,
      stage: "SCHOOL: Order Corrections",
    });
  });

  test("already there: no move, and it says so", () => {
    expect(targetStage("Revision", "Order Needs Revisions")).toEqual({
      move: false,
      reason: "already",
      stage: "Order Needs Revisions",
    });
  });

  test("a correction filed while in the REVISION stage still moves", () => {
    expect(targetStage("Correction", "Order Needs Revisions")).toEqual({
      move: true,
      stage: "Order Needs Corrections",
    });
  });

  test("advertiser deals are left to a human", () => {
    expect(targetStage("Revision", "ADVERTISER: Mock-Up Approved")).toEqual({ move: false, reason: "advertiser" });
    expect(targetStage("Revision", "SCHOOL/ ADVERTISER: Converted")).toEqual({ move: false, reason: "advertiser" });
    expect(targetStage("Revision", "SCHOOL ADVERTISER - In Design")).toEqual({ move: false, reason: "advertiser" });
  });

  test("a missing stage is treated as a standard deal", () => {
    expect(targetStage("Revision", undefined)).toEqual({ move: true, stage: "Order Needs Revisions" });
  });

  test("an unknown form type never moves anything", () => {
    expect(targetStage("Amendment", "Quality Check")).toEqual({ move: false, reason: "unknown-type" });
  });
});
