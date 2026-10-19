import {
  Alert,
  Autocomplete,
  Box,
  Checkbox,
  FormControlLabel,
  FormGroup,
  TextField,
  Typography,
} from "@mui/material";
import React, { useContext, useEffect } from "react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import GarmentSecondaryBranchForm from "./GarmentSecondaryBranchForm";
import SizeRowsField from "./SizeRowsField";
import { styleOptionsFor } from "../sizeRows";
import { checkGarmentQuantity } from "../quantityCheck";
import LumpedGuard from "./LumpedGuard";
import { ON_GARMENT, SPLIT_LABEL } from "../garmentSplit";
import { GARMENT_KINDS, canonicalKind } from "../placements";
import { StrictEntry } from "./strictEntry";

const GarmentPrimaryBranchForm = ({
  index,
  branchIndex,
  options,
  productName,
  split,
  onSplit,
  onUndoSplit,
}) => {
  const { control } = useFormContext();
  const strict = useContext(StrictEntry); // E-74: the onboarding form requires the Garment kind
  // E-58: this garment is part of a split when it has copies or is one (garmentSplit.splitInfo).
  const inSplit = !!split && split.group.length > 1;
  const hasCopies = !!split && split.copies.length > 0;
  const graphicTicks = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.secondaryBranches`,
  });

  const isUsedInOtherAppTypes = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.isUsedInOtherAppTypes`,
  });

  options = options?.map((option) => option?.split("#")?.[0]);

  const numberOfGraphics = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.numberOfGraphics`,
  });

  const {
    fields: secondaryBranches,
    append,
    remove,
  } = useFieldArray({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.secondaryBranches`,
  });

  // Auto adjust branches based on numberOfGraphics value
  useEffect(() => {
    const num = parseInt(numberOfGraphics);
    if (!isNaN(num) && num >= 0) {
      const currentLength = secondaryBranches.length;

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
  }, [numberOfGraphics]);

  // The size breakdown is free text and the quantity below drives every print count, so nothing
  // reconciled them until now. Warn live; never block -- see quantityCheck.js.
  const countColorSize = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.countColorSize`,
  });

  const garmentQuantity = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.garmentQuantity`,
  });

  const quantityWarning = checkGarmentQuantity(countColorSize, garmentQuantity);

  // E-57: the styles / codes this garment type lists, offered on each size line so a color and its
  // sizes say which garment they are.
  const garmentTypeText = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.garmentType`,
  });
  const garmentSkuValues = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.garmentSkus`,
  });

  const numberOfSkus = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.numberOfSkus`,
  });

  const {
    fields: garmentSkus,
    append: appendSku,
    remove: removeSku,
  } = useFieldArray({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.garmentSkus`,
  });

  // Auto adjust SKU rows based on numberOfSkus value
  useEffect(() => {
    const num = parseInt(numberOfSkus);
    if (!isNaN(num) && num >= 0) {
      const currentLength = garmentSkus.length;

      if (num > currentLength) {
        for (let i = currentLength; i < num; i++) {
          appendSku({ sku: "" });
        }
      } else if (num < currentLength) {
        for (let i = currentLength - 1; i >= num; i--) {
          removeSku(i);
        }
      }
    }
  }, [numberOfSkus]);

  return (
    <Box
      sx={{
        width: "95%",
        mb: 2,
        float: "right",
      }}
      key={`${index}-${branchIndex}`}
    >
      <Typography
        variant="p"
        sx={{
          pb: "1rem",
          fontSize: "0.9rem",
          fontWeight: "bold",
          display: "block",
        }}
      >
        {`Garment ${branchIndex + 1}`}
        {split && split.splitOf ? ` — split from Garment ${split.splitOf}` : ""}
      </Typography>

      {/* E-58: always here, on every garment type -- the rep ticks it, nothing is inferred. */}
      <FormGroup sx={{ mb: inSplit ? 0 : "0.5rem" }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={hasCopies}
              disabled={hasCopies && !split.canUndo}
              onChange={(e) => (e.target.checked ? onSplit && onSplit() : onUndoSplit && onUndoSplit())}
            />
          }
          label={SPLIT_LABEL}
        />
      </FormGroup>
      {inSplit && (
        <Alert severity="info" sx={{ mb: "1rem" }}>
          {`Garments ${split.group.join(" and ")} are one garment type, split. Give each its own quantity and sizes, and untick any graphic a garment does not get. Together: ${split.quantities.join(" + ")} = ${split.total} garment${split.total === 1 ? "" : "s"}.`}
          {hasCopies && !split.canUndo ? " To undo the split, lower Number of Garment Types (the copy must be the last garment)." : ""}
        </Alert>
      )}

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.garmentType`}
        defaultValue={""}
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="garmentType"
            variant="outlined"
            fullWidth
            label="Garment Type (Brand / Style)"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {/* E-74: what kind of garment it is -- picked, so each placement offers only the spots that garment has. */}
      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.garmentKind`}
        defaultValue=""
        rules={{ validate: (v) => !strict || !!v || "Pick the garment kind" }}
        render={({ field, fieldState }) => (
          <Autocomplete
            options={GARMENT_KINDS}
            autoHighlight
            openOnFocus
            value={canonicalKind(field.value) || null}
            onChange={(_, v) => field.onChange(v || "")}
            renderInput={(params) => (
              <TextField
                {...params}
                label={strict ? "Garment Kind *" : "Garment Kind"}
                size="small"
                inputRef={field.ref}
                error={!!fieldState.error}
                helperText={fieldState.error ? fieldState.error.message : "Sets which placements are offered below"}
              />
            )}
            sx={{ mb: "1rem" }}
          />
        )}
      />

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.countColorSize`}
        defaultValue=""
        render={({ field }) => (
          // E-29: structured rows in, the SAME string out. See SizeRowsField.jsx.
          <SizeRowsField value={field.value} onChange={field.onChange} styleOptions={styleOptionsFor(garmentTypeText, garmentSkuValues)} />
        )}
      />

      {quantityWarning && (
        <Alert severity="warning" sx={{ mb: "1rem" }}>
          {quantityWarning.message}
        </Alert>
      )}

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.numberOfSkus`}
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
            id="numberOfSkus"
            variant="outlined"
            size="small"
            fullWidth
            label="Number of SKUs"
            type="number"
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {garmentSkus?.map((_, skuIndex) => (
        <Controller
          key={`${index}-${branchIndex}-sku-${skuIndex}`}
          control={control}
          name={`products.${index}.primaryBranches.${branchIndex}.garmentSkus.${skuIndex}.sku`}
          defaultValue=""
          render={({ field }) => (
            <TextField
              size="small"
              variant="outlined"
              fullWidth
              label={`SKU ${skuIndex + 1}`}
              {...field}
              sx={{ mb: "1rem", mt: "5px" }}
            />
          )}
        />
      ))}

      <Typography
        variant="p"
        sx={{
          pb: "1rem",
          fontSize: "0.8rem",
          fontWeight: "bold",
          display: "block",
        }}
      >
        Graphic & Placement Information
      </Typography>

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.numberOfGraphics`}
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
            id="numberOfGraphics"
            variant="outlined"
            size="small"
            fullWidth
            label="Number of Graphics"
            type="number"
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {/* E-42: several styles/colors AND several graphics -> ask if every graphic is on every garment. */}
      <LumpedGuard index={index} branchIndex={branchIndex} />

      {secondaryBranches?.map((_, secBranchIndex) => {
        const off = inSplit && graphicTicks?.[secBranchIndex]?.[ON_GARMENT] === false;
        return (
          // display flow-root: GarmentSecondaryBranchForm floats right, so without it the NEXT graphic's tick
          // (E-58) slid up into the gap beside this graphic and overlapped its heading (David's screenshot, 10-15).
          <Box key={`${index}-${branchIndex}-${secBranchIndex}`} sx={{ display: "flow-root" }}>
            {/* E-58: in a split, each graphic has its own tick for this garment. Unticked = left out
                of this garment when the form is submitted (garmentSplit.applyGarmentSplits). */}
            {inSplit && (
              <Controller
                control={control}
                name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.${ON_GARMENT}`}
                defaultValue={true}
                render={({ field }) => (
                  <FormGroup sx={{ ml: "5%" }}>
                    <FormControlLabel
                      control={<Checkbox checked={field.value !== false} onChange={(e) => field.onChange(e.target.checked)} />}
                      label={
                        field.value !== false
                          ? `Garment ${branchIndex + 1} gets Graphic ${secBranchIndex + 1}`
                          : `Garment ${branchIndex + 1} does NOT get Graphic ${secBranchIndex + 1} — it is left out of this garment's count, note and card`
                      }
                    />
                  </FormGroup>
                )}
              />
            )}
            <Box sx={off ? { opacity: 0.35, pointerEvents: "none" } : undefined}>
              <GarmentSecondaryBranchForm
                index={index}
                branchIndex={branchIndex}
                secBranchIndex={secBranchIndex}
                options={options}
                productName={productName}
              />
            </Box>
          </Box>
        );
      })}

<Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.garmentQuantity`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            size="small"
            variant="outlined"
            fullWidth
            label="Total Garment Quantity"
            type="number"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

            <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.isUsedInOtherAppTypes`}
        defaultValue={"No"}
        render={({ field }) => (
          <Autocomplete
            {...field}
            options={["Yes", "No"]}
            value={field.value || ""}
            onChange={(e, newValue) => field.onChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Is This Garment Used With Other Application Types?"
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />

      {isUsedInOtherAppTypes === "Yes" && (
        <Controller
          control={control}
          name={`products.${index}.primaryBranches.${branchIndex}.chooseApplicationType`}
          defaultValue={productName}
          render={({ field }) => (
            <Autocomplete
              {...field}
              options={options}
              value={field.value || ""}
              onChange={(e, newValue) => field.onChange(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Please Choose Application Type"
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
        name={`products.${index}.primaryBranches.${branchIndex}.vendorsUsed`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            size="small"
            id="vendorsUsed"
            variant="outlined"
            fullWidth
            label="Vendors Used"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.specialInstructions`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="specialInstructions"
            variant="outlined"
            fullWidth
            label="Special Instructions / Considerations"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />
    </Box>
  );
};

export default GarmentPrimaryBranchForm;
