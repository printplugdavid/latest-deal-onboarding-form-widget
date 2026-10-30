/*
 * GraphicArt -- E-95 (David, 2026-10-19). "Art for this graphic": attach the graphic's own art file(s) and read its
 * colors from the file, right under the graphic's description, so each graphic gets its own color breakdown.
 *
 * The form value is `artFiles: [{ name, size, key }]` on the graphic (names only). The files themselves live in
 * ArtFilesContext (provided by the onboarding form, App.jsx) and are uploaded to the onboarding note on Submit with
 * the "Other files", then copied to the Deal's Art Assets (E-72). The Amendment Form provides it too (E-96): new art
 * goes on the amendment's note. Without the context the row offers the color finder only (nothing saved).
 *
 * E-162 / E-170 (D-77, D-78, David 10-30: "Replace it."): when the store carries an `uploader` (onboarding, switch graphicUploadsOn),
 * each file gets a Format pick and its own Upload: it is renamed PO_DEPT_GARMENT_PLACEMENT_FORMAT_vN at once (department, garment and
 * placement from this graphic, changeable), attached to a GRAPHIC UPLOAD note and filed into WorkDrive right after by the CRM (instant rule).
 * Its entry then reads { name: <final>, original, uploaded: true, folder } and Submit does not attach it again. The graphic gets a
 * permanent `graphicId` so the Graphic Design card can show its files (client original -> final).
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import { Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import { useFormContext, useWatch } from "react-hook-form";
import ImageColorFinder from "./ImageColorFinder";
import PRODUCTION_CONFIG from "../production/productionConfig.json";
import { artKey, finderModeFor, isPicture, writePicks } from "../graphicArt";
import {
  FOLDER_LABELS,
  UPLOAD_DEPARTMENTS,
  UPLOAD_FORMATS,
  graphicDefaults,
  graphicsOf,
  newGraphicId,
  otherReady,
  poPart,
  stemFor,
  stemTakenBy,
} from "../production/graphicUpload";

/* { get(key) -> File, put(file) -> key, room(addBytes) -> "" | error text, uploader? } -- provided by the onboarding form.
   uploader = { upload(file, parts, graphic) -> Promise<{ name, folder }> } (E-162), only when uploads are switched on. */
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
  const uploader = store && store.uploader;
  const [parts, setParts] = useState({}); // per file key: { dept, garment, placement, format, open }
  const [sending, setSending] = useState(""); // the file key being uploaded
  const [sent, setSent] = useState({}); // per file key: "" | error text

  // E-170: a permanent id for this graphic, the first time it is shown with uploads on (never changed afterwards).
  useEffect(() => {
    if (uploader && !getValues(`${base}.graphicId`)) setValue(`${base}.graphicId`, newGraphicId());
  }, [uploader, base]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultsFor = () => graphicDefaults(getValues("products"), base);
  const partsFor = (key) => {
    const d = defaultsFor() || {};
    return {
      dept: d.dept || "",
      garment: d.garment || "ALL",
      placement: d.placement || "Whole-item",
      format: "ORIGINAL",
      also: [], // D-79: the other graphics this file is also used by (keys)
      confirm: false, // D-79: the art name is another graphic's and the rep confirmed this is a new version of it
      ...(parts[key] || {}),
      artName: d.artName || "Graphic-1", // always from this graphic's description (never typed here)
    };
  };
  /* The order's other graphics, for "Also used by"; and every file already uploaded on the order, for the art-name warning. */
  const otherGraphics = () => graphicsOf({ products: getValues("products") }).filter((g) => g.base !== base);
  const uploadedOnOrder = () => [
    ...graphicsOf({ products: getValues("products") }).flatMap((g) =>
      g.artFiles.filter((x) => x && x.uploaded).map((x) => ({ name: x.name, key: g.key, label: g.label }))
    ),
    // small follow-up: files uploaded on an earlier visit (their graphics are not in this blank form)
    ...((store && store.earlier) || []).map((f) => ({ name: f.name, key: "earlier:" + f.name, label: `a file uploaded earlier (${f.name})` })),
  ];
  const takenBy = (key) => {
    const p = partsFor(key);
    if (p.format !== "ORIGINAL") return [];
    const d = defaultsFor() || {};
    const stem = stemFor({ po: poPart(store.deal), ...p });
    return stemTakenBy(stem, uploadedOnOrder(), [d.key, ...(p.also || [])]);
  };
  const upload = async (a) => {
    const file = store.get(a.key);
    if (!file || !uploader) return;
    const p = partsFor(a.key);
    const d = defaultsFor() || {};
    setSending(a.key);
    setSent({ ...sent, [a.key]: "" });
    try {
      const me = { key: getValues(`${base}.graphicId`) || d.key, label: d.label };
      const also = p.format === "ORIGINAL" ? otherGraphics().filter((g) => (p.also || []).includes(g.key)) : [];
      const links = [me, ...also.map((g) => ({ key: g.key, label: g.label }))];
      const res = await uploader.upload(file, p, me, links);
      const list = Array.isArray(getValues(`${base}.artFiles`)) ? getValues(`${base}.artFiles`) : [];
      setValue(
        `${base}.artFiles`,
        list.map((x) => (x.key === a.key ? { ...x, name: res.name, original: x.original || x.name, uploaded: true, folder: res.folder } : x)),
        { shouldDirty: true }
      );
      // D-79: the same file is listed (not copied) on every graphic it is also used by
      also.forEach((g) => {
        const theirs = Array.isArray(getValues(`${g.base}.artFiles`)) ? getValues(`${g.base}.artFiles`) : [];
        if (!theirs.some((x) => x.name === res.name))
          setValue(`${g.base}.artFiles`, [...theirs, { name: res.name, size: 0, key: `${res.name}|linked`, uploaded: true, folder: res.folder, linkedFrom: d.label }], {
            shouldDirty: true,
          });
      });
    } catch (e) {
      setSent({ ...sent, [a.key]: `Not uploaded: ${String(e?.message || e)}. Try Upload again.` });
    }
    setSending("");
  };

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
    if ((files.find((a) => a.key === key) || {}).uploaded) return; // already on the Deal: stays
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
              {a.uploaded && !a.linkedFrom && (() => {
                /* small follow-up (David 10-30): a reopened form says whether the file was filed, read from the Deal's upload notes */
                const st = store && store.status ? store.status(a.name) : null;
                const was = a.original && a.original !== a.name ? ` (was ${a.original})` : "";
                if (st && st.notFiled) return <span style={{ color: "#b00020" }}>uploaded{was}: NOT filed ({st.notFiled}). Tell the Graphic Design lead.</span>;
                if (st && st.filed) return <span style={{ color: "#2e7d32" }}>uploaded{was}: filed in {st.folder || FOLDER_LABELS[a.folder] || "WorkDrive"}</span>;
                return <span style={{ color: "#2e7d32" }}>uploaded{was}: being filed into {FOLDER_LABELS[a.folder] || "WorkDrive"} now</span>;
              })()}
              {a.linkedFrom && (
                <span style={{ color: "#2e7d32" }}>
                  the same file, uploaded on {a.linkedFrom}
                  {store && store.status && store.status(a.name) && store.status(a.name).filed ? " (filed)" : ""}
                </span>
              )}
              {store && store.get(a.key) && isPicture(a.name) && (
                <Button size="small" variant="outlined" onClick={() => setFinding(a.key)} sx={{ textTransform: "none", py: 0 }}>
                  Find colors in this file
                </Button>
              )}
              {store && store.get(a.key) && !isPicture(a.name) && (
                <span style={{ color: "#777" }}>design file -- colors are read from a PNG, JPG or SVG</span>
              )}
              {!a.uploaded && (!store || !store.get(a.key)) && <span style={{ color: "#777" }}>attached earlier -- on an earlier onboarding note</span>}
              {store && !a.uploaded && (
                <Button size="small" variant="text" onClick={() => remove(a.key)} sx={{ textTransform: "none", py: 0, minWidth: 0 }}>
                  Remove
                </Button>
              )}
              {uploader && !a.uploaded && store.get(a.key) && (
                <UploadRow
                  p={partsFor(a.key)}
                  d={defaultsFor()}
                  po={poPart(store.deal)}
                  others={otherGraphics()}
                  taken={takenBy(a.key)}
                  busy={sending === a.key}
                  disabled={!!sending}
                  onChange={(patch) => setParts({ ...parts, [a.key]: { ...partsFor(a.key), ...patch } })}
                  onUpload={() => upload(a)}
                />
              )}
              {sent[a.key] && <span style={{ color: "#b00020" }}>{sent[a.key]}</span>}
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
        {uploader
          ? `Upload names each file and files it in the Deal's WorkDrive: a client's file as <PO>_ORIGINAL_<art name>_v<N>, any other file as <PO>_<DEPARTMENT>_<GARMENT>_<PLACEMENT>_<FORMAT>_v<N>. A file not uploaded goes on the onboarding note as before. Add buttons write the ${WHERE[mode]} into this graphic's Colors Used.`
          : store
          ? `Attached art goes on the onboarding note and into the Deal's Art Assets. Add buttons write the ${WHERE[mode]} into this graphic's Colors Used.`
          : "A picture picked here is only read for its colors; it is not saved."}
      </Typography>
    </Box>
  );
};

