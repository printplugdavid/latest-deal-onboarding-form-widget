/*
 * ColorsUsedField -- the "Colors Used" box, with the shop's color chart beside it (E-41).
 *
 * ⚠️ THE FIELD IS STILL A STRING, and the text box is still the answer. For a product with no
 * chart this renders the plain box exactly as before. For a product with one (cut vinyl today)
 * it adds: a picker that drops a chart color into the box, a swatch for every chart color the
 * box names, and a flag on anything written that is NOT on the chart -- the typo catcher.
 */
import React from "react";
import { Autocomplete, Box, TextField, Typography } from "@mui/material";
import { useFormContext, useWatch } from "react-hook-form";
import { addColorToText, catalogFor, readColors, swatchBackground } from "../colorCatalogs";
import { colorModeFor } from "../colorLibrary";
import { InkColors, ThreadColors } from "./ColorPanels";

const Dot = ({ color, size = 16 }) => (
  <Box
    component="span"
    sx={{
      display: "inline-block",
      width: size,
      height: size,
      borderRadius: "3px",
      border: "1px solid #999",
      background: swatchBackground(color),
      flex: "0 0 auto",
    }}
  />
);

const ColorsUsedField = ({ field, productIndex, countName, label, sx }) => {
  const { control } = useFormContext();
  const productName = useWatch({ control, name: `products.${productIndex}.productName` });
  const typedCount = useWatch({ control, name: countName || "__none__" });
  const catalog = catalogFor(productName);
  const mode = colorModeFor(productName); // E-41 phase 2: "thread" (Embroidery), "ink" (Screen Printing)

  const box = (
    <TextField
      multiline
      rows={3}
      size="small"
      id="colorsUsed"
      variant="outlined"
      fullWidth
      label={label}
      {...field}
      sx={catalog || mode ? { mt: "5px", mb: "0.4rem" } : sx}
    />
  );
  if (mode === "thread") return <ThreadColors field={field} box={box} />;
  if (mode === "ink") return <InkColors field={field} box={box} typedCount={typedCount} />;
  if (!catalog) return box;

  const { matched, unmatched } = readColors(field.value, catalog);
  const n = parseInt(typedCount, 10);
  const countOff = !unmatched.length && matched.length > 0 && !isNaN(n) && n !== matched.length;

  return (
    <Box sx={{ mb: "1rem" }}>
      <Autocomplete
        size="small"
        options={catalog.colors}
        value={null}
        blurOnSelect
        clearOnBlur
        getOptionLabel={(o) => o?.name || ""}
        onChange={(_, picked) => {
          if (picked) field.onChange(addColorToText(field.value, picked.name, catalog));
        }}
        renderOption={(props, o) => (
          <li {...props} key={o.name}>
            <Dot color={o} />
            <span style={{ marginLeft: 8 }}>{o.name}</span>
          </li>
        )}
        renderInput={(params) => (
          <TextField {...params} label={`Pick a ${catalog.label} color to add`} sx={{ mt: "5px" }} />
        )}
      />
      {box}
      {matched.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "0.4rem 0.9rem", alignItems: "center" }}>
          {matched.map((c) => (
            <Box key={c.name} sx={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}>
              <Dot color={c} size={18} />
              {c.name}
            </Box>
          ))}
        </Box>
      )}
      {unmatched.length > 0 && (
        <Typography sx={{ fontSize: "0.85rem", color: "#b26a00", mt: "0.3rem" }}>
          Not on the {catalog.label} chart: {unmatched.join(" · ")}. Check the spelling, or leave it if it is a
          note.
        </Typography>
      )}
      {countOff && (
        <Typography sx={{ fontSize: "0.85rem", color: "#b26a00", mt: "0.3rem" }}>
          {matched.length} color{matched.length === 1 ? "" : "s"} listed here, but Number Of Colors Used says {n}.
        </Typography>
      )}
      <Typography sx={{ fontSize: "0.75rem", color: "#777", mt: "0.3rem" }}>
        Swatches are a screen approximation — a check against the wrong color, not a color match.
      </Typography>
    </Box>
  );
};

export default ColorsUsedField;
