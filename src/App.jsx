import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  FormLabel,
  TextField,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { useFieldArray } from "react-hook-form";
import GarmentForm from "./components/GarmentForm";
import NonGarmentForm from "./components/NonGarmentForm";
import GraphicForm from "./components/GraphicForm";
import OnlineStorefrontForm from "./components/OnlineStorefrontForm";
import DtfGangSheetForm from "./components/DtfGangSheetForm";
import PrintCountPreview from "./components/PrintCountPreview";
import { buildProductionCards } from "./productionCards";
import { gangSheetPrints } from "./gangSheet";
import { checkGarmentQuantity } from "./quantityCheck";
import { computePrints } from "./printMath";
import { buildOnboardingNote } from "./onboardingNote";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";

const ZOHO = window.ZOHO;

function App() {
  const [initialized, setInitialized] = useState(false); // initialize the widget
  const [entity, setEntity] = useState(null); // keeps the module
  const [entityId, setEntityId] = useState(null); // keeps the module id
  const [recordData, setRecordData] = useState(null); // holds record response

  const [options, setOptions] = useState(null);

  const [attachments, setAttachments] = useState([]);
  const [fileError, setFileError] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // initialize the app
    ZOHO.embeddedApp.on("PageLoad", function (data) {
      ZOHO.CRM.UI.Resize({ height: "90%", width: "60%" }); // resize the widget window
      setEntity(data?.Entity);
      setEntityId(data?.EntityId?.[0]);

      setInitialized(true);
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


  // react-hook-form refuses to run onSubmit when validation fails, and this form renders no
  // error summary anywhere - so a required field would look like a dead Submit button. This
  // surfaces the reason. It also covers the pre-existing required "Date Needed By" on Graphic
  // Design, which has silently blocked submission until now.
  const onInvalid = (formErrors) => {
    setLoading(false);
    const names = [];
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.type && node.ref) { names.push(node.ref.name || ""); return; }
      Object.values(node).forEach(walk);
    };
    walk(formErrors);
    const label = (nm) =>
      nm.endsWith(".placementSize") ? "Placement Size (required on Embroidery placements)"
        : nm.endsWith(".dateNeededBy") ? "Date Needed By"
        : nm;
    const list = [...new Set(names.filter(Boolean).map(label))];
    window.alert(
      "This form can't be submitted yet — please fill in:" +
        (list.length ? "\n\n• " + list.join("\n• ") : "\n\nthe highlighted field(s).")
    );
  };

  const onSubmit = async (data) => {
    setLoading(true);
    console.log("Collected Form Data:", data);

    // PRINT COUNT CALCULATION (runs first so counts are available while the note is assembled).
    // The arithmetic lives in src/printMath.js, shared verbatim with the revision form (E-8 / D-11)
    // so the two can never disagree, and so the form can show the same numbers before submit.
    // Hard rule 7 still holds: computed at the top, destructured into the names everything below
    // already reads.
    // The note text, the 18 print-count fields and the card counts all come from ONE shared
    // builder (src/onboardingNote.js) -- the Amendment Form calls the same function, so an amended
    // order's note can never drift from a fresh onboarding's. Moved verbatim 2026-10-01 (E-24).
    const { content, printFields, cardCounts } = buildOnboardingNote(data);
    
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

    // Attach the full form submission as a minified JSON file on the Deal (create-only;
    // machine-readable handoff for downstream production tooling). Own try/catch so a
    // failure here never blocks the note, the counts, or the form closing.
    try {
      // E-6: stamp the payload so the consumers (the revision form today, the production child
      // module later) can branch on version instead of sniffing for keys. Bumped to 1 with the
      // gangsheet product type (D-13); history and the per-version shape live in docs/06.
      // The stamp is added to the attached copy only -- `data` itself is never retyped (D-5).
      const onboardingJson = JSON.stringify({
        ...data,
        _schemaVersion: 1,
        _submittedAt: new Date().toISOString(),
      });
      const jsonBlob = new Blob([onboardingJson], { type: "application/json" });
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
      const productionCards = buildProductionCards(data, cardCounts);
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
        // work on uploading attachments
        if (attachments.length > 0) {
          for (let i = 0; i < attachments.length; i++) {
            const file = attachments[i];
            const fileName = file.name;
            const blob = await file.arrayBuffer(); // Convert to Blob content

            const fileContent = new Blob([blob], { type: file.type });

            try {
              const response = await ZOHO.CRM.API.attachFile({
                Entity: "Notes",
                RecordID: noteId,
                File: {
                  Name: fileName,
                  Content: fileContent,
                },
              });

              if (i === attachments.length - 1) {
                ZOHO.CRM.UI.Popup.closeReload();
                setLoading(false);
              }
            } catch (err) {
              console.error("Upload failed for", fileName, err);
            }
          }
        } else {
          // No attachments, just close
          ZOHO.CRM.UI.Popup.closeReload();
          setLoading(false);
        }
      }
    }
  };

  if (recordData && options) {
    return (
      <Box sx={{ width: "100%" }}>
        <FormProvider {...methods}>
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
                File Upload (Max total: 15MB)
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

                  if (totalSize > 15 * 1024 * 1024) {
                    setFileError("Total file size cannot exceed 15MB.");
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
