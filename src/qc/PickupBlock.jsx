/*
 * PickupBlock.jsx -- E-82 (David 10-29): whoever hands part of an order to the customer records what left, in the Quality Check form.
 * Logic: qcRules.buildPickupPlan. Writes the Deal's partial pick-up fields (Trigger []) and a dated "PARTIAL PICK-UP" note.
 * Nothing else: no task is closed, the stage does not move.
 */
import React, { useState } from "react";
import { Alert, Box, Button, Checkbox, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { buildPickupPlan } from "./qcRules";

const ZOHO = window.ZOHO;
const ok = (r) => r?.data?.[0]?.code === "SUCCESS";
export const PICKUP_NOTE_TITLE = "PARTIAL PICK-UP";

const PickupBlock = ({ entity, recordId, deal, startLines, who, dateStr, onDone }) => {
  const [lines, setLines] = useState(() => (startLines || []).map((l) => ({ ...l, ready: false, readyQty: 0 })));
  const [notes, setNotes] = useState("");
  const [stillWaiting, setStillWaiting] = useState("");
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const plan = buildPickupPlan({ lines, notes, stillWaiting, deal, dateStr, who });
  const locked = saving || !!outcome;

  const save = async () => {
    setSaving(true);
    try {
      const r = await ZOHO.CRM.API.updateRecord({ Entity: entity, APIData: { id: recordId, ...plan.fields }, Trigger: [] });
      if (!ok(r)) throw new Error(JSON.stringify(r?.data?.[0] || r));
      const n = await ZOHO.CRM.API.addNotes({ Entity: entity, RecordID: recordId, Title: PICKUP_NOTE_TITLE, Content: plan.note });
      setOutcome({ ok: true, text: "Recorded: " + plan.entry + (ok(n) ? "" : " (the note could not be added)") });
      if (onDone) onDone();
    } catch (e) {
      setOutcome({ ok: false, text: "Not saved: " + String(e?.message || e) + ". Nothing was changed - try again." });
    }
    setSaving(false);
  };

  return (
    <Box sx={{ bgcolor: "#fff", border: "1px solid #d5d8dd", borderRadius: 1, p: 2, mb: 2 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>What did the customer take today?</Typography>
      {deal.Partial_Ready_Details && (
        <Box sx={{ mb: 1.5, p: 1, bgcolor: "#f6f8fb", border: "1px solid #dfe4ea", whiteSpace: "pre-wrap", fontSize: 13 }}>
          <b>Released as ready:</b>
          {"\n" + deal.Partial_Ready_Details}
        </Box>
      )}
      {lines.length === 0 && <Typography sx={{ fontSize: 13, color: "#8a5300", mb: 1 }}>No order lines to choose from - describe what was taken below.</Typography>}
      {lines.map((l, i) => (
        <Box key={l.key} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
          <Checkbox
            checked={l.ready}
            disabled={locked}
            onChange={(e) => setLines((rows) => rows.map((r, j) => (j === i ? { ...r, ready: e.target.checked, readyQty: e.target.checked ? r.qty : 0 } : r)))}
          />
          <Typography sx={{ flexGrow: 1, fontSize: 14 }}>{l.label}</Typography>
          {l.qty != null && (
            <>
              <TextField
                size="small"
                type="number"
                value={l.ready ? l.readyQty ?? "" : 0}
                disabled={locked || !l.ready}
                onChange={(e) => setLines((rows) => rows.map((r, j) => (j === i ? { ...r, readyQty: e.target.value } : r)))}
                inputProps={{ min: 0, max: l.qty, style: { width: 64, textAlign: "right" } }}
              />
              <Typography sx={{ fontSize: 14, width: 80 }}>of {l.qty} taken</Typography>
            </>
          )}
        </Box>
      ))}
      <TextField fullWidth multiline minRows={2} size="small" sx={{ mt: 1 }} label="Specifics (optional)" value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)} />
      <Typography sx={{ fontWeight: 700, mt: 2, mb: 1 }}>Is anything from this order still waiting for pickup?</Typography>
      <ToggleButtonGroup exclusive value={stillWaiting} disabled={locked} onChange={(_, v) => v && setStillWaiting(v)}>
        <ToggleButton value="yes" sx={{ px: 3 }}>Yes - more to come</ToggleButton>
        <ToggleButton value="no" sx={{ px: 3 }}>No - nothing left waiting</ToggleButton>
      </ToggleButtonGroup>
      <Box sx={{ mt: 2 }}>
        <Button variant="contained" disabled={locked || plan.problems.length > 0} onClick={save}>
          Record the pickup
        </Button>
        {plan.problems.length > 0 && !outcome && <Typography sx={{ fontSize: 13, color: "#555", mt: 0.5 }}>{plan.problems.join(" · ")}</Typography>}
      </Box>
      {outcome && (
        <Alert severity={outcome.ok ? "success" : "error"} sx={{ mt: 2 }}>
          {outcome.text}
        </Alert>
      )}
    </Box>
  );
};

export default PickupBlock;
