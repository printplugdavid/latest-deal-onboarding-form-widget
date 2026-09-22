import { React, useEffect } from "react";
import {
  Alert,
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
import { estimateGangSheet, GANG_GAP_INCHES } from "../gangSheet";

/*
 * DTF Gang Sheet -- print-only DTF work, product type "gangsheet" (products org variable:
 * "DTF Gang Sheet#gangsheet").
 *
 * Why it exists: DTF was only sellable as a garment product, so a prints-only order was onboarded
 * with 0 garment types, the count engine had nothing to iterate, and a real 40-print order booked as
 * 0 prints (docs 12 sec 4 / E-15). Here the count is COMPUTED from the sheet and graphic sizes --
 * see gangSheet.js -- and shown live so a wrong number is visible before submit.
 *
 * Sizes are plain number fields on purpose (D-13): they become dropdowns once the real sheet sizes
 * settle.
 */
const DtfGangSheetForm = ({ index }) => {
  const { control } = useFormContext();

  const numberOfGraphics = useWatch({
    control,
    name: `products.${index}.numberOfGraphics`,
  });
  const sheetWidth = useWatch({ control, name: `products.${index}.gangSheetWidth` });
  const sheetHeight = useWatch({ control, name: `products.${index}.gangSheetHeight` });
  const sheets = useWatch({ control, name: `products.${index}.numberOfGangSheets` });
  const graphics = useWatch({ control, name: `products.${index}.gangGraphics` });

  const {
    fields: branches,
    append,
    remove,
  } = useFieldArray({
    control,
    name: `products.${index}.gangGraphics`,
  });

  // Auto adjust graphics based on numberOfGraphics value (same watcher pattern as every other level)
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

  const estimate = estimateGangSheet(sheetWidth, sheetHeight, graphics);
  const sheetCount = parseInt(sheets) || 0;
  const total = estimate.printsPerSheet * sheetCount;

  return (
    <Box sx={{ width: "100%" }}>
      <Typography
        variant="p"
        sx={{ pb: "1rem", fontSize: "1rem", fontWeight: "bold", display: "block" }}
      >
        Gang Sheet Information
      </Typography>

      <Controller
        control={control}
        name={`products.${index}.numberOfGangSheets`}
        defaultValue=""
        rules={{ required: "How many gang sheets?" }}
        render={({ field, fieldState }) => (
          <TextField
            {...field}
            id="numberOfGangSheets"
            variant="outlined"
            size="small"
            fullWidth
            label="Number of Gang Sheets"
            type="number"
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Box sx={{ display: "flex", gap: 1 }}>
        <Controller
          control={control}
          name={`products.${index}.gangSheetWidth`}
          defaultValue=""
          rules={{ required: "Sheet width is required" }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              id="gangSheetWidth"
              variant="outlined"
              size="small"
              fullWidth
              label="Gang Sheet Width (inches)"
              type="number"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              sx={{ mb: "1rem", mt: "5px" }}
            />
          )}
        />

        <Controller
          control={control}
          name={`products.${index}.gangSheetHeight`}
          defaultValue=""
          rules={{ required: "Sheet height is required" }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              id="gangSheetHeight"
              variant="outlined"
              size="small"
              fullWidth
              label="Gang Sheet Height (inches)"
              type="number"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              sx={{ mb: "1rem", mt: "5px" }}
            />
          )}
        />
      </Box>

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
            label="Number of Graphics on the Sheet"
            type="number"
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {/* Graphic Fields */}
      {branches.map((branch, branchIndex) => (
        <Box sx={{ width: "95%", mb: 2, float: "right" }} key={branch.id}>
          <Typography
            variant="p"
            sx={{ pb: "1rem", fontSize: "0.9rem", fontWeight: "bold", display: "block" }}
          >
            {`Graphic ${branchIndex + 1}`}
          </Typography>

          <Controller
            control={control}
            name={`products.${index}.gangGraphics.${branchIndex}.graphicDescription`}
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

          <Box sx={{ display: "flex", gap: 1 }}>
            <Controller
              control={control}
              name={`products.${index}.gangGraphics.${branchIndex}.graphicWidth`}
              defaultValue=""
              rules={{ required: "Graphic width is required" }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  id="graphicWidth"
                  variant="outlined"
                  size="small"
                  fullWidth
                  label="Graphic Width (inches)"
                  type="number"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  sx={{ mt: "5px", mb: 1 }}
                />
              )}
            />

            <Controller
              control={control}
              name={`products.${index}.gangGraphics.${branchIndex}.graphicHeight`}
              defaultValue=""
              rules={{ required: "Graphic height is required" }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  id="graphicHeight"
                  variant="outlined"
                  size="small"
                  fullWidth
                  label="Graphic Height (inches)"
                  type="number"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  sx={{ mt: "5px", mb: 1 }}
                />
              )}
            />
          </Box>

          <Controller
            control={control}
            name={`products.${index}.gangGraphics.${branchIndex}.quantityPerSheet`}
            defaultValue=""
            render={({ field }) => (
              <TextField
                {...field}
                id="quantityPerSheet"
                variant="outlined"
                size="small"
                fullWidth
                label="How Many of This Graphic Per Sheet"
                type="number"
                helperText="Leave blank to fill the rest of the sheet with this graphic"
                sx={{ mt: "5px", mb: 1 }}
              />
            )}
          />

          <Box>
            <Controller
              name={`products.${index}.gangGraphics.${branchIndex}.isGraphicPrintReady`}
              control={control}
              defaultValue={false}
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
            name={`products.${index}.gangGraphics.${branchIndex}.numberOfColorsUsed`}
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
            name={`products.${index}.gangGraphics.${branchIndex}.colorsUsed`}
            defaultValue=""
            render={({ field }) => (
              <TextField
                multiline
                rows={3}
                size="small"
                id="colorsUsed"
                variant="outlined"
                fullWidth
                label="Colors Used"
                {...field}
                sx={{ mt: "5px", mb: 1 }}
              />
            )}
          />

          <Controller
            control={control}
            name={`products.${index}.gangGraphics.${branchIndex}.currentGraphicFormat`}
            defaultValue=""
            render={({ field }) => (
              <TextField
                id="currentGraphicFormat"
                variant="outlined"
                size="small"
                fullWidth
                label="Current Graphic Format"
                {...field}
                sx={{ mt: "5px", mb: 1 }}
              />
            )}
          />

          <Box>
            <Controller
              name={`products.${index}.gangGraphics.${branchIndex}.upchargedAcknowledged`}
              control={control}
              defaultValue={false}
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
            name={`products.${index}.gangGraphics.${branchIndex}.fontsUsed`}
            defaultValue=""
            render={({ field }) => (
              <TextField
                multiline
                rows={2}
                size="small"
                id="fontsUsed"
                variant="outlined"
                fullWidth
                label="Fonts Used"
                {...field}
                sx={{ mt: "5px", mb: 1 }}
              />
            )}
          />
        </Box>
      ))}

      {/* Live estimate -- the same math onSubmit writes to the Deal, so what sales see is what ships */}
      <Box sx={{ clear: "both", pt: 1 }}>
        {/* A graphic larger than the sheet estimates 0. Say so -- a silent 0 is the bug this
            product exists to fix, so it must never be possible to submit one unnoticed. */}
        {estimate.printsPerSheet === 0 && estimate.perGraphic.some((g, i) => {
          const src = graphics?.[i];
          return parseFloat(src?.graphicWidth) > 0 && parseFloat(src?.graphicHeight) > 0 && !g.fits;
        }) ? (
          <Alert severity="error" sx={{ mb: "1rem" }}>
            At these sizes nothing fits on the sheet — a graphic is larger than the gang sheet. Check
            the measurements; as entered, this order would be counted as 0 prints.
          </Alert>
        ) : null}

        {estimate.printsPerSheet > 0 ? (
          <Alert severity={estimate.overflow ? "warning" : "info"} sx={{ mb: "1rem" }}>
            <b>Estimated {estimate.printsPerSheet} prints per sheet</b>
            {sheetCount > 0 ? ` × ${sheetCount} sheet${sheetCount === 1 ? "" : "s"} = ${total} prints` : ""}
            {". "}
            {estimate.overflow
              ? "More than fits on one sheet at these sizes — add sheets or shrink the graphics. The full quantity is still counted."
              : `Assumes a ${GANG_GAP_INCHES}" gap between graphics; an operator nesting by hand may fit more.`}
          </Alert>
        ) : null}
      </Box>

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
            sx={{ mt: "5px" }}
          />
        )}
      />
    </Box>
  );
};

export default DtfGangSheetForm;
