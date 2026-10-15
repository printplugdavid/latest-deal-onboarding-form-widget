import { Autocomplete, Box, Button, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import React, { useContext } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SIZE_GROUPS } from "../sizeVariants";
import {
  OTHER,
  PRINT_ONLY,
  embroiderySizeFor,
  locationGroup,
  locationText,
  locationsFor,
  shownPick,
  sizeOk,
  sizeText,
} from "../placements";
import { StrictEntry } from "./strictEntry";

/*
 * One placement = ONE ROW (E-40, 2026-10-06), now PICKED, not typed (E-74, David 2026-10-15):
 *   location -- a list for this garment's kind (Garment Kind on the garment type), or "Other…" + one line
 *   size     -- Width and Height in inches; one side alone reads "… in proportion"
 *   optional Placement details (free text, for nuance the picks cannot say -- David, 2026-10-15)
 *   Small / Medium / Large as before (required on Embroidery), pre-filled from the location when clear.
 *
 * ⚠️ What is SAVED for every reader is unchanged: `placementLocation` and `sizeAndDimensions` stay text, written
 * here from the picks (placements.js), so the note, the JSON readers, the production cards, the QC form, printMath
 * and both note parsers see what they have always seen. The picks are saved beside them.
 *
 * An old placement (typed text, no picks) opens as it was and is NOT rewritten until someone changes it -- opening
 * a deal in the Amendment Form must never register as a change.
 */
const str = (v) => String(v == null ? "" : v).trim();

