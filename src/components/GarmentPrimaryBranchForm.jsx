import {
  Autocomplete,
  Box,
  Checkbox,
  FormControlLabel,
  FormGroup,
  TextField,
  Typography,
} from "@mui/material";
import React, { useEffect } from "react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import GarmentSecondaryBranchForm from "./GarmentSecondaryBranchForm";

const GarmentPrimaryBranchForm = ({
  index,
  branchIndex,
  options,
  productName,
}) => {
  const { control } = useFormContext();

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
      </Typography>

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

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.countColorSize`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="countColorSize"
            variant="outlined"
            fullWidth
            label="Total Count, Colors & Sizes"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

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

      {secondaryBranches?.map((_, secBranchIndex) => (
        <GarmentSecondaryBranchForm
          key={`${index}-${branchIndex}-${secBranchIndex}`}
          index={index}
          branchIndex={branchIndex}
          secBranchIndex={secBranchIndex}
          options={options}
          productName={productName}
        />
      ))}

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.isUsedInOtherAppTypes`}
        defaultValue=""
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
