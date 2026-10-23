import React, { useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { addVendor } from "../products/booksItems";
import { nearVendor, newVendorProblem, rememberNewVendor } from "../products/vendors";

/*
 * E-126 B: "Add <name> as a new vendor" -- one confirm, then Deluge's widget_add_vendor makes it in Books and on the Deal "Vendors" list.
 * onDone({ name, vendorId, result, message }) when it can be used; onDone({ use: existing }) when the rep picks the near match instead;
 * onDone(null) when cancelled. `known` = the names to compare against (the Deal list, or Books' vendors in the New Product form).
 */
export default function AddVendorDialog({ name, known, onDone }) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const n = String(name || "").trim();
  const problem = newVendorProblem(n);
  const near = nearVendor(n, known);
  const go = async () => {
    setBusy(true);
    const a = await addVendor(n);
    setBusy(false);
    if (a.done) {
      rememberNewVendor(a.name);
      onDone(a);
    } else setAnswer(a);
  };
  return (
    <Dialog open={!!name} onClose={() => !busy && onDone(null)} maxWidth="sm" fullWidth>
      <DialogTitle>Add a new vendor</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 1 }}>
          <b>{n}</b>
        </Typography>
        {near && (
          <Alert severity="warning" sx={{ mb: 1 }} action={<Button size="small" onClick={() => onDone({ use: near })}>Use {near}</Button>}>
            Did you mean <b>{near}</b>? It is already on the list.
          </Alert>
        )}
        {problem ? (
          <Alert severity="error">{problem}</Alert>
        ) : (
          <Typography variant="body2">
            Check the spelling: this makes <b>{n}</b> a permanent vendor in Books and on the Deal's vendor list, for everyone.
          </Typography>
        )}
        {answer && (
          <Alert severity="error" sx={{ mt: 1 }}>
            Not added{answer.message ? `: ${answer.message}` : "."} It stays on this order as typed.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onDone(null)} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={go} disabled={busy || !!problem || !!answer}>
          {busy ? "Adding..." : "Add vendor"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
