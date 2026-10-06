import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  TextField,
  Typography,
} from "@mui/material";
import React, { useEffect, useRef } from "react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import GarmentTartiaryBranch from "./GarmentTartiaryBranch";

const GarmentSecondaryBranchForm = ({
  index,
  branchIndex,
  secBranchIndex,
  options,
  productName,
}) => {
  const { control, setValue } = useFormContext();

  const colorChange = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.colorChange`,
  });

  const fineDetail = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.fineDetail`,
  });

  const numberOfPlacements = useWatch({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.numberOfPlacements`,
  });

  const {
    fields: tartiaryBranches,
    append,
    remove,
  } = useFieldArray({
    control,
    name: `products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.tartiaryBranches`,
  });

  // E-40: "How many placements?" drives the rows (type 3 -> three lines); the + and X buttons
  // change the rows and set the number to match. When X removes a row from the MIDDLE, the
  // number-follows-rows sync below must not also trim the last row -- hence the one-shot skip.
  const skipSyncFor = useRef(null);
  const placementsPath = `products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.numberOfPlacements`;
  const addPlacementRow = () =>
    setValue(placementsPath, String(tartiaryBranches.length + 1), { shouldDirty: true });
  const removePlacementRow = (i) => {
    const next = String(tartiaryBranches.length - 1);
    skipSyncFor.current = next;
    remove(i);
    setValue(placementsPath, next, { shouldDirty: true });
  };

  useEffect(() => {
    if (skipSyncFor.current !== null && String(numberOfPlacements) === skipSyncFor.current) {
      skipSyncFor.current = null;
      return;
    }
    skipSyncFor.current = null;
    const num = parseInt(numberOfPlacements);
    if (!isNaN(num) && num >= 0) {
      const currentLength = tartiaryBranches.length;

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
  }, [numberOfPlacements]);

  return (
    <Box sx={{ width: "95%", mb: 2, float: "right" }}>
      <Typography
        variant="p"
        sx={{
          pb: "1rem",
          fontSize: "0.9rem",
          fontWeight: "bold",
          display: "block",
        }}
      >
        {`Graphic ${secBranchIndex + 1}`}
      </Typography>

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.graphicDescription`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="graphicDescription"
            variant="outlined"
            fullWidth
            label="Graphic Description"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Box>
        <Controller
          name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.isGraphicPrintReady`}
          control={control}
          defaultValue={false} // Set the default value of the checkbox
          render={({ field }) => (
            <FormGroup>
              <FormControlLabel
                control={<Checkbox {...field} checked={!!field.value} />}
                label="Is Graphic Print Ready?"
              />
            </FormGroup>
          )}
        />
      </Box>

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.currentGraphicFormat`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            size="small"
            id="currentGraphicFormat"
            variant="outlined"
            fullWidth
            label="Current Graphic Format"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {/* adding new option */}
      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.fineDetail`}
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
                label="Fine Detail?"
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />

      {fineDetail === "Yes" && (
        <Box>
          <Controller
            name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.specialtyThread`}
            control={control}
            defaultValue={false} // Set the default value of the checkbox
            render={({ field }) => (
              <FormGroup>
                <FormControlLabel
                  control={<Checkbox {...field} checked={!!field.value} />}
                  label="Depending on current inventory, embroidery jobs with fine detail incur an upcharge for specialty thread"
                />
              </FormGroup>
            )}
          />
        </Box>
      )}

      <Box>
        <Controller
          name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.upchargeAcknowledged`}
          control={control}
          defaultValue={false} // Set the default value of the checkbox
          render={({ field }) => (
            <FormGroup>
              <FormControlLabel
                control={<Checkbox {...field} checked={!!field.value} />}
                label="Upcharge Acknowledged?"
              />
            </FormGroup>
          )}
        />
      </Box>

        <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.numberOfColorsUsed`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            size="small"
            id="numberOfColorsUsed"
            variant="outlined"
            fullWidth
            label="Number Of Colors Used"
            type="number"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.underbase`}
        defaultValue=""
        render={({ field }) => (
          <Autocomplete
            {...field}
            options={["None", "Single-pass", "Double-pass", "Triple-pass"]}
            value={field.value || ""}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Underbase Needed?"
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />
      
      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.colorsUsed`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="colorsUsed"
            variant="outlined"
            fullWidth
            label="Colors Used (Threads / PANTONES)"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.colorChange`}
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
                label="Color Change?"
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />

      {colorChange === "Yes" && (
        <Controller
          control={control}
          name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.detailsOfColorChange`}
          defaultValue=""
          render={({ field }) => (
            <TextField
              multiline
              rows={3}
              size="small"
              id="detailsOfColorChange"
              variant="outlined"
              fullWidth
              label="Please Provide Details Of Color Change"
              {...field}
              sx={{ mb: "1rem", mt: "5px" }}
            />
          )}
        />
      )}

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.fontsUsed`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="fontsUsed"
            variant="outlined"
            fullWidth
            label="Fonts Used"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.numberOfPlacements`}
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
            id="numberOfPlacements"
            variant="outlined"
            size="small"
            fullWidth
            label="How many placements?"
            type="number"
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {/* Keyed by the field array's own id, not the position: removing a row from the middle
          must not leave the next row showing the removed row's text (E-40). */}
      {tartiaryBranches?.map((placementField, tarBranchIndex) => (
        <GarmentTartiaryBranch
          key={placementField.id}
          index={index}
          branchIndex={branchIndex}
          secBranchIndex={secBranchIndex}
          tarBranchIndex={tarBranchIndex}
          options={options}
          productName={productName}
          onRemove={removePlacementRow}
        />
      ))}

      <Box sx={{ width: "95%", ml: "auto", mb: "0.5rem" }}>
        <Button size="small" variant="outlined" onClick={addPlacementRow}>
          + Add placement
        </Button>
      </Box>
    </Box>
  );
};

export default GarmentSecondaryBranchForm;
