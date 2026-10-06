/*
 * LumpedGuard -- E-42. One question, shown only when a garment type looks like it may be several
 * (see ../lumpedOrder.js): "Does every graphic go on every garment listed here?"
 * Yes -> quiet. No -> how to fix it. It never blocks and never changes a count.
 */
import React from "react";
import { Alert, Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { LUMPED_FIELD, LUMPED_NO_ADVICE, LUMPED_QUESTION, lumpedExplanation, lumpedSignals } from "../lumpedOrder";

const LumpedGuard = ({ index, branchIndex }) => {
  const { control } = useFormContext();
  const base = `products.${index}.primaryBranches.${branchIndex}`;
  const garment = useWatch({ control, name: base });
  const sig = lumpedSignals(garment);
  if (!sig.suspect) return null;
  const answer = garment && garment[LUMPED_FIELD];

  return (
    <Box
      sx={{
        mb: "1rem",
        p: 1.5,
        borderRadius: 1,
        border: "1px solid",
        borderColor: answer === "Yes" ? "#c8e6c9" : sig.strong || answer === "No" ? "#f0a35e" : "#ffd8a8",
        bgcolor: answer === "Yes" ? "#f3faf3" : "#fff7ec",
      }}
    >
      <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>{LUMPED_QUESTION}</Typography>
      <Typography sx={{ fontSize: "0.85rem", color: "#555", mb: 1 }}>{lumpedExplanation(sig)}</Typography>
      <Controller
        control={control}
        name={`${base}.${LUMPED_FIELD}`}
        defaultValue=""
        render={({ field }) => (
          <ToggleButtonGroup
            exclusive
            size="small"
            value={field.value || ""}
            onChange={(_, v) => field.onChange(v || "")}
            aria-label={LUMPED_QUESTION}
          >
            <ToggleButton value="Yes">Yes, all of them</ToggleButton>
            <ToggleButton value="No">No</ToggleButton>
          </ToggleButtonGroup>
        )}
      />
      {answer === "No" && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {LUMPED_NO_ADVICE}
        </Alert>
      )}
    </Box>
  );
};

export default LumpedGuard;
