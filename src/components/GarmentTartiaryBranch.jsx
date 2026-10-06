import { Autocomplete, Box, IconButton, TextField, Tooltip } from "@mui/material";
import React from "react";
import { Controller, useFormContext } from "react-hook-form";

/*
 * One placement = ONE ROW (E-40, 2026-10-06): location · dimensions · size · remove -- laid out
 * like the color / size rows, instead of three stacked full-width boxes per placement.
 *
 * ⚠️ LAYOUT ONLY. The three answers are saved under exactly the same names as before
 * (placementLocation, sizeAndDimensions, placementSize), so the note, the JSON, the production
 * cards, printMath and both note parsers see what they have always seen.
 *
 * Location offers the common spots but stays free text: anything typed is kept as typed.
 */
export const PLACEMENT_LOCATIONS = [
  "Left Chest",
  "Right Chest",
  "Center Chest",
  "Full Front",
  "Full Back",
  "Upper Back / Nape",
  "Lower Back",
  "Left Sleeve",
  "Right Sleeve",
  "Front of Hat",
  "Left Side of Hat",
  "Right Side of Hat",
  "Back of Hat",
];

const GarmentTartiaryBranch = ({
  index,
  branchIndex,
  secBranchIndex,
  tarBranchIndex,
  options,
  productName,
  onRemove,
}) => {
  const { control } = useFormContext();
  const base = `products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.tartiaryBranches.${tarBranchIndex}`;

  return (
    <Box
      sx={{
        width: "95%",
        ml: "auto",
        mb: "0.6rem",
        display: "flex",
        gap: "0.5rem",
        alignItems: "flex-start",
      }}
    >
      <Controller
        control={control}
        name={`${base}.placementLocation`}
        defaultValue=""
        render={({ field }) => (
          <Autocomplete
            freeSolo
            options={PLACEMENT_LOCATIONS}
            value={field.value || ""}
            onChange={(_, newValue) => field.onChange(newValue || "")}
            onInputChange={(_, newValue, reason) => {
              // "reset" is MUI echoing the current value back (on mount, after a pick) -- not the
              // agent typing. Ignoring it means opening a deal can never register as a change.
              if (reason !== "reset") field.onChange(newValue || "");
            }}
            sx={{ flex: "2 1 0", minWidth: 0 }}
            renderInput={(params) => (
              <TextField
                {...params}
                id="placementLocation"
                size="small"
                variant="outlined"
                label={`Placement ${tarBranchIndex + 1} - Location`}
                inputRef={field.ref}
              />
            )}
          />
        )}
      />

      <Controller
        control={control}
        name={`${base}.sizeAndDimensions`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            minRows={1}
            maxRows={4}
            size="small"
            id="sizeAndDimensions"
            variant="outlined"
            label="Size & Dimensions"
            {...field}
            sx={{ flex: "2 1 0", minWidth: 0 }}
          />
        )}
      />

      <Controller
        control={control}
        name={`${base}.placementSize`}
        defaultValue=""
        rules={{
          // Required on Embroidery only: the size drives the Small/Medium/Large Deal fields,
          // and a blank one is counted in the department total but in no size bucket.
          validate: (value) =>
            productName !== "Embroidery" || !!value || "Required for embroidery placements",
        }}
        render={({ field, fieldState }) => (
          <Autocomplete
            {...field}
            options={["Small", "Medium", "Large"]}
            value={field.value || ""}
            onChange={(_, newValue) => field.onChange(newValue)}
            sx={{ flex: "0 0 10.5rem" }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={
                  productName === "Embroidery"
                    ? "Placement Size *"
                    : "Placement Size"
                }
                variant="outlined"
                size="small"
                fullWidth
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
              />
            )}
          />
        )}
      />

      {onRemove && (
        <Tooltip title="Remove this placement">
          <IconButton
            aria-label={`Remove placement ${tarBranchIndex + 1}`}
            onClick={() => onRemove(tarBranchIndex)}
            sx={{ mt: "2px" }}
          >
            ✕
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export default GarmentTartiaryBranch;
