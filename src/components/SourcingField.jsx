import React from "react";
import { Box, FormControlLabel, Radio, RadioGroup, Typography } from "@mui/material";
import { Controller, useFormContext } from "react-hook-form";
import { IN_HOUSE, ORDERED_FINISH, ORDERED_READY, defaultSourcing } from "../dealCategory";

/*
 * E-115 (David 10-27): "Is this item outsourced?" for one product (`products.<index>.sourcing`). No = In house. Yes opens the two
 * answers: "Ordered in, finished in house" / "Ordered in, ready to go". Saved as the words shown (label = stored value). Products
 * always bought in open on "ready to go"; the rep can change it. Used by the onboarding form and the Amendment Form.
 */
export default function SourcingField({ index, productName, saveDefault = true }) {
  const { control } = useFormContext();
  const fallback = defaultSourcing(productName);
  return (
    <Controller
      control={control}
      name={`products.${index}.sourcing`}
      // the onboarding saves the shown answer; the Amendment Form saves only an answer the rep changes (no false "change")
      defaultValue={saveDefault ? fallback : undefined}
      render={({ field }) => {
        const value = field.value || fallback;
        const outsourced = value !== IN_HOUSE;
        return (
          <Box sx={{ mb: 2, p: 1, background: "#f7f7f9", borderRadius: 1 }}>
            <Typography sx={{ fontSize: "0.9rem", fontWeight: "bold" }}>Is this item outsourced?</Typography>
            <RadioGroup
              row
              value={outsourced ? "yes" : "no"}
              // Yes starts on "finished in house": a missed second answer then makes an extra task, never skips a needed one.
              onChange={(e) => field.onChange(e.target.value === "yes" ? (outsourced ? value : ORDERED_FINISH) : IN_HOUSE)}
            >
              <FormControlLabel value="no" control={<Radio size="small" />} label="No, made in house" />
              <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" />
            </RadioGroup>
            {outsourced && (
              <RadioGroup sx={{ ml: 3 }} value={value} onChange={(e) => field.onChange(e.target.value)}>
                <FormControlLabel value={ORDERED_FINISH} control={<Radio size="small" />} label="Ordered in, finished in house" />
                <FormControlLabel value={ORDERED_READY} control={<Radio size="small" />} label="Ordered in, ready to go" />
              </RadioGroup>
            )}
          </Box>
        );
      }}
    />
  );
}
