import React, { useEffect } from "react";
import { Autocomplete, Box, TextField, Typography } from "@mui/material";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import GarmentPrimaryBranchForm from "./GarmentPrimaryBranchForm";

const GarmentForm = ({ index, options, productName }) => {
  const { control } = useFormContext();

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
        />
      ))}

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
