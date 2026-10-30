/*
 * GraphicUploadPanel.jsx -- E-162 (D-77): the upload step on the Graphic Design card tab (logic: graphicUpload.js).
 *
 * Pick the files -> for each, pick Department / Garment / Placement / Format (nothing typed) -> "Check names" asks Deluge's dry run for
 * the next version and what it would move to Rejected -> "Upload" writes one "GRAPHIC UPLOAD" note (final names, the client's own
 * names), attaches the renamed files to it, then calls the real run once per file (Deluge copies each into its folder and moves the
 * older version to Rejected). Switch graphicUploadsOn off = names are shown, nothing is uploaded.
 * A `too_slow` answer (a fresh attachment downloads slowly) is retried by itself every ~30 s, up to 3 times (David 10-30); files still
 * waiting after that get a "Try again" button that re-files only them, on the same note (nothing attached twice).
 */
import React, { useMemo, useState } from "react";
import { Alert, Box, Button, MenuItem, TextField, Typography } from "@mui/material";
import {
  FOLDER_LABELS,
  UPLOAD_DEPARTMENTS,
  UPLOAD_FORMATS,
  UPLOAD_FUNCTION,
  UPLOAD_NOTE_TITLE,
  RETRIES,
  RETRY_WAIT_MS,
  afterCall,
  callArguments,
  dryRunPayload,
  extOf,
  fileName,
  folderFor,
  garmentOptions,
  partsReady,
  placementOptions,
  poPart,
  readUploadAnswer,
  realPayload,
  stemFor,
  uploadNote,
  versionFrom,
} from "./graphicUpload";

const ZOHO = window.ZOHO;
const ok = (r) => r?.data?.[0]?.code === "SUCCESS";
const stamp = () => new Date().toLocaleString("en-US", { timeZone: "America/Denver", dateStyle: "short", timeStyle: "short" });

const Pick = ({ label, value, options, onChange, width, disabled }) => (
  <TextField select size="small" label={label} value={value || ""} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: width }} disabled={disabled}>
    {options.map((o) => (
      <MenuItem key={o.value} value={o.value}>
        {o.label}
      </MenuItem>
    ))}
  </TextField>
);

