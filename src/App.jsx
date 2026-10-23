import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  FormLabel,
  TextField,
  Tooltip,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { garmentFill } from "./products/garmentFromBooks";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { useFieldArray } from "react-hook-form";
import GarmentForm from "./components/GarmentForm";
import { StrictEntry } from "./components/strictEntry";
import NonGarmentForm from "./components/NonGarmentForm";
import GraphicForm from "./components/GraphicForm";
import OnlineStorefrontForm from "./components/OnlineStorefrontForm";
import DtfGangSheetForm from "./components/DtfGangSheetForm";
import PrintCountPreview from "./components/PrintCountPreview";
import { workDriveTarget } from "./productionCards";
import { buildSubmission } from "./submission";
import { gangSheetPrints } from "./gangSheet";
import { checkGarmentQuantity } from "./quantityCheck";
import { computePrints } from "./printMath";
import { lumpedConcerns, LUMPED_QUESTION } from "./lumpedOrder";
import { applyGarmentSplits } from "./garmentSplit";
import { requestDealFolders, shouldRequestFolders } from "./dealFolders";
import { afterRequestLeaves, requestArtCopy, shouldCopyArt } from "./artCopy";
import { ArtFilesContext } from "./components/GraphicArt";
import BillingSection from "./components/BillingSection";
import BillingResult from "./components/BillingResult";
import { buildBillingLines } from "./invoice/billingLines";
import { billingOnFor, billingRecord, draftsOn, prepareDraft, sendDraft } from "./invoice/billingDraft";
import { BillingOn } from "./invoice/billingContext";
import { screenPrintShortfall } from "./invoice/minimums";
import { MAX_UPLOAD_BYTES, artKey, collectArtFiles } from "./graphicArt";
import {
  CUSTOMER_NOTES_QUESTION,
  CUSTOMER_NOTES_TOOLTIP,
  CUSTOMER_NOTES_LIMIT,
  loadAccountNotes,
  overLimitBy,
  saveCustomerNotes,
  todayStamp,
} from "./customerNotes";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";

// E-103: downloaded only when a rep opens it.
const NewProductDialog = lazy(() => import("./components/NewProductDialog"));

const ZOHO = window.ZOHO;

