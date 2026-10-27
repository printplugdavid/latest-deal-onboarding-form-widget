import { PRE_PRODUCTION_STAGES, rushBoxPlan, wantsRush } from "./rushOrder";

// E-142 (David 2026-10-27): the form's rush answer sets the Deal's Rush box, both ways, before production only.
const rush = { hardDueDate: "Yes", upchargedForRushTurnaround: true };
const noRush = { hardDueDate: "Yes", upchargedForRushTurnaround: false };
const deal = (Stage, Rush_Order) => ({ Stage, Rush_Order });

describe("E-142 rush answer -> the Deal's Rush box", () => {
  test("rush = a hard due date AND the rush upcharge ticked", () => {
    expect(wantsRush(rush)).toBe(true);
    expect(wantsRush(noRush)).toBe(false);
    expect(wantsRush({ hardDueDate: "No", upchargedForRushTurnaround: true })).toBe(false); // a stale tick after switching to No
    expect(wantsRush({ hardDueDate: "Yes" })).toBe(false);
    expect(wantsRush(null)).toBe(false);
  });

  test("before production: ticks it, and takes a hand tick off when the answer is No", () => {
    expect(rushBoxPlan(deal("Prospect - Invoice Sent", false), rush)).toMatchObject({ change: true, value: true, blocked: false });
    expect(rushBoxPlan(deal("Payment Deferred - In Design", true), noRush)).toMatchObject({ change: true, value: false, blocked: false });
    expect(rushBoxPlan(deal("Design Mock-Up Sent", true), { hardDueDate: "No" })).toMatchObject({ change: true, value: false });
  });

  test("already right: nothing to do, whatever the stage", () => {
    expect(rushBoxPlan(deal("Quality Check", true), rush)).toEqual({ change: false, value: true, blocked: false, message: "" });
    expect(rushBoxPlan(deal("Prospect - Send Invoice", undefined), noRush)).toMatchObject({ change: false, blocked: false });
  });

  test("in production or later, school / advertiser, online, or an unknown stage: no write, the rep is told", () => {
    ["Mock-Up Approved / In Production", "Test Garment Approved", "Quality Check", "Online Purchase / Needs Review", "SCHOOL: Mock-Up Sent", "Business Deferred", "Some New Stage", ""].forEach((s) => {
      const p = rushBoxPlan(deal(s, false), rush);
      expect(p.change).toBe(false);
      expect(p.blocked).toBe(true);
      expect(p.message).toMatch(/production manager/);
    });
    expect(rushBoxPlan(deal("Mock-Up Approved / In Production", true), noRush).message).toMatch(/NOT a rush.*it is ticked/);
  });

  test("the allowlist holds only early staff stages", () => {
    expect(PRE_PRODUCTION_STAGES).not.toContain("Mock-Up Approved / In Production");
    expect(PRE_PRODUCTION_STAGES.every((s) => !/SCHOOL|ADVERTISER|Online|Production|Quality|Shipped|Fulfilled/i.test(s))).toBe(true);
  });
});
