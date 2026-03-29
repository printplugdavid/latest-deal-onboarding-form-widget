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
import GarmentTartiaryBranch from "./GarmentTartiaryBranch";

const GarmentSecondaryBranchForm = ({
  index,
  branchIndex,
  secBranchIndex,
  options,
  productName,
}) => {
  const { control } = useFormContext();

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

  useEffect(() => {
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
                control={<Checkbox {...field} />}
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
                  control={<Checkbox {...field} />}
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
                control={<Checkbox {...field} />}
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
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
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
            label="Number of Placements"
            type="number"
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {tartiaryBranches?.map((_, tarBranchIndex) => (
        <GarmentTartiaryBranch
          key={`${index}-${branchIndex}-${secBranchIndex}-${tarBranchIndex}`}
          index={index}
          branchIndex={branchIndex}
          secBranchIndex={secBranchIndex}
          tarBranchIndex={tarBranchIndex}
          options={options}
          productName={productName}
        />
      ))}
    </Box>
  );
};

export default GarmentSecondaryBranchForm;
