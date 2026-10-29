import React from "react";
import { Alert, Box, TextField, Typography } from "@mui/material";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { FAMILY_LABEL, sqftCalc } from "../invoice/sqft";

/*
 * E-156 (David 10-29): shown when the picked Books item is priced per square foot (decals, vinyl stencils, custom-size banner).
 * The rep enters width and height in inches; with Quantity Ordered the form works out the square feet and the right price tier
 * (decals: by number of decals; stencils: by total square feet) -- the draft is billed by square feet, never by pieces.
 */
export default function SqftCalculator({ index }) {
  const { control } = useFormContext();
  const [skuRows, count, widthIn, heightIn] = useWatch({
    control,
    name: [`products.${index}.productSkus`, `products.${index}.quantityOrdered`, `products.${index}.sqftWidthIn`, `products.${index}.sqftHeightIn`],
  });
  const skus = (skuRows || []).map((r) => r && r.sku).filter(Boolean);
  const calc = sqftCalc({ skus, count, widthIn, heightIn });
  if (!calc.family) return null;
  const inch = (name, label) => (
    <Controller
      control={control}
      name={`products.${index}.${name}`}
      defaultValue=""
      render={({ field }) => (
        <TextField {...field} size="small" type="number" label={label} inputProps={{ min: 0, step: "0.25" }} sx={{ flex: 1, mb: "0.6rem" }} />
      )}
    />
  );
  return (
    <Box sx={{ border: "1px solid #ccc", p: 1.5, my: 1 }}>
      <Typography sx={{ fontWeight: "bold", mb: 1 }}>Square feet: {FAMILY_LABEL[calc.family]}</Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Size of ONE {calc.family === "banner" ? "banner" : calc.family === "stencil" ? "stencil" : "decal"}, in inches. Quantity Ordered is how many.
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        {inch("sqftWidthIn", "Width (inches)")}
        {inch("sqftHeightIn", "Height (inches)")}
      </Box>
      {calc.line ? (
        <Alert severity="info">On the draft: {calc.summary}</Alert>
      ) : (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          To price it: {calc.why}.
        </Typography>
      )}
    </Box>
  );
}
