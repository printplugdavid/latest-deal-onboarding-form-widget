import React, { useEffect } from "react";
import { Box, FormLabel } from "@mui/material";
import { Controller } from "react-hook-form";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { EXTENDED_DATE_LABEL, extendedRange, toYmd } from "../turnaround";

/*
 * E-144 (David 10-27: "Calendar would be helpful"): when the customer takes the extra week, the rep picks the Closing Date
 * from the standard date + 1 to + 7 days (default + 7). Saved as `extendedClosingDate` (YYYY/MM/DD, like dueDate); the
 * form writes it to the Deal's Closing Date at Submit (turnaround.js).
 */
export default function ExtendedClosingDate({ control, setValue, getValues }) {
  const range = extendedRange();
  useEffect(() => {
    const now = toYmd(getValues("extendedClosingDate"));
    if (!now || now < range.min || now > range.max) setValue("extendedClosingDate", range.dflt.replace(/-/g, "/"));
    // the range is today's; run once when the calendar appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Box sx={{ mb: "1rem" }}>
      <FormLabel sx={{ mb: "10px", color: "black", display: "block" }}>{EXTENDED_DATE_LABEL}</FormLabel>
      <Controller
        name="extendedClosingDate"
        control={control}
        rules={{
          validate: (v) => {
            const ymd = toYmd(v);
            if (getValues("hardDueDate") !== "No" || getValues("discountsForExtendedTurnaround") !== "Yes") return true;
            if (!ymd) return "Required";
            return (ymd >= range.min && ymd <= range.max) || `Pick a date from ${range.min} to ${range.max}`;
          },
        }}
        render={({ field, fieldState }) => (
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              value={toYmd(field.value) ? dayjs(toYmd(field.value)) : null}
              onChange={(v) => field.onChange(v && v.isValid() ? v.format("YYYY/MM/DD") : "")}
              minDate={dayjs(range.min)}
              maxDate={dayjs(range.max)}
              slotProps={{
                textField: {
                  size: "small",
                  error: !!fieldState.error,
                  helperText: fieldState.error
                    ? fieldState.error.message
                    : `Standard would be ${range.standard}. Up to 7 days later: ${range.min} to ${range.max}.`,
                },
              }}
            />
          </LocalizationProvider>
        )}
      />
    </Box>
  );
}
