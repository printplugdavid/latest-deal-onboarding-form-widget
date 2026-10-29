import { React, useEffect } from "react";
import {
  Box,
  Checkbox,
  FormControlLabel,
  FormGroup,
  TextField,
  Typography,
} from "@mui/material";
import {
  Controller,
  useFormContext,
  useFieldArray,
  useWatch,
} from "react-hook-form";
import ColorsUsedField from "./ColorsUsedField";
import GraphicArt from "./GraphicArt";
import ProductSkuRows from "./ProductSkuRows";
import SqftCalculator from "./SqftCalculator";
import FontsField from "./FontsField";
import VendorsUsedField from "./VendorsUsedField";

const NonGarmentForm = ({ index }) => {
  const { control } = useFormContext();

  const numberOfGraphics = useWatch({
    control,
    name: `products.${index}.numberOfGraphics`,
  });

  const {
    fields: branches,
    append,
    remove,
  } = useFieldArray({
    control,
    name: `products.${index}.branches`,
  });

  // Auto adjust branches based on numberOfGraphics value
  useEffect(() => {
    const num = parseInt(numberOfGraphics);
    if (!isNaN(num) && num >= 0) {
      const currentLength = branches.length;

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
        Graphic Information
      </Typography>

      <Controller
        control={control}
        name={`products.${index}.numberOfGraphics`}
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

      {/* Branch Fields */}
      {branches.map((branch, branchIndex) => (
        <Box sx={{ width: "95%", mb: 2, float: "right" }} key={branch.id}>
          <Typography
            variant="p"
            sx={{
              pb: "1rem",
              fontSize: "0.9rem",
              fontWeight: "bold",
              display: "block",
            }}
          >
            {`Graphic ${branchIndex + 1}`}
          </Typography>

          <Controller
            control={control}
            name={`products.${index}.branches.${branchIndex}.graphicDescription`}
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
                sx={{ mt: "5px" }}
              />
            )}
          />

          {/* E-95: this graphic's own art file(s) and its colors, read from the file */}
          <Box sx={{ mt: "1rem" }}>
            <GraphicArt base={`products.${index}.branches.${branchIndex}`} productIndex={index} />
          </Box>

          <Box>
            <Controller
              name={`products.${index}.branches.${branchIndex}.isGraphicPrintReady`}
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
            name={`products.${index}.branches.${branchIndex}.numberOfColorsUsed`}
            defaultValue=""
            render={({ field }) => (
              <TextField
                id="numberOfColorsUsed"
                variant="outlined"
                size="small"
                fullWidth
                label="Number of Colors Used"
                {...field}
                sx={{ mt: "5px", mb: 1 }}
              />
            )}
          />

          <Controller
            control={control}
            name={`products.${index}.branches.${branchIndex}.colorsUsed`}
            defaultValue=""
            render={({ field }) => (
              // E-41: the same box, plus the shop's color chart for products that have one.
              <ColorsUsedField
                field={field}
                productIndex={index}
                countName={`products.${index}.branches.${branchIndex}.numberOfColorsUsed`}
                label="Colors Used"
                sx={{ mt: "5px", mb: 1 }}
              />
            )}
          />

          <Controller
            control={control}
            name={`products.${index}.branches.${branchIndex}.currentGraphicFormat`}
            defaultValue=""
            render={({ field }) => (
              <TextField
                id="currentGraphicFormat"
                variant="outlined"
                size="small"
                fullWidth
                label="Current Graphic Format"
                {...field}
                sx={{ mt: "5px" }}
              />
            )}
          />

          <Box>
            <Controller
              name={`products.${index}.branches.${branchIndex}.upchargedAcknowledged`}
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

          <FontsField name={`products.${index}.branches.${branchIndex}.fontsUsed`} />
        </Box>
      ))}

      <Typography
        variant="p"
        sx={{
          pb: "1rem",
          fontSize: "1rem",
          fontWeight: "bold",
          display: "block",
        }}
      >
        Quantity & Variables
      </Typography>

      <Controller
        control={control}
        name={`products.${index}.quantityOrdered`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            id="quantityOrdered"
            variant="outlined"
            size="small"
            fullWidth
            label="Quantity Ordered"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Controller
        control={control}
        name={`products.${index}.dimensions`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            id="dimensions"
            variant="outlined"
            size="small"
            fullWidth
            label="Dimensions"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Controller
        control={control}
        name={`products.${index}.numberOfSides`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            id="numberOfSides"
            variant="outlined"
            size="small"
            fullWidth
            label="# Of Sides"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Typography
        variant="p"
        sx={{
          pb: "1rem",
          fontSize: "1rem",
          fontWeight: "bold",
          display: "block",
        }}
      >
        Vendor Information
      </Typography>

      <Box>
        <Controller
          name={`products.${index}.isOutsourced`}
          control={control}
          defaultValue={false} // Set the default value of the checkbox
          render={({ field }) => (
            <FormGroup>
              <FormControlLabel
                control={<Checkbox {...field} checked={!!field.value} />}
                label="Is Outsourced?"
              />
            </FormGroup>
          )}
        />
      </Box>

      {/* E-113: a pick list of the Deal's vendors, filled from the product picked. */}
      <VendorsUsedField base={`products.${index}`} />

      {/* E-100: which Books product(s) this line is, picked or added through the New Product form. */}
      <ProductSkuRows basePath={`products.${index}.productSkus`} />
      {/* E-156: square-foot items (decals, stencils, custom banner) get the calculator. */}
      <SqftCalculator index={index} />

      <Controller
        control={control}
        name={`products.${index}.specialInstructions`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="specialInstructions"
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

export default NonGarmentForm;
