import { Alert, Autocomplete, Box, CircularProgress, TextField, Typography } from "@mui/material";
import { setVendors } from "./VendorsUsedField";
import { vendorsOf, withVendor } from "../products/vendors";
import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { booksFamilyOf, rememberCreated, searchProducts } from "../products/productSearch";
import { familyBase, familyOf, familySearchCodes, garmentFill, nameStem, skusForSizes } from "../products/garmentFromBooks";

const NewProductDialog = lazy(() => import("./NewProductDialog"));
const ADD = { kind: "add" };

/*
 * E-104: "Find the product in Books" at the top of a garment type. Search by SKU or words of the name; the pick fills Garment Type
 * (name without the size band, plus the code), Garment Kind (from the Books category) when empty, and the SKU rows with the style's
 * size-band family (PC54 · PC541 · PC542). The rep removes bands the order does not use. Nothing is locked: every field stays editable.
 * Not in Books -> the New Product form, then its new items fill the garment the same way.
 */
export default function GarmentProductPick({ index, branchIndex, setSkus }) {
  const { control, getValues, setValue } = useFormContext();
  const base = `products.${index}.primaryBranches.${branchIndex}`;
  /* E-179: write the SKU list through the garment's field array when given (its boxes then show the saved codes) */
  const writeSkus = (list) => {
    if (setSkus) setSkus(list);
    else {
      setValue(`${base}.garmentSkus`, list);
      setValue(`${base}.numberOfSkus`, String(list.length));
    }
  };
  // E-107: the style's whole size-band family is kept on the garment; the SKU rows show only the bands its size lines need.
  const family = useWatch({ control, name: `${base}.booksFamily` });
  const sizesText = useWatch({ control, name: `${base}.countColorSize` });
  const rows = useWatch({ control, name: `${base}.garmentSkus` });
  const [unmatched, setUnmatched] = useState([]);
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

  const fillWith = (fam, category) => {
    const f = garmentFill(fam, category);
    if (!String(getValues(`${base}.garmentType`) || "").trim()) setValue(`${base}.garmentType`, f.garmentType);
    if (f.garmentKind && !String(getValues(`${base}.garmentKind`) || "").trim()) setValue(`${base}.garmentKind`, f.garmentKind);
    // E-179: a second style keeps the first style's family (the size-band follow stops anyway once two styles are listed)
    const hadOther = (getValues(`${base}.garmentSkus`) || []).some((r) => r && String(r.sku || "").trim() && !f.garmentSkus.some((x) => String(x.sku).toUpperCase() === String(r.sku).toUpperCase()));
    if (!hadOther) setValue(`${base}.booksFamily`, f.garmentSkus);
    // E-113: the style's vendor fills Vendors Used (empty box, or a list of Deal choices).
    const next = withVendor(vendorsOf({ vendorsList: getValues(`${base}.vendorsList`), vendorsUsed: getValues(`${base}.vendorsUsed`) }), (fam[0] || {}).vendor);
    if (next) setVendors(setValue, base, next);
    const need = skusForSizes(f.garmentSkus.map((r) => ({ ...r, name: r.productName })), getValues(`${base}.countColorSize`));
    const shown = f.garmentSkus.filter((r) => need.items.some((p) => p.sku === r.sku));
    /*
     * E-179 (Ignite D1, 13 garments since 10-21): picking a SECOND style for a garment that already has another style's SKUs used to
     * REPLACE them (the old code stayed on screen, the saved list became the new style's). Now the new style's SKUs are ADDED after the
     * ones already there; a first pick (or a re-pick of the same style) still fills the list as before.
     */
    const famSkus = f.garmentSkus.map((r) => String(r.sku).toUpperCase());
    const before = (getValues(`${base}.garmentSkus`) || []).filter((r) => r && String(r.sku || "").trim());
    const others = before.filter((r) => !famSkus.includes(String(r.sku).toUpperCase()));
    if (others.length) {
      const add = (shown.length ? shown : f.garmentSkus.slice(0, 1)).filter((r) => !before.some((b) => String(b.sku).toUpperCase() === String(r.sku).toUpperCase()));
      writeSkus([...before, ...add]);
      setUnmatched([]);
      setFilled({ added: true, skus: add.map((r) => r.sku) });
      return;
    }
    writeSkus(shown);
    setUnmatched(need.unmatched);
    setFilled({ added: false, skus: f.garmentSkus.map((r) => r.sku) });
  };

  // E-107: follow the size lines -- add a band when a size needs it, drop it when no size does. A row the rep added by hand (not in
  // the family) stops the follow for this garment.
  useEffect(() => {
    if (!Array.isArray(family) || !family.length) return;
    const current = (rows || []).map((r) => String((r && r.sku) || "").toUpperCase()).filter(Boolean);
    const famSkus = family.map((r) => r.sku.toUpperCase());
    if (current.some((s) => !famSkus.includes(s))) return;
    const need = skusForSizes(family.map((r) => ({ ...r, name: r.productName })), sizesText);
    const wanted = family.filter((r) => need.items.some((p) => p.sku === r.sku));
    setUnmatched(need.unmatched);
    if (wanted.map((r) => r.sku).join(",") === family.filter((r) => current.includes(r.sku.toUpperCase())).map((r) => r.sku).join(",")) return;
    writeSkus(wanted);
  }, [sizesText, family]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (p) => {
    setLoading(true);
    const found = [];
    for (const code of familySearchCodes(p.sku)) found.push(...(await searchProducts(code)).products);
    let fam = familyOf(p, found);
    // E-106: an item CRM does not have yet -- ask Books for the rest of its family.
    if (p.fromBooks || fam.length === 1) {
      const more = await booksFamilyOf(familyBase(p));
      fam = familyOf(p, [...found, ...more.filter((x) => nameStem(x.name).toLowerCase() === nameStem(p.name).toLowerCase())]);
    }
    setLoading(false);
    fillWith(fam, p.category);
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
          {filled.added
            ? `Added ${filled.skus.join(", ") || "nothing new"} as another style of this garment type (the SKUs already there are kept). Give its sizes their own style section with "+ Add another garment style".`
            : `Filled from Books (${filled.skus.join(", ")}). The SKUs below follow the sizes you enter: each size band appears when a size needs it.`}
        </Alert>
      )}
      {unmatched.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
          No Books item covers size {unmatched.join(", ")} for this style. Add that size band as a new product, or check the size.
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
