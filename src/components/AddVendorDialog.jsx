import React, { useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, Typography } from "@mui/material";
import { addVendor, booksLists, cleanWebsite, websiteProblem } from "../products/booksItems";
import { nearVendors, newVendorProblem, rememberNewVendor } from "../products/vendors";

/*
 * E-126 B: "Add <name> as a new vendor" -- one confirm, then Deluge's widget_add_vendor makes it in Books and on the Deal "Vendors" list.
 * A0h (David 10-23/24, Books' rules): the supplier's real company name written their way (a reminder line); the vendor's website (Books
 * tracks name + website); look-alikes from ALL Books vendors with a Use button each; "Not right" lets the rep add it anyway (same as brands;
 * we tell Books about every vendor added, so they double-check it).
 *
 * onDone({ name, vendorId, result, message, website }) when it can be used; onDone({ use: existing }) when the rep picks a name from
 * `known`; onDone(null) when cancelled. `known` = names the caller can use as they are (the Deal list in the onboarding form, Books'
 * vendors in the New Product form). `booksVendors` = Books' vendor names, when the caller already has them; otherwise read here.
 */
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export default function AddVendorDialog({ name, known, booksVendors, onDone }) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [books, setBooks] = useState(Array.isArray(booksVendors) ? booksVendors : null); // null = still reading
  const [booksNote, setBooksNote] = useState("");
  const [different, setDifferent] = useState(false);
  const [website, setWebsite] = useState("");
  const [noWebsite, setNoWebsite] = useState(false);
  const n = String(name || "").trim();

  useEffect(() => {
    if (Array.isArray(booksVendors)) return undefined;
    let live = true;
    booksLists().then((r) => {
      if (!live) return;
      setBooks(r.status === "ok" ? r.vendors.map((v) => v.name) : []);
      if (r.status !== "ok") setBooksNote("Books' vendor list could not be read, so look-alikes come from the Deal's list only.");
    });
    return () => {
      live = false;
    };
  }, [booksVendors]);

  const problem = newVendorProblem(n);
  const looks = books === null ? [] : nearVendors(n, [...(known || []), ...books]);
  const exact = looks.find((v) => norm(v) === norm(n));
  const webProblem = websiteProblem(website);
  const webMissing = !website.trim() && !noWebsite;
  const blocked = busy || !!problem || !!answer || books === null || (looks.length > 0 && (!different || !!exact)) || !!webProblem || webMissing;

  const go = async (vendorName, site) => {
    setBusy(true);
    const a = await addVendor(vendorName, site);
    setBusy(false);
    if (a.done) {
      rememberNewVendor(a.name);
      onDone(a);
    } else setAnswer(a);
  };
  // A look-alike the caller can use as is; a Books-only vendor (not yet a Deal choice) goes through the function, which finds it in
  // Books and adds the Deal choice -- nothing new is made in Books.
  const use = (v) => ((known || []).some((k) => norm(k) === norm(v)) ? onDone({ use: v }) : go(v, ""));

  return (
    <Dialog open={!!name} onClose={() => !busy && onDone(null)} maxWidth="sm" fullWidth>
      <DialogTitle>Add a new vendor</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 1 }}>
          <b>{n}</b>
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Use the supplier's real company name, written the way they write it: no all capitals unless that is how they write it, and no
          short forms (Printograph, S&S Activewear).
        </Typography>
        {books === null && (
          <Alert severity="info" icon={false} sx={{ mb: 1 }}>
            Checking Books' vendors...
          </Alert>
        )}
        {booksNote && (
          <Alert severity="info" sx={{ mb: 1 }}>
            {booksNote}
          </Alert>
        )}
        {looks.length > 0 && !different && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            {exact ? (
              <>
                <b>{exact}</b> is already a vendor in Books.
              </>
            ) : (
              <>Books has vendors that look like this one. Is it one of these?</>
            )}
            <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
              {looks.map((v) => (
                <Button key={v} size="small" variant="outlined" disabled={busy} onClick={() => use(v)}>
                  Use {v}
                </Button>
              ))}
              {!exact && (
                <Button size="small" disabled={busy} onClick={() => setDifferent(true)}>
                  Not right: {n} is a different vendor
                </Button>
              )}
            </Box>
          </Alert>
        )}
        {looks.length > 0 && different && (
          <Alert severity="info" sx={{ mb: 1 }}>
            Adding <b>{n}</b> as its own vendor, separate from {looks.join(", ")}.
          </Alert>
        )}
        {problem ? (
          <Alert severity="error">{problem}</Alert>
        ) : (
          <>
            <TextField
              size="small"
              fullWidth
              label="Vendor's website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              disabled={noWebsite}
              error={!!webProblem}
              helperText={webProblem || (website.trim() ? `Saved as ${cleanWebsite(website)}` : "e.g. printograph.com")}
              sx={{ mt: 1, mb: 0.5 }}
            />
            <FormControlLabel
              control={<Checkbox size="small" checked={noWebsite} onChange={(e) => setNoWebsite(e.target.checked)} />}
              label="This vendor has no website"
              sx={{ display: "block", mb: 1 }}
            />
            <Typography variant="body2">
              Check the spelling: this makes <b>{n}</b> a permanent vendor in Books and on the Deal's vendor list, for everyone.
            </Typography>
          </>
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
        <Button variant="contained" onClick={() => go(n, noWebsite ? "" : website)} disabled={blocked}>
          {busy ? "Adding..." : "Add vendor"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
