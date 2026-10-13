import React, { useEffect } from "react";
import { Autocomplete, Box, TextField, Typography } from "@mui/material";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import GarmentPrimaryBranchForm from "./GarmentPrimaryBranchForm";
import { splitCopy, splitInfo } from "../garmentSplit";

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
