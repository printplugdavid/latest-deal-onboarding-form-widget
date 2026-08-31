/*
 * Revision / Correction form -- The Print Plug
 *
 * Runs as a Zoho CRM widget on a Deal. Reads the onboarding payload attached to
 * that Deal, lets the QC agent say what went wrong and which garments are
 * affected, then computes the reprint count using the ONBOARDING form's own
 * calculation (src/printMath.js) and writes it to the Deal.
 *
 * The agent supplies one number per affected garment. Everything else -- colors,
 * underbase, placements, department -- comes off the record.
 */
import { useEffect, useMemo, useState } from "react";
import { computePrints, departmentFor } from "./printMath";
import { readPayload, normalizeProducts } from "./payload";

const ZOHO = window.ZOHO;

/*
 * Zoho picklists carry a display label AND a stored value, and several of these
 * have diverged because the option was renamed -- Zoho keeps the original value
 * underneath. The API writes the VALUE. Verified against field metadata
 * 31 Aug 2026. If someone renames an option in CRM, the label here changes; if
 * someone adds one, both change. Never send a label.
 */
const DEPARTMENTS = [
  { label: "Screen Printing", value: "Screen Printing" },
  { label: "Embroidery", value: "Embroidery" },
  { label: "Vinyl Department", value: "Vinyl & Digital Print" }, // renamed in CRM
  { label: "Outsourced", value: "Outsourced" },
  { label: "Graphic Design", value: "Graphic Design" },
  { label: "Ordering", value: "Ordering" },
];

const REVISION_CATEGORIES = [
  { label: "Misprint (Placement)", value: "Misprint (Placement)" },
  { label: "Misprint (Wrong Graphic)", value: "Misprint (Wrong Graphic)" },
  { label: "Misprint (Wrong Colors)", value: "Misprint (Wrong Colors)" },
  { label: "Misprint (Malfunction)", value: "Misprint (Malfunction)" },
  { label: "Misprint (Wrong Size or Product)", value: "Misprint (Wrong Size or Product)" },
  { label: "Misprint (Other)", value: "Misprint (Other)" },
  { label: "Wrong Product Size (Misorder)", value: "Wrong Product Size (Misorder)" },
  { label: "Wrong Product Type (Misorder)", value: "Wrong Product Type (Misorder)" },
  { label: "Missing Product", value: "Missing Product" },
  { label: "Damaged Product (Shipped Damaged)", value: "Damaged Product (Shipped Damaged)" },
  { label: "Damaged Product (During Production)", value: "Damaged Product (During Production)" },
  { label: "Client Unhappy", value: "Client Unhappy" },
  {
    label: "Other (Please Detail in Revision Reason Notes)",
    value: "Other (Please Detail in Notes)", // renamed in CRM
  },
];

// Correction_Category is SINGLE-select and has no "Misprint (Placement)".
// Its first two options were repurposed from "Salvaged Garment" / "Inventory".
const CORRECTION_CATEGORIES = [
  { label: "Misprint (Wrong Graphic)", value: "Salvaged Garment" }, // renamed in CRM
  { label: "Misprint (Wrong Colors)", value: "Inventory" }, // renamed in CRM
  { label: "Misprint (Malfunction)", value: "Misprint (Malfunction)" },
  { label: "Misprint (Wrong Size or Product)", value: "Misprint (Wrong Size or Product)" },
  { label: "Misprint (Other)", value: "Misprint (Other)" },
  { label: "Wrong Product Size (Misorder)", value: "Wrong Product Size (Misorder)" },
  { label: "Wrong Product Type (Misorder)", value: "Wrong Product Type (Misorder)" },
  { label: "Missing Product", value: "Missing Product" },
  { label: "Damaged Product (Shipped Damaged)", value: "Damaged Product (Shipped Damaged)" },
  { label: "Damaged Product (During Production)", value: "Damaged Product (During Production)" },
  { label: "Client Unhappy", value: "Client Unhappy" },
  {
    label: "Other (Please Detail in Correction Reason Notes)",
    value: "Other (Please Detail in Correction Reason Notes)",
  },
];

