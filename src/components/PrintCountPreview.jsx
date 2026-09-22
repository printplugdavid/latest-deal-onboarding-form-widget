import React from "react";
import { Box, Typography } from "@mui/material";
import { useFormContext, useWatch } from "react-hook-form";
import { computePrints } from "../printMath";

/*
 * What this submission will book, shown before the agent submits it.
 *
 * Until now the print counts were invisible until after submit: they went straight to the Deal
 * fields and the note. Stephanie McBride Deal 2 booked 2646 prints for a 189-print order and
 * nobody saw it for five days (docs/03, 2026-09-22 (6)). A number on screen is the cheapest
 * possible guard -- nobody has to be told to check it.
 *
 * It runs the SAME src/printMath.js that onSubmit runs, so what is shown here is exactly what
 * gets written. That is the whole point of E-8/D-11: one calculation, no second copy to drift.
 */
const PrintCountPreview = () => {
  const { control } = useFormContext();
  const products = useWatch({ control, name: "products" });

  // This renders on every keystroke, against half-filled data. computePrints is defensive and was
  // differential-tested against empty/undefined/garbage input, but a preview must never be able to
  // take the form down with it: if it ever throws, show nothing and let the agent carry on.
  let counts;
  try {
    counts = computePrints(products);
  } catch (e) {
    console.log("Print count preview failed:", e);
    return null;
  }

  const rows = [
    ["Screen Print", counts.SD],
    ["Embroidery", counts.ED],
    ["Vinyl Department", counts.VD],
    ["Outsourced items", counts.outsourced],
  ].filter(([, v]) => v > 0);

  if (!rows.length) return null;

  const jobs = [
    ["DTG", counts.perJob.dtg],
    ["DTF", counts.perJob.dtf],
    ["DTF Gang Sheet", counts.perJob.gangSheet],
    ["HTV", counts.perJob.htv],
    ["Vinyl", counts.perJob.vinyl],
    ["Stickers", counts.perJob.stickers],
    ["Decals", counts.perJob.decals],
    ["Banners", counts.perJob.banners],
    ["Posters", counts.perJob.posters],
    ["Magnets", counts.perJob.magnets],
    ["Patches", counts.perJob.patches],
  ].filter(([, v]) => v > 0);

  const sizes = [
    ["Small", counts.embroiderySizes.small],
    ["Medium", counts.embroiderySizes.medium],
    ["Large", counts.embroiderySizes.large],
  ].filter(([, v]) => v > 0);

  return (
    <Box sx={{ my: "1.5rem", p: 2, border: "1px solid #ccc", borderRadius: 1, bgcolor: "#fafafa" }}>
      <Typography sx={{ fontWeight: "bold", mb: 1 }}>
        This order will be counted as {counts.SD + counts.ED + counts.VD} prints
      </Typography>

      {rows.map(([label, value]) => (
        <Box key={label} sx={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>{label}</span>
          <b>{value}</b>
        </Box>
      ))}

      {jobs.length > 0 && (
        <Typography sx={{ fontSize: 12, color: "#555", mt: 1 }}>
          {jobs.map(([l, v]) => `${l}: ${v}`).join("  ·  ")}
        </Typography>
      )}

      {sizes.length > 0 && (
        <Typography sx={{ fontSize: 12, color: "#555" }}>
          Embroidery placement sizes — {sizes.map(([l, v]) => `${l}: ${v}`).join("  ·  ")}
        </Typography>
      )}

      <Typography sx={{ fontSize: 12, color: "#777", mt: 1 }}>
        Counts every print the job produces, including underbase, premium iron and the heat-press
        pass — so it is normally higher than the number of garments. If it looks wrong, check the
        garment quantities and the number of placements before submitting.
      </Typography>
    </Box>
  );
};

export default PrintCountPreview;
