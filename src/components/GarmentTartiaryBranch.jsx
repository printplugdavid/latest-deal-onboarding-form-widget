import { Box, TextField, Typography } from "@mui/material";
import React from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

const GarmentTartiaryBranch = ({
  index,
  branchIndex,
  secBranchIndex,
  tarBranchIndex,
  options,
  productName,
}) => {
  const { control } = useFormContext();

  return (
    <Box sx={{ width: "95%", mb: 2, float: "right" }}>
      <Typography
        variant="p"
        sx={{
          pb: "1rem",
          fontSize: "0.9rem",
          fontWeight: "bold",
          display: "block",
        }}
      >
        {`Placement ${tarBranchIndex + 1}`}
      </Typography>

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.tartiaryBranches.${tarBranchIndex}.placementLocation`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            size="small"
            id="placementLocation"
            variant="outlined"
            fullWidth
            label="Placement Location"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Controller
        control={control}
        name={`products.${index}.primaryBranches.${branchIndex}.secondaryBranches.${secBranchIndex}.tartiaryBranches.${tarBranchIndex}.sizeAndDimensions`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="sizeAndDimensions"
            variant="outlined"
            fullWidth
            label="Size & Dimensions"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />
    </Box>
  );
};

export default GarmentTartiaryBranch;