const GraphicUpload = ({ entity, recordId, deal, data, who, defaultDept, uploadsOn, refresh }) => {
  const garments = useMemo(() => garmentOptions(data), [data]);
  const po = poPart(deal);
  const [rows, setRows] = useState([]); // [{ file, dept, garment, placement, format, version, wouldMove }]
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(null); // { noteId, files } still waiting on WorkDrive after the retries

  const named = rows.map((r) => {
    const stem = partsReady(r) ? stemFor({ po, ...r }) : "";
    const ext = extOf(r.file.name);
    return { ...r, stem, ext, folder: partsReady(r) ? folderFor(r.dept, r.format) : "", name: stem ? fileName(stem, r.version || 1, ext) : "" };
  });
  const stems = named.map((r) => r.stem).filter(Boolean);
  const dupes = stems.filter((s, i) => stems.indexOf(s) !== i);
  const allReady = rows.length > 0 && named.every((r) => r.stem) && !dupes.length;

  const setRow = (i, patch) => {
    setChecked(false);
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch, version: undefined, wouldMove: [] } : r)));
  };
  const pickFiles = (list) => {
    setResult(null);
    setChecked(false);
    setRows([...rows, ...Array.from(list || []).map((file) => ({ file, dept: defaultDept || "", garment: "", placement: "", format: "" }))]);
  };
  const call = async (payload) => readUploadAnswer(await ZOHO.CRM.FUNCTIONS.execute(UPLOAD_FUNCTION, callArguments(recordId, payload)));

  const doCheck = async () => {
    setBusy("Checking names");
    setResult(null);
    try {
      const ans = await call(dryRunPayload({ files: named, who }));
      if (ans.status !== "ok") throw new Error(ans.message || ans.result || "no answer from the WorkDrive function");
      setRows(rows.map((r, i) => ({ ...r, ...versionFrom(ans, named[i].stem) })));
      setChecked(true);
    } catch (e) {
      setResult({ severity: "error", text: `Could not check the names: ${String(e?.message || e)}. Nothing was uploaded.` });
    }
    setBusy("");
  };

  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  /* The real calls, one per file; too_slow retried by itself. Returns { done, problems, slow }. */
  const fileAll = async (files, noteId) => {
    const done = [];
    const problems = [];
    const slow = [];
    for (const r of files) {
      for (let used = 0; ; used++) {
        setBusy(used ? `WorkDrive is still busy with ${r.name}; trying again (${used} of ${RETRIES})` : `Filing ${r.name}`);
        const ans = await call(realPayload({ file: r, noteId, who }));
        const next = afterCall(ans, used);
        if (next === "retry") {
          setBusy(`WorkDrive is still busy with ${r.name}; trying again in 30 seconds (${used + 1} of ${RETRIES})`);
          await wait(RETRY_WAIT_MS);
          continue;
        }
        if (next === "done") done.push(r.name);
        else if (next === "slow") slow.push(r);
        else problems.push(`${r.name}: ${ans.result || ans.status}${ans.message ? " (" + ans.message + ")" : ""}`);
        const f = ans.files[0];
        if (f && Array.isArray(f.not_moved) && f.not_moved.length) problems.push(`${r.name}: not moved to Rejected yet: ${f.not_moved.join(", ")}`);
        break;
      }
    }
    return { done, problems, slow };
  };
  const report = ({ done, problems, slow }, total, noteId) => {
    setPending(slow.length ? { noteId, files: slow } : null);
    const parts = [`${done.length} of ${total} named and filed.`];
    if (slow.length) parts.push(`WorkDrive is still busy with ${slow.map((r) => r.name).join(", ")}. Try again in a minute.`);
    if (problems.length) parts.push(`${problems.join(" · ")}. The files are on the GRAPHIC UPLOAD note; tell the production manager.`);
    setResult({ severity: problems.length ? "warning" : slow.length ? "info" : "success", text: slow.length || problems.length ? parts.join(" ") : `${done.length} file(s) named, filed and listed on a GRAPHIC UPLOAD note.` });
  };
  const doRetry = async () => {
    if (!pending) return;
    setResult(null);
    try {
      report(await fileAll(pending.files, pending.noteId), pending.files.length, pending.noteId);
      if (refresh) await refresh();
    } catch (e) {
      setResult({ severity: "error", text: `Try again did not finish: ${String(e?.message || e)}.` });
    }
    setBusy("");
  };

  const doUpload = async () => {
    setBusy("Uploading");
    setResult(null);
    setPending(null);
    let filed = { done: [] };
    try {
      const items = named.map((r) => ({ name: r.name, folder: r.folder, original: r.file.name, wouldMove: r.wouldMove }));
      const n = await ZOHO.CRM.API.addNotes({ Entity: entity, RecordID: recordId, Title: UPLOAD_NOTE_TITLE, Content: uploadNote({ who, when: stamp(), items }) });
      if (!ok(n)) throw new Error("note: " + JSON.stringify(n?.data?.[0] || n));
      const noteId = n.data[0]?.details?.id;
      for (const r of named) {
        const content = new Blob([await r.file.arrayBuffer()], { type: r.file.type });
        await ZOHO.CRM.API.attachFile({ Entity: "Notes", RecordID: noteId, File: { Name: r.name, Content: content } });
      }
      filed = await fileAll(named, noteId);
      setRows([]);
      setChecked(false);
      report(filed, named.length, noteId);
      if (refresh) await refresh();
    } catch (e) {
      setResult({ severity: "error", text: `Upload did not finish: ${String(e?.message || e)}. Filed so far: ${filed.done.length ? filed.done.join(", ") : "none"}.` });
    }
    setBusy("");
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography fontWeight="bold" sx={{ mb: 0.5 }}>
        Upload graphics
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Every file is renamed {po}_DEPARTMENT_GARMENT_PLACEMENT_FORMAT_vN and filed in the Deal's folder. A newer version moves the older one to
        Rejected.
      </Typography>
      <Button variant="outlined" size="small" component="label" disabled={!!busy}>
        Choose files
        <input hidden multiple type="file" onChange={(e) => pickFiles(e.target.files)} />
      </Button>
      {named.map((r, i) => (
        <Box key={i} sx={{ mt: 1.5, p: 1.5, border: "1px solid #ddd" }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {r.file.name}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Pick label="Department" width={150} value={r.dept} disabled={!!busy} onChange={(v) => setRow(i, { dept: v })} options={UPLOAD_DEPARTMENTS.map((d) => ({ value: d.code, label: d.label }))} />
            <Pick label="Garment" width={220} value={r.garment} disabled={!!busy} onChange={(v) => setRow(i, { garment: v, placement: "" })} options={garments} />
            <Pick label="Placement" width={180} value={r.placement} disabled={!!busy || !r.garment} onChange={(v) => setRow(i, { placement: v })} options={placementOptions(data, r.garment)} />
            <Pick label="Format" width={200} value={r.format} disabled={!!busy} onChange={(v) => setRow(i, { format: v })} options={UPLOAD_FORMATS.map((f) => ({ value: f.code, label: f.label }))} />
            <Button size="small" disabled={!!busy} onClick={() => { setChecked(false); setRows(rows.filter((_, j) => j !== i)); }}>
              Remove
            </Button>
          </Box>
          {r.stem && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {checked ? r.name : `${r.stem}_vN${r.ext ? "." + r.ext : ""}`} {"->"} {FOLDER_LABELS[r.folder]}
              {checked && r.wouldMove && r.wouldMove.length > 0 && ` (moves ${r.wouldMove.join(", ")} to Rejected)`}
            </Typography>
          )}
        </Box>
      ))}
      {dupes.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          Two files would get the same name ({dupes[0]}). Change a part on one of them.
        </Alert>
      )}
      {rows.length > 0 && !uploadsOn && (
        <Alert severity="info" sx={{ mt: 1 }}>
          Uploads switch on once the WorkDrive function is ready. The names above are what the files will be called.
        </Alert>
      )}
      {rows.length > 0 && uploadsOn && (
        <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
          <Button variant="outlined" size="small" disabled={!allReady || !!busy} onClick={doCheck}>
            Check names
          </Button>
          <Button variant="contained" size="small" disabled={!allReady || !checked || !!busy} onClick={doUpload}>
            Upload {rows.length} file{rows.length === 1 ? "" : "s"}
          </Button>
        </Box>
      )}
      {pending && !busy && (
        <Button variant="contained" size="small" sx={{ mt: 1 }} onClick={doRetry}>
          Try again ({pending.files.length} file{pending.files.length === 1 ? "" : "s"})
        </Button>
      )}
      {busy && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {busy}…
        </Typography>
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
