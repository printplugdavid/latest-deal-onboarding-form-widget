import { Alert, Autocomplete, Box, CircularProgress, TextField, Typography } from "@mui/material";
import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";
import { rememberCreated, searchProducts } from "../products/productSearch";
import { familyOf, familySearchCodes, garmentFill } from "../products/garmentFromBooks";

const NewProductDialog = lazy(() => import("./NewProductDialog"));
const ADD = { kind: "add" };

/*
 * E-104: "Find the product in Books" at the top of a garment type. Search by SKU or words of the name; the pick fills Garment Type
 * (name without the size band, plus the code), Garment Kind (from the Books category) when empty, and the SKU rows with the style's
 * size-band family (PC54 · PC541 · PC542). The rep removes bands the order does not use. Nothing is locked: every field stays editable.
 * Not in Books -> the New Product form, then its new items fill the garment the same way.
 */
export default function GarmentProductPick({ index, branchIndex }) {
  const { getValues, setValue } = useFormContext();
  const base = `products.${index}.primaryBranches.${branchIndex}`;
  const [input, setInput] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filled, setFilled] = useState(null);
  const [adding, setAdding] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = input.trim();
    if (term.length < 2) {
      setOptions([]);
      return undefined;
    }
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchProducts(term);
      if (my !== seq.current) return;
      setOptions(r.products);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  const fillWith = (family, category) => {
    const f = garmentFill(family, category);
    if (!String(getValues(`${base}.garmentType`) || "").trim()) setValue(`${base}.garmentType`, f.garmentType);
    if (f.garmentKind && !String(getValues(`${base}.garmentKind`) || "").trim()) setValue(`${base}.garmentKind`, f.garmentKind);
    setValue(`${base}.garmentSkus`, f.garmentSkus);
    setValue(`${base}.numberOfSkus`, String(f.garmentSkus.length));
    setFilled(f.garmentSkus.map((r) => r.sku));
  };

  const pick = async (p) => {
    setLoading(true);
    const found = [];
    for (const code of familySearchCodes(p.sku)) found.push(...(await searchProducts(code)).products);
    setLoading(false);
    fillWith(familyOf(p, found), p.category);
    setInput("");
  };

  return (
    <Box sx={{ mb: "1rem", mt: "5px", p: 1.5, border: "1px solid #ddd", borderRadius: 1, background: "#fff" }}>
      <Autocomplete
        freeSolo
        autoHighlight
        filterOptions={(x) => x}
        options={[...options, ADD]}
        loading={loading}
        value={null}
        inputValue={input}
        onInputChange={(_, v, reason) => {
          if (reason === "input" || reason === "clear") setInput(v);
        }}
        getOptionLabel={(o) => (typeof o === "string" ? o : o.kind === "add" ? "" : `${o.sku} ${o.name}`)}
        onChange={(_, v) => {
          if (!v || typeof v === "string") return;
          if (v.kind === "add") return setAdding(true);
          pick(v);
        }}
        renderOption={(props, o) => {
          const { key, ...rest } = props;
          if (o.kind === "add")
            return (
              <li key="add" {...rest}>
                <Typography sx={{ fontWeight: "bold", fontSize: "0.9rem" }}>Not in Books? Add a new product</Typography>
              </li>
            );
          return (
            <li key={o.id || o.sku} {...rest}>
              <Box>
                <Typography sx={{ fontSize: "0.9rem", fontWeight: "bold" }}>{o.sku}</Typography>
                <Typography sx={{ fontSize: "0.8rem" }}>{o.name}</Typography>
              </Box>
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            label="Find the product in Books (search by SKU or product name)"
            helperText="Fills Garment Type, Garment Kind and the SKUs below; you can still change any of them"
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
      {filled && (
        <Alert severity="success" icon={false} sx={{ mt: 1, py: 0 }}>
          Filled from Books: {filled.join(", ")}. Remove any size band this order does not use (lower Number of SKUs).
        </Alert>
      )}
      {adding && (
        <Suspense fallback={null}>
          <NewProductDialog
            open
            initialStyle={input.trim()}
            garmentKind={getValues(`${base}.garmentKind`)}
            onClose={() => setAdding(false)}
            onCreated={(products) => {
              rememberCreated(products);
              const list = (products || []).filter((p) => p && p.sku).map((p) => ({ ...p, justCreated: true }));
              if (list.length) fillWith(list, list[0].category);
              setInput("");
              setAdding(false);
            }}
          />
        </Suspense>
      )}
    </Box>
  );
}
