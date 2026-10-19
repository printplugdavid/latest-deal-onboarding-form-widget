/*
 * GraphicArt -- E-95 (David, 2026-10-19). "Art for this graphic": attach the graphic's own art file(s) and read its
 * colors from the file, right under the graphic's description, so each graphic gets its own color breakdown.
 *
 * The form value is `artFiles: [{ name, size, key }]` on the graphic (names only). The files themselves live in
 * ArtFilesContext (provided by the onboarding form, App.jsx) and are uploaded to the onboarding note on Submit with
 * the "Other files", then copied to the Deal's Art Assets (E-72). Without the context (the Amendment Form, until
 * E-96) the row offers the color finder only: a picture is read on this computer and not saved.
 */
import React, { createContext, useContext, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { useFormContext, useWatch } from "react-hook-form";
import ImageColorFinder from "./ImageColorFinder";
import { artKey, finderModeFor, isPicture, writePicks } from "../graphicArt";

/* { get(key) -> File, put(file) -> key, room(addBytes) -> "" | error text } -- provided by the onboarding form. */
export const ArtFilesContext = createContext(null);

const mb = (n) => (n / (1024 * 1024)).toFixed(2);
const WHERE = { ink: "Pantone / house ink", thread: "thread", vinyl: "vinyl", hex: "HEX code" };

const GraphicArt = ({ base, productName: givenName, productIndex }) => {
  const { control, setValue, getValues } = useFormContext();
  const watchedName = useWatch({ control, name: `products.${productIndex}.productName` });
  const productName = givenName || watchedName;
  const files = useWatch({ control, name: `${base}.artFiles` }) || [];
  const store = useContext(ArtFilesContext);
  const [finding, setFinding] = useState(null); // a file key, or "pick" (finder without an attached file)
  const [error, setError] = useState("");
  const mode = finderModeFor(productName);

  const addPicks = (picks) =>
    setValue(`${base}.colorsUsed`, writePicks(getValues(`${base}.colorsUsed`), picks, productName), { shouldDirty: true });

  const attach = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length || !store) return;
    const current = Array.isArray(getValues(`${base}.artFiles`)) ? getValues(`${base}.artFiles`) : [];
    const fresh = picked.filter((f) => !current.some((a) => a.key === artKey(f)));
    const problem = store.room(fresh.reduce((n, f) => n + f.size, 0));
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    const added = fresh.map((f) => ({ name: f.name, size: f.size, key: store.put(f) }));
    setValue(`${base}.artFiles`, [...current, ...added], { shouldDirty: true });
    const firstPicture = added.find((a) => isPicture(a.name));
    if (firstPicture) setFinding(firstPicture.key); // straight to its colors -- the rep still clicks Add
  };
  const remove = (key) => {
    setValue(`${base}.artFiles`, files.filter((a) => a.key !== key), { shouldDirty: true });
    if (finding === key) setFinding(null);
  };

  return (
    <Box sx={{ border: "1px solid #c5d5ea", borderRadius: 1, p: 1.25, mb: "1rem", bgcolor: "#f6f9fd" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: "0.95rem", fontWeight: 700 }}>Art for this graphic</Typography>
        {store ? (
          <Button size="small" variant="contained" component="label" sx={{ textTransform: "none", py: "2px" }}>
            Attach art file
            <input hidden type="file" multiple onChange={attach} aria-label="Attach this graphic's art file" />
          </Button>
        ) : (
          <Button size="small" variant="outlined" onClick={() => setFinding("pick")} sx={{ textTransform: "none", py: "2px" }}>
            Find colors in a picture
          </Button>
        )}
      </Box>

      {files.length > 0 && (
        <Box component="ul" sx={{ listStyle: "none", p: 0, m: "0.5rem 0 0" }}>
          {files.map((a) => (
            <Box component="li" key={a.key} sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.85rem", py: "2px" }}>
              <b>{a.name}</b>
              <span style={{ color: "#777" }}>{mb(a.size || 0)} MB</span>
              {store && store.get(a.key) && isPicture(a.name) && (
                <Button size="small" variant="outlined" onClick={() => setFinding(a.key)} sx={{ textTransform: "none", py: 0 }}>
                  Find colors in this file
                </Button>
              )}
              {store && store.get(a.key) && !isPicture(a.name) && (
                <span style={{ color: "#777" }}>design file -- colors are read from a PNG, JPG or SVG</span>
              )}
              {!store && <span style={{ color: "#777" }}>attached at onboarding</span>}
              {store && (
                <Button size="small" variant="text" onClick={() => remove(a.key)} sx={{ textTransform: "none", py: 0, minWidth: 0 }}>
                  Remove
                </Button>
              )}
            </Box>
          ))}
        </Box>
      )}

      {error && <Typography sx={{ fontSize: "0.85rem", color: "#b00020", mt: "0.4rem" }}>{error}</Typography>}

      {finding && (
        <ImageColorFinder
          key={finding}
          mode={mode}
          file={finding === "pick" ? null : store && store.get(finding)}
          startOpen
          onAdd={addPicks}
          onClose={() => setFinding(null)}
        />
      )}

      <Typography sx={{ fontSize: "0.75rem", color: "#777", mt: "0.4rem" }}>
        {store
          ? `Attached art goes on the onboarding note and into the Deal's Art Assets. Add buttons write the ${WHERE[mode]} into this graphic's Colors Used.`
          : "Art files are attached on the onboarding form. A picture picked here is only read for its colors; it is not saved."}
      </Typography>
    </Box>
  );
};

export default GraphicArt;
