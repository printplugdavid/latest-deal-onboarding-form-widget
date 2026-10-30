import { MODIFICATION_NOTES_FIELD, ORDER_MODIFIED_FIELD, ORDER_MODIFIED_TASK, appendDated, openTaskMatching, orderChangesOn, reTick } from "./productionFlow";
import PRODUCTION_CONFIG from "./productionConfig.json";

// E-184 (David 10-30): "Changes made to order" on the flow -> Modification Notes + Order Modified re-ticked -> the Sales Person's follow-up.
describe("E-184 Changes made to order", () => {
  test("the Deal fields David named", () => {
    expect(ORDER_MODIFIED_FIELD).toBe("Order_Modified");
    expect(MODIFICATION_NOTES_FIELD).toBe("Modification_Notes");
  });

  test("Order Modified is never unticked by anything else, so a ticked box is unticked first (no workflow), then ticked (workflow)", () => {
    expect(reTick(ORDER_MODIFIED_FIELD, true)).toEqual([
      { fields: { Order_Modified: false }, workflow: false },
      { fields: { Order_Modified: true }, workflow: true },
    ]);
    expect(reTick(ORDER_MODIFIED_FIELD, false)).toEqual([{ fields: { Order_Modified: true }, workflow: true }]);
  });

  test("details are appended under earlier ones, dated", () => {
    expect(appendDated("", "[2026-10-30 Desi] client wants navy, not black")).toBe("[2026-10-30 Desi] client wants navy, not black");
    expect(appendDated("[2026-10-29 Ray] add 2 L\n", "[2026-10-30 Desi] navy")).toBe("[2026-10-29 Ray] add 2 L\n[2026-10-30 Desi] navy");
  });

  test("an open Order Modified Follow-Up is spotted (Deluge makes no second one); a completed one is not", () => {
    const subject = "SALES: Order Modified Follow-Up / VENTAS: Seguimiento de orden modificada";
    expect(ORDER_MODIFIED_TASK.test(subject)).toBe(true);
    expect(openTaskMatching([{ id: "1", Subject: subject, Status: "Not Started" }], ORDER_MODIFIED_TASK)).toBe(true);
    expect(openTaskMatching([{ id: "1", Subject: subject, Status: "Completed" }], ORDER_MODIFIED_TASK)).toBe(false);
    expect(openTaskMatching([{ id: "2", Subject: "SALES: Call Client", Status: "Not Started" }], ORDER_MODIFIED_TASK)).toBe(false);
    expect(openTaskMatching(null, ORDER_MODIFIED_TASK)).toBe(false);
  });

  test("switches", () => {
    expect(orderChangesOn({ orderChangesOn: true })).toBe(true);
    expect(orderChangesOn({})).toBe(false);
    expect(PRODUCTION_CONFIG.orderChangesOn).toBe(true);
    expect(PRODUCTION_CONFIG.garmentsProvidedOn).toBe(true);
  });
});
