import React from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { HandList } from "./BillingSection";
import { canRetry } from "../invoice/draftLater";

/*
 * E-108 (docs/63): shown after Submit instead of closing at once, so the rep can open the new draft in Books. Zoho's message is
 * shown as is (Deluge docs/43). The onboarding itself (note, fields, files) is already saved when this shows.
 * E-151: when Zoho could not make the draft for now (Books slow, no answer in time), `onRetry` puts a Try again button here, and the
 * rep is told the draft can also be made later by reopening the onboarding form (which then offers only the draft).
 */
export default function BillingResult({ state, onClose, onRetry }) {
  const { busy, answer, prepared } = state || {};
  if (busy) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, m: "15% 0" }}>
        <CircularProgress color="inherit" />
        <Typography fontWeight="bold" fontSize="1.3rem">
          The onboarding is saved. Making the draft {busy === "estimate" ? "estimate" : "invoice"} in Books...
        </Typography>
      </Box>
    );
  }
  const a = answer || {};
  const doc = (prepared && prepared.flags && prepared.flags.document) || "invoice";
  const created = a.result === "created";
  const retry = !created && !!onRetry && canRetry(a);
  const open = (link) => window.open(link, "_blank", "noopener");
  return (
    <Box sx={{ width: "90%", mx: "auto", my: 3, bgcolor: "#F5F5F5", p: 3 }}>
      <Typography fontWeight="bold" fontSize="1.3rem" sx={{ mb: 2 }}>
        The onboarding form is saved.
      </Typography>
      {created ? (
        <Alert severity="success">
          Draft {doc} <b>{a.number}</b> was made in Books. It has not been sent: check it, adjust if needed, and send it from Books.
        </Alert>
      ) : (
        <Alert severity={a.result === "exists" ? "info" : "warning"}>{a.message || "No draft was made."}</Alert>
      )}
      {retry && (
        <Typography sx={{ mt: 1 }}>
          Click <b>Try again</b> in a minute. Or close this and reopen the onboarding form on this Deal later: it will offer only the
          draft {doc}, nothing else.
        </Typography>
      )}
      {prepared && (prepared.warnings || []).length > 0 && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {prepared.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </Alert>
      )}
      {(a.not_added || []).length > 0 && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          Books left these off the draft; please add them by hand:
          <ul style={{ margin: "4px 0 0", paddingLeft: "1.2rem" }}>
            {a.not_added.map((n, i) => (
              <li key={i}>
                {n.sku} x {n.quantity}: {n.reason}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {(a.notes || []).length > 0 && (
        <Alert severity="info" sx={{ mt: 1 }}>
          {a.notes.map((n, i) => (
            <div key={i}>{n}</div>
          ))}
        </Alert>
      )}
      {created && prepared && <HandList items={prepared.handList} />}
      {prepared && prepared.lookup && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {prepared.lookup}
        </Typography>
      )}
      <Box sx={{ mt: 3, display: "flex", gap: 2, justifyContent: "center" }}>
        {a.link && (
          <Button variant="contained" onClick={() => open(a.link)}>
            {created ? "Open in Books" : `Open ${a.number || "it"} in Books`}
          </Button>
        )}
        {retry && (
          <Button variant="contained" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button variant="outlined" onClick={onClose}>
          Close
        </Button>
      </Box>
    </Box>
  );
}
