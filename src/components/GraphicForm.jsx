import React from "react";
import {
  Box,
  Checkbox,
  FormControlLabel,
  FormGroup,
  FormLabel,
  TextField,
} from "@mui/material";
import { Controller, useFormContext } from "react-hook-form";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";

const GraphicForm = ({ index }) => {
  const { control } = useFormContext();

  return (
    <Box sx={{ width: "100%" }}>
      <Controller
        control={control}
        name={`products.${index}.graphicDescription`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            size="small"
            rows={3}
            id="graphicDescription"
            variant="outlined"
            fullWidth
            label="Graphic Description"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Box>
        <Controller
          name={`products.${index}.designServiceNeeded`}
          control={control}
          defaultValue={false} // Set the default value of the checkbox
          render={({ field }) => (
            <FormGroup>
              <FormControlLabel
                control={<Checkbox {...field} />}
                label="Design Service Needed?"
              />
            </FormGroup>
          )}
        />
      </Box>

      <Box>
        <Controller
          name={`products.${index}.designAssetsProvided`}
          control={control}
          defaultValue={false} // Set the default value of the checkbox
          render={({ field }) => (
            <FormGroup>
              <FormControlLabel
                control={<Checkbox {...field} />}
                label="Design Assets Provided?"
              />
            </FormGroup>
          )}
        />
      </Box>

      <Controller
        control={control}
        name={`products.${index}.desiredGraphicApplication`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="desiredGraphicApplication"
            variant="outlined"
            fullWidth
            label="Desired Graphic Application"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Controller
        control={control}
        name={`products.${index}.fontsUsed`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="fontsUsed"
            variant="outlined"
            fullWidth
            label="Fonts Used"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Controller
        control={control}
        name={`products.${index}.estimatedDesignHours`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            id="estimatedDesignHours"
            variant="outlined"
            size="small"
            fullWidth
            label="Estimated Design Hours"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      <Box>
        <Controller
          name={`products.${index}.serviceCostAcknowledged`}
          control={control}
          defaultValue={false} // Set the default value of the checkbox
          render={({ field }) => (
            <FormGroup>
              <FormControlLabel
                control={<Checkbox {...field} />}
                label="Service Cost Acknowledged?"
              />
            </FormGroup>
          )}
        />
      </Box>

      <Box sx={{ mb: "1rem" }}>
        <FormLabel
          id="date"
          sx={{ mb: "10px", color: "black", display: "block" }}
        >
          Date Needed By
        </FormLabel>
        <Controller
          name={`products.${index}.dateNeededBy`}
          control={control}
          // defaultValue={customDate(new Date())}
          rules={{ required: true }}
          render={({ field }) => (
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                onChange={(newValue) =>
                  field.onChange(dayjs(newValue).format("YYYY/MM/DD"))
                }
                {...field}
                renderInput={(params) => (
                  <TextField
                    id="dateNeededBy"
                    variant="outlined"
                    type="date"
                    sx={{
                      "& .MuiInputBase-root": {
                        height: "2.3rem !important",
                      },
                    }}
                    {...params}
                  />
                )}
              />
            </LocalizationProvider>
          )}
        />
      </Box>

      <Controller
        control={control}
        name={`products.${index}.specialInstructions`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="specialInstructions"
            variant="outlined"
            fullWidth
            label="Special Instructions"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />
    </Box>
  );
};

export default GraphicForm;
