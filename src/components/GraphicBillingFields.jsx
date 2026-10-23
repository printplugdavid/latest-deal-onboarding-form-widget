import React, { useContext } from "react";
import { Autocomplete, TextField } from "@mui/material";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { StrictEntry } from "./strictEntry";
import { HTV_FULL, HTV_PLAIN } from "../invoice/billingLines";
import { LUMPED_FIELD } from "../lumpedOrder";
import { SPLIT_OF } from "../garmentSplit";

/*
 * E-108 (docs/63): two answers the draft invoice needs from a graphic. Shown in the onboarding form and the Amendment Form;
 * required only in the onboarding form (StrictEntry), like the E-74 picks.
 *   Heat-Transfer -> "Single color or full color?" (Books has a plain grid and a full color grid)
 *   "Does every graphic go on every garment?" = No, and this garment type was not split -> "How many of these garments get
 *   this graphic?" (Deluge docs/40 §3b.2; a split already gives every graphic its own count)
 */
const GraphicBillingFields = ({ index, branchIndex, secBranchIndex, productName }) => {
  const strict = useContext(StrictEntry);
  const { control } = useFormContext();
  const base = `products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}`;
  const branches = useWatch({ control, name: `products.${index}.primaryBranches` }) || [];
  const garment = branches[branchIndex] || {};
  const split = !!garment[SPLIT_OF] || branches.some((b) => b && Number(b[SPLIT_OF]) === branchIndex + 1);
  const askCount = garment[LUMPED_FIELD] === "No" && !split;
  const quantity = parseInt(garment.garmentQuantity, 10) || 0;

  return (
    <>
      {productName === "Heat-Transfer" && (
        <Controller
          control={control}
          name={`${base}.htvColorMode`}
          defaultValue=""
          rules={{ validate: (v) => !strict || !!v || "Single color or full color?" }}
          render={({ field, fieldState }) => (
            <Autocomplete
              {...field}
              options={[HTV_PLAIN, HTV_FULL]}
              value={field.value || null}
              onChange={(_, v) => field.onChange(v || "")}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Single color or full color?"
                  size="small"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error ? fieldState.error.message : "Picks the HTV price on the draft invoice"}
                  sx={{ mb: "1rem", mt: "5px" }}
                />
              )}
            />
          )}
        />
      )}
      {askCount && (
        <Controller
          control={control}
          name={`${base}.garmentsWithThisGraphic`}
          defaultValue=""
          rules={{
            validate: (v) => {
              if (!strict && !String(v || "").trim()) return true;
              const n = parseInt(v, 10);
              if (!(n > 0)) return "How many of these garments get this graphic?";
              return !quantity || n <= quantity || `At most ${quantity} (the garment quantity)`;
            },
          }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="How many of these garments get this graphic?"
              type="number"
              size="small"
              fullWidth
              error={!!fieldState.error}
              helperText={fieldState.error ? fieldState.error.message : "Not every graphic goes on every garment here, so the invoice needs this count"}
              sx={{ mb: "1rem", mt: "5px" }}
            />
          )}
        />
      )}
    </>
  );
};

export default GraphicBillingFields;
