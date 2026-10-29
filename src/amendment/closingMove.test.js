import dayjs from "dayjs";
import { IN_PRODUCTION_STAGES, amendmentDatePlan, amendmentDatesOn, datesChanged, describeMove, moveInProductionOn, readMove } from "./closingMove";

// E-150 (David 10-29): the Amendment Form's Dates answers move the Deal's Closing Date; in production the open Produce tasks follow.
const EARLY = "Design Mock-Up Sent";
const PROD = "Mock-Up Approved / In Production";
const hard = (due, rush = false) => ({ hardDueDate: "Yes", dueDate: dayjs(due), upchargedForRushTurnaround: rush });

describe("E-150 switches", () => {
  test("Dates writes on, the in-production move off until Deluge has built it", () => {
    expect(amendmentDatesOn()).toBe(true);
    expect(moveInProductionOn()).toBe(false);
  });
});

describe("E-150 datesChanged", () => {
  test("nothing about dates changed -> false (a dayjs and its text count as the same date)", () => {
    expect(datesChanged(hard("2026-11-20"), { ...hard("2026-11-20"), dueDate: "2026/11/20" })).toBe(false);
    expect(datesChanged({ hardDueDate: "No", discountsForExtendedTurnaround: "No" }, { hardDueDate: "No", discountsForExtendedTurnaround: "No", upchargedForRushTurnaround: false })).toBe(false);
  });
  test("a new due date, the rush tick, the extra week or its date each count", () => {
    expect(datesChanged(hard("2026-11-20"), hard("2026-11-27"))).toBe(true);
    expect(datesChanged(hard("2026-11-20"), hard("2026-11-20", true))).toBe(true);
    expect(datesChanged({ hardDueDate: "No", discountsForExtendedTurnaround: "No" }, { hardDueDate: "No", discountsForExtendedTurnaround: "Yes" })).toBe(true);
    expect(
      datesChanged(
        { hardDueDate: "No", discountsForExtendedTurnaround: "Yes", extendedClosingDate: "2026/11/23" },
        { hardDueDate: "No", discountsForExtendedTurnaround: "Yes", extendedClosingDate: "2026/11/20" }
      )
    ).toBe(true);
  });
});

describe("E-150 amendmentDatePlan", () => {
  test("before production: the form writes Turnaround + Closing Date itself, as onboarding does", () => {
    const deal = { Stage: EARLY, Turnaround: "Standard", Closing_Date: "2026-11-16" };
    expect(amendmentDatePlan(deal, hard("2026-11-20"))).toEqual({ kind: "write", fields: { Turnaround: "Hard Due Date", Closing_Date: "2026-11-20" } });
    expect(amendmentDatePlan(deal, hard("2026-11-20", true)).fields.Turnaround).toBe("Rush");
  });
  test("before production, back to Standard: Turnaround only (the master sets the date at In Production)", () => {
    const deal = { Stage: EARLY, Turnaround: "Hard Due Date", Closing_Date: "2026-11-20" };
    expect(amendmentDatePlan(deal, { hardDueDate: "No", discountsForExtendedTurnaround: "No" })).toEqual({ kind: "write", fields: { Turnaround: "Standard" } });
  });
  test("in production, switch on: Turnaround written here, the date moved by Deluge from -> to", () => {
    const deal = { Stage: PROD, Turnaround: "Standard", Closing_Date: "2026-11-16" };
    expect(amendmentDatePlan(deal, hard("2026-11-23"), { moveOn: true })).toEqual({
      kind: "move",
      fields: { Turnaround: "Hard Due Date" },
      from: "2026-11-16",
      to: "2026-11-23",
    });
    expect(amendmentDatePlan({ ...deal, Stage: "Online Purchase / In Production" }, hard("2026-11-23"), { moveOn: true }).kind).toBe("move");
  });
  test("in production, switch off: the date is NOT moved and the rep is told; the Turnaround still follows", () => {
    const deal = { Stage: PROD, Turnaround: "Standard", Closing_Date: "2026-11-16" };
    const p = amendmentDatePlan(deal, hard("2026-11-23"), { moveOn: false });
    expect(p.kind).toBe("blocked");
    expect(p.fields).toEqual({ Turnaround: "Hard Due Date" });
    expect(p.message).toMatch(/not switched on yet/);
    expect(p.message).toMatch(/2026-11-23/);
  });
  test("in production, same date: nothing to move (a Turnaround-only change is just written)", () => {
    const deal = { Stage: PROD, Turnaround: "Hard Due Date", Closing_Date: "2026-11-23" };
    expect(amendmentDatePlan(deal, hard("2026-11-23"), { moveOn: true })).toEqual({ kind: "none" });
    expect(amendmentDatePlan(deal, hard("2026-11-23", true), { moveOn: true })).toEqual({ kind: "write", fields: { Turnaround: "Rush" } });
  });
  test("past production: nothing written, the rep is told", () => {
    const deal = { Stage: "Quality Check", Turnaround: "Standard", Closing_Date: "2026-11-16" };
    const p = amendmentDatePlan(deal, hard("2026-11-23"), { moveOn: true });
    expect(p).toMatchObject({ kind: "blocked", fields: {} });
    expect(p.message).toMatch(/past production/);
  });
  test("the in-production list holds only stages measured in the CRM", () => {
    expect(IN_PRODUCTION_STAGES).toEqual(["Mock-Up Approved / In Production", "Online Purchase / In Production"]);
  });
});

describe("E-150 the Deluge answer", () => {
  test("read and described for the rep (English half of the task subject)", () => {
    const m = readMove({
      status: "ok",
      closing_before: "2026-11-16",
      closing_after: "2026-11-23",
      shift_days: 7,
      moved: [{ id: "1", subject: "EMBROIDERY: Produce Order / BORDADO: Orden de producción", from: "2026-11-06", to: "2026-11-13" }],
    });
    expect(m.ok).toBe(true);
    expect(describeMove(m)).toBe(
      "Closing Date 2026-11-16 → 2026-11-23 (+7 days); 1 open production task moved: EMBROIDERY: Produce Order 2026-11-06 → 2026-11-13"
    );
  });
  test("a date pulled earlier, no tasks; an error answer is not ok", () => {
    expect(describeMove(readMove({ status: "ok", closing_before: "2026-11-23", closing_after: "2026-11-20", shift_days: -3, moved: [] }))).toBe(
      "Closing Date 2026-11-23 → 2026-11-20 (-3 days); no open production tasks to move"
    );
    expect(readMove({ status: "unavailable", message: "WIDGET_Move_Closing_Date is not installed yet" }).ok).toBe(false);
  });
});
