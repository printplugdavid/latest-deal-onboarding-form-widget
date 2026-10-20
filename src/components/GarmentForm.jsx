import React, { useContext, useEffect } from "react";
import { Autocomplete, Box, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import GarmentPrimaryBranchForm from "./GarmentPrimaryBranchForm";
import { splitCopy, splitInfo } from "../garmentSplit";
import { CLIENT_OWNED, isClientOwnedSku, upchargeLabel } from "../products/clientOwned";
import { StrictEntry } from "./strictEntry";

const GarmentForm = ({ index, options, productName }) => {
  const { control, getValues, setValue } = useFormContext();

  const numberOfGarmentTypes = useWatch({
    control,
    name: `products.${index}.numberOfGarmentTypes`,
  });

  const {
    fields: primaryBranches,
    append,
    remove,
  } = useFieldArray({
    control,
    name: `products.${index}.primaryBranches`,
  });

  // Auto adjust branches based on numberOfGraphics value
  useEffect(() => {
    const num = parseInt(numberOfGarmentTypes);
    if (!isNaN(num) && num >= 0) {
      const currentLength = primaryBranches.length;

      if (num > currentLength) {
        for (let i = currentLength; i < num; i++) {
          append({ name: "" });
        }
      } else if (num < currentLength) {
        for (let i = currentLength - 1; i >= num; i--) {
          remove(i);
        }
      }
    }
  }, [numberOfGarmentTypes]);

  // E-58: "Split this garment type". Ticking it adds a COPY of the garment type as the next garment
  // (see garmentSplit.js); the count below is raised with it so the effect above has nothing to do.
  // Un-ticking removes the copy the same way the form always removes a garment: one fewer, from the end.
  const garmentValues = useWatch({
    control,
    name: `products.${index}.primaryBranches`,
  });
  const splitGarment = (branchIndex) => {
    const source = getValues(`products.${index}.primaryBranches.${branchIndex}`);
    append(splitCopy(source, branchIndex + 1));
    setValue(`products.${index}.numberOfGarmentTypes`, String(primaryBranches.length + 1));
  };
  const undoSplit = () => {
    setValue(`products.${index}.numberOfGarmentTypes`, String(Math.max(0, primaryBranches.length - 1)));
  };

  // E-101 / D-49: "Client provided garments" -- the client brings every garment type of this product. Each one gets the
  // client-owned SKU (PPCO) and "Client Owned" in Vendors Used; its own details (type, kind, sizes, graphics) are filled in as usual.
  const strict = useContext(StrictEntry);
  const clientProvided = useWatch({ control, name: `products.${index}.clientProvided` });
  const branchPath = (b) => `products.${index}.primaryBranches.${b}`;
  const markClientOwned = (b) => {
    const rows = getValues(`${branchPath(b)}.garmentSkus`) || [];
    if (rows.some((r) => isClientOwnedSku(r && r.sku))) return;
    setValue(`${branchPath(b)}.garmentSkus`, [{ sku: CLIENT_OWNED.sku, productId: "", productName: CLIENT_OWNED.name, productSource: "clientOwned" }]);
    setValue(`${branchPath(b)}.numberOfSkus`, "1");
    if (!String(getValues(`${branchPath(b)}.vendorsUsed`) || "").trim()) setValue(`${branchPath(b)}.vendorsUsed`, CLIENT_OWNED.vendorsUsed);
  };
  const unmarkClientOwned = (b) => {
    const rows = (getValues(`${branchPath(b)}.garmentSkus`) || []).filter((r) => !isClientOwnedSku(r && r.sku));
    setValue(`${branchPath(b)}.garmentSkus`, rows);
    setValue(`${branchPath(b)}.numberOfSkus`, rows.length ? String(rows.length) : "");
    if (getValues(`${branchPath(b)}.vendorsUsed`) === CLIENT_OWNED.vendorsUsed) setValue(`${branchPath(b)}.vendorsUsed`, "");
  };
  // A garment type added while it is ticked is client-provided too.
  useEffect(() => {
    if (clientProvided) primaryBranches.forEach((_, b) => markClientOwned(b));
  }, [clientProvided, primaryBranches.length]);

  return (
    <Box sx={{ width: "100%" }}>
      <Typography
        variant="p"
        sx={{
          pb: "1rem",
          fontSize: "1rem",
          fontWeight: "bold",
          display: "block",
        }}
      >
        Garment & Graphic Information
      </Typography>

      <Controller
        control={control}
        name={`products.${index}.clientProvided`}
        defaultValue={false}
        render={({ field }) => (
          <FormControlLabel
            control={
              <Checkbox
                checked={!!field.value}
                onChange={(e) => {
                  field.onChange(e.target.checked);
                  if (!e.target.checked) primaryBranches.forEach((_, b) => unmarkClientOwned(b));
                }}
              />
            }
            label={`Client provided garments (the client brings every garment type below; SKU ${CLIENT_OWNED.sku})`}
            sx={{ display: "block", mb: "0.5rem" }}
          />
        )}
      />

      {clientProvided && (
        <Controller
          control={control}
          name={`products.${index}.clientOwnedUpcharge`}
          defaultValue=""
          rules={{ validate: (v) => !strict || !clientProvided || !!v || "Say whether the upcharge was added" }}
          render={({ field, fieldState }) => (
            <TextField
              select
              size="small"
              fullWidth
              label={upchargeLabel() + (strict ? " *" : "")}
              {...field}
              onChange={(e) => {
                field.onChange(e.target.value);
                setValue(`products.${index}.clientOwnedUpchargePercent`, CLIENT_OWNED.upchargePercent);
              }}
              error={!!fieldState.error}
              helperText={fieldState.error ? fieldState.error.message : "One answer for this product's garments. No = waived for this order"}
              sx={{ mb: "1rem", mt: "5px" }}
            >
              <MenuItem value="Yes">Yes</MenuItem>
              <MenuItem value="No">No (waived)</MenuItem>
            </TextField>
          )}
        />
      )}

      <Controller
        control={control}
        name={`products.${index}.numberOfGarmentTypes`}
        defaultValue=""
        rules={{
          validate: (value) => {
            if (value === "") return true;
            return parseInt(value) >= 0 || "Must be 0 or more";
          },
        }}
        render={({ field, fieldState }) => (
          <TextField
            {...field}
            id="numberOfGarmentTypes"
            variant="outlined"
            size="small"
            fullWidth
            label="Number of Garment Types"
            type="number"
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {primaryBranches.map((_, branchIndex) => (
        <GarmentPrimaryBranchForm
          key={`${index}-${branchIndex}`}
          index={index}
          branchIndex={branchIndex}
          options={options}
          productName={productName}
          split={splitInfo(garmentValues, branchIndex)}
          onSplit={() => splitGarment(branchIndex)}
          onUndoSplit={undoSplit}
        />
      ))}

      {productName === "Screen Printing" && (
        <Controller
          control={control}
          name={`products.${index}.premiumIronPass`}
          defaultValue={"No"}
          render={({ field }) => (
            <Autocomplete
              {...field}
              options={["Yes", "No"]}
              value={field.value || ""}
              onChange={(_, newValue) => field.onChange(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Premium Iron Pass?"
                  variant="outlined"
                  size="small"
                  fullWidth
                  sx={{ mb: "1rem", mt: "5px" }}
                />
              )}
            />
          )}
        />
      )}

      <Controller
        control={control}
        name={`products.${index}.otherInformation`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="otherInformation"
            variant="outlined"
            fullWidth
            label="Other Information"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />
    </Box>
  );
};

export default GarmentForm;
