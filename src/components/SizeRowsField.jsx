/*
 * SizeRowsField -- structured editor for "Total Count, Colors & Sizes" (E-29).
 *
 * ⚠️ THE FIELD IS STILL A STRING. This component does not add a payload key. It
 * edits `countColorSize` through parseSizeText/formatSizeRows, so the JSON, the
 * note, the production card and quantityCheck all see exactly what they see today.
 * That is what makes it safe to put in the live onboarding form. Do NOT "improve"
 * this by storing an array -- that is a breaking change to the contract in docs/06,
 * which the revision form parses for ~2,659 note-only deals.
 *
 * Why it exists: one free-text box was carrying style, color, size and count. On
 * 2026-09-30 a live order's note read "12- Small" where every sibling read "1-",
 * and 840 prints were computed from a quantity the form had already flagged as
 * inconsistent (docs/03 2026-09-30 (5)).
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  SIZE_OPTIONS,
  SIZE_LABELS,
  MAX_COLOR_LINES,
  countColorBlocks,
  formatSizeRows,
  insertSizeBelow,
  parseSizeText,
  setColorCount,
  sumRows,
} from "../sizeRows";

const blankRow = (like) => ({
  group: (like && like.group) || "",
  color: (like && like.color) || "",
  size: "",
  count: "",
});

const SizeRowsField = ({ value, onChange, label = "Total Count, Colors & Sizes" }) => {
  const [rows, setRows] = useState([]);
  // Lines the parser could not classify. Kept verbatim so opening an old deal can
  // never silently drop what an agent wrote.
  const [extra, setExtra] = useState("");
  // E-36: "How many colors?" -- what the rep typed, and whether typed lines were kept.
  const [colorCount, setColorCountText] = useState("");
  const [keptTyped, setKeptTyped] = useState(false);
  const lastOut = useRef(null);

  // Re-read only when the string changed underneath us (async prefill, form reset).
  // Our own writes are ignored, so editing never fights the parser.
  useEffect(() => {
    const incoming = String(value == null ? "" : value);
    if (incoming === lastOut.current) return;
    const parsed = parseSizeText(incoming);
    setRows(parsed.rows);
    setExtra(parsed.unparsed.join("\n"));
    lastOut.current = incoming;
  }, [value]);

  const push = (nextRows, nextExtra) => {
    const out = [formatSizeRows(nextRows), (nextExtra || "").trim()]
      .filter(Boolean)
      .join("\n");
    lastOut.current = out;
    onChange(out);
  };

  const setRow = (i, patch) => {
    const next = rows.map((r, n) => (n === i ? { ...r, ...patch } : r));
    setRows(next);
    push(next, extra);
  };

  const addRow = () => {
    const next = [...rows, blankRow(rows[rows.length - 1])];
    setRows(next);
    push(next, extra);
  };

  // E-36: one line under row i for another size of the same color.
  const addSizeBelow = (i) => {
    const next = insertSizeBelow(rows, i);
    setRows(next);
    push(next, extra);
  };

  // E-36: lay out one line per color. Only ever adds blank lines or removes
  // untouched ones, so the saved string cannot change here (see sizeRows.js).
  const applyColorCount = (text) => {
    setColorCountText(text);
    if (String(text).trim() === "" || isNaN(parseInt(text, 10))) {
      setKeptTyped(false);
      return;
    }
    const want = Math.max(0, Math.min(MAX_COLOR_LINES, parseInt(text, 10)));
    const res = setColorCount(rows, want);
    setKeptTyped(res.blocks > want);
    setRows(res.rows);
    push(res.rows, extra);
  };

  const removeRow = (i) => {
    const next = rows.filter((_, n) => n !== i);
    setRows(next);
    push(next, extra);
  };

  const total = sumRows(rows);

  return (
    <Box sx={{ mb: "1rem", mt: "5px" }}>
      <Typography sx={{ fontSize: "0.95rem", fontWeight: 600, mb: "0.5rem" }}>
        {label}
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", mb: "0.75rem" }}>
        <TextField
          size="small"
          type="number"
          label="How many colors?"
          value={colorCount}
          onChange={(e) => applyColorCount(e.target.value)}
          inputProps={{ min: 0, max: MAX_COLOR_LINES, "aria-label": "How many colors" }}
          sx={{ flex: "0 0 11rem" }}
        />
        <Typography sx={{ fontSize: "0.85rem", color: "#666" }}>
          {rows.length === 0
            ? "Enter the number of colors to get a line for each, or add rows one at a time."
            : `${countColorBlocks(rows)} color line${countColorBlocks(rows) === 1 ? "" : "s"} below. Use ＋ on a line to add another size of that color.`}
        </Typography>
      </Box>
      {keptTyped && (
        <Typography sx={{ fontSize: "0.85rem", color: "#b26a00", mb: "0.5rem" }}>
          Lines with something typed in them were kept. Remove any you do not need with ✕.
        </Typography>
      )}

      {rows.map((row, i) => (
        <Box
          key={i}
          sx={{ display: "flex", gap: "0.5rem", mb: "0.5rem", alignItems: "flex-start" }}
        >
          <TextField
            size="small"
            label="Color"
            value={row.color || ""}
            onChange={(e) => setRow(i, { color: e.target.value })}
            sx={{ flex: "2 1 0" }}
          />
          <TextField
            select
            size="small"
            label="Size"
            value={row.size || ""}
            onChange={(e) => setRow(i, { size: e.target.value })}
            sx={{ flex: "1 1 0", minWidth: "7rem" }}
          >
            {SIZE_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>
                {SIZE_LABELS[s] || s}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            type="number"
            label="Qty"
            value={row.count === 0 || row.count ? row.count : ""}
            onChange={(e) => setRow(i, { count: e.target.value })}
            inputProps={{ min: 0 }}
            sx={{ flex: "0 0 6rem" }}
          />
          <Tooltip title="Add another size of this color">
            <IconButton
              aria-label="Add another size of this color"
              onClick={() => addSizeBelow(i)}
              sx={{ mt: "2px" }}
            >
              ＋
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove this row">
            <IconButton
              aria-label="Remove this size row"
              onClick={() => removeRow(i)}
              sx={{ mt: "2px" }}
            >
              ✕
            </IconButton>
          </Tooltip>
        </Box>
      ))}

      <Box sx={{ display: "flex", alignItems: "center", gap: "1rem", mb: "0.5rem" }}>
        <Button size="small" variant="outlined" onClick={addRow}>
          + Add size row
        </Button>
        <Typography sx={{ fontSize: "0.9rem", color: "#333" }}>
          <b>{total}</b> garment{total === 1 ? "" : "s"} listed
        </Typography>
      </Box>

      {/*
        Anything the parser could not classify. Shown, never dropped -- and still
        part of the saved string, so behaviour matches the old free-text box.
      */}
      {extra !== "" && (
        <TextField
          multiline
          rows={2}
          size="small"
          fullWidth
          label="Other notes in this breakdown (kept as typed)"
          value={extra}
          onChange={(e) => {
            setExtra(e.target.value);
            push(rows, e.target.value);
          }}
          sx={{ mt: "0.5rem" }}
        />
      )}
    </Box>
  );
};

export default SizeRowsField;
