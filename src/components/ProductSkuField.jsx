import { Autocomplete, Box, CircularProgress, TextField, Typography } from "@mui/material";
import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { rememberCreated, searchProducts } from "../products/productSearch";
import { CLIENT_OWNED } from "../products/clientOwned";

// The add-new screen is only downloaded when a rep opens it.
const NewProductDialog = lazy(() => import("./NewProductDialog"));

/*
 * E-100: one SKU row, picked from the real Books / CRM products instead of typed. Writes the same `sku` string as before
 * (note "SKU(s):", cards, the revision form and the JSON consumers are unchanged) plus additive keys on the row:
 *   productId (CRM Product id) · productName · productSource "books" | "created" | "typed"
 * Not in Books -> "Add a new product" opens the New Product form (E-85) and the new item fills the row.
 * Still possible, and flagged: keeping a typed code that is not a Books product (when Books cannot be reached, or for
 * an odd case) -- productSource "typed", shown in orange, so it can be found and fixed later.
 */
const ADD = { kind: "add" };
// E-101: the client brings the garment in -- one Books item, pinned at the top of garment SKU rows.
const CLIENT = { kind: "client", sku: CLIENT_OWNED.sku, name: CLIENT_OWNED.name, id: "" };

export default function ProductSkuField({ rowPath, label, garmentKind, allowClientOwned = false }) {
  const { control, setValue, getValues } = useFormContext();
  const productName = useWatch({ control, name: `${rowPath}.productName` });
  const productSource = useWatch({ control, name: `${rowPath}.productSource` });
  // null = not typing: the box shows the saved code. A string = what the rep is typing now.
  const [input, setInput] = useState(null);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [adding, setAdding] = useState(false);
  const seq = useRef(0);
  const addingRef = useRef(false); // the blur that opening the dialog causes must not save the typed text

  useEffect(() => {
    const term = (input || "").trim();
    if (term.length < 2) {
      setOptions([]);
      return undefined;
    }
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchProducts(term);
      if (my !== seq.current) return;
      setUnavailable(r.status !== "ok");
      setOptions(r.products);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  const pick = (field, p, source) => {
    field.onChange(p.sku);
    setValue(`${rowPath}.productId`, p.id || "");
    setValue(`${rowPath}.productName`, p.name || "");
    setValue(`${rowPath}.productSource`, source);
  };

  return (
    <Controller
      control={control}
      name={`${rowPath}.sku`}
      defaultValue=""
      render={({ field }) => {
        const typed = (input || "").trim().toUpperCase().replace(/\s+/g, "");
        const takeTyped = (text) => {
          const sku = String(text || "").trim().toUpperCase().replace(/\s+/g, "");
          const hit = options.find((o) => o.sku.toUpperCase() === sku);
          if (!sku) pick(field, { sku: "" }, "");
          else if (sku === CLIENT_OWNED.sku) pick(field, CLIENT, "clientOwned");
          else if (hit) pick(field, hit, "books");
          else if (sku !== field.value) pick(field, { sku }, "typed");
          setInput(null);
        };
        const exact = options.some((o) => o.sku.toUpperCase() === typed);
        const extra = [ADD];
        const pinned = allowClientOwned ? [CLIENT] : [];
        if (typed && !exact) extra.unshift({ kind: "typed", sku: typed });
        const helper =
          productSource === "clientOwned"
            ? `The client's own garment -- ${CLIENT_OWNED.upchargePercent}% upcharge on the order; describe it in Garment Type`
            : productSource === "typed"
            ? "Typed, not a Books product -- add it to Books when you can"
            : productName
            ? productName
            : unavailable
            ? "Books products could not be searched right now -- type the code"
            : allowClientOwned
            ? "Type the style code or words of the name; the client's own garment is at the top of the list"
            : "Type the style code or words of the name";
        return (
          <Box sx={{ mb: "1rem", mt: "5px" }}>
            <Autocomplete
              freeSolo
              autoHighlight
              filterOptions={(x) => x}
              options={[...pinned, ...options.filter((o) => o.sku !== CLIENT_OWNED.sku), ...extra]}
              loading={loading}
              value={field.value || null}
              inputValue={input === null ? field.value || "" : input}
              onInputChange={(_, v, reason) => {
                if (reason === "input" || reason === "clear") setInput(v);
              }}
              onBlur={() => {
                if (input !== null && !addingRef.current) takeTyped(input);
              }}
              getOptionLabel={(o) => (typeof o === "string" ? o : o.kind === "add" ? "" : o.sku || "")}
              isOptionEqualToValue={(o, v) => (typeof o === "string" ? o : o.sku) === v}
              onChange={(_, v) => {
                if (!v) return takeTyped("");
                if (typeof v === "string") return takeTyped(v);
                if (v.kind === "client") {
                  pick(field, v, "clientOwned");
                  // Vendors Used is how reps have marked these (588 notes): fill it when empty.
                  const vendorPath = rowPath.replace(/\.garmentSkus\.\d+$/, ".vendorsUsed");
                  if (vendorPath !== rowPath && !String(getValues(vendorPath) || "").trim()) setValue(vendorPath, CLIENT_OWNED.vendorsUsed);
                  setInput(null);
                  return;
                }
                if (v.kind === "add") {
                  addingRef.current = true;
                  setAdding(true);
                  return;
                }
                pick(field, v, v.kind === "typed" ? "typed" : v.justCreated ? "created" : "books");
                setInput(null);
              }}
              renderOption={(props, o) => {
                const { key, ...rest } = props;
                if (o.kind === "add")
                  return (
                    <li key="add" {...rest}>
                      <Typography sx={{ fontWeight: "bold", fontSize: "0.9rem" }}>Not in Books? Add a new product</Typography>
                    </li>
                  );
                if (o.kind === "client")
                  return (
                    <li key="client" {...rest}>
                      <Box>
                        <Typography sx={{ fontSize: "0.9rem", fontWeight: "bold" }}>Client's own garment ({o.sku})</Typography>
                        <Typography sx={{ fontSize: "0.8rem" }}>The client brings it in -- {CLIENT_OWNED.upchargePercent}% upcharge on the order</Typography>
                      </Box>
                    </li>
                  );
                if (o.kind === "typed")
                  return (
                    <li key="typed" {...rest}>
                      <Typography sx={{ fontSize: "0.85rem", color: "#9a5b00" }}>
                        Use "{o.sku}" as typed (not a Books product)
                      </Typography>
                    </li>
                  );
                return (
                  <li key={o.id || o.sku} {...rest}>
                    <Box>
                      <Typography sx={{ fontSize: "0.9rem", fontWeight: "bold" }}>{o.sku}</Typography>
                      <Typography sx={{ fontSize: "0.8rem" }}>
                        {o.name}
                        {o.justCreated ? " (just added)" : ""}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label={label}
                  inputRef={field.ref}
                  helperText={helper}
                  FormHelperTextProps={{ sx: { color: productSource === "typed" ? "#9a5b00" : undefined } }}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loading ? <CircularProgress size={16} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            {adding && (
              <Suspense fallback={null}>
                <NewProductDialog
                  open
                  initialStyle={(input || "").trim()}
                  garmentKind={garmentKind}
                  onClose={() => {
                    addingRef.current = false;
                    setAdding(false);
                    setInput(null);
                  }}
                  onCreated={(products) => {
                    rememberCreated(products);
                    if (products && products[0]) pick(field, { ...products[0], justCreated: true }, "created");
                    setInput(null);
                    addingRef.current = false;
                    setAdding(false);
                  }}
                />
              </Suspense>
            )}
          </Box>
        );
      }}
    />
  );
}
