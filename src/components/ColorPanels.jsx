/*
 * ColorPanels -- E-41 phase 2. The helpers shown around the "Colors Used" box:
 *   ThreadColors  (Embroidery)       pick a thread by number or name; swatch + official name per number
 *   InkColors     (Screen Printing)  house inks first; type a Pantone, paste a HEX, or pick a color by
 *                                    eye and get the closest Pantones and the closest house ink
 *
 * ⚠️ The text box stays the answer. Everything here only types into it (addLine) or reads it back.
 * David, 2026-10-07: flag approximation, bridging and representation limits IN THE FORM -- the
 * caveat lines below are part of the feature, not decoration.
 */
import React, { useState } from "react";
import { Autocomplete, Box, Button, TextField, Typography } from "@mui/material";
import {
  COLOR_CAVEATS, HOUSE_INKS, THREADS, addLine, findPantone, houseInkHint, nearestHouseInk, nearestPantones,
  normalizeHex, pantoneLabel, readInkText, readThreadText, threadLabel,
} from "../colorLibrary";

const METAL = "linear-gradient(135deg,#8a6d1f,#f5e08a,#b8962e)";
export const Dot = ({ background, size = 16 }) => (
  <Box
    component="span"
    sx={{ display: "inline-block", width: size, height: size, borderRadius: "3px", border: "1px solid #999", background: background || "#fff", flex: "0 0 auto" }}
  />
);
const Row = ({ children }) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", py: "1px", flexWrap: "wrap" }}>{children}</Box>
);
const Amber = ({ children }) => <Typography sx={{ fontSize: "0.85rem", color: "#b26a00", mt: "0.3rem" }}>{children}</Typography>;
const Caveat = ({ children }) => <Typography sx={{ fontSize: "0.75rem", color: "#777", mt: "0.4rem" }}>{children}</Typography>;

// ---------------------------------------------------------------------------------------------------
export const ThreadColors = ({ field, box }) => {
  const { matched, unknown } = readThreadText(field.value);
  return (
    <Box sx={{ mb: "1rem" }}>
      <Autocomplete
        size="small"
        options={THREADS}
        value={null}
        blurOnSelect
        clearOnBlur
        getOptionLabel={(t) => (t ? `${t.code} ${t.name} ${t.brand}` : "")}
        filterOptions={(opts, state) => {
          const q = state.inputValue.trim().toLowerCase();
          if (!q) return opts.slice(0, 40);
          return opts.filter((t) => t.code.indexOf(q) === 0 || t.name.toLowerCase().indexOf(q) >= 0).slice(0, 40);
        }}
        onChange={(_, t) => {
          if (t) field.onChange(addLine(field.value, threadLabel(t)));
        }}
        renderOption={(props, t) => (
          <li {...props} key={t.brand + t.code}>
            <Dot background={t.hex} />
            <span style={{ marginLeft: 8 }}>
              <b>{t.code}</b> {t.name || "(no name on the chart)"} <span style={{ color: "#888" }}>· {t.brand}</span>
            </span>
          </li>
        )}
        renderInput={(params) => <TextField {...params} label="Find a thread by number or name to add" sx={{ mt: "5px" }} />}
      />
      {box}
      {matched.map(({ code, options }) => (
        <Row key={code}>
          {options.map((t, i) => (
            <React.Fragment key={t.brand}>
              {i > 0 && <span style={{ color: "#b26a00" }}>or</span>}
              <Dot background={t.hex} size={18} />
              <span>
                <b>{t.code}</b> {t.name || "(no name)"} <span style={{ color: "#888" }}>· {t.brand}</span>
              </span>
            </React.Fragment>
          ))}
          {options.length > 1 && <span style={{ color: "#b26a00" }}>— two brands use this number; write the brand.</span>}
        </Row>
      ))}
      {unknown.length > 0 && (
        <Amber>
          Not a thread number on the Madeira or Marathon charts: {unknown.join(" · ")}. Check the number.
        </Amber>
      )}
      <Caveat>{COLOR_CAVEATS.thread}</Caveat>
    </Box>
  );
};

