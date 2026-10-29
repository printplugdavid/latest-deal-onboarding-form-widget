import dayjs from "dayjs";
import { IN_PRODUCTION_STAGES, amendmentDatePlan, amendmentDatesOn, datesChanged, describeMove, moveArgs, moveInProductionOn, newDateProblem, readMove } from "./closingMove";

const TODAY = "2026-10-29";

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
    expect(amendmentDatePlan(deal, hard("2026-11-23"), { moveOn: true, today: TODAY })).toEqual({
      kind: "move",
      fields: { Turnaround: "Hard Due Date" },
      from: "2026-11-16",
      to: "2026-11-23",
      turnaround: "Hard Due Date",
    });
    expect(amendmentDatePlan({ ...deal, Stage: "Online Purchase / In Production" }, hard("2026-11-23"), { moveOn: true, today: TODAY }).kind).toBe("move");
  });
  test("in production, switch off: the date is NOT moved and the rep is told; the Turnaround still follows", () => {
    const deal = { Stage: PROD, Turnaround: "Standard", Closing_Date: "2026-11-16" };
    const p = amendmentDatePlan(deal, hard("2026-11-23"), { moveOn: false, today: TODAY });
    expect(p.kind).toBe("blocked");
    expect(p.fields).toEqual({ Turnaround: "Hard Due Date" });
    expect(p.message).toMatch(/not switched on yet/);
    expect(p.message).toMatch(/2026-11-23/);
  });
  test("in production, same date: nothing to move (a Turnaround-only change is just written)", () => {
    const deal = { Stage: PROD, Turnaround: "Hard Due Date", Closing_Date: "2026-11-23" };
    expect(amendmentDatePlan(deal, hard("2026-11-23"), { moveOn: true, today: TODAY })).toEqual({ kind: "none" });
    expect(amendmentDatePlan(deal, hard("2026-11-23", true), { moveOn: true, today: TODAY })).toEqual({ kind: "write", fields: { Turnaround: "Rush" } });
  });
  test("in production, switch on, a new date of today: not moved (Deluge docs/51 §6: it would be stamped past due)", () => {
    const deal = { Stage: PROD, Turnaround: "Hard Due Date", Closing_Date: "2026-11-16" };
    const p = amendmentDatePlan(deal, hard(TODAY), { moveOn: true, today: TODAY });
    expect(p.kind).toBe("blocked");
    expect(p.message).toMatch(/not after today/);
  });
  test("finished or closed: nothing written, the rep is told", () => {
    const deal = { Stage: "Products Shipped", Turnaround: "Standard", Closing_Date: "2026-11-16" };
    const p = amendmentDatePlan(deal, hard("2026-11-23"), { moveOn: true, today: TODAY });
    expect(p).toMatchObject({ kind: "blocked", fields: {} });
    expect(p.message).toMatch(/does not move dates/);
  });
  test("the move runs from In Production until the order has left (David: any stage), on stage names the CRM uses", () => {
    expect(IN_PRODUCTION_STAGES).toHaveLength(9);
    for (const stage of ["Order Needs Corrections", "Quality Check", "Failed Quality Check", "Production Complete - No Remainder"]) {
      expect(amendmentDatePlan({ Stage: stage, Turnaround: "Hard Due Date", Closing_Date: "2026-11-16" }, hard("2026-11-23"), { moveOn: true, today: TODAY }).kind).toBe("move");
    }
    for (const stage of ["Needs Pickup", "Remarketing, Social Proof Done / Deal Closed", "ADVERTISER: Mock-Up Approved", "Online Purchase / Needs Review"]) {
      expect(amendmentDatePlan({ Stage: stage, Turnaround: "Hard Due Date", Closing_Date: "2026-11-16" }, hard("2026-11-23"), { moveOn: true, today: TODAY }).kind).toBe("blocked");
    }
  });
});

describe("E-150 newDateProblem", () => {
  test("a new date must be tomorrow or later", () => {
    expect(newDateProblem(dayjs("2026-10-29"), TODAY)).toMatch(/after today/);
    expect(newDateProblem("2026/10/28", TODAY)).toMatch(/after today/);
    expect(newDateProblem(dayjs("2026-10-30"), TODAY)).toBe("");
    expect(newDateProblem(null, TODAY)).toBe("Required");
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
  test("Deluge's own shape (ok: true, docs/51) counts; a refusal shows its reason; skipped rush tasks are named", () => {
    const m = readMove({
      status: "unavailable", // what our reader sets when the answer has no status key
      ok: true,
      closing_before: "2026-11-23",
      closing_after: "2026-11-18",
      shift_days: -5,
      moved: [],
      skipped: [{ subject: "RUSH: OUTSOURCED: Order Products / CORRER: TERCERIZADA: Ordenar Productos", due: "2026-11-20", reason: "due after the new Closing Date" }],
    });
    expect(m.ok).toBe(true);
    expect(describeMove(m)).toBe(
      "Closing Date 2026-11-23 → 2026-11-18 (-5 days); no open production tasks to move. Not moved: RUSH: OUTSOURCED: Order Products " +
        "(due 2026-11-20) - due after the new Closing Date. Tell the production manager if those need a new date"
    );
    const no = readMove({ ok: false, reason: "new_date is before tomorrow" });
    expect(no.ok).toBe(false);
    expect(no.message).toBe("new_date is before tomorrow");
  });
  test("a refusal that still says status ok is NOT ok (ok decides); the arguments go as text", () => {
    expect(readMove({ status: "ok", ok: false, result: "refused", reason: "stage not accepted" }).ok).toBe(false);
    expect(readMove({ status: "ok", ok: true, result: "moved", moved: [], skipped: [] }).ok).toBe(true);
    expect(moveArgs(5249739000087561441n, { to: "2026-11-23", turnaround: "Hard Due Date" }, false)).toEqual({
      deal_id: "5249739000087561441",
      new_date: "2026-11-23",
      turnaround: "Hard Due Date",
      dry_run: "false",
    });
    expect(moveArgs("1", { to: "2026-11-23" }, true).dry_run).toBe("true");
  });
});
