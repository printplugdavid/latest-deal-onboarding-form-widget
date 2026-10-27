import { Box, Button, Typography } from "@mui/material";
import React from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import ProductSkuField from "./ProductSkuField";
import { categoriesForProductType } from "../products/productSearch";

/*
 * E-100: the Books product(s) a non-garment line is sold as (stickers, banners, patches, promo). Optional; rows are
 * { sku, productId, productName, productSource } like a garment's SKU rows, kept at products[i].productSkus (an additive
 * JSON key, docs/06) and printed as "SKU(s):" in that product's note block only when there is at least one.
 */
export default function ProductSkuRows({ basePath }) {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: basePath });
  // E-139: this line's product (Stickers, Banners ...) -> its Books categories, listed first in the search.
  const productName = useWatch({ control, name: basePath.replace(/\.productSkus$/, ".productName") });
  const prefer = categoriesForProductType(productName);
  return (
    <Box sx={{ mb: "1rem" }}>
      <Typography sx={{ fontSize: "0.8rem", fontWeight: "bold", mb: 1 }}>Books product(s) for this line</Typography>
      {fields.map((f, i) => (
        <Box key={f.id} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
          <Box sx={{ flex: 1 }}>
            <ProductSkuField
              rowPath={`${basePath}.${i}`}
              label={`SKU ${i + 1}`}
              preferCategories={prefer}
              hint="Type the code, or the kind and size (e.g. die cut 3x3)"
            />
          </Box>
          <Button size="small" onClick={() => remove(i)} sx={{ mt: "8px" }}>
            Remove
          </Button>
        </Box>
      ))}
      <Button size="small" variant="outlined" onClick={() => append({ sku: "" })}>
        Add a Books product
      </Button>
    </Box>
  );
}
