/*
 * AmendSections.jsx -- the deal-level answers an amendment can change: dates, contact, shipping.
 *
 * ⚠️ A deliberate, bounded exception to D-24's "imported, never copied". In the onboarding form these
 * fields are not components -- they are Controllers written inline in App.jsx's 2,000-line render,
 * interleaved with fields an amendment has no business touching. Extracting them would restructure
 * the live form for the sake of ~12 plain inputs. So they are re-declared here.
 *
 * What keeps that safe: every `name` below is the SAME payload key App.jsx writes, with the same
 * value shape (Yes/No strings, booleans, a dayjs date). If App.jsx renames one of these keys or
 * changes its shape, change it here too -- the keys are listed in docs/06.
 *   App.jsx "CONTACT INFO"     -> contactInfo.*
 *   App.jsx shipping block     -> doProductsNeedShipped, shippingContactAddress, otherShippingDetails
 *   App.jsx "Turnaround Time"  -> hardDueDate, dueDate, upchargedForRushTurnaround,
 *                                 discountsForExtendedTurnaround (E-133: one question)
 */
import React from "react";
import { Autocomplete, Box, Checkbox, FormControlLabel, FormLabel, TextField } from "@mui/material";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { EXTRA_WEEK_QUESTION, dueDateProblem, toYmd } from "../turnaround";
import ExtendedClosingDate from "../components/ExtendedClosingDate";
import { amendmentDatesOn } from "./closingMove";

const YesNo = ({ name, label }) => {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Autocomplete
          size="small"
          options={["Yes", "No"]}
          value={field.value || null}
          onChange={(_, v) => field.onChange(v)}
          renderInput={(params) => <TextField {...params} label={label} sx={{ mb: "0.8rem", mt: "5px" }} />}
        />
      )}
    />
  );
};

const Tick = ({ name, label }) => {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FormControlLabel
          sx={{ display: "block" }}
          control={<Checkbox checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />}
          label={label}
        />
      )}
    />
  );
};

const Text = ({ name, label, multiline }) => {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <TextField
          size="small"
          fullWidth
          multiline={!!multiline}
          rows={multiline ? 3 : undefined}
          label={label}
          value={field.value ?? ""}
          onChange={field.onChange}
          sx={{ mb: "1rem", mt: "5px" }}
        />
      )}
    />
  );
};

/*
 * E-150: with the switch on, these answers also move the Deal's Closing Date (closingMove.js), so a NEW due date must not be in the
 * past (an old one left as it was is fine), and the extra week gets the same calendar as onboarding. `originalDueDate` = as loaded.
 */
export const AmendDates = ({ originalDueDate, originalExtendedDate } = {}) => {
  const { control, setValue, getValues } = useFormContext();
  const hardDueDate = useWatch({ control, name: "hardDueDate" });
  const extraWeek = useWatch({ control, name: "discountsForExtendedTurnaround" });
  const datesOn = amendmentDatesOn();
  return (
    <Box>
      <YesNo name="hardDueDate" label="Hard Due Date?" />
      {hardDueDate === "Yes" && (
        <>
          <Box sx={{ mb: "1rem" }}>
            <FormLabel sx={{ mb: "10px", color: "black", display: "block" }}>Due Date</FormLabel>
            <Controller
              control={control}
              name="dueDate"
              rules={{
                validate: (v) =>
                  !datesOn || getValues("hardDueDate") !== "Yes" || (toYmd(v) && toYmd(v) === toYmd(originalDueDate)) || dueDateProblem(v) || true,
              }}
              render={({ field, fieldState }) => (
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                  {/* value must be a dayjs object or null -- toFormValues() guarantees that on prefill */}
                  <DatePicker
                    value={field.value ?? null}
                    onChange={field.onChange}
                    slotProps={{ textField: { size: "small", error: !!fieldState.error, helperText: fieldState.error ? fieldState.error.message || "Required" : undefined } }}
                  />
                </LocalizationProvider>
              )}
            />
          </Box>
          <Tick name="upchargedForRushTurnaround" label="Upcharged For Rush Turnaround Time?" />
        </>
      )}
      {/* E-133: the same one question as the onboarding form. */}
      {hardDueDate === "No" && <YesNo name="discountsForExtendedTurnaround" label={EXTRA_WEEK_QUESTION} />}
      {datesOn && hardDueDate === "No" && extraWeek === "Yes" && (
        <ExtendedClosingDate control={control} setValue={setValue} getValues={getValues} keep={originalExtendedDate} />
      )}
      {datesOn && (
        <FormLabel sx={{ display: "block", color: "text.secondary", fontSize: "0.85rem" }}>
          A new due date (or extended date) also becomes the Deal's Closing Date when you save.
        </FormLabel>
      )}
    </Box>
  );
};

export const AmendContact = () => {
  const { control } = useFormContext();
  const ships = useWatch({ control, name: "doProductsNeedShipped" });
  return (
    <Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 1 }}>
        <Text name="contactInfo.Contact_Name" label="Contact Name" />
        <Text name="contactInfo.Contact_Phone" label="Contact Phone" />
        <Text name="contactInfo.Contact_Email" label="Contact Email" />
        <Text name="contactInfo.Sales_Person" label="Sales Person" />
      </Box>
      <YesNo name="doProductsNeedShipped" label="Do Products Need Shipped?" />
      {ships === "Yes" && (
        <>
          <Text name="shippingContactAddress" label="Shipping Contact & Address" multiline />
          <Text name="otherShippingDetails" label="Other Shipping Details" multiline />
        </>
      )}
    </Box>
  );
};