// ---------------------------------------------------------------------------------------------------
const MatchResult = ({ swatch, title, detail, onAdd, addLabel }) => (
  <Row>
    <Dot background={swatch} size={22} />
    <span style={{ minWidth: "9.5rem" }}>
      <b>{title}</b>
    </span>
    <span style={{ color: "#666" }}>{detail}</span>
    {onAdd && (
      <Button size="small" variant="text" onClick={onAdd} sx={{ ml: "auto", minWidth: 0, py: 0 }}>
        {addLabel || "Add"}
      </Button>
    )}
  </Row>
);

export const InkColors = ({ field, box, typedCount }) => {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState("#aa182c");
  const [usePicked, setUsePicked] = useState(false);

  const add = (line) => field.onChange(addLine(field.value, line));
  const items = readInkText(field.value);

  // What is being matched: a Pantone code typed, a HEX typed, or the color picked by eye.
  const q = query.trim();
  const typedPantone = q ? findPantone(/\b(pantone|pms)\b/i.test(q) ? q : "pantone " + q) : null;
  const typedHex = q ? normalizeHex(q) : null;
  const target = typedHex || (!q && usePicked ? picked : null);
  const near = target ? nearestPantones(target, 5) : [];
  const nearHouse = target ? nearestHouseInk(target) : null;
  const tp = typedPantone && typedPantone.color ? typedPantone.color : null;
  const tpHouse = tp ? nearestHouseInk(tp.hex) : null;

  const n = parseInt(typedCount, 10);
  const allKnown = items.length > 0 && items.every((it) => it.type === "house" || it.type === "pantone" || it.type === "hex");
  const countOff = allKnown && !isNaN(n) && n !== items.length;

  return (
    <Box sx={{ mb: "1rem" }}>
      <Box sx={{ border: "1px solid #d9d9d9", borderRadius: 1, p: 1.25, mt: "5px", mb: "0.5rem", bgcolor: "#fafafa" }}>
        <Typography sx={{ fontSize: "0.85rem", fontWeight: 700 }}>House colors — in stock, no mixing</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", mt: "0.35rem" }}>
          {HOUSE_INKS.map((h) => (
            <Button
              key={h.name}
              size="small"
              variant="outlined"
              onClick={() => add(h.name)}
              aria-label={`Add house color ${h.name}`}
              sx={{ textTransform: "none", color: "#222", borderColor: "#bbb", py: "1px", px: "6px", gap: "5px", fontSize: "0.8rem" }}
            >
              <Dot background={h.metallic ? (/gold/i.test(h.name) ? METAL : "linear-gradient(135deg,#7d7d7d,#f2f2f2,#a3a3a3)") : h.hex} size={14} />
              {h.name}
            </Button>
          ))}
        </Box>

        <Typography sx={{ fontSize: "0.85rem", fontWeight: 700, mt: "0.8rem" }}>
          Anything else is a custom mix — match a Pantone or a HEX
        </Typography>
        <Box sx={{ display: "flex", gap: "0.5rem", alignItems: "center", mt: "0.35rem" }}>
          <TextField
            size="small"
            label="Type a Pantone (187 C) or a HEX (#aa1c2e)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ flex: "1 1 0" }}
          />
          <Box
            component="label"
            sx={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", color: "#444", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            or pick by eye
            <input
              type="color"
              aria-label="Pick a color by eye"
              value={picked}
              onChange={(e) => {
                setPicked(e.target.value);
                setUsePicked(true);
                setQuery("");
              }}
              style={{ width: 38, height: 30, padding: 0, border: "1px solid #999", background: "none", cursor: "pointer" }}
            />
          </Box>
        </Box>

        {tp && (
          <Box sx={{ mt: "0.5rem" }}>
            <MatchResult
              swatch={tp.hex}
              title={pantoneLabel(tp)}
              detail={`HEX ${tp.hex}${tp.metallic ? " · metallic - cannot be shown faithfully" : ""}${tp.neon ? " · pastel / neon - shown roughly" : ""}${
                typedPantone.assumed ? " · no C or U typed - Coated shown" : ""
              }${tp.coated ? "" : " · UNCOATED code - this form matches plastisol to the Coated book; confirm"}`}
              onAdd={() => add(pantoneLabel(tp))}
              addLabel="Add this Pantone"
            />
            {tpHouse && !tp.metallic && (
              <MatchResult
                swatch={tpHouse.ink.hex}
                title={`House ${tpHouse.ink.name}`}
                detail={`closest house ink - ${tpHouse.quality}${tpHouse.difference < 3 ? " (likely no mixing needed)" : ""}`}
                onAdd={() => add(tpHouse.ink.name)}
                addLabel="Use house ink"
              />
            )}
          </Box>
        )}
        {q && !tp && !typedHex && (
          <Amber>
            {typedPantone && typedPantone.unknown
              ? "That code is not in the reference library (it may be newer than the library, or a typo). You can still type it in the box below."
              : "Type a Pantone code like 187 C, or a six-digit HEX like #aa1c2e."}
          </Amber>
        )}
        {target && (
          <Box sx={{ mt: "0.5rem" }}>
            <Row>
              <Dot background={target} size={22} />
              <span>
                <b>{target}</b> — closest matches (closest first):
              </span>
              <Button size="small" variant="text" onClick={() => add(target)} sx={{ ml: "auto", minWidth: 0, py: 0 }}>
                Add this HEX
              </Button>
            </Row>
            {nearHouse && (
              <MatchResult
                swatch={nearHouse.ink.hex}
                title={`House ${nearHouse.ink.name}`}
                detail={`closest house ink - ${nearHouse.quality}`}
                onAdd={() => add(nearHouse.ink.name)}
                addLabel="Use house ink"
              />
            )}
            {near.map((r) => (
              <MatchResult
                key={r.color.code}
                swatch={r.color.hex}
                title={pantoneLabel(r.color)}
                detail={`${r.quality} · HEX ${r.color.hex}${r.color.neon ? " · pastel / neon" : ""}`}
                onAdd={() => add(pantoneLabel(r.color))}
              />
            ))}
          </Box>
        )}
      </Box>

      {box}

      {items.map((it, i) => {
        if (it.type === "house") {
          return (
            <Row key={i}>
              <Dot background={it.ink.metallic ? METAL : it.ink.hex} size={18} />
              <span>
                <b>House {it.ink.name}</b> <span style={{ color: "#2e7d32" }}>· in stock, no mixing</span>
              </span>
            </Row>
          );
        }
        if (it.type === "pantone") {
          const hint = houseInkHint(it.color);
          return (
            <Row key={i}>
              <Dot background={it.color.hex} size={18} />
              <span>
                <b>{pantoneLabel(it.color)}</b> <span style={{ color: "#888" }}>· {it.color.hex} · custom mix</span>
                {it.assumed && <span style={{ color: "#b26a00" }}> · no C or U written - Coated shown</span>}
                {!it.color.coated && <span style={{ color: "#b26a00" }}> · uncoated code - confirm against the Coated book</span>}
                {it.color.metallic && <span style={{ color: "#b26a00" }}> · metallic - not shown faithfully</span>}
                {hint && <span style={{ color: "#2e7d32" }}> · {hint}</span>}
              </span>
            </Row>
          );
        }
        if (it.type === "hex") {
          const np = nearestPantones(it.hex, 1)[0];
          return (
            <Row key={i}>
              <Dot background={it.hex} size={18} />
              <span>
                <b>{it.hex}</b>{" "}
                <span style={{ color: "#888" }}>
                  · closest Pantone: {np ? `${np.color.code} (${np.quality})` : "none"} - a HEX is not an ink; name the Pantone to mix to
                </span>
              </span>
            </Row>
          );
        }
        return null;
      })}
      {items.some((it) => it.type === "unknown-pantone") && (
        <Amber>
          Not in the Pantone reference library: {items.filter((it) => it.type === "unknown-pantone").map((it) => it.text).join(" · ")}. It may be
          newer than the library, or a typo - check the book.
        </Amber>
      )}
      {items.some((it) => it.type === "other") && (
        <Typography sx={{ fontSize: "0.8rem", color: "#777", mt: "0.3rem" }}>
          Not matched to a house ink or a Pantone: {items.filter((it) => it.type === "other").map((it) => it.text).join(" · ")} (fine if it is a
          note).
        </Typography>
      )}
      {countOff && (
        <Amber>
          {items.length} color{items.length === 1 ? "" : "s"} listed here, but Number Of Colors Used says {n}.
        </Amber>
      )}
      <Caveat>{COLOR_CAVEATS.ink}</Caveat>
    </Box>
  );
};
