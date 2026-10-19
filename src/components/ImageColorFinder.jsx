/*
 * ImageColorFinder -- E-87. "Find colors from an image", inside each color panel (screen print ink,
 * embroidery thread, cut vinyl).
 *
 * The rep picks a logo / art file; its main colors are found in the browser (imageColors.js) and each
 * is shown with its closest Pantone (Coated) + house ink, thread and ORACAL vinyl -- all four charts,
 * so cross-department matching is visible at a glance. Only the panel's OWN chart gets Add buttons:
 * on a screen-print graphic you add a Pantone, on embroidery a thread, on vinyl a vinyl color.
 *
 * ⚠️ Nothing is uploaded or saved. The picture is read on this computer and dropped when cleared; the
 * text box stays the answer (Add types one line into it, like every other picker here).
 */
import React, { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { IMAGE_COLOR_CAVEAT, findImageColors, imageColorMatches, readImageFile } from "../imageColors";

const Dot = ({ background, size = 16 }) => (
  <Box
    component="span"
    sx={{ display: "inline-block", width: size, height: size, borderRadius: "3px", border: "1px solid #999", background: background || "#fff", flex: "0 0 auto" }}
  />
);
const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp";
const DEPT_FOR = { ink: "Screen print", thread: "Embroidery", vinyl: "Vinyl" };

const Match = ({ m, onAdd, addLabel }) => (
  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", mr: "0.9rem" }}>
    <Dot background={m.hex} size={16} />
    <span>
      <b>{m.label}</b>{" "}
      <span style={{ color: "#888" }}>
        · {m.quality}
        {m.note ? ` · ${m.note}` : ""}
      </span>
    </span>
    {onAdd && (
      <Button size="small" variant="text" onClick={onAdd} sx={{ minWidth: 0, py: 0, px: "4px" }}>
        {addLabel || "Add"}
      </Button>
    )}
  </Box>
);
const Line = ({ dept, mine, children }) => (
  <Box sx={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", fontSize: "0.82rem", py: "2px" }}>
    <span style={{ flex: "0 0 6.5rem", lineHeight: "22px", fontWeight: mine ? 700 : 400, color: mine ? "#1565c0" : "#555" }}>{dept}</span>
    <Box component="span" sx={{ display: "inline-flex", flexWrap: "wrap", flex: "1 1 0", rowGap: "2px", lineHeight: "22px" }}>
      {children}
    </Box>
  </Box>
);

/*
 * mode   -- "ink" | "thread" | "vinyl": which chart this panel writes into
 * onAdd  -- (picks) => void, picks = [{ kind, match }], kind "pantone" | "house" | "thread" | "vinyl".
 *           The panel types one line per pick into its box (all in one change, so "add all" keeps every line).
 */
const ImageColorFinder = ({ mode, onAdd }) => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null); // { name, preview, colors: [{ hex, share, background, matches }] } | { error }
  const [busy, setBusy] = useState(false);
  const [showBackground, setShowBackground] = useState(false);

  useEffect(() => () => state && state.preview && URL.revokeObjectURL(state.preview), [state]);

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // the same file can be picked again
    if (!file) return;
    if (/\.(ai|eps|pdf|psd|cdr)$/i.test(file.name)) {
      setState({ error: `${file.name} is a design file, not a picture. Export it as PNG, JPG or SVG first, then pick that.` });
      return;
    }
    setBusy(true);
    try {
      const img = await readImageFile(file, 400);
      const colors = findImageColors(img).map((c) => ({ ...c, matches: imageColorMatches(c.hex) }));
      setState({ name: file.name, preview: img.preview, colors });
      setShowBackground(false);
    } catch (err) {
      setState({ error: `${file.name} could not be read as a picture. Try a PNG or JPG.` });
    }
    setBusy(false);
  };

  const mine = (kind) => (mode === "ink" ? kind === "pantone" || kind === "house" : kind === mode);
  const add = (kind, m) => (mine(kind) ? () => onAdd([{ kind, match: m }]) : null);
  // "Add all": the closest match in this panel's own chart for every color that is not the background.
  // On screen print a near-identical house ink wins: it is in stock, no mixing.
  const addAll = () => {
    const picks = [];
    state.colors
      .filter((c) => !c.background)
      .forEach((c) => {
        const mt = c.matches;
        if (mode === "ink" && mt.house && mt.house.difference < 3) picks.push({ kind: "house", match: mt.house });
        else if (mode === "ink" && mt.pantone[0]) picks.push({ kind: "pantone", match: mt.pantone[0] });
        else if (mode === "thread" && mt.threads[0]) picks.push({ kind: "thread", match: mt.threads[0] });
        else if (mode === "vinyl" && mt.vinyls[0]) picks.push({ kind: "vinyl", match: mt.vinyls[0] });
      });
    if (picks.length) onAdd(picks);
  };

  if (!open) {
    return (
      <Button size="small" variant="outlined" onClick={() => setOpen(true)} sx={{ textTransform: "none", mt: "0.4rem", mb: "0.2rem", fontSize: "0.8rem" }}>
        🖼️ Find colors from an image (logo / art)
      </Button>
    );
  }
  const shown = state && state.colors ? state.colors : [];
  const nonBackground = shown.filter((c) => !c.background).length;
  return (
    <Box sx={{ border: "1px solid #c5d5ea", borderRadius: 1, p: 1.25, mt: "0.4rem", mb: "0.5rem", bgcolor: "#f6f9fd" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: "0.85rem", fontWeight: 700 }}>Find colors from an image</Typography>
        <Button size="small" variant="contained" component="label" sx={{ textTransform: "none", py: "1px", fontSize: "0.8rem" }} disabled={busy}>
          {busy ? "Reading…" : state && state.colors ? "Pick another image" : "Pick an image"}
          <input hidden type="file" accept={ACCEPT} onChange={pick} aria-label="Pick an image to find its colors" />
        </Button>
        <Button
          size="small"
          variant="text"
          onClick={() => {
            setState(null);
            setOpen(false);
          }}
          sx={{ textTransform: "none", py: 0, fontSize: "0.8rem", ml: "auto" }}
        >
          Close
        </Button>
      </Box>

      {state && state.error && <Typography sx={{ fontSize: "0.85rem", color: "#b26a00", mt: "0.4rem" }}>{state.error}</Typography>}

      {state && state.colors && (
        <Box sx={{ mt: "0.5rem" }}>
          <Box sx={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", flexWrap: "wrap" }}>
            <Box
              component="img"
              src={state.preview}
              alt={state.name}
              sx={{ maxWidth: 140, maxHeight: 110, border: "1px solid #ccc", borderRadius: "3px", background: "repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 12px 12px" }}
            />
            <Box sx={{ flex: "1 1 12rem", fontSize: "0.82rem" }}>
              <div>
                <b>{state.name}</b>
              </div>
              {shown.length ? (
                <div style={{ color: "#444", marginTop: 2 }}>
                  {shown.length} main color{shown.length === 1 ? "" : "s"} found, most-used first.
                  {shown.some((c) => c.background) && " The background (probably the shirt or the paper) is left out unless you say it is ink."}
                </div>
              ) : (
                <div style={{ color: "#b26a00" }}>No solid colors found in this picture.</div>
              )}
              {nonBackground > 0 && (
                <Button size="small" variant="outlined" onClick={addAll} sx={{ textTransform: "none", mt: "0.4rem", py: "1px", fontSize: "0.8rem" }}>
                  Add the closest {mode === "ink" ? "Pantone / house ink" : mode === "thread" ? `${(shown[0].matches.threads[0] || {}).brand || ""} thread` : "vinyl"} for all {nonBackground}
                  {shown.some((c) => c.background) ? " (not the background)" : ""}
                </Button>
              )}
            </Box>
          </Box>

          {shown.map((c) => (
            <Box key={c.hex} sx={{ borderTop: "1px solid #dde6f1", mt: "0.5rem", pt: "0.4rem" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.85rem", mb: "0.2rem" }}>
                <Dot background={c.hex} size={26} />
                <b>{c.hex}</b>
                <span style={{ color: "#666" }}>· {Math.max(1, Math.round(c.share * 100))}% of the {c.background ? "picture" : "art"}</span>
                {c.background && <span style={{ color: "#b26a00" }}>· probably the background (shirt / paper)</span>}
                {c.background && (
                  <Button size="small" variant="text" onClick={() => setShowBackground(!showBackground)} sx={{ textTransform: "none", minWidth: 0, py: 0, fontSize: "0.8rem" }}>
                    {showBackground ? "hide its matches" : "it is ink - show its matches"}
                  </Button>
                )}
              </Box>
              {(!c.background || showBackground) && (
              <>
              <Line dept="Screen print" mine={mode === "ink"}>
                {c.matches.pantone.slice(0, mode === "ink" ? 3 : 1).map((m) => (
                  <Match key={m.label} m={m} onAdd={add("pantone", m)} />
                ))}
                {c.matches.house && <Match m={c.matches.house} onAdd={add("house", c.matches.house)} addLabel="Use house ink" />}
              </Line>
              <Line dept="Embroidery" mine={mode === "thread"}>
                {c.matches.threads.map((m) => (
                  <Match key={m.label} m={m} onAdd={add("thread", m)} />
                ))}
              </Line>
              <Line dept="Vinyl" mine={mode === "vinyl"}>
                {c.matches.vinyls.map((m) => (
                  <Match key={m.label} m={m} onAdd={add("vinyl", m)} />
                ))}
              </Line>
              </>
              )}
            </Box>
          ))}
        </Box>
      )}

      <Typography sx={{ fontSize: "0.75rem", color: "#777", mt: "0.5rem" }}>
        {DEPT_FOR[mode] ? `Add buttons write into this ${DEPT_FOR[mode].toLowerCase()} box; the other charts are shown for matching. ` : ""}
        {IMAGE_COLOR_CAVEAT}
      </Typography>
    </Box>
  );
};

export default ImageColorFinder;
