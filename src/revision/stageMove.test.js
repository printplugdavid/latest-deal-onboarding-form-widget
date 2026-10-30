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

  test("an advertiser REVISION moves to ADVERTISER: Issues -- the value the workflow rule fires on", () => {
    expect(targetStage("Revision", "ADVERTISER: Mock-Up Approved")).toEqual({ move: true, stage: "ADVERTISER: Issues" });
    expect(targetStage("Revision", "ADVERTISER: Issues")).toEqual({
      move: false,
      reason: "already",
      stage: "ADVERTISER: Issues",
    });
  });

  test("an advertiser CORRECTION and the mixed school/advertiser stages are left to a human", () => {
    expect(targetStage("Correction", "ADVERTISER: Mock-Up Approved")).toEqual({ move: false, reason: "advertiser" });
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

describe("Added Revision (E-169 / D-80)", () => {
  const { needsAddedRevision, tickAddedRevision, ADDED_REVISION_FIELD } = require("./stageMove");

  test("only a pass that changes no stage because the Deal is already there ticks the box", () => {
    expect(needsAddedRevision(targetStage("Revision", "Order Needs Revisions"))).toBe(true);
    expect(needsAddedRevision(targetStage("Correction", "Order Needs Corrections"))).toBe(true);
    expect(needsAddedRevision(targetStage("Revision", "SCHOOL: Order Revisions"))).toBe(true);
    expect(needsAddedRevision(targetStage("Correction", "SCHOOL: Order Corrections"))).toBe(true);
    expect(needsAddedRevision(targetStage("Revision", "ADVERTISER: Issues"))).toBe(true);
  });

  test("a moved stage, an advertiser correction or an unknown type never ticks it", () => {
    expect(needsAddedRevision(targetStage("Revision", "Quality Check"))).toBe(false);
    expect(needsAddedRevision(targetStage("Revision", "Order Needs Corrections"))).toBe(false); // moves to Revisions
    expect(needsAddedRevision(targetStage("Correction", "Order Needs Revisions"))).toBe(false); // moves to Corrections
    expect(needsAddedRevision(targetStage("Correction", "ADVERTISER: Issues"))).toBe(false);
    expect(needsAddedRevision(targetStage("Revision", "SCHOOL/ ADVERTISER Issues"))).toBe(false);
    expect(needsAddedRevision(targetStage("Other", "Order Needs Revisions"))).toBe(false);
    expect(needsAddedRevision(null)).toBe(false);
  });

  function fakeZoho(results) {
    const calls = [];
    return {
      calls,
      CRM: {
        API: {
          updateRecord: async (args) => {
            calls.push(args);
            const r = results.shift();
            if (r instanceof Error) throw r;
            return r;
          },
        },
      },
    };
  }
  const OK = { data: [{ code: "SUCCESS" }] };

  test("unticks with no workflow, then ticks with workflow", async () => {
    const z = fakeZoho([OK, OK]);
    expect(await tickAddedRevision(z, "Deals", "42")).toBe(true);
    expect(z.calls).toEqual([
      { Entity: "Deals", APIData: { id: "42", [ADDED_REVISION_FIELD]: false }, Trigger: [] },
      { Entity: "Deals", APIData: { id: "42", Added_Revision: true }, Trigger: ["workflow"] },
    ]);
  });

  test("a failed untick still tries the tick; a failed tick says so and never throws", async () => {
    expect(await tickAddedRevision(fakeZoho([new Error("x"), OK]), "Deals", "1")).toBe(true);
    expect(await tickAddedRevision(fakeZoho([OK, { data: [{ code: "INVALID_DATA" }] }]), "Deals", "1")).toBe(false);
    expect(await tickAddedRevision(fakeZoho([OK, new Error("down")]), "Deals", "1")).toBe(false);
  });
});
