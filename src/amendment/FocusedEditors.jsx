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
import { Alert, Box, Button, TextField, Typography } from "@mui/material";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import SizeRowsField from "../components/SizeRowsField";
import GarmentSecondaryBranchForm from "../components/GarmentSecondaryBranchForm";
import LumpedGuard from "../components/LumpedGuard";
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

/*
 * Adding a placement or a graphic (David, 2026-10-05: "the Amendment Form does not have
 * functionality to add placements to garments?"). It always could -- raising "Number of Placements"
 * inside a graphic adds a row -- but nothing said so, and a whole new graphic needed "Show every
 * field". These buttons do the same thing the number boxes do, in plain sight:
 *   - a placement: since E-40 the "+ Add placement" button lives inside the graphic itself
 *     (GarmentSecondaryBranchForm), shared with the onboarding form.
 *   - a graphic: GarmentPrimaryBranchForm is NOT mounted here, so its numberOfGraphics watcher is
 *     not running -- append the row and set the count together, as addGarment() does one level up.
 */
export const GraphicsEditor = ({ p, g, options, productName }) => {
  const { control, getValues, setValue } = useFormContext();
  const graphics = useWatch({ control, name: `${base(p, g)}.secondaryBranches` }) || [];
  const addGraphic = () => {
    const path = `${base(p, g)}.secondaryBranches`;
    const cur = getValues(path) || [];
    // A new graphic starts with ONE placement row open: "another print somewhere else on this
    // garment" is a graphic plus where it goes, and an empty graphic with no placement counts 0.
    setValue(path, [...cur, { name: "", numberOfPlacements: "1" }], { shouldDirty: true });
    setValue(`${base(p, g)}.numberOfGraphics`, String(cur.length + 1), { shouldDirty: true });
  };
  return (
    <Box>
      <Heading>Graphics and placements</Heading>
      <LumpedGuard index={p} branchIndex={g} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        A different design going somewhere else on this garment (a new back print, a sleeve logo)? Use{" "}
        <b>Add another print to this garment</b> at the bottom. The same design in one more spot? Use{" "}
        <b>+ Add placement</b> inside that graphic.
      </Typography>
      {graphics.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          This garment has no graphics recorded yet.
        </Typography>
      )}
      {graphics.map((_, s) => (
        <Box key={`${p}-${g}-${s}`} sx={{ overflow: "auto", mb: 1 }}>
          <GarmentSecondaryBranchForm
            index={p}
            branchIndex={g}
            secBranchIndex={s}
            options={options}
            productName={productName}
          />
        </Box>
      ))}
      <Button size="small" variant="contained" onClick={addGraphic} sx={{ mt: 1 }}>
        + Add another print to this garment (new graphic + placement)
      </Button>
    </Box>
  );
};
