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
import { departmentFor } from "./printMath";
import { readPayload } from "./payload";
import { deriveAgents } from "./agentAssign";
import {
  placementsOf,
  costItem,
  isGangSheet,
  gangPerSheet,
  embroiderySizes,
  effectiveQty,
  formatSizes,
  SIZE_OPTIONS,
  OTHER_SIZE,
} from "./affected";
import {
  makeT,
  loadLang,
  saveLang,
  labelDepartment,
  labelCategory,
  labelApplication,
} from "./i18n";

const ZOHO = window.ZOHO;

const DEPARTMENTS = [
  "Screen Printing",
  "Embroidery",
  "Vinyl Department",
  "Outsourced",
  "Graphic Design",
];

const REVISION_CATEGORIES = [
  "Misprint (Placement)",
  "Misprint (Wrong Graphic)",
  "Misprint (Wrong Colors)",
  "Misprint (Malfunction)",
  "Misprint (Wrong Size or Product)",
  "Misprint (Other)",
  "Wrong Product Size (Misorder)",
  "Wrong Product Type (Misorder)",
  "Missing Product",
  "Damaged Product (Shipped Damaged)",
  "Damaged Product (During Production)",
  "Client Unhappy",
  "Other (Please Detail in Revision Reason Notes)",
];

// Correction_Category is SINGLE-select and has no "Misprint (Placement)".
const CORRECTION_CATEGORIES = [
  "Misprint (Wrong Graphic)",
  "Misprint (Wrong Colors)",
  "Misprint (Malfunction)",
  "Misprint (Wrong Size or Product)",
  "Misprint (Other)",
  "Wrong Product Size (Misorder)",
  "Wrong Product Type (Misorder)",
  "Missing Product",
  "Damaged Product (Shipped Damaged)",
  "Damaged Product (During Production)",
  "Client Unhappy",
  "Other (Please Detail in Correction Reason Notes)",
];

