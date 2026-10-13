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
  Autocomplete,
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
  nextUnusedStyle,
  parseSizeText,
  rowsMissingStyle,
  sectionsOf,
  setColorCount,
  sumRows,
  tagSections,
} from "../sizeRows";

const blankRow = (like) => ({
  group: (like && like.group) || "",
  color: (like && like.color) || "",
  size: "",
  count: "",
  sec: (like && like.sec) || 0, // E-57: screen-only, see sizeRows.tagSections
});

// E-57: `styleOptions` = the styles / codes this garment type lists (sizeRows.styleOptionsFor). With
// two or more, the lines are shown in SECTIONS -- the style once as a heading, its colors and sizes
// under it (David: "what sizes per style, instead of what styles per size"). One style: as before.
const SizeRowsField = ({ value, onChange, label = "Total Count, Colors & Sizes", styleOptions = [] }) => {
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
    setRows(tagSections(parsed.rows));
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
    next[i + 1] = { ...next[i + 1], sec: (rows[i] && rows[i].sec) || 0 };
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
    // new blank lines join the last section on screen
    const lastSec = (rows[rows.length - 1] || {}).sec || 0;
    const laid = res.rows.map((r) => (r.sec != null ? r : { ...r, sec: lastSec }));
    setRows(laid);
    push(laid, extra);
  };

  // E-57: the style box of a section names every line in it.
  const setSectionGroup = (sec, group) => {
    const next = rows.map((r) => ((r.sec || 0) === sec ? { ...r, group } : r));
    setRows(next);
    push(next, extra);
  };
  // A new color line at the foot of one section.
  const addRowToSection = (section) => {
    const at = section.indexes[section.indexes.length - 1];
    const next = rows.slice();
    next.splice(at + 1, 0, { group: section.group, color: "", size: "", count: "", sec: section.sec });
    setRows(next);
    push(next, extra);
  };
  // A new section, starting on the first listed style nothing uses yet.
  const addSection = () => {
    const sec = rows.reduce((m, r) => Math.max(m, r.sec || 0), -1) + 1;
    const next = [...rows, { group: nextUnusedStyle(rows, styleOptions), color: "", size: "", count: "", sec }];
    setRows(next);
    push(next, extra);
  };

  const removeRow = (i) => {
    const next = rows.filter((_, n) => n !== i);
    setRows(next);
    push(next, extra);
  };

  const total = sumRows(rows);
  // Show the style box when the garment type lists several styles, or a line already carries one.
  const showStyles = styleOptions.length >= 2 || rows.some((r) => r && r.group);
  const missingStyle = styleOptions.length >= 2 ? rowsMissingStyle(rows) : 0;

  const renderRow = (row, i) => (
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
  );

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
      {missingStyle > 0 && (
        <Typography sx={{ fontSize: "0.85rem", color: "#b26a00", mb: "0.5rem" }}>
          This garment type lists more than one style. Give each garment its own box below and pick its style — {missingStyle} line{missingStyle === 1 ? " is" : "s are"} not under a style yet — so graphics and production can tell which colors and sizes are which.
        </Typography>
      )}
      {keptTyped && (
        <Typography sx={{ fontSize: "0.85rem", color: "#b26a00", mb: "0.5rem" }}>
          Lines with something typed in them were kept. Remove any you do not need with ✕.
        </Typography>
      )}

      {!showStyles && rows.map((row, i) => renderRow(row, i))}
      {showStyles &&
        sectionsOf(rows).map((section) => (
          <Box key={section.sec} sx={{ border: "1px solid #cfd4da", borderRadius: "6px", p: "0.75rem", mb: "0.75rem", bgcolor: "#fafbfc" }}>
            <Box sx={{ display: "flex", gap: "0.75rem", alignItems: "center", mb: "0.75rem" }}>
              <Autocomplete
                freeSolo
                size="small"
                options={styleOptions}
                value={section.group || ""}
                onChange={(_, v) => setSectionGroup(section.sec, v || "")}
                onInputChange={(_, v, reason) => {
                  if (reason === "input") setSectionGroup(section.sec, v);
                }}
                sx={{ flex: "1 1 0" }}
                renderInput={(params) => <TextField {...params} label="Garment (style / code)" />}
              />
              <Typography sx={{ fontSize: "0.9rem", color: "#333", whiteSpace: "nowrap" }}>
                <b>{section.total}</b> of this garment
              </Typography>
            </Box>
            {section.indexes.map((i) => renderRow(rows[i], i))}
            <Button size="small" onClick={() => addRowToSection(section)}>
              + Add a color or size to this garment
            </Button>
          </Box>
        ))}

      <Box sx={{ display: "flex", alignItems: "center", gap: "1rem", mb: "0.5rem" }}>
        {showStyles ? (
          <Button size="small" variant="outlined" onClick={addSection}>
            + Add another garment style
          </Button>
        ) : (
          <Button size="small" variant="outlined" onClick={addRow}>
            + Add size row
          </Button>
        )}
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
