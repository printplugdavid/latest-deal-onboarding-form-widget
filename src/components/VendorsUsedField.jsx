import React, { useState, useSyncExternalStore } from "react";
import { Alert, Autocomplete, Chip, TextField, createFilterOptions } from "@mui/material";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { currentDealVendors, dealVendor, notOnDealList, onDealVendorsChange, vendorsOf, vendorsText } from "../products/vendors";
import AddVendorDialog from "./AddVendorDialog";

/*
 * E-113: "Vendors Used" for one garment type or product (`base` = its path). A pick list of the Deal's vendor choices; a vendor not on the
 * list can still be typed. Saves the list (`vendorsList`) and the same as text (`vendorsUsed`, which the note and every reader keep using).
 * E-126 B: a name that is not on the list can also be ADDED (Books + the Deal list) through AddVendorDialog.
 */
export const setVendors = (setValue, base, list) => {
  setValue(`${base}.vendorsList`, list);
  setValue(`${base}.vendorsUsed`, vendorsText(list), { shouldDirty: true });
};

const filter = createFilterOptions();
const label = (o) => (typeof o === "string" ? o : o && o.add ? `Add "${o.add}" as a new vendor` : "");

export default function VendorsUsedField({ base }) {
  const { control, setValue } = useFormContext();
  const list = useWatch({ control, name: `${base}.vendorsList` });
  const choices = useSyncExternalStore(onDealVendorsChange, currentDealVendors); // E-126: the live Deal list once read
  const [adding, setAdding] = useState("");
  const [note, setNote] = useState(null); // { severity, text } after an add
  return (
    <Controller
      control={control}
      name={`${base}.vendorsUsed`}
      defaultValue=""
      render={({ field }) => {
        const value = Array.isArray(list) ? list : vendorsOf({ vendorsUsed: field.value });
        const other = notOnDealList(value);
        const put = (next) => setVendors(setValue, base, next.map((x) => String(x).trim()).filter(Boolean));
        const done = (a) => {
          setAdding("");
          if (!a) return;
          const name = a.use || a.name;
          put([...value.filter((v) => dealVendor(v) !== name && v.trim().toLowerCase() !== String(adding).trim().toLowerCase()), name]);
          if (a.use) setNote(null);
          else if (a.result === "partial") setNote({ severity: "warning", text: `${name} was added, but not on every Deal layout yet: ${a.message}` });
          else setNote({ severity: "success", text: a.result === "already_there" ? `${name} was already a vendor: it is on the list now.` : `${name} was added as a new vendor.` });
        };
        return (
          <>
            <Autocomplete
              multiple
              freeSolo
              size="small"
              options={choices}
              value={value}
              getOptionLabel={label}
              filterOptions={(opts, params) => {
                const shown = filter(opts, params);
                const typed = String(params.inputValue || "").trim();
                if (typed && !dealVendor(typed)) shown.push({ add: typed });
                return shown;
              }}
              onChange={(_, v) => {
                const pick = v.find((x) => x && typeof x === "object" && x.add);
                if (pick) return setAdding(pick.add);
                put(v.filter((x) => typeof x === "string"));
              }}
              renderTags={(vals, getTagProps) => vals.map((opt, i) => <Chip size="small" label={opt} {...getTagProps({ index: i })} key={opt + i} />)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  id="vendorsUsed"
                  label="Vendors Used"
                  helperText={
                    other.length
                      ? `Not on the Deal's vendor list yet: ${other.join(", ")}. Type it again and choose "Add as a new vendor", or tell David.`
                      : "Filled from the product picked. Pick more, or type a vendor that is not on the list to add it."
                  }
                  sx={{ mb: note ? "0.4rem" : "1rem", mt: "5px" }}
                />
              )}
            />
            {note && (
              <Alert severity={note.severity} onClose={() => setNote(null)} sx={{ mb: "1rem" }}>
                {note.text}
              </Alert>
            )}
            {adding && <AddVendorDialog name={adding} known={choices} onDone={done} />}
          </>
        );
      }}
    />
  );
}
