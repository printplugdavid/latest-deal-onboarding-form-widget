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
import { Alert, Box, Button, MenuItem, TextField, Typography } from "@mui/material";
import {
  FOLDER_LABELS,
  UPLOAD_DEPARTMENTS,
  UPLOAD_FORMATS,
  extOf,
  garmentOptions,
  graphicDefaults,
  graphicsOf,
  partsReady,
  placementOptions,
  poPart,
  stemFor,
  uploadsByGraphic,
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
const FileRow = ({ file, start, garments, placementsFor, po, busy, onUpload, onCancel }) => {
  const [p, setP] = useState(start);
  const set = (patch) => setP({ ...p, ...patch });
  const stem = partsReady(p) ? stemFor({ po, ...p }) : "";
  return (
    <Box sx={{ mt: 1, p: 1.5, border: "1px solid #ddd", bgcolor: "#fafafa" }}>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {file.name}
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Pick label="Format" width={190} value={p.format} disabled={busy} onChange={(v) => set({ format: v })} options={UPLOAD_FORMATS.map((f) => ({ value: f.code, label: f.label }))} />
        <Pick label="Department" width={140} value={p.dept} disabled={busy} onChange={(v) => set({ dept: v })} options={UPLOAD_DEPARTMENTS.map((d) => ({ value: d.code, label: d.label }))} />
        <Pick label="Garment" width={210} value={p.garment} disabled={busy} onChange={(v) => set({ garment: v, placement: "" })} options={garments} />
        <Pick label="Placement" width={170} value={p.placement} disabled={busy || !p.garment} onChange={(v) => set({ placement: v })} options={placementsFor(p.garment)} />
      </Box>
      {stem && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {stem}_vN{extOf(file.name) ? "." + extOf(file.name) : ""}
        </Typography>
      )}
      <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
        <Button variant="contained" size="small" disabled={!stem || busy} onClick={() => onUpload(p)}>
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

const GraphicUpload = ({ entity, recordId, deal, data, notes, who, defaultDept, uploadsOn, startFiling, refresh }) => {
  const graphics = useMemo(() => graphicsOf(data), [data]);
  const byGraphic = useMemo(() => uploadsByGraphic(notes), [notes]);
  const allGarments = useMemo(() => garmentOptions(data), [data]);
  const po = poPart(deal);
  const [picked, setPicked] = useState(null); // { where: graphic key | "other", file }
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const choose = (where) => (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (f) {
      setResult(null);
      setPicked({ where, file: f });
    }
  };
  const doUpload = async (parts, graphic) => {
    setBusy(true);
    setResult(null);
    try {
      const res = await uploadGraphicFile(ZOHO, { entity, recordId, deal, who, source: "cards", file: picked.file, parts, graphic, startFiling });
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

  const fileRow = (where, start, garments, placementsFor, graphic) =>
    picked && picked.where === where ? (
      <FileRow
        key={picked.file.name + where}
        file={picked.file}
        start={start}
        garments={garments}
        placementsFor={placementsFor}
        po={po}
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
            {files.map((f) => (
              <Typography key={f.name} variant="body2" sx={{ pl: 1 }}>
                {f.name} - {statusOf(f)}
                {f.original ? ` (was ${f.original})` : ""}
              </Typography>
            ))}
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
              <Button size="small" variant="outlined" component="label" disabled={busy} sx={{ mt: 0.5 }}>
                Upload a file for this graphic
                <input hidden type="file" onChange={choose(g.key)} />
              </Button>
            )}
            {fileRow(
              g.key,
              { dept: d.dept || defaultDept || "", garment: d.garment || "ALL", placement: d.placement || "Whole-item", format: "" },
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
          {fileRow("other", { dept: defaultDept || "GD", garment: "ALL", placement: "Whole-item", format: "" }, allGarments, (gv) => placementOptions(data, gv), null)}
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
