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
import { checkGarmentQuantity, quantityFromSizes } from "../quantityCheck";
import LumpedGuard from "./LumpedGuard";
import { ON_GARMENT, SPLIT_LABEL } from "../garmentSplit";
import { GARMENT_KINDS, canonicalKind } from "../placements";
import { StrictEntry } from "./strictEntry";
import ProductSkuField from "./ProductSkuField";
import GarmentProductPick from "./GarmentProductPick";
import VendorsUsedField, { setVendors } from "./VendorsUsedField";
import { vendorsOf } from "../products/vendors";
import { CLIENT_OWNED, isClientOwnedGarment, isClientOwnedSku } from "../products/clientOwned";

const GarmentPrimaryBranchForm = ({
  index,
  branchIndex,
  options,
  productName,
  split,
  onSplit,
  onUndoSplit,
}) => {
  const { control, getValues, setValue } = useFormContext();
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

  // E-101: "Client provided" -- the client brings THIS garment type: its SKU becomes PPCO; its details are filled in as usual.
  // Other garment types of the same product can still be garments we order.
  const branchPath = `products.${index}.primaryBranches.${branchIndex}`;
  const setClientProvided = (on) => {
    const rows = (getValues(`${branchPath}.garmentSkus`) || []).filter((r) => !isClientOwnedSku(r && r.sku));
    const next = on ? [{ sku: CLIENT_OWNED.sku, productId: "", productName: CLIENT_OWNED.name, productSource: "clientOwned" }] : rows;
    setValue(`${branchPath}.garmentSkus`, next);
    setValue(`${branchPath}.numberOfSkus`, next.length ? String(next.length) : "");
    // E-113: Vendors Used is a list now (VendorsUsedField); "Client Owned" fills an empty one and goes again when unticked.
    const vendors = vendorsOf({ vendorsList: getValues(`${branchPath}.vendorsList`), vendorsUsed: getValues(`${branchPath}.vendorsUsed`) });
    if (on && !vendors.length) setVendors(setValue, branchPath, [CLIENT_OWNED.vendorsUsed]);
    if (!on && vendors.length === 1 && vendors[0] === CLIENT_OWNED.vendorsUsed) setVendors(setValue, branchPath, []);
  };

  // E-100: the garment kind proposes the Books category when a rep adds a new product from a SKU row.
  const garmentKindValue = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.garmentKind`,
  });

  const numberOfSkus = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.numberOfSkus`,
  });

  const {
    fields: garmentSkus,
    append: appendSku,
    remove: removeSku,
    replace: replaceSku,
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

      {/* E-104: start from the Books product -- fills type, kind and the size-band SKUs. */}
      <GarmentProductPick
        index={index}
        branchIndex={branchIndex}
        // E-179: the whole SKU list through the field array, so every SKU box shows what is really saved
        setSkus={(rows) => {
          replaceSku(rows);
          setValue(`products.${index}.primaryBranches.${branchIndex}.numberOfSkus`, String(rows.length));
        }}
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={isClientOwnedGarment({ garmentSkus: garmentSkuValues })}
            onChange={(e) => setClientProvided(e.target.checked)}
          />
        }
        label={`Client provided (the client brings this garment type; SKU ${CLIENT_OWNED.sku})`}
        sx={{ display: "block", mb: "0.5rem" }}
      />

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
          <SizeRowsField value={field.value} onChange={(text) => { field.onChange(text); /* E-112: the total follows the sizes (rep edits only) */ const q = quantityFromSizes(text); if (q) setValue(`products.${index}.primaryBranches.${branchIndex}.garmentQuantity`, String(q), { shouldDirty: true }); }} styleOptions={styleOptionsFor(garmentTypeText, garmentSkuValues)} />
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

      {/* E-100: each SKU is picked from the real Books / CRM products, or added through the New Product form. */}
      {garmentSkus?.map((_, skuIndex) => (
        <ProductSkuField
          // E-179: keyed by the saved code too, so a row whose code was replaced from outside shows the new code (it showed the old one)
          key={`${index}-${branchIndex}-sku-${skuIndex}-${String((garmentSkuValues && garmentSkuValues[skuIndex] && garmentSkuValues[skuIndex].sku) || "")}`}
          rowPath={`products.${index}.primaryBranches.${branchIndex}.garmentSkus.${skuIndex}`}
          label={`SKU ${skuIndex + 1}`}
          garmentKind={garmentKindValue}
          allowClientOwned
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
            helperText="Fills in from the sizes above. Change it only if the total really differs."
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

      {/* E-113: a pick list of the Deal's vendors, filled from the product picked. */}
      <VendorsUsedField base={`products.${index}.primaryBranches.${branchIndex}`} />

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
