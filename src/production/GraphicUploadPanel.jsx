/*
 * GraphicUploadPanel.jsx -- E-162 / E-170 (D-77, D-78): the Graphic Design card tab's graphics, each with its files and its own Upload.
 *
 * Every graphic of the order is listed (Garment 1 - Graphic 2, its description and placements) with the files uploaded for it -- from
 * the GRAPHIC UPLOAD notes ("being filed" until the CRM retitles the note "GRAPHIC UPLOAD - FILED"; a "Not filed" line shows
 * its reason) and, for older orders, the art attached at onboarding. "Upload a file" names it from that graphic (Format picked;
 * department / garment / placement changeable) and runs the one upload routine (graphicUploader.js). "Other file" is for files that
 * belong to no single graphic.
 */
import React, { useMemo, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import {
  FOLDER_LABELS,
  UPLOAD_DEPARTMENTS,
  UPLOAD_FORMATS,
  extOf,
  garmentOptions,
  graphicDefaults,
  graphicsOf,
  partsReady,
  otherReady,
  placementOptions,
  poPart,
  stemFor,
  stemTakenBy,
  uploadsByGraphic,
  artNameFor,
} from "./graphicUpload";
import { uploadGraphicFile } from "./graphicUploader";

const ZOHO = window.ZOHO;

const Pick = ({ label, value, options, onChange, width, disabled }) => (
  <TextField select size="small" label={label} value={value || ""} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: width }} disabled={disabled}>
    {options.map((o) => (
      <MenuItem key={o.value} value={o.value}>
        {o.label}
      </MenuItem>
    ))}
  </TextField>
);

