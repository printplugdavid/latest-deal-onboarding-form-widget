import React from "react";
import {
  Autocomplete,
  Box,
  Checkbox,
  FormControlLabel,
  FormGroup,
  FormLabel,
  TextField,
} from "@mui/material";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";

const OnlineStorefrontForm = ({ index }) => {
  const { control } = useFormContext();

  const areGraphicsPrintReady = useWatch({
    control,
    name: `products.${index}.areGraphicsPrintReady`,
  });

  const desiredLiveDate = useWatch({
    control,
    name: `products.${index}.desiredLiveDate`,
  });

  const isStorefrontTemporaryOrEvergreen = useWatch({
    control,
    name: `products.${index}.isStorefrontTemporaryOrEvergreen`,
  });

  const markUpProducts = useWatch({
    control,
    name: `products.${index}.markUpProducts`,
  });

  const customFieldsOrNotes = useWatch({
    control,
    name: `products.${index}.customFieldsOrNotes`,
  });

  const anyOtherLinks = useWatch({
    control,
    name: `products.${index}.anyOtherLinks`,
  });

  return (
    <Box sx={{ width: "100%" }}>
      {/* 1. Preferred Online Suffix */}
      <Controller
        control={control}
        name={`products.${index}.preferredOnlineSuffix`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            size="small"
            id="preferredOnlineSuffix"
            variant="outlined"
            fullWidth
            label="Preferred Online Suffix (theprintplug.online/______)"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {/* 2. Contact Phone # for Storefront */}
      <Controller
        control={control}
        name={`products.${index}.contactPhoneForStorefront`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            size="small"
            id="contactPhoneForStorefront"
            variant="outlined"
            fullWidth
            label="Contact Phone # for Storefront"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {/* 3. Contact Email for Storefront */}
      <Controller
        control={control}
        name={`products.${index}.contactEmailForStorefront`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            size="small"
            id="contactEmailForStorefront"
            variant="outlined"
            fullWidth
            label="Contact Email for Storefront"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {/* 4. Company Address for Storefront (multi-line) */}
      <Controller
        control={control}
        name={`products.${index}.companyAddressForStorefront`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="companyAddressForStorefront"
            variant="outlined"
            fullWidth
            label="Company Address for Storefront"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {/* 5. Specific Products on Storefront (multi-line) */}
      <Controller
        control={control}
        name={`products.${index}.specificProductsOnStorefront`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="specificProductsOnStorefront"
            variant="outlined"
            fullWidth
            label="Specific Products on Storefront (SKU, Style #, etc.)"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {/* 5. Specific Product Base Pricing (multi-line) */}
      <Controller
        control={control}
        name={`products.${index}.specificProductBasePricing`}
        defaultValue=""
        render={({ field }) => (
          <TextField
            multiline
            rows={3}
            size="small"
            id="specificProductBasePricing"
            variant="outlined"
            fullWidth
            label="Specific Product Base Pricing"
            {...field}
            sx={{ mb: "1rem", mt: "5px" }}
          />
        )}
      />

      {/* 6. Print Applications for Products (multi-select) */}
      <Controller
        name={`products.${index}.printApplicationsForProducts`}
        control={control}
        defaultValue={[]}
        render={({ field }) => (
          <Autocomplete
            multiple
            id="printApplicationsForProducts"
            size="small"
            options={[
              "Embroidery",
              "Screen Print",
              "Digital Print",
              "Signage / Promotional Products",
            ]}
            value={field.value || []}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Print Applications for Products"
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />

      {/* 6. Are Your Graphics Print-Ready? (Yes/No → No → Upcharge checkbox) */}
      <Controller
        control={control}
        name={`products.${index}.areGraphicsPrintReady`}
        defaultValue=""
        render={({ field }) => (
          <Autocomplete
            {...field}
            options={["Yes", "No"]}
            value={field.value || ""}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Are Your Graphics Print-Ready?"
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />

      {areGraphicsPrintReady === "No" && (
        <Controller
          control={control}
          name={`products.${index}.upchargeForGraphicDesign`}
          defaultValue={false}
          render={({ field }) => (
            <FormGroup>
              <FormControlLabel
                control={<Checkbox {...field} />}
                label="Upcharge for Graphic Design?"
              />
            </FormGroup>
          )}
        />
      )}

      {/* 7. Do You Have a Desired Live Date? (Yes → Storefront Live Date picker) */}
      <Controller
        control={control}
        name={`products.${index}.desiredLiveDate`}
        defaultValue=""
        render={({ field }) => (
          <Autocomplete
            {...field}
            options={["Yes", "No"]}
            value={field.value || ""}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Do You Have a Desired Live Date?"
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />

      {desiredLiveDate === "Yes" && (
        <Box sx={{ mb: "1rem" }}>
          <FormLabel sx={{ mb: "10px", color: "black", display: "block" }}>
            Storefront Live Date
          </FormLabel>
          <Controller
            name={`products.${index}.storefrontLiveDate`}
            control={control}
            render={({ field }) => (
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DatePicker
                  onChange={(newValue) =>
                    field.onChange(dayjs(newValue).format("YYYY/MM/DD"))
                  }
                  {...field}
                  renderInput={(params) => (
                    <TextField
                      id="storefrontLiveDate"
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
      )}

      {/* 8. Is the Storefront Temporary or Evergreen? (Yes → Storefront End Date picker) */}
      <Controller
        control={control}
        name={`products.${index}.isStorefrontTemporaryOrEvergreen`}
        defaultValue=""
        render={({ field }) => (
          <Autocomplete
            {...field}
            options={["Yes", "No"]}
            value={field.value || ""}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Is the Storefront Temporary or Evergreen?"
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />

      {isStorefrontTemporaryOrEvergreen === "Yes" && (
        <Box sx={{ mb: "1rem" }}>
          <FormLabel sx={{ mb: "10px", color: "black", display: "block" }}>
            Storefront End Date
          </FormLabel>
          <Controller
            name={`products.${index}.storefrontEndDate`}
            control={control}
            render={({ field }) => (
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DatePicker
                  onChange={(newValue) =>
                    field.onChange(dayjs(newValue).format("YYYY/MM/DD"))
                  }
                  {...field}
                  renderInput={(params) => (
                    <TextField
                      id="storefrontEndDate"
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
      )}

      {/* 9. Mark Up Products? (Yes → Percentage to Mark Up single line) */}
      <Controller
        control={control}
        name={`products.${index}.markUpProducts`}
        defaultValue=""
        render={({ field }) => (
          <Autocomplete
            {...field}
            options={["Yes", "No"]}
            value={field.value || ""}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Mark Up Products?"
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />

      {markUpProducts === "Yes" && (
        <Controller
          control={control}
          name={`products.${index}.percentageToMarkUp`}
          defaultValue=""
          render={({ field }) => (
            <TextField
              size="small"
              id="percentageToMarkUp"
              variant="outlined"
              fullWidth
              label="Percentage to Mark Up"
              {...field}
              sx={{ mb: "1rem", mt: "5px" }}
            />
          )}
        />
      )}

      {/* 10. Do You Want Your Products to Be Customizable? (no branching) */}
      <Controller
        control={control}
        name={`products.${index}.productsCustomizable`}
        defaultValue=""
        render={({ field }) => (
          <Autocomplete
            {...field}
            options={["Yes", "No"]}
            value={field.value || ""}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Do You Want Your Products to Be Customizable?"
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />

      {/* 11. Are There Any Custom Fields or Notes? (Yes → Please List Special Fields multiline) */}
      <Controller
        control={control}
        name={`products.${index}.customFieldsOrNotes`}
        defaultValue=""
        render={({ field }) => (
          <Autocomplete
            {...field}
            options={["Yes", "No"]}
            value={field.value || ""}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Are There Any Custom Fields or Notes You Would Like on Your Page?"
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />

      {customFieldsOrNotes === "Yes" && (
        <Controller
          control={control}
          name={`products.${index}.pleaseListSpecialFields`}
          defaultValue=""
          render={({ field }) => (
            <TextField
              multiline
              rows={3}
              size="small"
              id="pleaseListSpecialFields"
              variant="outlined"
              fullWidth
              label="Please List Special Fields"
              {...field}
              sx={{ mb: "1rem", mt: "5px" }}
            />
          )}
        />
      )}

      {/* 12. How Would You Like To Fulfill Orders? (multi-select) */}
      <Controller
        name={`products.${index}.howToFulfillOrders`}
        control={control}
        defaultValue={[]}
        render={({ field }) => (
          <Autocomplete
            multiple
            id="howToFulfillOrders"
            size="small"
            options={[
              "We Ship Products to Customers",
              "Customers Pick Up From Us",
              "You Pick Up From Us",
            ]}
            value={field.value || []}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="How Would You Like To Fulfill Orders?"
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />

      {/* 13. Would You Like To Include Any Other Links? (Yes → Please Provide Links multiline) */}
      <Controller
        control={control}
        name={`products.${index}.anyOtherLinks`}
        defaultValue=""
        render={({ field }) => (
          <Autocomplete
            {...field}
            options={["Yes", "No"]}
            value={field.value || ""}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Would You Like To Include Any Other Links On Your Storefront?"
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />

      {anyOtherLinks === "Yes" && (
        <Controller
          control={control}
          name={`products.${index}.pleaseProvideLinks`}
          defaultValue=""
          render={({ field }) => (
            <TextField
              multiline
              rows={3}
              size="small"
              id="pleaseProvideLinks"
              variant="outlined"
              fullWidth
              label="Please Provide Links"
              {...field}
              sx={{ mb: "1rem", mt: "5px" }}
            />
          )}
        />
      )}

      {/* 14. Do You Have any Banners or Graphics? (single select, 3 options) */}
      <Controller
        control={control}
        name={`products.${index}.bannersOrGraphics`}
        defaultValue=""
        render={({ field }) => (
          <Autocomplete
            {...field}
            options={[
              "Yes",
              "No",
              "We Build The Graphics (Starting at $50 Graphic Design Fee)",
            ]}
            value={field.value || ""}
            onChange={(_, newValue) => field.onChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Do You Have any Banners or Graphics You Want Displayed on Your Website?"
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: "1rem", mt: "5px" }}
              />
            )}
          />
        )}
      />
    </Box>
  );
};

export default OnlineStorefrontForm;
