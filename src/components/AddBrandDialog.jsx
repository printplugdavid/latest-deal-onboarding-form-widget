import React, { useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { cleanBrand, nearBrands, newBrandProblem } from "../products/newProductRules";

/*
 * E-127: "Add <brand> as a new brand" -- one confirm. onDone({ name }) to use it as a new Books brand, onDone({ use: existing }) for the
 * near match, onDone(null) to cancel. "Not right" (a different brand) opens Add here -- David 10-23: never a wait for him. `brands` = Books' brands in use + the snapshot (the New Product form's list). `fromSupplier` = the
 * name is the supplier's own spelling (SanMar / S&S lookup), not typed.
 */
export default function AddBrandDialog({ name, brands, fromSupplier, onDone }) {
  const n = cleanBrand(name);
  const problem = newBrandProblem(n);
  const looks = nearBrands(n, brands); // up to 3 look-alikes, best first
  const near = looks[0] || "";
  // David 10-23: "I want them to be able to add new even if there are look alikes flagged. Sending back to me is dead in the water."
  // Not right = the rep says it is a different brand -> Add opens (with a plain warning); nothing waits for David.
  const [different, setDifferent] = useState(false);
  return (
    <Dialog open={!!name} onClose={() => onDone(null)} maxWidth="sm" fullWidth>
      <DialogTitle>Add a new brand</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 1 }}>
          <b>{n}</b>
          {fromSupplier ? " (the supplier's spelling)" : ""}
        </Typography>
        {near && !different && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            {looks.length === 1 ? (
              <>
                Did you mean <b>{near}</b>? Books already has it.
              </>
            ) : (
              <>Books has brands that look like this one. Did you mean one of them?</>
            )}
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {looks.map((b) => (
                <Button key={b} size="small" variant="outlined" onClick={() => onDone({ use: b })}>
                  Use {b}
                </Button>
              ))}
              <Button size="small" onClick={() => setDifferent(true)}>
                Not right: {n} is a different brand
              </Button>
            </div>
          </Alert>
        )}
        {near && different && (
          <Alert severity="info" sx={{ mb: 1 }}>
            Adding <b>{n}</b> as its own brand, separate from {looks.join(", ")}.
          </Alert>
        )}
        {problem ? (
          <Alert severity="error">{problem}</Alert>
        ) : (
          <Typography variant="body2">
            Check the spelling: <b>{n}</b> becomes a brand in Books with this product, for everyone. Use the brand's own spelling.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onDone(null)}>Cancel</Button>
        <Button variant="contained" onClick={() => onDone({ name: n })} disabled={!!problem || (!!near && !different)}>
          Add brand
        </Button>
      </DialogActions>
    </Dialog>
  );
}
