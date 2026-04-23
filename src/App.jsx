import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  FormLabel,
  TextField,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { useFieldArray } from "react-hook-form";
import GarmentForm from "./components/GarmentForm";
import NonGarmentForm from "./components/NonGarmentForm";
import GraphicForm from "./components/GraphicForm";
import OnlineStorefrontForm from "./components/OnlineStorefrontForm";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";

const ZOHO = window.ZOHO;

function App() {
  const [initialized, setInitialized] = useState(false); // initialize the widget
  const [entity, setEntity] = useState(null); // keeps the module
  const [entityId, setEntityId] = useState(null); // keeps the module id
  const [recordData, setRecordData] = useState(null); // holds record response

  const [options, setOptions] = useState(null);

  const [attachments, setAttachments] = useState([]);
  const [fileError, setFileError] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // initialize the app
    ZOHO.embeddedApp.on("PageLoad", function (data) {
      ZOHO.CRM.UI.Resize({ height: "90%", width: "60%" }); // resize the widget window
      setEntity(data?.Entity);
      setEntityId(data?.EntityId?.[0]);

      setInitialized(true);
    });

    ZOHO.embeddedApp.init();
  }, []);

  useEffect(() => {
    // get all data
    if (initialized) {
      const fetchData = async () => {
        const recordResp = await ZOHO.CRM.API.getRecord({
          Entity: entity,
          approved: "both",
          RecordID: entityId,
        });
        setRecordData(recordResp?.data?.[0]);

        const variableResp = await ZOHO.CRM.API.getOrgVariable("products");
        let optionsList = variableResp?.Success?.Content?.split(",");
        setOptions(optionsList);
        // console.log(variableResp?.Success?.Content);
      };

      fetchData();
    }
  }, [initialized]);

  const methods = useForm({
    defaultValues: {
      contactInfo: {
        Account_Name: recordData?.Account_Name?.name,
        Deal_Name: recordData?.Deal_Name,
        Contact_Name: recordData?.Contact_Name?.name,
        Contact_Phone: recordData?.Contact_Phone,
        Contact_Email: recordData?.Contact_Email,
        Sales_Person: recordData?.Sales_Person,
      },
    },
  });

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = methods;

  const {
    fields: productFields,
    append,
    remove,
  } = useFieldArray({
    control,
    name: "products",
  });

  const hardDueDate = useWatch({
    control,
    name: `hardDueDate`,
  });

  const doProductsNeedShipped = useWatch({
    control,
    name: `doProductsNeedShipped`,
  });

  const discountsForExtendedTurnaround = useWatch({
    control,
    name: `discountsForExtendedTurnaround`,
  });

  const howDidYouHearAboutUs = useWatch({
    control,
    name: `howDidYouHearAboutUs`,
  });

  const customDate = (date) => {
    const dateObj = new Date(date);
    let year = dateObj.getFullYear();
    let month = dateObj.getMonth();
    let day = dateObj.getDate();
    return `${year}-${month + 1}-${day < 10 ? `0${day}` : day}`;
  };

  function hexToText(hex) {
    var result = "";
    for (var i = 0; i < hex.length; i += 2) {
      result += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return result;
  }

  // Example usage
  var newLine = hexToText("0A");

  const onSubmit = async (data) => {
    setLoading(true);
    console.log("Collected Form Data:", data);
    // start mapping and extracting fields
    let content =
      "CONTACT INFO" +
      newLine +
      "---------------------------" +
      newLine +
      newLine +
      "Account Name: " +
      data?.contactInfo?.Account_Name +
      newLine +
      newLine +
      "Contact Name: " +
      data?.contactInfo?.Contact_Name +
      newLine +
      newLine +
      "Contact Phone: " +
      data?.contactInfo?.Contact_Phone +
      newLine +
      newLine +
      "Contact Email: " +
      data?.contactInfo?.Contact_Email +
      newLine +
      newLine +
      "Deal Name: " +
      data?.contactInfo?.Deal_Name +
      newLine +
      newLine +
      "Sales Person: " +
      data?.contactInfo?.Sales_Person +
      newLine +
      newLine +
      newLine +
      "PRODUCT INFORMATION" +
      newLine +
      "---------------------------" +
      newLine +
      newLine +
      "Selected Product Types: " +
      data?.products?.map((product) => product?.productName)?.join(", ") +
      newLine +
      newLine;

    data?.products?.forEach((product, index) => {
      let productName = product?.productName;
      content =
        content +
        "Product " +
        (index + 1) +
        ": " +
        productName +
        newLine +
        "---------------------------" +
        newLine +
        newLine;

      let productType = product?.productType;
      if (productType === "garment") {
        content =
          content +
          "Garment & Graphic Information" +
          newLine +
          "---------------------------" +
          newLine +
          newLine +
          "Number of Garment Types: " +
          product?.numberOfGarmentTypes +
          newLine +
          newLine;

        if (Number(product?.numberOfGarmentTypes) > 0) {
          product?.primaryBranches?.forEach((branch, branchIndex) => {
            content =
              content +
              "Garment " +
              (branchIndex + 1) +
              ":" +
              newLine +
              "---------------------------" +
              newLine +
              newLine +
              "Garment Type (Brand / Style): " +
              branch?.garmentType +
              newLine +
              newLine +
              "Total Count, Colors & Sizes: " +
              branch?.countColorSize +
              newLine +
              newLine +
              "Graphic & Placement Information" +
              newLine +
              "---------------------------" +
              newLine +
              newLine +
              "Number of Graphics: " +
              branch?.numberOfGraphics +
              newLine +
              newLine;

            if (Number(branch?.numberOfGraphics) > 0) {
              branch?.secondaryBranches?.forEach(
                (subBranch, subBranchIndex) => {
                  content =
                    content +
                    "Graphic " +
                    (subBranchIndex + 1) +
                    ":" +
                    newLine +
                    "---------------------------" +
                    newLine +
                    newLine +
                    "Graphic Description: " +
                    subBranch?.graphicDescription +
                    newLine +
                    newLine +
                    "Is Graphic Print Ready?: " +
                    subBranch?.isGraphicPrintReady +
                    newLine +
                    newLine +
                    "Current Graphic Format: " +
                    subBranch?.currentGraphicFormat +
                    newLine +
                    newLine +
                    "Fine Detail?: " +
                    subBranch?.fineDetail +
                    newLine +
                    newLine;

                  if (subBranch?.fineDetail === "Yes") {
                    content =
                      content +
                      "Depending on current inventory, embroidery jobs with fine detail incur an upcharge for specialty thread: " +
                      subBranch?.specialtyThread +
                      newLine +
                      newLine;
                  }

                  content =
                    content +
                    "Upcharge Acknowledged?: " +
                    subBranch?.upchargeAcknowledged +
                    newLine +
                    newLine +
                    "Number Of Colors Used: " +
                    subBranch?.numberOfColorsUsed +
                    newLine +
                    newLine +
                    "Colors Used (Threads / PANTONES): " +
                    subBranch?.colorsUsed +
                    newLine +
                    newLine +
                    "Color Change?: " +
                    subBranch?.colorChange +
                    newLine +
                    newLine;

                  if (subBranch?.colorChange === "Yes") {
                    content =
                      content +
                      "Please Provide Details Of Color Change: " +
                      subBranch?.detailsOfColorChange +
                      newLine +
                      newLine;
                  }

                  content =
                    content +
                    "Fonts Used: " +
                    subBranch?.fontsUsed +
                    newLine +
                    newLine +
                    "Number Of Placements: " +
                    subBranch?.numberOfPlacements +
                    newLine +
                    newLine;

                  if (Number(subBranch?.numberOfPlacements) > 0) {
                    subBranch?.tartiaryBranches.forEach(
                      (subSubBranch, subSubBranchIndex) => {
                        content =
                          content +
                          "Placement " +
                          (subSubBranchIndex + 1) +
                          ":" +
                          newLine +
                          "---------------------------" +
                          newLine +
                          newLine +
                         "Placement Location: " +
                          subSubBranch?.placementLocation +
                          newLine +
                          newLine +
                          "Sizes & Dimensions: " +
                          subSubBranch?.sizeAndDimensions +
                          newLine +
                          newLine +
                          "Placement Size: " +
                          subSubBranch?.placementSize +
                          newLine +
                          newLine;
                      },
                    );
                  }
                },
              );
            }

            content =
              content +
              "Is This Garment Used With Other Application Types?: " +
              branch?.isUsedInOtherAppTypes +
              newLine +
              newLine;

            if (branch?.isUsedInOtherAppTypes === "Yes") {
              content =
                content +
                "Please Choose Application Type: " +
                branch?.chooseApplicationType +
                newLine +
                newLine;
            }

            content =
              content +
              "Vendors Used: " +
              branch?.vendorsUsed +
              newLine +
              newLine +
              "Special Instructions / Considerations: " +
              branch?.specialInstructions +
              newLine +
              newLine;
          });
        }

        content =
          content +
          "Other Information: " +
          product?.otherInformation +
          newLine +
          newLine +
          newLine;
      } else if (productType === "nongarment") {
        content =
          content +
          "Graphic Information" +
          newLine +
          "---------------------------" +
          newLine +
          newLine +
          "Number of Graphics: " +
          product?.numberOfGraphics +
          newLine +
          newLine;

        if (Number(product?.numberOfGraphics) > 0) {
          product?.branches?.forEach((branch, branchIndex) => {
            content =
              content +
              "Graphic " +
              (branchIndex + 1) +
              ": " +
              newLine +
              "---------------------------" +
              newLine +
              newLine +
              "Graphic Description: " +
              branch?.graphicDescription +
              newLine +
              newLine +
              "Is Graphic Print Ready?: " +
              branch?.isGraphicPrintReady +
              newLine +
              newLine +
              "Number of Colors Used: " +
              branch?.numberOfColorsUsed +
              newLine +
              newLine +
              "Colors Used: " +
              branch?.colorsUsed +
              newLine +
              newLine +
              "Current Graphic Format: " +
              branch?.currentGraphicFormat +
              newLine +
              newLine +
              "Upcharge Acknowledged?: " +
              branch?.upchargedAcknowledged +
              newLine +
              newLine +
              "Fonts Used: " +
              branch?.fontsUsed +
              newLine +
              newLine;
          });
        }

        content =
          content +
          "Quantity & Variables" +
          newLine +
          newLine +
          "Quantity Ordered: " +
          product?.quantityOrdered +
          newLine +
          newLine +
          "Dimensions: " +
          product?.dimensions +
          newLine +
          newLine +
          "# Of Sides: " +
          product?.numberOfSides +
          newLine +
          newLine +
          "Special Instructions: " +
          product?.specialInstructions +
          newLine +
          newLine +
          "Vendor Information" +
          newLine +
          newLine +
          "Is Outsourced?: " +
          product?.isOutsourced +
          newLine +
          newLine +
          "Vendors Used: " +
          product?.vendorsUsed +
          newLine +
          newLine +
          newLine;
      } else if (productType === "onlinestorefront") {
        content =
          content +
          "Online Storefront Information" +
          newLine +
          "---------------------------" +
          newLine +
          newLine +
          "Preferred Online Suffix: " +
          product?.preferredOnlineSuffix +
          newLine +
          newLine +
          "Contact Phone # for Storefront: " +
          product?.contactPhoneForStorefront +
          newLine +
          newLine +
          "Contact Email for Storefront: " +
          product?.contactEmailForStorefront +
          newLine +
          newLine +
          "Company Address for Storefront: " +
          product?.companyAddressForStorefront +
          newLine +
          newLine +
          "Specific Products on Storefront: " +
          product?.specificProductsOnStorefront +
          newLine +
          newLine +
          "Specific Product Base Pricing: " +
          product?.specificProductBasePricing +
          newLine +
          newLine +
          "Print Applications for Products: " +
          product?.printApplicationsForProducts?.join(", ") +
          newLine +
          newLine +
          "Are Your Graphics Print-Ready?: " +
          product?.areGraphicsPrintReady +
          newLine +
          newLine;

        if (product?.areGraphicsPrintReady === "No") {
          content =
            content +
            "Upcharge for Graphic Design?: " +
            product?.upchargeForGraphicDesign +
            newLine +
            newLine;
        }

        content =
          content +
          "Do You Have a Desired Live Date?: " +
          product?.desiredLiveDate +
          newLine +
          newLine;

        if (product?.desiredLiveDate === "Yes") {
          content =
            content +
            "Storefront Live Date: " +
            customDate(product?.storefrontLiveDate) +
            newLine +
            newLine;
        }

        content =
          content +
          "Is the Storefront Temporary or Evergreen?: " +
          product?.isStorefrontTemporaryOrEvergreen +
          newLine +
          newLine;

        if (product?.isStorefrontTemporaryOrEvergreen === "Yes") {
          content =
            content +
            "Storefront End Date: " +
            customDate(product?.storefrontEndDate) +
            newLine +
            newLine;
        }

        content =
          content +
          "Mark Up Products?: " +
          product?.markUpProducts +
          newLine +
          newLine;

        if (product?.markUpProducts === "Yes") {
          content =
            content +
            "Percentage to Mark Up: " +
            product?.percentageToMarkUp +
            newLine +
            newLine;
        }

        content =
          content +
          "Do You Want Your Products to Be Customizable?: " +
          product?.productsCustomizable +
          newLine +
          newLine +
          "Are There Any Custom Fields or Notes You Would Like on Your Page?: " +
          product?.customFieldsOrNotes +
          newLine +
          newLine;

        if (product?.customFieldsOrNotes === "Yes") {
          content =
            content +
            "Please List Special Fields: " +
            product?.pleaseListSpecialFields +
            newLine +
            newLine;
        }

        content =
          content +
          "How Would You Like To Fulfill Orders?: " +
          product?.howToFulfillOrders?.join(", ") +
          newLine +
          newLine +
          "Would You Like To Include Any Other Links On Your Storefront?: " +
          product?.anyOtherLinks +
          newLine +
          newLine;

        if (product?.anyOtherLinks === "Yes") {
          content =
            content +
            "Please Provide Links: " +
            product?.pleaseProvideLinks +
            newLine +
            newLine;
        }

        content =
          content +
          "Do You Have any Banners or Graphics You Want Displayed on Your Website?: " +
          product?.bannersOrGraphics +
          newLine +
          newLine +
          newLine;
      } else if (productType === "graphic") {
        content =
          content +
          "Graphic Description: " +
          product?.graphicDescription +
          newLine +
          newLine +
          "Design Service Needed?: " +
          product?.designServiceNeeded +
          newLine +
          newLine +
          "Design Assets Provided?: " +
          product?.designAssetsProvided +
          newLine +
          newLine +
          "Desired Graphic Application: " +
          product?.desiredGraphicApplication +
          newLine +
          newLine +
          "Fonts Used: " +
          product?.fontsUsed +
          newLine +
          newLine +
          "Estimated Design Hours: " +
          product?.estimatedDesignHours +
          newLine +
          newLine +
          "Service Cost Acknowledged?: " +
          product?.serviceCostAcknowledged +
          newLine +
          newLine +
          "Date Needed By: " +
          customDate(product?.dateNeededBy) +
          newLine +
          newLine +
          "Special Instructions: " +
          product?.specialInstructions +
          newLine +
          newLine +
          newLine;
      }
    });

    content =
      content +
      "OTHER INFORMATION" +
      newLine +
      "---------------------------" +
      newLine +
      newLine +
      "How Did You Hear About Us?: " +
      data?.howDidYouHearAboutUs +
      newLine +
      newLine;

    if (data?.howDidYouHearAboutUs === "Other") {
      content =
        content +
        "Detail Lead Source: " +
        data?.detailLeadSource +
        newLine +
        newLine;
    }

    content =
      content +
      "Supplies / Materials Needed: " +
      data?.suppliesMaterialsNeeded +
      newLine +
      newLine +
      "Special Instructions: " +
      data?.specialInstructions +
      newLine +
      newLine +
      "Is This a Repeat Order?: " +
      data?.isRepeatOrder +
      newLine +
      newLine +
      "Do Products Need Shipped?: " +
      data?.doProductsNeedShipped +
      newLine +
      newLine;

    if (data?.doProductsNeedShipped === "Yes") {
      content =
        content +
        "Shipping Contact & Address: " +
        data?.shippingContactAddress +
        newLine +
        newLine +
        "Other Shipping Details: " +
        data?.otherShippingDetails +
        newLine +
        newLine;
    }

    content =
      content +
      "Customer Consents to Email and Text?: " +
      data?.customerConsentsToEmailAndText +
      newLine +
      newLine +
      "Round up for Charity?: " +
      data?.roundUpForCharity +
      newLine +
      newLine +
      newLine +
      "TURNAROUND TIME" +
      newLine +
      "---------------------------" +
      newLine +
      newLine +
      "Does Customer Have A Hard Due Date?: " +
      data?.hardDueDate +
      newLine +
      newLine;

    if (data?.hardDueDate === "Yes") {
      content =
        content +
        "Due Date: " +
        customDate(data?.dueDate) +
        newLine +
        newLine +
        "Upcharged For Rush Turnaround Time?: " +
        data?.upchargedForRushTurnaround +
        newLine +
        newLine;
    }

    if (data?.hardDueDate === "No") {
      content =
        content +
        "Discounts for Extended Turnaround Time?: " +
        data?.discountsForExtendedTurnaround +
        newLine +
        newLine;

      if (data?.discountsForExtendedTurnaround === "Yes") {
        content =
          content +
          "Add 1 Week To Production Time?: " +
          data?.addOneWeekToProductionTime +
          newLine +
          newLine;
      }

      if (data?.discountsForExtendedTurnaround === "No") {
        content =
          content +
          "10-14 Business Day Turnaround?: " +
          data?.tenFourteenBusinessDayTurnaround +
          newLine +
          newLine;
      }
    }

    content =
      content +
      "Custmer Acknowledged 24-48 Hour Mock-Up?: " +
      data?.typicalMockup;

    // PRINT COUNT CALCULATION
    let vinylDeptPrints = 0;
    let embroideryPrints = 0;
    let screenPrintPrints = 0;

    const embroideryDeptProducts = ["Embroidery", "Pressed Patches"];
    const vinylColorProducts = ["Vinyl", "Heat-Transfer"];
    const screenPrintProducts = ["Screen Printing"];

    data?.products?.forEach((product) => {
      if (product?.productType === "garment") {
        const pName = product?.productName;
        product?.primaryBranches?.forEach((branch) => {
          const qty = parseInt(branch?.garmentQuantity) || 0;
          branch?.secondaryBranches?.forEach((graphic) => {
            const colors = parseInt(graphic?.numberOfColorsUsed) || 1;
            const placements = parseInt(graphic?.numberOfPlacements) || 0;
            const underbase = graphic?.underbase;
            const underbaseValue = underbase === "Single-pass" ? 1 : underbase === "Full three-pass" ? 3 : 0;

            if (screenPrintProducts.includes(pName)) {
              screenPrintPrints += qty * (colors * placements + underbaseValue);
            } else if (embroideryDeptProducts.includes(pName)) {
              embroideryPrints += qty * placements;
            } else if (vinylColorProducts.includes(pName)) {
              vinylDeptPrints += qty * colors * placements;
            } else {
              // DTG, DTF, Heat-Transfer, etc.
              vinylDeptPrints += qty * placements;
            }
          });
        });
      }
    });

    const totalPrints = vinylDeptPrints + embroideryPrints + screenPrintPrints;

    content =
      content +
      newLine + newLine +
      "PRINT COUNT SUMMARY" + newLine +
      "---------------------------" + newLine + newLine +
      "Vinyl Department Prints: " + vinylDeptPrints + newLine + newLine +
      "Embroidery Department Prints: " + embroideryPrints + newLine + newLine +
      "Screen Print Prints: " + screenPrintPrints + newLine + newLine +
      "Total Prints (All Departments): " + totalPrints;
    // go for API call
    // Attempt to update Deal print count fields — silent fallback if fields don't exist yet
    try {
      await ZOHO.CRM.API.updateRecord({
        Entity: entity,
        APIData: {
          id: entityId,
          Vinyl_Department_Prints: vinylDeptPrints,
          Embroidery_Department_Prints: embroideryPrints,
          Screen_Print_Prints: screenPrintPrints,
        }
      });
    } catch (err) {
      console.log("Print count fields not yet on layout — skipping field update:", err);
    }

    const response = await ZOHO.CRM.API.addNotes({
      Entity: entity,
      RecordID: entityId,
      Title: "DEAL ONBOARDING FORM",
      Content: content,
    });
    console.log(response);
    if (response?.data?.[0]?.code) {
      // ZOHO.CRM.UI.Popup.closeReload();
      const noteId = response?.data?.[0]?.details?.id;
      if (noteId !== null || noteId !== undefined) {
        // work on uploading attachments
        if (attachments.length > 0) {
          for (let i = 0; i < attachments.length; i++) {
            const file = attachments[i];
            const fileName = file.name;
            const blob = await file.arrayBuffer(); // Convert to Blob content

            const fileContent = new Blob([blob], { type: file.type });

            try {
              const response = await ZOHO.CRM.API.attachFile({
                Entity: "Notes",
                RecordID: noteId,
                File: {
                  Name: fileName,
                  Content: fileContent,
                },
              });

              if (i === attachments.length - 1) {
                ZOHO.CRM.UI.Popup.closeReload();
                setLoading(false);
              }
            } catch (err) {
              console.error("Upload failed for", fileName, err);
            }
          }
        } else {
          // No attachments, just close
          ZOHO.CRM.UI.Popup.closeReload();
          setLoading(false);
        }
      }
    }
  };

  if (recordData && options) {
    return (
      <Box sx={{ width: "100%" }}>
        <FormProvider {...methods}>
          <Box
            sx={{
              width: "90%",
              mx: "auto",
              bgcolor: "#F5F5F5",
              px: 2,
              py: 2,
              mb: 2,
            }}
            component="form"
            onSubmit={handleSubmit(onSubmit)}
          >
            <Typography
              sx={{
                textAlign: "center",
                pb: "1.5rem",
                fontWeight: "bold",
                fontSize: "1.5rem",
              }}
            >
              Deal Onboarding Form
            </Typography>

            <Typography
              variant="p"
              sx={{
                pt: "1rem",
                pb: "2rem",
                fontSize: "1.2rem",
                fontWeight: "bold",
              }}
            >
              CONTACT INFO
            </Typography>

            <Box sx={{ width: "100%", mt: 2 }}>
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                  mb: 2,
                }}
              >
                <Controller
                  control={control}
                  name="contactInfo.Account_Name"
                  defaultValue={recordData?.Account_Name?.name}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Account_Name"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Account Name"
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="contactInfo.Deal_Name"
                  defaultValue={recordData?.Deal_Name}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Deal_Name"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Deal Name"
                    />
                  )}
                />
              </Box>

              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                  mb: 2,
                }}
              >
                <Controller
                  control={control}
                  name="contactInfo.Contact_Name"
                  defaultValue={recordData?.Contact_Name?.name}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Contact_Name"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Contact Name"
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="contactInfo.Contact_Phone"
                  defaultValue={recordData?.Contact_Phone || ""}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Contact_Phone"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Contact Phone"
                    />
                  )}
                />
              </Box>

              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 1,
                  mb: 2,
                }}
              >
                <Controller
                  control={control}
                  name="contactInfo.Contact_Email"
                  defaultValue={recordData?.Contact_Email}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Contact_Email"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Contact Email"
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="contactInfo.Sales_Person"
                  defaultValue={recordData?.Sales_Person || ""}
                  render={({ field }) => (
                    <TextField
                      size="small"
                      id="Sales_Person"
                      variant="outlined"
                      fullWidth
                      {...field}
                      label="Sales Person"
                    />
                  )}
                />
              </Box>
            </Box>

            <Typography
              variant="p"
              sx={{
                pt: "1rem",
                pb: "2rem",
                fontSize: "1.2rem",
                fontWeight: "bold",
                mt: 4,
              }}
            >
              Product Information
            </Typography>

            <Typography
              sx={{
                pt: "1rem",
                pb: "2rem",
                fontSize: "1rem",
                fontWeight: "bold",
              }}
            >
              Services / Printing Applications
            </Typography>

            <Controller
              name="productSelector"
              control={control}
              defaultValue={[]}
              render={({ field }) => (
                <Autocomplete
                  multiple
                  options={options || []}
                  value={field.value || []}
                  onChange={(e, newValue) => {
                    field.onChange(newValue);

                    const existingProductNames =
                      watch("products")?.map(
                        (p) => p.productName + "#" + p.productType,
                      ) || [];

                    const newProductsToAdd = newValue.filter(
                      (val) => !existingProductNames.includes(val),
                    );

                    // Add split product info
                    newProductsToAdd.forEach((combined) => {
                      const [productName, productType] = combined.split("#");
                      append({ productName, productType });
                    });

                    // Remove deselected items
                    const removed = existingProductNames.filter(
                      (pt) => !newValue.includes(pt),
                    );
                    removed.forEach((pt) => {
                      const [productName, productType] = pt.split("#");
                      const indexToRemove = watch("products")?.findIndex(
                        (p) =>
                          p.productName === productName &&
                          p.productType === productType,
                      );
                      if (indexToRemove !== -1) remove(indexToRemove);
                    });
                  }}
                  getOptionLabel={(option) => option.split("#")[0]} // only show product name
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Select Product Types"
                      size="small"
                    />
                  )}
                />
              )}
            />

            {productFields.map((item, index) => {
              const productType = watch(`products.${index}.productType`);
              const productName = watch(`products.${index}.productName`);

              return (
                <Box
                  key={item.id}
                  sx={{ border: "1px solid #ccc", p: 2, my: 2 }}
                >
                  <Box
                    mb={2}
                    sx={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Typography fontWeight="bold">
                      {productName} ({productType})
                    </Typography>

                    <Button
                      type="button"
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => {
                        const currentSelection = watch("productSelector") || [];
                        const toRemove = `${productName}#${productType}`;
                        const updatedSelection = currentSelection.filter(
                          (v) => v !== toRemove,
                        );
                        setValue("productSelector", updatedSelection);
                        remove(index);
                      }}
                    >
                      Remove
                    </Button>
                  </Box>

                  {productType === "garment" && (
                    <GarmentForm
                      index={index}
                      options={options}
                      productName={productName}
                    />
                  )}

                  {productType === "nongarment" && (
                    <NonGarmentForm index={index} />
                  )}

                  {productType === "graphic" && <GraphicForm index={index} />}

                  {productType === "onlinestorefront" && (
                    <OnlineStorefrontForm index={index} />
                  )}
                </Box>
              );
            })}

            <Typography
              sx={{
                pt: "1rem",
                fontSize: "1.2rem",
                fontWeight: "bold",
              }}
            >
              Other Information
            </Typography>

            <Controller
              control={control}
              name="howDidYouHearAboutUs"
              defaultValue={""}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="howDidYouHearAboutUs"
                  size="small"
                  options={[
                    "Google",
                    "Facebook",
                    "Yelp",
                    "Bing",
                    "Referall",
                    "Cold Call",
                    "Previous Customer",
                    "Other",
                  ]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="How Did You Hear About Us?"
                    />
                  )}
                />
              )}
            />

            {howDidYouHearAboutUs === "Other" && (
              <Controller
                control={control}
                name="detailLeadSource"
                defaultValue=""
                render={({ field }) => (
                  <TextField
                    multiline
                    rows={3}
                    size="small"
                    id="detailLeadSource"
                    variant="outlined"
                    fullWidth
                    label="Detail Lead Source"
                    {...field}
                    sx={{ mb: "1rem", mt: "5px" }}
                  />
                )}
              />
            )}

            <Controller
              control={control}
              name={`suppliesMaterialsNeeded`}
              defaultValue=""
              render={({ field }) => (
                <TextField
                  multiline
                  rows={3}
                  size="small"
                  id="suppliesMaterialsNeeded"
                  variant="outlined"
                  fullWidth
                  label="Supplies / Materials Needed"
                  {...field}
                  sx={{ mb: "1rem", mt: "5px" }}
                />
              )}
            />

            <Controller
              control={control}
              name={`specialInstructions`}
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

            <Controller
              control={control}
              name="isRepeatOrder"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="isRepeatOrder"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Is This a Repeat Order?"
                    />
                  )}
                />
              )}
            />

            <Controller
              control={control}
              name="doProductsNeedShipped"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="doProductsNeedShipped"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Do Products Need Shipped?"
                    />
                  )}
                />
              )}
            />

            {doProductsNeedShipped === "Yes" && (
              <>
                <Controller
                  control={control}
                  name="shippingContactAddress"
                  defaultValue=""
                  render={({ field }) => (
                    <TextField
                      multiline
                      rows={3}
                      size="small"
                      id="shippingContactAddress"
                      variant="outlined"
                      fullWidth
                      label="Shipping Contact & Address"
                      {...field}
                      sx={{ mb: "1rem", mt: "5px" }}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="otherShippingDetails"
                  defaultValue=""
                  render={({ field }) => (
                    <TextField
                      multiline
                      rows={3}
                      size="small"
                      id="otherShippingDetails"
                      variant="outlined"
                      fullWidth
                      label="Other Shipping Details"
                      {...field}
                      sx={{ mb: "1rem", mt: "5px" }}
                    />
                  )}
                />
              </>
            )}

            <Controller
              control={control}
              name="customerConsentsToEmailAndText"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="customerConsentsToEmailAndText"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Customer Consents to Email and Text?"
                    />
                  )}
                />
              )}
            />

            <Controller
              control={control}
              name="roundUpForCharity"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="roundUpForCharity"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Round up for Charity?"
                    />
                  )}
                />
              )}
            />

            <Box sx={{ mt: 2 }}>
              <Typography
                sx={{
                  fontSize: "0.9rem",
                  fontWeight: "bold",
                  mb: 1,
                }}
              >
                File Upload (Max total: 15MB)
              </Typography>

              <input
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files);
                  const totalSize = files.reduce(
                    (acc, file) => acc + file.size,
                    0,
                  );

                  if (totalSize > 15 * 1024 * 1024) {
                    setFileError("Total file size cannot exceed 15MB.");
                    setAttachments([]);
                  } else {
                    setFileError("");
                    setAttachments(files);
                  }
                }}
              />

              {fileError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {fileError}
                </Alert>
              )}

              {attachments.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" fontWeight="bold">
                    Selected Files:
                  </Typography>
                  <ul style={{ paddingLeft: "1rem", margin: 0 }}>
                    {attachments.map((file, idx) => (
                      <li key={idx}>
                        {file.name} - {(file.size / (1024 * 1024)).toFixed(2)}{" "}
                        MB
                      </li>
                    ))}
                  </ul>
                </Box>
              )}
            </Box>

            <Typography
              sx={{
                pt: "1rem",
                fontSize: "1.2rem",
                fontWeight: "bold",
              }}
            >
              Turnaround Time
            </Typography>

            <Controller
              control={control}
              name="hardDueDate"
              defaultValue={""}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="hardDueDate"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Does Customer Have A Hard Due Date?"
                    />
                  )}
                />
              )}
            />

            {hardDueDate === "Yes" && (
              <>
                <Box sx={{ mb: "1rem" }}>
                  <FormLabel
                    id="date"
                    sx={{ mb: "10px", color: "black", display: "block" }}
                  >
                    Due Date
                  </FormLabel>
                  <Controller
                    name={`dueDate`}
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
                              id="dueDate"
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
                  name="upchargedForRushTurnaround"
                  defaultValue={false}
                  render={({ field }) => (
                    <FormGroup>
                      <FormControlLabel
                        control={<Checkbox {...field} />}
                        label="Upcharged For Rush Turnaround Time?"
                      />
                    </FormGroup>
                  )}
                />
              </>
            )}

            {hardDueDate === "No" && (
              <>
                <Controller
                  control={control}
                  name="discountsForExtendedTurnaround"
                  defaultValue={""}
                  render={({ field }) => (
                    <Autocomplete
                      {...field}
                      options={["Yes", "No"]}
                      value={field.value || ""}
                      onChange={(_, newValue) => field.onChange(newValue)}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Discounts for Extended Turnaround Time?"
                          variant="outlined"
                          size="small"
                          fullWidth
                          sx={{ mb: "1rem", mt: "5px" }}
                        />
                      )}
                    />
                  )}
                />

                {discountsForExtendedTurnaround === "Yes" && (
                  <Controller
                    control={control}
                    name="addOneWeekToProductionTime"
                    defaultValue={false}
                    render={({ field }) => (
                      <FormGroup>
                        <FormControlLabel
                          control={<Checkbox {...field} />}
                          label="Add 1 Week To Production Time"
                        />
                      </FormGroup>
                    )}
                  />
                )}

                {discountsForExtendedTurnaround === "No" && (
                  <Controller
                    control={control}
                    name="tenFourteenBusinessDayTurnaround"
                    defaultValue={false}
                    render={({ field }) => (
                      <FormGroup>
                        <FormControlLabel
                          control={<Checkbox {...field} />}
                          label="10-14 Business Day Turnaround"
                        />
                      </FormGroup>
                    )}
                  />
                )}
              </>
            )}

            <Controller
              control={control}
              name="typicalMockup"
              defaultValue={"No"}
              render={({ field }) => (
                <Autocomplete
                  {...field}
                  id="typicalMockup"
                  size="small"
                  options={["Yes", "No"]}
                  getOptionLabel={(option) => option}
                  onChange={(_, data) => field.onChange(data)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      sx={{ mb: "0.8rem", mt: "5px" }}
                      label="Custmer Acknowledged 24-48 Hour Mock-Up?"
                    />
                  )}
                />
              )}
            />


            {/* <Button
              type="submit"
              variant="contained"
              size="small"
              sx={{ mt: 2 }}
            >
              Submit
            </Button> */}

            <Box
              sx={{
                m: "1rem 0",
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <Button
                onClick={() => {
                  ZOHO.CRM.UI.Popup.close();
                }}
                variant="outlined"
              >
                Cancel
              </Button>

              <Button
                variant="contained"
                type="submit"
                loadingPosition="start"
                // loading={addCardLoading}
                disabled={loading}
              >
                Submit Form
              </Button>
            </Box>
          </Box>
        </FormProvider>
      </Box>
    );
  } else {
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "1rem",
            margin: "20% 0",
          }}
        >
          <CircularProgress color="inherit" />
          <Typography fontWeight="bold" fontSize="1.5rem">
            Fetching Data. Please Wait...
          </Typography>
        </Box>
      </Box>
    );
  }
}

export default App;
