import React, { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import BillingResult from "./BillingResult";
import { prepareDraft, sendDraft, sendWithFallback } from "../invoice/billingDraft";

/*
 * E-151 (David 10-29: "Draft only"). Shown instead of the onboarding form when the Deal is already onboarded. It never submits the
 * form again. If the draft can be made (`offer.can`), a dry run first asks Zoho whether the Deal already has one (checked before
 * anything is made); then the rep can make it from the saved onboarding. Changes to the order go through the Amendment Form.
 */
export default function AlreadyOnboarded({ dealId, found, offer: given, submittedBy, onClose, drafting = false, entity = "Deals" }) {
  // E-158: while the hidden Invoice Drafting box is ticked the background is making the draft -- no check, no button (no race).
  const offer = drafting ? { ...given, can: false, why: "" } : given;
  const [check, setCheck] = useState(offer.can ? { busy: true } : null);
  const [billing, setBilling] = useState(null);
  const [prepared, setPrepared] = useState(null);

  useEffect(() => {
    if (!offer.can) return;
    let live = true;
    (async () => {
      let p = null;
      let answer;
      try {
        p = await prepareDraft(found.json);
        answer = await sendDraft(dealId, p, { submittedBy, dryRun: true });
      } catch (e) {
        answer = { result: "not_sent", message: "The draft could not be checked (" + String((e && e.message) || e) + ")." };
      }
      if (!live) return;
      setPrepared(p);
      setCheck({ answer });
    })();
    return () => {
      live = false;
    };
  }, [dealId, found, offer.can, submittedBy]);

  const make = async () => {
    setBilling({ busy: offer.document });
    let p = prepared;
    let answer;
    try {
      if (!p) {
        p = await prepareDraft(found.json);
        setPrepared(p);
      }
      answer = await sendWithFallback(window.ZOHO, entity, dealId, p, { submittedBy });
    } catch (e) {
      answer = { result: "not_sent", message: "The draft could not be made (" + String((e && e.message) || e) + "). Please make it in Books." };
    }
    setBilling({ prepared: p, answer });
  };

  if (billing) return <BillingResult state={billing} onClose={onClose} onRetry={make} />;

  const a = (check && check.answer) || {};
  const exists = a.result === "exists";
  const docWord = offer.document === "estimate" ? "estimate" : "invoice";
  // A dry run that says the draft would be made, or one that only failed for now (slow / no answer), leaves the button on.
  const blocked = ["exists", "no_customer", "online_order", "nothing_to_add", "bad_request"].includes(a.result);
  return (
    <Box sx={{ width: "90%", mx: "auto", my: 3, bgcolor: "#F5F5F5", p: 3 }}>
      <Typography fontWeight="bold" fontSize="1.3rem" sx={{ mb: 1 }}>
        This Deal is already onboarded.
      </Typography>
      <Typography sx={{ mb: 2 }}>To change the order, use the Amendment Form.</Typography>
      {found.unreadable && !found.noteOnly && <Alert severity="warning">The saved onboarding could not be read.</Alert>}
      {offer.why && <Alert severity="info">{offer.why}</Alert>}
      {drafting && (
        <Alert severity="info">
          This Deal's draft is being made in the background (Books was slow). It will show under the Deal's Finance section, or you
          will get a task to make it in Books. Nothing to do here.
        </Alert>
      )}
      {offer.can && check && check.busy && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <CircularProgress size={20} color="inherit" /> Checking Books for this Deal's draft {docWord}...
        </Box>
      )}
      {offer.can && !(check && check.busy) && exists && (
        <Alert severity="info">
          Draft {a.number ? <b>{a.number}</b> : docWord} is already in Books for this Deal.
        </Alert>
      )}
      {offer.can && !(check && check.busy) && !exists && blocked && <Alert severity="warning">{a.message || "No draft can be made for this Deal."}</Alert>}
      {offer.can && !(check && check.busy) && !blocked && a.result !== "dry_run" && a.message && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {a.message}
        </Alert>
      )}
      {offer.can && !(check && check.busy) && !blocked && (
        <Typography sx={{ mt: 1 }}>
          This Deal has no draft {docWord} in Books yet. The form can make it from the saved onboarding (changes from amendments
          included). It is not sent: you check it and send it from Books.
        </Typography>
      )}
      <Box sx={{ mt: 3, display: "flex", gap: 2, justifyContent: "center" }}>
        {offer.can && !(check && check.busy) && !blocked && (
          <Button variant="contained" onClick={make}>
            Make the draft {docWord}
          </Button>
        )}
        {exists && a.link && (
          <Button variant="contained" onClick={() => window.open(a.link, "_blank", "noopener")}>
            Open {a.number || "it"} in Books
          </Button>
        )}
        <Button variant="outlined" onClick={onClose}>
          Close
        </Button>
      </Box>
    </Box>
  );
}