// Revision_Agent / Correction_Agent picklist -- CRM user full names.
const AGENTS = [
  "Drew Byrd",
  "David Byrd",
  "Korie Byrd",
  "Ray Castaneda",
  "Desi Mastin",
  "Yefri Rivera",
  "David Rodriguez",
  "Rivelino Seva",
  "Angela Zervudakis",
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

// Garment text is often typed across several lines; labels and notes want one.
const oneLine = (v) => String(v || "").trim().replace(/\s*\n\s*/g, " / ");

/*
 * Revision_Details / Correction_Details are multi-line fields. Zoho's default
 * multi-line size is 2,000 characters, and a write that exceeds it fails the
 * WHOLE update -- print counts included. Cap it; the note always carries the
 * full version.
 */
const DETAILS_MAX = 2000;
function capDetails(text) {
  if (text.length <= DETAILS_MAX) return text;
  const tail = "\n… (shortened — full detail in the ORDER FORM note)";
  return text.slice(0, DETAILS_MAX - tail.length) + tail;
}

/*
 * Same wording the onboarding note uses in its PRINT COUNT SUMMARY, so the two
 * read alike. Unsized is shown only when there is one, as onboarding does.
 */
function sizeLine(s) {
  return (
    "Placement sizes \u2014 Small: " + s.Small +
    "  |  Medium: " + s.Medium +
    "  |  Large: " + s.Large +
    (s.Unsized ? "  |  Unsized: " + s.Unsized : "")
  );
}


function garmentLabel(branch, i) {
  const bits = [];
  if (branch?.garmentType) bits.push(oneLine(branch.garmentType));
  if (branch?.garmentQuantity) bits.push("qty " + branch.garmentQuantity);
  if (branch?.countColorSize) bits.push(oneLine(branch.countColorSize));
  return "Garment " + (i + 1) + (bits.length ? " — " + bits.join("  ·  ") : "");
}

/*
 * The sheet's size, however this deal recorded it: the note carries one
 * "Gang Sheet Size" string, the JSON carries width and height separately.
 */
function sheetSizeLabel(product) {
  const fromNote = oneLine(product?.gangSheetSize || "");
  if (fromNote) return fromNote;
  const w = String(product?.gangSheetWidth || "").trim();
  const h = String(product?.gangSheetHeight || "").trim();
  return w && h ? w + '" wide x ' + h + '" tall' : "";
}

function graphicLabel(graphic, i) {
  const bits = [];
  if (graphic?.graphicDescription) {
    const d = oneLine(graphic.graphicDescription);
    bits.push(d.length > 60 ? d.slice(0, 60) + "…" : d);
  }
  if (graphic?.numberOfColorsUsed) bits.push(graphic.numberOfColorsUsed + " color");
  if (graphic?.numberOfPlacements) bits.push(graphic.numberOfPlacements + " placement");
  return "Graphic " + (i + 1) + (bits.length ? " — " + bits.join("  ·  ") : "");
}

function placementLabel(pl, i) {
  const bits = [];
  if (pl?.placementLocation) bits.push(oneLine(pl.placementLocation));
  if (pl?.sizeAndDimensions) bits.push(oneLine(pl.sizeAndDimensions));
  return "Placement " + (i + 1) + (bits.length ? " — " + bits.join("  ·  ") : "");
}

/*
 * Build a synthetic products array for one affected item and hand it to the
 * onboarding calculation. Revision = every graphic on that garment reprints.
 * Correction = only the affected placement is redone.
 */
// ---------------------------------------------------------------- component

export default function App() {
  const [lang, setLang] = useState(loadLang);
  const t = useMemo(() => makeT(lang), [lang]);

  const [status, setStatus] = useState("loading");
  const [fatal, setFatal] = useState(null);
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
  const [completedTasks, setCompletedTasks] = useState([]);

  const [updateClosing, setUpdateClosing] = useState(false);
  const [newClosingDate, setNewClosingDate] = useState("");
  const [closingConfirmed, setClosingConfirmed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // ---- load -------------------------------------------------------------
  useEffect(() => {
    if (!ZOHO || !ZOHO.embeddedApp) {
      setFatal({ key: "b.notWidget" });
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
        setFatal({ key: "b.noContext" });
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
        if (p.ok) setProducts(p.products);

        // Completed tasks are how the responsible agent is identified.
        const grab = async (relatedList) => {
          try {
            const r = await ZOHO.CRM.API.getRelatedRecords({
              Entity: entity,
              RecordID: recordId,
              RelatedList: relatedList,
              page: 1,
              per_page: 200,
            });
            return r?.data || [];
          } catch (e) {
            return [];
          }
        };
        const closed = await grab("Tasks_History");
        const open = await grab("Tasks");
        setCompletedTasks(
          closed.concat(open).filter((t) => String(t?.Status || "") === "Completed")
        );

        setStatus("ready");
      } catch (err) {
        setFatal({ key: "b.loadFail", vars: { msg: (err && err.message) || String(err) } });
        setStatus("error");
      }
    });

    ZOHO.embeddedApp.init();
  }, []);

  // ---- derived ----------------------------------------------------------
  // Anything an agent can send back through the press: a garment that has at
  // least one garment branch, or a DTF gang sheet, whose unit is the sheet.
  const pickableProducts = useMemo(
    () =>
      products
        .map((p, i) => ({ product: p, index: i }))
        .filter(
          (x) =>
            isGangSheet(x.product) ||
            (x.product?.productType === "garment" && (x.product?.primaryBranches || []).length)
        ),
    [products]
  );

  const totals = useMemo(() => {
    const sum = { SD: 0, ED: 0, VD: 0 };
    const detail = [];
    items.forEach((item) => {
      if (!effectiveQty(item) || item.productIndex === "") return;
      const gang = isGangSheet(products[item.productIndex]);
      // A gang sheet has no garment and no placements -- the sheet is the unit.
      if (!gang) {
        if (item.garmentIndex === "") return;
        if (formType === "Correction" && !(item.placementKeys || []).length) return;
      }
      const r = costItem(products, item, formType);
      sum.SD += r.SD;
      sum.ED += r.ED;
      sum.VD += r.VD;
      detail.push({ item, result: r });
    });
    return { sum, detail };
  }, [items, products, formType]);

  const derived = useMemo(
    () =>
      deriveAgents({
        categories,
        departments,
        completedTasks,
        allowedNames: AGENTS,
      }),
    [categories, departments, completedTasks]
  );

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
    totals.detail.length > 0 &&
    (!updateClosing || (newClosingDate !== "" && closingConfirmed));

  // ---- actions ----------------------------------------------------------
  function addItem() {
    setItems((prev) => [
      ...prev,
      { productIndex: "", garmentIndex: "", placementKeys: [], affected: "", sizes: [], details: "" },
    ]);
  }

  function patchItem(i, patch) {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  function addSize(i, value) {
    if (!value) return;
    setItems((prev) =>
      prev.map((it, j) => {
        if (j !== i) return it;
        const rows = it.sizes || [];
        // The first size inherits a total already typed, so nothing is lost.
        const carry = rows.length === 0 && int(it.affected) > 0 ? String(int(it.affected)) : "";
        return { ...it, sizes: rows.concat({ size: value, other: "", qty: carry }) };
      })
    );
  }

  function patchSize(i, si, patch) {
    setItems((prev) =>
      prev.map((it, j) =>
        j === i
          ? { ...it, sizes: (it.sizes || []).map((r, k) => (k === si ? { ...r, ...patch } : r)) }
          : it
      )
    );
  }

  function removeSize(i, si) {
    setItems((prev) =>
      prev.map((it, j) =>
        j === i ? { ...it, sizes: (it.sizes || []).filter((_, k) => k !== si) } : it
      )
    );
  }

  function removeItem(i) {
    setItems((prev) => prev.filter((_, j) => j !== i));
  }

  function toggle(list, setList, value) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : list.concat(value));
  }

  const DIV = "---------------------------";

  /*
   * The AFFECTED ITEMS section. Written into the note AND into
   * Revision_Details / Correction_Details from this one function, so the field
   * the Deluge pastes into the reorder task can never drift from the note.
   * `audit` adds the actual/projected split, which belongs in the note only.
   */
  function buildItemLines({ audit }) {
    const L = [];
    totals.detail.forEach(({ item, result }, n) => {
      const p = products[item.productIndex];
      const b = p?.primaryBranches?.[item.garmentIndex];
      const qty = effectiveQty(item);

      if (n > 0) L.push("");
      L.push("Item " + (n + 1) + " · " + (p?.productName || ""));

      // A gang sheet is reprinted by the sheet -- no garment, size or placement
      // to record, and the per-sheet figure is what makes the count checkable.
      if (isGangSheet(p)) {
        const size = sheetSizeLabel(p);
        if (size) L.push("  Sheet size: " + size);
        L.push(
          "  Sheets to reprint: " +
            qty +
            (result.gang?.perSheet
              ? "  (" + result.gang.perSheet + " print" + (result.gang.perSheet === 1 ? "" : "s") + " per sheet)"
              : "  (prints per sheet unknown)")
        );
        const gdet = String(item.details || "").trim();
        if (gdet) {
          L.push("  Sheet details:");
          gdet.split("\n").forEach((line) => L.push("    " + line.trimEnd()));
        }
        L.push("  Prints: Screen Print " + result.SD + " | Embroidery " + result.ED + " | Vinyl " + result.VD);
        if (audit) {
          L.push("    actual     SD " + result.actual.SD + " | ED " + result.actual.ED + " | VD " + result.actual.VD);
          L.push("    projected  SD " + result.projected.SD + " | ED " + result.projected.ED + " | VD " + result.projected.VD);
        }
        return;
      }

      if (b?.garmentType) L.push("  Garment: " + oneLine(b.garmentType));

      const skus = (b?.garmentSkus || []).map((x) => String(x?.sku || "").trim()).filter(Boolean);
      if (skus.length) L.push("  SKU: " + skus.join(", "));

      const sizes = formatSizes(item.sizes);
      L.push(
        sizes
          ? "  Sizes: " + sizes + "  (" + qty + " garment" + (qty === 1 ? "" : "s") + ")"
          : "  Garments: " + qty
      );

      if (formType === "Correction") {
        const all = placementsOf(b);
        L.push("  Placements redone:");
        (item.placementKeys || []).forEach((k) => {
          const hit = all.find((x) => x.key === k);
          if (hit) {
            L.push("    " + placementLabel(hit.placement, hit.pi) + "  (" + graphicLabel(hit.graphic, hit.gi) + ")");
          }
        });
      } else {
        const g = (b?.secondaryBranches || []).length;
        L.push("  Reprint: all " + g + " graphic" + (g === 1 ? "" : "s"));
      }

      const det = String(item.details || "").trim();
      if (det) {
        L.push("  Garment details:");
        det.split("\n").forEach((line) => L.push("    " + line.trimEnd()));
      }

      L.push("  Prints: Screen Print " + result.SD + " | Embroidery " + result.ED + " | Vinyl " + result.VD);
      if (audit) {
        L.push("    actual     SD " + result.actual.SD + " | ED " + result.actual.ED + " | VD " + result.actual.VD);
        L.push("    projected  SD " + result.projected.SD + " | ED " + result.projected.ED + " | VD " + result.projected.VD);
      }
      const sz = embroiderySizes(products, item, formType);
      if (sz.Small || sz.Medium || sz.Large || sz.Unsized) L.push("    " + sizeLine(sz));
    });
    return L;
  }

  function buildDetails() {
    const head = "Order " + formType + " · event " + slot + " of " + MAX_SLOTS[formType];
    return capDetails([head, ""].concat(buildItemLines({ audit: false })).join("\n"));
  }

  function buildNote() {
    const L = [];
    L.push("ORDER " + formType.toUpperCase() + " FORM");
    L.push(DIV);
    L.push("Event " + slot + " of " + MAX_SLOTS[formType] + " · logged " + zohoNow());

    L.push("");
    L.push("WHAT WENT WRONG");
    L.push(DIV);
    L.push("Department: " + departments.join(", "));
    L.push("Category: " + categories.join(", "));
    L.push("Agent: " + (derived.agents.length ? derived.agents.join(", ") : "(none identified)"));
    L.push("Reason:");
    reason.trim().split("\n").forEach((line) => L.push("  " + line.trimEnd()));

    if (updateClosing && newClosingDate && closingConfirmed) {
      L.push("");
      L.push("CLOSING DATE");
      L.push(DIV);
      L.push((deal?.Closing_Date || "(none)") + "  ->  " + newClosingDate);
      L.push("Client contacted and approved the new date.");
    }

    L.push("");
    L.push("AFFECTED ITEMS");
    L.push(DIV);
    buildItemLines({ audit: true }).forEach((line) => L.push(line));

    L.push("");
    L.push("TOTAL WRITTEN TO SLOT " + slot);
    L.push(DIV);
    L.push("Screen Print: " + totals.sum.SD);
    L.push("Embroidery:   " + totals.sum.ED);
    const szTotal = { Small: 0, Medium: 0, Large: 0, Unsized: 0 };
    totals.detail.forEach(({ item }) => {
      const s2 = embroiderySizes(products, item, formType);
      szTotal.Small += s2.Small;
      szTotal.Medium += s2.Medium;
      szTotal.Large += s2.Large;
      szTotal.Unsized += s2.Unsized;
    });
    if (szTotal.Small || szTotal.Medium || szTotal.Large || szTotal.Unsized) {
      L.push("   " + sizeLine(szTotal));
    }
    L.push("Vinyl:        " + totals.sum.VD);
    return L.join("\n");
  }

  async function submit() {
    setSubmitting(true);
    setResult(null);
    try {
      const now = zohoNow();
      const prefix = formType === "Revision" ? "Revision" : "Correction";
      const api = { id: ctx.recordId };

      api[prefix + "_Prints_SD_" + slot] = totals.sum.SD;
      api[prefix + "_Prints_ED_" + slot] = totals.sum.ED;
      api[prefix + "_Prints_VD_" + slot] = totals.sum.VD;
      api[prefix + "_Count"] = slot;
      api[prefix + "_Department"] = departments;
      api[prefix + "_Reason"] = reason.trim();
      // What the reorder / reproduce tasks need, in a field the Deluge can read.
      api[prefix + "_Details"] = buildDetails();
      api.Failed_Quality_Check_Date_Time = now;

      if (updateClosing && newClosingDate && closingConfirmed) {
        api.Closing_Date = newClosingDate; // Zoho date format is YYYY-MM-DD
      }

      // Accountability is traced, never chosen by the person filing the form.
      if (derived.agents.length) api[prefix + "_Agent"] = derived.agents;

      if (formType === "Revision") {
        api.Revision_Category = categories; // multi-select
        api.Order_Needs_Revision_Date_Time = now;
      } else {
        api.Correction_Category = categories[0]; // single-select
        api.Order_Needs_Corrections_DATE_TIME = now;
      }

      const upd = await ZOHO.CRM.API.updateRecord({ Entity: ctx.entity, APIData: api });
      const row = upd?.data?.[0];
      if (row?.code !== "SUCCESS") {
        setResult({
          ok: false,
          message:
            t("err.nothing") +
            (row?.message || "") +
            (row?.details ? " " + JSON.stringify(row.details) : ""),
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

      setResult({ ok: true, message: t("ok.saved", { n: slot }) });
      setSubmitting(false);
      setTimeout(() => {
        try {
          ZOHO.CRM.UI.Popup.closeReload();
        } catch (e) {
          /* ignore */
        }
      }, 900);
    } catch (err) {
      setResult({ ok: false, message: (err && err.message) || String(err) });
      setSubmitting(false);
    }
  }

  // ---- render -----------------------------------------------------------
  if (status === "loading")
    return (
      <Shell>
        <p style={S.muted}>{t("app.loading")}</p>
      </Shell>
    );
  if (status === "error")
    return (
      <Shell>
        <Banner kind="bad">{fatal ? t(fatal.key, fatal.vars) : ""}</Banner>
      </Shell>
    );

  return (
    <Shell>
      <div style={S.head}>
        <div>
          <div style={S.h1}>{t("app." + formType)}</div>
          <div style={S.sub}>{deal?.Deal_Name || ctx.recordId}</div>
        </div>
        <div style={S.headRight}>
          <div style={S.langWrap} role="group" aria-label="Language / Idioma">
            {["en", "es"].map((L) => (
              <button
                key={L}
                type="button"
                onClick={() => {
                  setLang(L);
                  saveLang(L);
                }}
                style={lang === L ? S.langOn : S.langOff}
                title={L === "es" ? "Español" : "English"}
              >
                {L.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={S.slotBadge}>
            {overCap
              ? t("app.atLimit")
              : t("app.eventOf", { n: slot, max: MAX_SLOTS[formType] })}
          </div>
        </div>
      </div>

      {payloadInfo && !payloadInfo.ok && (
        <Banner kind="bad">
          {payloadInfo.reason === "no-payload"
            ? t("b.noRecord")
            : t("b.readFail", { reason: payloadInfo.reason })}
        </Banner>
      )}

      {payloadInfo?.ok && payloadInfo.source === "note" && (
        <Banner kind="warn">
          {t("b.fromNote")}
        </Banner>
      )}

      {overCap && (
        <Banner kind="bad">
          {t("b.atLimit" + formType, { n: counts[formType] })}
        </Banner>
      )}

      <Section n="1" title={t("sec.type")}>
        <div style={S.row}>
          {["Revision", "Correction"].map((ty) => (
            <button
              key={ty}
              type="button"
              onClick={() => {
                setFormType(ty);
                setCategories([]);
              }}
              style={formType === ty ? S.pillOn : S.pill}
            >
              {t("app." + ty)}
            </button>
          ))}
        </div>
        <p style={S.hint}>
          {formType === "Revision" ? t("type.revisionHint") : t("type.correctionHint")}
        </p>
      </Section>

      <Section n="2" title={t("sec.wrong")}>
        <Label>{t("lbl.department", { type: t("app." + formType) })}</Label>
        <div style={S.wrap}>
          {DEPARTMENTS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setTouchedDepartments(true);
                toggle(departments, setDepartments, d);
              }}
              style={departments.includes(d) ? S.chipOn : S.chip}
            >
              {labelDepartment(d, lang)}
            </button>
          ))}
        </div>

        <Label>{formType === "Correction" ? t("lbl.categoryOne") : t("lbl.categoryMany")}</Label>

        {formType === "Correction" ? (
          <select
            value={categories[0] || ""}
            onChange={(e) => setCategories(e.target.value ? [e.target.value] : [])}
            style={S.select}
          >
            <option value="">{t("g.select")}</option>
            {categoryList.map((c) => (
              <option key={c} value={c}>
                {labelCategory(c, lang)}
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
                {categories.length ? (lang === "es" ? "+ agregar otra categoría…" : "+ add another category…") : t("g.select")}
              </option>
              {categoryList
                .filter((c) => !categories.includes(c))
                .map((c) => (
                  <option key={c} value={c}>
                    {labelCategory(c, lang)}
                  </option>
                ))}
            </select>

            {categories.length > 0 && (
              <div style={S.tags}>
                {categories.map((c) => (
                  <span key={c} style={S.tag}>
                    {labelCategory(c, lang)}
                    <button
                      type="button"
                      onClick={() => setCategories(categories.filter((x) => x !== c))}
                      style={S.tagX}
                      aria-label={t("g.remove") + " " + labelCategory(c, lang)}
                      title={t("g.remove") + " " + labelCategory(c, lang)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <Label>{t("lbl.reason")}</Label>
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={S.textarea}
          placeholder={t("ph.reason")}
        />

      </Section>

      <Section n="3" title={t("sec.garments")}>
        {!items.length && <p style={S.muted}>{t("g.none")}</p>}

        {items.map((item, i) => {
          const prod = products[item.productIndex];
          const gang = isGangSheet(prod);
          const perSheet = gang ? gangPerSheet(prod) : 0;
          const branches = prod?.primaryBranches || [];
          const branch = branches[item.garmentIndex];
          const graphics = branch?.secondaryBranches || [];
          const allPlacements = branch ? placementsOf(branch) : [];
          const found = totals.detail.find((d) => d.item === item);
          const r = found ? found.result : null;

          return (
            <div key={i} style={S.item}>
              <div style={S.itemHead}>
                <strong>{t("g.item", { n: i + 1 })}</strong>
                <button type="button" onClick={() => removeItem(i)} style={S.remove}>
                  {t("g.remove")}
                </button>
              </div>

              <Label>{t("g.application")}</Label>
              <select
                value={item.productIndex}
                onChange={(e) =>
                  patchItem(i, {
                    productIndex: e.target.value === "" ? "" : Number(e.target.value),
                    garmentIndex: "",
                    placementKeys: [],
                    sizes: [],
                  })
                }
                style={S.select}
              >
                <option value="">{t("g.select")}</option>
                {pickableProducts.map((x) => (
                  <option key={x.index} value={x.index}>
                    {labelApplication(x.product.productName, lang)}
                  </option>
                ))}
              </select>

              {item.productIndex !== "" && !gang && (
                <>
                  <Label>{t("g.garment")}</Label>
                  <select
                    value={item.garmentIndex}
                    onChange={(e) =>
                      patchItem(i, {
                        garmentIndex: e.target.value === "" ? "" : Number(e.target.value),
                        placementKeys: [],
                      })
                    }
                    style={S.select}
                  >
                    <option value="">{t("g.select")}</option>
                    {branches.map((b, bi) => (
                      <option key={bi} value={bi}>
                        {garmentLabel(b, bi)}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {formType === "Correction" && !gang && item.garmentIndex !== "" && (
                <>
                  <Label>{t("g.placements")}</Label>
                  {allPlacements.length ? (
                    <>
                      <div style={S.placeList}>
                        {allPlacements.map((x) => {
                          const on = (item.placementKeys || []).indexOf(x.key) >= 0;
                          return (
                            <label key={x.key} style={on ? S.placeRowOn : S.placeRow}>
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() =>
                                  patchItem(i, {
                                    placementKeys: on
                                      ? item.placementKeys.filter((k) => k !== x.key)
                                      : (item.placementKeys || []).concat(x.key),
                                  })
                                }
                              />
                              <span>
                                <b>{placementLabel(x.placement, x.pi)}</b>
                                <span style={S.placeSub}>{graphicLabel(x.graphic, x.gi)}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p style={S.hint}>{t("g.placementsHint")}</p>
                    </>
                  ) : (
                    <p style={S.hint}>{t("g.noPlacements")}</p>
                  )}
                </>
              )}

              {formType === "Revision" && !gang && item.garmentIndex !== "" && (
                <p style={S.hint}>{t("g.allGraphics", { n: graphics.length })}</p>
              )}

              {!gang && item.garmentIndex !== "" && (
                <>
                  <Label>{t("g.affected")}</Label>
                  {(item.sizes || []).length ? (
                    <p style={S.fromSizes}>
                      <b style={S.fromSizesNum}>{effectiveQty(item)}</b> {t("g.totalFromSizes")}
                    </p>
                  ) : (
                    <input
                      type="number"
                      min="1"
                      value={item.affected}
                      onChange={(e) => patchItem(i, { affected: e.target.value })}
                      style={S.input}
                    />
                  )}
                  {branch?.garmentQuantity && (
                    <p style={S.hint}>{t("g.originalQty", { n: branch.garmentQuantity })}</p>
                  )}

                  <Label>{t("g.sizes")}</Label>
                  {(item.sizes || []).map((row, si) => (
                    <div key={si} style={S.sizeRow}>
                      {row.size === OTHER_SIZE ? (
                        <input
                          type="text"
                          value={row.other || ""}
                          placeholder={t("g.otherPh")}
                          onChange={(e) => patchSize(i, si, { other: e.target.value })}
                          style={S.sizeOther}
                          autoFocus
                        />
                      ) : (
                        <span style={S.sizeTag}>{row.size}</span>
                      )}
                      <input
                        type="number"
                        min="1"
                        value={row.qty}
                        placeholder={t("g.qty")}
                        onChange={(e) => patchSize(i, si, { qty: e.target.value })}
                        style={S.sizeQty}
                        aria-label={t("g.qty")}
                      />
                      <button
                        type="button"
                        onClick={() => removeSize(i, si)}
                        style={S.sizeX}
                        aria-label={t("g.removeSize")}
                        title={t("g.removeSize")}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <select
                    value=""
                    onChange={(e) => addSize(i, e.target.value)}
                    style={{ ...S.select, maxWidth: 260 }}
                  >
                    <option value="">{t("g.addSize")}</option>
                    {SIZE_OPTIONS.filter((sz) => !(item.sizes || []).some((r) => r.size === sz)).map(
                      (sz) => (
                        <option key={sz} value={sz}>
                          {sz}
                        </option>
                      )
                    )}
                    <option value={OTHER_SIZE}>{t("g.otherSize")}</option>
                  </select>
                  <p style={S.hint}>{t("g.sizesHint")}</p>

                  <Label>{t("g.details")}</Label>
                  <textarea
                    rows={3}
                    value={item.details || ""}
                    onChange={(e) => patchItem(i, { details: e.target.value })}
                    placeholder={t("g.detailsPh")}
                    style={S.textarea}
                  />
                </>
              )}

              {gang && (
                <>
                  <Label>{t("gs.sheets")}</Label>
                  <input
                    type="number"
                    min="1"
                    value={item.affected}
                    onChange={(e) => patchItem(i, { affected: e.target.value })}
                    style={S.input}
                  />
                  <p style={S.hint}>
                    {perSheet
                      ? t("gs.perSheet", { n: perSheet })
                      : t("gs.noPerSheet")}
                  </p>
                  {sheetSizeLabel(prod) && (
                    <p style={S.hint}>{t("gs.size", { v: sheetSizeLabel(prod) })}</p>
                  )}
                  {prod?.numberOfGangSheets && (
                    <p style={S.hint}>{t("gs.originalSheets", { n: prod.numberOfGangSheets })}</p>
                  )}

                  <Label>{t("gs.details")}</Label>
                  <textarea
                    rows={3}
                    value={item.details || ""}
                    onChange={(e) => patchItem(i, { details: e.target.value })}
                    placeholder={t("gs.detailsPh")}
                    style={S.textarea}
                  />
                </>
              )}

              {r && (
                <div style={S.itemTotals}>
                  {t("r.screenPrint")} <b>{r.SD}</b> &nbsp;·&nbsp; {t("r.embroidery")}{" "}
                  <b>{r.ED}</b> &nbsp;·&nbsp; {t("r.vinyl")} <b>{r.VD}</b>
                </div>
              )}
            </div>
          );
        })}

        <button type="button" onClick={addItem} style={S.add} disabled={!pickableProducts.length}>
          {items.length ? t("g.addMore") : t("g.add")}
        </button>
        {!pickableProducts.length && (
          <p style={S.hint}>{t("g.noGarments")}</p>
        )}
      </Section>

      <Section n="4" title={t("sec.closing")}>
        <div style={S.closingNow}>
          <span style={S.label2}>{t("cd.current")}</span>
          <b style={S.closingVal}>{deal?.Closing_Date || t("cd.notSet")}</b>
        </div>

        <label style={S.check}>
          <input
            type="checkbox"
            checked={updateClosing}
            onChange={(e) => {
              setUpdateClosing(e.target.checked);
              if (!e.target.checked) {
                setNewClosingDate("");
                setClosingConfirmed(false);
              }
            }}
          />
          <span>{t("cd.update")}</span>
        </label>

        {updateClosing && (
          <div style={S.closingBox}>
            <Label>{t("cd.new")}</Label>
            <input
              type="date"
              value={newClosingDate}
              onChange={(e) => setNewClosingDate(e.target.value)}
              style={S.input}
            />

            <label style={{ ...S.check, marginTop: 14, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={closingConfirmed}
                onChange={(e) => setClosingConfirmed(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span style={S.disclaimer}>{t("cd.disclaimer")}</span>
            </label>
          </div>
        )}
      </Section>

      <Section n="5" title={t("sec.review")}>
        <div style={S.totalBox}>
          <div style={S.totalRow}>
            <span>{t("r.screenPrint")}</span>
            <b style={S.num}>{totals.sum.SD}</b>
            <code style={S.field}>
              {formType}_Prints_SD_{slot}
            </code>
          </div>
          <div style={S.totalRow}>
            <span>{t("r.embroidery")}</span>
            <b style={S.num}>{totals.sum.ED}</b>
            <code style={S.field}>
              {formType}_Prints_ED_{slot}
            </code>
          </div>
          <div style={S.totalRow}>
            <span>{t("r.vinyl")}</span>
            <b style={S.num}>{totals.sum.VD}</b>
            <code style={S.field}>
              {formType}_Prints_VD_{slot}
            </code>
          </div>
        </div>
        <p style={S.hint}>
          {t("r.alsoStamps", {
            stamp: formType === "Revision" ? t("r.stampRevision") : t("r.stampCorrection"),
            type: formType,
            n: slot,
          })}
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
            {t("btn.cancel")}
          </button>
          <button
            type="button"
            style={canSubmit ? S.submit : S.submitOff}
            disabled={!canSubmit}
            onClick={submit}
          >
            {submitting ? t("btn.saving") : t("btn.submit", { type: t("app." + formType) })}
          </button>
        </div>
        {!canSubmit && !submitting && !overCap && (
          <p style={S.hint}>
            {updateClosing && (newClosingDate === "" || !closingConfirmed)
              ? t("need.closing")
              : t("need.all")}
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
  headRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 },
  langWrap: { display: "flex", border: "1px solid #d3d6db", borderRadius: 2, overflow: "hidden" },
  langOff: { font: "600 11px " + mono, letterSpacing: ".06em", padding: "5px 9px", border: "none", background: "#fff", color: "#5b6270", cursor: "pointer" },
  langOn: { font: "600 11px " + mono, letterSpacing: ".06em", padding: "5px 9px", border: "none", background: "#15171b", color: "#fff", cursor: "pointer" },
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
  closingNow: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 },
  label2: { font: "600 11px " + mono, letterSpacing: ".09em", textTransform: "uppercase", color: "#5b6270" },
  closingVal: { font: "600 15px " + mono, fontVariantNumeric: "tabular-nums" },
  check: { display: "flex", alignItems: "center", gap: 9, font: "14px " + sans, cursor: "pointer" },
  closingBox: { border: "1px solid #d3d6db", borderLeft: "3px solid #8e5a00", background: "#fffdf7", borderRadius: "0 2px 2px 0", padding: "14px 16px", marginTop: 12 },
  disclaimer: { fontSize: 13.5, lineHeight: 1.45, color: "#15171b" },
  tags: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: { display: "inline-flex", alignItems: "center", gap: 6, font: "12.5px " + sans, background: "#e4e7f8", color: "#2743c7", border: "1px solid #c9d0f4", borderRadius: 2, padding: "4px 6px 4px 9px" },
  tagX: { font: "15px/1 " + sans, color: "#2743c7", background: "none", border: "none", cursor: "pointer", padding: "0 2px" },
  textarea: { width: "100%", font: "14px/1.5 " + sans, padding: "9px 11px", border: "1px solid #d3d6db", borderRadius: 2, resize: "vertical", boxSizing: "border-box" },
  select: { width: "100%", font: "13.5px " + sans, padding: "8px 10px", border: "1px solid #d3d6db", borderRadius: 2, background: "#fff", boxSizing: "border-box" },
  input: { width: 130, font: "14px " + sans, padding: "8px 10px", border: "1px solid #d3d6db", borderRadius: 2, boxSizing: "border-box" },
  item: { border: "1px solid #d3d6db", borderRadius: 2, padding: "14px 16px", marginBottom: 12, background: "#fbfbfc" },
  itemHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  remove: { font: "12px " + sans, color: "#b5372c", background: "none", border: "none", cursor: "pointer", padding: 0 },
  placeList: { display: "flex", flexDirection: "column", gap: 4, marginTop: 2 },
  placeRow: { display: "flex", alignItems: "flex-start", gap: 9, font: "13.5px " + sans, cursor: "pointer", padding: "7px 9px", border: "1px solid #e3e5e9", borderRadius: 2, background: "#fff" },
  placeRowOn: { display: "flex", alignItems: "flex-start", gap: 9, font: "13.5px " + sans, cursor: "pointer", padding: "7px 9px", border: "1px solid #2743c7", borderRadius: 2, background: "#e4e7f8" },
  placeSub: { display: "block", fontSize: 12, color: "#5b6270", marginTop: 2 },
  sizeRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  sizeTag: { font: "600 13px " + mono, minWidth: 64, padding: "7px 10px", border: "1px solid #c9d0f4", background: "#e4e7f8", color: "#2743c7", borderRadius: 2, textAlign: "center", boxSizing: "border-box" },
  sizeOther: { width: 150, font: "13.5px " + sans, padding: "7px 10px", border: "1px solid #2743c7", borderRadius: 2, boxSizing: "border-box" },
  sizeQty: { width: 76, font: "14px " + sans, padding: "7px 10px", border: "1px solid #d3d6db", borderRadius: 2, boxSizing: "border-box" },
  sizeX: { font: "17px/1 " + sans, color: "#b5372c", background: "none", border: "none", cursor: "pointer", padding: "0 4px" },
  fromSizes: { margin: "2px 0 0", fontSize: 13.5, color: "#5b6270" },
  fromSizesNum: { font: "700 17px " + mono, color: "#15171b", marginRight: 4 },
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