const GarmentTartiaryBranch = ({
  index,
  branchIndex,
  secBranchIndex,
  tarBranchIndex,
  options,
  productName,
  onRemove,
}) => {
  const { control, setValue, getValues, trigger } = useFormContext();
  const strict = useContext(StrictEntry);
  const garmentBase = `products.${index}.primaryBranches.${branchIndex}`;
  const base = `${garmentBase}.secondaryBranches.${secBranchIndex}.tartiaryBranches.${tarBranchIndex}`;
  const kind = useWatch({ control, name: `${garmentBase}.garmentKind` }) || "";
  const placement = useWatch({ control, name: base }) || {};
  const { pick, other } = shownPick(placement, kind);
  const choices = locationsFor(kind);

  const set = (name, v) => setValue(`${base}.${name}`, v, { shouldDirty: true });
  // The picks are written with setValue, which does not re-check a field -- so an error shown earlier would stay
  // after the rep fixed it. Re-check this row's fields whenever one of them changes.
  const recheck = (...names) => trigger(names.map((n) => `${base}.${n}`));

  // A pick writes the location text; on Embroidery an empty Small/Medium/Large is suggested from it.
  const choose = (next) => {
    const p = next || "";
    const o = p === OTHER ? other : "";
    set("placementPick", p);
    set("placementOther", o);
    set("placementLocation", locationText(p, o));
    // A suggested size follows the location; one the rep picked by hand is never touched (placementSizeAuto).
    if (productName === "Embroidery") {
      const auto = !!getValues(`${base}.placementSizeAuto`);
      if (!getValues(`${base}.placementSize`) || auto) {
        const s = embroiderySizeFor(p, kind);
        set("placementSize", s || (auto ? "" : getValues(`${base}.placementSize`)));
        set("placementSizeAuto", !!s);
      }
    }
    recheck("placementPick", "placementOther", "placementSize", "widthIn");
  };

  // Any size box writes the size line from all three.
  const resize = (name, v) => {
    set(name, v);
    const now = { widthIn: getValues(`${base}.widthIn`), heightIn: getValues(`${base}.heightIn`), positionNote: getValues(`${base}.positionNote`), [name]: v };
    set("sizeAndDimensions", sizeText(now.widthIn, now.heightIn, now.positionNote));
    recheck("widthIn", "heightIn");
  };

  const legacySize =
    !str(placement.widthIn) && !str(placement.heightIn) && !str(placement.positionNote) ? str(placement.sizeAndDimensions) : "";
  const reads = sizeText(placement.widthIn, placement.heightIn, placement.positionNote);

  return (
    <Box sx={{ width: "95%", ml: "auto", mb: "0.8rem" }}>
      <Box sx={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
        <Controller
          control={control}
          name={`${base}.placementPick`}
          defaultValue=""
          rules={{ validate: () => !strict || !!shownPick(getValues(base), getValues(`${garmentBase}.garmentKind`)).pick || "Pick a location" }}
          render={({ field, fieldState }) => (
            <Autocomplete
              options={choices}
              groupBy={(o) => locationGroup(kind, o)}
              value={pick || null}
              onChange={(_, v) => choose(v)}
              autoHighlight
              openOnFocus
              sx={{ flex: "2 1 0", minWidth: 0 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  id="placementLocation"
                  size="small"
                  label={`Placement ${tarBranchIndex + 1} - Location${strict ? " *" : ""}`}
                  inputRef={field.ref}
                  error={!!fieldState.error}
                  helperText={fieldState.error ? fieldState.error.message : !kind ? "Pick the Garment Kind above for a shorter list" : undefined}
                />
              )}
            />
          )}
        />

        {pick === OTHER && (
          <Controller
            control={control}
            name={`${base}.placementOther`}
            defaultValue=""
            rules={{ validate: () => !strict || shownPick(getValues(base), kind).pick !== OTHER || !!str(shownPick(getValues(base), kind).other) || "Type the location" }}
            render={({ field, fieldState }) => (
              <TextField
                size="small"
                label="Other location"
                value={other}
                inputRef={field.ref}
                onChange={(e) => {
                  const t = e.target.value;
                  set("placementPick", OTHER);
                  set("placementOther", t);
                  set("placementLocation", str(t));
                  recheck("placementOther", "placementPick");
                }}
                inputProps={{ maxLength: 80 }}
                error={!!fieldState.error}
                helperText={fieldState.error ? fieldState.error.message : undefined}
                sx={{ flex: "2 1 0", minWidth: 0 }}
              />
            )}
          />
        )}

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
              onChange={(_, newValue) => {
                field.onChange(newValue);
                set("placementSizeAuto", false); // picked by hand: a later location change leaves it alone
              }}
              sx={{ flex: "0 0 10.5rem" }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={productName === "Embroidery" ? "Placement Size *" : "Placement Size"}
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
            <IconButton aria-label={`Remove placement ${tarBranchIndex + 1}`} onClick={() => onRemove(tarBranchIndex)} sx={{ mt: "2px" }}>
              ✕
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Size: width and/or height in inches, plus an optional one-line position note. */}
      <Box sx={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", mt: "0.5rem" }}>
        <Controller
          control={control}
          name={`${base}.widthIn`}
          defaultValue=""
          rules={{
            validate: (w) => {
              if (!sizeOk(w)) return "Inches, e.g. 3.5 or 3 1/2";
              if (!strict || shownPick(getValues(base), kind).pick === PRINT_ONLY) return true;
              return !!str(w) || !!str(getValues(`${base}.heightIn`)) || "Enter a width or a height";
            },
          }}
          render={({ field, fieldState }) => (
            <TextField
              size="small"
              label="Width (in)"
              value={field.value || ""}
              inputRef={field.ref}
              onChange={(e) => resize("widthIn", e.target.value)}
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              sx={{ flex: "0 0 8rem" }}
            />
          )}
        />
        <Controller
          control={control}
          name={`${base}.heightIn`}
          defaultValue=""
          rules={{ validate: (h) => sizeOk(h) || "Inches, e.g. 2.5 or 2 1/2" }}
          render={({ field, fieldState }) => (
            <TextField
              size="small"
              label="Height (in)"
              value={field.value || ""}
              inputRef={field.ref}
              onChange={(e) => resize("heightIn", e.target.value)}
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              sx={{ flex: "0 0 8rem" }}
            />
          )}
        />
      </Box>
      {/* David, 2026-10-15: keep an optional spot for placement / size nuance the picks cannot say. */}
      <Controller
        control={control}
        name={`${base}.positionNote`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            size="small"
            multiline
            minRows={1}
            maxRows={4}
            fullWidth
            label="Placement details (optional)"
            placeholder="Anything the boxes above don't cover, e.g. 3 in down from collar · name 8 in wide, number 4 in tall"
            value={field.value || ""}
            inputRef={field.ref}
            onChange={(e) => resize("positionNote", e.target.value)}
            inputProps={{ maxLength: 300 }}
            sx={{ mt: "0.5rem" }}
          />
        )}
      />
      <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: "0.2rem", pl: "0.2rem" }}>
        {reads
          ? `Reads: ${reads}`
          : legacySize
          ? `Saved size: “${legacySize}” — enter a width or height to replace it`
          : "Enter a width, a height, or both — one side alone reads “in proportion”."}
      </Typography>

      {/* E-67: a different size on some garment sizes -- picked groups, and now width / height too. */}
      <Controller
        control={control}
        name={`${base}.sizeVariants`}
        defaultValue={[]}
        render={({ field }) => {
          const rows = Array.isArray(field.value) ? field.value : [];
          const setRows = (next) => field.onChange(next);
          const resizeRow = (i, key, v) =>
            setRows(
              rows.map((x, n) => {
                if (n !== i) return x;
                const r = { ...x, [key]: v };
                return { ...r, dimensions: sizeText(r.widthIn, r.heightIn) };
              })
            );
          return (
            <Box sx={{ pl: "0.5rem", mt: "0.4rem" }}>
              {rows.map((r, i) => {
                const oldText = !str(r?.widthIn) && !str(r?.heightIn) ? str(r?.dimensions) : "";
                return (
                  <Box key={i} sx={{ display: "flex", gap: "0.5rem", mb: "0.4rem", alignItems: "flex-start" }}>
                    <Autocomplete
                      freeSolo
                      size="small"
                      options={SIZE_GROUPS}
                      value={r?.sizes || ""}
                      onChange={(_, v) => setRows(rows.map((x, n) => (n === i ? { ...x, sizes: v || "" } : x)))}
                      onInputChange={(_, v, reason) => {
                        if (reason === "input") setRows(rows.map((x, n) => (n === i ? { ...x, sizes: v } : x)));
                      }}
                      sx={{ flex: "1 1 0" }}
                      renderInput={(params) => <TextField {...params} label="On these garment sizes" />}
                    />
                    <TextField
                      size="small"
                      label="Width (in)"
                      value={r?.widthIn || ""}
                      onChange={(e) => resizeRow(i, "widthIn", e.target.value)}
                      error={!sizeOk(r?.widthIn)}
                      helperText={oldText ? `was: ${oldText}` : undefined}
                      sx={{ flex: "0 0 7rem" }}
                    />
                    <TextField
                      size="small"
                      label="Height (in)"
                      value={r?.heightIn || ""}
                      onChange={(e) => resizeRow(i, "heightIn", e.target.value)}
                      error={!sizeOk(r?.heightIn)}
                      sx={{ flex: "0 0 7rem" }}
                    />
                    <IconButton aria-label="Remove this size" onClick={() => setRows(rows.filter((_, n) => n !== i))} sx={{ mt: "2px" }}>
                      ✕
                    </IconButton>
                  </Box>
                );
              })}
              <Button
                size="small"
                onClick={() => setRows([...rows, { sizes: "", widthIn: "", heightIn: "", dimensions: "" }])}
                sx={{ textTransform: "none", p: 0, minWidth: 0 }}
              >
                + Different size on some garment sizes
              </Button>
            </Box>
          );
        }}
      />
    </Box>
  );
};

export default GarmentTartiaryBranch;
