/*
 * onboardingNote.js -- the DEAL ONBOARDING FORM note, the 18 print-count Deal fields and the card
 * counts, all derived from one submission.
 *
 * MOVED VERBATIM out of App.jsx's onSubmit on 2026-10-01 (E-24) so the Amendment Form can post the
 * SAME complete note for an amended order instead of carrying a second copy of ~850 lines that
 * would drift. Nothing in the note text changed in the move: the helpers and the body below are
 * the original lines, byte for byte (checked at the time -- docs/03 2026-10-01).
 *
 * The note is an INTERFACE: the revision form's noteParser.js reads it by label for ~2,659 deals
 * that have no JSON (docs/06). Changing a label here is a breaking change there.
 * Hard rule 5: line breaks are the `newLine` variable (hex 0A), never a literal "\n".
 * Hard rule 7: the print-count calculation stays at the TOP; everything below reads its locals.
 */
import { computePrints } from "./printMath";
import { gangSheetPrints } from "./gangSheet";
import { checkGarmentQuantity } from "./quantityCheck";
import { LUMPED_FIELD, LUMPED_NOTE_LINE, lumpedSignals } from "./lumpedOrder";

/* eslint-disable no-unused-vars */
  const customDate = (date) => {
    const dateObj = new Date(date);
    let year = dateObj.getFullYear();
    let month = dateObj.getMonth();
    let day = dateObj.getDate();
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

  // Checkbox fields are stored as booleans. The note reads better as Yes/No.
  // NOTE FORMATTING ONLY - the JSON payload keeps the raw boolean on purpose,
  // because the revision form parses it. Do not normalise the stored values.
  const yn = (v) => (v === true ? "Yes" : v === false ? "No" : v ?? "");

  // Repeatable SKU rows render as a single comma-separated line in the note.
  const skuList = (rows) =>
    (rows || [])
      .map((r) => r?.sku)
      .filter((v) => v != null && String(v).trim() !== "")
      .join(", ");

export function buildOnboardingNote(data) {
    const printCounts = computePrints(data?.products);
    const screenPrintPrints = printCounts.SD;
    const embroideryPrints = printCounts.ED;
    const vinylDeptPrints = printCounts.VD;
    const outsourcedProducts = printCounts.outsourced;
    const screenActualPrints = printCounts.actual.SD;
    const embroideryActualPrints = printCounts.actual.ED;
    const vinylActualPrints = printCounts.actual.VD;
    const screenProjectedPrints = printCounts.projected.SD;
    const embroideryProjectedPrints = printCounts.projected.ED;
    const vinylProjectedPrints = printCounts.projected.VD;
    const embroiderySmallPrints = printCounts.embroiderySizes.small;
    const embroideryMediumPrints = printCounts.embroiderySizes.medium;
    const embroideryLargePrints = printCounts.embroiderySizes.large;
    const gangSheetPrintsTotal = printCounts.perJob.gangSheet;
    const dtgPrints = printCounts.perJob.dtg;
    const dtfPrints = printCounts.perJob.dtf;
    const htvPrints = printCounts.perJob.htv;
    const vinylPrints = printCounts.perJob.vinyl;
    const stickersPrints = printCounts.perJob.stickers;
    const decalsPrints = printCounts.perJob.decals;
    const bannersPrints = printCounts.perJob.banners;
    const postersPrints = printCounts.perJob.posters;
    const magnetsPrints = printCounts.perJob.magnets;
    const patchesPrints = printCounts.perJob.patches;
    const totalPrints = vinylDeptPrints + embroideryPrints + screenPrintPrints;
    const totalActualPrints = vinylActualPrints + embroideryActualPrints + screenActualPrints;
    const totalProjectedPrints = vinylProjectedPrints + embroideryProjectedPrints + screenProjectedPrints;
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

        if (product?.premiumIronPass) {
          content =
            content +
            "Premium Iron Pass?: " +
            product?.premiumIronPass +
            newLine +
            newLine;
        }

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
              "SKU(s): " +
              skuList(branch?.garmentSkus) +
              newLine +
              newLine +
              "Total Count, Colors & Sizes: " +
              branch?.countColorSize +
              newLine +
              newLine +
              // E-18: the number every print count is multiplied by was never printed here, so a
              // wrong count could not be audited from the note (Stephanie McBride Deal 2, docs/03
              // 2026-09-22 (6), had to be recovered by division). Print it, and say so when the
              // size breakdown disagrees with it.
              "Total Garment Quantity: " +
              (branch?.garmentQuantity ?? "") +
              newLine +
              newLine +
              (checkGarmentQuantity(branch?.countColorSize, branch?.garmentQuantity)
                ? "NOTE: " +
                  checkGarmentQuantity(branch?.countColorSize, branch?.garmentQuantity).message +
                  newLine +
                  newLine
                : "") +
              // E-42: only when the rep answered No and submitted anyway. Yes / unanswered print
              // nothing, so an ordinary note is exactly what it was.
              (branch?.[LUMPED_FIELD] === "No" && lumpedSignals(branch).suspect
                ? LUMPED_NOTE_LINE + newLine + newLine
                : "") +
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
                    yn(subBranch?.isGraphicPrintReady) +
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
                      yn(subBranch?.specialtyThread) +
                      newLine +
                      newLine;
                  }

                  content =
                    content +
                    "Upcharge Acknowledged?: " +
                    yn(subBranch?.upchargeAcknowledged) +
                    newLine +
                    newLine +
                    "Number Of Colors Used: " +
                    subBranch?.numberOfColorsUsed +
                    newLine +
                    newLine +
                    "Underbase Needed?: " +
                    subBranch?.underbase +
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
              yn(branch?.isGraphicPrintReady) +
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
              yn(branch?.upchargedAcknowledged) +
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
          "Other Information: " +
          product?.specialInstructions +
          newLine +
          newLine +
          "Vendor Information" +
          newLine +
          newLine +
          "Is Outsourced?: " +
          yn(product?.isOutsourced) +
          newLine +
          newLine +
          "Vendors Used: " +
          product?.vendorsUsed +
          newLine +
          newLine +
          newLine;
      } else if (productType === "gangsheet") {
        // DTF Gang Sheet: print-only DTF. Counts are computed from the sheet + graphic sizes
        // (gangSheet.js), so the note reports the estimate the Deal fields were written from.
        const gang = gangSheetPrints(product);
        content =
          content +
          "Gang Sheet Information" +
          newLine +
          "---------------------------" +
          newLine +
          newLine +
          "Number of Gang Sheets: " +
          product?.numberOfGangSheets +
          newLine +
          newLine +
          "Gang Sheet Size: " +
          product?.gangSheetWidth +
          '" wide x ' +
          product?.gangSheetHeight +
          '" tall' +
          newLine +
          newLine +
          "Number of Graphics on the Sheet: " +
          product?.numberOfGraphics +
          newLine +
          newLine;

        if (Number(product?.numberOfGraphics) > 0) {
          product?.gangGraphics?.forEach((branch, branchIndex) => {
            const row = gang.perGraphic?.[branchIndex];
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
              "Graphic Size: " +
              branch?.graphicWidth +
              '" wide x ' +
              branch?.graphicHeight +
              '" tall' +
              newLine +
              newLine +
              "How Many Per Sheet: " +
              (branch?.quantityPerSheet ||
                (row ? row.placed + " (fills the sheet)" : "")) +
              newLine +
              newLine +
              "Is Graphic Print Ready?: " +
              yn(branch?.isGraphicPrintReady) +
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
              yn(branch?.upchargedAcknowledged) +
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
          "Estimated Prints: " +
          gang.printsPerSheet +
          " per sheet x " +
          gang.sheets +
          " = " +
          gang.total +
          newLine +
          newLine +
          (gang.overflow
            ? "NOTE: the requested graphics do not all fit on one sheet at these sizes." +
              newLine +
              newLine
            : "") +
          "Other Information: " +
          product?.otherInformation +
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
          // E-22: whether that contact block is shown publicly on the storefront.
          "Display Contact Info on the Storefront?: " +
          product?.displayContactInfo +
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

        // E-22: logo and banner asked separately; either "No" means a half-hour design charge.
        content =
          content +
          "Is the Logo Print-Ready?: " +
          product?.logoPrintReady +
          newLine +
          newLine +
          "Is the Header Banner Print-Ready?: " +
          product?.headerBannerPrintReady +
          newLine +
          newLine;

        if (
          product?.logoPrintReady === "No" ||
          product?.headerBannerPrintReady === "No"
        ) {
          content =
            content +
            "1/2 Hour Graphic Design Charge Acknowledged?: " +
            yn(product?.halfHourGraphicDesignAcknowledged) +
            newLine +
            newLine;
        }

        if (product?.areGraphicsPrintReady === "No") {
          content =
            content +
            "Upcharge for Graphic Design?: " +
            yn(product?.upchargeForGraphicDesign) +
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

        if (product?.isStorefrontTemporaryOrEvergreen === "Temporary") {
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
          newLine;

        // E-22: which areas may be designed -- instructions for whoever builds the store.
        if (product?.productsCustomizable === "Yes") {
          content =
            content +
            "Areas They Would Like to Design: " +
            (product?.customizableAreas || []).join(", ") +
            newLine +
            newLine;
        }

        content =
          content +
          "Custom Product Titles for the Storefront?: " +
          product?.useCustomProductTitles +
          newLine +
          newLine;

        if (product?.useCustomProductTitles === "Yes") {
          content =
            content +
            "Custom Product Titles: " +
            product?.customProductTitles +
            newLine +
            newLine;
        }

        content =
          content +
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
          yn(product?.designServiceNeeded) +
          newLine +
          newLine +
          "Design Assets Provided?: " +
          yn(product?.designAssetsProvided) +
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
          yn(product?.serviceCostAcknowledged) +
          newLine +
          newLine +
          "Date Needed By: " +
          customDate(product?.dateNeededBy) +
          newLine +
          newLine +
          "Other Information: " +
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
      "Outsourced Products Ordered: " +
      outsourcedProducts +
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
        yn(data?.upchargedForRushTurnaround) +
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
          yn(data?.addOneWeekToProductionTime) +
          newLine +
          newLine;
      }

      if (data?.discountsForExtendedTurnaround === "No") {
        content =
          content +
          "10-14 Business Day Turnaround?: " +
          yn(data?.tenFourteenBusinessDayTurnaround) +
          newLine +
          newLine;
      }
    }

    content =
      content +
      "Custmer Acknowledged 24-48 Hour Mock-Up?: " +
      data?.typicalMockup;

    content =
      content +
      newLine + newLine +
      "PRINT COUNT SUMMARY" + newLine +
      "---------------------------" + newLine + newLine +
      "Actual = base design prints. Projected = extra prints from process steps (underbase, premium iron, heat press). Total = Actual + Projected." + newLine + newLine +
      "Screen Print" + newLine +
      "   Actual: " + screenActualPrints + "  |  Projected: " + screenProjectedPrints + "  |  Total: " + screenPrintPrints + newLine + newLine +
      "Vinyl" + newLine +
      "   Actual: " + vinylActualPrints + "  |  Projected: " + vinylProjectedPrints + "  |  Total: " + vinylDeptPrints + newLine + newLine +
      "Embroidery" + newLine +
      "   Actual: " + embroideryActualPrints + "  |  Projected: " + embroideryProjectedPrints + "  |  Total: " + embroideryPrints + newLine +
      "   Placement sizes — Small: " + embroiderySmallPrints + "  |  Medium: " + embroideryMediumPrints + "  |  Large: " + embroideryLargePrints +
      (embroideryPrints - (embroiderySmallPrints + embroideryMediumPrints + embroideryLargePrints) > 0
        ? "  |  Unsized: " + (embroideryPrints - (embroiderySmallPrints + embroideryMediumPrints + embroideryLargePrints))
        : "") + newLine + newLine +
      "---------------------------" + newLine + newLine +
      "ALL DEPARTMENTS" + newLine +
      "   Actual: " + totalActualPrints + "  |  Projected: " + totalProjectedPrints + "  |  Total: " + totalPrints;

    // The 18 Deal fields the form writes. Must stay 1:1 with COUNT_FIELDS in CardViewer.jsx.
    const printFields = {
          Vinyl_Department_Prints: vinylDeptPrints,
          Embroidery_Department_Prints: embroideryPrints,
          Embroidery_Small_Prints: embroiderySmallPrints,
          Embroidery_Medium_Prints: embroideryMediumPrints,
          Embroidery_Large_Prints: embroideryLargePrints,
          Screen_Print_Prints: screenPrintPrints,
          Vinyl_Prints: vinylPrints,
          DTG_Prints: dtgPrints,
          DTF_Prints: dtfPrints,
          DTF_Gang_Sheet_Prints: gangSheetPrintsTotal,
          HTV_Prints: htvPrints,
          Stickers_Prints: stickersPrints,
          Decals_Prints: decalsPrints,
          Banners_Prints: bannersPrints,
          Posters_Prints: postersPrints,
          Magnets_Prints: magnetsPrints,
          Patches_Prints: patchesPrints,
          Outsourced_Prints: outsourcedProducts,
    };

    // What buildProductionCards() reads.
    const cardCounts = {
        screenPrintPrints, embroideryPrints, vinylDeptPrints,
        embroiderySmallPrints, embroideryMediumPrints, embroideryLargePrints,
        dtgPrints, dtfPrints, htvPrints, vinylPrints, stickersPrints,
        gangSheetPrints: gangSheetPrintsTotal,
        decalsPrints, bannersPrints, postersPrints, magnetsPrints,
        patchesPrints, outsourcedProducts,
    };

    return { content, printFields, cardCounts };
}
