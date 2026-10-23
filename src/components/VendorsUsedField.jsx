import React, { useSyncExternalStore } from "react";
import { Autocomplete, Chip, TextField } from "@mui/material";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { currentDealVendors, notOnDealList, onDealVendorsChange, vendorsOf, vendorsText } from "../products/vendors";

/*
 * E-113: "Vendors Used" for one garment type or product (`base` = its path). A pick list of the Deal's vendor choices; a vendor not on the
 * list can still be typed. Saves the list (`vendorsList`) and the same as text (`vendorsUsed`, which the note and every reader keep using).
 */
export const setVendors = (setValue, base, list) => {
  setValue(`${base}.vendorsList`, list);
  setValue(`${base}.vendorsUsed`, vendorsText(list), { shouldDirty: true });
};

export default function VendorsUsedField({ base }) {
  const { control, setValue } = useFormContext();
  const list = useWatch({ control, name: `${base}.vendorsList` });
  const choices = useSyncExternalStore(onDealVendorsChange, currentDealVendors); // E-126: the live Deal list once read
  return (
    <Controller
      control={control}
      name={`${base}.vendorsUsed`}
      defaultValue=""
      render={({ field }) => {
        const value = Array.isArray(list) ? list : vendorsOf({ vendorsUsed: field.value });
        const other = notOnDealList(value);
        return (
          <Autocomplete
            multiple
            freeSolo
            size="small"
            options={choices}
            value={value}
            onChange={(_, v) => setVendors(setValue, base, v.map((x) => String(x).trim()).filter(Boolean))}
            renderTags={(vals, getTagProps) => vals.map((opt, i) => <Chip size="small" label={opt} {...getTagProps({ index: i })} key={opt + i} />)}
            renderInput={(params) => (
              <TextField
                {...params}
                id="vendorsUsed"
                label="Vendors Used"
                helperText={
                  other.length
                    ? `Not on the Deal's vendor list yet: ${other.join(", ")}. It stays on the order; tell David so Books can add it.`
                    : "Filled from the product picked. Pick more, or type one that is not on the list."
                }
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        );
      }}
    />
  );
}