/* E-162: one file's Format pick (+ the other three parts, changeable) and its Upload button. */
const Sel = ({ label, value, options, onChange, width, disabled }) => (
  <TextField select size="small" label={label} value={value || ""} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: width }} disabled={disabled}>
    {options.map((o) => (
      <MenuItem key={o.value} value={o.value}>
        {o.label}
      </MenuItem>
    ))}
  </TextField>
);
const UploadRow = ({ p, d, po, others, taken, busy, disabled, onChange, onUpload }) => (
  <Box sx={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", width: "100%", pl: 1, mt: 0.5 }}>
    <Sel label="Format" width={190} value={p.format} disabled={disabled} onChange={(v) => onChange({ format: v })} options={UPLOAD_FORMATS.map((f) => ({ value: f.code, label: f.label }))} />
    {p.format === "ORIGINAL" && (
      <span style={{ fontSize: "0.85rem" }}>
        Named <b>{stemFor({ po, ...p })}_vN</b> (from this graphic's description)
      </span>
    )}
    {p.format === "ORIGINAL" && others.length > 0 && (
      <Box sx={{ width: "100%", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.25rem" }}>
        <span style={{ fontSize: "0.85rem", color: "#555" }}>Also used by:</span>
        {others.map((g) => (
          <FormControlLabel
            key={g.key}
            sx={{ mr: 1 }}
            control={
              <Checkbox
                size="small"
                checked={(p.also || []).includes(g.key)}
                disabled={disabled}
                onChange={(e) => onChange({ also: e.target.checked ? [...(p.also || []), g.key] : (p.also || []).filter((k) => k !== g.key), confirm: false })}
              />
            }
            label={<span style={{ fontSize: "0.85rem" }}>{g.label}{g.description ? ": " + g.description : ""}</span>}
          />
        ))}
      </Box>
    )}
    {taken.length > 0 && (
      <Box sx={{ width: "100%", color: "#8a4b00", fontSize: "0.85rem" }}>
        This art name is already used by {taken.join(", ")}. Uploading makes this a new version and moves that file to Rejected. If it is a
        different logo, give this graphic its own description first.
        <FormControlLabel
          sx={{ ml: 1 }}
          control={<Checkbox size="small" checked={!!p.confirm} disabled={disabled} onChange={(e) => onChange({ confirm: e.target.checked })} />}
          label={<span style={{ fontSize: "0.85rem" }}>It is a new version of that file</span>}
        />
      </Box>
    )}
    {/* E-177: "Other" says what it is (goes on the upload note) */}
    {PRODUCTION_CONFIG.otherFormatTypedOn === true && p.format === "OTHER" && (
      <TextField
        size="small"
        label="What kind of file is it?"
        value={p.otherWhat || ""}
        disabled={disabled}
        onChange={(e) => onChange({ otherWhat: e.target.value })}
        sx={{ minWidth: 240 }}
      />
    )}
    {p.format !== "ORIGINAL" && p.open && (
      <>
        <Sel label="Department" width={140} value={p.dept} disabled={disabled} onChange={(v) => onChange({ dept: v })} options={UPLOAD_DEPARTMENTS.map((x) => ({ value: x.code, label: x.label }))} />
        <Sel label="Garment" width={200} value={p.garment} disabled={disabled} onChange={(v) => onChange({ garment: v })} options={(d && d.garments) || [{ value: "ALL", label: "All" }]} />
        <Sel label="Placement" width={170} value={p.placement} disabled={disabled} onChange={(v) => onChange({ placement: v })} options={(d && d.placements) || []} />
      </>
    )}
    {p.format !== "ORIGINAL" && !p.open && (
      <Button size="small" variant="text" onClick={() => onChange({ open: true })} sx={{ textTransform: "none", py: 0 }}>
        {UPLOAD_DEPARTMENTS.find((x) => x.code === p.dept)?.label || p.dept} / {p.garment} / {p.placement} (change)
      </Button>
    )}
    <Button
      size="small"
      variant="contained"
      disabled={
        disabled ||
        !p.format ||
        (p.format !== "ORIGINAL" && (!p.dept || !p.garment || !p.placement)) ||
        (taken.length > 0 && !p.confirm) ||
        !otherReady(p, PRODUCTION_CONFIG.otherFormatTypedOn === true)
      }
      onClick={onUpload}
      sx={{ textTransform: "none", py: "2px" }}
    >
      {busy ? "Uploading…" : "Upload"}
    </Button>
  </Box>
);

export default GraphicArt;
