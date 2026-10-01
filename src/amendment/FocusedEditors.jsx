/*
 * FocusedEditors.jsx -- only the fields for the change the agent ticked (David, 2026-10-01:
 * "select issue, select product, then select garment, then only the fields specific to those
 * updates should populate").
 *
 * Each editor binds to the SAME field names the onboarding form's GarmentPrimaryBranchForm uses,
 * so the payload is identical whichever way a value was edited. The graphics editor mounts the
 * onboarding form's own GarmentSecondaryBranchForm (imported, not copied -- D-24). "Show every
 * field" in AmendmentApp mounts the whole GarmentPrimaryBranchForm as the escape hatch.
 */
import React from "react";
import { Alert, Box, TextField, Typography } from "@mui/material";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import SizeRowsField from "../components/SizeRowsField";
import GarmentSecondaryBranchForm from "../components/GarmentSecondaryBranchForm";
import { checkGarmentQuantity } from "../quantityCheck";

const base = (p, g) => `products.${p}.primaryBranches.${g}`;

const Heading = ({ children }) => (
  <Typography variant="body2" fontWeight="bold" sx={{ mt: 2, mb: 1, color: "#555" }}>
    {children}
  </Typography>
);

export const QuantityEditor = ({ p, g }) => {
  const { control } = useFormContext();
  const qty = useWatch({ control, name: `${base(p, g)}.garmentQuantity` });
  const sizes = useWatch({ control, name: `${base(p, g)}.countColorSize` });
  let warning = null;
  try {
    warning = checkGarmentQuantity(sizes, qty);
  } catch (e) {
    warning = null;
  }
  return (
    <Box>
      <Heading>Quantity / sizes</Heading>
      <Controller
        control={control}
        name={`${base(p, g)}.garmentQuantity`}
        render={({ field }) => (
          <TextField
            size="small"
            fullWidth
            type="number"
            label="Total Garment Quantity"
            value={field.value ?? ""}
            onChange={field.onChange}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />
      <Controller
        control={control}
        name={`${base(p, g)}.countColorSize`}
        render={({ field }) => <SizeRowsField value={field.value} onChange={field.onChange} />}
      />
      {warning?.message && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {warning.message}
        </Alert>
      )}
    </Box>
  );
};

export const GarmentSwapEditor = ({ p, g }) => {
  const { control } = useFormContext();
  const text = (name, label, rows) => (
    <Controller
      control={control}
      name={`${base(p, g)}.${name}`}
      render={({ field }) => (
        <TextField
          size="small"
          fullWidth
          multiline
          rows={rows}
          label={label}
          value={field.value ?? ""}
          onChange={field.onChange}
          sx={{ mb: "1rem", mt: "5px" }}
        />
      )}
    />
  );
  return (
    <Box>
      <Heading>Garment</Heading>
      {text("garmentType", "Garment Type (Brand / Style)", 2)}
      {text("vendorsUsed", "Vendors Used (add the new vendor — the original is kept)", 2)}
    </Box>
  );
};

export const GraphicsEditor = ({ p, g, options, productName }) => {
  const { control } = useFormContext();
  const graphics = useWatch({ control, name: `${base(p, g)}.secondaryBranches` }) || [];
  return (
    <Box>
      <Heading>Graphics and placements</Heading>
      {graphics.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          This garment has no graphics recorded. Use "Show every field" to add one.
        </Typography>
      )}
      {graphics.map((_, s) => (
        <GarmentSecondaryBranchForm
          key={`${p}-${g}-${s}`}
          index={p}
          branchIndex={g}
          secBranchIndex={s}
          options={options}
          productName={productName}
        />
      ))}
    </Box>
  );
};
