/*
 * AmendmentApp.jsx -- the Onboarding Amendment Form (E-24), loaded by ?view=amendment (index.js).
 *
 * WHAT SAVE WRITES, in this order -- each step in its own try/catch, and the order is chosen so a
 * failure part-way leaves the Deal no worse than before (never-destroy, D-23):
 *   1. a new onboarding-form.json          (create-only; consumers take the newest -- D-4)
 *   2. regenerated production cards         (same generator the onboarding form runs)
 *   3. a new, COMPLETE "DEAL ONBOARDING FORM" note with a What Changed block on top
 *   4. the previous onboarding note(s) retitled "(SUPERSEDED <date>)" -- only after 3 succeeded
 *   5. the 18 print-count fields, Order_Modified, and Onboarding_Update_Results (appended, dated)
 * The note and the counts come from buildOnboardingNote() -- the SAME function the onboarding form
 * submits with -- fed the amended product tree. An amendment recomputes everything; it never patches.
 * ⛔ D-25: NEVER write Onboarding_Needs_Updated -- not to clear it, not to set it. It is the agents'
 * own history of "an update was needed"; they clear and re-mark it by hand to re-do one.
 *   6. E-43: Print_Count on the Deal's OPEN produce tasks, where the amendment changed their number
 *      (taskRestamp.js -- which field a task holds is read from its subject; completed, Reproduce
 *      and Correct tasks are never touched; each re-stamped task gets a dated line in its description)
 * Steps 5 and 6 pass Trigger: [] -- an amendment must not fire the stage / order-modified automations
 * by itself.
 *
 * How prefill works: onboarding-form.json IS the react-hook-form `data` the onboarding form submitted
 * (plus two `_` stamps). So the newest JSON goes through toFormValues() and straight into reset(), and
 * the onboarding form's own branch components render it -- imported, never copied (D-24), so any
 * improvement to them reaches this view for free.
 *
 * Whole products are added and removed WITHOUT splicing the array while editing: a removed product
 * stays in place with its index in `removed`, an added one is appended. That keeps the index-based
 * diff honest and makes Undo free; effectiveValues() builds the real payload. See amendmentDiff.js.
 *
 * Pre-JSON deals (~2,659, note only) are NOT prefilled here. The note parser lives on the
 * revision-form branch, which stays a separate codebase (D-19). The view says so rather than showing
 * blanks as if they were answers.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  FormGroup,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import GarmentForm from "../components/GarmentForm";
import GarmentPrimaryBranchForm from "../components/GarmentPrimaryBranchForm";
import { GarmentSwapEditor, GraphicsEditor, QuantityEditor } from "./FocusedEditors";
import NonGarmentForm from "../components/NonGarmentForm";
import GraphicForm from "../components/GraphicForm";
import OnlineStorefrontForm from "../components/OnlineStorefrontForm";
import DtfGangSheetForm from "../components/DtfGangSheetForm";
import { computePrints } from "../printMath";
import { buildOnboardingNote } from "../onboardingNote";
import { buildProductionCards } from "../productionCards";
import {
  CUSTOMER_NOTES_QUESTION,
  CUSTOMER_NOTES_TOOLTIP,
  CUSTOMER_NOTES_LIMIT,
  loadAccountNotes,
  overLimitBy,
  saveCustomerNotes,
  todayStamp,
} from "../customerNotes";
import { buildColorMatches } from "../colorMatch";
import { newestFirst, readFileText } from "../zohoFiles";
import { AmendContact, AmendDates } from "./AmendSections";
import { parseNoteToForm, toPlainText } from "./noteToForm";
import { countFieldForTask, planTaskRestamp } from "./taskRestamp";
import {
  copyGarment,
  withoutGraphic,
  APPEND_FIELD,
  LIVE_NOTE_TITLE,
  SUPERSEDED_TITLE,
  appendUpdateResults,
  applyAppendRule,
  buildAmendmentNote,
  buildCarriedNote,
  buildUpdateResultsEntry,
  describePath,
  diffValues,
  effectiveValuesWithGarments,
  summariseAmendmentWithGarments,
  toFormValues,
} from "./amendmentDiff";

const ZOHO = window.ZOHO;

// Step 0 (04 E-24 design). The first three are edits inside a product; the rest open their own section.
const WHAT_CHANGED = [
  { key: "quantity", label: "Quantity / sizes" },
  { key: "garment", label: "Garment swapped" },
  { key: "graphic", label: "Graphic or placement" },
  { key: "added", label: "Product added" },
  { key: "removed", label: "Product removed" },
  { key: "dates", label: "Dates" },
  { key: "contact", label: "Contact / shipping" },
  { key: "custnotes", label: "Customer notes (for the account)" },
];

const tagOf = (p) => `${p?.productName}#${p?.productType}`;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const nowStamp = () => {
  const d = new Date();
  return `${today()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const ok = (r) => r?.data?.[0]?.code === "SUCCESS";

const stamp = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "(date unknown)" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

const JOB_LABELS = {
  gangSheet: "· DTF Gang Sheet", dtg: "· DTG", dtf: "· DTF", htv: "· HTV", vinyl: "· Vinyl",
  stickers: "· Stickers", decals: "· Decals", banners: "· Banners", posters: "· Posters",
  magnets: "· Magnets", patches: "· Patches",
};

// The same headline numbers the onboarding form's preview shows, plus the per-job lines.
function countRows(products) {
  let c;
  try {
    c = computePrints(products || []);
  } catch (e) {
    return null;
  }
  const rows = [
    ["Screen Print", c.SD],
    ["Embroidery", c.ED],
    ["Vinyl Department", c.VD],
    ["Outsourced items", c.outsourced],
  ];
  for (const [k, v] of Object.entries(c.perJob || {})) rows.push([JOB_LABELS[k] || k, v]);
  return rows;
}

// The three department totals a parse must reproduce before the form will touch the Deal's counts.
const VERIFY_FIELDS = [
  ["Screen_Print_Prints", "SD"],
  ["Embroidery_Department_Prints", "ED"],
  ["Vinyl_Department_Prints", "VD"],
];

async function loadDeal(entity, recordId) {
  const [rec, att, vars, notes] = await Promise.all([
    ZOHO.CRM.API.getRecord({ Entity: entity, RecordID: recordId, approved: "both" }),
    ZOHO.CRM.API.getRelatedRecords({
      Entity: entity,
      RecordID: recordId,
      RelatedList: "Attachments",
      page: 1,
      per_page: 200,
    }),
    Promise.resolve()
      .then(() => ZOHO.CRM.API.getOrgVariable("products"))
      .catch(() => null), // only feeds GarmentForm's option lists; never fatal
    Promise.resolve()
      .then(() =>
        ZOHO.CRM.API.getRelatedRecords({ Entity: entity, RecordID: recordId, RelatedList: "Notes", page: 1, per_page: 200 })
      )
      .catch(() => null),
  ]);
  const deal = rec?.data?.[0] || {};
  const options = vars?.Success?.Content?.split(",") || [];
  // The LIVE onboarding note: exact title, so superseded ones are never picked up.
  const liveNote =
    (notes?.data || []).filter((n) => n?.Note_Title === LIVE_NOTE_TITLE).sort(newestFirst)[0] || null;

  const jsons = (att?.data || [])
    .filter((a) => String(a?.File_Name || "").toLowerCase() === "onboarding-form.json")
    .sort(newestFirst);
  if (!jsons.length) {
    // E-34: no saved answers -- rebuild the order from the note. Lossy, so everything downstream
    // runs in "carry" mode (see the save).
    if (!liveNote?.Note_Content) return { deal, options, json: null, liveNote: null };
    const { values, warnings } = parseNoteToForm(liveNote.Note_Content, options);
    return {
      deal,
      options,
      json: values,
      jsonCreated: liveNote.Created_Time,
      olderCopies: 0,
      liveNote,
      fromNote: true,
      carry: true,
      warnings,
    };
  }

  const newest = jsons[0];
  if (!newest["$file_id"]) throw new Error("the newest onboarding-form.json has no $file_id");
  const { text, shape } = await readFileText(newest["$file_id"]);
  if (!text || !text.trim()) throw new Error(`onboarding-form.json read empty (${shape})`);
  const json = JSON.parse(text);
  return {
    deal,
    options,
    json,
    jsonCreated: newest.Created_Time,
    olderCopies: jsons.length - 1,
    liveNote,
    // A JSON this form wrote from a note-sourced amendment is still lossy: stay in carry mode.
    carry: json?._source === "note",
    warnings: [],
  };
}

const ProductEditor = ({ index, product, options }) => {
  const type = product?.productType;
  if (type === "garment")
    return <GarmentForm index={index} options={options} productName={product?.productName} />;
  if (type === "nongarment") return <NonGarmentForm index={index} />;
  if (type === "graphic") return <GraphicForm index={index} />;
  if (type === "onlinestorefront") return <OnlineStorefrontForm index={index} />;
  if (type === "gangsheet") return <DtfGangSheetForm index={index} />;
  return <Alert severity="warning">Unknown product type "{String(type)}" — cannot edit it here.</Alert>;
};

const AmendmentApp = () => {
  const [state, setState] = useState({ status: "loading", message: "" });
  const [loaded, setLoaded] = useState(null);
  const [changed, setChanged] = useState([]);
  const [productIdx, setProductIdx] = useState(null);
  const [story, setStory] = useState("");
  const [custNote, setCustNote] = useState(""); // E-38: a note to ADD to the Account's Customer Notes
  const [accountNotes, setAccountNotes] = useState(""); // E-38: what the Account holds at open
  const [removed, setRemoved] = useState([]); // indices into products; see the header comment
  const [removedGarments, setRemovedGarments] = useState([]); // "p.g" keys, same idea one level down
  const [garmentIdx, setGarmentIdx] = useState(null);
  const [showAll, setShowAll] = useState(false); // escape hatch: every field for the chosen garment
  const [rev, setRev] = useState(0); // E-50: bumped when rows are spliced, so the editors remount on fresh values
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState(null); // { done: [..], failed: [..] } after a save
  const ctx = useRef({ entity: null, recordId: null });
  const original = useRef(null);

  const methods = useForm();
  const { control, reset, handleSubmit, getValues, setValue } = methods;
  const current = useWatch({ control });
  const { append } = useFieldArray({ control, name: "products" });

  useEffect(() => {
    if (!ZOHO?.embeddedApp) {
      setState({ status: "error", message: "This page only works inside Zoho CRM (the widget SDK did not load)." });
      return;
    }
    ZOHO.embeddedApp.on("PageLoad", async (data) => {
      try {
        ZOHO.CRM.UI.Resize({ height: "90%", width: "60%" });
      } catch (e) {
        /* resize is cosmetic */
      }
      const entity = data?.Entity;
      const recordId = data?.EntityId?.[0] ?? data?.EntityId;
      ctx.current = { entity, recordId };
      try {
        const res = await loadDeal(entity, recordId);
        setLoaded(res);
        loadAccountNotes(res?.deal).then((a) => setAccountNotes(a?.notes || "")); // E-38, never fatal
        if (!res.json) {
          setState({ status: "nojson" });
          return;
        }
        const values = toFormValues(res.json);
        original.current = values;
        reset(values);
        setState({ status: "ready" });
      } catch (e) {
        setState({ status: "error", message: String(e?.message || e) });
      }
    });
    ZOHO.embeddedApp.init();
  }, [reset]);

  const products = current?.products || [];
  const originalCount = original.current?.products?.length || 0;
  const isRemoved = (i) => removed.includes(i);
  const has = (key) => changed.includes(key);

  const fieldLines = useMemo(
    () =>
      original.current && current
        ? summariseAmendmentWithGarments(original.current, current, removed, removedGarments)
        : [],
    [current, removed, removedGarments]
  );
  // E-38: a customer note is a change in its own right -- it can be the only thing amended.
  const custNoteOver = overLimitBy(accountNotes, custNote, todayStamp());
  const lines = useMemo(
    () =>
      custNote.trim()
        ? [...fieldLines, "Customer note added to the account (shows on every future deal): " + custNote.trim()]
        : fieldLines,
    [fieldLines, custNote]
  );
  // Indices here are the on-screen ones (nothing spliced), so the lookup uses the unfiltered merge.
  const merged = useMemo(
    () => (original.current && current ? applyAppendRule(original.current, current, today()) : null),
    [current]
  );
  const appendPreviews = (original.current && current ? diffValues(original.current, current) : [])
    .filter((c) => APPEND_FIELD.test(c.path))
    .filter((c) => {
      const m = /^products\.(\d+)\./.exec(c.path);
      const gm = /^products\.(\d+)\.primaryBranches\.(\d+)\./.exec(c.path);
      if (gm && removedGarments.includes(gm[1] + "." + gm[2])) return false;
      return !m || !isRemoved(Number(m[1]));
    })
    .map((c) => ({
      label: describePath(c.path, current),
      value: c.path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), merged),
    }));
  // What would actually be saved: removed products dropped, append rule applied.
  const saved = useMemo(
    () =>
      original.current && current
        ? effectiveValuesWithGarments(original.current, current, removed, removedGarments, today())
        : null,
    [current, removed, removedGarments]
  );
  const before = useMemo(() => countRows(original.current?.products), [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carry mode only: may the form rewrite the Deal's print counts? Only if the order as PARSED
  // reproduces the three department totals the Deal holds today. Otherwise the parse is missing
  // something (a gang sheet, an unreadable quantity) and writing would replace real numbers.
  const carry = !!loaded?.carry;
  const countsVerified = useMemo(() => {
    if (!carry) return true;
    try {
      const parsed = original.current?.products || [];
      if (parsed.some((p) => p?._unparsed)) return false;
      const c = computePrints(parsed);
      return VERIFY_FIELDS.every(([f, k]) => Number(loaded?.deal?.[f] || 0) === Number(c[k] || 0));
    } catch (e) {
      return false;
    }
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = countRows(saved?.products);

  // Products the deal could still gain: the org's list minus what is already on the form
  // (a removed product is brought back with Undo, not re-added as a blank one).
  const addable = (loaded?.options || []).filter((o) => !products.some((p) => tagOf(p) === o));
  const addProduct = (combined) => {
    if (!combined) return;
    const [productName, productType] = combined.split("#");
    append({ productName, productType });
    setProductIdx(products.length);
  };
  const toggleRemoved = (i) =>
    setRemoved((r) => (r.includes(i) ? r.filter((x) => x !== i) : [...r, i]));

  // ---- garments inside the chosen product ---------------------------------------------------------
  const product = productIdx != null ? products[productIdx] : null;
  const isGarmentProduct = product?.productType === "garment";
  const garments = (isGarmentProduct && product?.primaryBranches) || [];
  const originalGarmentCount =
    (productIdx != null && original.current?.products?.[productIdx]?.primaryBranches?.length) || 0;
  const gKey = (g) => productIdx + "." + g;
  const garmentRemoved = (g) => removedGarments.includes(gKey(g));
  const garmentIsNew = (g) => productIdx >= originalCount || g >= originalGarmentCount;
  const toggleGarmentRemoved = (g) =>
    setRemovedGarments((r) => (r.includes(gKey(g)) ? r.filter((x) => x !== gKey(g)) : [...r, gKey(g)]));
  const addGarment = () => {
    const path = `products.${productIdx}.primaryBranches`;
    const cur = getValues(path) || [];
    setValue(path, [...cur, { name: "" }], { shouldDirty: true });
    setValue(`products.${productIdx}.numberOfGarmentTypes`, String(cur.length + 1), { shouldDirty: true });
    setGarmentIdx(cur.length);
  };
  // E-50: split one garment type into two. The original is marked removed and two copies are
  // appended, so the rep only has to fix each copy's quantity / colors and take off the graphics
  // that do not go on it. Nothing is retyped.
  const splitGarment = (g) => {
    const path = `products.${productIdx}.primaryBranches`;
    const cur = getValues(path) || [];
    if (!cur[g]) return;
    setValue(path, [...cur, copyGarment(cur[g]), copyGarment(cur[g])], { shouldDirty: true });
    setValue(`products.${productIdx}.numberOfGarmentTypes`, String(cur.length + 2), { shouldDirty: true });
    setRemovedGarments((r) => (r.includes(gKey(g)) ? r : [...r, gKey(g)]));
    setGarmentIdx(cur.length);
    setRev((n) => n + 1);
  };
  const removeGraphic = (g, s) => {
    const path = `products.${productIdx}.primaryBranches.${g}`;
    setValue(path, withoutGraphic(getValues(path), s), { shouldDirty: true });
    setRev((n) => n + 1);
  };
  const graphicName = (gr, s) => {
    const d = String(gr?.graphicDescription || "").split("\n")[0].trim();
    return `Graphic ${s + 1}` + (d ? ` · ${d.slice(0, 70)}` : "");
  };
  const garmentLabel = (gar, g) => {
    const type = String(gar?.garmentType || "").split("\n")[0].trim();
    const qty = gar?.garmentQuantity ? ` · ${gar.garmentQuantity} pcs` : "";
    return `Garment ${g + 1}` + (type ? ` · ${type.slice(0, 40)}` : "") + qty;
  };
  const anyFieldTick = has("quantity") || has("garment") || has("graphic");
  const countLines = (before || [])
    .map(([label, was], i) => [label, was, after?.[i]?.[1]])
    .filter(([, was, now]) => was || now);

  // RHF blocks submit silently when a mounted field fails validation; say which, as the onboarding
  // form does. Only branches the agent actually opened are mounted, so old data they never touched
  // cannot trip a rule that did not exist when the deal was onboarded.
  const onInvalid = (formErrors) => {
    const names = [];
    // The error tree mirrors the field path, so the path names the field even when the input's
    // ref carries no name (an Autocomplete -- e.g. a new placement's required "Placement Size").
    const walk = (node, path) => {
      if (!node || typeof node !== "object") return;
      if (node.type && node.ref) {
        names.push(node.ref.name || path);
        return;
      }
      Object.entries(node).forEach(([k, v]) => walk(v, path ? path + "." + k : k));
    };
    walk(formErrors, "");
    const list = [...new Set(names.filter(Boolean).map((n) => describePath(n, current)))];
    window.alert(
      "This amendment can't be saved yet — please fill in:" +
        (list.length ? "\n\n• " + list.join("\n• ") : "\n\nthe highlighted field(s).")
    );
  };

  const save = async () => {
    if (saving) return;
    if (!lines.length) {
      window.alert("Nothing has changed yet — there is nothing to save.");
      return;
    }
    if (!story.trim()) {
      window.alert("Please say in your own words what happened (step 4) before saving.");
      return;
    }
    if (custNote.trim() && custNoteOver > 0) {
      window.alert(
        `The customer note is too long by ${custNoteOver} characters - the account's Customer Notes field holds ${CUSTOMER_NOTES_LIMIT}. Shorten it, or tidy the old notes on the Account page.`
      );
      return;
    }
    setSaving(true);
    const { entity, recordId } = ctx.current;
    const when = nowStamp();
    const done = [];
    const failed = [];
    const step = async (label, fn) => {
      try {
        await fn();
        done.push(label);
        return true;
      } catch (e) {
        console.log("Amendment step failed:", label, e);
        failed.push(label);
        return false;
      }
    };

    // E-38 first: append the customer note to the Account and make the Deal match, so the cards and
    // the JSON below carry the result. Runs even with no new note, to refresh what the cards print.
    let cardSource = saved;
    await step(custNote.trim() ? "customer note (Account + Deal)" : "customer notes on the cards", async () => {
      const cn = await saveCustomerNotes({
        entity,
        recordId,
        deal: loaded.deal,
        entry: custNote,
        dateStr: today(),
      });
      if (cn.combined) cardSource = { ...saved, customerNotes: cn.combined };
      if (custNote.trim() && cn.problem) throw new Error(cn.problem);
    });

    // One source for everything written: the amended tree, through the onboarding form's own builder.
    const { content, printFields, cardCounts } = buildOnboardingNote(saved);
    // Carry mode keeps the previous note's text verbatim; otherwise the note is rebuilt complete.
    const carriedFrom = carry ? loaded.liveNote?.Note_Content : null;
    const noteText = carriedFrom
      ? buildCarriedNote({
          originalText: toPlainText(carriedFrom),
          lines,
          story,
          when,
          previousWhen: stamp(loaded.liveNote?.Created_Time || loaded.jsonCreated),
          countsUpdated: countsVerified,
        })
      : buildAmendmentNote({ content, lines, story, when, previousWhen: stamp(loaded.jsonCreated) });

    // 1. the new JSON -- create-only, newest wins (D-4). Same stamps as the onboarding form, plus
    //    an _amendment record. `_` keys are ignored by every reader (toFormValues strips them).
    await step("onboarding data", async () => {
      let colorMatches = [];
      try {
        colorMatches = buildColorMatches(cardSource); // E-48, derived; see App.jsx
      } catch (e) {
        colorMatches = [];
      }
      const json = JSON.stringify({
        ...cardSource,
        ...(colorMatches.length ? { _colorMatches: colorMatches } : {}),
        _schemaVersion: 1,
        _submittedAt: new Date().toISOString(),
        ...(carry ? { _source: "note" } : {}),
        _amendment: { amendedAt: when, changes: lines, story: story.trim(), supersedes: loaded.jsonCreated },
      });
      await ZOHO.CRM.API.attachFile({
        Entity: entity,
        RecordID: recordId,
        File: { Name: "onboarding-form.json", Content: new Blob([json], { type: "application/json" }) },
      });
    });

    // 2. regenerated cards -- not in carry mode: a card built from a lossy parse would look
    //    authoritative while missing answers, and these deals never had cards.
    if (!carry) await step("production cards", async () => {
      const cards = buildProductionCards(cardSource, cardCounts);
      for (let c = 0; c < cards.length; c++) {
        await ZOHO.CRM.API.attachFile({
          Entity: entity,
          RecordID: recordId,
          File: { Name: cards[c].name, Content: new Blob([cards[c].html], { type: "text/html" }) },
        });
      }
    });

    // 3 + 4. the new note, and ONLY THEN retitle the old one(s). If the new note fails the old one
    // keeps its live title; if the retitle fails there are two live-titled notes and the newest wins.
    let newNoteId = null;
    let priorNotes = [];
    const noteOk = await step("onboarding note", async () => {
      const prior = await ZOHO.CRM.API.getRelatedRecords({
        Entity: entity,
        RecordID: recordId,
        RelatedList: "Notes",
        page: 1,
        per_page: 200,
      });
      const r = await ZOHO.CRM.API.addNotes({
        Entity: entity,
        RecordID: recordId,
        Title: LIVE_NOTE_TITLE,
        Content: noteText,
      });
      if (!ok(r)) throw new Error("addNotes: " + JSON.stringify(r?.data?.[0] || r));
      newNoteId = r.data[0]?.details?.id;
      priorNotes = (prior?.data || []).filter((n) => n?.Note_Title === LIVE_NOTE_TITLE);
    });
    if (noteOk) {
      await step("marking the old note superseded", async () => {
        const olds = priorNotes.filter((n) => String(n.id) !== String(newNoteId));
        for (let i = 0; i < olds.length; i++) {
          const r = await ZOHO.CRM.API.updateRecord({
            Entity: "Notes",
            APIData: { id: olds[i].id, Note_Title: SUPERSEDED_TITLE(today()) },
            Trigger: [],
          });
          if (!ok(r)) throw new Error("retitle: " + JSON.stringify(r?.data?.[0] || r));
        }
      });
    }

    // 5. the Deal fields. ⛔ Onboarding_Needs_Updated is deliberately absent (D-25).
    const countsOk = await step(countsVerified ? "print counts and update summary" : "update summary (print counts left as they were)", async () => {
      const r = await ZOHO.CRM.API.updateRecord({
        Entity: entity,
        APIData: {
          id: recordId,
          ...(countsVerified ? printFields : {}),
          Order_Modified: true,
          Onboarding_Update_Results: appendUpdateResults(
            loaded.deal?.Onboarding_Update_Results,
            buildUpdateResultsEntry({ lines, story, when })
          ),
        },
        Trigger: [],
      });
      if (!ok(r)) throw new Error("updateRecord: " + JSON.stringify(r?.data?.[0] || r));
    });

    // 6. E-43 -- open produce tasks carry the numbers they were created with. Only when the counts
    // above were written (otherwise the Deal still holds the old ones and the tasks agree with it).
    if (countsVerified && countsOk) {
      let restamped = [];
      const taskStep = await step("production task counts", async () => {
        const rel = await ZOHO.CRM.API.getRelatedRecords({
          Entity: entity,
          RecordID: recordId,
          RelatedList: "Tasks",
          page: 1,
          per_page: 200,
        });
        // The related list may not carry Print_Count on every org / layout. A task that looks like a
        // produce task but arrived without the field is read on its own, so nothing is skipped or
        // overwritten blind.
        const tasks = [];
        for (const t of rel?.data || []) {
          if (t && t.Print_Count === undefined && countFieldForTask(t.Subject)) {
            try {
              const one = await ZOHO.CRM.API.getRecord({ Entity: "Tasks", RecordID: t.id });
              tasks.push(one?.data?.[0] || t);
            } catch (e) {
              tasks.push(t);
            }
          } else {
            tasks.push(t);
          }
        }
        const plan = planTaskRestamp(tasks, printFields, when);
        for (let i = 0; i < plan.length; i++) {
          const r = await ZOHO.CRM.API.updateRecord({
            Entity: "Tasks",
            APIData: { id: plan[i].id, Print_Count: plan[i].to, Description: plan[i].description },
            Trigger: [],
          });
          if (!ok(r)) throw new Error("task " + plan[i].id + ": " + JSON.stringify(r?.data?.[0] || r));
          restamped.push(plan[i]);
        }
      });
      // Say what happened to the tasks in plain words, in place of the bare step name.
      const at = (taskStep ? done : failed).indexOf("production task counts");
      const list = restamped.map((p) => `${p.subject} ${p.from === null ? "(blank)" : p.from} → ${p.to}`).join("; ");
      if (taskStep) {
        done[at] = restamped.length ? `open production tasks updated (${list})` : "production tasks checked (none needed a new count)";
      } else {
        failed[at] =
          "updating the open production tasks" +
          (restamped.length ? ` (done before it stopped: ${list})` : "") +
          " - their print counts may still show the old numbers";
      }
    }

    setOutcome({ done, failed });
    setSaving(false);
    if (!failed.length) {
      // Leave the result on screen a little longer when it lists tasks that were re-stamped.
      setTimeout(() => {
        try {
          ZOHO.CRM.UI.Popup.closeReload();
        } catch (e) {
          /* ignore */
        }
      }, done.some((d) => /^open production tasks updated/.test(d)) ? 5000 : 1200);
    }
  };

  if (state.status === "loading") {
    return (
      <Box sx={{ p: 4, display: "flex", gap: 2, alignItems: "center", fontFamily: "Roboto, sans-serif" }}>
        <CircularProgress size={20} /> Loading this deal's onboarding…
      </Box>
    );
  }
  if (state.status === "error") {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">Could not load the onboarding for this deal: {state.message}</Alert>
      </Box>
    );
  }

  const deal = loaded?.deal || {};
  const header = (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h5" fontWeight="bold">
        Onboarding Amendment
      </Typography>
      <Typography>
        {deal.Deal_Name || "(unnamed deal)"}
        {deal.Account_Name?.name ? ` · ${deal.Account_Name.name}` : ""}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Onboarding needs updated: <b>{deal.Onboarding_Needs_Updated ? "Yes" : "No"}</b> · Order modified:{" "}
        <b>{deal.Order_Modified ? "Yes" : "No"}</b>
      </Typography>
    </Box>
  );

  if (state.status === "nojson") {
    return (
      <Box sx={{ p: 3, fontFamily: "Roboto, sans-serif" }}>
        {header}
        <Alert severity="info">
          This deal has no saved onboarding answers and no "DEAL ONBOARDING FORM" note, so there is nothing to
          amend. Onboard the deal first.
        </Alert>
      </Box>
    );
  }

  return (
    <FormProvider {...methods}>
      <Box sx={{ p: 3, fontFamily: "Roboto, sans-serif", color: "#1a1a1a", background: "#fff", minHeight: "100vh" }}>
        {header}
        <Alert severity="info" sx={{ mb: 2 }}>
          Tick what changed, pick the product and garment, and only those fields open. Then say what happened.
The panel at the bottom shows exactly what will be recorded. Saving posts a new onboarding note
          {carry ? "" : ", new production cards"} and updates the print counts — the original note is kept and marked
          superseded.
          
        </Alert>
        {carry && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <b>This deal was rebuilt from its onboarding note</b>, not from saved answers, so some fields may be
            blank or incomplete — check what you open. The original note is kept word for word under your changes.{" "}
            {countsVerified ? (
              <>The note's numbers match the Deal's print counts, so the counts <b>will</b> be updated.</>
            ) : (
              <>
                The note's numbers do <b>not</b> match the Deal's print counts, so the counts will <b>not</b> be
                changed — update them by hand if quantities changed.
              </>
            )}
            {(loaded.warnings || []).length > 0 && (
              <Box component="ul" sx={{ m: 0, mt: 1, pl: 2 }}>
                {loaded.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </Box>
            )}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Prefilled from the onboarding {loaded.fromNote ? "note" : "form"} submitted {stamp(loaded.jsonCreated)}
          {loaded.olderCopies ? ` (the newest of ${loaded.olderCopies + 1} copies on this deal)` : ""}.
        </Typography>

        <Typography fontWeight="bold" sx={{ mt: 2 }}>
          1. What changed?
        </Typography>
        <FormGroup row>
          {WHAT_CHANGED.map(({ key, label }) => (
            <FormControlLabel
              key={key}
              label={label}
              control={
                <Checkbox
                  size="small"
                  checked={changed.includes(key)}
                  onChange={(e) =>
                    setChanged((c) => (e.target.checked ? [...c, key] : c.filter((k) => k !== key)))
                  }
                />
              }
            />
          ))}
        </FormGroup>

        <Typography fontWeight="bold" sx={{ mt: 2, mb: 1 }}>
          2. Which product? Then 3. which garment
        </Typography>
        {products.length ? (
          <ToggleButtonGroup
            exclusive
            size="small"
            value={productIdx}
            onChange={(_, v) => {
              setProductIdx(v);
              setGarmentIdx(null);
              setShowAll(false);
            }}
            sx={{ flexWrap: "wrap" }}
          >
            {products.map((p, i) => (
              <ToggleButton
                key={i}
                value={i}
                sx={{ textTransform: "none", textDecoration: isRemoved(i) ? "line-through" : "none" }}
              >
                {p?.productName || `Product ${i + 1}`} ({p?.productType || "?"})
                {i >= originalCount ? " · new" : ""}
                {isRemoved(i) ? " · removed" : ""}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        ) : (
          <Alert severity="info">This onboarding has no products.</Alert>
        )}

        {has("added") && (
          <Autocomplete
            size="small"
            sx={{ mt: 2, maxWidth: 420 }}
            options={addable}
            value={null}
            blurOnSelect
            getOptionLabel={(o) => o.split("#")[0]}
            onChange={(_, v) => addProduct(v)}
            noOptionsText="Every product type is already on this deal"
            renderInput={(params) => <TextField {...params} label="Add a product" />}
          />
        )}

        {/* Values for anything not on screen stay in the form (react-hook-form keeps them), so
            switching product or garment never drops an edit. */}
        {product && (
          <Box sx={{ border: "1px solid #ccc", p: 2, my: 2 }}>
            <Box sx={{ mb: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
              <Typography fontWeight="bold">
                {product.productName} ({product.productType})
              </Typography>
              {(has("removed") || isRemoved(productIdx)) && (
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  color={isRemoved(productIdx) ? "primary" : "error"}
                  onClick={() => toggleRemoved(productIdx)}
                >
                  {isRemoved(productIdx) ? "Undo remove" : "Remove this whole product"}
                </Button>
              )}
            </Box>

            {isRemoved(productIdx) ? (
              <Alert severity="error">
                {product.productName} will be removed from this order. Its prints come off the counts below.
              </Alert>
            ) : product._unparsed ? (
              <Alert severity="info">
                {product.productName} could not be rebuilt from the note, so its fields are not shown. It stays on
                the order exactly as it was — describe any change to it in your own words in step 4.
              </Alert>
            ) : !isGarmentProduct || productIdx >= originalCount ? (
              // Non-garment products are short, and a brand-new product needs every answer.
              anyFieldTick || productIdx >= originalCount ? (
                <ProductEditor key={productIdx} index={productIdx} product={product} options={loaded.options} />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Tick what changed in step 1 to open this product's fields.
                </Typography>
              )
            ) : (
              <>
                <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
                  Which garment?
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={garmentIdx}
                  onChange={(_, v) => {
                    setGarmentIdx(v);
                    setShowAll(false);
                  }}
                  sx={{ flexWrap: "wrap" }}
                >
                  {garments.map((gar, g) => (
                    <ToggleButton
                      key={g}
                      value={g}
                      sx={{ textTransform: "none", textDecoration: garmentRemoved(g) ? "line-through" : "none" }}
                    >
                      {garmentLabel(gar, g)}
                      {garmentIsNew(g) ? " · new" : ""}
                      {garmentRemoved(g) ? " · removed" : ""}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                {has("added") && (
                  <Button type="button" size="small" variant="outlined" sx={{ ml: 1 }} onClick={addGarment}>
                    + Add a garment
                  </Button>
                )}

                {garmentIdx != null && garments[garmentIdx] && (
                  <Box sx={{ mt: 2, pt: 1, borderTop: "1px solid #eee" }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
                      <Typography fontWeight="bold">{garmentLabel(garments[garmentIdx], garmentIdx)}</Typography>
                      <Box sx={{ display: "flex", gap: 1 }}>
                        {!garmentRemoved(garmentIdx) && !garmentIsNew(garmentIdx) && (
                          <Button type="button" size="small" onClick={() => setShowAll((v) => !v)}>
                            {showAll ? "Show only what changed" : "Show every field"}
                          </Button>
                        )}
                        {!garmentRemoved(garmentIdx) &&
                          !garmentIsNew(garmentIdx) &&
                          (garments[garmentIdx]?.secondaryBranches || []).length > 1 && (
                            <Button
                              type="button"
                              size="small"
                              variant="outlined"
                              onClick={() => splitGarment(garmentIdx)}
                              title="For an order where some graphics go on only some of these garments"
                            >
                              Split into two garment types
                            </Button>
                          )}
                        {(has("removed") || garmentRemoved(garmentIdx) || garmentIsNew(garmentIdx)) && (
                          <Button
                            type="button"
                            size="small"
                            variant="outlined"
                            color={garmentRemoved(garmentIdx) ? "primary" : "error"}
                            onClick={() => toggleGarmentRemoved(garmentIdx)}
                          >
                            {garmentRemoved(garmentIdx) ? "Undo remove" : "Remove this garment"}
                          </Button>
                        )}
                      </Box>
                    </Box>

                    {garmentRemoved(garmentIdx) ? (
                      <Alert severity="error" sx={{ mt: 1 }}>
                        This garment will be removed from the order. Its prints come off the counts below.
                        {garments.length > originalGarmentCount &&
                          " If you split it, the new garment types beside it replace it - pick each one above and set it up."}
                      </Alert>
                    ) : showAll || garmentIsNew(garmentIdx) ? (
                      <>
                      {garmentIsNew(garmentIdx) && (garments[garmentIdx]?.secondaryBranches || []).length > 0 && (
                        <Alert severity="info" sx={{ mt: 1 }}>
                          <b>New garment type.</b> Set its own quantity, colors and sizes below, and take off any
                          graphic that does not go on these garments:
                          {(garments[garmentIdx]?.secondaryBranches || []).map((gr, s) => (
                            <Box key={s} sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                              <span>{graphicName(gr, s)}</span>
                              <Button type="button" size="small" color="error" onClick={() => removeGraphic(garmentIdx, s)}>
                                Take off this garment
                              </Button>
                            </Box>
                          ))}
                        </Alert>
                      )}
                      <GarmentPrimaryBranchForm
                        key={`${productIdx}-${garmentIdx}-all-${rev}`}
                        index={productIdx}
                        branchIndex={garmentIdx}
                        options={loaded.options}
                        productName={product.productName}
                      />
                      </>
                    ) : anyFieldTick ? (
                      <>
                        {has("quantity") && <QuantityEditor key={`q-${productIdx}-${garmentIdx}`} p={productIdx} g={garmentIdx} />}
                        {has("garment") && <GarmentSwapEditor key={`s-${productIdx}-${garmentIdx}`} p={productIdx} g={garmentIdx} />}
                        {has("graphic") && (
                          <GraphicsEditor
                            key={`g-${productIdx}-${garmentIdx}`}
                            p={productIdx}
                            g={garmentIdx}
                            options={loaded.options}
                            productName={product.productName}
                          />
                        )}
                      </>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Tick what changed in step 1 (quantity, garment, or graphic) to open just those fields.
                      </Typography>
                    )}
                  </Box>
                )}
              </>
            )}
          </Box>
        )}

        {has("dates") && (
          <Box sx={{ border: "1px solid #ccc", p: 2, my: 2 }}>
            <Typography fontWeight="bold" sx={{ mb: 2 }}>
              Dates
            </Typography>
            <AmendDates />
          </Box>
        )}

        {has("contact") && (
          <Box sx={{ border: "1px solid #ccc", p: 2, my: 2 }}>
            <Typography fontWeight="bold" sx={{ mb: 2 }}>
              Contact / shipping
            </Typography>
            <AmendContact />
          </Box>
        )}

        {has("custnotes") && (
          <Box sx={{ border: "1px solid #ccc", p: 2, my: 2 }}>
            <Typography fontWeight="bold" sx={{ mb: 1 }}>
              Customer notes (for the account)
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {CUSTOMER_NOTES_QUESTION}
            </Typography>
            {accountNotes !== "" ? (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: "#fff4e5", border: "1px solid #ffd8a8", borderRadius: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: "0.9rem", mb: 0.5 }}>
                  Already on this account (kept as it is)
                </Typography>
                <Typography sx={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{accountNotes}</Typography>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                This account has no Customer Notes yet.
              </Typography>
            )}
            <Tooltip title={CUSTOMER_NOTES_TOOLTIP} placement="top-start" arrow>
              <TextField
                multiline
                minRows={3}
                fullWidth
                size="small"
                label="Customer Notes to add to this account"
                value={custNote}
                onChange={(e) => setCustNote(e.target.value)}
                error={custNoteOver > 0}
                helperText={
                  custNoteOver > 0
                    ? `Too long by ${custNoteOver} characters - the field holds ${CUSTOMER_NOTES_LIMIT}.`
                    : CUSTOMER_NOTES_TOOLTIP
                }
              />
            </Tooltip>
          </Box>
        )}

        <Typography fontWeight="bold" sx={{ mt: 2, mb: 1 }}>
          4. In your own words, what happened?
        </Typography>
        <TextField
          multiline
          minRows={3}
          fullWidth
          value={story}
          onChange={(e) => setStory(e.target.value)}
          placeholder="e.g. Client called and added 12 more shirts in XL, and wants them a week later."
        />

        <Box sx={{ mt: 3, p: 2, background: "#f6f6f6", border: "1px solid #ddd" }}>
          <Typography fontWeight="bold">What this amendment will record</Typography>
          {lines.length ? (
            <Box component="pre" sx={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, m: 0, mt: 1 }}>
              {lines.map((l) => `• ${l}`).join("\n")}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              No changes yet. If this says anything before you have edited a field, that is a prefill bug —
              please report it with the deal name.
            </Typography>
          )}

          {appendPreviews.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight="bold">
                Kept history (the original is never overwritten):
              </Typography>
              {appendPreviews.map(({ label, value }) => (
                <Box key={label} sx={{ mt: 1 }}>
                  <Typography variant="body2">{label}</Typography>
                  <Box component="pre" sx={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, m: 0, pl: 1, borderLeft: "3px solid #ccc" }}>
                    {String(value ?? "")}
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          {countLines.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight="bold">
                Print counts (original → amended)
              </Typography>
              {countLines.map(([label, was, now]) => (
                <Typography key={label} variant="body2" sx={{ color: was !== now ? "#b00020" : "inherit" }}>
                  {label}: {was} → {now ?? "?"}
                </Typography>
              ))}
            </Box>
          )}
        </Box>

        <Box sx={{ mt: 3, display: "flex", alignItems: "center", gap: 2 }}>
          <Button
            variant="contained"
            disabled={saving || !!outcome /* one attempt per open: a retry would post a second note and cards */}
            onClick={handleSubmit(save, onInvalid)}
          >
            {saving ? "Saving…" : "Save amendment"}
          </Button>
          {saving && <CircularProgress size={18} />}
        </Box>

        {outcome && !outcome.failed.length && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Amendment saved: {outcome.done.join(", ")}.
          </Alert>
        )}
        {outcome && outcome.failed.length > 0 && (
          <Alert severity="error" sx={{ mt: 2 }}>
            <b>Not everything saved.</b> Failed: {outcome.failed.join(", ")}.
            {outcome.done.length ? ` Saved: ${outcome.done.join(", ")}.` : ""} Nothing was deleted. Please tell
            David which deal this was before trying again — saving twice posts a second note and second cards.
          </Alert>
        )}
      </Box>
    </FormProvider>
  );
};

export default AmendmentApp;