const MAX_SLOTS = { Revision: 3, Correction: 2 };

// ---------------------------------------------------------------- utilities

function zohoNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const oh = p(Math.floor(Math.abs(off) / 60));
  const om = p(Math.abs(off) % 60);
  return (
    d.getFullYear() +
    "-" + p(d.getMonth() + 1) +
    "-" + p(d.getDate()) +
    "T" + p(d.getHours()) +
    ":" + p(d.getMinutes()) +
    ":" + p(d.getSeconds()) +
    sign + oh + ":" + om
  );
}

const int = (v) => parseInt(v, 10) || 0;

// Values are what we store; labels are what the agent reads.
const labelOf = (list, value) => (list.find((o) => o.value === value) || {}).label || value;

function garmentLabel(branch, i) {
  const bits = [];
  if (branch?.garmentType) bits.push(String(branch.garmentType).trim());
  if (branch?.garmentQuantity) bits.push("qty " + branch.garmentQuantity);
  if (branch?.countColorSize) bits.push(String(branch.countColorSize).trim());
  return "Garment " + (i + 1) + (bits.length ? " — " + bits.join("  ·  ") : "");
}

function graphicLabel(graphic, i) {
  const bits = [];
  if (graphic?.graphicDescription) {
    const d = String(graphic.graphicDescription).trim();
    bits.push(d.length > 60 ? d.slice(0, 60) + "…" : d);
  }
  if (graphic?.numberOfColorsUsed) bits.push(graphic.numberOfColorsUsed + " color");
  if (graphic?.numberOfPlacements) bits.push(graphic.numberOfPlacements + " placement");
  return "Graphic " + (i + 1) + (bits.length ? " — " + bits.join("  ·  ") : "");
}

function placementLabel(pl, i) {
  const bits = [];
  if (pl?.placementLocation) bits.push(String(pl.placementLocation).trim());
  if (pl?.sizeAndDimensions) bits.push(String(pl.sizeAndDimensions).trim());
  return "Placement " + (i + 1) + (bits.length ? " — " + bits.join("  ·  ") : "");
}

/*
 * Build a synthetic products array for one affected item and hand it to the
 * onboarding calculation. Revision = every graphic on that garment reprints.
 * Correction = only the affected placement is redone.
 */
function syntheticProducts(products, item, formType) {
  const product = products[item.productIndex];
  if (!product) return [];
  const branch = product?.primaryBranches?.[item.garmentIndex];
  if (!branch) return [];

  let graphics = branch.secondaryBranches || [];
  if (formType === "Correction") {
    const g = graphics[item.graphicIndex];
    if (!g) return [];
    graphics = [{ ...g, numberOfPlacements: "1" }];
  }

  return [
    {
      ...product,
      primaryBranches: [
        { ...branch, garmentQuantity: String(item.affected || 0), secondaryBranches: graphics },
      ],
    },
  ];
}

// ---------------------------------------------------------------- component

