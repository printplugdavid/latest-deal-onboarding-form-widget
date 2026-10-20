import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import {
  PRODUCT_KINDS,
  RULES,
  bandsFromSizes,
  booksBrandFor,
  buildName,
  checkItems,
  garmentCategoryFor,
  initialsSku,
  isGarmentCategory,
  itemTypeFor,
  normalizeSku,
  priceFloor,
  productTypeFor,
  productWordsFromTitle,
  purchaseAccountFor,
  skusForBands,
  toBooksItem,
  unitFor,
  vendorCodeFor,
} from "../products/newProductRules";
import { booksLists, checkInBooks, createInBooks, supplierStyle } from "../products/booksItems";
import { rememberCreated } from "../products/productSearch";

/*
 * E-85 / E-100: the New Product form. A rep answers plain questions; the SKU, name, category, unit, accounts and price
 * floor are built from Books' convention (products/newProductRules.js), checked, checked again against Books (taken by an
 * active or inactive item?), then created in one call per item and read back. Opened from a SKU row in the onboarding
 * form (NewProductDialog) or on its own (?view=newproduct, the Products list button).
 */
const money = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n).toFixed(2) : "");
const section = { fontSize: "0.85rem", fontWeight: "bold", mt: 3, mb: 1, display: "block" };

export default function NewProductForm({ initialStyle = "", garmentKind = "", onCreated, onCancel, submittedBy = "" }) {
  const [kind, setKind] = useState("supplier");
  const [supplier, setSupplier] = useState("sanmar");
  const [style, setStyle] = useState(normalizeSku(initialStyle));
  const [lookup, setLookup] = useState(null);
  const [looking, setLooking] = useState(false);
  const [words, setWords] = useState("");
  const [colorStyle, setColorStyle] = useState("");
  const [vendor, setVendor] = useState(null);
  const [brand, setBrand] = useState("");
  const [leadBrand, setLeadBrand] = useState(true);
  const [category, setCategory] = useState(garmentCategoryFor(garmentKind) || "");
  const [youth, setYouth] = useState(false);
  const [unit, setUnit] = useState("Pieces");
  const [rows, setRows] = useState([{ size: "", quantity: "", cost: "", price: "", costSource: "typed" }]);
  const [productUrl, setProductUrl] = useState("");
  const [lists, setLists] = useState({ status: "loading", vendors: [], brands: RULES.booksBrands });
  const [booksCheck, setBooksCheck] = useState(null);
  const [busy, setBusy] = useState("");
  const [created, setCreated] = useState(null);
  const [toOrder, setToOrder] = useState([]); // D-51 step 2: which of the new items go on this order

  useEffect(() => {
    let live = true;
    booksLists().then((r) => {
      if (!live) return;
      // Books docs/38: the live brand scan can stop early (partial: true) and miss brands late in the alphabet (Sport-Tek), so the
      // list offered is always the snapshot PLUS whatever the live scan found -- never the live list alone.
      const brands = [...new Set([...RULES.booksBrands, ...(r.status === "ok" ? r.brands : [])])].sort((a, b) => a.localeCompare(b));
      setLists(r.status === "ok" ? { ...r, brands } : { ...r, vendors: [], brands });
    });
    return () => {
      live = false;
    };
  }, []);

  const apiSupplier = kind === "supplier" && supplier !== "other" ? RULES.suppliers[supplier] : null;
  const vendorPicked = useMemo(
    () =>
      apiSupplier
        ? { id: apiSupplier.vendorId, name: apiSupplier.vendor }
        : kind === "inHouse"
        ? lists.vendors.find((v) => v.name === RULES.inHouseVendor) || { id: "", name: RULES.inHouseVendor }
        : vendor,
    [apiSupplier, kind, lists.vendors, vendor]
  );
  const finalCategory = youth && isGarmentCategory(category) ? "Garment - Youth" : category;
  const account = purchaseAccountFor(finalCategory, kind);
  const itemType = itemTypeFor(finalCategory, kind);

  // A different style or supplier: the earlier lookup (and its brand question) no longer applies.
  useEffect(() => setLookup(null), [supplier, style]);
  // Anything the rep changes after the Books check makes that check stale.
  useEffect(() => setBooksCheck(null), [kind, supplier, style, words, colorStyle, brand, leadBrand, finalCategory, unit, rows, vendor]);

  async function doLookup(pickedBrand = "") {
    setLooking(true);
    const r = await supplierStyle(supplier, style, pickedBrand);
    setLooking(false);
    setLookup(r);
    if (r.status !== "ok") return;
    const b = booksBrandFor(r.brand, lists.brands);
    setBrand(b);
    setWords(productWordsFromTitle(r.title, [r.brand, b, ...Object.keys(RULES.brandAliases)], style));
    const bands = bandsFromSizes(r.sizes);
    if (bands.length) setRows(bands.map((x) => ({ size: x.label, quantity: "", cost: money(x.cost), price: "", costSource: "live" })));
  }

  const items = useMemo(() => {
    const productWords = words.trim();
    const codes =
      kind === "supplier"
        ? skusForBands(style, rows.length)
        : rows.map((_, i) => {
            const base = initialsSku(kind === "inHouse" ? "PP" : vendorCodeFor(vendorPicked && vendorPicked.name), productWords);
            return i === 0 ? base : `${base}${i}`;
          });
    return rows.map((r, i) => {
      const floor = priceFloor(r.cost, finalCategory, kind);
      return {
        kind,
        sku: codes[i] || "",
        name: buildName({
          brand: leadBrand ? brand : "",
          product: productWords,
          // D-51: supplier goods are named without color or quantity (one item covers every color)
          colorStyle: kind === "supplier" ? "" : colorStyle,
          size: r.size,
          quantity: kind === "supplier" ? "" : r.quantity,
        }),
        brand: kind === "inHouse" && !brand ? RULES.inHouseBrand : brand,
        vendorId: (vendorPicked && vendorPicked.id) || "",
        vendorName: (vendorPicked && vendorPicked.name) || "",
        category: finalCategory,
        unit,
        cost: Number(r.cost) || 0,
        floor,
        price: r.price !== "" ? Number(r.price) : floor,
        costSource: r.costSource,
        productType: productTypeFor(finalCategory),
        itemType,
        purchaseAccountId: (account && account.id) || "",
        productUrl,
      };
    });
  }, [kind, style, rows, words, vendorPicked, finalCategory, leadBrand, brand, colorStyle, unit, itemType, account, productUrl]);

  const problems = checkItems(items, { booksBrands: lists.brands });
  const extra = [];
  if (kind === "outsourced" && vendorPicked && vendorPicked.name && !vendorCodeFor(vendorPicked.name))
    extra.push(`${vendorPicked.name} has no vendor code yet (docs/25 §2c) -- ask David to pick one`);
  if (kind === "supplier" && !style) extra.push("type the supplier's style or item number");
  if (lookup && (lookup.discontinued || /\bdiscontinued\b/i.test(lookup.title || "")))
    extra.push("the supplier lists this style as discontinued -- ask before adding it");
  const ready = items.length > 0 && problems.every((p) => p.length === 0) && extra.length === 0;
  const booksOn = lists.status === "ok";
  const allFree = booksCheck && booksCheck.status === "ok" && booksCheck.results.length === items.length && booksCheck.results.every((r) => r.result === "free");

  async function doCheck() {
    setBusy("check");
    setBooksCheck(await checkInBooks(items.map(toBooksItem)));
    setBusy("");
  }
  async function doCreate() {
    setBusy("create");
    const r = await createInBooks(items.map(toBooksItem), submittedBy);
    setBusy("");
    setCreated(r);
    if (r.status === "ok") setToOrder(r.results.filter((x) => x.result === "created").map((x) => x.sku));
    // New items reach CRM only at the next sync; offer them in every SKU search of this session now.
    if (r.status === "ok")
      rememberCreated(r.results.filter((x) => x.result === "created").map((x) => ({ id: "", sku: x.sku, name: (x.read_back && x.read_back.name) || x.name })));
  }

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (created && created.status === "ok") {
    const made = created.results.filter((r) => r.result === "created");
    return (
      <Box>
        <Typography sx={section}>Step 1 done: added to Books</Typography>
        {onCreated && made.length > 0 && (
          <Typography sx={{ fontSize: "0.85rem", mb: 1 }}>
            Step 2 (separate): tick the items this order uses, then add them to the order. Nothing goes on the order until you do.
          </Typography>
        )}
        <Table size="small">
          <TableHead>
            <TableRow>
              {onCreated && <TableCell>On this order</TableCell>}
              <TableCell>SKU</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Result</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {created.results.map((r) => (
              <TableRow key={r.sku}>
                {onCreated && (
                  <TableCell padding="checkbox">
                    {r.result === "created" && (
                      <Checkbox
                        size="small"
                        checked={toOrder.includes(r.sku)}
                        onChange={(e) => setToOrder((list) => (e.target.checked ? [...list, r.sku] : list.filter((s) => s !== r.sku)))}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell>{r.sku}</TableCell>
                <TableCell>{(r.read_back && r.read_back.name) || r.name}</TableCell>
                <TableCell>
                  {r.result}
                  {r.not_kept && r.not_kept.length ? ` -- Books did not keep: ${r.not_kept.join(", ")}` : ""}
                  {r.result !== "created" && r.books_message ? ` -- ${r.books_message}` : ""}
                  {r.clash ? ` -- ${r.clash}` : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {made.some((r) => r.not_kept && r.not_kept.length) && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Books changed or dropped a field on a new item. It is created; tell David so the Books thread can correct it.
          </Alert>
        )}
        <Alert severity="info" sx={{ mt: 2 }}>
          The product is in Books now and can go on an invoice right away. CRM's product list catches up at the next sync; this
          form already knows the new items.
        </Alert>
        <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
          {made.length > 0 && onCreated && (
            <Button
              variant="contained"
              disabled={toOrder.length === 0}
              onClick={() =>
                onCreated(
                  made
                    .filter((r) => toOrder.includes(r.sku))
                    .map((r) => ({ id: "", sku: r.sku, name: (r.read_back && r.read_back.name) || r.name, brand, category: finalCategory }))
                )
              }
            >
              Add {toOrder.length === 1 ? "this product" : `these ${toOrder.length} products`} to the order
            </Button>
          )}
          {onCancel && <Button onClick={onCancel}>{onCreated ? "Close without adding to the order" : "Close"}</Button>}
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      {lists.status === "loading" && (
        <Alert severity="info" icon={false}>
          Loading Books' vendors and brands...
        </Alert>
      )}
      {lists.status !== "ok" && lists.status !== "loading" && (
        <Alert severity="warning">
          Adding products to Books is not switched on yet (the Books function is not installed). You can fill this in to see
          the product's code and name; to create it, ask David.
        </Alert>
      )}

      <Typography sx={section}>1. What kind of product?</Typography>
      <RadioGroup value={kind} onChange={(e) => setKind(e.target.value)}>
        {PRODUCT_KINDS.map((k) => (
          <FormControlLabel key={k.key} value={k.key} control={<Radio size="small" />} label={k.label} />
        ))}
      </RadioGroup>

      {kind === "supplier" && (
        <>
          <Typography sx={section}>2. Supplier and style</Typography>
          <TextField select size="small" label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} sx={{ minWidth: 240, mr: 2, mb: 2 }}>
            {Object.entries(RULES.suppliers).map(([k, s]) => (
              <MenuItem key={k} value={k}>
                {s.label}
              </MenuItem>
            ))}
            <MenuItem value="other">Another supplier (has a style or item number)</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Style or item number"
            value={style}
            onChange={(e) => setStyle(normalizeSku(e.target.value))}
            helperText="Written the way this supplier writes it (SanMar G2400, S&S 2400)"
            sx={{ mr: 2, mb: 2 }}
          />
          {supplier !== "other" && (
            <Button variant="outlined" disabled={!style || looking} onClick={() => doLookup()} sx={{ mt: "2px" }}>
              {looking ? <CircularProgress size={18} /> : "Look up price and sizes"}
            </Button>
          )}
          {lookup && lookup.status === "choose_brand" && (
            <Alert severity="info" sx={{ mb: 2 }}>
              More than one brand uses style {style} at {RULES.suppliers[supplier] ? RULES.suppliers[supplier].label : "this supplier"}. Which one?
              <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                {lookup.candidates.map((b) => (
                  <Button key={b} size="small" variant="outlined" disabled={looking} onClick={() => doLookup(b)}>
                    {b}
                  </Button>
                ))}
              </Box>
            </Alert>
          )}
          {lookup && lookup.status !== "ok" && lookup.status !== "choose_brand" && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {lookup.reason === "failed" ? "The live supplier lookup failed" : "Live supplier lookup is not available"} (
              {lookup.message || "no answer"}). You can try Look up again, or type the title and the case price per size band from
              the supplier's site; those prices are marked "typed" for the Books thread to check.
            </Alert>
          )}
          {lookup && lookup.status === "ok" && (
            <Alert severity="success" icon={false} sx={{ mb: 2 }}>
              {lookup.title} -- {lookup.brand}. Case prices as of {lookup.priced_at || "now"} (highest color price per size).
            </Alert>
          )}
        </>
      )}

      {(kind !== "supplier" || supplier === "other") && (
        <>
          <Typography sx={section}>{kind === "supplier" ? "Vendor" : "2. Vendor"}</Typography>
          {kind === "inHouse" ? (
            <Typography sx={{ fontSize: "0.9rem" }}>The Print Plug (in-house)</Typography>
          ) : (
            <Autocomplete
              options={lists.vendors}
              getOptionLabel={(v) => v.name}
              value={vendor}
              onChange={(_, v) => setVendor(v)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(p) => <TextField {...p} size="small" label="Vendor (from Books)" helperText="A vendor that is not on the list: ask David" />}
              sx={{ maxWidth: 420, mb: 2 }}
            />
          )}
          <TextField
            size="small"
            fullWidth
            label="Product web page (optional for now)"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value.trim())}
            sx={{ maxWidth: 620, mb: 1 }}
          />
        </>
      )}

      <Typography sx={section}>3. Name</Typography>
      <TextField
        size="small"
        fullWidth
        label={kind === "supplier" ? "Product words (the supplier's title, without brand or style code)" : "Product (e.g. Custom Square Stickers, Vinyl Banner)"}
        value={words}
        onChange={(e) => setWords(e.target.value)}
        sx={{ mb: 2 }}
      />
      {/* D-51: a supplier garment's Books items cover every color, so no color here; colors go on the order. */}
      {kind !== "supplier" && (
        <TextField size="small" label="Color / style (only if it is part of the product, e.g. White stickers)" value={colorStyle} onChange={(e) => setColorStyle(e.target.value)} sx={{ mb: 2, minWidth: 320 }} />
      )}
      <Autocomplete
        options={lists.brands}
        value={brand || null}
        onChange={(_, v) => setBrand(v || "")}
        renderInput={(p) => <TextField {...p} size="small" label="Brand (from Books)" helperText={kind === "inHouse" ? "Leave empty for The Print Plug" : "A brand that is not on the list: ask David"} />}
        sx={{ maxWidth: 420, mb: 1 }}
      />
      <FormControlLabel
        control={<Checkbox size="small" checked={leadBrand} onChange={(e) => setLeadBrand(e.target.checked)} />}
        label="Start the name with the brand (garments and branded promo; not our own products)"
      />

      {/* The finished name, built by the naming guide (Brand - Product - Color/Style - Size - Quantity) as the rep types. */}
      {items[0] && items[0].name && (
        <Box sx={{ mt: 1, mb: 1, p: 1, background: "#f3f6f9", borderRadius: 1 }}>
          <Typography sx={{ fontSize: "0.8rem", color: "#555" }}>
            Name in Books{items.length > 1 ? ` (one per size band; ${items.length} items, see step 6)` : ""}:
          </Typography>
          <Typography sx={{ fontSize: "0.95rem", fontWeight: "bold" }}>{items[0].name}</Typography>
          {!brand && <Typography sx={{ fontSize: "0.8rem", color: "#9a2c00" }}>Pick the brand: the name must start with it.</Typography>}
        </Box>
      )}

      <Typography sx={section}>4. Category and unit</Typography>
      <TextField select size="small" label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 320, mr: 2, mb: 1 }}>
        {RULES.categories.map((c) => (
          <MenuItem key={c} value={c}>
            {c}
          </MenuItem>
        ))}
      </TextField>
      <TextField select size="small" label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} sx={{ minWidth: 180, mb: 1 }}>
        {RULES.units.map((u) => (
          <MenuItem key={u} value={u}>
            {u}
          </MenuItem>
        ))}
      </TextField>
      {isGarmentCategory(category) && (
        <FormControlLabel control={<Checkbox size="small" checked={youth} onChange={(e) => setYouth(e.target.checked)} />} label="Youth sizes (reports as Garment - Youth)" sx={{ display: "block" }} />
      )}
      <Typography sx={{ fontSize: "0.8rem", color: "#555" }}>
        Unit: Pieces = one physical piece; Quantity = the price is for the whole set or tier (e.g. 500 cards).
        {category && unitFor(finalCategory) !== unit ? ` Usual for this category: ${unitFor(finalCategory)}.` : ""}
      </Typography>

      <Typography sx={section}>{kind === "supplier" ? "5. Size bands, cost and price" : "5. Size bands / tiers, cost and price (one Books item each)"}</Typography>
      {kind === "supplier" && (
        <Alert severity="info" icon={false} sx={{ mb: 1 }}>
          This adds the <b>whole product</b> to Books: one item per size band below, each covering <b>every color</b>. Colors and
          quantities are not asked here; they go on the order.
        </Alert>
      )}
      <Typography sx={{ fontSize: "0.8rem", color: "#555", mb: 1 }}>
        Sizes priced together are one item; sizes priced separately are one item each (S-XL, 2XL, 3XL-4XL). Cost is the
        supplier's case price. The price starts at the floor; you can go higher, never lower.
      </Typography>
      {rows.map((r, i) => (
        <Box key={i} sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
          <TextField size="small" label={kind === "supplier" ? "Size band" : "Size / dimension"} value={r.size} onChange={(e) => setRow(i, { size: e.target.value })} sx={{ width: 150 }} />
          {kind !== "supplier" && (
            <TextField size="small" label="Quantity tier (price is for)" value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} sx={{ width: 160 }} />
          )}
          <TextField
            size="small"
            label={r.costSource === "live" ? "Cost (live)" : "Cost (typed)"}
            value={r.cost}
            onChange={(e) => setRow(i, { cost: e.target.value, costSource: "typed" })}
            InputProps={{ readOnly: r.costSource === "live" }}
            sx={{ width: 120 }}
          />
          <TextField
            size="small"
            label="Price"
            value={r.price !== "" ? r.price : money(items[i] && items[i].floor)}
            onChange={(e) => setRow(i, { price: e.target.value })}
            helperText={items[i] && items[i].floor ? `floor ${money(items[i].floor)}` : ""}
            sx={{ width: 120 }}
          />
          {rows.length > 1 && <Button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</Button>}
        </Box>
      ))}
      <Button size="small" onClick={() => setRows((rs) => [...rs, { size: "", quantity: "", cost: "", price: "", costSource: "typed" }])}>
        Add a band / tier
      </Button>

      <Typography sx={section}>6. What will be created in Books</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>SKU</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Cost</TableCell>
            <TableCell>Price</TableCell>
            <TableCell>To fix first</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((it, i) => {
            const b = booksCheck && booksCheck.results && booksCheck.results[i];
            return (
              <TableRow key={i}>
                <TableCell>{it.sku}</TableCell>
                <TableCell>{it.name}</TableCell>
                <TableCell>{money(it.cost)}</TableCell>
                <TableCell>{money(it.price)}</TableCell>
                <TableCell sx={{ color: "#9a2c00" }}>
                  {problems[i].join("; ")}
                  {b && b.result !== "free" ? (problems[i].length ? "; " : "") + (b.clash || b.result) : ""}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Typography sx={{ fontSize: "0.8rem", color: "#555", mt: 1 }}>
        Also set on each item: vendor {(vendorPicked && vendorPicked.name) || "(none)"} · category {finalCategory || "(none)"} · type{" "}
        {productTypeFor(finalCategory)} / {itemType === "sales" ? "sales only" : "sales and purchases"} · sales account Sales · cost account{" "}
        {account ? account.name : "(open -- Korie)"} · taxable.
      </Typography>
      {extra.map((m) => (
        <Alert key={m} severity="warning" sx={{ mt: 1 }}>
          {m}
        </Alert>
      ))}
      {booksCheck && booksCheck.status !== "ok" && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          Books could not be checked: {booksCheck.message}
        </Alert>
      )}
      {created && created.status !== "ok" && (
        <Alert severity="error" sx={{ mt: 1 }}>
          Nothing was created: {created.message}
        </Alert>
      )}

      <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
        <Button variant="outlined" disabled={!ready || !booksOn || busy !== ""} onClick={doCheck}>
          {busy === "check" ? <CircularProgress size={18} /> : "Check in Books"}
        </Button>
        <Button variant="contained" disabled={!ready || !allFree || busy !== ""} onClick={doCreate}>
          {busy === "create" ? (
            <CircularProgress size={18} />
          ) : kind === "supplier" ? (
            `Add this product to Books (${items.length} size band${items.length === 1 ? "" : "s"})`
          ) : (
            `Add ${items.length === 1 ? "this product" : `these ${items.length} products`} to Books`
          )}
        </Button>
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
      </Box>
    </Box>
  );
}
