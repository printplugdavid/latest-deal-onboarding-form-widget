import React from "react";
import { Autocomplete, Box, TextField } from "@mui/material";
import { useFormContext, useWatch } from "react-hook-form";
import { fontsView, fontsValues, resizeLines, MAX_FONTS } from "../fontsField";

/*
 * E-116: "Fonts added? Yes / No"; Yes -> "How many fonts?" and one line per font. Replaces the free-text "Fonts Used" box wherever it
 * appeared (garment graphics, gang sheet graphics, Graphic Design, non-garment items). `name` is the old `…fontsUsed` path; the
 * siblings `fontsAdded` and `fontLines` sit next to it. Nothing is written until the rep changes something (opening an old order in
 * the Amendment Form is not a change).
 */
export default function FontsField({ name }) {
  const { control, setValue } = useFormContext();
  const base = name.replace(/\.fontsUsed$/, "");
  const [fontsAdded, fontLines, fontsUsed] = useWatch({ control, name: [`${base}.fontsAdded`, `${base}.fontLines`, name] });
  const { added, lines } = fontsView(fontsAdded, fontLines, fontsUsed);

  const save = (nextAdded, nextLines) => {
    const v = fontsValues(nextAdded, nextLines);
    setValue(`${base}.fontsAdded`, v.fontsAdded, { shouldDirty: true });
    setValue(`${base}.fontLines`, v.fontLines, { shouldDirty: true });
    setValue(name, v.fontsUsed, { shouldDirty: true });
  };

  return (
    <Box sx={{ mb: "1rem", mt: "5px" }}>
      <Autocomplete
        size="small"
        options={["Yes", "No"]}
        value={added || null}
        onChange={(_, v) => save(v || "", v === "Yes" ? (lines.length ? lines : [""]) : [])}
        renderInput={(params) => <TextField {...params} label="Fonts added?" />}
      />
      {added === "Yes" && (
        <>
          <TextField
            size="small"
            type="number"
            label="How many fonts?"
            value={lines.length || ""}
            inputProps={{ min: 1, max: MAX_FONTS }}
            onChange={(e) => save("Yes", resizeLines(lines, e.target.value))}
            sx={{ mt: "10px", width: "12rem" }}
          />
          {lines.map((line, i) => (
            <TextField
              key={i}
              size="small"
              fullWidth
              label={`Font ${i + 1} (name, weight / style)`}
              value={line}
              onChange={(e) => save("Yes", lines.map((l, n) => (n === i ? e.target.value : l)))}
              sx={{ mt: "10px" }}
            />
          ))}
        </>
      )}
    </Box>
  );
}