export default function App() {
  const [status, setStatus] = useState("loading");
  const [fatal, setFatal] = useState("");
  const [ctx, setCtx] = useState({ entity: null, recordId: null });
  const [deal, setDeal] = useState(null);
  const [products, setProducts] = useState([]);
  const [payloadInfo, setPayloadInfo] = useState(null);

  const [formType, setFormType] = useState("Revision");
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reason, setReason] = useState("");
  const [items, setItems] = useState([]);
  const [touchedDepartments, setTouchedDepartments] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // ---- load -------------------------------------------------------------
  useEffect(() => {
    if (!ZOHO || !ZOHO.embeddedApp) {
      setFatal("Not running inside a Zoho widget. Open this from a Deal record.");
      setStatus("error");
      return;
    }

    ZOHO.embeddedApp.on("PageLoad", async (data) => {
      try {
        ZOHO.CRM.UI.Resize({ height: "92%", width: "70%" });
      } catch (e) {
        /* cosmetic */
      }

      const entity = data?.Entity;
      const recordId = data?.EntityId?.[0];
      setCtx({ entity, recordId });

      if (!entity || !recordId) {
        setFatal("No record context. Open this widget from a Deal.");
        setStatus("error");
        return;
      }

      try {
        const rec = await ZOHO.CRM.API.getRecord({
          Entity: entity,
          approved: "both",
          RecordID: recordId,
        });
        setDeal(rec?.data?.[0] || null);

        const p = await readPayload(entity, recordId);
        setPayloadInfo(p);
        if (p.ok) setProducts(normalizeProducts(p.data));
        setStatus("ready");
      } catch (err) {
        setFatal("Could not load the deal: " + ((err && err.message) || String(err)));
        setStatus("error");
      }
    });

    ZOHO.embeddedApp.init();
  }, []);

  // ---- derived ----------------------------------------------------------
  const garmentProducts = useMemo(
    () =>
      products
        .map((p, i) => ({ product: p, index: i }))
        .filter(
          (x) => x.product?.productType === "garment" && (x.product?.primaryBranches || []).length
        ),
    [products]
  );

  const totals = useMemo(() => {
    const sum = { SD: 0, ED: 0, VD: 0 };
    const detail = [];
    items.forEach((item) => {
      if (!item.affected || item.productIndex === "" || item.garmentIndex === "") return;
      if (formType === "Correction" && item.graphicIndex === "") return;
      const synth = syntheticProducts(products, item, formType);
      const r = computePrints(synth);
      sum.SD += r.SD;
      sum.ED += r.ED;
      sum.VD += r.VD;
      detail.push({ item, result: r });
    });
    return { sum, detail };
  }, [items, products, formType]);

  // Pre-fill the producing department from the selection, so it can't be omitted.
  useEffect(() => {
    if (touchedDepartments) return;
    const auto = new Set();
    items.forEach((item) => {
      const p = products[item.productIndex];
      if (p) auto.add(departmentFor(p.productName, p.productType));
    });
    setDepartments(Array.from(auto));
  }, [items, products, touchedDepartments]);

  const counts = {
    Revision: int(deal?.Revision_Count),
    Correction: int(deal?.Correction_Count),
  };
  const slot = counts[formType] + 1;
  const overCap = slot > MAX_SLOTS[formType];

  const categoryList = formType === "Revision" ? REVISION_CATEGORIES : CORRECTION_CATEGORIES;

  const canSubmit =
    !submitting &&
    !overCap &&
    departments.length > 0 &&
    categories.length > 0 &&
    reason.trim().length > 0 &&
    totals.detail.length > 0;

  // ---- actions ----------------------------------------------------------
  function addItem() {
    setItems((prev) => [
      ...prev,
      { productIndex: "", garmentIndex: "", graphicIndex: "", placementIndex: "", affected: "" },
    ]);
  }

  function patchItem(i, patch) {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  function removeItem(i) {
    setItems((prev) => prev.filter((_, j) => j !== i));
  }

  function toggle(list, setList, value) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : list.concat(value));
  }

  function buildNote() {
    const L = [];
    L.push("ORDER " + formType.toUpperCase() + " FORM");
    L.push("---------------------------");
    L.push("");
    L.push("Type: Order " + formType);
    L.push("Event number: " + slot + " of " + MAX_SLOTS[formType]);
    L.push("Logged: " + zohoNow());
    L.push("");
    L.push("Department(s): " + departments.map((d) => labelOf(DEPARTMENTS, d)).join(", "));
    L.push("Category: " + categories.map((c) => labelOf(categoryList, c)).join(", "));
    L.push("Reason:");
    L.push(reason.trim());
    L.push("");
    L.push("AFFECTED ITEMS");
    L.push("---------------------------");
    totals.detail.forEach(({ item, result }, n) => {
      const p = products[item.productIndex];
      const b = p?.primaryBranches?.[item.garmentIndex];
      L.push("");
      L.push("Item " + (n + 1) + ": " + p?.productName);
      L.push("  " + garmentLabel(b, item.garmentIndex));
      if (formType === "Correction") {
        const g = b?.secondaryBranches?.[item.graphicIndex];
        L.push("  " + graphicLabel(g, item.graphicIndex));
        if (item.placementIndex !== "") {
          const pl = g?.tartiaryBranches?.[item.placementIndex];
          L.push("  " + placementLabel(pl, item.placementIndex));
        }
      } else {
        L.push(
          "  All graphics on this garment reprinted (" + (b?.secondaryBranches || []).length + ")"
        );
      }
      L.push("  Garments affected: " + item.affected);
      L.push("  Prints — SD " + result.SD + " | ED " + result.ED + " | VD " + result.VD);
      L.push(
        "    actual  SD " + result.actual.SD + " | ED " + result.actual.ED + " | VD " + result.actual.VD
      );
      L.push(
        "    projected  SD " + result.projected.SD + " | ED " + result.projected.ED + " | VD " + result.projected.VD
      );
    });
    L.push("");
    L.push("TOTAL WRITTEN TO SLOT " + slot);
    L.push("---------------------------");
    L.push("  Screen Print: " + totals.sum.SD);
    L.push("  Embroidery:   " + totals.sum.ED);
    L.push("  Vinyl:        " + totals.sum.VD);
    return L.join("\n");
  }

  /*
   * Zoho picklists have a display label and a stored value, and several of
   * these have diverged (an option's API value cannot be edited once created,
   * so renaming leaves the original underneath). Rather than gamble on which
   * one a write accepts, send the stored values first and fall back to the
   * labels if Zoho rejects them. The banner reports which path worked, so the
   * first real submit tells us the answer for good.
   */
  function buildApiData(useLabels) {
    const now = zohoNow();
    const prefix = formType === "Revision" ? "Revision" : "Correction";
    const dept = useLabels ? departments.map((d) => labelOf(DEPARTMENTS, d)) : departments;
    const cats = useLabels ? categories.map((c) => labelOf(categoryList, c)) : categories;

    const api = { id: ctx.recordId };
    api[prefix + "_Prints_SD_" + slot] = totals.sum.SD;
    api[prefix + "_Prints_ED_" + slot] = totals.sum.ED;
    api[prefix + "_Prints_VD_" + slot] = totals.sum.VD;
    api[prefix + "_Count"] = slot;
    api[prefix + "_Department"] = dept;
    api[prefix + "_Reason"] = reason.trim();
    api.Failed_Quality_Check_Date_Time = now;

    if (formType === "Revision") {
      api.Revision_Category = cats;
      api.Order_Needs_Revision_Date_Time = now;
    } else {
      api.Correction_Category = cats[0];
      api.Order_Needs_Corrections_DATE_TIME = now;
    }
    return api;
  }

  async function submit() {
    setSubmitting(true);
    setResult(null);
    try {
      let usedLabels = false;
      let upd = await ZOHO.CRM.API.updateRecord({
        Entity: ctx.entity,
        APIData: buildApiData(false),
      });

      if (upd?.data?.[0]?.code !== "SUCCESS") {
        // Retry once with display labels in case this org's picklists accept those.
        usedLabels = true;
        upd = await ZOHO.CRM.API.updateRecord({
          Entity: ctx.entity,
          APIData: buildApiData(true),
        });
      }

      if (upd?.data?.[0]?.code !== "SUCCESS") {
        const d = upd?.data?.[0];
        setResult({
          ok: false,
          message:
            "Nothing was saved. Zoho rejected both the stored values and the display labels. " +
            (d?.message || "") +
            (d?.details ? " " + JSON.stringify(d.details) : ""),
        });
        setSubmitting(false);
        return;
      }

      await ZOHO.CRM.API.addNotes({
        Entity: ctx.entity,
        RecordID: ctx.recordId,
        Title: "ORDER " + formType.toUpperCase() + " FORM",
        Content: buildNote(),
      });

      setResult({
        ok: true,
        message:
          "Saved to slot " + slot + "." +
          (usedLabels
            ? " (Picklists accepted the display labels, not the stored values — tell Claude, the code should be simplified.)"
            : ""),
      });
      setSubmitting(false);
      setTimeout(() => {
        try {
          ZOHO.CRM.UI.Popup.closeReload();
        } catch (e) {
          /* ignore */
        }
      }, usedLabels ? 4000 : 900);
    } catch (err) {
      setResult({ ok: false, message: (err && err.message) || String(err) });
      setSubmitting(false);
    }
  }

  // ---- render -----------------------------------------------------------
  if (status === "loading")
    return (
      <Shell>
        <p style={S.muted}>Loading the order…</p>
      </Shell>
    );
  if (status === "error")
    return (
      <Shell>
        <Banner kind="bad">{fatal}</Banner>
      </Shell>
    );

  return (
    <Shell>
      <div style={S.head}>
        <div>
          <div style={S.h1}>Order {formType}</div>
          <div style={S.sub}>{deal?.Deal_Name || ctx.recordId}</div>
        </div>
        <div style={S.slotBadge}>
          {overCap ? "at limit" : "event " + slot + " of " + MAX_SLOTS[formType]}
        </div>
      </div>

      {payloadInfo && !payloadInfo.ok && (
        <Banner kind="warn">
          {payloadInfo.reason === "no-payload"
            ? "This deal has no onboarding payload attached — it predates the JSON change. The garment picker will be empty."
            : "Payload could not be read (" + payloadInfo.reason + ")."}
        </Banner>
      )}

      {overCap && (
        <Banner kind="bad">
          This deal has already had {counts[formType]} {formType.toLowerCase()}
          {counts[formType] === 1 ? "" : "s"}, which is the limit.
          {formType === "Correction"
            ? " A garment will not take a third reprint — log this as a Revision instead."
            : " Escalate rather than logging a fourth."}
        </Banner>
      )}

      <Section n="1" title="Type">
        <div style={S.row}>
          {["Revision", "Correction"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setFormType(t);
                setCategories([]);
              }}
              style={formType === t ? S.pillOn : S.pill}
            >
              Order {t}
            </button>
          ))}
        </div>
        <p style={S.hint}>
          {formType === "Revision"
            ? "The blank is reordered and every graphic on the garment is reprinted."
            : "The garment is salvaged in-house and one placement is redone."}
        </p>
      </Section>

      <Section n="2" title="What went wrong">
        <Label>Department</Label>
        <div style={S.wrap}>
          {DEPARTMENTS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => {
                setTouchedDepartments(true);
                toggle(departments, setDepartments, d.value);
              }}
              style={departments.includes(d.value) ? S.chipOn : S.chip}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p style={S.hint}>
          Who is getting the {formType.toLowerCase()} task. The department that runs the reprint is
          filled in from the garments below — add any others that will do work on it. This often
          lines up with who caused the problem, but it is not a fault field.
        </p>

        <Label>Category {formType === "Correction" ? "(pick one)" : "(pick one or more)"}</Label>

        {formType === "Correction" ? (
          <select
            value={categories[0] || ""}
            onChange={(e) => setCategories(e.target.value ? [e.target.value] : [])}
            style={S.select}
          >
            <option value="">— select —</option>
            {categoryList.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        ) : (
          <>
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v && !categories.includes(v)) setCategories(categories.concat(v));
              }}
              style={S.select}
            >
              <option value="">
                {categories.length ? "+ add another category…" : "— select —"}
              </option>
              {categoryList
                .filter((c) => !categories.includes(c.value))
                .map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
            </select>

            {categories.length > 0 && (
              <div style={S.tags}>
                {categories.map((c) => (
                  <span key={c} style={S.tag}>
                    {labelOf(categoryList, c)}
                    <button
                      type="button"
                      onClick={() => setCategories(categories.filter((x) => x !== c))}
                      style={S.tagX}
                      aria-label={"Remove " + labelOf(categoryList, c)}
                      title={"Remove " + labelOf(categoryList, c)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <Label>What happened?</Label>
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={S.textarea}
          placeholder="Plain description for whoever picks this up later."
        />
      </Section>

      <Section n="3" title="Which garments">
        {!items.length && <p style={S.muted}>No items yet.</p>}

        {items.map((item, i) => {
          const prod = products[item.productIndex];
          const branches = prod?.primaryBranches || [];
          const branch = branches[item.garmentIndex];
          const graphics = branch?.secondaryBranches || [];
          const graphic = graphics[item.graphicIndex];
          const placements = graphic?.tartiaryBranches || [];
          const found = totals.detail.find((d) => d.item === item);
          const r = found ? found.result : null;

          return (
            <div key={i} style={S.item}>
              <div style={S.itemHead}>
                <strong>Item {i + 1}</strong>
                <button type="button" onClick={() => removeItem(i)} style={S.remove}>
                  Remove
                </button>
              </div>

              <Label>Application</Label>
              <select
                value={item.productIndex}
                onChange={(e) =>
                  patchItem(i, {
                    productIndex: e.target.value === "" ? "" : Number(e.target.value),
                    garmentIndex: "",
                    graphicIndex: "",
                    placementIndex: "",
                  })
                }
                style={S.select}
              >
                <option value="">— select —</option>
                {garmentProducts.map((x) => (
                  <option key={x.index} value={x.index}>
                    {x.product.productName}
                  </option>
                ))}
              </select>

              {item.productIndex !== "" && (
                <>
                  <Label>Garment</Label>
                  <select
                    value={item.garmentIndex}
                    onChange={(e) =>
                      patchItem(i, {
                        garmentIndex: e.target.value === "" ? "" : Number(e.target.value),
                        graphicIndex: "",
                        placementIndex: "",
                      })
                    }
                    style={S.select}
                  >
                    <option value="">— select —</option>
                    {branches.map((b, bi) => (
                      <option key={bi} value={bi}>
                        {garmentLabel(b, bi)}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {formType === "Correction" && item.garmentIndex !== "" && (
                <>
                  <Label>Graphic</Label>
                  <select
                    value={item.graphicIndex}
                    onChange={(e) =>
                      patchItem(i, {
                        graphicIndex: e.target.value === "" ? "" : Number(e.target.value),
                        placementIndex: "",
                      })
                    }
                    style={S.select}
                  >
                    <option value="">— select —</option>
                    {graphics.map((g, gi) => (
                      <option key={gi} value={gi}>
                        {graphicLabel(g, gi)}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {formType === "Correction" && item.graphicIndex !== "" && placements.length > 0 && (
                <>
                  <Label>Placement redone</Label>
                  <select
                    value={item.placementIndex}
                    onChange={(e) =>
                      patchItem(i, {
                        placementIndex: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                    style={S.select}
                  >
                    <option value="">— select —</option>
                    {placements.map((pl, pi) => (
                      <option key={pi} value={pi}>
                        {placementLabel(pl, pi)}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {formType === "Revision" && item.garmentIndex !== "" && (
                <p style={S.hint}>
                  All {graphics.length} graphic{graphics.length === 1 ? "" : "s"} on this garment
                  will be reprinted.
                </p>
              )}

              {item.garmentIndex !== "" && (
                <>
                  <Label>Garments affected</Label>
                  <input
                    type="number"
                    min="1"
                    value={item.affected}
                    onChange={(e) => patchItem(i, { affected: e.target.value })}
                    style={S.input}
                  />
                  {branch?.garmentQuantity && (
                    <p style={S.hint}>Original order was {branch.garmentQuantity}.</p>
                  )}
                </>
              )}

              {r && (
                <div style={S.itemTotals}>
                  Screen Print <b>{r.SD}</b> &nbsp;·&nbsp; Embroidery <b>{r.ED}</b> &nbsp;·&nbsp;
                  Vinyl <b>{r.VD}</b>
                </div>
              )}
            </div>
          );
        })}

        <button type="button" onClick={addItem} style={S.add} disabled={!garmentProducts.length}>
          + Add {items.length ? "another" : "an"} affected garment
        </button>
        {!garmentProducts.length && (
          <p style={S.hint}>No garment products found in this deal&rsquo;s payload.</p>
        )}
      </Section>

      <Section n="4" title="Review">
        <div style={S.totalBox}>
          <div style={S.totalRow}>
            <span>Screen Print</span>
            <b style={S.num}>{totals.sum.SD}</b>
            <code style={S.field}>
              {formType}_Prints_SD_{slot}
            </code>
          </div>
          <div style={S.totalRow}>
            <span>Embroidery</span>
            <b style={S.num}>{totals.sum.ED}</b>
            <code style={S.field}>
              {formType}_Prints_ED_{slot}
            </code>
          </div>
          <div style={S.totalRow}>
            <span>Vinyl</span>
            <b style={S.num}>{totals.sum.VD}</b>
            <code style={S.field}>
              {formType}_Prints_VD_{slot}
            </code>
          </div>
        </div>
        <p style={S.hint}>
          Also stamps {formType === "Revision" ? "Order Needs Revision" : "Order Needs Corrections"}{" "}
          and Failed Quality Check, sets {formType}_Count to {slot}, and posts a note with the
          per-garment breakdown.
        </p>

        {result && <Banner kind={result.ok ? "ok" : "bad"}>{result.message}</Banner>}

        <div style={S.actions}>
          <button
            type="button"
            style={S.cancel}
            onClick={() => {
              try {
                ZOHO.CRM.UI.Popup.close();
              } catch (e) {
                /* ignore */
              }
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            style={canSubmit ? S.submit : S.submitOff}
            disabled={!canSubmit}
            onClick={submit}
          >
            {submitting ? "Saving…" : "Submit " + formType}
          </button>
        </div>
        {!canSubmit && !submitting && !overCap && (
          <p style={S.hint}>
            Needs a department, a category, a reason, and at least one garment with a count.
          </p>
        )}
      </Section>
    </Shell>
  );
}

// ---------------------------------------------------------------- chrome

function Shell({ children }) {
  return <div style={S.page}>{children}</div>;
}

function Section({ n, title, children }) {
  return (
    <section style={S.section}>
      <div style={S.sectionHead}>
        <span style={S.sectionNum}>{n}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function Label({ children }) {
  return <div style={S.label}>{children}</div>;
}

function Banner({ kind, children }) {
  const c = kind === "bad" ? "#b5372c" : kind === "ok" ? "#136b54" : "#8e5a00";
  const bg = kind === "bad" ? "#f8e5e2" : kind === "ok" ? "#dff0ea" : "#f8edd8";
  return (
    <div
      style={{
        borderLeft: "3px solid " + c,
        background: bg,
        color: "#15171b",
        padding: "10px 14px",
        margin: "0 0 14px",
        fontSize: 13.5,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

const sans = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const S = {
  page: { font: "14px/1.5 " + sans, color: "#15171b", padding: "18px 20px 40px", maxWidth: 760 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, borderBottom: "2px solid #15171b", paddingBottom: 12, marginBottom: 18 },
  h1: { font: "700 20px/1.2 " + sans, letterSpacing: "-0.01em" },
  sub: { color: "#5b6270", fontSize: 13, marginTop: 3 },
  slotBadge: { font: "600 11px/1 " + mono, letterSpacing: ".08em", textTransform: "uppercase", background: "#e4e7f8", color: "#2743c7", padding: "6px 9px", borderRadius: 2, whiteSpace: "nowrap" },
  section: { marginBottom: 26 },
  sectionHead: { font: "600 15px/1.2 " + sans, marginBottom: 10, display: "flex", alignItems: "center", gap: 9 },
  sectionNum: { font: "700 11px/1 " + mono, color: "#2743c7", border: "1px solid #2743c7", borderRadius: 2, padding: "3px 5px" },
  label: { font: "600 11px/1 " + mono, letterSpacing: ".09em", textTransform: "uppercase", color: "#5b6270", margin: "14px 0 6px" },
  hint: { fontSize: 12.5, color: "#5b6270", margin: "6px 0 0", lineHeight: 1.45 },
  muted: { color: "#5b6270" },
  row: { display: "flex", gap: 8 },
  wrap: { display: "flex", flexWrap: "wrap", gap: 6 },
  pill: { font: "600 13px " + sans, padding: "8px 16px", border: "1px solid #d3d6db", background: "#fff", borderRadius: 2, cursor: "pointer" },
  pillOn: { font: "600 13px " + sans, padding: "8px 16px", border: "1px solid #2743c7", background: "#2743c7", color: "#fff", borderRadius: 2, cursor: "pointer" },
  chip: { font: "13px " + sans, padding: "6px 10px", border: "1px solid #d3d6db", background: "#fff", borderRadius: 2, cursor: "pointer", textAlign: "left" },
  chipOn: { font: "13px " + sans, padding: "6px 10px", border: "1px solid #2743c7", background: "#e4e7f8", color: "#2743c7", borderRadius: 2, cursor: "pointer", textAlign: "left" },
  tags: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: { display: "inline-flex", alignItems: "center", gap: 6, font: "12.5px " + sans, background: "#e4e7f8", color: "#2743c7", border: "1px solid #c9d0f4", borderRadius: 2, padding: "4px 6px 4px 9px" },
  tagX: { font: "15px/1 " + sans, color: "#2743c7", background: "none", border: "none", cursor: "pointer", padding: "0 2px" },
  textarea: { width: "100%", font: "14px/1.5 " + sans, padding: "9px 11px", border: "1px solid #d3d6db", borderRadius: 2, resize: "vertical", boxSizing: "border-box" },
  select: { width: "100%", font: "13.5px " + sans, padding: "8px 10px", border: "1px solid #d3d6db", borderRadius: 2, background: "#fff", boxSizing: "border-box" },
  input: { width: 130, font: "14px " + sans, padding: "8px 10px", border: "1px solid #d3d6db", borderRadius: 2, boxSizing: "border-box" },
  item: { border: "1px solid #d3d6db", borderRadius: 2, padding: "14px 16px", marginBottom: 12, background: "#fbfbfc" },
  itemHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  remove: { font: "12px " + sans, color: "#b5372c", background: "none", border: "none", cursor: "pointer", padding: 0 },
  itemTotals: { marginTop: 12, paddingTop: 10, borderTop: "1px solid #e3e5e9", font: "13px " + mono, color: "#15171b" },
  add: { font: "600 13px " + sans, padding: "9px 14px", border: "1px dashed #b6bbc4", background: "#fff", borderRadius: 2, cursor: "pointer", width: "100%" },
  totalBox: { border: "1px solid #d3d6db", borderRadius: 2, overflow: "hidden" },
  totalRow: { display: "grid", gridTemplateColumns: "1fr auto auto", gap: 14, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #eceef1", background: "#fff" },
  num: { font: "700 17px " + mono, fontVariantNumeric: "tabular-nums", minWidth: 44, textAlign: "right" },
  field: { font: "11px " + mono, color: "#858c99" },
  actions: { display: "flex", gap: 10, marginTop: 18 },
  cancel: { font: "600 13px " + sans, padding: "10px 18px", border: "1px solid #d3d6db", background: "#fff", borderRadius: 2, cursor: "pointer" },
  submit: { font: "600 13px " + sans, padding: "10px 22px", border: "1px solid #2743c7", background: "#2743c7", color: "#fff", borderRadius: 2, cursor: "pointer" },
  submitOff: { font: "600 13px " + sans, padding: "10px 22px", border: "1px solid #d3d6db", background: "#eceef1", color: "#9aa0aa", borderRadius: 2, cursor: "not-allowed" },
};