function App() {
  const [initialized, setInitialized] = useState(false); // initialize the widget
  const [addingProduct, setAddingProduct] = useState(false); // E-103: the New Product form, opened from the top of this form
  const [entity, setEntity] = useState(null); // keeps the module
  const [entityId, setEntityId] = useState(null); // keeps the module id
  const [recordData, setRecordData] = useState(null); // holds record response
  const [accountNotes, setAccountNotes] = useState(""); // E-38: Account's Customer Notes at open

  const [options, setOptions] = useState(null);

  const [attachments, setAttachments] = useState([]);
  const [fileError, setFileError] = useState("");
  // E-95: art attached per graphic. The File objects stay here (keyed); the graphic saves { name, size, key }.
  const artFilesRef = useRef(new Map());

  const [loading, setLoading] = useState(false);
  const [billing, setBilling] = useState(null); // E-108: after Submit, the draft invoice's progress and Zoho's answer
  const [currentUser, setCurrentUser] = useState(""); // E-108: the rep's name, logged by the draft function

  useEffect(() => {
    // initialize the app
    ZOHO.embeddedApp.on("PageLoad", function (data) {
      ZOHO.CRM.UI.Resize({ height: "90%", width: "60%" }); // resize the widget window
      setEntity(data?.Entity);
      setEntityId(data?.EntityId?.[0]);

      setInitialized(true);
      // E-108: who submits (the draft function logs it). Never blocks the form.
      Promise.resolve()
        .then(() => ZOHO.CRM.CONFIG.getCurrentUser())
        .then((r) => setCurrentUser((r && r.users && r.users[0] && r.users[0].full_name) || ""))
        .catch(() => {});
    });

    ZOHO.embeddedApp.init();
  }, []);

  useEffect(() => {
    // get all data
    if (initialized) {
      const fetchData = async () => {
        const recordResp = await ZOHO.CRM.API.getRecord({
          Entity: entity,
          approved: "both",
          RecordID: entityId,
        });
        setRecordData(recordResp?.data?.[0]);
        // E-38: the Account's standing Customer Notes, shown read-only. Never blocks the form.
        loadAccountNotes(recordResp?.data?.[0]).then((a) => setAccountNotes(a?.notes || ""));

        const variableResp = await ZOHO.CRM.API.getOrgVariable("products");
        let optionsList = variableResp?.Success?.Content?.split(",");
        setOptions(optionsList);
        // console.log(variableResp?.Success?.Content);
      };

      fetchData();
    }
  }, [initialized]);

  const methods = useForm({
    defaultValues: {
      contactInfo: {
        Account_Name: recordData?.Account_Name?.name,
        Deal_Name: recordData?.Deal_Name,
        Contact_Name: recordData?.Contact_Name?.name,
        Contact_Phone: recordData?.Contact_Phone,
        Contact_Email: recordData?.Contact_Email,
        Sales_Person: recordData?.Sales_Person,
      },
    },
  });

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = methods;

  // E-95: one 15MB total for everything on the note -- every graphic's art plus the "Other files".
  const artBytes = () => collectArtFiles(methods.getValues("products")).reduce((n, a) => n + (a.size || 0), 0);
  const otherBytes = (list) => (list || []).reduce((n, f) => n + f.size, 0);
  const artFiles = useMemo(
    () => ({
      get: (key) => artFilesRef.current.get(key),
      put: (file) => {
        const key = artKey(file);
        artFilesRef.current.set(key, file);
        return key;
      },
      room: (addBytes) =>
        artBytes() + otherBytes(attachments) + addBytes > MAX_UPLOAD_BYTES
          ? `All files together (art + other files) cannot exceed 15MB.`
          : "",
    }),
    [attachments] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const {
    fields: productFields,
    append,
    remove,
  } = useFieldArray({
    control,
    name: "products",
  });

  const hardDueDate = useWatch({
    control,
    name: `hardDueDate`,
  });

  const doProductsNeedShipped = useWatch({
    control,
    name: `doProductsNeedShipped`,
  });

  const discountsForExtendedTurnaround = useWatch({
    control,
    name: `discountsForExtendedTurnaround`,
  });

  const howDidYouHearAboutUs = useWatch({
    control,
    name: `howDidYouHearAboutUs`,
  });

  const hasCustomerNotes = useWatch({
    control,
    name: `hasCustomerNotes`,
  });


  // react-hook-form refuses to run onSubmit when validation fails, and this form renders no
  // error summary anywhere - so a required field would look like a dead Submit button. This
  // surfaces the reason. It also covers the pre-existing required "Date Needed By" on Graphic
  // Design, which has silently blocked submission until now.
  const onInvalid = (formErrors) => {
    setLoading(false);
    const names = [];
    // The error's own path when its input has no name (an Autocomplete's ref is not the input) -- E-108.
    const walk = (node, path) => {
      if (!node || typeof node !== "object") return;
      if (typeof node.type === "string" && ("ref" in node || "message" in node)) { names.push((node.ref && node.ref.name) || path); return; }
      Object.entries(node).forEach(([k, v]) => k !== "ref" && walk(v, path ? path + "." + k : k));
    };
    walk(formErrors, "");
    const label = (nm) =>
      nm.endsWith(".placementSize") ? "Placement Size (required on Embroidery placements)"
        : nm.endsWith(".garmentKind") ? "Garment Kind (on each garment type)"
        : nm.endsWith(".placementPick") ? "Placement location (pick one, or Other… and type it)"
        : nm.endsWith(".placementOther") ? "Placement location — the Other line"
        : nm.endsWith(".widthIn") || nm.endsWith(".heightIn") ? "Placement size — a width or a height in inches (e.g. 3.5 or 3 1/2)"
        : nm.endsWith(".dateNeededBy") ? "Date Needed By"
        : nm === "billingDocument" ? "Invoice or Estimate? (Invoice section)"
        : nm === "payingByCard" ? "Paying by card? (Invoice section)"
        : nm.endsWith(".htvColorMode") ? "Single color or full color? (on each Heat-Transfer graphic)"
        : nm.endsWith(".garmentsWithThisGraphic") ? "How many of these garments get this graphic?"
        : nm;
    const list = [...new Set(names.filter(Boolean).map(label))];
    window.alert(
      "This form can't be submitted yet — please fill in:" +
        (list.length ? "\n\n• " + list.join("\n• ") : "\n\nthe highlighted field(s).")
    );
  };

  const onSubmit = async (formData) => {
    // E-58: in a split garment type, a graphic unticked for a garment is left out of that garment.
    // Done FIRST, so the count, the saved order, the cards and the note all read the same thing.
    const data = applyGarmentSplits(formData);
    // E-109 / D-53 (revised 10-23): under the 12-piece screen print minimum is a rare exception -- the rep confirms it, never blocked.
    const shortfall = screenPrintShortfall(data);
    if (shortfall && !window.confirm(shortfall.message + "\n\nOK = submit anyway (an exception).   Cancel = go back.")) return;
    // E-42: a garment type that looks like several (styles/colors + graphics) and was not answered
    // "Yes" gets one last question. Cancel returns to the form; OK submits exactly as entered.
    const lumped = lumpedConcerns(data?.products);
    if (lumped.length) {
      const lines = lumped.map(
        (c) => "- " + c.label + (c.answer === "No" ? " (you answered No)" : " (not answered)") + ": " + c.explanation
      );
      const go = window.confirm(
        "Check before submitting - the print count may be too high:\n\n" +
          lines.join("\n") +
          "\n\n\"" + LUMPED_QUESTION + "\" If not, press Cancel and split it into separate garment types." +
          "\n\nOK = submit as entered.   Cancel = go back."
      );
      if (!go) return;
    }
    setLoading(true);
    console.log("Collected Form Data:", data);

    // PRINT COUNT CALCULATION. The arithmetic lives in src/printMath.js, shared verbatim with the
    // revision form (E-8 / D-11). The note text, the 18 print-count fields and the card counts come
    // from ONE shared builder (src/onboardingNote.js), which the Amendment Form also calls (E-24).
    // Since docs/45 all four outputs (note, print fields, JSON, cards) come from buildSubmission() in
    // src/submission.js -- the same function the InkSoft order-sync runs headless -- so there is one
    // path. It runs right after Customer Notes (below), whose saved text the JSON and the cards print,
    // and before any write (hard rule 7).

    // E-38: append the rep's answer to the Account's Customer Notes and make this Deal's field
    // match. saveCustomerNotes() never throws and makes its own calls, so it cannot block the
    // counts, the JSON, the cards or the note. `data` itself is not changed (D-5); the copy
    // only adds the text the production cards print.
    let savedCustomerNotes = "";
    try {
      const cn = await saveCustomerNotes({
        entity,
        recordId: entityId,
        deal: recordData,
        entry: data?.hasCustomerNotes === "Yes" ? data?.customerNotesNew : "",
        dateStr: todayStamp(),
      });
      if (cn.combined) savedCustomerNotes = cn.combined;
      if (cn.problem) window.alert("Customer Notes: " + cn.problem + ". The rest of the form is being saved as normal.");
    } catch (err) {
      console.log("Customer notes step failed - skipping:", err);
    }

    // The print-count calculation and everything built from it (hard rule 7: before any write below).
    const folderLink = workDriveTarget(recordData);
    const {
      note: content,
      printFields,
      json: onboardingJson,
      cards: productionCards,
    } = buildSubmission(formData, {
      poNumber: recordData?.PO_Number,
      workDriveLink: folderLink.href,
      workDriveLabel: folderLink.label,
      customerNotes: savedCustomerNotes,
    });
    
    // go for API call
    // Attempt to update Deal print count fields — silent fallback if fields don't exist yet
    try {
      await ZOHO.CRM.API.updateRecord({
        Entity: entity,
        APIData: { id: entityId, ...printFields },
      });
    } catch (err) {
          console.log("Print count fields not yet on layout — skipping field update:", err);
    }

    // E-56: ask the CRM to create this Deal's WorkDrive folders. AFTER the print fields above (the
    // function reads the onboarded departments from them) and NOT awaited -- a real run takes about
    // 13 seconds and the rep is not made to wait for it. It cannot throw (see dealFolders.js).
    // Not sent for a Deal that already has a hand-made folder (David: no back-fill).
    if (shouldRequestFolders(recordData)) requestDealFolders(entityId);

    // Attach the full form submission as a minified JSON file on the Deal (create-only;
    // machine-readable handoff for downstream production tooling). Own try/catch so a
    // failure here never blocks the note, the counts, or the form closing.
    // E-6 stamp, E-48 color matches: built in submission.js (see there); `data` is never retyped (D-5).
    // E-108: the draft invoice's lines as worked out at submit (no Books prices yet) -- additive `_billing` (docs/06, docs/63).
    let billingPlan = null;
    let jsonText = onboardingJson;
    try {
      if (billingOnFor(entityId)) billingPlan = buildBillingLines(data);
      if (billingPlan) jsonText = JSON.stringify({ ...JSON.parse(onboardingJson), _billing: billingRecord(billingPlan, null) });
    } catch (err) {
      console.log("Invoice lines could not be worked out - the JSON is saved without them:", err);
    }
    try {
      const jsonBlob = new Blob([jsonText], { type: "application/json" });
      await ZOHO.CRM.API.attachFile({
        Entity: entity,
        RecordID: entityId,
        File: {
          Name: "onboarding-form.json",
          Content: jsonBlob,
        },
      });
    } catch (err) {
        console.log("Onboarding JSON attach failed — skipping:", err);
    }

    // Generate per-department production cards and attach each to the Deal (create-only,
    // human-readable job sheets). Own try/catch so a failure never blocks the note or counts.
    try {
      // Built in submission.js with the Deal's PO number and WorkDrive folder as they are at onboarding (E-53).
      for (let c = 0; c < productionCards.length; c++) {
        try {
          const cardBlob = new Blob([productionCards[c].html], { type: "text/html" });
          await ZOHO.CRM.API.attachFile({
            Entity: entity,
            RecordID: entityId,
            File: { Name: productionCards[c].name, Content: cardBlob },
          });
        } catch (e) {
          console.log("Production card attach failed:", productionCards[c].name, e);
        }
      }
    } catch (err) {
      console.log("Production card generation failed — skipping:", err);
    }

    const response = await ZOHO.CRM.API.addNotes({
      
      Entity: entity,
      RecordID: entityId,
      Title: "DEAL ONBOARDING FORM",
      Content: content,
    });
    console.log(response);
    if (response?.data?.[0]?.code) {
      // ZOHO.CRM.UI.Popup.closeReload();
      const noteId = response?.data?.[0]?.details?.id;
      if (noteId !== null || noteId !== undefined) {
        // work on uploading attachments: every graphic's art (E-95) and the "Other files", each file once
        const uploads = [
          ...collectArtFiles(data?.products).map((a) => artFilesRef.current.get(a.key)).filter(Boolean),
          ...attachments,
        ].filter((f, i, all) => all.findIndex((g) => artKey(g) === artKey(f)) === i);
        let filesOnNote = 0;
        for (let i = 0; i < uploads.length; i++) {
          const file = uploads[i];
          const fileName = file.name;
          const blob = await file.arrayBuffer(); // Convert to Blob content

          const fileContent = new Blob([blob], { type: file.type });

          try {
            await ZOHO.CRM.API.attachFile({
              Entity: "Notes",
              RecordID: noteId,
              File: {
                Name: fileName,
                Content: fileContent,
              },
            });
            filesOnNote++;
          } catch (err) {
            console.error("Upload failed for", fileName, err);
          }
        }

        // E-72: ask the CRM to copy the note's files into the Deal's WorkDrive Art Assets. AFTER the
        // last upload (the function reads them from the note). Only when a file arrived, and only on a
        // Deal the folder automation owns (see artCopy.js). The copy itself is not waited for; the close
        // waits at most 2 s so the request leaves before closeReload() reloads the Deal page.
        if (noteId && shouldCopyArt(recordData, filesOnNote)) {
          await afterRequestLeaves(requestArtCopy(entityId, noteId));
        }
        // E-108: the draft invoice / estimate, after everything above is saved. It never stops the onboarding: whatever Zoho
        // answers is shown on the result screen, and Close reloads the Deal as before.
        if (draftsOn() && billingPlan && billingPlan.flags.document) {
          setBilling({ busy: billingPlan.flags.document });
          let prepared = null;
          let answer;
          try {
            prepared = await prepareDraft(data);
            answer = await sendDraft(entityId, prepared, { submittedBy: currentUser });
          } catch (err) {
            answer = { result: "not_sent", message: "The draft could not be made (" + String((err && err.message) || err) + "). Please make it in Books." };
          }
          setBilling({ prepared, answer });
          setLoading(false);
          return;
        }
        ZOHO.CRM.UI.Popup.closeReload();
        setLoading(false);
      }
    }
  };

  if (billing) return <BillingResult state={billing} onClose={() => ZOHO.CRM.UI.Popup.closeReload()} />;

  if (recordData && options) {
    return (
      <Box sx={{ width: "100%" }}>
        <FormProvider {...methods}>
          {/* E-74: Garment kind, placement location and a width or height are required here (not in the Amendment Form). */}
          <StrictEntry.Provider value={true}>
          <ArtFilesContext.Provider value={artFiles}>
          <BillingOn.Provider value={billingOnFor(entityId)}>
          <Box
            sx={{
              width: "90%",
              mx: "auto",
              bgcolor: "#F5F5F5",
              px: 2,
              py: 2,
              mb: 2,
            }}
            component="form"
            onSubmit={handleSubmit(onSubmit, onInvalid)}
          >
            <Typography
              sx={{
                textAlign: "center",
                pb: "1.5rem",
                fontWeight: "bold",
                fontSize: "1.5rem",
              }}
            >
              Deal Onboarding Form
            </Typography>

            {/* E-103: add a product to Books on the fly, without onboarding a client (until it has its own widget). */}
            <Box sx={{ textAlign: "center", mt: "-0.75rem", mb: "1rem" }}>
              <Button size="small" variant="outlined" onClick={() => setAddingProduct(true)}>
                Add a new product to Books
              </Button>
            </Box>
            {addingProduct && (
              <Suspense fallback={null}>
                <NewProductDialog
                  open
                  onClose={() => setAddingProduct(false)}
                  // E-103 step 2: the new items become a filled garment type under one of this onboarding's garment products.
                  orderTargets={(methods.getValues("products") || [])
                    .map((p, i) => ({ key: String(i), label: `${p.productName} (new garment type)`, garment: p.productType === "garment" }))
                    .filter((t) => t.garment)}
                  onAddToOrder={(items, key) => {
                    const i = Number(key);
                    const branches = methods.getValues(`products.${i}.primaryBranches`) || [];
                    const f = garmentFill(items, items[0] && items[0].category);
                    methods.setValue(`products.${i}.primaryBranches`, [
                      ...branches,
                      // E-107: keep the family; the SKU rows then follow the sizes entered (base band until then).
                      { name: "", garmentType: f.garmentType, garmentKind: f.garmentKind, booksFamily: f.garmentSkus, garmentSkus: f.garmentSkus.slice(0, 1), numberOfSkus: "1" },
                    ]);
                    methods.setValue(`products.${i}.numberOfGarmentTypes`, String(branches.length + 1));
                    setAddingProduct(false);
                  }}
                />
              </Suspense>
            )}

            <Typography
              variant="p"
              sx={{
                pt: "1rem",
                pb: "2rem",
                fontSize: "1.2rem",
                fontWeight: "bold",
              }}
            >
              CONTACT INFO
            </Typography>

            <Box sx={{ width: "100%", mt: 2 }}>
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                  mb: 2,
                }}
              >
                <Controller
                  control={control}
                  name="contactInfo.Account_Name"
                  defaultValue={recordData?.Account_Name?.name}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Account_Name"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Account Name"
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="contactInfo.Deal_Name"
                  defaultValue={recordData?.Deal_Name}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Deal_Name"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Deal Name"
                    />
                  )}
                />
              </Box>

              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                  mb: 2,
                }}
              >
                <Controller
                  control={control}
                  name="contactInfo.Contact_Name"
                  defaultValue={recordData?.Contact_Name?.name}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Contact_Name"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Contact Name"
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="contactInfo.Contact_Phone"
                  defaultValue={recordData?.Contact_Phone || ""}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Contact_Phone"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Contact Phone"
                    />
                  )}
                />
              </Box>

              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                  mb: 2,
                }}
              >
                <Controller
                  control={control}
                  name="contactInfo.Contact_Email"
                  defaultValue={recordData?.Contact_Email}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Contact_Email"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Contact Email"
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="contactInfo.Sales_Person"
                  defaultValue={recordData?.Sales_Person || ""}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Sales_Person"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Sales Person"
                    />
                  )}
                />
              </Box>
            </Box>

            <Typography
              variant="p"
              sx={{
                pt: "1rem",
                pb: "2rem",
                fontSize: "1.2rem",
                fontWeight: "bold",
                mt: 4,
              }}
            >
              Product Information
            </Typography>

            <Typography
              sx={{
                pt: "1rem",
                pb: "2rem",
                fontSize: "1rem",
                fontWeight: "bold",
              }}
            >
              Services / Printing Applications
            </Typography>

            <Controller
              name="productSelector"
              control={control}
              defaultValue={[]}
              render={({ field }) => (
                <Autocomplete
                  multiple
                  options={options || []}
                  value={field.value || []}
                  onChange={(e, newValue) => {
                    field.onChange(newValue);

                    const existingProductNames =
                      watch("products")?.map(
                        (p) => p.productName + "#" + p.productType,
                      ) || [];

                    const newProductsToAdd = newValue.filter(
                      (val) => !existingProductNames.includes(val),
                    );

                    // Add split product info
                    newProductsToAdd.forEach((combined) => {
                      const [productName, productType] = combined.split("#");
                      append({ productName, productType });
                    });

                    // Remove deselected items
                    const removed = existingProductNames.filter(
                      (pt) => !newValue.includes(pt),
                    );
                    removed.forEach((pt) => {
                      const [productName, productType] = pt.split("#");
                      const indexToRemove = watch("products")?.findIndex(
                        (p) =>
                          p.productName === productName &&
                          p.productType === productType,
                      );
                      if (indexToRemove !== -1) remove(indexToRemove);
                    });
                  }}
                  getOptionLabel={(option) => option.split("#")[0]} // only show product name
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Select Product Types"
                      size="small"
                    />
                  )}
                />
              )}
            />

            {productFields.map((item, index) => {
              const productType = watch(`products.${index}.productType`);
              const productName = watch(`products.${index}.productName`);

              return (
                <Box
                  key={item.id}
                  sx={{ border: "1px solid #ccc", p: 2, my: 2 }}
                >
                  <Box
                    mb={2}
                    sx={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Typography fontWeight="bold">
                      {productName} ({productType})
                    </Typography>

                    <Button
                      type="button"
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => {
                        const currentSelection = watch("productSelector") || [];
                        const toRemove = `${productName}#${productType}`;
                        const updatedSelection = currentSelection.filter(
                          (v) => v !== toRemove,
                        );
                        setValue("productSelector", updatedSelection);
                        remove(index);
                      }}
                    >
                      Remove
                    </Button>
                  </Box>

                  {productType === "garment" && (
                    <GarmentForm
                      index={index}
                      options={options}
                      productName={productName}
                    />
                  )}

                  {productType === "nongarment" && (
                    <NonGarmentForm index={index} />
                  )}

                  {productType === "graphic" && <GraphicForm index={index} />}

                  {productType === "onlinestorefront" && (
                    <OnlineStorefrontForm index={index} />
                  )}

                  {productType === "gangsheet" && (
                    <DtfGangSheetForm index={index} />
                  )}
                </Box>
              );
            })}

            <Typography
              sx={{
                pt: "1rem",
                fontSize: "1.2rem",
                fontWeight: "bold",
              }}
            >
              Other Information
            </Typography>

            <Controller
              control={control}
              name="howDidYouHearAboutUs"
              defaultValue={""}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="howDidYouHearAboutUs"
                  size="small"
                  options={[
                    "Google",
                    "Facebook",
                    "Yelp",
                    "Bing",
                    "Referall",
                    "Cold Call",
                    "Previous Customer",
                    "Online Order",
                    "Other",
                  ]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="How Did You Hear About Us?"
                    />
                  )}
                />
              )}
            />

            {howDidYouHearAboutUs === "Other" && (
              <Controller
                control={control}
                name="detailLeadSource"
                defaultValue=""
                render={({ field }) => (
                  <TextField
                    multiline
                    rows={3}
                    size="small"
                    id="detailLeadSource"
                    variant="outlined"
                    fullWidth
                    label="Detail Lead Source"
                    {...field}
                    sx={{ mb: "1rem", mt: "5px" }}
                  />
                )}
              />
            )}

            <Controller
              control={control}
              name={`suppliesMaterialsNeeded`}
              defaultValue=""
              render={({ field }) => (
                <TextField
                  multiline
                  rows={3}
                  size="small"
                  id="suppliesMaterialsNeeded"
                  variant="outlined"
                  fullWidth
                  label="Supplies / Materials Needed"
                  {...field}
                  sx={{ mb: "1rem", mt: "5px" }}
                />
              )}
            />

            <Controller
              control={control}
              name={`specialInstructions`}
              defaultValue=""
              render={({ field }) => (
                <TextField
                  multiline
                  rows={3}
                  size="small"
                  id="specialInstructions"
                  variant="outlined"
                  fullWidth
                  label="Special Instructions"
                  {...field}
                  sx={{ mb: "1rem", mt: "5px" }}
                />
              )}
            />

            {/* E-38: standing notes for the ACCOUNT. The answer is appended to the Account's Customer
                Notes (never replaces them) and shows on every future deal for this customer. */}
            {accountNotes !== "" && (
              <Box sx={{ mb: "1rem", p: 1.5, bgcolor: "#fff4e5", border: "1px solid #ffd8a8", borderRadius: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: "0.9rem", mb: 0.5 }}>
                  Customer Notes already on this account
                </Typography>
                <Typography sx={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{accountNotes}</Typography>
              </Box>
            )}

            <Controller
              control={control}
              name="hasCustomerNotes"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="hasCustomerNotes"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Details to consider for ALL future deals in this account?"
                      helperText={CUSTOMER_NOTES_QUESTION}
                    />
                  )}
                />
              )}
            />

            {hasCustomerNotes === "Yes" && (
              <Controller
                control={control}
                name="customerNotesNew"
                defaultValue=""
                rules={{
                  validate: (value) => {
                    const over = overLimitBy(accountNotes, value, todayStamp());
                    return (
                      over === 0 ||
                      `Too long by ${over} characters - the account's Customer Notes field holds ${CUSTOMER_NOTES_LIMIT}. Shorten this, or tidy the old notes on the Account page.`
                    );
                  },
                }}
                render={({ field, fieldState }) => (
                  <Tooltip title={CUSTOMER_NOTES_TOOLTIP} placement="top-start" arrow>
                    <TextField
                      multiline
                      rows={3}
                      size="small"
                      id="customerNotesNew"
                      variant="outlined"
                      fullWidth
                      label="Customer Notes to add to this account"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message || CUSTOMER_NOTES_TOOLTIP}
                      {...field}
                      sx={{ mb: "1rem", mt: "5px" }}
                    />
                  </Tooltip>
                )}
              />
            )}

            <Controller
              control={control}
              name="isRepeatOrder"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="isRepeatOrder"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Is This a Repeat Order?"
                    />
                  )}
                />
              )}
            />

            <Controller
              control={control}
              name="doProductsNeedShipped"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="doProductsNeedShipped"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Do Products Need Shipped?"
                    />
                  )}
                />
              )}
            />

            {doProductsNeedShipped === "Yes" && (
              <>
                <Controller
                  control={control}
                  name="shippingContactAddress"
                  defaultValue=""
                  render={({ field }) => (
                    <TextField
                      multiline
                      rows={3}
                      size="small"
                      id="shippingContactAddress"
                      variant="outlined"
                      fullWidth
                      label="Shipping Contact & Address"
                      {...field}
                      sx={{ mb: "1rem", mt: "5px" }}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="otherShippingDetails"
                  defaultValue=""
                  render={({ field }) => (
                    <TextField
                      multiline
                      rows={3}
                      size="small"
                      id="otherShippingDetails"
                      variant="outlined"
                      fullWidth
                      label="Other Shipping Details"
                      {...field}
                      sx={{ mb: "1rem", mt: "5px" }}
                    />
                  )}
                />
              </>
            )}

            <Controller
              control={control}
              name="customerConsentsToEmailAndText"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="customerConsentsToEmailAndText"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Customer Consents to Email and Text?"
                    />
                  )}
                />
              )}
            />

            <Controller
              control={control}
              name="roundUpForCharity"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="roundUpForCharity"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Round up for Charity?"
                    />
                  )}
                />
              )}
            />

            <Box sx={{ mt: 2 }}>
              <Typography
                sx={{
                  fontSize: "0.9rem",
                  fontWeight: "bold",
                  mb: 1,
                }}
              >
                Other files (PO, reference photos, mock-ups) -- art goes with each graphic above (max total for all files: 15MB)
              </Typography>

              <input
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files);
                  const totalSize = files.reduce(
                    (acc, file) => acc + file.size,
                    0,
                  );

                  if (totalSize + artBytes() > MAX_UPLOAD_BYTES) {
                    setFileError("All files together (art + other files) cannot exceed 15MB.");
                    setAttachments([]);
                  } else {
                    setFileError("");
                    setAttachments(files);
                  }
                }}
              />

              {fileError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {fileError}
                </Alert>
              )}

              {attachments.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" fontWeight="bold">
                    Selected Files:
                  </Typography>
                  <ul style={{ paddingLeft: "1rem", margin: 0 }}>
                    {attachments.map((file, idx) => (
                      <li key={idx}>
                        {file.name} - {(file.size / (1024 * 1024)).toFixed(2)}{" "}
                        MB
                      </li>
                    ))}
                  </ul>
                </Box>
              )}
            </Box>

            <Typography
              sx={{
                pt: "1rem",
                fontSize: "1.2rem",
                fontWeight: "bold",
              }}
            >
              Turnaround Time
            </Typography>

            <Controller
              control={control}
              name="hardDueDate"
              defaultValue={""}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="hardDueDate"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Does Customer Have A Hard Due Date?"
                    />
                  )}
                />
              )}
            />

            {hardDueDate === "Yes" && (
              <>
                <Box sx={{ mb: "1rem" }}>
                  <FormLabel
                    id="date"
                    sx={{ mb: "10px", color: "black", display: "block" }}
                  >
                    Due Date
                  </FormLabel>
                  <Controller
                    name={`dueDate`}
                    control={control}
                    render={({ field }) => (
                      <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <DatePicker
                          onChange={(newValue) =>
                            field.onChange(dayjs(newValue).format("YYYY/MM/DD"))
                          }
                          {...field}
                          renderInput={(params) => (
                            <TextField
                              id="dueDate"
                              variant="outlined"
                              type="date"
                              sx={{
                                "& .MuiInputBase-root": {
                                  height: "2.3rem !important",
                                },
                              }}
                              {...params}
                            />
                          )}
                        />
                      </LocalizationProvider>
                    )}
                  />
                </Box>
                <Controller
                  control={control}
                  name="upchargedForRushTurnaround"
                  defaultValue={false}
                  render={({ field }) => (
                    <FormGroup>
                      <FormControlLabel
                        control={<Checkbox {...field} checked={!!field.value} />}
                        label="Upcharged For Rush Turnaround Time?"
                      />
                    </FormGroup>
                  )}
                />
              </>
            )}

            {hardDueDate === "No" && (
              <>
                <Controller
                  control={control}
                  name="discountsForExtendedTurnaround"
                  defaultValue={""}
                  render={({ field }) => (
                    <Autocomplete
                      {...field}
                      options={["Yes", "No"]}
                      value={field.value || ""}
                      onChange={(_, newValue) => field.onChange(newValue)}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Discounts for Extended Turnaround Time?"
                          variant="outlined"
                          size="small"
                          fullWidth
                          sx={{ mb: "1rem", mt: "5px" }}
                        />
                      )}
                    />
                  )}
                />

                {discountsForExtendedTurnaround === "Yes" && (
                  <Controller
                    control={control}
                    name="addOneWeekToProductionTime"
                    defaultValue={false}
                    render={({ field }) => (
                      <FormGroup>
                        <FormControlLabel
                          control={<Checkbox {...field} checked={!!field.value} />}
                          label="Add 1 Week To Production Time"
                        />
                      </FormGroup>
                    )}
                  />
                )}

                {discountsForExtendedTurnaround === "No" && (
                  <Controller
                    control={control}
                    name="tenFourteenBusinessDayTurnaround"
                    defaultValue={false}
                    render={({ field }) => (
                      <FormGroup>
                        <FormControlLabel
                          control={<Checkbox {...field} checked={!!field.value} />}
                          label="10-14 Business Day Turnaround"
                        />
                      </FormGroup>
                    )}
                  />
                )}
              </>
            )}

            <Controller
              control={control}
              name="typicalMockup"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="typicalMockup"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Custmer Acknowledged 24-48 Hour Mock-Up?"
                    />
                  )}
                />
              )}
            />


            {/* <Button
              type="submit"
              variant="contained"
              size="small"
              sx={{ mt: 2 }}
            >
              Submit
            </Button> */}

            {/* E-108: Invoice or Estimate, card, Other charges and the draft preview (pilot Deals only while the list has any). */}
            {billingOnFor(entityId) && <BillingSection dealId={entityId} submittedBy={currentUser} />}

            {/* What this submission will book -- same printMath.js onSubmit runs (E-17). */}
            <PrintCountPreview />

            <Box
              sx={{
                m: "1rem 0",
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <Button
                onClick={() => {
                  ZOHO.CRM.UI.Popup.close();
                }}
                variant="outlined"
              >
                Cancel
              </Button>

              <Button
                variant="contained"
                type="submit"
                loadingPosition="start"
                // loading={addCardLoading}
                disabled={loading}
              >
                Submit Form
              </Button>
            </Box>
          </Box>
          </BillingOn.Provider>
          </ArtFilesContext.Provider>
          </StrictEntry.Provider>
        </FormProvider>
      </Box>
    );
  } else {
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "1rem",
            margin: "20% 0",
          }}
        >
          <CircularProgress color="inherit" />
          <Typography fontWeight="bold" fontSize="1.5rem">
            Fetching Data. Please Wait...
          </Typography>
        </Box>
      </Box>
    );
  }
}

export default App;
