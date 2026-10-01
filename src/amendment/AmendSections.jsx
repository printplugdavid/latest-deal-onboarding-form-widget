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
 *                                 discountsForExtendedTurnaround, addOneWeekToProductionTime,
 *                                 tenFourteenBusinessDayTurnaround
 */
import React from "react";
import { Autocomplete, Box, Checkbox, FormControlLabel, FormLabel, TextField } from "@mui/material";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

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

export const AmendDates = () => {
  const { control } = useFormContext();
  const hardDueDate = useWatch({ control, name: "hardDueDate" });
  const discounts = useWatch({ control, name: "discountsForExtendedTurnaround" });
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
              render={({ field }) => (
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                  {/* value must be a dayjs object or null -- toFormValues() guarantees that on prefill */}
                  <DatePicker value={field.value ?? null} onChange={field.onChange} slotProps={{ textField: { size: "small" } }} />
                </LocalizationProvider>
              )}
            />
          </Box>
          <Tick name="upchargedForRushTurnaround" label="Upcharged For Rush Turnaround Time?" />
        </>
      )}
      {hardDueDate === "No" && (
        <>
          <YesNo name="discountsForExtendedTurnaround" label="Discounts for Extended Turnaround Time?" />
          {discounts === "Yes" && <Tick name="addOneWeekToProductionTime" label="Add 1 Week To Production Time" />}
          {discounts === "No" && <Tick name="tenFourteenBusinessDayTurnaround" label="10-14 Business Day Turnaround" />}
        </>
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
