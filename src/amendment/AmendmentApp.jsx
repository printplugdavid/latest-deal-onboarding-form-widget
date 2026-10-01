/*
 * AmendmentApp.jsx -- the Onboarding Amendment Form (E-24), loaded by ?view=amendment (index.js).
 *
 * ⚠️ STAGE 1 OF D-24: READ, PREFILL AND EDIT ON SCREEN. THIS VIEW WRITES NOTHING. ⚠️
 * David's condition: prove prefill on real deals before any write path exists. The Save button is
 * disabled and there is no updateRecord / attachFile / addNotes call anywhere in this file. The write
 * path (new complete note + old one retitled SUPERSEDED, new onboarding-form.json, regenerated cards,
 * the 18 print fields, Onboarding_Update_Results) is stage 2, after prefill is proven on real deals.
 * ⛔ D-25: NEVER write Onboarding_Needs_Updated -- not to clear it, not to set it. It is the agents'
 * own history of "an update was needed"; they clear and re-mark it by hand to re-do one.
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
  Typography,
} from "@mui/material";
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import GarmentForm from "../components/GarmentForm";
import NonGarmentForm from "../components/NonGarmentForm";
import GraphicForm from "../components/GraphicForm";
import OnlineStorefrontForm from "../components/OnlineStorefrontForm";
import DtfGangSheetForm from "../components/DtfGangSheetForm";
import { computePrints } from "../printMath";
import { newestFirst, readFileText } from "../zohoFiles";
import { AmendContact, AmendDates } from "./AmendSections";
import {
  APPEND_FIELD,
  applyAppendRule,
  describePath,
  diffValues,
  effectiveValues,
  summariseAmendment,
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
];

const tagOf = (p) => `${p?.productName}#${p?.productType}`;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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

async function loadDeal(entity, recordId) {
  const [rec, att, vars] = await Promise.all([
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
  ]);
  const deal = rec?.data?.[0] || {};
  const options = vars?.Success?.Content?.split(",") || [];

  const jsons = (att?.data || [])
    .filter((a) => String(a?.File_Name || "").toLowerCase() === "onboarding-form.json")
    .sort(newestFirst);
  if (!jsons.length) return { deal, options, json: null };

  const newest = jsons[0];
  if (!newest["$file_id"]) throw new Error("the newest onboarding-form.json has no $file_id");
  const { text, shape } = await readFileText(newest["$file_id"]);
  if (!text || !text.trim()) throw new Error(`onboarding-form.json read empty (${shape})`);
  return {
    deal,
    options,
    json: JSON.parse(text),
    jsonCreated: newest.Created_Time,
    olderCopies: jsons.length - 1,
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
  const [removed, setRemoved] = useState([]); // indices into products; see the header comment
  const original = useRef(null);

  const methods = useForm();
  const { control, reset } = methods;
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
      try {
        const res = await loadDeal(entity, recordId);
        setLoaded(res);
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

  const lines = useMemo(
    () => (original.current && current ? summariseAmendment(original.current, current, removed) : []),
    [current, removed]
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
      return !m || !isRemoved(Number(m[1]));
    })
    .map((c) => ({
      label: describePath(c.path, current),
      value: c.path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), merged),
    }));
  // What would actually be saved: removed products dropped, append rule applied.
  const saved = useMemo(
    () => (original.current && current ? effectiveValues(original.current, current, removed, today()) : null),
    [current, removed]
  );
  const before = useMemo(() => countRows(original.current?.products), [state.status]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const countLines = (before || [])
    .map(([label, was], i) => [label, was, after?.[i]?.[1]])
    .filter(([, was, now]) => was || now);

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
          This deal has no <code>onboarding-form.json</code>, so there is nothing to prefill from. Either it was
          onboarded before the form started saving one, or that save failed at submit. Amending a deal from its
          note alone is not built yet.
        </Alert>
      </Box>
    );
  }

  return (
    <FormProvider {...methods}>
      <Box sx={{ p: 3, fontFamily: "Roboto, sans-serif", color: "#1a1a1a", background: "#fff", minHeight: "100vh" }}>
        {header}
        <Alert severity="warning" sx={{ mb: 2 }}>
          <b>Test build: nothing here is saved yet.</b> Tick what changed, make the change, and the panel at
          the bottom shows what an amendment would record.
        </Alert>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Prefilled from the onboarding form submitted {stamp(loaded.jsonCreated)}
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
          2. Which product?
        </Typography>
        {products.length ? (
          <ToggleButtonGroup
            exclusive
            size="small"
            value={productIdx}
            onChange={(_, v) => setProductIdx(v)}
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

        {/* Every product stays mounted-or-not by choice only; values for unmounted products stay in
            the form (react-hook-form keeps them), so switching products never drops an edit. */}
        {productIdx != null && products[productIdx] && (
          <Box sx={{ border: "1px solid #ccc", p: 2, my: 2 }}>
            <Box sx={{ mb: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
              <Typography fontWeight="bold">
                {products[productIdx].productName} ({products[productIdx].productType})
              </Typography>
              {(has("removed") || isRemoved(productIdx)) && (
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  color={isRemoved(productIdx) ? "primary" : "error"}
                  onClick={() => toggleRemoved(productIdx)}
                >
                  {isRemoved(productIdx) ? "Undo remove" : "Remove this product"}
                </Button>
              )}
            </Box>
            {isRemoved(productIdx) ? (
              <Alert severity="error">
                {products[productIdx].productName} will be removed from this order. Its prints come off the
                counts below.
              </Alert>
            ) : (
              <ProductEditor key={productIdx} index={productIdx} product={products[productIdx]} options={loaded.options} />
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

        <Typography fontWeight="bold" sx={{ mt: 2, mb: 1 }}>
          3. In your own words, what happened?
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
          <Typography fontWeight="bold">What this amendment would record</Typography>
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
          <Button variant="contained" disabled>
            Save amendment
          </Button>
          <Typography variant="body2" color="text.secondary">
            Saving is not switched on yet.
          </Typography>
        </Box>
      </Box>
    </FormProvider>
  );
};

export default AmendmentApp;