/* One file being uploaded: its four parts (filled from the graphic, changeable), the name it will get, and Upload. */
const FileRow = ({ file, start, garments, placementsFor, po, takenFor, others = [], client = false, noOriginal = false, otherOn = false, busy, onUpload, onCancel }) => {
  const [p, setP] = useState({ also: [], ...start });
  const set = (patch) => setP({ ...p, ...patch, confirm: false });
  const stem = partsReady(p) ? stemFor({ po, ...p }) : "";
  const taken = stem && p.format === "ORIGINAL" ? takenFor(stem, p.also) : [];
  return (
    <Box sx={{ mt: 1, p: 1.5, border: "1px solid #ddd", bgcolor: "#fafafa" }}>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {file.name}
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {client ? (
          /* E-162 follow-up (David 10-30): the client's own art has its own button, so its format is fixed */
          <Typography variant="body2" sx={{ alignSelf: "center" }}>
            Client-provided art (kept as the client gave it)
          </Typography>
        ) : (
          <Pick
            label="Format"
            width={190}
            value={p.format}
            disabled={busy}
            onChange={(v) => set({ format: v })}
            options={UPLOAD_FORMATS.filter((f) => !(noOriginal && f.code === "ORIGINAL")).map((f) => ({ value: f.code, label: f.label }))}
          />
        )}
        {p.format !== "ORIGINAL" && (
          <>
            <Pick label="Department" width={140} value={p.dept} disabled={busy} onChange={(v) => set({ dept: v })} options={UPLOAD_DEPARTMENTS.map((d) => ({ value: d.code, label: d.label }))} />
            <Pick label="Garment" width={210} value={p.garment} disabled={busy} onChange={(v) => set({ garment: v, placement: "" })} options={garments} />
            <Pick label="Placement" width={170} value={p.placement} disabled={busy || !p.garment} onChange={(v) => set({ placement: v })} options={placementsFor(p.garment)} />
          </>
        )}
      </Box>
      {/* E-177: "Other" says what it is */}
      {otherOn && p.format === "OTHER" && (
        <TextField
          size="small"
          sx={{ mt: 1, width: 360, maxWidth: "100%" }}
          label="What kind of file is it? (e.g. PSD, puff template, cut file)"
          value={p.otherWhat || ""}
          disabled={busy}
          onChange={(e) => setP({ ...p, otherWhat: e.target.value })}
        />
      )}
      {/* E-162 follow-up (D-79): a client's original can serve several graphics -- uploaded once, listed under each ticked one. */}
      {p.format === "ORIGINAL" && others.length > 0 && (
        <Box sx={{ mt: 1, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.85rem", color: "#555" }}>Also used by:</span>
          {others.map((g) => (
            <FormControlLabel
              key={g.key}
              sx={{ mr: 1 }}
              control={
                <Checkbox
                  size="small"
                  checked={p.also.includes(g.key)}
                  disabled={busy}
                  onChange={(e) => set({ also: e.target.checked ? [...p.also, g.key] : p.also.filter((k) => k !== g.key) })}
                />
              }
              label={<span style={{ fontSize: "0.85rem" }}>{g.label}{g.description ? ": " + g.description : ""}</span>}
            />
          ))}
        </Box>
      )}
      {taken.length > 0 && (
        <Box sx={{ mt: 1, color: "#8a4b00", fontSize: "0.85rem" }}>
          This art name is already used by {taken.join(", ")}. Uploading makes this a new version and moves that file to Rejected.
          <FormControlLabel
            sx={{ ml: 1 }}
            control={<Checkbox size="small" checked={!!p.confirm} disabled={busy} onChange={(e) => setP({ ...p, confirm: e.target.checked })} />}
            label={<span style={{ fontSize: "0.85rem" }}>It is a new version of that file</span>}
          />
        </Box>
      )}
      {stem && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {stem}_vN{extOf(file.name) ? "." + extOf(file.name) : ""}
        </Typography>
      )}
      <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
        <Button variant="contained" size="small" disabled={!stem || busy || (taken.length > 0 && !p.confirm) || !otherReady(p, otherOn)} onClick={() => onUpload(p)}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
        <Button size="small" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
};

const statusOf = (f) => (f.notFiled ? `not filed: ${f.notFiled}` : f.filed ? "filed" : "being filed (reopen the cards in a moment to see it filed)");

const GraphicUpload = ({ entity, recordId, deal, data, notes, who, defaultDept, uploadsOn, startFiling, alsoOn = false, otherOn = false, refresh }) => {
  const graphics = useMemo(() => graphicsOf(data), [data]);
  const byGraphic = useMemo(() => uploadsByGraphic(notes), [notes]);
  const allGarments = useMemo(() => garmentOptions(data), [data]);
  const po = poPart(deal);
  const [picked, setPicked] = useState(null); // { where: graphic key | "other", file }
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const choose = (where, client = false) => (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (f) {
      setResult(null);
      setPicked({ where, file: f, client });
    }
  };
  /* E-162 follow-up (David 10-30): a shared client file says so under each graphic it belongs to. */
  const sharedWith = (key, name) =>
    graphics.filter((g) => g.key !== key && (byGraphic[g.key] || []).some((f) => f.name === name)).map((g) => g.label + (g.description ? ` (${g.description})` : ""));
  const doUpload = async (parts, graphic) => {
    setBusy(true);
    setResult(null);
    try {
      // D-79: the graphic it is uploaded on first, then every graphic ticked under "Also used by" (client originals only)
      const also = alsoOn && graphic && parts.format === "ORIGINAL" ? graphics.filter((g) => (parts.also || []).includes(g.key) && g.key !== graphic.key) : [];
      const links = graphic ? [graphic, ...also.map((g) => ({ key: g.key, label: g.label }))] : undefined;
      const res = await uploadGraphicFile(ZOHO, { entity, recordId, deal, who, source: "cards", file: picked.file, parts, graphic, links, startFiling });
      setPicked(null);
      setResult({
        severity: "success",
        text: `${res.name}: attached${res.filingStarted ? "; it is being filed into " + (FOLDER_LABELS[res.folder] || "WorkDrive") + " now" : " (filing switch off: it stays on the note for now)"}.`,
      });
      if (refresh) await refresh();
    } catch (e) {
      setResult({ severity: "error", text: `Not uploaded: ${String(e?.message || e)}. Nothing was attached; try again.` });
    }
    setBusy(false);
  };

  /* every file already uploaded on the Deal, with the graphic it belongs to (for the art-name warning) */
  const labelOf = (key) => (graphics.find((g) => g.key === key) || {}).label || "another upload";
  const takenFor = (key) => (stem, also) =>
    stemTakenBy(
      stem,
      Object.entries(byGraphic).flatMap(([k, list]) => list.map((f) => ({ name: f.name, key: k, label: labelOf(k) }))),
      [key, ...(alsoOn ? also || [] : [])]
    );
  const fileRow = (where, start, garments, placementsFor, graphic) =>
    picked && picked.where === where ? (
      <FileRow
        key={picked.file.name + where + (picked.client ? "|client" : "")}
        file={picked.file}
        start={start}
        garments={garments}
        placementsFor={placementsFor}
        po={po}
        takenFor={takenFor(where)}
        others={alsoOn && graphic && picked.client ? graphics.filter((x) => x.key !== where) : []}
        client={alsoOn && !!picked.client}
        otherOn={otherOn}
        noOriginal={alsoOn && !!graphic && !picked.client}
        busy={busy}
        onUpload={(p) => doUpload(p, graphic)}
        onCancel={() => setPicked(null)}
      />
    ) : null;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography fontWeight="bold">Graphics on this order</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Each file is renamed {po}_DEPARTMENT_GARMENT_PLACEMENT_FORMAT_vN and filed in the Deal's folder right after upload. A newer
        version moves the older one to Rejected.
      </Typography>
      {!uploadsOn && <Alert severity="info">Uploads are switched off.</Alert>}
      {graphics.map((g) => {
        const d = graphicDefaults(data.products, g.base) || {};
        const files = byGraphic[g.key] || [];
        const old = g.artFiles.filter((a) => !a.uploaded && !files.some((f) => f.original === a.name));
        return (
          <Box key={g.base} sx={{ mt: 1, p: 1.5, border: "1px solid #c5d5ea", borderRadius: 1, bgcolor: "#f6f9fd" }}>
            <Typography variant="body2" fontWeight="bold">
              {g.label}
              {g.description ? `: ${g.description}` : ""}
              {g.placements.length ? ` (${g.placements.join(", ")})` : ""}
            </Typography>
            {files.map((f) => {
              const shared = alsoOn ? sharedWith(g.key, f.name) : [];
              return (
                <Typography key={f.name} variant="body2" sx={{ pl: 1 }}>
                  {f.name} - {statusOf(f)}
                  {f.original ? ` (was ${f.original})` : ""}
                  {shared.length > 0 && <b style={{ color: "#1565c0" }}> · Client art, shared with {shared.join("; ")}</b>}
                </Typography>
              );
            })}
            {old.map((a) => (
              <Typography key={a.key || a.name} variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                {a.name} - attached at onboarding (old name, on the onboarding note)
              </Typography>
            ))}
            {!files.length && !old.length && (
              <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                No files yet.
              </Typography>
            )}
            {uploadsOn && !(picked && picked.where === g.key) && (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 0.5 }}>
                <Button size="small" variant="outlined" component="label" disabled={busy}>
                  Upload a file for this graphic
                  <input hidden type="file" onChange={choose(g.key)} />
                </Button>
                {alsoOn && (
                  <Button size="small" variant="outlined" color="secondary" component="label" disabled={busy}>
                    Upload new client-provided art
                    <input hidden type="file" onChange={choose(g.key, true)} />
                  </Button>
                )}
              </Box>
            )}
            {fileRow(
              g.key,
              { dept: d.dept || defaultDept || "", garment: d.garment || "ALL", placement: d.placement || "Whole-item", format: alsoOn && picked && picked.client ? "ORIGINAL" : "", artName: d.artName },
              d.garments || allGarments,
              (gv) => (gv === d.garment ? d.placements || [] : placementOptions(data, gv)),
              { key: g.key, label: g.label }
            )}
          </Box>
        );
      })}
      {uploadsOn && (
        <Box sx={{ mt: 1.5 }}>
          {!(picked && picked.where === "other") && (
            <Button size="small" variant="outlined" component="label" disabled={busy}>
              Upload another file (not one graphic)
              <input hidden type="file" onChange={choose("other")} />
            </Button>
          )}
          {fileRow(
            "other",
            { dept: defaultDept || "GD", garment: "ALL", placement: "Whole-item", format: "", artName: picked ? artNameFor(picked.file.name.replace(/\.[^.]+$/, ""), "") : "" },
            allGarments,
            (gv) => placementOptions(data, gv),
            null
          )}
        </Box>
      )}
      {result && (
        <Alert severity={result.severity} sx={{ mt: 1 }}>
          {result.text}
        </Alert>
      )}
    </Box>
  );
};

export default GraphicUpload;
